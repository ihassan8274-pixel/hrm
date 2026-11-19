import db from "../../config/postgres";
import express from "express";
import { isSaudiEmployee } from "../../lib/saudi-employee";

/**
 * The GOSI (social insurance) contribution report, per employee.
 *
 * Saudi employees contribute on annuities and SANED; expatriates contribute
 * on occupational hazards only. The contributory wage is capped at 45,000 SAR.
 */
export function registerGosiReport(app: express.Express) {
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
      const isSaudi = isSaudiEmployee(emp);
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
}
