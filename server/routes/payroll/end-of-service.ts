import db from "../../config/postgres";
import express from "express";
import { CountryRulesService } from "../../../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../../../src/lib/payroll/PayrollCalculator";

/**
 * End of service (مكافأة نهاية الخدمة).
 *
 * The entitlement depends on the country's rule set, so the calculation is
 * delegated to the country rules engine rather than being repeated here.
 */
export function registerEndOfService(app: express.Express) {
  app.get("/api/employees/:id/eos", async (req, res) => {
    try {
      const emp = (await db.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id)) as any;
      if (!emp) return res.status(404).json({ error: "Employee not found" });
      let entityId = emp.entity_id;
      if (!entityId) {
        const e = (await db.prepare("SELECT id FROM entities ORDER BY id LIMIT 1").get()) as any;
        entityId = e?.id;
      }
      if (!entityId) return res.status(400).json({ error: "Entity not found for employee" });
      CountryRulesService.getEntityRules(entityId).then((rules) => {
        const basic = Number(req.query.basic ?? (emp.basic_salary || 0));
        const housing = Number(req.query.allowances ?? (emp.housing_allowance || 0));
        const basis = rules.eos.basis === 'last_total' ? basic + housing : basic;
        const start = req.query.start_date ? String(req.query.start_date) : emp.contract_start_date;
        let serviceYears = 0;
        if (start) {
          const end = req.query.end_date ? new Date(String(req.query.end_date)) : new Date();
          serviceYears = Math.max(0, (end.getTime() - new Date(start).getTime()) / (365.25 * 24 * 3600 * 1000));
        }
        const gratuity = PayrollCalculator.calculateEndOfService(serviceYears, basis, rules);
        res.json({
          employee_id: emp.id,
          employee_name: emp.name,
          start_date: start || null,
          end_date: req.query.end_date || null,
          service_years: Math.round(serviceYears * 100) / 100,
          basis_amount: Math.round(basis * 100) / 100,
          eos_type: rules.eos.type,
          months_per_year: rules.eos.monthsPerYear,
          gratuity_amount: gratuity
        });
      }).catch((e) => res.status(500).json({ error: e.message }));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
