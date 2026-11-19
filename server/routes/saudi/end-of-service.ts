import db from "../../config/postgres";
import express from "express";

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
    const result = {
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
      (await db.prepare(`
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
      ));
    }
    res.json(result);
  });
}
