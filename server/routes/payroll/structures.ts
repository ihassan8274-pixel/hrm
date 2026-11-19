import db, { logAction } from "../../config/postgres";
import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireOrganizationScope, organizationScope } from "../../middleware/organizationScope";
import {
  assertWritableScope,
  resolveWritableEntity,
  ScopeError,
} from "../../lib/organization-scope";
import { validateBody, salaryStructureCreateSchema, salaryStructureUpdateSchema, salaryComponentCreateSchema } from "../../middleware/validation";

/**
 * SALARY STRUCTURE ENGINE API — هياكل الرواتب ومكوناتها.
 *
 * A structure is the recipe a salary is built from (basic + components + the
 * rules that apply to each); the components are the reusable parts a
 * structure refers to.
 */

/** GET /api/payroll/structures - جلب هياكل الرواتب */
export function registerSalaryStructures(app: express.Express) {
  app.get("/api/payroll/structures", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const structures = (await db.prepare(`
        SELECT ss.*, e.name_ar as entity_name, d.name as dept_name, p.name_ar as position_title
        FROM salary_structures ss
        LEFT JOIN entities e ON ss.entity_id = e.id
        LEFT JOIN departments d ON ss.department_id = d.id
        LEFT JOIN positions p ON ss.position_id = p.id
        WHERE ss.is_active = 1
          AND (? IS NULL OR ss.entity_id = ?)
        ORDER BY ss.is_default DESC, ss.name_ar
      `).all(scope.entityId, scope.entityId));
      res.json(structures);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/payroll/structures/:id - جلب هيكل راتب بالتفصيل
  app.get("/api/payroll/structures/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const structure = (await db.prepare("SELECT * FROM salary_structures WHERE id = ? AND is_active = 1").get(id));
      if (!structure) return res.status(404).json({ error: 'هيكل الراتب غير موجود' });

      const components = (await db.prepare(`
        SELECT sc.*, s.code, s.name_ar, s.name_en, s.type, s.category, s.calculation_type,
               s.calculation_value, s.condition_formula, s.is_taxable, s.is_gosi_applicable
        FROM salary_structure_components sc
        JOIN salary_components s ON sc.component_id = s.id
        WHERE sc.structure_id = ? AND s.is_active = 1
        ORDER BY sc.sequence
      `).all(id));

      res.json({ ...structure, components });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/payroll/structures - إنشاء هيكل راتب
  app.post("/api/payroll/structures", validateBody(salaryStructureCreateSchema), authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { code, name_ar, name_en, entity_id, department_id, position_id, payroll_frequency, currency, country_code, component_ids } = req.body;

      if (!code || !name_ar) {
        return res.status(400).json({ error: 'الكود والاسم بالعربي مطلوبان' });
      }
      const scope = organizationScope(res);
      let writableEntityId: number;
      try {
        writableEntityId = (await resolveWritableEntity(db, scope, entity_id, 'الكيان'));
      } catch (error) {
        if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
        throw error;
      }

      const structureId = await db.transaction(async () => {
        const result = (await db.prepare(`
          INSERT INTO salary_structures (code, name_ar, name_en, entity_id, department_id, position_id, payroll_frequency, currency, country_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(code, name_ar, name_en, writableEntityId, department_id, position_id, payroll_frequency || 'monthly', currency || 'SAR', country_code || 'SA'));

        const structureId = result.lastInsertRowid;

        if (component_ids && Array.isArray(component_ids)) {
          const insertComp = db.prepare(`
            INSERT INTO salary_structure_components (structure_id, component_id, sequence, is_mandatory)
            VALUES (?, ?, ?, 1)
          `);
          for (const [idx, compId] of component_ids.entries()) {
            await insertComp.run(structureId, compId, idx);
          }
        }

        return structureId;
      })();

      await logAction('create', 'salary_structure', Number(structureId), `إنشاء هيكل راتب: ${name_ar}`);
      res.json({ id: structureId, message: 'تم إنشاء هيكل الراتب بنجاح' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/payroll/structures/:id - تحديث هيكل راتب
  app.put("/api/payroll/structures/:id", validateBody(salaryStructureUpdateSchema), authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name_ar, name_en, entity_id, department_id, position_id, payroll_frequency, currency, country_code, is_active, component_ids } = req.body;
      const scope = organizationScope(res);
      const existing = (await db.prepare('SELECT id, entity_id FROM salary_structures WHERE id = ?').get(id)) as { id: number; entity_id: number | null } | undefined;
      if (!existing) return res.status(404).json({ error: 'هيكل الراتب غير موجود' });
      try {
        assertWritableScope(scope, { entityId: existing.entity_id, branchId: null }, 'هيكل الراتب');
      } catch (error) {
        if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
        throw error;
      }

      db.transaction(async () => {
        // تحديث الهيكل
        const fields: string[] = [];
        const values: any[] = [];
        if (code) { fields.push('code = ?'); values.push(code); }
        if (name_ar) { fields.push('name_ar = ?'); values.push(name_ar); }
        if (name_en) { fields.push('name_en = ?'); values.push(name_en); }
        if (entity_id) { fields.push('entity_id = ?'); values.push(entity_id); }
        if (department_id !== undefined) { fields.push('department_id = ?'); values.push(department_id); }
        if (position_id !== undefined) { fields.push('position_id = ?'); values.push(position_id); }
        if (payroll_frequency) { fields.push('payroll_frequency = ?'); values.push(payroll_frequency); }
        if (currency) { fields.push('currency = ?'); values.push(currency); }
        if (country_code) { fields.push('country_code = ?'); values.push(country_code); }
        if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }

        if (fields.length > 0) {
          values.push(id);
          (await db.prepare(`UPDATE salary_structures SET ${fields.join(', ')} WHERE id = ?`).run(...values));
        }

        // تحديث المكونات إذا تم تمريرها
        if (component_ids && Array.isArray(component_ids)) {
          // حذف القديمة
          (await db.prepare("DELETE FROM salary_structure_components WHERE structure_id = ?").run(id));
          // إضافة الجديدة
          const insertComp = db.prepare(`
            INSERT INTO salary_structure_components (structure_id, component_id, sequence, is_mandatory)
            VALUES (?, ?, ?, 1)
          `);
          component_ids.forEach((compId: number, idx: number) => {
            insertComp.run(id, compId, idx);
          });
        }
      })();

      await logAction('update', 'salary_structure', parseInt(id), `تحديث هيكل راتب`);
      res.json({ message: 'تم تحديث هيكل الراتب بنجاح' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // DELETE /api/payroll/structures/:id - حذف هيكل راتب
  app.delete("/api/payroll/structures/:id", authenticateToken, requireOrganizationScope, async (req, res) => {
    try {
      const { id } = req.params;
      const structure = (await db.prepare("SELECT name_ar, entity_id FROM salary_structures WHERE id = ?").get(id)) as any;
      if (!structure) return res.status(404).json({ error: 'غير موجود' });
      try {
        assertWritableScope(organizationScope(res), { entityId: structure.entity_id, branchId: null }, 'هيكل الراتب');
      } catch (error) {
        if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
        throw error;
      }

      // التحقق من عدم وجود قسائم مرتبطة
      const slipsCount = (await db.prepare("SELECT COUNT(*) as c FROM salary_slips WHERE structure_id = ?").get(id)) as any;
      if (slipsCount.c > 0) {
        return res.status(400).json({ error: 'لا يمكن حذف هيكل راتب له قسائم مرتبطة' });
      }

      (await db.prepare("DELETE FROM salary_structure_components WHERE structure_id = ?").run(id));
      (await db.prepare("DELETE FROM salary_structures WHERE id = ?").run(id));

      await logAction('delete', 'salary_structure', parseInt(id), `حذف هيكل راتب: ${structure.name_ar}`);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}

/** The reusable components a salary structure is built from. */
export function registerSalaryComponents(app: express.Express) {
  // GET /api/payroll/components - جلب مكونات الراتب
  app.get("/api/payroll/components", authenticateToken, async (req, res) => {
    try {
      const { type, category, is_active } = req.query;
      let where = "1=1";
      const params: any[] = [];

      if (type) { where += " AND type = ?"; params.push(type); }
      if (category) { where += " AND category = ?"; params.push(category); }
      if (is_active !== undefined) { where += " AND is_active = ?"; params.push(is_active); }

      const components = (await db.prepare(`
        SELECT * FROM salary_components WHERE ${where} ORDER BY display_order, code
      `).all(...params));

      res.json(components);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // POST /api/payroll/components - إنشاء مكون راتب
  app.post("/api/payroll/components", validateBody(salaryComponentCreateSchema), authenticateToken, async (req, res) => {
    try {
      const { code, name_ar, name_en, type, category, calculation_type, calculation_value, condition_formula, display_order, is_taxable, is_gosi_applicable } = req.body;

      if (!code || !name_ar || !type) {
        return res.status(400).json({ error: 'الكود والاسم والنوع مطلوبان' });
      }

      const result = (await db.prepare(`
        INSERT INTO salary_components (code, name_ar, name_en, type, category, calculation_type, calculation_value, condition_formula, display_order, is_taxable, is_gosi_applicable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(code, name_ar, name_en, type, category, calculation_type || 'fixed', calculation_value, condition_formula, display_order || 0, is_taxable || 1, is_gosi_applicable || 0));

      await logAction('create', 'salary_component', Number(result.lastInsertRowid), `إنشاء مكون راتب: ${name_ar}`);
      res.json({ id: result.lastInsertRowid, message: 'تم إنشاء مكون الراتب بنجاح' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/payroll/components/:id - تحديث مكون راتب
  app.put("/api/payroll/components/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      // The column names come from the request body, so they have to be
      // picked from a fixed list — a caller must never be able to shape SQL.
      const updatable = new Set([
        "code", "name_ar", "name_en", "type", "category", "calculation_type",
        "calculation_value", "condition_formula", "depends_on_components",
        "display_order", "is_active", "is_taxable", "is_gosi_applicable",
      ]);
      const updates = req.body as Record<string, unknown>;
      const columns = Object.keys(updates).filter(key => updatable.has(key));
      if (!columns.length) {
        return res.status(400).json({ error: "لا توجد حقول قابلة للتحديث" });
      }

      const fields = columns.map(key => `${key} = ?`).join(', ');
      const values = columns.map(key => updates[key]);

      (await db.prepare(`UPDATE salary_components SET ${fields} WHERE id = ?`).run(...values, id));
      await logAction('update', 'salary_component', parseInt(id), `تحديث مكون راتب`);
      res.json({ message: 'تم تحديث مكون الراتب' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
