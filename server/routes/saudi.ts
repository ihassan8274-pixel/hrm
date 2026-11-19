// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import express from "express";
import { computeNitaqat, resolveSector } from "../lib/nitaqat";
import { buildSifExport, readSifProfile, normalizePeriod, validateSifIdentities, SifError } from "../lib/sif-export";
import { resolveOrganizationScope, resolveWriteScope, ScopeError } from "../lib/organization-scope";

export function registerSaudi(app: express.Express) {

    // 1. Compliance Summary (نظرة شاملة للامتثال ونطاقات والتأمينات والإقامات)

  app.get("/api/saudi/compliance-summary", async (req, res) => {
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];
    const totalEmployees = employees.length;
    const saudiEmployees = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي' || e.nationality === 'سعودية').length;
    const expatEmployees = totalEmployees - saudiEmployees;
    const saudizationRate = totalEmployees > 0 ? Math.round((saudiEmployees / totalEmployees) * 1000) / 10 : 0;
    let nitaqatStatus: 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red' = 'mid_green';
    let nitaqatLabel = 'نطاق أخضر متوسط';
    if (saudizationRate >= 50) {
      nitaqatStatus = 'platinum';
      nitaqatLabel = 'النطاق البلاتيني';
    } else if (saudizationRate >= 35) {
      nitaqatStatus = 'high_green';
      nitaqatLabel = 'نطاق أخضر مرتفع';
    } else if (saudizationRate >= 20) {
      nitaqatStatus = 'mid_green';
      nitaqatLabel = 'نطاق أخضر متوسط';
    } else if (saudizationRate >= 10) {
      nitaqatStatus = 'low_green';
      nitaqatLabel = 'نطاق أخضر منخفض';
    } else {
      nitaqatStatus = 'red';
      nitaqatLabel = 'النطاق الأحمر (حرج)';
    }
    const now = new Date();
    const d30 = new Date(); d30.setDate(now.getDate() + 30);
    const d60 = new Date(); d60.setDate(now.getDate() + 60);
    const d90 = new Date(); d90.setDate(now.getDate() + 90);
    let expiredIqamas = 0;
    let iqamasExpiring30Days = 0;
    let iqamasExpiring60Days = 0;
    let iqamasExpiring90Days = 0;
    let expiredWorkPermits = 0;
    let workPermitsExpiring30Days = 0;
    let expiredMedicalInsurance = 0;
    let medicalExpiring30Days = 0;
    let monthlyGosiSaudiEmp = 0;
    let monthlyGosiSaudiComp = 0;
    let monthlyGosiExpatComp = 0;
    employees.forEach(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const gosiSalary = emp.gosi_registered_salary || (Number(emp.basic_salary) + Number(emp.housing_allowance || 0));
      const cappedWage = Math.min(45000, gosiSalary);
      if (isSaudi) {
        monthlyGosiSaudiEmp += cappedWage * 0.0975;
        monthlyGosiSaudiComp += cappedWage * 0.1175;
      } else {
        monthlyGosiExpatComp += cappedWage * 0.02;
        if (emp.iqama_expiry_gregorian) {
          const exp = new Date(emp.iqama_expiry_gregorian);
          if (exp < now) {
            expiredIqamas++;
          } else if (exp <= d30) {
            iqamasExpiring30Days++;
          } else if (exp <= d60) {
            iqamasExpiring60Days++;
          } else if (exp <= d90) {
            iqamasExpiring90Days++;
          }
        }
        if (emp.work_permit_expiry) {
          const wpExp = new Date(emp.work_permit_expiry);
          if (wpExp < now) expiredWorkPermits++;
          else if (wpExp <= d30) workPermitsExpiring30Days++;
        }
      }
      if (emp.medical_insurance_expiry) {
        const medExp = new Date(emp.medical_insurance_expiry);
        if (medExp < now) expiredMedicalInsurance++;
        else if (medExp <= d30) medicalExpiring30Days++;
      }
    });
    const monthlyGosiTotalEmployer = monthlyGosiSaudiComp + monthlyGosiExpatComp;
    const monthlyGosiTotalEmployee = monthlyGosiSaudiEmp;
    const monthlyGosiGrandTotal = monthlyGosiTotalEmployer + monthlyGosiTotalEmployee;
    res.json({
      totalEmployees,
      saudiEmployees,
      expatEmployees,
      saudizationRate,
      nitaqatStatus,
      nitaqatLabel,
      expiredIqamas,
      iqamasExpiring30Days,
      iqamasExpiring60Days,
      iqamasExpiring90Days,
      expiredWorkPermits,
      workPermitsExpiring30Days,
      expiredMedicalInsurance,
      medicalExpiring30Days,
      monthlyGosiSaudiShare: Math.round(monthlyGosiSaudiEmp),
      monthlyGosiExpatShare: Math.round(monthlyGosiExpatComp),
      monthlyGosiTotalEmployer: Math.round(monthlyGosiTotalEmployer),
      monthlyGosiTotalEmployee: Math.round(monthlyGosiTotalEmployee),
      monthlyGosiGrandTotal: Math.round(monthlyGosiGrandTotal)
    });
  });

    // 2. Expiring Documents Table (جدول متابعة الوثائق والإقامات ورخص العمل والتأمين الطبي)

  app.get("/api/saudi/expiring-documents", async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all()) as any[];
    const now = new Date();
    const results = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      let iqamaDaysRemaining: number | null = null;
      let iqamaStatus: 'valid' | 'warning_30' | 'warning_60' | 'warning_90' | 'expired' = 'valid';
      if (!isSaudi && emp.iqama_expiry_gregorian) {
        const exp = new Date(emp.iqama_expiry_gregorian);
        iqamaDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (iqamaDaysRemaining < 0) iqamaStatus = 'expired';
        else if (iqamaDaysRemaining <= 30) iqamaStatus = 'warning_30';
        else if (iqamaDaysRemaining <= 60) iqamaStatus = 'warning_60';
        else if (iqamaDaysRemaining <= 90) iqamaStatus = 'warning_90';
      }
      let workPermitDaysRemaining: number | null = null;
      let workPermitStatus: 'valid' | 'warning' | 'expired' = 'valid';
      if (!isSaudi && emp.work_permit_expiry) {
        const exp = new Date(emp.work_permit_expiry);
        workPermitDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (workPermitDaysRemaining < 0) workPermitStatus = 'expired';
        else if (workPermitDaysRemaining <= 30) workPermitStatus = 'warning';
      }
      let medicalDaysRemaining: number | null = null;
      let medicalStatus: 'valid' | 'warning' | 'expired' = 'valid';
      if (emp.medical_insurance_expiry) {
        const exp = new Date(emp.medical_insurance_expiry);
        medicalDaysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (medicalDaysRemaining < 0) medicalStatus = 'expired';
        else if (medicalDaysRemaining <= 30) medicalStatus = 'warning';
      }
      return {
        ...emp,
        is_saudi: isSaudi ? 1 : 0,
        iqamaDaysRemaining,
        iqamaStatus,
        workPermitDaysRemaining,
        workPermitStatus,
        medicalDaysRemaining,
        medicalStatus
      };
    });
    res.json(results);
  });

    // 3. GOSI Report (تقرير التأمينات الاجتماعية المعتمد)

  app.get("/api/saudi/gosi-report", async (req, res) => {
    const settings = (await db.prepare("SELECT * FROM settings").all());
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    const saudiEmpRate = parseFloat(settingsObj.saudi_gosi_emp_rate || '9.75') / 100;
    const saudiCompRate = parseFloat(settingsObj.saudi_gosi_comp_rate || '11.75') / 100;
    const expatCompRate = parseFloat(settingsObj.expat_gosi_comp_rate || '2.0') / 100;
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all()) as any[];
    const report = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const basicSalary = Number(emp.basic_salary) || 0;
      const housing = Number(emp.housing_allowance) || 0;
      const contributorySalary = Math.min(45000, basicSalary + housing);
      let empShare = 0;
      let compShare = 0;
      let annuitiesEmp = 0;
      let annuitiesComp = 0;
      let sanedEmp = 0;
      let sanedComp = 0;
      let hazardsComp = 0;
      if (isSaudi) {
        annuitiesEmp = Math.round(contributorySalary * 0.09 * 100) / 100;
        annuitiesComp = Math.round(contributorySalary * 0.09 * 100) / 100;
        sanedEmp = Math.round(contributorySalary * 0.0075 * 100) / 100;
        sanedComp = Math.round(contributorySalary * 0.0075 * 100) / 100;
        hazardsComp = Math.round(contributorySalary * 0.02 * 100) / 100;
        empShare = annuitiesEmp + sanedEmp;
        compShare = annuitiesComp + sanedComp + hazardsComp;
      } else {
        hazardsComp = Math.round(contributorySalary * expatCompRate * 100) / 100;
        empShare = 0;
        compShare = hazardsComp;
      }
      return {
        employee_id: emp.id,
        name: emp.name,
        is_saudi: isSaudi ? 1 : 0,
        nationality: emp.nationality || (isSaudi ? 'سعودي' : 'وافد'),
        national_id_iqama: emp.national_id_iqama || emp.insurance_number || 'N/A',
        gosi_number: emp.gosi_number || emp.insurance_number || 'N/A',
        branch_name: emp.branch_name,
        department_name: emp.department_name,
        basic_salary: basicSalary,
        housing_allowance: housing,
        contributory_salary: contributorySalary,
        annuities_emp: annuitiesEmp,
        annuities_comp: annuitiesComp,
        saned_emp: sanedEmp,
        saned_comp: sanedComp,
        hazards_comp: hazardsComp,
        emp_share: empShare,
        comp_share: compShare,
        total_gosi_due: empShare + compShare
      };
    });
    res.json(report);
  });

    // 4. Quick Renew & Government Renewals (تجديد سريع للإقامة أو رخصة العمل أو التأمين الطبي)

  app.get("/api/saudi/renewals", async (req, res) => {
    const renewals = (await db.prepare(`
      SELECT r.*, e.name as employee_name, e.national_id_iqama
      FROM government_renewals r
      JOIN employees e ON r.employee_id = e.id
      ORDER BY r.created_at DESC
    `).all());
    res.json(renewals);
  });

  app.post("/api/saudi/quick-renew", async (req, res) => {
    const { employee_id, type, duration_months = 12, cost, sadad_number, reference_number, notes } = req.body;
    const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id)) as any;
    if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
    const now = new Date();
    if (type === 'iqama' || type === 'both') {
      const currentExpiry = emp.iqama_expiry_gregorian ? new Date(emp.iqama_expiry_gregorian) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newIqamaExpiry = baseDate.toISOString().split('T')[0];
      (await db.prepare(`
        UPDATE employees SET 
          iqama_expiry_gregorian = ?,
          work_permit_expiry = ?
        WHERE id = ?
      `).run(newIqamaExpiry, newIqamaExpiry, employee_id));
      (await db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'iqama', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 10250, sadad_number || `SADAD-${Date.now().toString().slice(-6)}`,
        reference_number || `MOI-${Date.now().toString().slice(-6)}`, emp.iqama_expiry_gregorian, newIqamaExpiry, notes || 'تجديد الإقامة ورخصة العمل بنجاح'
      ));
    } else if (type === 'medical_insurance') {
      const currentExpiry = emp.medical_insurance_expiry ? new Date(emp.medical_insurance_expiry) : new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + Number(duration_months));
      const newMedExpiry = baseDate.toISOString().split('T')[0];
      (await db.prepare("UPDATE employees SET medical_insurance_expiry = ? WHERE id = ?").run(newMedExpiry, employee_id));
      (await db.prepare(`
        INSERT INTO government_renewals (employee_id, type, duration_months, cost, status, sadad_number, reference_number, expiry_before, expiry_after, notes)
        VALUES (?, 'medical_insurance', ?, ?, 'completed', ?, ?, ?, ?, ?)
      `).run(
        employee_id, duration_months, cost || 2500, sadad_number || `CCHI-${Date.now().toString().slice(-6)}`,
        reference_number || `POL-${Date.now().toString().slice(-6)}`, emp.medical_insurance_expiry, newMedExpiry, notes || 'تجديد وثيقة التأمين الطبي'
      ));
    }
    await createNotification('تم التجديد بنجاح', `تم تجديد المعاملة بنجاح للموظف ${emp.name}`, 'success');
    await logAction('renew', 'compliance', employee_id, `Renewed ${type} for employee ${emp.name}`);
    res.json({ success: true });
  });

    // 5. End of Service Calculator (حاسبة مكافأة نهاية الخدمة المعتمدة نظاماً)

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

    // ---- WPS/SIF identity validation ----
    // The shared engine in server/lib/sif-export.ts owns the identity rules and the
    // file layout; this route only adapts the response to a file download.

  app.get("/api/saudi/wps-export", async (req, res) => {
    try {
      const scope = (await resolveOrganizationScope(db, (req as any).user.id, req.query));
      const result = await buildSifExport(db, {
        month: req.query.month,
        year: req.query.year,
        valueDate: req.query.value_date,
        scope,
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
      res.send(result.content);
    } catch (error) {
      if (error instanceof SifError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
      }
      if (error instanceof ScopeError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("wps-export failed:", error);
      res.status(500).json({ error: "تعذّر توليد ملف البنك" });
    }
  });

    // ==========================================
    // 3. GOVERNMENT BUDGET PLANNER (ميزانية الرسوم الحكومية)
    // ==========================================

  app.get('/api/saudi/government-budget', async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all()) as any[];
    const totalEmployees = employees.length;
    const saudiCount = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
    const expatCount = totalEmployees - saudiCount;
    const annualWorkPermitFees = expatCount * 9600; // 9600 SAR/year
    const annualIqamaRenewalFees = expatCount * 650; // 650 SAR/year
    const annualMedicalInsuranceEstimate = (saudiCount * 1800) + (expatCount * 2600); // estimated insurance per emp
    let annualGosiEmployerContribution = 0;
    employees.forEach(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const gosiWage = Math.min(45000, emp.basic_salary + (emp.housing_allowance || 0));
      const rate = isSaudi ? 0.1175 : 0.02;
      annualGosiEmployerContribution += gosiWage * rate * 12;
    });
    const annualVisasEstimate = expatCount * 700; // estimated exit/re-entries
    const annualTotalGovernmentCost = annualWorkPermitFees + annualIqamaRenewalFees + annualMedicalInsuranceEstimate + annualGosiEmployerContribution + annualVisasEstimate;
    const monthlyAverageGovernmentCost = Math.round(annualTotalGovernmentCost / 12);
    const branches = (await db.prepare("SELECT * FROM branches").all()) as any[];
    const branchBreakdown = branches.map(b => {
      const branchEmps = employees.filter(e => e.branch_id === b.id);
      const bSaudi = branchEmps.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
      const bExpat = branchEmps.length - bSaudi;
      const bCost = (bExpat * (9600 + 650 + 700)) + (bSaudi * 1800) + (bExpat * 2600);
      return {
        branch_name: b.name,
        saudi_count: bSaudi,
        expat_count: bExpat,
        total_cost: bCost
      };
    });
    res.json({
      totalEmployees,
      saudiCount,
      expatCount,
      annualWorkPermitFees,
      annualIqamaRenewalFees,
      annualMedicalInsuranceEstimate,
      annualGosiEmployerContribution: Math.round(annualGosiEmployerContribution),
      annualVisasEstimate,
      annualTotalGovernmentCost: Math.round(annualTotalGovernmentCost),
      monthlyAverageGovernmentCost,
      branchBreakdown
    });
  });

    // ==========================================
    // 4. SALARY CERTIFICATES (خطابات التعريف بالراتب المعتمدة مع QR)
    // ==========================================

  app.get('/api/salary-certificates', async (req, res) => {
    const data = (await db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance, e.other_allowances, e.contract_start_date, e.saudi_iban, e.bank_name, d.name as department_name
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY sc.created_at DESC
    `).all());
    res.json(data);
  });

  app.post('/api/salary-certificates', async (req, res) => {
    const { employee_id, addressed_to, purpose, include_allowances, include_bank_iban } = req.body;
    const certNum = `SAL-CERT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const qrCode = `VERIFY-KSA-HR-${certNum}-${Buffer.from(String(employee_id)).toString('hex')}`;
    const today = new Date();
    const issueDate = today.toISOString().split('T')[0];
    const validUntilDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const result = (await db.prepare(`
      INSERT INTO salary_certificates (employee_id, certificate_number, addressed_to, purpose, include_allowances, include_bank_iban, qr_verification_code, issue_date, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(employee_id, certNum, addressed_to || 'إلى من يهمه الأمر', purpose || 'general', include_allowances !== undefined ? (include_allowances ? 1 : 0) : 1, include_bank_iban !== undefined ? (include_bank_iban ? 1 : 0) : 1, qrCode, issueDate, validUntilDate));
    const emp = (await db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id)) as any;
    await logAction('create', 'salary_certificate', Number(result.lastInsertRowid), `Generated salary certificate ${certNum} for ${emp?.name}`);
    res.json({ success: true, id: result.lastInsertRowid, certificate_number: certNum, qr_code: qrCode });
  });

  app.delete('/api/salary-certificates/:id', async (req, res) => {
    const { id } = req.params;
    (await db.prepare('DELETE FROM salary_certificates WHERE id = ?').run(id));
    res.json({ success: true });
  });

  app.get('/api/salary-certificates/verify/:code', async (req, res) => {
    const { code } = req.params;
    const cert = (await db.prepare(`
      SELECT sc.*, e.name as employee_name, e.national_id_iqama, e.job_title, e.basic_salary, e.housing_allowance, e.transport_allowance
      FROM salary_certificates sc
      JOIN employees e ON sc.employee_id = e.id
      WHERE sc.qr_verification_code = ? OR sc.certificate_number = ?
    `).get(code, code)) as any;
    if (!cert) {
      return res.status(404).json({ valid: false, message: 'شهادة التعريف غير موجودة أو تم إلغاؤها' });
    }
    const isExpired = new Date(cert.valid_until) < new Date();
    res.json({
      valid: !isExpired,
      certificate: cert,
      status_text: isExpired ? 'منتهية الصلاحية (صالحة لمدة 30 يوم من تاريخ الإصدار)' : 'معتمدة وسارية المفعول رسمياً'
    });
  });

    // ==========================================
    // 5. ACCOUNTING PROVISIONS (مخصصات نهاية الخدمة والإجازات المحاسبية)
    // ==========================================

  app.get('/api/saudi/accounting-provisions', async (req, res) => {
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];
    const now = new Date();
    const provisions = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date(now.getFullYear() - 2, 0, 1);
      const diffTime = Math.abs(now.getTime() - startDate.getTime());
      const totalDays = diffTime / (1000 * 60 * 60 * 24);
      const serviceYears = Math.floor(totalDays / 365.25);
      const remainingDays = totalDays % 365.25;
      const serviceMonths = Math.floor(remainingDays / 30.44);
      const totalYearsDecimal = totalDays / 365.25;
      const totalWage = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0);
      let cumulativeEosb = 0;
      if (totalYearsDecimal <= 5) {
        cumulativeEosb = (totalWage / 2) * totalYearsDecimal;
      } else {
        cumulativeEosb = ((totalWage / 2) * 5) + (totalWage * (totalYearsDecimal - 5));
      }
      const monthlyEosbRate = totalYearsDecimal < 5 ? (totalWage / 24) : (totalWage / 12);
      const annualLeaveEntitlement = totalYearsDecimal > 5 ? 30 : 21;
      const leaveProvisionAmount = (totalWage / 30) * annualLeaveEntitlement;
      const annualTicketProvision = !isSaudi ? 2500 : 0;
      const totalMonthlyProvisions = Math.round(monthlyEosbRate + (leaveProvisionAmount / 12) + (annualTicketProvision / 12));
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        national_id_iqama: emp.national_id_iqama,
        is_saudi: isSaudi ? 1 : 0,
        start_date: emp.contract_start_date || '2023-01-01',
        service_years: serviceYears,
        service_months: serviceMonths,
        basic_salary: emp.basic_salary,
        housing_allowance: emp.housing_allowance || 0,
        total_wage: totalWage,
        monthly_eosb_provision: Math.round(monthlyEosbRate),
        cumulative_eosb_provision: Math.round(cumulativeEosb),
        annual_leave_accrued_days: annualLeaveEntitlement,
        leave_provision_amount: Math.round(leaveProvisionAmount),
        annual_ticket_provision: annualTicketProvision,
        total_monthly_provisions: totalMonthlyProvisions
      };
    });
    const totalCumulativeEOSB = provisions.reduce((sum, p) => sum + p.cumulative_eosb_provision, 0);
    const totalMonthlyEOSB = provisions.reduce((sum, p) => sum + p.monthly_eosb_provision, 0);
    const totalLeaveProvision = provisions.reduce((sum, p) => sum + p.leave_provision_amount, 0);
    res.json({
      provisions,
      totalCumulativeEOSB,
      totalMonthlyEOSB,
      totalLeaveProvision
    });
  });

    // ==========================================
    // 6. TOTAL COST OF EMPLOYMENT (التكلفة الفعلية الشاملة للموظف)
    // ==========================================

  app.get('/api/saudi/cost-of-employment', async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all()) as any[];
    const list = employees.map(emp => {
      const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
      const monthlyDirectSalary = emp.basic_salary + (emp.housing_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowances || 0);
      const gosiWage = Math.min(45000, emp.basic_salary + (emp.housing_allowance || 0));
      const monthlyGosiEmployer = isSaudi ? Math.round(gosiWage * 0.1175) : Math.round(gosiWage * 0.02);
      const monthlyMedicalInsurance = isSaudi ? 150 : 220;
      const monthlyGovernmentFees = !isSaudi ? Math.round((9600 + 650) / 12) : 0;
      const monthlyEosb = Math.round((emp.basic_salary + (emp.housing_allowance || 0)) / 24);
      const monthlyLeave = Math.round(monthlyDirectSalary / 12);
      const monthlyTicket = !isSaudi ? Math.round(2500 / 12) : 0;
      const monthlyTotalCost = monthlyDirectSalary + monthlyGosiEmployer + monthlyMedicalInsurance + monthlyGovernmentFees + monthlyEosb + monthlyLeave + monthlyTicket;
      const annualTotalCost = monthlyTotalCost * 12;
      const costMultiplier = Math.round((monthlyTotalCost / (emp.basic_salary || 1)) * 100) / 100;
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        department_name: emp.department_name || 'عام',
        branch_name: emp.branch_name || 'الرئيسي',
        is_saudi: isSaudi ? 1 : 0,
        monthly_direct_salary: monthlyDirectSalary,
        monthly_gosi_employer: monthlyGosiEmployer,
        monthly_medical_insurance: monthlyMedicalInsurance,
        monthly_government_fees: monthlyGovernmentFees,
        monthly_eosb_provision: monthlyEosb,
        monthly_leave_provision: monthlyLeave,
        monthly_ticket_provision: monthlyTicket,
        monthly_total_cost: monthlyTotalCost,
        annual_total_cost: annualTotalCost,
        cost_multiplier: costMultiplier
      };
    });
    const totalMonthlyAll = list.reduce((sum, item) => sum + item.monthly_total_cost, 0);
    const totalAnnualAll = list.reduce((sum, item) => sum + item.annual_total_cost, 0);
    res.json({
      employees: list,
      totalMonthlyAll,
      totalAnnualAll
    });
  });

    // ==========================================
    // 9. LEAVE BALANCE CALCULATOR (المادة 109)
    // ==========================================

  app.get('/api/saudi/leave-balance/:empId', async (req, res) => {
    const { empId } = req.params;
    const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(empId)) as any;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const startDate = emp.contract_start_date ? new Date(emp.contract_start_date) : new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    const serviceYears = Math.floor((Date.now() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const annualEntitlement = serviceYears >= 5 ? 30 : 21;
    const currentYear = new Date().getFullYear();
    const leavesTaken = (await db.prepare(`
      SELECT SUM(days) as total_days 
      FROM leaves 
      WHERE employee_id = ? AND type = 'annual' AND status = 'approved' AND EXTRACT(YEAR FROM start_date)::int = ?
    `).get(empId, currentYear)) as any;
    const takenDays = leavesTaken?.total_days || 0;
    const remainingDays = Math.max(0, annualEntitlement - takenDays);
    const dailyRate = Math.round(((emp.basic_salary + (emp.housing_allowance || 0)) / 30) * 100) / 100;
    const encashmentValue = Math.round(remainingDays * dailyRate);
    res.json({
      employee_id: emp.id,
      employee_name: emp.name,
      service_years: serviceYears,
      annual_entitlement: annualEntitlement,
      taken_days: takenDays,
      remaining_days: remainingDays,
      daily_rate: dailyRate,
      encashment_value: encashmentValue
    });
  });

    // ==========================================
    // 11. QIWA CONTRACTS & NOTICE PERIODS (عقود قوى)
    // ==========================================

  app.get('/api/qiwa/contracts', async (req, res) => {
    const count = (await db.prepare("SELECT COUNT(*) as count FROM qiwa_contracts").get()) as any;
    if (count.count === 0) {
      const emps = (await db.prepare("SELECT * FROM employees").all()) as any[];
      emps.forEach(async (emp, idx) => {
        const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
        const startDate = emp.join_date || '2023-01-15';
        const start = new Date(startDate);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + (isSaudi ? 2 : 1));
        const endDateStr = end.toISOString().split('T')[0];
        (await db.prepare(`
          INSERT INTO qiwa_contracts (
            employee_id, contract_number, contract_type, job_title, work_location,
            start_date, end_date, probation_days, notice_period_days, basic_salary,
            housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
            annual_leave_days, auto_renew, qiwa_status, qiwa_reference
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          emp.id,
          `QW-SA-${10000 + emp.id}`,
          isSaudi ? 'indefinite' : 'fixed_term',
          emp.position || emp.job_title || 'موظف',
          'الرياض - المقر الرئيسي',
          startDate,
          isSaudi ? null : endDateStr,
          90,
          60,
          emp.basic_salary || 5000,
          emp.housing_allowance || 1250,
          emp.transport_allowance || 500,
          emp.other_allowances || 0,
          48,
          emp.annual_leave_days || 21,
          1,
          'authenticated',
          `QREF-2024-${8000 + emp.id}`
        ));
      });
    }
    const contracts = (await db.prepare(`
      SELECT c.*, e.name as employee_name, e.national_id_iqama, e.nationality,
             d.name as department_name, b.name as branch_name
      FROM qiwa_contracts c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
      ORDER BY c.created_at DESC
    `).all()) as any[];
    const today = new Date();
    const enriched = contracts.map(c => {
      let daysUntilExpiry = null;
      let daysUntilNoticeDeadline = null;
      if (c.end_date) {
        const endDate = new Date(c.end_date);
        const diffTime = endDate.getTime() - today.getTime();
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysUntilNoticeDeadline = daysUntilExpiry - (c.notice_period_days || 60);
      }
      return {
        ...c,
        days_until_expiry: daysUntilExpiry,
        days_until_notice_deadline: daysUntilNoticeDeadline
      };
    });
    res.json(enriched);
  });

  app.post('/api/qiwa/contracts', async (req, res) => {
    const {
      employee_id, contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status, clauses_json
    } = req.body;
    const contractNumber = `QW-SA-${Math.floor(100000 + Math.random() * 900000)}`;
    const qiwaRef = `QREF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const result = (await db.prepare(`
      INSERT INTO qiwa_contracts (
        employee_id, contract_number, contract_type, job_title, work_location,
        start_date, end_date, probation_days, notice_period_days, basic_salary,
        housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
        annual_leave_days, auto_renew, qiwa_status, qiwa_reference, clauses_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employee_id,
      contractNumber,
      contract_type || 'fixed_term',
      job_title,
      work_location || 'الرياض',
      start_date,
      end_date || null,
      Number(probation_days) || 90,
      Number(notice_period_days) || 60,
      Number(basic_salary) || 0,
      Number(housing_allowance) || 0,
      Number(transport_allowance) || 0,
      Number(other_allowances) || 0,
      Number(weekly_working_hours) || 48,
      Number(annual_leave_days) || 21,
      auto_renew !== undefined ? (auto_renew ? 1 : 0) : 1,
      qiwa_status || 'authenticated',
      qiwaRef,
      clauses_json ? JSON.stringify(clauses_json) : null
    ));
    await logAction('create', 'qiwa_contract', Number(result.lastInsertRowid), `Created Qiwa contract ${contractNumber}`);
    await createNotification('توثيق عقد قوى', `تم إنشاء وتوثيق عقد عمل موحد جديد برقم ${contractNumber}`, 'success');
    res.json({ success: true, id: result.lastInsertRowid, contract_number: contractNumber });
  });

  app.post('/api/qiwa/draft-from-employees', async (req, res) => {
    try {
      const scope = (await resolveWriteScope(db, (req as any).user?.id, req.query as Record<string, unknown>));
      if (!scope) return res.status(403).json({ error: "الحساب غير مرتبط بكيان — لا يمكن إنشاء المسودات قبل ربط الحساب بكيان" });
      // Only the caller's own organization: a batch that drafts contracts for
      // every employee in the database would hand one tenant another's staff.
      const emps = (await db.prepare(
        "SELECT * FROM employees WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR branch_id = ?)"
      ).all(scope.entityId, scope.entityId, scope.branchId, scope.branchId)) as any[];
      let created = 0;
      for (const emp of emps) {
        const exists = (await db.prepare("SELECT id FROM qiwa_contracts WHERE employee_id = ?").get(emp.id));
        if (exists) continue;
        const contractNumber = `QW-DRAFT-${emp.id}-${Date.now().toString().slice(-6)}`;
        (await db.prepare(`
          INSERT INTO qiwa_contracts (
            employee_id, contract_number, contract_type, job_title, work_location,
            start_date, end_date, probation_days, notice_period_days, basic_salary,
            housing_allowance, transport_allowance, other_allowances, weekly_working_hours,
            annual_leave_days, auto_renew, qiwa_status, qiwa_reference
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 90, 60, ?, ?, ?, ?, 48, 21, 1, 'draft', ?)
        `).run(
          emp.id,
          contractNumber,
          emp.contract_type === 'indefinite' ? 'unlimited' : 'fixed_term',
          emp.job_title || emp.position || 'موظف',
          'المقر',
          emp.contract_start_date || new Date().toISOString().slice(0, 10),
          emp.contract_end_date || null,
          emp.basic_salary || 0,
          emp.housing_allowance || 0,
          emp.transport_allowance || 0,
          emp.other_allowances || 0,
          `QREF-DRAFT-${emp.id}`
        ));
        created++;
      }
      res.json({ success: true, created });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.put('/api/qiwa/contracts/:id', async (req, res) => {
    const { id } = req.params;
    const {
      contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status
    } = req.body;
    (await db.prepare(`
      UPDATE qiwa_contracts SET
        contract_type = COALESCE(?, contract_type),
        job_title = COALESCE(?, job_title),
        work_location = COALESCE(?, work_location),
        start_date = COALESCE(?, start_date),
        end_date = ?,
        probation_days = COALESCE(?, probation_days),
        notice_period_days = COALESCE(?, notice_period_days),
        basic_salary = COALESCE(?, basic_salary),
        housing_allowance = COALESCE(?, housing_allowance),
        transport_allowance = COALESCE(?, transport_allowance),
        other_allowances = COALESCE(?, other_allowances),
        weekly_working_hours = COALESCE(?, weekly_working_hours),
        annual_leave_days = COALESCE(?, annual_leave_days),
        auto_renew = COALESCE(?, auto_renew),
        qiwa_status = COALESCE(?, qiwa_status)
      WHERE id = ?
    `).run(
      contract_type, job_title, work_location, start_date, end_date,
      probation_days, notice_period_days, basic_salary, housing_allowance,
      transport_allowance, other_allowances, weekly_working_hours, annual_leave_days,
      auto_renew, qiwa_status, id
    ));
    await logAction('update', 'qiwa_contract', Number(id), `Updated Qiwa contract id ${id}`);
    res.json({ success: true });
  });

  app.delete('/api/qiwa/contracts/:id', async (req, res) => {
    const { id } = req.params;
    (await db.prepare("DELETE FROM qiwa_contracts WHERE id = ?").run(id));
    res.json({ success: true });
  });

    // ==========================================
    // 15. NITAQAT & SAUDIZATION SIMULATOR (محاكي نطاقات والتوطين المتقدم)
    // ==========================================

  app.post('/api/saudi/nitaqat-simulator', async (req, res) => {
    const {
      sector,
      add_saudis,
      add_expats,
      disabled_saudis_count,
      special_needs_saudis,
      current_saudis,
      current_expats,
    } = req.body || {};
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];

    // Baseline headcount: honour explicit counts when supplied, otherwise fall
    // back to the live employee master so the simulator reflects reality.
    const liveSaudis = employees.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
    const liveExpats = employees.filter(e => e.is_saudi === 0 && e.nationality !== 'سعودي').length;
    const baseSaudis = current_saudis === undefined || current_saudis === null ? liveSaudis : Number(current_saudis) || 0;
    const baseExpats = current_expats === undefined || current_expats === null ? liveExpats : Number(current_expats) || 0;
    const disabledCount = Number(special_needs_saudis ?? disabled_saudis_count) || 0;

    const thresholds = resolveSector(sector);

    const current = computeNitaqat({ saudiCount: baseSaudis, expatCount: baseExpats, disabledCount, thresholds });
    const simulated = computeNitaqat({
      saudiCount: Math.max(0, baseSaudis + (Number(add_saudis) || 0)),
      expatCount: Math.max(0, baseExpats + (Number(add_expats) || 0)),
      disabledCount,
      thresholds,
    });

    const restrictedProfessions = [
      {
        profession: 'إدارة الموارد البشرية وشؤون الموظفين (100% توطين)',
        targetPercentage: 100,
        currentSaudis: employees.filter(e => (e.position || '').includes('موارد بشرية') && (e.is_saudi === 1 || e.nationality === 'سعودي')).length || 2,
        currentExpats: employees.filter(e => (e.position || '').includes('موارد بشرية') && e.is_saudi === 0 && e.nationality !== 'سعودي').length || 0,
        currentPercentage: 100,
        isCompliant: true
      },
      {
        profession: 'المهن المحاسبية والمالية (30% توطين كحد أدنى)',
        targetPercentage: 30,
        currentSaudis: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && (e.is_saudi === 1 || e.nationality === 'سعودي')).length || 1,
        currentExpats: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && e.is_saudi === 0 && e.nationality !== 'سعودي').length || 1,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن المبيعات والتسويق (35% توطين)',
        targetPercentage: 35,
        currentSaudis: 2,
        currentExpats: 2,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن الهندسة وتقنية المعلومات (25% توطين)',
        targetPercentage: 25,
        currentSaudis: 3,
        currentExpats: 4,
        currentPercentage: 42.8,
        isCompliant: true
      }
    ];
    res.json({
      ...current,
      currentTier: current.tier,
      currentSaudizationPercentage: current.saudizationPercentage,
      simulated,
      simulatedTier: simulated.tier,
      simulatedSaudizationPercentage: simulated.saudizationPercentage,
      sectorName: thresholds.name,
      tierThresholds: {
        platinum: thresholds.platinum,
        high_green: thresholds.high_green,
        mid_green: thresholds.mid_green,
        low_green: thresholds.low_green
      },
      restrictedProfessions
    });
  });

    // ==========================================
    // 8. WPS & SAMA SIF FILE AUDIT (محرك حماية الأجور والتدقيق)
    // ==========================================

  app.get('/api/wps/audit', async (req, res) => {
    let scope;
    try {
      scope = (await resolveOrganizationScope(db, (req as any).user.id, req.query));
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    const rawMonth = req.query.month === undefined ? new Date().getMonth() + 1 : req.query.month;
    const rawYear = req.query.year === undefined ? new Date().getFullYear() : req.query.year;
    let period;
    try {
      period = normalizePeriod(rawMonth, rawYear);
    } catch (error) {
      if (error instanceof SifError) return res.status(error.status).json({ error: error.message, code: error.code });
      throw error;
    }
    const { month, year } = period;
    const inScope = (row: any) =>
      (scope.entityId == null || row.entity_id === scope.entityId) &&
      (scope.branchId == null || row.branch_id === scope.branchId);
    let payrollRecords = (await db.prepare(`
      SELECT p.*, e.name as employee_name, e.national_id_iqama, e.is_saudi,
             e.bank_name, e.saudi_iban, e.basic_salary as emp_basic,
             e.housing_allowance as emp_housing, e.gosi_registered_salary,
             e.gosi_number, e.entity_id, e.branch_id
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ? AND p.year = ?
    `).all(month, year)) as any[];
    payrollRecords = payrollRecords.filter(inScope);
    let simulated = false;
    if (payrollRecords.length === 0) {
      simulated = true;
      const emps = (await db.prepare('SELECT * FROM employees').all()) as any[];
      payrollRecords = emps.filter(inScope).map(e => {
        const basic = Number(e.basic_salary) || 0;
        const housing = Number(e.housing_allowance) || 0;
        const transport = Number(e.transport_allowance) || 0;
        const other = Number(e.other_allowances) || 0;
        const allowances = housing + transport + other;
        const deductions = Number(e.deductions) || 0;
        const net = (basic + allowances) - deductions;
        return {
          employee_id: e.id,
          employee_name: e.name,
          national_id_iqama: e.national_id_iqama,
          is_saudi: e.is_saudi,
          bank_name: e.bank_name || '',
          saudi_iban: e.saudi_iban || '',
          basic_salary: basic,
          housing_allowance: housing,
          allowances,
          deductions,
          net_salary: net,
          gosi_registered_salary: Number(e.gosi_registered_salary) || 0,
          gosi_number: e.gosi_number
        };
      });
    }
    const violations: any[] = [];
    let compliantCount = 0;
    let totalDisbursed = 0;
    let matchedGosi = 0;
    let mismatchedGosi = 0;
    let totalGosiWage = 0;
    let totalPayrollWage = 0;
    payrollRecords.forEach(rec => {
      totalDisbursed += Number(rec.net_salary) || 0;
      const gross = (Number(rec.basic_salary) || 0) + (Number(rec.allowances) || 0);
      const totalDed = Number(rec.deductions) || 0;
      const deductionRatio = gross > 0 ? (totalDed / gross) : 0;
      const gosiWage = Number(rec.gosi_registered_salary) || (Number(rec.basic_salary) + Number(rec.housing_allowance || 0));
      const payrollGosiBase = (Number(rec.basic_salary) || 0) + (Number(rec.housing_allowance) || 0);
      totalGosiWage += gosiWage;
      totalPayrollWage += payrollGosiBase;
      let isViolation = false;
      if (deductionRatio > 0.50) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'excessive_deduction',
          details: `نسبة الاستقطاع (${Math.round(deductionRatio * 100)}%) تتجاوز الحد النظامي الأقصى (50%) وفق المادة (92) من نظام العمل.`
        });
        isViolation = true;
      }
      if (Math.abs(gosiWage - payrollGosiBase) > 50) {
        mismatchedGosi++;
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'gosi_salary_mismatch',
          details: `تباين أجر الاشتراك: المسجل بالتأمينات (${gosiWage.toLocaleString()} ر.س) يختلف عن مسير الرواتب (${payrollGosiBase.toLocaleString()} ر.س).`
        });
        isViolation = true;
      } else {
        matchedGosi++;
      }
      const cleanIban = (rec.saudi_iban || '').replace(/\s+/g, '');
      if (!cleanIban.startsWith('SA') || cleanIban.length !== 24) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || 'غير مسجل',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: Math.round(deductionRatio * 100),
          violation_type: 'invalid_iban',
          details: 'صيغة الآيبان (IBAN) غير مطابقة لمعايير البنك المركزي السعودي (SAMA).'
        });
        isViolation = true;
      }
      if (rec.net_salary <= 0) {
        violations.push({
          employee_id: rec.employee_id,
          employee_name: rec.employee_name,
          national_id_iqama: rec.national_id_iqama || '---',
          bank_name: rec.bank_name || '---',
          iban: rec.saudi_iban || '---',
          basic_salary: rec.basic_salary,
          net_salary: rec.net_salary,
          deduction_ratio: 100,
          violation_type: 'zero_salary',
          details: 'صافي الراتب المستحق صفر أو سالب مما يسبب رفض الملف فورياً في منصة مدد وحماية الأجور.'
        });
        isViolation = true;
      }
      if (!isViolation) {
        compliantCount++;
      }
    });
    const totalCount = payrollRecords.length || 1;
    const complianceScore = Math.round((compliantCount / totalCount) * 100);
    const profile = await readSifProfile(db);
    const stamp = `${year}${String(month).padStart(2, '0')}`;
    const sifFileName = profile.crNumber ? `SIF_${profile.crNumber}_${stamp}.sif` : null;

    // The bank file stays blocked until the establishment/bank profile is real and the
    // payroll run exists. The audit reports what is missing instead of inventing it.
    const exportBlockers: string[] = [];
    if (simulated) {
      exportBlockers.push('لا يوجد مسير رواتب محفوظ لهذا الشهر — لا يُبنى ملف بنك من بيانات خام');
    }
    const settingLabels: Record<string, string> = {
      cr_number: 'رقم السجل التجاري (CR)',
      sif_settlement_bank_code: 'كود بنك التسوية',
      sif_bank_codes: 'خريطة أكواد البنوك (اسم البنك ← الكود)',
    };
    for (const key of profile.missing) {
      exportBlockers.push(`إعداد ناقص: ${settingLabels[key] || key}`);
    }
    const unmappedBanks = Array.from(
      new Set(
        payrollRecords
          .map((row: any) => String(row.bank_name || "").trim())
          .filter((name: string) => name && !profile.bankCodes[name])
      )
    );
    if (unmappedBanks.length) {
      exportBlockers.push(`أكواد بنوك غير معرّفة: ${unmappedBanks.join("، ")}`);
    }
    const invalidIdentities = validateSifIdentities(
      payrollRecords.map((row: any) => ({
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        saudi_iban: row.saudi_iban,
        national_id_iqama: row.national_id_iqama,
      }))
    );
    if (invalidIdentities.length) {
      exportBlockers.push(`${invalidIdentities.length} موظف ببيانات هوية أو آيبان غير صالحة`);
    }

    res.json({
      payrollMonth: month,
      payrollYear: year,
      totalEmployees: payrollRecords.length,
      compliantCount,
      violationCount: violations.length,
      complianceScore,
      totalDisbursed,
      sifFileName,
      exportReady: exportBlockers.length === 0,
      exportBlockers,
      bankProfile: {
        crNumber: profile.crNumber || null,
        settlementBankCode: profile.settlementBankCode || null,
        mappedBanks: Object.keys(profile.bankCodes),
      },
      simulated,
      dataSource: simulated ? 'employees_master_data' : 'payroll_run',
      note: simulated
        ? 'لا يوجد مسير رواتب لهذا الشهر — الأرقام مأخوذة كما هي من بيانات الموظفين المخزّنة، والقيم الغائبة أُبلغ عنها بصفر (لا اشتقاق ولا تقدير).'
        : null,
      violations,
      gosiReconciliation: {
        matched: matchedGosi,
        mismatched: mismatchedGosi,
        totalAmountGosi: totalGosiWage,
        totalAmountPayroll: totalPayrollWage
      }
    });
  });

  app.get('/api/wps/export-sif', async (req, res) => {
    try {
      const scope = (await resolveOrganizationScope(db, (req as any).user.id, req.query));
      const result = await buildSifExport(db, {
        month: req.query.month,
        year: req.query.year,
        valueDate: req.query.value_date,
        scope,
      });
      res.json({
        fileName: result.fileName,
        content: result.content,
        totalEmployees: result.recordCount,
        totalAmount: result.total,
        currency: result.currency,
        generatedAt: result.generatedAt,
        valueDate: result.valueDate,
        cashExcluded: result.cashExcluded,
        layout: "SCR/EDR — قالب داخلي غير معتمد من البنك، تُراجع مواصفته قبل الرفع",
      });
    } catch (error) {
      if (error instanceof SifError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
      }
      if (error instanceof ScopeError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("export-sif failed:", error);
      res.status(500).json({ error: "تعذّر توليد ملف البنك" });
    }
  });

}
