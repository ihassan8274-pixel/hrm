import db from "../../config/postgres";
import express from "express";

/**
 * Annual leave balance and its cash value (Article 109).
 *
 * The entitlement is 21 days, 30 from five years of service; the taken days are
 * the approved annual leave of the current year.
 */
export function registerLeaveBalance(app: express.Express) {
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
}
