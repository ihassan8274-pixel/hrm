import db, { logAction } from "../config/postgres";
import express from "express";
import { log } from "../lib/logger";

// A certificate counts as "expiring" this many days before its expiry date.
const EXPIRING_WINDOW_DAYS = 60;

function computeStatus(expiryDate: string): { cert_status: string; days_left: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0) return { cert_status: "expired", days_left: daysLeft };
  if (daysLeft <= EXPIRING_WINDOW_DAYS) return { cert_status: "expiring", days_left: daysLeft };
  return { cert_status: "valid", days_left: daysLeft };
}

// Keep employees.health_cert_number / health_cert_expiry pointing at the
// employee's latest active certificate — the snapshot read by the expiry
// notification job, the documents hub and the employee form.
export async function syncEmployeeSnapshot(employeeId: number) {
  const latest = await db
    .prepare(
      `SELECT certificate_number, expiry_date FROM health_certificates
       WHERE employee_id = ? AND status = 'active'
       ORDER BY expiry_date DESC LIMIT 1`
    )
    .get(employeeId) as any;
  await db.prepare("UPDATE employees SET health_cert_number = ?, health_cert_expiry = ? WHERE id = ?").run(
    latest?.certificate_number ?? null,
    latest?.expiry_date ?? null,
    employeeId
  );
}

export function registerHealthCertificates(app: express.Express) {
  app.get("/api/health-certificates", async (req, res) => {
    try {
      const rows = await db
        .prepare(
          `SELECT hc.*, e.name AS employee_name, e.position AS employee_position,
                  e.nationality AS employee_nationality, e.is_saudi AS employee_is_saudi,
                  e.national_id_iqama AS employee_national_id
           FROM health_certificates hc
           JOIN employees e ON e.id = hc.employee_id
           ORDER BY hc.expiry_date ASC`
        )
        .all() as any[];
      res.json(rows.map(r => ({ ...r, ...computeStatus(r.expiry_date) })));
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "Failed to fetch health certificates" });
    }
  });

  app.get("/api/health-certificates/stats", async (req, res) => {
    try {
      const employees = await db
        .prepare("SELECT id, name, position, nationality, is_saudi FROM employees WHERE status = 'active'")
        .all() as any[];
      const certs = await db
        .prepare("SELECT employee_id, expiry_date FROM health_certificates WHERE status = 'active'")
        .all() as any[];

      let valid = 0, expiring = 0, expired = 0;
      const covered = new Set<number>();
      for (const c of certs) {
        const { cert_status } = computeStatus(c.expiry_date);
        covered.add(c.employee_id);
        if (cert_status === "valid") valid++;
        else if (cert_status === "expiring") expiring++;
        else expired++;
      }
      const missing = employees.filter(e => !covered.has(e.id));
      res.json({
        total_employees: employees.length,
        active_certificates: certs.length,
        valid,
        expiring,
        expired,
        missing: missing.length,
        coverage_pct: employees.length ? Math.round(((employees.length - missing.length) / employees.length) * 100) : 0,
        missing_employees: missing,
      });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "Failed to compute health certificate stats" });
    }
  });

  app.post("/api/health-certificates", async (req, res) => {
    const {
      employee_id, certificate_number, profession_on_cert, issue_date,
      expiry_date, issuing_authority = "البلدية (بلدي)", notes,
    } = req.body || {};
    if (!employee_id || !expiry_date) {
      return res.status(400).json({ error: "employee_id and expiry_date are required" });
    }
    const employee = await db.prepare("SELECT id, name FROM employees WHERE id = ?").get(employee_id) as any;
    if (!employee) return res.status(400).json({ error: "Employee not found" });

    try {
      const tx = db.transaction(async () => {
        await db.prepare(
          `UPDATE health_certificates SET status = 'replaced', updated_at = CURRENT_TIMESTAMP
           WHERE employee_id = ? AND status = 'active'`
        ).run(employee_id);
        const info = await db
          .prepare(
            `INSERT INTO health_certificates
             (employee_id, certificate_number, profession_on_cert, issue_date, expiry_date, issuing_authority, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
          )
          .run(employee_id, certificate_number || null, profession_on_cert || null, issue_date || null, expiry_date, issuing_authority, notes || null);
        await syncEmployeeSnapshot(employee_id);
        return info.lastInsertRowid as number;
      });
      const id = await tx();
      const emp = await db.prepare("SELECT name FROM employees WHERE id = ?").get(employee_id) as any;
      await logAction("create", "health_certificate", id as number, `شهادة صحية لـ ${emp?.name ?? employee_id} تنتهي ${expiry_date}`);
      res.json({ id });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "Failed to create health certificate" });
    }
  });

  app.put("/api/health-certificates/:id", async (req, res) => {
    const existing = await db.prepare("SELECT * FROM health_certificates WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Health certificate not found" });
    const {
      certificate_number = existing.certificate_number,
      profession_on_cert = existing.profession_on_cert,
      issue_date = existing.issue_date,
      expiry_date = existing.expiry_date,
      issuing_authority = existing.issuing_authority,
      status = existing.status,
      notes = existing.notes,
    } = req.body || {};
    if (!expiry_date) return res.status(400).json({ error: "expiry_date is required" });

    try {
      const tx = db.transaction(async () => {
        if (status === "active" && existing.status !== "active") {
          await db.prepare(
            `UPDATE health_certificates SET status = 'replaced', updated_at = CURRENT_TIMESTAMP
             WHERE employee_id = ? AND status = 'active' AND id != ?`
          ).run(existing.employee_id, existing.id);
        }
        await db.prepare(
          `UPDATE health_certificates SET certificate_number = ?, profession_on_cert = ?, issue_date = ?,
             expiry_date = ?, issuing_authority = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(certificate_number, profession_on_cert, issue_date, expiry_date, issuing_authority, status, notes, existing.id);
        await syncEmployeeSnapshot(existing.employee_id);
      });
      await tx();
      await logAction("update", "health_certificate", existing.id, `تحديث شهادة صحية (${status})`);
      res.json({ ok: true });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "Failed to update health certificate" });
    }
  });

  app.delete("/api/health-certificates/:id", async (req, res) => {
    const existing = await db.prepare("SELECT * FROM health_certificates WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "Health certificate not found" });
    try {
      const tx = db.transaction(async () => {
        await db.prepare("DELETE FROM health_certificates WHERE id = ?").run(existing.id);
        await syncEmployeeSnapshot(existing.employee_id);
      });
      await tx();
      await logAction("delete", "health_certificate", existing.id, `حذف شهادة صحية رقم ${existing.certificate_number ?? ""}`.trim());
      res.json({ ok: true });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "Failed to delete health certificate" });
    }
  });
}
