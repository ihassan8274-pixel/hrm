import db from "../../config/postgres";
import { log } from "../../lib/logger";

export interface CalculationContext {
  employee: any;
  structure: any;
  period: { month: number; year: number };
  attendance: {
    working_days: number;
    payment_days: number;
    absent_days: number;
    overtime_hours: number;
    late_minutes: number;
  };
  leaves: {
    unpaid_days: number;
    paid_days: number;
  };
  loans: { total_installment: number };
  advances: { total_deduction: number };
  previous_slips: any[];
  settings: Record<string, string>;
  custom_variables: Record<string, number>;
}

export interface ComponentResult {
  component_id: number;
  component_code: string;
  component_name_ar: string;
  component_type: 'earning' | 'deduction' | 'employer_contribution';
  amount: number;
  base_amount: number;
  formula_used: string;
  sequence: number;
}

export interface SalarySlipResult {
  slip_id?: number;
  employee_id: number;
  structure_id: number;
  period_month: number;
  period_year: number;
  working_days: number;
  payment_days: number;
  absent_days: number;
  leave_without_pay_days: number;
  overtime_hours: number;
  late_minutes: number;
  items: ComponentResult[];
  gross_earnings: number;
  total_deductions: number;
  total_employer_contributions: number;
  net_pay: number;
  ytd_gross: number;
  ytd_taxable: number;
  ytd_tax_paid: number;
  mtd_gross: number;
  calculation_details: Record<string, any>;
  tax_breakup: any;
}

export class SalaryStructureEngine {
  private context: CalculationContext;
  private componentCache: Map<string, any> = new Map();
  private calculatedValues: Map<string, number> = new Map();

  constructor(context: CalculationContext) {
    this.context = context;
    this.initializeCustomVariables();
  }

  private initializeCustomVariables() {
    const { employee, attendance, settings } = this.context;
    const basicSalary = employee.basic_salary || 0;
    const housingAllowance = employee.housing_allowance || 0;
    const transportAllowance = employee.transport_allowance || 0;
    const otherAllowances = employee.other_allowances || 0;
    const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;

    this.context.custom_variables = {
      // المتغيرات الأساسية
      'base_salary': basicSalary,
      'gross_salary': grossSalary,
      'housing_allowance': housingAllowance,
      'transport_allowance': transportAllowance,
      'other_allowances': otherAllowances,
      'working_days': attendance.working_days,
      'payment_days': attendance.payment_days,
      'absent_days': attendance.absent_days,
      'overtime_hours': attendance.overtime_hours,
      'late_minutes': attendance.late_minutes,
      'daily_rate': basicSalary / 30,
      'hourly_rate': basicSalary / 30 / 8,
      'is_saudi': employee.is_saudi || 0,
      'gosi_ceiling': parseFloat(settings.saudi_gosi_ceiling || '45000'),
      'gosi_emp_rate': parseFloat(settings.saudi_gosi_emp_rate || '9.75') / 100,
      'gosi_comp_rate': parseFloat(settings.saudi_gosi_comp_rate || '11.75') / 100,
      'expat_gosi_comp_rate': parseFloat(settings.expat_gosi_comp_rate || '2.0') / 100,
      'medical_premium_per_employee': parseFloat(settings.medical_premium_per_employee || '2500'),
      'total_installment': this.context.loans.total_installment,
      'total_deduction': this.context.advances.total_deduction,
      // متغيرات النظام
      'current_month': this.context.period.month,
      'current_year': this.context.period.year,
    };
  }

  /**
   * تقييم صيغة رياضية بأمان
   */
  evaluateFormula(formula: string): number {
    try {
      // استبدال المتغيرات بقيمها
      let expr = formula;
      for (const [key, value] of Object.entries(this.context.custom_variables)) {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }
      // استبدال القيم المحسوبة مسبقاً
      for (const [key, value] of this.calculatedValues.entries()) {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }

      // دوال مساعدة آمنة
      const safeFunctions = {
        min: Math.min,
        max: Math.max,
        round: (n: number, d = 2) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d),
        floor: Math.floor,
        ceil: Math.ceil,
        abs: Math.abs,
        if: (cond: boolean, a: number, b: number) => cond ? a : b,
      };

      // تقييم آمن باستخدام Function constructor (بدون eval)
      const func = new Function(
        ...Object.keys(safeFunctions),
        ...Object.keys(this.context.custom_variables),
        ...Array.from(this.calculatedValues.keys()),
        `return ${expr};`
      );
      
      return func(
        ...Object.values(safeFunctions),
        ...Object.values(this.context.custom_variables),
        ...Array.from(this.calculatedValues.values())
      );
    } catch (e) {
      log.error(`[SalaryEngine] Formula evaluation error: ${formula}`, e);
      return 0;
    }
  }

  /**
   * تقييم شرط منطقي
   */
  evaluateCondition(condition: string): boolean {
    try {
      let expr = condition;
      for (const [key, value] of Object.entries(this.context.custom_variables)) {
        if (typeof value === 'string') {
          expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), `"${value}"`);
        } else {
          expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
        }
      }
      for (const [key, value] of this.calculatedValues.entries()) {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }

      const func = new Function(`return ${expr};`);
      return !!func();
    } catch (e) {
      log.error(`[SalaryEngine] Condition evaluation error: ${condition}`, e);
      return false;
    }
  }

  /**
   * جلب مكونات الهيكل بالترتيب
   */
  private async getStructureComponents(structureId: number): Promise<any[]> {
    const cacheKey = `structure_${structureId}`;
    if (this.componentCache.has(cacheKey)) {
      return this.componentCache.get(cacheKey);
    }

    const components = await db.prepare(`
      SELECT
        sc.component_id,
        sc.structure_id,
        sc.sequence,
        sc.is_mandatory,
        s.code as component_code,
        s.name_ar as component_name_ar,
        s.type as component_type,
        s.category,
        s.calculation_type,
        s.calculation_value,
        s.condition_formula,
        s.is_taxable,
        s.is_gosi_applicable
      FROM salary_structure_components sc
      JOIN salary_components s ON sc.component_id = s.id
      WHERE sc.structure_id = ? AND s.is_active = 1
      ORDER BY sc.sequence, sc.id
    `).all(structureId);

    this.componentCache.set(cacheKey, components);
    return components;
  }

  /**
   * حساب مكون واحد
   */
  private calculateComponent(comp: any): ComponentResult {
    const { component_code, component_name_ar, component_type, calculation_type, calculation_value, condition_formula } = comp;

    // التحقق من الشرط
    if (condition_formula && !this.evaluateCondition(condition_formula)) {
      return {
        component_id: comp.component_id,
        component_code,
        component_name_ar,
        component_type,
        amount: 0,
        base_amount: 0,
        formula_used: `شرط غير محقق: ${condition_formula}`,
        sequence: comp.sequence,
      };
    }

    let amount = 0;
    let baseAmount = 0;
    let formulaUsed = calculation_value || 'fixed';

    switch (calculation_type) {
      case 'fixed':
        amount = parseFloat(calculation_value || '0');
        baseAmount = amount;
        break;

      case 'percentage':
        // نسبة من متغير معين (مثال: "base_salary * 0.15")
        baseAmount = this.evaluateFormula(calculation_value || '0');
        amount = baseAmount;
        break;

      case 'formula':
        // صيغة كاملة
        amount = this.evaluateFormula(calculation_value || '0');
        formulaUsed = calculation_value || '';
        break;

      case 'bracket':
        // شرائح (للضرائب) - يتم التعامل معها بشكل منفصل
        amount = this.calculateBracket(comp);
        break;

      default:
        amount = parseFloat(comp.override_value || '0') || 0;
    }

    // تطبيق الحدود الدنيا والقصوى
    if (comp.min_value !== null && comp.min_value !== undefined && amount < comp.min_value) {
      amount = comp.min_value;
    }
    if (comp.max_value !== null && comp.max_value !== undefined && amount > comp.max_value) {
      amount = comp.max_value;
    }

    // تقريب
    amount = Math.round(amount * 100) / 100;

    // تخزين القيمة للاستخدام في مكونات لاحقة
    this.calculatedValues.set(component_code, amount);

    return {
      component_id: comp.component_id,
      component_code,
      component_name_ar,
      component_type,
      amount,
      base_amount: baseAmount,
      formula_used: formulaUsed,
      sequence: comp.sequence,
    };
  }

  /**
   * حساب الشرائح (للضرائب والتأمينات)
   */
  private calculateBracket(comp: any): number {
    // يمكن تطوير هذا لاحقاً لجلب الشرائح من tax_brackets
    const base = this.calculatedValues.get(comp.calculation_value || 'taxable_income') || 0;
    return 0;
  }

  /**
   * حساب قسيمة الراتب الكاملة
   */
  async calculate(): Promise<SalarySlipResult> {
    const { employee, structure, period, attendance, leaves, loans, advances } = this.context;
    const components = await this.getStructureComponents(structure.id);

    const items: ComponentResult[] = [];
    let grossEarnings = 0;
    let totalDeductions = 0;
    let totalEmployerContributions = 0;

    // حساب جميع المكونات بالترتيب
    for (const comp of components) {
      const result = this.calculateComponent(comp);
      items.push(result);

      switch (comp.type) {
        case 'earning':
          grossEarnings += result.amount;
          break;
        case 'deduction':
          totalDeductions += result.amount;
          break;
        case 'employer_contribution':
          totalEmployerContributions += result.amount;
          break;
      }
    }

    const netPay = grossEarnings - totalDeductions;

    // حساب YTD/MTD
    const ytdData = await this.calculateYTD(employee.id, period);
    const mtdData = await this.calculateMTD(employee.id, period);

    // تفصيل الضريبة
    const taxBreakup = this.calculateTaxBreakup(grossEarnings, ytdData.ytd_taxable);

    return {
      employee_id: employee.id,
      structure_id: structure.id,
      period_month: period.month,
      period_year: period.year,
      working_days: attendance.working_days,
      payment_days: attendance.payment_days,
      absent_days: attendance.absent_days,
      leave_without_pay_days: leaves.unpaid_days,
      overtime_hours: attendance.overtime_hours,
      late_minutes: attendance.late_minutes,
      items,
      gross_earnings: grossEarnings,
      total_deductions: totalDeductions,
      total_employer_contributions: totalEmployerContributions,
      net_pay: netPay,
      ytd_gross: ytdData.ytd_gross,
      ytd_taxable: ytdData.ytd_taxable,
      ytd_tax_paid: ytdData.ytd_tax_paid,
      mtd_gross: mtdData,
      calculation_details: {
        custom_variables: this.context.custom_variables,
        calculated_values: Object.fromEntries(this.calculatedValues),
      },
      tax_breakup: taxBreakup,
    };
  }

  private async calculateYTD(employeeId: number, period: { month: number; year: number }) {
    const slips = await db.prepare(`
      SELECT gross_earnings, net_pay, total_deductions 
      FROM salary_slips 
      WHERE employee_id = ? AND period_year = ? AND period_month < ? AND status IN ('approved', 'paid')
    `).all(employeeId, period.year, period.month) as any[];

    return {
      ytd_gross: slips.reduce((sum, s) => sum + (s.gross_earnings || 0), 0),
      ytd_taxable: slips.reduce((sum, s) => sum + (s.gross_earnings || 0), 0), // مبسط
      ytd_tax_paid: 0, // يحتاج ربط بجدول الضريبة
    };
  }

  private async calculateMTD(employeeId: number, period: { month: number; year: number }): Promise<number> {
    const slip = await db.prepare(`
      SELECT gross_earnings FROM salary_slips 
      WHERE employee_id = ? AND period_year = ? AND period_month = ? AND status IN ('approved', 'paid')
    `).get(employeeId, period.year, period.month) as any;
    return slip?.gross_earnings || 0;
  }

  private calculateTaxBreakup(gross: number, ytdTaxable: number): any {
    // منطق تفصيل الضريبة السعودية (لا ضريبة دخل حالياً)
    return {
      gross_income: gross,
      ytd_taxable_income: ytdTaxable,
      taxable_income_this_month: gross,
      tax_rate: 0,
      tax_amount: 0,
      notes: 'لا توجد ضريبة دخل في السعودية حالياً للمواطنين',
    };
  }

  /**
   * حفظ قسيمة الراتب في قاعدة البيانات
   */
  async saveSlip(result: SalarySlipResult, userId: string): Promise<number> {
    const slipId = await db.transaction(async () => {
      // إدخال القسيمة الرئيسية
      const slipResult = await db.prepare(`
        INSERT INTO salary_slips (
          employee_id, structure_id, period_month, period_year,
          period_start, period_end, working_days, payment_days, absent_days, leave_without_pay_days,
          gross_earnings, total_deductions, total_employer_contributions, net_pay,
          ytd_gross, ytd_taxable, ytd_tax_paid, mtd_gross,
          currency, exchange_rate, calculation_details_json, tax_breakup_json,
          status, calculated_by, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated', ?, CURRENT_TIMESTAMP)
      `).run(
        result.employee_id, result.structure_id, result.period_month, result.period_year,
        // period_start/end يمكن حسابها
        null, null,
        result.working_days, result.payment_days, result.absent_days, result.leave_without_pay_days,
        result.gross_earnings, result.total_deductions, result.total_employer_contributions, result.net_pay,
        result.ytd_gross, result.ytd_taxable, result.ytd_tax_paid, result.mtd_gross,
        'SAR', 1,
        JSON.stringify(result.calculation_details), JSON.stringify(result.tax_breakup),
        userId
      );

      const slipId = Number(slipResult.lastInsertRowid);

      // إدخال البنود
      const insertItem = db.prepare(`
        INSERT INTO salary_slip_items (slip_id, component_id, component_code, component_name_ar, component_type, amount, base_amount, formula_used, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of result.items) {
        await insertItem.run(
          slipId, item.component_id, item.component_code, item.component_name_ar,
          item.component_type, item.amount, item.base_amount, item.formula_used, item.sequence
        );
      }

      return slipId;
    })();

    return slipId;
  }

  /**
   * الحصول على قسيمة راتب محفوظة
   */
  static async getSlip(slipId: number): Promise<any> {
    const slip = await db.prepare("SELECT * FROM salary_slips WHERE id = ?").get(slipId) as any;
    if (!slip) return null;

    const items = await db.prepare("SELECT * FROM salary_slip_items WHERE slip_id = ? ORDER BY sequence").all(slipId);
    const employee = await db.prepare("SELECT * FROM employees WHERE id = ?").get(slip.employee_id);
    const structure = await db.prepare("SELECT * FROM salary_structures WHERE id = ?").get(slip.structure_id);

    return {
      ...slip,
      calculation_details: slip.calculation_details_json ? JSON.parse(slip.calculation_details_json) : {},
      tax_breakup: slip.tax_breakup_json ? JSON.parse(slip.tax_breakup_json) : {},
      items,
      employee,
      structure,
    };
  }

  /**
   * قائمة قسائم رواتب موظف
   */
  static async getEmployeeSlips(employeeId: number, year?: number): Promise<any[]> {
    let query = "SELECT * FROM salary_slips WHERE employee_id = ?";
    const params: any[] = [employeeId];
    
    if (year) {
      query += " AND period_year = ?";
      params.push(year);
    }
    
    query += " ORDER BY period_year DESC, period_month DESC";
    
    return await db.prepare(query).all(...params);
  }

  /**
   * الموافقة على قسيمة راتب
   */
  static async approveSlip(slipId: number, approvedBy: string): Promise<boolean> {
    const result = await db.prepare(`
      UPDATE salary_slips 
      SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'calculated'
    `).run(approvedBy, slipId);
    
    return result.changes > 0;
  }

  /**
   * إلغاء قسيمة راتب
   */
  static async cancelSlip(slipId: number, cancelledBy: string): Promise<boolean> {
    const result = await db.prepare(`
      UPDATE salary_slips 
      SET status = 'cancelled', notes = COALESCE(notes, '') || ' | ملغاة بواسطة ' || ? || ' في ' || CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('draft', 'calculated')
    `).run(cancelledBy, slipId);
    
    return result.changes > 0;
  }
}
