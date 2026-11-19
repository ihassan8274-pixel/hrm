import db from "../../config/postgres";
import express from "express";
import { isSaudiEmployee } from "../../lib/saudi-employee";

/**
 * Accounting provisions and the real cost of employment.
 *
 * The provisions accrue the end-of-service and leave liability per employee;
 * the cost view turns a salary into the amount the establishment actually pays
 * for that employee, including the government charges.
 */
export function registerAccountingProvisions(app: express.Express) {
  app.get('/api/saudi/accounting-provisions', async (req, res) => {
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];
    const now = new Date();
    const provisions = employees.map(emp => {
      const isSaudi = isSaudiEmployee(emp);
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
}

export function registerCostOfEmployment(app: express.Express) {
  app.get('/api/saudi/cost-of-employment', async (req, res) => {
    const employees = (await db.prepare(`
      SELECT e.*, d.name as department_name, b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON e.branch_id = b.id
    `).all()) as any[];
    const list = employees.map(emp => {
      const isSaudi = isSaudiEmployee(emp);
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
}
