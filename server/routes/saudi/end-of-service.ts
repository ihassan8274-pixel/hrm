import db, { logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { isPayrollLocked } from "../payroll/lock";
import { splitNetPayment } from "../../lib/payroll/payment-split";

/**
 * End-of-service gratuity calculator (Articles 84, 85 and 87 of the Labour Law).
 *
 * The calculation is stored only when it is tied to an employee: without an
 * employee id there is no row to save, and the result stays valid for display
 * and printing.
 */
export function registerEndOfServiceCalculator(app: express.Express) {
  app.post("/api/saudi/eos-calculate", async (req, res) => {
    const { 
      employee_id, employee_name, national_id_iqama,
      start_date, end_date, basic_salary, allowances = 0,
      reason = 'employer_termination', // 'employer_termination', 'resignation', 'contract_expiry', 'mutual_agreement', 'force_majeure'
      leave_balance_compensation = 0, other_entitlements = 0, deductions = 0
    } = req.body;
    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffTime = Math.max(0, end.getTime() - start.getTime());
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(totalDays / 365.25);
    const remainingDaysAfterYears = totalDays % 365.25;
    const months = Math.floor(remainingDaysAfterYears / 30.4375);
    const days = Math.floor(remainingDaysAfterYears % 30.4375);
    const total_service_years = Math.round((totalDays / 365.25) * 100) / 100;
    const totalSalary = Number(basic_salary) + Number(allowances);
    let baseGratuity = 0;
    if (total_service_years <= 5) {
      baseGratuity = total_service_years * (totalSalary / 2);
    } else {
      const first5Years = 5 * (totalSalary / 2);
      const after5Years = (total_service_years - 5) * totalSalary;
      baseGratuity = first5Years + after5Years;
    }
    let entitlementPercentage = 100;
    let reasonText = 'إنهاء العقد من قبل صاحب العمل (المادة 84 - استحقاق 100%)';
    if (reason === 'resignation') {
      if (total_service_years < 2) {
        entitlementPercentage = 0;
        reasonText = 'استقالة مع خدمة أقل من سنتين (المادة 85 - لا يستحق مكافأة)';
      } else if (total_service_years >= 2 && total_service_years < 5) {
        entitlementPercentage = 33.3333;
        reasonText = 'استقالة مع خدمة من سنتين إلى 5 سنوات (المادة 85 - استحقاق ثلث المكافأة 33.3%)';
      } else if (total_service_years >= 5 && total_service_years < 10) {
        entitlementPercentage = 66.6667;
        reasonText = 'استقالة مع خدمة من 5 إلى 10 سنوات (المادة 85 - استحقاق ثلثي المكافأة 66.7%)';
      } else {
        entitlementPercentage = 100;
        reasonText = 'استقالة مع خدمة 10 سنوات فأكثر (المادة 85 - استحقاق المكافأة كاملة 100%)';
      }
    } else if (reason === 'contract_expiry') {
      entitlementPercentage = 100;
      reasonText = 'انتهاء مدة العقد محدد المدة (استحقاق كامل 100%)';
    } else if (reason === 'mutual_agreement') {
      entitlementPercentage = 100;
      reasonText = 'اتفاق الطرفين على إنهاء العقد (استحقاق كامل 100%)';
    } else if (reason === 'force_majeure') {
      entitlementPercentage = 100;
      reasonText = 'إنهاء لظروف القوة القاهرة / المادة 87 (استحقاق كامل 100%)';
    }
    const finalAmount = Math.round((baseGratuity * (entitlementPercentage / 100)) * 100) / 100;
    const netPayable = Math.round((finalAmount + Number(leave_balance_compensation) + Number(other_entitlements) - Number(deductions)) * 100) / 100;
    const result: any = {
      employee_id: employee_id || null,
      employee_name: employee_name || 'موظف',
      national_id_iqama: national_id_iqama || '',
      start_date,
      end_date,
      basic_salary: Number(basic_salary),
      allowances: Number(allowances),
      total_salary: totalSalary,
      reason,
      reason_text: reasonText,
      years,
      months,
      days,
      total_service_years,
      entitlement_percentage: Math.round(entitlementPercentage * 10) / 10,
      base_gratuity: Math.round(baseGratuity * 100) / 100,
      final_amount: finalAmount,
      leave_balance_compensation: Number(leave_balance_compensation),
      other_entitlements: Number(other_entitlements),
      deductions: Number(deductions),
      net_payable: netPayable
    };
    // سجلّ الاحتساب مربوط بموظف — بلا معرّف موظف لا سطر يُحفظ، ويبقى
    // ناتج الحاسبة صالحاً للعرض والطباعة.
    if (employee_name && Number(employee_id) > 0) {
      const saved = await db.prepare(`
        INSERT INTO eos_calculations (
          employee_id, employee_name, national_id_iqama, start_date, end_date,
          basic_salary, allowances, total_salary, reason, reason_text,
          total_service_years, entitlement_percentage, final_amount,
          leave_balance_compensation, other_entitlements, deductions, net_payable
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(employee_id), employee_name, national_id_iqama || '', start_date, end_date,
        Number(basic_salary), Number(allowances), totalSalary, reason, reasonText,
        total_service_years, entitlementPercentage, finalAmount,
        Number(leave_balance_compensation), Number(other_entitlements), Number(deductions), netPayable
      );
      result.id = Number(saved.lastInsertRowid);
    }
    res.json(result);
  });

  /**
   * Turn a stored EOS calculation into a reviewable final payslip.
   *
   * The amount is never recomputed here — the calculation record is the single
   * source. The row is created as a draft: it can be printed, approved and then
   * exported through the same WPS gate as any other payroll row. Nothing is
   * marked paid automatically.
   */
  app.post("/api/saudi/eos/:id/final-settlement", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const month = Number(req.body?.month);
      const year = Number(req.body?.year);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
        return res.status(400).json({ error: "شهر وسنة صحيحان مطلوبان" });
      }
      const eos = await db.prepare("SELECT * FROM eos_calculations WHERE id = ?").get(id) as any;
      if (!eos) return res.status(404).json({ error: "سجل نهاية الخدمة غير موجود" });
      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(eos.employee_id))) return;
      if (eos.settlement_status === 'settled' || eos.final_payroll_id) {
        return res.status(409).json({ error: "تم إنشاء الكشف النهائي لهذا السجل مسبقاً" });
      }
      if (await isPayrollLocked(month, year)) {
        return res.status(409).json({ error: "الفترة مقفلة — لا يمكن إضافة كشف نهائي إليها" });
      }
      const employee = await db.prepare("SELECT * FROM employees WHERE id = ?").get(eos.employee_id) as any;
      if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });

      const net = Number(eos.net_payable) || 0;
      if (net <= 0) {
        return res.status(422).json({ error: "صافي المستحق صفري — لا يُنشأ كشف دفع به قيمة صفر" });
      }
      const { cashAmount, bankAmount } = splitNetPayment(net, employee.payment_method, employee.cash_percentage);
      const info = await db.prepare(`
        INSERT INTO payroll (
          employee_id, month, year, basic_salary, allowances, deductions, tax_amount,
          net_salary, national_id_iqama, is_saudi, housing_allowance, transport_allowance,
          gosi_number, saudi_iban, bank_name, payment_method, cash_amount, bank_amount,
          approval_status, payment_status, eos_amount, is_final_settlement, final_settlement_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'draft', 'pending', ?, 1, ?
        )
      `).run(
        eos.employee_id, month, year,
        Number(eos.basic_salary) || 0,
        Number(eos.allowances) || 0,
        Number(eos.deductions) || 0,
        net,
        eos.national_id_iqama || employee.national_id_iqama || '',
        employee.is_saudi ?? 1,
        Number(eos.basic_salary) || 0, 0,
        employee.gosi_number || '',
        employee.saudi_iban || employee.bank_account || '',
        employee.bank_name || '',
        employee.payment_method || 'bank',
        cashAmount, bankAmount,
        net, id,
      );
      const payrollId = Number(info.lastInsertRowid);
      await db.prepare(`
        UPDATE eos_calculations
        SET settlement_status = 'pending_approval', final_payroll_id = ?,
            final_payroll_month = ?, final_payroll_year = ?
        WHERE id = ?
      `).run(payrollId, month, year, id);
      await logAction('create', 'payroll', payrollId,
        `كشف تسوية نهائية نهاية خدمة ${id} للموظف ${eos.employee_id} بقيمة ${net}`);
      res.json({ success: true, payroll_id: payrollId, net_payable: net, approval_status: 'draft', payment_status: 'pending' });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/saudi/eos/settlements", authenticateToken, requireOrganizationScope, async (_req, res) => {
    try {
      const scope = organizationScope(res);
      const rows = await db.prepare(`
        SELECT s.*, e.name AS employee_name, p.approval_status, p.payment_status
        FROM eos_calculations s
        JOIN employees e ON s.employee_id = e.id
        LEFT JOIN payroll p ON p.id = s.final_payroll_id
        WHERE (? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)
        ORDER BY s.id DESC
      `).all(...scopeFilter(scope));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
