// طلبات الخدمة الذاتية (بوابة الموظف / ESS).
//
// خمسة أنواع من النماذج يرفعها الموظف من بوابته، وكلها تمرّ في مسار واحد:
//   loan                  → طلب سلفة
//   leave                 → طلب إجازة
//   grievance             → نموذج شكوى (المادة 209)
//   suggestion            → نموذج مقترحات
//   workflow_improvement  → مقترح تطوير سير العمل
//
// كل طلب يترك سجلّه الأصلي (سلفة/إجازة/تظلم/اقتراح) فيجده فريق الموارد
// البشرية في شاشاته، ويرافقه طلب اعتماد في محرّك سير العمل ليُعرض على المدير
// في صندوق الاعتماد. عند اعتماد الطلب نهائياً تُحدَّث حالة السجل الأصلي.
//
// الموظف لا يختار اسم نفسه: هوية الموظف تُؤخذ من الجلسة، فلا يقدر موظف
// أن يرفع طلباً نيابة عن زميله.

import db, { logAction, createNotification } from "../config/postgres";
import express from "express";
import { log } from "../lib/logger";

type RequestType = "loan" | "leave" | "grievance" | "suggestion" | "workflow_improvement";

interface RequestSpec {
  /** نوع مسار الاعتماد في approval_workflows. */
  workflowType: string;
  /** السجل الذي يُنشأ في جدوله. */
  entityType: string;
  label: string;
}

const REQUEST_SPECS: Record<RequestType, RequestSpec> = {
  loan: { workflowType: "loan_advance", entityType: "loan", label: "طلب سلفة" },
  leave: { workflowType: "leave_request", entityType: "leave", label: "طلب إجازة" },
  grievance: { workflowType: "grievance", entityType: "grievance", label: "شكوى إدارية" },
  suggestion: { workflowType: "suggestion", entityType: "suggestion", label: "مقترح" },
  workflow_improvement: {
    workflowType: "process_improvement",
    entityType: "suggestion",
    label: "مقترح تطوير سير العمل",
  },
};

const isRequestType = (value: unknown): value is RequestType =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(REQUEST_SPECS, value);

/** يحسب عدد أيام الإجازة (شامل الطرفين) من تاريخين. */
const countLeaveDays = (startDate: string, endDate: string): number => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
};

const today = () => new Date().toISOString().slice(0, 10);

export function registerEssRequests(app: express.Express) {
  /**
   * يرفع الموظف طلباً جديداً من بوابته.
   * Body: { type, ...payload } — الموظف نفسه من الجلسة.
   */
  app.post("/api/ess/requests", async (req, res) => {
    try {
      const user = (req as any).user || {};
      const type = req.body?.type;
      if (!isRequestType(type)) {
        return res.status(400).json({ error: "نوع الطلب غير معروف" });
      }
      const spec = REQUEST_SPECS[type];

      // الموظف لا يحدد نفسه: إما من الجلسة (دور employee_ess) أو يحدده
      // يقدّم عنه الطلب (شاشة ESS لمدير الموارد).
      const sessionEmployeeId = Number(user.employee_id || 0);
      const requestedEmployeeId = Number(req.body?.employee_id || 0);
      const employeeId = sessionEmployeeId > 0 ? sessionEmployeeId : requestedEmployeeId;
      if (!employeeId) {
        return res.status(400).json({ error: "لا يوجد موظف مرتبط بهذا الحساب" });
      }
      const employee = await db
        .prepare("SELECT id, name, position, job_title, basic_salary FROM employees WHERE id = ?")
        .get(employeeId) as any;
      if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });

      const titleInput = String(req.body?.title || req.body?.subject || "").trim();
      let details = String(req.body?.details || "").trim();
      let amount = 0;
      let entityId = 0;
      let ticket = "";
      let workflowType = spec.workflowType;
      let title = titleInput;

      if (type === "loan") {
        const total = Number(req.body?.total_amount || 0);
        const installment = Number(req.body?.monthly_installment || 0);
        const startMonth = req.body?.deduction_start_month;
        const startYear = req.body?.deduction_start_year;
        const deductionMonths = req.body?.deduction_months;
        if (!(total > 0)) return res.status(400).json({ error: "قيمة السلفة مطلوبة" });
        if (!(installment > 0)) return res.status(400).json({ error: "الخصم الشهري مطلوب" });
        if (installment > total) {
          return res.status(400).json({ error: "الخصم الشهري أكبر من قيمة السلفة" });
        }
        if ((startMonth == null) !== (startYear == null)) {
          return res.status(400).json({ error: "شهر البداية والسنة معاً مطلوبان" });
        }
        const salary = Number(employee.basic_salary || 0);
        if (salary > 0 && total > salary * 12) {
          return res.status(400).json({
            error: "قيمة السلفة تتجاوز 12 راتباً — راجع إدارة الموارد البشرية",
          });
        }
        amount = total;
        const inserted = await db
          .prepare(
            `INSERT INTO loans (
               employee_id, total_amount, remaining_amount, monthly_installment,
               deduction_start_month, deduction_start_year, deduction_months, status
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          )
          .run(
            employeeId, total, total, installment,
            startMonth == null ? null : Number(startMonth),
            startYear == null ? null : Number(startYear),
            deductionMonths == null || deductionMonths === "" ? null : Number(deductionMonths),
          );
        entityId = Number(inserted.lastInsertRowid);
        ticket = `LOAN-${today().replace(/-/g, "")}-${entityId}`;
        title = title || `طلب سلفة بمبلغ ${total.toLocaleString("ar-SA")} ر.س`;
        details = details || `خصم راتبي ${installment.toLocaleString("ar-SA")} ر.س` +
          (startMonth != null ? ` من ${startMonth}/${startYear}` : "") +
          (deductionMonths ? ` لمدة ${deductionMonths} شهر` : "");
      } else if (type === "leave") {
        const startDate = String(req.body?.start_date || "");
        const endDate = String(req.body?.end_date || "");
        const leaveType = String(req.body?.leave_type || "annual");
        if (!startDate || !endDate) {
          return res.status(400).json({ error: "تواريخ الإجازة مطلوبة" });
        }
        const days = countLeaveDays(startDate, endDate);
        if (!days) return res.status(400).json({ error: "تواريخ الإجازة غير صحيحة" });
        const inserted = await db
          .prepare(
            `INSERT INTO leaves (employee_id, type, start_date, end_date, days, status, reason)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
          )
          .run(employeeId, leaveType, startDate, endDate, days, details || title || null);
        entityId = Number(inserted.lastInsertRowid);
        ticket = `LEV-${today().replace(/-/g, "")}-${entityId}`;
        title = title || `طلب إجازة ${leaveType === "annual" ? "سنوية" : leaveType} (${days} يوم)`;
      } else if (type === "grievance") {
        if (!title) return res.status(400).json({ error: "موضوع الشكوى مطلوب" });
        if (!details) return res.status(400).json({ error: "تفاصيل الشكوى مطلوبة" });
        const category = String(req.body?.category || "work_environment");
        const isConfidential = req.body?.is_confidential ? 1 : 0;
        const againstPerson = String(req.body?.against_person || "") || null;
        const count = ((await db.prepare("SELECT COUNT(*) as c FROM employee_grievances").get() as any)?.c || 0) + 1;
        ticket = `GRV-${new Date().getFullYear()}-${String(count).padStart(3, "0")}`;
        const inserted = await db
          .prepare(
            `INSERT INTO employee_grievances
               (ticket_number, employee_id, category, subject, details, is_confidential, against_person, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
          )
          .run(ticket, employeeId, category, title, details, isConfidential, againstPerson);
        entityId = Number(inserted.lastInsertRowid);
      } else {
        // suggestion + workflow_improvement
        if (!title) return res.status(400).json({ error: "عنوان المقترح مطلوب" });
        if (!details) return res.status(400).json({ error: "تفاصيل المقترح مطلوبة" });
        const category = String(req.body?.category || "operations");
        const expectedImpact = String(req.body?.expected_impact || "") || null;
        const inserted = await db
          .prepare(
            `INSERT INTO employee_suggestions
               (employee_id, suggestion_type, title, details, category, expected_impact, status)
             VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
          )
          .run(employeeId, type, title, details, category, expectedImpact);
        entityId = Number(inserted.lastInsertRowid);
        ticket = `SUG-${today().replace(/-/g, "")}-${entityId}`;
      }

      // طلب الاعتماد: يربط المسار بالسجل الأصلي عبر entity_type/entity_id
      // حتى تنعكس نتيجة الاعتماد على السجل نفسه.
      const workflow = await db
        .prepare("SELECT id, levels_json FROM approval_workflows WHERE workflow_type = ? AND is_active = 1 LIMIT 1")
        .get(workflowType) as any;
      let approvalRequestId: number | null = null;
      if (workflow) {
        const levels = (() => {
          try {
            return JSON.parse(workflow.levels_json || "[]");
          } catch {
            return [];
          }
        })() as any[];
        const maxLevels = levels.length || 1;
        const inserted = await db
          .prepare(
            `INSERT INTO approval_requests
               (workflow_id, requester_id, request_type, request_title, amount, details,
                current_level, max_levels, status, approval_history_json, entity_type, entity_id)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'pending', '[]', ?, ?)`,
          )
          .run(
            workflow.id,
            employeeId,
            type,
            title,
            amount,
            details || title,
            maxLevels,
            spec.entityType,
            entityId,
          );
        approvalRequestId = Number(inserted.lastInsertRowid);
      }

      await logAction("create", "ess_request", entityId, `${spec.label} — ${employee.name}`);
      await createNotification(
        `${spec.label} جديد من الموظف`,
        `رفع الموظف ${employee.name} ${spec.label} برقم ${ticket} وهو بانتظار الاعتماد.`,
        "info",
      );

      res.json({
        success: true,
        type,
        id: entityId,
        ticket,
        title,
        status: "pending",
        approval_request_id: approvalRequestId,
        message: `تم رفع ${spec.label} بنجاح وهو بانتظار الاعتماد.`,
      });
    } catch (e) {
      log.error("ESS request create failed:", e);
      res.status(500).json({ error: "تعذّر رفع الطلب" });
    }
  });

  /** طلبات الموظف: سلف وإجازات وشكاوى ومقترحات مع حالة سير العمل لكل منها. */
  app.get("/api/ess/requests", async (req, res) => {
    try {
      const user = (req as any).user || {};
      const sessionEmployeeId = Number(user.employee_id || 0);
      const queryEmployeeId = Number(req.query?.employee_id || 0);
      // الموظف يرى طلباته فقط؛ أما الإشراف فيختار موظفاً من شاشة ESS.
      const employeeId = sessionEmployeeId > 0 ? sessionEmployeeId : queryEmployeeId;
      if (!employeeId) return res.json([]);
      const employeeRow = await db
        .prepare("SELECT name FROM employees WHERE id = ?")
        .get(employeeId) as any;
      const employeeName = employeeRow?.name || "";

      const loans = await db
        .prepare(
          `SELECT id, total_amount, remaining_amount, monthly_installment,
                  deduction_start_month, deduction_start_year, deduction_months,
                  deduction_applied_months, status, created_at
           FROM loans WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .all(employeeId) as any[];
      const leaves = await db
        .prepare(
          `SELECT id, type, start_date, end_date, days, status, reason, created_at
           FROM leaves WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .all(employeeId) as any[];
      const grievances = await db
        .prepare(
          `SELECT id, ticket_number, category, subject, details, is_confidential, status,
                  committee_notes, resolution_summary, created_at
           FROM employee_grievances WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .all(employeeId) as any[];
      const suggestions = await db
        .prepare(
          `SELECT id, suggestion_type, title, details, category, expected_impact, status,
                  hr_response, created_at
           FROM employee_suggestions WHERE employee_id = ? ORDER BY created_at DESC`,
        )
        .all(employeeId) as any[];

      // حالة سير العمل لكل سجل
      const approvals = await db
        .prepare(
          `SELECT ar.id, ar.entity_type, ar.entity_id, ar.status, ar.current_level, ar.max_levels,
                  ar.approval_history_json, ar.request_title, w.title as workflow_title
           FROM approval_requests ar
           JOIN approval_workflows w ON ar.workflow_id = w.id
           WHERE ar.requester_id = ?`,
        )
        .all(employeeId) as any[];
      const approvalByEntity = new Map<string, any>();
      for (const approval of approvals) {
        const key = `${approval.entity_type}:${approval.entity_id}`;
        if (!approvalByEntity.has(key)) approvalByEntity.set(key, approval);
      }
      const withWorkflow = (entityType: string, id: number) => {
        const approval = approvalByEntity.get(`${entityType}:${id}`);
        if (!approval) return { workflow_status: null, workflow_title: null, workflow_history: [] };
        let history: any[] = [];
        try {
          history = JSON.parse(approval.approval_history_json || "[]");
        } catch {
          history = [];
        }
        return {
          workflow_status: approval.status,
          workflow_title: approval.workflow_title,
          workflow_level: approval.current_level,
          workflow_max_levels: approval.max_levels,
          workflow_history: history,
        };
      };

      res.json({
        loans: loans.map((l) => ({ ...l, request_type: "loan", employee_name: employeeName, ...withWorkflow("loan", l.id) })),
        leaves: leaves.map((l) => ({ ...l, request_type: "leave", employee_name: employeeName, ...withWorkflow("leave", l.id) })),
        grievances: grievances.map((g) => ({ ...g, request_type: "grievance", employee_name: employeeName, ...withWorkflow("grievance", g.id) })),
        suggestions: suggestions.map((s) => ({
          ...s,
          request_type: s.suggestion_type,
          employee_name: employeeName,
          ...withWorkflow("suggestion", s.id),
        })),
      });
    } catch (e) {
      log.error("ESS requests list failed:", e);
      res.status(500).json({ error: "تعذّر استرجاع الطلبات" });
    }
  });
}
