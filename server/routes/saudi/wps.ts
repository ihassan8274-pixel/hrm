import db from "../../config/postgres";
import express from "express";
import { buildSifExport, readSifProfile, normalizePeriod, validateSifIdentities, SifError } from "../../lib/sif-export";
import { resolveOrganizationScope, ScopeError } from "../../lib/organization-scope";
import { log } from "../../lib/logger";

/**
 * WPS / SAMA protection of wages.
 *
 * The shared engine in server/lib/sif-export.ts owns the identity rules and the
 * file layout; these routes only adapt the response to a file download, a JSON
 * payload or an audit report.
 */
export function registerSifDownload(app: express.Express) {
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
      log.error("wps-export failed:", error);
      res.status(500).json({ error: "تعذّر توليد ملف البنك" });
    }
  });
}

export function registerWpsAudit(app: express.Express) {
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
      log.error("export-sif failed:", error);
      res.status(500).json({ error: "تعذّر توليد ملف البنك" });
    }
  });
}
