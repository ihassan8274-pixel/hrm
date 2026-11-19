import db from "../../config/postgres";
import express from "express";
import { isSaudiEmployee } from "../../lib/saudi-employee";

/**
 * Compliance overview for the Saudi establishment.
 *
 * The summary card aggregates headcount, the Nitaqat band, the documents that
 * expired or expire soon, and the monthly GOSI cost. The table behind it
 * lists every employee with the days left on each of their documents.
 */

export function registerComplianceSummary(app: express.Express) {
  app.get("/api/saudi/compliance-summary", async (req, res) => {
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];
    const totalEmployees = employees.length;
    const saudiEmployees = employees.filter(e => isSaudiEmployee(e) || e.nationality === 'سعودية').length;
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
      const isSaudi = isSaudiEmployee(emp);
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
}

export function registerExpiringDocuments(app: express.Express) {
  app.get("/api/saudi/expiring-documents", async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name, d.name as department_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
    `).all()) as any[];
    const now = new Date();
    const results = employees.map(emp => {
      const isSaudi = isSaudiEmployee(emp);
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
}
