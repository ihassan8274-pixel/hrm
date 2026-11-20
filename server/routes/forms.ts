// مركز النماذج والطباعة — واجهة API.
//
// الفصل بين «القالب» و«المستند الصادر» مقصود:
//   document_templates   نص القالب ({{employee.name}} و… ) ويقبل التعديل.
//   generated_documents  المستند كما صدر: نص مجمّد + البيانات وقت الإصدار.
//
// التجميد مقصود أيضاً: تعديل قالب الشهادة بعد أن صدرت عشر شهادات لا يغيّر
// الشهادات العشر — الملف الصادر وثيقة، والقالب مسوّدة.
//
// محرك الحقول في src/lib/print/placeholders.ts، نفسه الذي تستعمله الواجهة في
// المعاينة الحية، فالنص المعروض والنص المحفوظ متطابقان.

import db, { logAction } from "../config/postgres";
import express from "express";
import {
  buildTemplateContext,
  extractPlaceholders,
  findUnresolvedPlaceholders,
  renderTemplate,
} from "../../src/lib/print/placeholders";
import { DEFAULT_BRAND } from "../../src/lib/print/brand";
import { requireOrganizationScope, organizationScope } from "../middleware/organizationScope";
import { assertEmployeeWritableScope, ScopeError } from "../lib/organization-scope";
import { log } from "../lib/logger";

/** التصنيفات المعروضة في واجهة المركز — تضاف إلى قائمة الفلاتر. */
const TEMPLATE_CATEGORIES = ["letters", "certificates", "warnings", "contracts", "reports"];

async function loadCompanySettings(): Promise<Record<string, string>> {
  const rows = (await db.prepare("SELECT key, value FROM settings").all()) as any[];
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

/**
 * بيانات الموظف كما يحتاجها القالب: صف الموظف + اسم الفرع والإدارة.
 */
async function loadEmployee(employeeId: number): Promise<any | undefined> {
  return (await db
    .prepare(
      `SELECT e.*, b.name AS branch_name, d.name AS department_name
         FROM employees e
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.id = ?`
    )
    .get(employeeId)) as any;
}

/**
 * آخر سجل رواتب للموظف: للشهر والسنة إن حدّدهما المستخدم، وإلا آخر راتب
 * مُسجَّل. يُستعمل في خطابات الراتب: إن لم يوجد سجل رواتب، يعود الخطاب إلى
 * حقول الأجر المخزّنة على صف الموظف نفسه.
 */
async function loadPayroll(employeeId: number, month?: number, year?: number): Promise<any | undefined> {
  if (month && year) {
    return (await db
      .prepare(
        `SELECT * FROM payroll
          WHERE employee_id = ? AND month = ? AND year = ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(employeeId, month, year)) as any;
  }
  return (await db
    .prepare(
      `SELECT * FROM payroll
        WHERE employee_id = ?
        ORDER BY year DESC, month DESC, id DESC LIMIT 1`
    )
    .get(employeeId)) as any;
}

/**
 * يبني السياق الكامل للقالب: المنشأة + الموظف + الراتب + بيانات المستند.
 */
async function buildContext(input: {
  employee: any;
  payroll?: any;
  company: Record<string, string>;
  document?: Record<string, any>;
  custom?: Record<string, any>;
}) {
  const employee = input.employee ?? {};
  const payroll = input.payroll ?? {};
  const salary = payroll && payroll.id
    ? {
        basic_salary: payroll.basic_salary,
        total_salary: payroll.net_salary,
        net_salary: payroll.net_salary,
        housing_allowance: payroll.housing_allowance,
        transport_allowance: payroll.transport_allowance,
        other_allowances: payroll.other_allowances ?? employee.other_allowances,
        deductions: payroll.deductions,
        month: payroll.month,
        year: payroll.year,
      }
    : {
        basic_salary: employee.basic_salary,
        total_salary: (employee.basic_salary ?? 0) + (employee.housing_allowance ?? 0) + (employee.transport_allowance ?? 0),
        housing_allowance: employee.housing_allowance,
        transport_allowance: employee.transport_allowance,
        other_allowances: employee.other_allowances,
      };

  return buildTemplateContext({
    employee,
    salary,
    company: input.company as any,
    document: input.document ?? {},
    custom: input.custom ?? {},
  });
}

/** رقم مرجع المستند: DOC-YYYY-NNNNN — يظهر في نص المستند وفي الأرشيف. */
function buildReferenceNumber(id: number): string {
  const year = new Date().getFullYear();
  return `DOC-${year}-${String(id).padStart(5, "0")}`;
}

async function findTemplate(templateId?: number, templateKey?: string): Promise<any | undefined> {
  if (templateId) {
    return (await db.prepare("SELECT * FROM document_templates WHERE id = ?").get(templateId)) as any;
  }
  if (templateKey) {
    return (await db.prepare("SELECT * FROM document_templates WHERE template_key = ?").get(templateKey)) as any;
  }
  return undefined;
}

export function registerForms(app: express.Express) {
  // ---------------------------------------------------------------- القوالب

  app.get("/api/forms/templates", async (_req, res) => {
    try {
      const rows = (await db
        .prepare(
          `SELECT id, template_key, name_ar, name_en, category, subject_label,
                  body_ar, is_system, is_active, created_at, updated_at
             FROM document_templates
            WHERE is_active = 1
            ORDER BY category, name_ar`
        )
        .all()) as any[];
      res.json(
        rows.map((row) => ({ ...row, placeholders: extractPlaceholders(row.body_ar) })),
      );
    } catch (error) {
      log.error("[forms] failed to list templates", error);
      res.status(500).json({ error: "تعذّر تحميل القوالب" });
    }
  });

  app.get("/api/forms/templates/:id", async (req, res) => {
    try {
      const template = (await db
        .prepare("SELECT * FROM document_templates WHERE id = ?")
        .get(req.params.id)) as any;
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });
      res.json({ ...template, placeholders: extractPlaceholders(template.body_ar) });
    } catch (error) {
      log.error("[forms] failed to load template", error);
      res.status(500).json({ error: "تعذّر تحميل القالب" });
    }
  });

  app.post("/api/forms/templates", async (req, res) => {
    const { name_ar, name_en, category = "letters", subject_label, body_ar, template_key } = req.body || {};
    if (!name_ar || !body_ar) {
      return res.status(400).json({ error: "اسم القالب ونصه مطلوبان" });
    }
    if (!TEMPLATE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "تصنيف القالب غير معروف" });
    }
    try {
      const key = (template_key || `custom_${Date.now()}`).toString().trim();
      const existing = (await db
        .prepare("SELECT id FROM document_templates WHERE template_key = ?")
        .get(key)) as any;
      if (existing) return res.status(409).json({ error: "يوجد قالب بنفس المعرّف" });

      const info = await db
        .prepare(
          `INSERT INTO document_templates
             (template_key, name_ar, name_en, category, subject_label, body_ar, is_system, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`
        )
        .run(
          key,
          name_ar,
          name_en || null,
          category,
          subject_label || null,
          body_ar,
          (req as any).user?.id ?? null,
        );
      await logAction("create", "document_template", info.lastInsertRowid as number, `إنشاء قالب: ${name_ar}`);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      log.error("[forms] failed to create template", error);
      res.status(500).json({ error: "تعذّر إنشاء القالب" });
    }
  });

  app.put("/api/forms/templates/:id", async (req, res) => {
    try {
      const template = (await db
        .prepare("SELECT * FROM document_templates WHERE id = ?")
        .get(req.params.id)) as any;
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });

      const {
        name_ar = template.name_ar,
        name_en = template.name_en,
        category = template.category,
        subject_label = template.subject_label,
        body_ar = template.body_ar,
        is_active = template.is_active,
      } = req.body || {};
      if (!TEMPLATE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: "تصنيف القالب غير معروف" });
      }

      await db
        .prepare(
          `UPDATE document_templates
              SET name_ar = ?, name_en = ?, category = ?, subject_label = ?,
                  body_ar = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
        )
        .run(
          name_ar,
          name_en,
          category,
          subject_label,
          body_ar,
          is_active ? 1 : 0,
          template.id,
        );
      await logAction("update", "document_template", template.id, `تعديل قالب: ${name_ar}`);
      res.json({ ok: true });
    } catch (error) {
      log.error("[forms] failed to update template", error);
      res.status(500).json({ error: "تعذّر تعديل القالب" });
    }
  });

  app.delete("/api/forms/templates/:id", async (req, res) => {
    try {
      const template = (await db
        .prepare("SELECT * FROM document_templates WHERE id = ?")
        .get(req.params.id)) as any;
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });
      if (template.is_system) {
        return res.status(400).json({ error: "قوالب النظام المدمجة لا تُحذف — يمكن تعطيلها فقط" });
      }
      await db.prepare("DELETE FROM document_templates WHERE id = ?").run(template.id);
      await logAction("delete", "document_template", template.id, `حذف قالب: ${template.name_ar}`);
      res.json({ ok: true });
    } catch (error) {
      log.error("[forms] failed to delete template", error);
      res.status(500).json({ error: "تعذّر حذف القالب" });
    }
  });

  // ------------------------------------------------------- بيانات الترويسة

  app.get("/api/forms/letterhead", async (_req, res) => {
    try {
      const stored = await loadCompanySettings();
      // ما لم يُضبط من «بيانات المنشأة» يعود إلى هوية ورقة الشركة.
      const company = { ...DEFAULT_BRAND, ...Object.fromEntries(Object.entries(stored).filter(([, value]) => value !== "")) };
      const branches = (await db
        .prepare("SELECT id, name FROM branches WHERE is_active = 1 ORDER BY name")
        .all()) as any[];
      res.json({ company, branches });
    } catch (error) {
      log.error("[forms] failed to load letterhead", error);
      res.status(500).json({ error: "تعذّر تحميل بيانات المنشأة" });
    }
  });

  // -------------------------------------------------------------- المعاينة

  app.post("/api/forms/preview", async (req, res) => {
    try {
      const { template_id, template_key, employee_id, fields = {}, month, year } = req.body || {};
      const template = await findTemplate(template_id, template_key);
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });

      const company = await loadCompanySettings();
      const employee = employee_id ? await loadEmployee(Number(employee_id)) : null;
      if (employee_id && !employee) {
        return res.status(400).json({ error: "الموظف غير موجود" });
      }
      const payroll = employee ? await loadPayroll(employee.id, month ? Number(month) : undefined, year ? Number(year) : undefined) : undefined;

      const context = await buildContext({
        employee: employee ?? {},
        payroll,
        company,
        document: { number: "DOC-2026-00000", issue_date: new Date().toISOString().slice(0, 10) },
        custom: fields,
      });

      res.json({
        content: renderTemplate(template.body_ar, context),
        placeholders: extractPlaceholders(template.body_ar),
        unresolved: findUnresolvedPlaceholders(template.body_ar, context),
        context,
      });
    } catch (error) {
      log.error("[forms] failed to render preview", error);
      res.status(500).json({ error: "تعذّر توليد المعاينة" });
    }
  });

  // --------------------------------------------------------------- الإصدار

  app.post("/api/forms/documents", async (req, res) => {
    try {
      const { template_id, template_key, employee_id, fields = {}, month, year, title } = req.body || {};
      const template = await findTemplate(template_id, template_key);
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });
      if (!employee_id) return res.status(400).json({ error: "يجب اختيار الموظف" });

      const employee = await loadEmployee(Number(employee_id));
      if (!employee) return res.status(400).json({ error: "الموظف غير موجود" });

      const company = await loadCompanySettings();
      const payroll = await loadPayroll(
        employee.id,
        month ? Number(month) : undefined,
        year ? Number(year) : undefined,
      );

      const context = await buildContext({
        employee,
        payroll,
        company,
        document: { issue_date: new Date().toISOString().slice(0, 10) },
        custom: fields,
      });

      const info = await db
        .prepare(
          `INSERT INTO generated_documents
             (template_id, template_key, title, employee_id, reference_number, content, fields_json,
              status, issued_by, branch_id, employee_branch_id, employee_entity_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?)`
        )
        .run(
          template.id,
          template.template_key,
          title || template.name_ar,
          employee.id,
          "",
          renderTemplate(template.body_ar, context),
          JSON.stringify(fields ?? {}),
          (req as any).user?.id ?? null,
          employee.branch_id ?? null,
          employee.branch_id ?? null,
          employee.entity_id ?? null,
        );

      const id = info.lastInsertRowid as number;
      const referenceNumber = buildReferenceNumber(id);
      await db
        .prepare("UPDATE generated_documents SET reference_number = ? WHERE id = ?")
        .run(referenceNumber, id);

      await logAction(
        "create",
        "generated_document",
        id,
        `إصدار ${template.name_ar} للموظف ${employee.name} — مرجع ${referenceNumber}`,
      );

      res.json({ id, reference_number: referenceNumber });
    } catch (error) {
      log.error("[forms] failed to issue document", error);
      res.status(500).json({ error: "تعذّر إصدار المستند" });
    }
  });

  /** إصدار دفعة واحدة لنفس القالب على عدة موظفين. */
  app.post("/api/forms/documents/batch", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const { template_id, template_key, employee_ids = [], fields = {}, month, year } = req.body || {};
      const template = await findTemplate(template_id, template_key);
      if (!template) return res.status(404).json({ error: "القالب غير موجود" });
      if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
        return res.status(400).json({ error: "اختر موظفاً واحداً على الأقل" });
      }

      const company = await loadCompanySettings();
      const issued: Array<{ id: number; employee_id: number; reference_number: string }> = [];
      const refused: Array<{ employee_id: number; reason: string }> = [];

      for (const rawId of employee_ids) {
        const employeeId = Number(rawId);
        if (!Number.isInteger(employeeId) || employeeId <= 0) {
          refused.push({ employee_id: Number(rawId), reason: "رقم موظف غير صالح" });
          continue;
        }
        try {
          // الموظف خارج نطاق الحساب يُتخطّى بدل إسقاط الدفعة كاملة.
          await assertEmployeeWritableScope(db, scope, employeeId, "الموظف");
        } catch (error) {
          if (error instanceof ScopeError) {
            refused.push({ employee_id: employeeId, reason: error.message });
            continue;
          }
          throw error;
        }

        const employee = await loadEmployee(employeeId);
        if (!employee) {
          refused.push({ employee_id: employeeId, reason: "الموظف غير موجود" });
          continue;
        }
        const payroll = await loadPayroll(
          employee.id,
          month ? Number(month) : undefined,
          year ? Number(year) : undefined,
        );
        const context = await buildContext({
          employee,
          payroll,
          company,
          document: { issue_date: new Date().toISOString().slice(0, 10) },
          custom: fields,
        });

        const info = await db
          .prepare(
            `INSERT INTO generated_documents
               (template_id, template_key, title, employee_id, reference_number, content, fields_json,
                status, issued_by, branch_id, employee_branch_id, employee_entity_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?)`
          )
          .run(
            template.id,
            template.template_key,
            template.name_ar,
            employee.id,
            "",
            renderTemplate(template.body_ar, context),
            JSON.stringify(fields ?? {}),
            (req as any).user?.id ?? null,
            employee.branch_id ?? null,
            employee.branch_id ?? null,
            employee.entity_id ?? null,
          );

        const id = info.lastInsertRowid as number;
        const referenceNumber = buildReferenceNumber(id);
        await db
          .prepare("UPDATE generated_documents SET reference_number = ? WHERE id = ?")
          .run(referenceNumber, id);
        issued.push({ id, employee_id: employee.id, reference_number: referenceNumber });
      }

      if (issued.length > 0) {
        await logAction(
          "create",
          "generated_document",
          issued[0].id,
          `إصدار دفعة: ${template.name_ar} — ${issued.length} مستند`,
        );
      }

      res.json({ issued, refused });
    } catch (error) {
      log.error("[forms] failed to issue batch", error);
      res.status(500).json({ error: "تعذّر إصدار المستندات" });
    }
  });

  // -------------------------------------------------------------- الأرشيف

  app.get("/api/forms/documents", async (req, res) => {
    try {
      const { template_key, employee_id } = req.query as Record<string, string>;
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const rows = (await db
        .prepare(
          `SELECT gd.id, gd.template_key, gd.title, gd.employee_id, gd.reference_number,
                  gd.status, gd.issued_at, e.name AS employee_name
             FROM generated_documents gd
             LEFT JOIN employees e ON e.id = gd.employee_id
            WHERE (? IS NULL OR gd.template_key = ?)
              AND (? IS NULL OR gd.employee_id = ?)
            ORDER BY gd.issued_at DESC, gd.id DESC
            LIMIT ?`
        )
        .all(
          template_key || null,
          template_key || null,
          employee_id ? Number(employee_id) : null,
          employee_id ? Number(employee_id) : null,
          limit,
        )) as any[];
      res.json(rows);
    } catch (error) {
      log.error("[forms] failed to list documents", error);
      res.status(500).json({ error: "تعذّر تحميل المستندات" });
    }
  });

  app.get("/api/forms/documents/:id", async (req, res) => {
    try {
      const document = (await db
        .prepare(
          `SELECT gd.*, e.name AS employee_name, e.position AS employee_position
             FROM generated_documents gd
             LEFT JOIN employees e ON e.id = gd.employee_id
            WHERE gd.id = ?`
        )
        .get(req.params.id)) as any;
      if (!document) return res.status(404).json({ error: "المستند غير موجود" });
      res.json(document);
    } catch (error) {
      log.error("[forms] failed to load document", error);
      res.status(500).json({ error: "تعذّر تحميل المستند" });
    }
  });
}
