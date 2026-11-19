import db from "../../config/postgres";
import express from "express";
import { isSaudiEmployee } from "../../lib/saudi-employee";

/**
 * Government budget planner: the annual cost of the establishment's government
 * fees (work permits, residence renewals, medical insurance, GOSI, visas),
 * broken down per branch.
 */
export function registerGovernmentBudget(app: express.Express) {
  app.get('/api/saudi/government-budget', async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, b.name as branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all()) as any[];
    const totalEmployees = employees.length;
    const saudiCount = employees.filter(e => isSaudiEmployee(e)).length;
    const expatCount = totalEmployees - saudiCount;
    const annualWorkPermitFees = expatCount * 9600; // 9600 SAR/year
    const annualIqamaRenewalFees = expatCount * 650; // 650 SAR/year
    const annualMedicalInsuranceEstimate = (saudiCount * 1800) + (expatCount * 2600); // estimated insurance per emp
    let annualGosiEmployerContribution = 0;
    employees.forEach(emp => {
      const isSaudi = isSaudiEmployee(emp);
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
      const bSaudi = branchEmps.filter(e => isSaudiEmployee(e)).length;
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
}
