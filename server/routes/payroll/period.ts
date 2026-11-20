import db, { createNotification, logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { listScopedEmployees, scopeFilter } from "../../lib/organization-scope";
import { syncAttendanceFromLogs } from "../../lib/attendance-sync";
import { CountryRulesService } from "../../../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../../../src/lib/payroll/PayrollCalculator";
import { countPresentWorkingDays, workingDaysInMonth } from "../../../src/lib/payroll/working-days";
import { validateBody, payrollGenerateSchema, payrollLockSchema } from "../../middleware/validation";
import { isPayrollLocked, payrollLockKey } from "./lock";
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
      const r = await syncAttendanceFromLogs(db, month, year, new Date(), employeeIds);
      res.json({ success: true, ...r, employees: employeeIds.length });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}

/** The lock that closes a period against further edits. */
export function registerPayrollLock(app: express.Express) {
  app.get("/api/payroll/lock-status", (req, res) => {
    const m = Number(req.query.month);
    const y = Number(req.query.year);
    res.json({ month: m, year: y, locked: isPayrollLocked(m, y) });
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

/**
 * POST /api/payroll/generate — build the period for every employee in scope.
 *
 * The whole run happens in one transaction: a half-written period is worse
 * than a failed one.
 */
export function registerPayrollGenerate(app: express.Express) {
  app.post("/api/payroll/generate", requireOrganizationScope, validateBody(payrollGenerateSchema), async (req, res) => {
    const { month, year } = req.body;
    if (await isPayrollLocked(Number(month), Number(year))) {
      return res.status(400).json({ error: `مسير ${month}/${year} مُقفل ومُعتمد — افتحه أولاً للتعديل` });
    }
    const scope = organizationScope(res);
    const scopedIds = (await listScopedEmployees(db, scope)).map((employee) => employee.id);
    // Attendance is synced for the caller's employees only — a branch manager
    // must not rewrite the absence summary of another branch.
    try { await syncAttendanceFromLogs(db, Number(month), Number(year), new Date(), scopedIds); } catch (e) { log.error(e); }
    const settings = (await db.prepare("SELECT * FROM settings").all());
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    const taxRate = parseFloat(settingsObj.tax_rate || '0') / 100;
    const defaultSaudiEmpRate = parseFloat(settingsObj.saudi_gosi_emp_rate || '9.75') / 100;
    const defaultSaudiCompRate = parseFloat(settingsObj.saudi_gosi_comp_rate || '11.75') / 100;
    const defaultExpatCompRate = parseFloat(settingsObj.expat_gosi_comp_rate || '2.0') / 100;
    const employees = (await db.prepare(`
      SELECT e.*,
      COALESCE((SELECT SUM(amount) FROM employee_allowances WHERE employee_id = e.id), 0) as allowances
      FROM employees e
      WHERE (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
    `).all(...scopeFilter(scope)));
    const transactions = db.transaction(async (emps) => {
      let count = 0;
      for (const emp of emps as any[]) {
        const existing = (await db.prepare("SELECT id FROM payroll WHERE employee_id = ? AND month = ? AND year = ?")
          .get(emp.id, month, year));
        if (!existing) {
          const att = (await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?")
            .get(emp.id, month, year)) as any || { absence_days: 0, overtime_hours: 0 };
          const loan = (await db.prepare("SELECT * FROM loans WHERE employee_id = ? AND status = 'active'")
            .get(emp.id)) as any;
          const bp = (await db.prepare("SELECT type, SUM(amount) as total FROM bonuses_penalties WHERE employee_id = ? AND month = ? AND year = ? GROUP BY type")
            .all(emp.id, month, year)) as any[];
          const monthBonus = bp.find(x => x.type === 'bonus')?.total || 0;
          const monthPenalty = bp.find(x => x.type === 'penalty')?.total || 0;
          // One-off off-cycle lines (دفعات خارج الدورة) for this period
          const addRows = (await db.prepare(`
            SELECT type, amount FROM additional_salaries
            WHERE employee_id = ? AND month = ? AND year = ?
          `).all(emp.id, month, year)) as { type: 'earning' | 'deduction'; amount: number }[];
          const add = PayrollCalculator.aggregateAdditionalSalaries(addRows);
          // Verified income-tax exemptions (إثبات إعفاء ضريبي) applying to this period
          const taxExemptions = ((await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as t FROM tax_exemption_declarations
            WHERE employee_id = ? AND (year IS NULL OR year = ?)
          `).get(emp.id, Number(year))) as any)?.t || 0;
          let loanDeduction = 0;
          if (loan) {
            loanDeduction = Math.min(loan.monthly_installment, loan.remaining_amount);
          }
          const dailyRate = emp.basic_salary / 30;
          const hourlyRate = (emp.basic_salary / 30) / 8;
          const absenceDeduction = att.absence_days * dailyRate;
          const overtimePay = att.overtime_hours * hourlyRate * 1.5;
          const unpaidLeaves = (await db.prepare(`
            SELECT SUM(days) as total FROM leaves
            WHERE employee_id = ? AND status = 'approved' AND type = 'unpaid'
            AND (EXTRACT(MONTH FROM start_date)::int = ? OR EXTRACT(MONTH FROM end_date)::int = ?)
          `).get(emp.id, Number(month), Number(month))) as any;
          const unpaidLeaveDeduction = (unpaidLeaves.total || 0) * dailyRate;
          const housing = emp.housing_allowance || 0;
          const transport = emp.transport_allowance || 0;
          const gosiWage = Math.min(45000, Number(emp.basic_salary) + Number(housing));
          const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي' || emp.nationality === 'سعودية' ? 1 : 0;
          let insEmpRate = 0;
          let insCompRate = 0;
          if (isSaudi) {
            insEmpRate = defaultSaudiEmpRate; // 9.75% (9% Annuities + 0.75% Saned)
            insCompRate = defaultSaudiCompRate; // 11.75% (9% Annuities + 2% Hazards + 0.75% Saned)
          } else {
            insEmpRate = 0; // 0% on expat employee
            insCompRate = defaultExpatCompRate; // 2% Occupational Hazards on employer
          }
          const insEmpShare = Math.round(gosiWage * insEmpRate * 100) / 100;
          const insCompShare = Math.round(gosiWage * insCompRate * 100) / 100;
          const totalAllowances = emp.allowances + housing + transport + (emp.other_allowances || 0) + overtimePay + monthBonus + add.earnings;
          const totalDeductions = emp.deductions + absenceDeduction + unpaidLeaveDeduction + loanDeduction + monthPenalty + insEmpShare + add.deductions;
          const taxableIncome = Math.max(0, emp.basic_salary + totalAllowances - totalDeductions - taxExemptions);
          const taxAmount = Math.max(0, taxableIncome * taxRate);
          const net = taxableIncome - taxAmount;
          const payMethod = emp.payment_method || 'bank';
          const cashPct = Number(emp.cash_percentage || 0);
          let cashAmount = 0;
          let bankAmount = 0;
          if (payMethod === 'cash') {
            cashAmount = net;
          } else if (payMethod === 'split') {
            cashAmount = Math.round(net * (cashPct / 100) * 100) / 100;
            bankAmount = Math.round((net - cashAmount) * 100) / 100;
          } else {
            bankAmount = net;
          }
          const isSaudizable = payMethod === 'split' && cashAmount > net * 0.2;
          (await db.prepare(`
            INSERT INTO payroll (
              employee_id, month, year, basic_salary, allowances, deductions,
              tax_amount, insurance_emp_share, insurance_comp_share, bonuses, penalties, net_salary,
              national_id_iqama, is_saudi, housing_allowance, transport_allowance, gosi_number, gosi_salary,
              saudi_iban, bank_name, payment_method, cash_amount, bank_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            emp.id, month, year, emp.basic_salary, totalAllowances, totalDeductions,
            taxAmount, insEmpShare, insCompShare, monthBonus, monthPenalty, net,
            emp.national_id_iqama || '', isSaudi, housing, transport, emp.gosi_number || '', gosiWage,
            // No invented bank: an empty name blocks the bank export until the
            // employee's bank is recorded, instead of paying them into a guess.
            emp.saudi_iban || emp.bank_account || '', emp.bank_name || '',
            payMethod, cashAmount, bankAmount
          ));
          if (isSaudizable) {
            await createNotification('تنبيه حماية الأجور', `الموظف ${emp.name}: نسبة النقد ${cashPct}% قد تخالف متطلبات مدد`, 'warning');
          }
          if (loan) {
            const newRemaining = loan.remaining_amount - loanDeduction;
            (await db.prepare("UPDATE loans SET remaining_amount = ?, status = ? WHERE id = ?")
              .run(newRemaining, newRemaining <= 0 ? 'completed' : 'active', loan.id));
          }
          count++;
        }
      }
      return count;
    });
    try {
      const generatedCount = transactions(employees);
      await createNotification('تم إنشاء مسير الرواتب', `تم إنشاء مسير رواتب لعدد ${generatedCount} موظف لشهر ${month}/${year} وفق قواعد نظام العمل والتأمينات السعودية`, 'success');
      await logAction('generate', 'payroll', null, `Generated KSA-compliant payroll for ${month}/${year}`);
      res.json({ success: true, count: generatedCount });
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
      if (employee_id) {
        const emp = (await db.prepare("SELECT entity_id FROM employees WHERE id = ?").get(employee_id));
        if (emp) entityId = emp.entity_id;
      }
      if (!entityId) {
        return res.status(400).json({ error: "Entity not found for user/employee" });
      }
      const rules = await CountryRulesService.getEntityRules(entityId);
      const input = {
        employeeId: Number(employee_id) || 0,
        basicSalary: Number(basicSalary) || 0,
        housingAllowance: Number(housingAllowance) || 0,
        transportAllowance: Number(transportAllowance) || 0,
        otherAllowances: Number(otherAllowances) || 0,
        deductions: Number(deductions) || 0,
        loanDeduction: Number(loanDeduction) || 0,
        absentDays: Number(absentDays) || 0,
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
      let employees = (await db.prepare("SELECT * FROM employees WHERE entity_id = ? AND status = 'active'").all(entityId)) as any[];
      employees = employees.filter(e => scopedIds.has(e.id));
      if (employeeIds && employeeIds.length > 0) {
        employees = employees.filter(e => employeeIds.includes(e.id));
      }
      // The working days of the period, from the country's own rules. It is
      // the same for every employee, so it is worked out once.
      //
      // Counting the calendar days of the month instead charged every
      // weekend day as unpaid absence: an employee who signed in on all 21
      // working days of October 2026 was charged for 31.
      const workingDays = month && year
        ? workingDaysInMonth(Number(month), Number(year), rules.workTime)
        : 0;
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
          // The dates the employee signed in, so that the ones that fall on a
          // weekend can be left out: a sign-in on a Saturday is not a day of
          // work and must not reduce the absence.
          const presentDates = (await db.prepare(`
            SELECT DISTINCT substr(CAST(check_in_time AS TEXT), 1, 10) AS d FROM attendance_logs
            WHERE employee_id = ? AND EXTRACT(MONTH FROM check_in_time)::int = ? AND EXTRACT(YEAR FROM check_in_time)::int = ?
          `).all(emp.id, Number(month), Number(year))) as any[];
          if (presentDates.length === 0) {
            // No device evidence for this period. The monthly summary is the
            // record of what happened — the same one the payslips are built
            // from — and missing device records are not evidence that it is
            // wrong. So the absence comes from the summary, not from a guess
            // that the employee missed the whole month.
            absentDays = summaryAbsence;
          } else {
            const presentWorkingDays = countPresentWorkingDays(
              presentDates.map((row) => String(row.d)),
              rules.workTime,
            );
            absentDays = Math.max(0, workingDays - presentWorkingDays);
          }
        }
        const loanDeduction = ((await db.prepare(`
          SELECT COALESCE(SUM(monthly_installment), 0) as l FROM loans
          WHERE employee_id = ? AND status = 'active'
        `).get(emp.id)) as any)?.l || 0;
        return {
          employeeId: emp.id,
          employee: emp,
          basicSalary,
          housingAllowance: housing,
          transportAllowance: transport,
          otherAllowances: other,
          deductions: 0,
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
