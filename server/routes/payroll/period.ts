import db, { createNotification, logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { listScopedEmployees, scopeFilter, type OrganizationScope } from "../../lib/organization-scope";
import { syncAttendanceFromLogs } from "../../lib/attendance-sync";
import { CountryRulesService } from "../../../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../../../src/lib/payroll/PayrollCalculator";
import { absenceFor, unpaidLeaveDaysInPeriod } from "../../lib/attendance-absence";
import { dailyBasisFor, maxWorkingDaysInMonth, workingDaysInMonth } from "../../../src/lib/payroll/working-days";
import { isGosiExempt, isInsuranceCovered, workTimeForEntity } from "../../lib/country-rules";
import { validateBody, payrollGenerateSchema, payrollLockSchema, payrollRecalculateSchema } from "../../middleware/validation";
import { isPayrollLocked, payrollLockKey } from "./lock";
import { loanDeductionForPeriod } from "../../lib/loan-schedule";
import { buildPayrollRowFromSource } from "../../lib/payroll/build-period-row";
import { runPayrollPreflight, type PreflightReport } from "./preflight";
import { log } from "../../lib/logger";



/**
 * The payroll period itself: the register for a month, the attendance sync
 * that feeds it, the lock that closes it, and the two calculation endpoints
 * (one employee, or the whole entity).
 */

/** GET /api/payroll — the payroll register for one month. */
export function registerPayrollList(app: express.Express) {
  app.get("/api/payroll", authenticateToken, requireOrganizationScope, async (req, res) => {
    const { month, year } = req.query;
    const { entityId, branchId, employeeId } = organizationScope(res);
    const payroll = (await db.prepare(`
      SELECT p.*, e.name as employee_name, b.name as branch_name, d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.month = ? AND p.year = ?
        AND (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
    `).all(month, year, entityId, entityId, branchId, branchId, employeeId, employeeId));
    res.json(payroll);
  });
}

/** POST /api/payroll/sync-attendance — pull the attendance logs into the period. */
export function registerAttendanceSync(app: express.Express) {
  app.post("/api/payroll/sync-attendance", requireOrganizationScope, async (req, res) => {
    try {
      const month = Number(req.body.month);
      const year = Number(req.body.year);
      const scope = organizationScope(res);
      const employeeIds = (await listScopedEmployees(db, scope)).map((employee) => employee.id);
      const r = await syncAttendanceFromLogs(db, month, year, new Date(), employeeIds, workTimeForEntity);
      res.json({ success: true, ...r, employees: employeeIds.length });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}

/** The lock that closes a period against further edits. */
export function registerPayrollLock(app: express.Express) {
  app.get("/api/payroll/lock-status", async (req, res) => {
    const m = Number(req.query.month);
    const y = Number(req.query.year);
    // Await the lookup: serialising the Promise itself would make `locked` an
    // empty object, which is truthy — every period would look closed in the UI.
    res.json({ month: m, year: y, locked: await isPayrollLocked(m, y) });
  });

  // The role gate for this route is the central RBAC policy (ROUTE_PERMISSIONS ->
  // payroll.run -> admin | hr_manager | finance). The local requireRole("admin","finance")
  // that used to sit here contradicted that matrix and rejected hr_manager on a route the
  // screen matrix grants it. Removed so the matrix stays the single source of truth.
  // NOTE: this widens access for hr_manager (revert = restore the requireRole call above).

  app.post("/api/payroll/lock", requireOrganizationScope, validateBody(payrollLockSchema), async (req, res) => {
    try {
      const scope = organizationScope(res);
      // The lock is one flag for the whole period, so only an account that
      // sees the entire company may set it — a branch manager must not lock
      // the payroll of branches they do not own.
      if (scope.entityId !== null || scope.branchId !== null || scope.employeeId !== null) {
        return res.status(403).json({ error: "إقفال المسير متاح على مستوى المنشأة كاملة فقط" });
      }
      const { month, year, locked } = req.body;
      (await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(payrollLockKey(Number(month), Number(year)), locked ? "1" : "0"));
      await logAction("update", "payroll", 0, `${locked ? "إقفال" : "فتح"} مسير ${month}/${year}`);
      res.json({ success: true, locked: !!locked });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}

export interface PayrollGenerationResult {
  /** Rows actually created by this run. */
  count: number;
  /** Employees that already had a row for the period (generator skips them). */
  existing: number;
  /** True when the period is locked and nothing was written. */
  skipped: boolean;
  reason?: "locked" | "not_ready";
  report?: PreflightReport;
}

/**
 * Build a payroll period for every employee in `scope`.
 *
 * This is the single generation core shared by the HTTP route and the monthly
 * scheduler. Keeping one implementation is what guarantees the automatic run
 * follows the exact same KSA calculation path (GOSI, tax exemptions, working
 * days, cash/bank split) as the manual one.
 *
 * The whole run happens in one transaction: a half-written period is worse
 * than a failed one.
 */
export async function generatePayrollPeriod(
  month: number,
  year: number,
  scope: OrganizationScope,
  source: "manual" | "auto" = "manual"
): Promise<PayrollGenerationResult> {
  if (await isPayrollLocked(Number(month), Number(year))) {
    return { count: 0, existing: 0, skipped: true, reason: "locked" };
  }
  // Read-only gate: run before any attendance sync or write. A period with an
  // unpayable row is refused as a whole instead of producing a half-payable
  // register. The same report is available to the UI through GET preflight.
  const report = await runPayrollPreflight(Number(month), Number(year), scope);
  if (!report.ready) {
    return { count: 0, existing: report.existing, skipped: true, reason: "not_ready", report };
  }
  const scopedIds = (await listScopedEmployees(db, scope)).map((employee) => employee.id);
  // Attendance is synced for the caller's employees only — a branch manager
  // must not rewrite the absence summary of another branch.
  try { await syncAttendanceFromLogs(db, Number(month), Number(year), new Date(), scopedIds, workTimeForEntity); } catch (e) { log.error(e); }
    const settings = (await db.prepare("SELECT * FROM settings").all());
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    const employees = (await db.prepare(`
      SELECT e.*,
      COALESCE((SELECT SUM(amount) FROM employee_allowances WHERE employee_id = e.id), 0) as allowances
      FROM employees e
      WHERE (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
        -- منتهية خدمتهم لا يُضافون إلى أي مسير جديد (NULL = نشط للصفوف القديمة)
        AND (e.status IS NULL OR e.status = 'active')
    `).all(...scopeFilter(scope)));
    const transactions = db.transaction(async (emps) => {
      let count = 0;
      for (const emp of emps as any[]) {
        const existing = (await db.prepare("SELECT id FROM payroll WHERE employee_id = ? AND month = ? AND year = ?")
          .get(emp.id, month, year));
        if (!existing) {
          // All KSA math lives in one shared builder; the recalculation preview
          // calls the same function, so its numbers cannot drift from generation.
          const { values: v, loanStates } = await buildPayrollRowFromSource(db, emp, Number(month), Number(year));
          const isSaudizable = v.payment_method === 'split' && v.cash_amount > v.net_salary * 0.2;
          (await db.prepare(`
            INSERT INTO payroll (
              employee_id, month, year, basic_salary, allowances, deductions,
              tax_amount, insurance_emp_share, insurance_comp_share, bonuses, penalties, net_salary,
              national_id_iqama, is_saudi, housing_allowance, transport_allowance, gosi_number, gosi_salary,
              saudi_iban, bank_name, payment_method, cash_amount, bank_amount,
              approval_status, payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending')
          `).run(
            emp.id, month, year, v.basic_salary, v.allowances, v.deductions,
            v.tax_amount, v.insurance_emp_share, v.insurance_comp_share, v.bonuses, v.penalties, v.net_salary,
            v.national_id_iqama, v.is_saudi, v.housing_allowance, v.transport_allowance, v.gosi_number, v.gosi_salary,
            v.saudi_iban, v.bank_name, v.payment_method, v.cash_amount, v.bank_amount
          ));
          if (isSaudizable) {
            await createNotification('تنبيه حماية الأجور', `الموظف ${emp.name}: نسبة النقد ${Number(emp.cash_percentage || 0)}% قد تخالف متطلبات مدد`, 'warning');
          }
          for (const { loan, state } of loanStates) {
            if (!state.due) continue;
            const newRemaining = Number(loan.remaining_amount) - state.deduction;
            (await db.prepare(`
              UPDATE loans
              SET remaining_amount = ?, deduction_applied_months = ?, status = ?
              WHERE id = ?
            `).run(newRemaining, state.appliedMonths, state.completed ? 'completed' : 'active', loan.id));
          }
          count++;
        }
      }
      return count;
    });
  // The transaction has to be awaited: without it the caller answers before
  // the period is written and the count it reports is the function rather
  // than the number of employees.
  const generatedCount = await transactions(employees);
  const auto = source === "auto";
  await createNotification(
    'تم إنشاء مسير الرواتب',
    `تم ${auto ? 'تلقائياً ' : ''}إنشاء مسير رواتب لعدد ${generatedCount} موظف لشهر ${month}/${year} وفق قواعد نظام العمل والتأمينات السعودية`,
    'success'
  );
  await logAction('generate', 'payroll', null, `Generated ${auto ? 'auto ' : ''}KSA-compliant payroll for ${month}/${year}`);
  return { count: generatedCount, existing: employees.length - generatedCount, skipped: false };
}

/**
 * POST /api/payroll/generate — build the period for every employee in scope.
 * The HTTP layer only translates the shared core result into a response.
 */
export function registerPayrollGenerate(app: express.Express) {
  // Read-only gate report for the operator, without generating anything.
  app.get("/api/payroll/preflight", requireOrganizationScope, async (req, res) => {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) return res.status(400).json({ error: "الشهر والسنة مطلوبان" });
    res.json(await runPayrollPreflight(month, year, organizationScope(res)));
  });

  // --- Safe recalculation from source -------------------------------------
  // Preview is allowed even on a locked period (read-only). Apply is refused
  // on a locked period: use the locked-period correction screen there instead.
  const RECALC_FIELDS = [
    "basic_salary", "allowances", "deductions", "bonuses", "penalties",
    "tax_amount", "insurance_emp_share", "insurance_comp_share", "net_salary",
    "housing_allowance", "transport_allowance", "gosi_salary", "gosi_number",
    "saudi_iban", "bank_name", "payment_method", "cash_amount", "bank_amount",
  ] as const;

  const recalcDiff = (current: any, proposed: any) =>
    RECALC_FIELDS.map((field) => {
      const before = current?.[field] ?? null;
      const after = proposed?.[field] ?? null;
      const changed = typeof after === "number" || typeof before === "number"
        ? Math.abs(Number(before || 0) - Number(after || 0)) > 0.001
        : String(before ?? "") !== String(after ?? "");
      return { field, before, after, changed };
    }).filter((d) => d.changed);

  app.post("/api/payroll/recalculate/preview", requireOrganizationScope, validateBody(payrollRecalculateSchema), async (req, res) => {
    try {
      const { month, year, employee_id } = req.body;
      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(employee_id))) return;
      const current = (await db.prepare(
        "SELECT * FROM payroll WHERE employee_id = ? AND month = ? AND year = ?"
      ).get(employee_id, month, year)) as any;
      if (!current) return res.status(404).json({ error: "لا يوجد مسير لهذا الموظف في الفترة المحددة" });
      const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const { values, sources } = await buildPayrollRowFromSource(db, emp, Number(month), Number(year));
      const locked = await isPayrollLocked(Number(month), Number(year));
      res.json({
        employee_id, month, year, locked,
        applicable: !locked,
        current, proposed: values,
        sources, diff: recalcDiff(current, values),
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/payroll/recalculate/apply", requireOrganizationScope, validateBody(payrollRecalculateSchema), async (req, res) => {
    try {
      const { month, year, employee_id, expected_net } = req.body;
      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(employee_id))) return;
      if (await isPayrollLocked(Number(month), Number(year))) {
        return res.status(400).json({ error: "المسير مقفل — استخدم شاشة «تصحيح مسير مقفل»" });
      }
      const current = (await db.prepare(
        "SELECT * FROM payroll WHERE employee_id = ? AND month = ? AND year = ?"
      ).get(employee_id, month, year)) as any;
      if (!current) return res.status(404).json({ error: "لا يوجد مسير لهذا الموظف في الفترة المحددة" });
      if (expected_net !== undefined && Math.abs(Number(current.net_salary) - Number(expected_net)) > 0.001) {
        return res.status(409).json({ error: "تغيّر المسير منذ المعاينة — أعد المعاينة قبل الاعتماد" });
      }
      if (current.approval_status === 'approved' || current.payment_status === 'paid') {
        return res.status(409).json({ error: "المسير مُعتمد أو مصروف — لا يمكن تعديله" });
      }
      const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const { values } = await buildPayrollRowFromSource(db, emp, Number(month), Number(year));
      const diff = recalcDiff(current, values);
      if (!diff.length) return res.json({ success: true, changed: 0, diff: [] });

      // Never re-run loan side effects here: the instalment was already applied
      // when the row was first generated. A changed loan amount is shown in the
      // preview only and must be handled through an explicit loan workflow.
      const sets = diff.map((d) => `${d.field} = ?`).join(", ");
      await db.prepare(`UPDATE payroll SET ${sets} WHERE id = ?`)
        .run(...diff.map((d) => d.after), current.id);
      const user = (req as any).user;
      for (const d of diff) {
        if (typeof d.after === "number" && typeof d.before === "number") {
          await db.prepare(`
            INSERT INTO payroll_corrections
              (employee_id, month, year, field_name, old_value, new_value, reason, approved_by, corrected_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(employee_id, month, year, d.field, d.before, d.after,
            "إعادة احتساب من المصدر", user?.id || null, user?.username || null);
        }
      }
      await logAction("update", "payroll", current.id,
        `إعادة احتساب ${month}/${year} للموظف ${employee_id}: ${diff.map((d) => d.field).join(", ")}`);
      await createNotification("إعادة احتساب مسير", `تم تحديث ${diff.length} بنداً للموظف ${emp.name} في ${month}/${year}`, "success");
      res.json({ success: true, changed: diff.length, diff });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/payroll/generate", requireOrganizationScope, validateBody(payrollGenerateSchema), async (req, res) => {
    const { month, year } = req.body;
    const scope = organizationScope(res);
    try {
      const result = await generatePayrollPeriod(Number(month), Number(year), scope, "manual");
      if (result.skipped) {
        if (result.reason === "not_ready") {
          return res.status(409).json({
            error: `المسير غير جاهز: ${result.report?.blockers.length ?? 0} موظف لديهم بيانات ناقصة تمنع الدفع — راجع تقرير الجاهزية`,
            report: result.report,
          });
        }
        return res.status(400).json({ error: `مسير ${month}/${year} مُقفل ومُعتمد — افتحه أولاً للتعديل` });
      }
      res.json({ success: true, count: result.count });
    } catch (error) {
      await createNotification('خطأ في إنشاء الرواتب', `حدث خطأ أثناء معالجة الرواتب: ${(error as Error).message}`, 'error');
      res.status(500).json({ error: (error as Error).message });
    }
  });
}

/** POST /api/payroll/calculate — the net for one employee, without saving. */
export function registerPayrollCalculate(app: express.Express) {
  app.post("/api/payroll/calculate", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { employee_id, basicSalary, housingAllowance, transportAllowance, otherAllowances, deductions, loanDeduction, absentDays, overtimeHours, paymentMethod, cashPercentage } = req.body;
      const user = (req as any).user;
      const scope = organizationScope(res);
      if (employee_id) {
        if (await denyEmployee(res, scope, Number(employee_id))) return;
      }
      let entityId = user.entity_id;
      let employeeRecord: any = null;
      if (employee_id) {
        employeeRecord = await db.prepare("SELECT entity_id, is_saudi, nationality, gosi_exempt FROM employees WHERE id = ?").get(employee_id);
        if (employeeRecord) entityId = employeeRecord.entity_id;
      }
      if (!entityId) {
        return res.status(400).json({ error: "Entity not found for user/employee" });
      }
      const rules = await CountryRulesService.getEntityRules(entityId);
      // The absence cannot be longer than the working days of the period: an
      // employee is not absent on the days the establishment is closed. The
      // request may name the period; without it the longest month of the year
      // is the bound.
      const requestedMonth = Number((req.body as any)?.month) || 0;
      const requestedYear = Number((req.body as any)?.year) || 0;
      const absenceLimit = requestedMonth && requestedYear
        ? workingDaysInMonth(requestedMonth, requestedYear, rules.workTime)
        : maxWorkingDaysInMonth(rules.workTime);
      const input = {
        employeeId: Number(employee_id) || 0,
        // The social insurance scheme covers the national workers only.
        insuranceCovered: employeeRecord ? isInsuranceCovered(employeeRecord) : true,
        gosiExempt: isGosiExempt(employeeRecord),
        basicSalary: Number(basicSalary) || 0,
        housingAllowance: Number(housingAllowance) || 0,
        transportAllowance: Number(transportAllowance) || 0,
        otherAllowances: Number(otherAllowances) || 0,
        deductions: Number(deductions) || 0,
        loanDeduction: Number(loanDeduction) || 0,
        absentDays: Math.min(Number(absentDays) || 0, absenceLimit),
        overtimeHours: Number(overtimeHours) || 0,
        paymentMethod: paymentMethod || 'bank',
        cashPercentage: Number(cashPercentage) || 0
      };
      const result = PayrollCalculator.calculate(input, rules);
      let cashAmount = 0;
      let bankAmount = 0;
      if (paymentMethod === 'cash') {
        cashAmount = result.netSalary;
      } else if (paymentMethod === 'split') {
        cashAmount = result.netSalary * (cashPercentage / 100);
        bankAmount = result.netSalary - cashAmount;
      } else {
        bankAmount = result.netSalary;
      }
      const finalResult = {
        ...result,
        cashAmount: Math.round(cashAmount * 100) / 100,
        bankAmount: Math.round(bankAmount * 100) / 100
      };
      res.json(finalResult);
    } catch (e) {
      log.error("Payroll calculation error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  });
}

/** POST /api/payroll/batch — the net for every employee in scope. */
export function registerPayrollBatch(app: express.Express) {
  app.post("/api/payroll/batch", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { month, year, employeeIds } = req.body;
      const scope = organizationScope(res);
      // The batch may only cover the employees the caller is allowed to see.
      const scopedEmployees = (await listScopedEmployees(db, scope));
      const scopedIds = new Set(scopedEmployees.map(employee => employee.id));
      const entityId = scope.entityId;
      if (!entityId) {
        return res.status(400).json({ error: "حدّد الكيان الذي تريد احتساب مسير لفرعه" });
      }
      const rules = await CountryRulesService.getEntityRules(entityId);
      let employees = (await db.prepare("SELECT * FROM employees WHERE entity_id = ? AND (status IS NULL OR status = 'active')").all(entityId)) as any[];
      employees = employees.filter(e => scopedIds.has(e.id));
      if (employeeIds && employeeIds.length > 0) {
        employees = employees.filter(e => employeeIds.includes(e.id));
      }

      const inputs = await Promise.all(employees.map(async (emp: any) => {
        const basicSalary = Number(emp.basic_salary) || 0;
        const housing = Number(emp.housing_allowance) || 0;
        const transport = Number(emp.transport_allowance) || 0;
        const other = Number(emp.other_allowances) || 0;
        let absentDays = 0;
        const attendanceRow = ((await db.prepare(`
          SELECT COALESCE(SUM(overtime_hours), 0) AS h, COALESCE(MAX(absence_days), 0) AS a FROM attendance
          WHERE employee_id = ? AND month = ? AND year = ?
        `).get(emp.id, Number(month), Number(year))) as any) || {};
        const overtimeHours = Number(attendanceRow.h) || 0;
        const summaryAbsence = Number(attendanceRow.a) || 0;
        if (month && year) {
          const signIns = (await db.prepare(`
            SELECT DISTINCT substr(CAST(check_in_time AS TEXT), 1, 10) AS d FROM attendance_logs
            WHERE employee_id = ? AND EXTRACT(MONTH FROM check_in_time)::int = ? AND EXTRACT(YEAR FROM check_in_time)::int = ?
          `).all(emp.id, Number(month), Number(year))) as any[];
          if (signIns.length === 0) {
            // No device evidence for this period. The monthly summary is the
            // record of what happened — the same one the payslips are built
            // from — and missing device records are not evidence that it is
            // wrong. So the absence comes from the summary, not from a guess
            // that the employee missed the whole month.
            absentDays = summaryAbsence;
          } else {
            // The working days the employee neither worked on nor was on
            // approved leave for — the same calculation the monthly summary
            // is written from, so the two cannot disagree.
            const breakdown = await absenceFor(db, emp.id, Number(month), Number(year), rules.workTime);
            absentDays = breakdown.absenceDays;
          }
        }
        const loanDeduction = ((await db.prepare(`
          SELECT COALESCE(SUM(monthly_installment), 0) as l FROM loans
          WHERE employee_id = ? AND status = 'active'
        `).get(emp.id)) as any)?.l || 0;
        // The unpaid leave of the period, and the employee's standing
        // deductions: the payroll run that saves the period charges both, so
        // the preview has to as well.
        const unpaidLeaveDays = await unpaidLeaveDaysInPeriod(db, emp.id, Number(month), Number(year));
        const standingDeductions = Number(emp.deductions) || 0;
        return {
          employeeId: emp.id,
          employee: emp,
          basicSalary,
          housingAllowance: housing,
          transportAllowance: transport,
          otherAllowances: other,
          deductions: standingDeductions,
          unpaidLeaveDays,
          // The social insurance scheme covers the national workers only.
          insuranceCovered: isInsuranceCovered(emp),
          gosiExempt: isGosiExempt(emp),
          loanDeduction,
          absentDays,
          overtimeHours,
          paymentMethod: emp.salary_payment_method || 'bank',
          cashPercentage: Number(emp.cash_percentage) || 0
        };
      }));
      const results = PayrollCalculator.calculateBatch(inputs, rules);
      const finalResults = results.map((r, i) => {
        const emp = inputs[i].employee;
        const paymentMethod = emp.salary_payment_method || 'bank';
        const cashPercentage = Number(emp.cash_percentage) || 0;
        let cashAmount = 0, bankAmount = 0;
        if (paymentMethod === 'cash') cashAmount = r.netSalary;
        else if (paymentMethod === 'split') {
          cashAmount = r.netSalary * (cashPercentage / 100);
          bankAmount = r.netSalary - cashAmount;
        } else bankAmount = r.netSalary;
        return {
          ...r,
          employeeId: inputs[i].employeeId,
          employeeName: emp.name,
          employeeCode: emp.employee_code,
          departmentId: emp.department_id,
          branchId: emp.branch_id,
          paymentMethod,
          cashPercentage,
          cashAmount: Math.round(cashAmount * 100) / 100,
          bankAmount: Math.round(bankAmount * 100) / 100
        };
      });
      const summary = PayrollCalculator.getSummary(results);
      res.json({
        month, year,
        employees: finalResults,
        summary: {
          ...summary,
          totalCash: finalResults.reduce((s, r) => s + r.cashAmount, 0),
          totalBank: finalResults.reduce((s, r) => s + r.bankAmount, 0)
        }
      });
    } catch (e) {
      log.error("Batch payroll error:", e);
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
