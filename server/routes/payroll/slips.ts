import db, { logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { SalaryStructureEngine } from "../../lib/payroll/SalaryStructureEngine";
import { validateBody, payrollCalculateSlipSchema, payrollSaveSlipSchema } from "../../middleware/validation";

/**
 * Salary slips (قسائم الرواتب).
 *
 * A slip is one employee's salary for one period, calculated from a salary
 * structure and the period's attendance, leave and loan data.
 */

/** POST /api/payroll/calculate-slip - حساب قسيمة راتب باستخدام الهيكل */
export function registerSalarySlips(app: express.Express) {
  app.post("/api/payroll/calculate-slip", validateBody(payrollCalculateSlipSchema), authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { employee_id, structure_id, month, year } = req.body;

      if (!employee_id || !structure_id || !month || !year) {
        return res.status(400).json({ error: 'employee_id, structure_id, month, year مطلوبة' });
      }
      if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;

      // جلب بيانات الموظف
      const employee = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id));
      if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });

      // جلب الهيكل
      const structure = (await db.prepare("SELECT * FROM salary_structures WHERE id = ? AND is_active = 1").get(structure_id));
      if (!structure) return res.status(404).json({ error: 'هيكل الراتب غير موجود أو غير نشط' });

      // جلب بيانات الحضور
      const attendance = (await db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?").get(employee_id, month, year)) || {};

      // جلب الإجازات غير مدفوعة الأجر
      const leaves = (await db.prepare(`
        SELECT SUM(days) as unpaid_days FROM leaves
        WHERE employee_id = ? AND type = 'unpaid' AND status = 'approved'
        AND EXTRACT(MONTH FROM start_date)::int = ? AND EXTRACT(YEAR FROM start_date)::int = ?
      `).get(employee_id, Number(month), Number(year))) || { unpaid_days: 0 };

      // جلب السلفة والأقساط
      const loans = (await db.prepare(`
        SELECT SUM(monthly_installment) as total_installment FROM loans
        WHERE employee_id = ? AND status = 'active'
      `).get(employee_id)) || { total_installment: 0 };

      // إعداد السياق
      const context = {
        employee,
        structure,
        period: { month: Number(month), year: Number(year) },
        attendance: {
          working_days: attendance.absence_days ? 30 - Number(attendance.absence_days) : 30,
          payment_days: attendance.absence_days ? 30 - Number(attendance.absence_days) : 30,
          absent_days: Number(attendance.absence_days) || 0,
          overtime_hours: Number(attendance.overtime_hours) || 0,
          late_minutes: 0,
        },
        leaves: { unpaid_days: Number(leaves.unpaid_days) || 0, paid_days: 0 },
        loans: { total_installment: Number(loans.total_installment) || 0 },
        advances: { total_deduction: 0 },
        previous_slips: [],
        settings: ((await db.prepare("SELECT * FROM settings").all()) as any[]).reduce((acc: any, s: any) => { acc[s.key] = s.value; return acc; }, {}),
        custom_variables: {},
      };

      // حساب القسيمة
      const engine = new SalaryStructureEngine(context);
      const result = await engine.calculate();

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/payroll/save-slip - حفظ قسيمة الراتب
  app.post("/api/payroll/save-slip", validateBody(payrollSaveSlipSchema), authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { slip_data } = req.body;

      if (!slip_data) return res.status(400).json({ error: 'slip_data مطلوبة' });
      if (await denyEmployee(res, organizationScope(res), Number(slip_data.employee_id))) return;

      // إعادة بناء السياق من البيانات المحفوظة
      const employee = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(slip_data.employee_id));
      const structure = (await db.prepare("SELECT * FROM salary_structures WHERE id = ?").get(slip_data.structure_id));
      const settings = ((await db.prepare("SELECT * FROM settings").all()) as any[]).reduce((acc: any, s: any) => { acc[s.key] = s.value; return acc; }, {});

      const context = {
        employee,
        structure,
        period: { month: slip_data.period_month, year: slip_data.period_year },
        attendance: {
          working_days: slip_data.working_days,
          payment_days: slip_data.payment_days,
          absent_days: slip_data.absent_days,
          overtime_hours: slip_data.overtime_hours,
          late_minutes: slip_data.late_minutes,
        },
        leaves: { unpaid_days: slip_data.leave_without_pay_days, paid_days: 0 },
        loans: { total_installment: 0 },
        advances: { total_deduction: 0 },
        previous_slips: [],
        settings,
        custom_variables: {},
      };

      const engine = new SalaryStructureEngine(context);
      const slipId = await engine.saveSlip(slip_data, (req as any).user?.username || 'system');

      await logAction('create', 'salary_slip', slipId, `حفظ قسيمة راتب موظف ${slip_data.employee_id} لشهر ${slip_data.period_month}/${slip_data.period_year}`);

      res.json({ id: slipId, message: 'تم حفظ قسيمة الراتب بنجاح' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/payroll/slips - جلب قسائم الرواتب
  app.get("/api/payroll/slips", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { month, year, employee_id, status, entity_id } = req.query;
      const scope = organizationScope(res);
      let where = "1=1";
      const params: any[] = [];

      if (month) { where += " AND ss.period_month = ?"; params.push(month); }
      if (year) { where += " AND ss.period_year = ?"; params.push(year); }
      if (employee_id) { where += " AND ss.employee_id = ?"; params.push(employee_id); }
      if (status) { where += " AND ss.status = ?"; params.push(status); }
      if (entity_id) { where += " AND e.entity_id = ?"; params.push(entity_id); }
      where += " AND (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)";
      params.push(...scopeFilter(scope));

      const slips = (await db.prepare(`
        SELECT ss.*, e.name as employee_name, e.department_id, d.name as dept_name, b.name as branch_name, s.name_ar as structure_name
        FROM salary_slips ss
        JOIN employees e ON ss.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN branches b ON e.branch_id = b.id
        LEFT JOIN salary_structures s ON ss.structure_id = s.id
        WHERE ${where}
        ORDER BY ss.period_year DESC, ss.period_month DESC, e.name
      `).all(...params));

      res.json(slips);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/payroll/slips/:id - جلب قسيمة راتب بالتفصيل
  app.get("/api/payroll/slips/:id", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { id } = req.params;
      const owner = (await db.prepare('SELECT employee_id FROM salary_slips WHERE id = ?').get(id)) as { employee_id: number } | undefined;
      if (owner && await denyEmployee(res, organizationScope(res), Number(owner.employee_id))) return;
      const slip = await SalaryStructureEngine.getSlip(parseInt(id));
      if (!slip) return res.status(404).json({ error: 'قسيمة الراتب غير موجودة' });
      res.json(slip);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/payroll/slips/:id/approve - اعتماد قسيمة راتب
  app.post("/api/payroll/slips/:id/approve", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { id } = req.params;
      const owner = (await db.prepare('SELECT employee_id FROM salary_slips WHERE id = ?').get(id)) as { employee_id: number } | undefined;
      if (owner && await denyEmployee(res, organizationScope(res), Number(owner.employee_id))) return;
      const success = await SalaryStructureEngine.approveSlip(parseInt(id), (req as any).user?.username || 'system');
      if (!success) return res.status(400).json({ error: 'لا يمكن اعتماد هذه القسيمة' });
      await logAction('approve', 'salary_slip', parseInt(id), `اعتماد قسيمة راتب`);
      res.json({ success: true, message: 'تم اعتماد قسيمة الراتب' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/payroll/slips/:id/cancel - إلغاء قسيمة راتب
  app.post("/api/payroll/slips/:id/cancel", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { id } = req.params;
      const owner = (await db.prepare('SELECT employee_id FROM salary_slips WHERE id = ?').get(id)) as { employee_id: number } | undefined;
      if (owner && await denyEmployee(res, organizationScope(res), Number(owner.employee_id))) return;
      const success = await SalaryStructureEngine.cancelSlip(parseInt(id), (req as any).user?.username || 'system');
      if (!success) return res.status(400).json({ error: 'لا يمكن إلغاء هذه القسيمة' });
      await logAction('cancel', 'salary_slip', parseInt(id), `إلغاء قسيمة راتب`);
      res.json({ success: true, message: 'تم إلغاء قسيمة الراتب' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/payroll/slips/employee/:employeeId - قسائم موظف محدد
  app.get("/api/payroll/slips/employee/:employeeId", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { employeeId } = req.params;
      if (await denyEmployee(res, organizationScope(res), Number(employeeId))) return;
      const { year } = req.query;
      const slips = await SalaryStructureEngine.getEmployeeSlips(parseInt(employeeId), year ? parseInt(year as string) : undefined);
      res.json(slips);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
