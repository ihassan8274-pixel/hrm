// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import { authenticateToken, requireRole } from "../middleware/auth";
import { uploadsDir } from "../services/helpers";
import { requireOrganizationScope, organizationScope } from "../middleware/organizationScope";
import { assertWritableScope, resolveWritableEntity, ScopeError } from "../lib/organization-scope";
import bcrypt from "bcryptjs";
import { CountryRulesService } from "../../src/lib/payroll/CountryRulesService";
import express from "express";

async function getRestoreTableOrder(): Promise<string[]> {
  const tables = (await db.prepare(`SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'`).all()) as { name: string }[];
  const names = tables.map((table) => table.name);
  const available = new Set(names);
  const dependencies = (await db.prepare(`SELECT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = current_schema()`).all()) as { child: string; parent: string }[];
  const pending = new Map(names.map((name) => [name, new Set(dependencies.filter((edge) => edge.child === name && available.has(edge.parent)).map((edge) => edge.parent))]));
  const ordered: string[] = [];
  while (pending.size) {
    const ready = [...pending].filter(([, parents]) => parents.size === 0).map(([name]) => name).sort();
    if (!ready.length) throw new Error("Foreign-key cycle detected; refusing to restore a partial table order.");
    for (const name of ready) {
      pending.delete(name);
      ordered.push(name);
      for (const parents of pending.values()) parents.delete(name);
    }
  }
  return ordered;
}

export function registerCore(app: express.Express) {

    // Settings

  app.get("/api/settings", async (req, res) => {
    const settings = (await db.prepare("SELECT * FROM settings").all());
    const settingsObj = (settings as any[]).reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.put("/api/settings", async (req, res) => {
    const keys = [
      'org_name', 'country', 'currency', 'tax_rate', 'insurance_emp_rate', 'insurance_comp_rate',
      'cr_number', 'unified_number_700', 'mol_establishment_id', 'gosi_establishment_id',
      'cchi_policy_number', 'nitaqat_category', 'saudi_gosi_emp_rate', 'saudi_gosi_comp_rate',
      'expat_gosi_comp_rate', 'work_permit_annual_fee', 'iqama_renewal_fee',
      // هوية المنشأة كما تظهر في ترويسة الورق (ورقة الشركة).
      'org_name_en', 'vat_number', 'org_address_ar', 'org_address_en', 'po_box',
      // Bank file profile: the settlement bank code and the per-bank routing map.
      // The export stays blocked while these are empty — no defaults are invented.
      'sif_settlement_bank_code', 'sif_bank_codes'
    ];
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        (await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, req.body[key].toString()));
      }
    }
    await logAction('update', 'settings', null, `Updated Saudi settings`);
    res.json({ success: true });
  });

    // Audit Logs

  app.get("/api/audit-logs", async (req, res) => {
    const logs = (await db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").all());
    res.json(logs);
  });

    // Notifications

  app.get("/api/notifications", async (req, res) => {
    const notifications = (await db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all());
    res.json(notifications);
  });

  app.put("/api/notifications/read-all", async (req, res) => {
    (await db.prepare("UPDATE notifications SET is_read = 1").run());
    res.json({ success: true });
  });

    // Branches

  app.get("/api/branches", requireOrganizationScope, async (req, res) => {
    const { entityId, branchId } = organizationScope(res);
    const branches = (await db.prepare(`
      SELECT * FROM branches
      WHERE (? IS NULL OR entity_id = ?)
        AND (? IS NULL OR id = ?)
    `).all(entityId, entityId, branchId, branchId));
    res.json(branches);
  });

  app.post("/api/branches", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const { name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time } = req.body;
    let entityId: number;
    try {
      entityId = (await resolveWritableEntity(db, scope, req.body.entity_id, 'الكيان'));
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    const info = (await db.prepare("INSERT INTO branches (name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(name, location, latitude || null, longitude || null, geofence_radius_m || 200, work_start_time || '08:00', work_end_time || '17:00', entityId));
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/branches/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const { name, location, latitude, longitude, geofence_radius_m, work_start_time, work_end_time } = req.body;
    const branch = (await db.prepare('SELECT id, entity_id FROM branches WHERE id = ?').get(req.params.id)) as { id: number; entity_id: number | null } | undefined;
    if (!branch) return res.status(404).json({ error: "الفرع غير موجود" });
    try {
      assertWritableScope(scope, { entityId: branch.entity_id, branchId: branch.id }, 'الفرع');
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    (await db.prepare(`
      UPDATE branches SET
        name = COALESCE(?, name),
        location = COALESCE(?, location),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        geofence_radius_m = COALESCE(?, geofence_radius_m),
        work_start_time = COALESCE(?, work_start_time),
        work_end_time = COALESCE(?, work_end_time)
      WHERE id = ?
    `).run(name || null, location || null, latitude ?? null, longitude ?? null, geofence_radius_m ?? null, work_start_time || null, work_end_time || null, req.params.id));
    res.json({ success: true });
  });

  app.delete("/api/branches/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const branch = (await db.prepare('SELECT id, entity_id FROM branches WHERE id = ?').get(req.params.id)) as { id: number; entity_id: number | null } | undefined;
    if (!branch) return res.status(404).json({ error: "الفرع غير موجود" });
    try {
      assertWritableScope(scope, { entityId: branch.entity_id, branchId: branch.id }, 'الفرع');
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    (await db.prepare("DELETE FROM branches WHERE id = ?").run(req.params.id));
    res.json({ success: true });
  });

    // Allowance Types

  app.get("/api/allowance-types", async (req, res) => {
    const types = (await db.prepare("SELECT * FROM allowance_types").all());
    res.json(types);
  });

  app.post("/api/allowance-types", async (req, res) => {
    const { name } = req.body;
    const info = (await db.prepare("INSERT INTO allowance_types (name) VALUES (?)").run(name));
    const id = info.lastInsertRowid;
    await logAction('create', 'allowance_type', Number(id), `Created allowance type: ${name}`);
    res.json({ id });
  });

  app.put("/api/allowance-types/:id", async (req, res) => {
    const { name } = req.body;
    (await db.prepare("UPDATE allowance_types SET name = ? WHERE id = ?").run(name, req.params.id));
    await logAction('update', 'allowance_type', Number(req.params.id), `Updated allowance type to: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/allowance-types/:id", async (req, res) => {
    (await db.prepare("DELETE FROM allowance_types WHERE id = ?").run(req.params.id));
    await logAction('delete', 'allowance_type', Number(req.params.id), `Deleted allowance type`);
    res.json({ success: true });
  });

    // Departments

  app.get("/api/departments", requireOrganizationScope, async (req, res) => {
    const { entityId } = organizationScope(res);
    const departments = (await db.prepare(`
      SELECT * FROM departments
      WHERE (? IS NULL OR entity_id = ?)
    `).all(entityId, entityId));
    res.json(departments);
  });

  app.post("/api/departments", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const { name, manager_id } = req.body;
    let entityId: number;
    try {
      entityId = (await resolveWritableEntity(db, scope, req.body.entity_id, 'الكيان'));
      // The department head is an employee of the same organization — otherwise
      // the department points at somebody the caller cannot even see.
      if (manager_id) {
        const manager = (await db.prepare('SELECT id, entity_id FROM employees WHERE id = ?').get(manager_id)) as { id: number; entity_id: number | null } | undefined;
        if (!manager) return res.status(400).json({ error: "مدير الإدارة غير موجود" });
        if (manager.entity_id !== null && manager.entity_id !== entityId) {
          return res.status(403).json({ error: "مدير الإدارة خارج نطاق حسابك" });
        }
      }
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    const info = (await db.prepare("INSERT INTO departments (name, manager_id, entity_id) VALUES (?, ?, ?)")
      .run(name, manager_id || null, entityId));
    await logAction('create', 'department', Number(info.lastInsertRowid), `Created department: ${name}`);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/departments/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const { name, manager_id } = req.body;
    const department = (await db.prepare('SELECT id, entity_id FROM departments WHERE id = ?').get(req.params.id)) as { id: number; entity_id: number | null } | undefined;
    if (!department) return res.status(404).json({ error: "الإدارة غير موجودة" });
    try {
      assertWritableScope(scope, { entityId: department.entity_id, branchId: null }, 'الإدارة');
      if (manager_id) {
        const manager = (await db.prepare('SELECT id, entity_id FROM employees WHERE id = ?').get(manager_id)) as { id: number; entity_id: number | null } | undefined;
        if (!manager) return res.status(400).json({ error: "مدير الإدارة غير موجود" });
        if (manager.entity_id !== null && manager.entity_id !== department.entity_id) {
          return res.status(403).json({ error: "مدير الإدارة خارج نطاق حسابك" });
        }
      }
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    (await db.prepare("UPDATE departments SET name = COALESCE(?, name), manager_id = COALESCE(?, manager_id) WHERE id = ?")
      .run(name || null, manager_id || null, req.params.id));
    await logAction('update', 'department', Number(req.params.id), `Updated department: ${name}`);
    res.json({ success: true });
  });

  app.delete("/api/departments/:id", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const department = (await db.prepare('SELECT id, entity_id FROM departments WHERE id = ?').get(req.params.id)) as { id: number; entity_id: number | null } | undefined;
    if (!department) return res.status(404).json({ error: "الإدارة غير موجودة" });
    try {
      assertWritableScope(scope, { entityId: department.entity_id, branchId: null }, 'الإدارة');
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    (await db.prepare("DELETE FROM departments WHERE id = ?").run(req.params.id));
    await logAction('delete', 'department', Number(req.params.id), `Deleted department`);
    res.json({ success: true });
  });

    // Notifications

  app.get("/api/notifications", async (req, res) => {
    try {
      const notes = (await db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30").all());
      res.json(notes);
    } catch (e) {
      console.error("Error fetching notifications:", e);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.put("/api/notifications/read-all", async (req, res) => {
    try {
      (await db.prepare("UPDATE notifications SET is_read = 1").run());
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update notifications" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      (await db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const { title, message, type } = req.body;
      const info = (await db.prepare(`
        INSERT INTO notifications (title, message, type, is_read)
        VALUES (?, ?, ?, 0)
      `).run(title, message, type || 'info'));
      res.json({ id: info.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

    // ====================================================
    // API: Database Backup & Restore (النسخ الاحتياطي والاستعادة)
    // ====================================================

  app.get("/api/backup/export", authenticateToken, async (req, res) => {
    try {
      const { tables, backupData, totalRecords } = await db.transaction(async () => {
        await db.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const tableRows = (await db.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name").all()) as { name: string }[];
        const data: Record<string, any[]> = {};
        let count = 0;
        for (const { name } of tableRows) {
          const safeName = name.replace(/"/g, '""');
          const rows = await db.prepare(`SELECT * FROM "${safeName}"`).all();
          data[name] = rows;
          count += rows.length;
        }
        return { tables: tableRows, backupData: data, totalRecords: count };
      })();
      const payload = {
        app_name: "Saudi HR & Payroll System",
        version: "2.5.0",
        exported_at: new Date().toISOString(),
        tables_count: tables.length,
        records_count: totalRecords,
        tables: backupData
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=saudi_hr_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(payload);
    } catch (e) {
      console.error("Backup export error:", e);
      res.status(500).json({ error: "فشل تصدير النسخة الاحتياطية" });
    }
  });

  app.post("/api/backup/restore", authenticateToken, async (req, res) => {
    try {
      const payload = req.body;
      const tablesData = payload?.tables || payload;
      if (!tablesData || typeof tablesData !== 'object') {
        return res.status(400).json({ error: "ملف النسخة الاحتياطية غير صالح أو تالف" });
      }
      let restoredTables = 0;
      let restoredRecords = 0;
      const tableOrder = await getRestoreTableOrder();
      const availableTables = new Set(tableOrder);
      const missingTables = tableOrder.filter((name) => !Array.isArray(tablesData[name]));
      if (missingTables.length) {
        return res.status(400).json({ error: `النسخة غير مكتملة؛ الجداول المفقودة: ${missingTables.join(", ")}` });
      }
      const restoreTransaction = db.transaction(async () => {
        if (tableOrder.length) {
          const quotedTables = tableOrder.map((name) => `"${name.replace(/"/g, '""')}"`).join(", ");
          await db.exec(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
        }
        for (const tableName of tableOrder) {
          const rows = tablesData[tableName];
          if (!availableTables.has(tableName) || !Array.isArray(rows)) continue;
          const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
          {
            (await db.prepare(`DELETE FROM ${quotedTable}`).run());
            if (rows.length > 0) {
              const columns = Object.keys(rows[0]);
              const colNames = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(",");
              const placeholders = columns.map(() => "?").join(",");
              const insertStmt = db.prepare(`INSERT INTO ${quotedTable} (${colNames}) VALUES (${placeholders})`);
              for (const row of rows) {
                const values = columns.map(c => row[c] !== undefined ? row[c] : null);
                await insertStmt.run(...values);
                restoredRecords++;
              }
            }
            if (columnsContainId(rows)) {
              const sequence = (await db.prepare("SELECT pg_get_serial_sequence(current_schema() || '.' || ?, 'id') AS name").get(tableName) as any)?.name;
              if (sequence) {
                await db.prepare(`SELECT setval(?::regclass, GREATEST(COALESCE((SELECT MAX(id) FROM ${quotedTable}), 1), 1), EXISTS (SELECT 1 FROM ${quotedTable}))`).get(sequence);
              }
            }
            restoredTables++;
          }
        }
      });
      await restoreTransaction();
      await createNotification('استعادة قاعدة البيانات', `تمت استعادة عدد ${restoredTables} جدول و ${restoredRecords} سجل بنجاح من ملف النسخ الاحتياطي`, 'success');
      await logAction('restore', 'database', null, `Restored database: ${restoredTables} tables, ${restoredRecords} records`);
      res.json({
        success: true,
        restored_tables: restoredTables,
        restored_records: restoredRecords,
        restored_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("Backup restore error:", e);
      res.status(500).json({ error: "فشل استعادة قاعدة البيانات: " + (e as Error).message });
    }
  });

    // ---- Admin: clear system data (re-authenticates the admin's own account) ----

  app.post("/api/admin/clear-data", authenticateToken, async (req, res) => {
    try {
      const { password, confirm_text } = req.body;
      const adminUser = (await db.prepare("SELECT password_hash FROM users WHERE id = ?").get((req as any).user?.id)) as any;
      if (!password || !adminUser || !(await bcrypt.compare(String(password), adminUser.password_hash))) {
        return res.status(403).json({ error: "كلمة المرور غير صحيحة" });
      }
      if (confirm_text !== 'تفريغ') {
        return res.status(400).json({ error: "يجب كتابة كلمة (تفريغ) للتأكيد" });
      }
      const keep = new Set(['settings', 'branches', 'departments', 'allowance_types', 'policies', 'schema_migrations']);
      const all = (await db.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'").all()) as any[];
      const tables = all.map(r => r.name).filter(n => !keep.has(n));
      if (tables.length) {
        const quoted = tables.map((t: string) => `"${t.replace(/"/g, '""')}"`).join(", ");
        await db.exec(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
      }
      (await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', 'done')").run());
      await logAction('admin', 'system', null, `System data cleared by admin (${tables.length} tables)`);
      await createNotification('تفريغ البيانات', 'تم تفريغ بيانات النظام بالكامل بواسطة مدير النظام', 'warning');
      res.json({ success: true, cleared_tables: tables.length });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

    // Serve uploaded documents (authentication required — no public access)

  app.use("/uploads", authenticateToken, express.static(uploadsDir));

    // Get all countries

  app.get("/api/countries", authenticateToken, async (req, res) => {
    try {
      const countries = (await db.prepare("SELECT * FROM countries WHERE is_active = 1 ORDER BY name_ar").all());
      res.json(countries);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Get country by code

  app.get("/api/countries/:code", authenticateToken, async (req, res) => {
    try {
      const country = (await db.prepare("SELECT * FROM countries WHERE code = ? AND is_active = 1").get(req.params.code));
      if (!country) return res.status(404).json({ error: "Country not found" });
      const customRules = (await db.prepare("SELECT * FROM country_rule_items WHERE country_code = ? AND is_active = 1").all(req.params.code));
      res.json({ ...country, custom_rules: customRules });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Update country rules

  app.put("/api/countries/:code/rules", authenticateToken, (req, res) => {
    try {
      const { rules } = req.body; // Array of { rule_key, rule_value, description }
      const countryCode = req.params.code;
      const tx = db.transaction(async () => {
        (await db.prepare("UPDATE country_rule_items SET is_active = 0 WHERE country_code = ?").run(countryCode));
        for (const rule of rules) {
          (await db.prepare(`
            INSERT INTO country_rule_items (country_code, rule_type, rule_key, rule_value, description, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
          `).run(countryCode, rule.rule_type, rule.rule_key, rule.rule_value, rule.description || ''));
        }
      });
      tx();
      CountryRulesService.clearCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Get all entities

  app.get("/api/entities", authenticateToken, async (req, res) => {
    try {
      const entities = (await db.prepare("SELECT e.*, c.name_ar as country_name, c.currency as country_currency FROM entities e LEFT JOIN countries c ON e.country_code = c.code WHERE e.is_active = 1 ORDER BY e.name_ar").all());
      res.json(entities);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Get entity by id

  app.get("/api/entities/:id", authenticateToken, async (req, res) => {
    try {
      const entity = (await db.prepare("SELECT e.*, c.name_ar as country_name, c.currency as country_currency FROM entities e LEFT JOIN countries c ON e.country_code = c.code WHERE e.id = ? AND e.is_active = 1").get(req.params.id));
      if (!entity) return res.status(404).json({ error: "Entity not found" });
      res.json(entity);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Create entity

  app.post("/api/entities", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const { name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json } = req.body;
      const result = (await db.prepare(`
        INSERT INTO entities (name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(name_ar, name_en, country_code, currency, tax_rate || 0, insurance_emp_rate || 0, insurance_comp_rate || 0, settings_json || '{}'));
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Update entity

  app.put("/api/entities/:id", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const { name_ar, name_en, country_code, currency, tax_rate, insurance_emp_rate, insurance_comp_rate, settings_json, is_active } = req.body;
      (await db.prepare(`
        UPDATE entities SET name_ar = ?, name_en = ?, country_code = ?, currency = ?, tax_rate = ?, insurance_emp_rate = ?, insurance_comp_rate = ?, settings_json = ?, is_active = ?
        WHERE id = ?
      `).run(name_ar, name_en, country_code, currency, tax_rate || 0, insurance_emp_rate || 0, insurance_comp_rate || 0, settings_json || '{}', is_active ? 1 : 0, req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

    // Get payroll rules for entity (for display in settings)

  app.get("/api/entities/:id/payroll-rules", authenticateToken, async (req, res) => {
    try {
      const rules = await CountryRulesService.getEntityRules(Number(req.params.id));
      res.json(rules);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/backup/status", authenticateToken, async (_req, res) => {
    const last = (await db.prepare("SELECT value FROM settings WHERE key = 'last_auto_backup'").get()) as any;
    res.json({ last_auto_backup: last?.value || null });
  });

}

function columnsContainId(rows: unknown[]): boolean {
  const first = rows[0];
  return !!first && typeof first === "object" && Object.prototype.hasOwnProperty.call(first, "id");
}
