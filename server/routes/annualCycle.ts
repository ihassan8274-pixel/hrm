// دورة الزيادة السنوية: تنبيه قبل الذكرى بشهر ← تقييم سنوي ← قرار زيادة
// بسلسلة اعتماد: مشرف → مدير → مالية → موارد بشرية. لا يُحدَّث راتب الموظف
// إلا بعد الاعتماد النهائي. هوية الموظف في بوابة الموظف تُؤخذ من الجلسة فقط.

import express from "express";
import db, { logAction, createNotification } from "../config/postgres";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../middleware/organizationScope";
import { log } from "../lib/logger";

const APPROVAL_STEPS = [
  { key: "supervisor", label: "المشرف", roles: ["branch_manager", "admin", "hr_manager"] },
  { key: "manager", label: "المدير", roles: ["admin", "hr_manager"] },
  { key: "finance", label: "المالية", roles: ["finance", "admin", "hr_manager"] },
  { key: "hr", label: "الموارد البشرية", roles: ["admin", "hr_manager"] },
];

const CRITERIA = [
  { key: "attendance", label: "الالتزام والحضور" },
  { key: "quality", label: "جودة الأداء" },
  { key: "productivity", label: "الإنتاجية" },
  { key: "teamwork", label: "العمل الجماعي والقيادة" },
  { key: "safety", label: "السلامة وإجراءات الغذاء" },
] as const;

const ratingOf = (total: number) =>
  total <= 12 ? "يحتاج خطة تحسين" : total <= 17 ? "مقبول" : total <= 21 ? "جيد" : "ممتاز";

const suggestedPercent = (rating: string) =>
  rating === "ممتاز" ? 5 : rating === "جيد" ? 3 : rating === "مقبول" ? 2 : 0;

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getUTCFullYear();

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** الذكرى القادمة: تاريخ التعيين الكامل إن وُجد، وإلا أول يوم من شهر التعيين. */
function nextAnniversary(hireDate: string | null | undefined, hireMonth: number | null | undefined): Date | null {
  const year = currentYear();
  const now = new Date(todayISO() + "T00:00:00Z").getTime();
  let sourceYear = year, month = 0, day = 1;
  const hd = String(hireDate || "").slice(0, 10);
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hd);
  if (parsed) {
    sourceYear = Number(parsed[1]); month = Number(parsed[2]); day = Number(parsed[3]);
  } else if (hireMonth && hireMonth >= 1 && hireMonth <= 12) {
    month = hireMonth; day = 1;
  } else return null;

  let anniversary = new Date(Date.UTC(year, month - 1, Math.min(day, lastDayOfMonth(year, month))));
  if (anniversary.getTime() < now) {
    anniversary = new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDayOfMonth(year + 1, month))));
  }
  // تاريخ التعيين الكامل: نضيف عدد السنوات المكتملة بدل افتراض السنة الحالية.
  if (parsed && year > sourceYear) {
    anniversary = new Date(Date.UTC(year, month - 1, Math.min(day, lastDayOfMonth(year, month))));
    if (anniversary.getTime() < now) {
      anniversary = new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDayOfMonth(year + 1, month))));
    }
  }
  return anniversary;
}

function notifyDateOf(anniversary: Date): Date {
  const d = new Date(anniversary.getTime());
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/** generates one reminder per employee/year, at most once. */
export async function runAnnualNotifier() {
  try {
    const emps = await db.prepare(
      `SELECT id, name, to_char(hire_date, 'YYYY-MM-DD') AS hire_date, hire_month
       FROM employees
       WHERE status = 'active' AND (hire_date IS NOT NULL OR hire_month IS NOT NULL)`
    ).all() as any[];
    const today = new Date(todayISO() + "T00:00:00Z").getTime();
    let created = 0;

    for (const emp of emps) {
      const anniversary = nextAnniversary(emp.hire_date, emp.hire_month);
      if (!anniversary) continue;
      const notifyDate = notifyDateOf(anniversary);
      if (today < notifyDate.getTime()) continue;
      const year = anniversary.getUTCFullYear();

      const reviewed = await db.prepare(
        "SELECT 1 FROM annual_reviews WHERE employee_id = ? AND cycle_year = ? LIMIT 1"
      ).get(emp.id, year);
      if (reviewed) continue;

      const inserted = await db.prepare(
        `INSERT INTO annual_review_reminders (employee_id, cycle_year, notify_date, anniversary_date)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (employee_id, cycle_year) DO NOTHING`
      ).run(emp.id, year, isoDate(notifyDate), isoDate(anniversary));
      if (!inserted.changes) continue;

      const overdue = today > anniversary.getTime();
      await createNotification(
        overdue ? "تأخر التقييم السنوي" : "تنبيه زيادة سنوية",
        overdue
          ? `تجاوزت ذكرى تعيين ${emp.name} (${isoDate(anniversary)}) — يلزم التقييم وقرار الزيادة فوراً`
          : `ذكرى تعيين ${emp.name} في ${isoDate(anniversary)} — ابدأ التقييم السنوي وإجراءات الزيادة قبل ${isoDate(notifyDate)}`,
        overdue ? "error" : "warning"
      );
      created++;
    }
    if (created) log.info(`[annual] created ${created} annual-increase reminders`);
    return created;
  } catch (e) {
    log.error("[annual] notifier failed", e);
    return 0;
  }
}

export function startAnnualCycleScheduler() {
  setTimeout(() => { void runAnnualNotifier(); }, 8000).unref?.();
  setInterval(() => { void runAnnualNotifier(); }, 6 * 60 * 60 * 1000).unref?.();
}

/** استعلام الموظفين المقيد بصلاحية/frع/كيان المتصل. نص ثابت بلا أي إدخال من الطلب. */
const SCOPE_SQL =
  "(? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)";

/** Minor CSV safety: spreadsheets must not execute a cell as a formula. */
const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function registerAnnualCycle(app: express.Express) {
  app.get("/api/annual/overview", requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const p = [entityId, entityId, branchId, branchId, employeeId, employeeId];
      const counts = await db.prepare(
        "SELECT " +
        "(SELECT COUNT(*) FROM employees e WHERE e.status='active' AND " + SCOPE_SQL + ") AS employees, " +
        "(SELECT COUNT(*) FROM annual_reviews r JOIN employees e ON e.id=r.employee_id WHERE r.cycle_year=? AND " + SCOPE_SQL + ") AS reviews, " +
        "(SELECT COUNT(*) FROM annual_increase_decisions d JOIN employees e ON e.id=d.employee_id WHERE d.cycle_year=? AND d.status='approved' AND " + SCOPE_SQL + ") AS approved, " +
        "(SELECT COUNT(*) FROM annual_increase_decisions d JOIN employees e ON e.id=d.employee_id WHERE d.cycle_year=? AND d.status NOT IN ('approved','rejected') AND " + SCOPE_SQL + ") AS pending, " +
        "(SELECT COUNT(*) FROM annual_review_reminders rm JOIN employees e ON e.id=rm.employee_id WHERE rm.status='pending' AND " + SCOPE_SQL + ") AS reminders"
      ).get(...p, currentYear(), ...p, currentYear(), ...p, currentYear(), ...p, ...p) as any;
      res.json({ ...counts, year: currentYear(), criteria: CRITERIA, approval_steps: APPROVAL_STEPS });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/annual/reminders", requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const rows = await db.prepare(
        "SELECT rm.*, e.name AS employee_name, e.sponsorship_type, e.basic_salary, e.hire_month, " +
        "to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date, b.name AS branch_name " +
        "FROM annual_review_reminders rm " +
        "JOIN employees e ON e.id = rm.employee_id " +
        "LEFT JOIN branches b ON b.id = e.branch_id " +
        "WHERE " + SCOPE_SQL + " AND (? IS NULL OR rm.status = ?) " +
        "ORDER BY rm.notify_date, e.name"
      ).all(entityId, entityId, branchId, branchId, employeeId, employeeId,
            req.query.status ? String(req.query.status) : null, req.query.status ? String(req.query.status) : null);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/annual/reviews", requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const year = Number(req.query.year) || currentYear();
      const rows = await db.prepare(
        "SELECT r.*, e.name AS employee_name, e.sponsorship_type, e.basic_salary, " +
        "to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date " +
        "FROM annual_reviews r JOIN employees e ON e.id = r.employee_id " +
        "WHERE r.cycle_year = ? AND " + SCOPE_SQL + " ORDER BY e.name"
      ).all(year, entityId, entityId, branchId, branchId, employeeId, employeeId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/annual/reviews", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const employeeId = Number(req.body?.employee_id || 0);
      if (!employeeId) return res.status(400).json({ error: "الموظف مطلوب" });
      if (await denyEmployee(res, scope, employeeId)) return;

      const year = Number(req.body?.cycle_year) || currentYear();
      const scores = CRITERIA.map((c) => {
        const n = Number(req.body?.[`score_${c.key}`]);
        return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
      });
      const total = scores.reduce((a, b) => a + b, 0);
      const rating = ratingOf(total);
      const notes = Object.fromEntries(CRITERIA.map((c, i) => [`note_${c.key}`, String(req.body?.[`note_${c.key}`] || "")]));
      const saved = await db.prepare(
        `INSERT INTO annual_reviews
          (employee_id, cycle_year, reviewer_name, review_date, score_attendance, score_quality,
           score_productivity, score_teamwork, score_safety, total_score, rating,
           note_attendance, note_quality, note_productivity, note_teamwork, note_safety, summary, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (employee_id, cycle_year) DO UPDATE SET
           reviewer_name=EXCLUDED.reviewer_name, review_date=EXCLUDED.review_date,
           score_attendance=EXCLUDED.score_attendance, score_quality=EXCLUDED.score_quality,
           score_productivity=EXCLUDED.score_productivity, score_teamwork=EXCLUDED.score_teamwork,
           score_safety=EXCLUDED.score_safety, total_score=EXCLUDED.total_score, rating=EXCLUDED.rating,
           note_attendance=EXCLUDED.note_attendance, note_quality=EXCLUDED.note_quality,
           note_productivity=EXCLUDED.note_productivity, note_teamwork=EXCLUDED.note_teamwork,
           note_safety=EXCLUDED.note_safety, summary=EXCLUDED.summary, updated_at=CURRENT_TIMESTAMP
         RETURNING id`
      ).get(
        employeeId, year, String(req.body?.reviewer_name || (req as any).user?.name || ""),
        String(req.body?.review_date || todayISO()), ...scores, total, rating,
        ...CRITERIA.map((c) => notes[`note_${c.key}`]), String(req.body?.summary || "")
      ) as any;
      await db.prepare("UPDATE annual_review_reminders SET status='completed' WHERE employee_id=? AND cycle_year=?")
        .run(employeeId, year);
      await logAction("upsert", "annual_review", Number(saved?.id || employeeId), `تقييم ${year}: ${total}/25 — ${rating}`);
      await createNotification("اكتمل التقييم السنوي", `تم حفظ تقييم ${year} بدرجة ${total}/25 (${rating})`, "success", { employeeId: Number(employeeId) });
      res.json({ id: saved?.id, total, rating });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/annual/increases", requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const year = Number(req.query.year) || currentYear();
      const rows = await db.prepare(
        "SELECT d.*, e.name AS employee_name, e.sponsorship_type, r.total_score, r.rating, " +
        "(SELECT COUNT(*) FROM annual_increase_approvals a WHERE a.decision_id=d.id) AS approvals_done " +
        "FROM annual_increase_decisions d " +
        "JOIN employees e ON e.id = d.employee_id " +
        "LEFT JOIN annual_reviews r ON r.id = d.review_id " +
        "WHERE d.cycle_year = ? AND " + SCOPE_SQL + " ORDER BY e.name"
      ).all(year, entityId, entityId, branchId, branchId, employeeId, employeeId);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Audit-ready export: one row per decision/approval step, scoped exactly like
  // the on-screen lists. Arabic text is UTF-8 with a BOM so Excel opens it
  // correctly; no mock or placeholder rows are ever generated.
  app.get("/api/annual/audit", requireOrganizationScope, async (req, res) => {
    try {
      const { entityId, branchId, employeeId } = organizationScope(res);
      const year = Number(req.query.year) || currentYear();
      const rows = await db.prepare(
        "SELECT e.name AS employee_name, e.sponsorship_type, " +
        "to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date, e.hire_month, " +
        "r.review_date, r.total_score, r.rating, r.summary, " +
        "d.previous_salary, d.amount, d.percentage, d.new_salary, d.effective_date, d.reason, d.status AS decision_status, " +
        "a.step_index, a.step_name, a.approver_name, a.approver_role, a.action, a.note, " +
        "to_char(a.decided_at, 'YYYY-MM-DD HH24:MI:SS') AS decided_at " +
        "FROM annual_increase_decisions d " +
        "JOIN employees e ON e.id = d.employee_id " +
        "LEFT JOIN annual_reviews r ON r.id = d.review_id " +
        "LEFT JOIN annual_increase_approvals a ON a.decision_id = d.id " +
        "WHERE d.cycle_year = ? AND " + SCOPE_SQL + " ORDER BY e.name, a.step_index"
      ).all(year, entityId, entityId, branchId, branchId, employeeId, employeeId) as any[];

      const headers = [
        "الموظف", "فئة الكفالة", "تاريخ التعيين", "شهر التعيين", "تاريخ التقييم", "الدرجة", "التقدير",
        "ملخص التقييم", "الراتب السابق", "المبلغ", "النسبة %", "الراتب الجديد", "تاريخ النفاذ", "السبب",
        "حالة القرار", "رقم الخطوة", "الخطوة", "المعتمد", "دور المعتمد", "الإجراء", "ملاحظة", "وقت الاعتماد",
      ];
      const keys = [
        "employee_name", "sponsorship_type", "hire_date", "hire_month", "review_date", "total_score", "rating",
        "summary", "previous_salary", "amount", "percentage", "new_salary", "effective_date", "reason",
        "decision_status", "step_index", "step_name", "approver_name", "approver_role", "action", "note", "decided_at",
      ];
      const lines = [headers.map(csvCell).join(",")];
      for (const row of rows) lines.push(keys.map((k) => csvCell(row[k])).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="annual-increase-audit-${year}.csv"`);
      res.send("\uFEFF" + lines.join("\r\n"));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/annual/increases", requireOrganizationScope, async (req, res) => {
    try {
      const scope = organizationScope(res);
      const employeeId = Number(req.body?.employee_id || 0);
      if (!employeeId) return res.status(400).json({ error: "الموظف مطلوب" });
      if (await denyEmployee(res, scope, employeeId)) return;
      const year = Number(req.body?.cycle_year) || currentYear();

      const emp = await db.prepare("SELECT id, name, basic_salary FROM employees WHERE id = ?").get(employeeId) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const review = await db.prepare("SELECT * FROM annual_reviews WHERE employee_id=? AND cycle_year=?").get(employeeId, year) as any;
      if (!review) return res.status(400).json({ error: "يجب حفظ التقييم السنوي قبل إصدار قرار الزيادة" });

      const existing = await db.prepare("SELECT status FROM annual_increase_decisions WHERE employee_id=? AND cycle_year=?").get(employeeId, year) as any;
      if (existing?.status === "approved") return res.status(409).json({ error: "تم اعتماد زيادة هذا العام بالفعل" });

      const previous = Number(emp.basic_salary || 0);
      const explicit = String(req.body?.amount ?? "").trim();
      const pct = Number(req.body?.percentage || 0);
      const amount = explicit !== ""
        ? Math.max(0, Number(explicit) || 0)
        : Math.round(previous * (Number.isFinite(pct) && pct > 0 ? pct : suggestedPercent(review.rating))) / 100;
      const newSalary = Math.round((previous + amount) * 100) / 100;
      const effectiveDate = String(req.body?.effective_date || todayISO()).slice(0, 10);

      const saved = await db.prepare(
        `INSERT INTO annual_increase_decisions
          (employee_id, review_id, cycle_year, previous_salary, amount, percentage, new_salary,
           effective_date, reason, status, current_step, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (employee_id, cycle_year) DO UPDATE SET
           review_id=EXCLUDED.review_id, previous_salary=EXCLUDED.previous_salary, amount=EXCLUDED.amount,
           percentage=EXCLUDED.percentage, new_salary=EXCLUDED.new_salary, effective_date=EXCLUDED.effective_date,
           reason=EXCLUDED.reason, status='pending', current_step=0, created_by=EXCLUDED.created_by,
           updated_at=CURRENT_TIMESTAMP
         RETURNING id`
      ).get(
        employeeId, review.id, year, previous, amount, previous ? (amount / previous) * 100 : 0,
        newSalary, effectiveDate, String(req.body?.reason || ""), String((req as any).user?.name || "")
      ) as any;

      await logAction("create", "annual_increase_decision", Number(saved?.id || employeeId),
        `قرار زيادة ${year}: ${previous} → ${newSalary} ر.س`);
      res.json({ id: saved?.id, previous, amount, newSalary, status: "pending" });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/annual/increases/:id/approve", requireOrganizationScope, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const decision = await db.prepare("SELECT * FROM annual_increase_decisions WHERE id = ?").get(id) as any;
      if (!decision) return res.status(404).json({ error: "القرار غير موجود" });
      if (["approved", "rejected"].includes(decision.status)) {
        return res.status(400).json({ error: "تم إنهاء هذا القرار بالفعل" });
      }
      const step = APPROVAL_STEPS[Number(decision.current_step) || 0];
      if (!step) return res.status(400).json({ error: "لا توجد خطوة اعتماد متبقية" });
      const role = String((req as any).user?.role || "");
      if (!step.roles.includes(role)) {
        return res.status(403).json({ error: `هذه الخطوة من اختصاص: ${step.roles.join(" / ")}` });
      }

      const scope = organizationScope(res);
      if (await denyEmployee(res, scope, Number(decision.employee_id))) return;

      const action = String(req.body?.action || "approve") === "reject" ? "rejected" : "approved";
      await db.prepare(
        `INSERT INTO annual_increase_approvals (decision_id, step_index, step_name, approver_name, approver_role, action, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (decision_id, step_index) DO UPDATE SET
           approver_name=EXCLUDED.approver_name, approver_role=EXCLUDED.approver_role,
           action=EXCLUDED.action, note=EXCLUDED.note, decided_at=CURRENT_TIMESTAMP`
      ).run(id, decision.current_step, step.label,
        String((req as any).user?.name || ""), role, action, String(req.body?.note || ""));

      let status = step.key;
      let nextStep = Number(decision.current_step) + 1;
      if (action === "rejected") {
        status = "rejected";
      } else if (nextStep >= APPROVAL_STEPS.length) {
        status = "approved";
        nextStep = APPROVAL_STEPS.length;
        await db.prepare("UPDATE employees SET basic_salary = ? WHERE id = ?")
          .run(Number(decision.new_salary), Number(decision.employee_id));
        await createNotification("اعتماد زيادة سنوية",
          `تم اعتماد زيادة ${decision.cycle_year} وتحديث راتب الموظف رقم ${decision.employee_id} إلى ${decision.new_salary} ر.س`, "success",
          { employeeId: Number(decision.employee_id) });
      }
      await db.prepare("UPDATE annual_increase_decisions SET status=?, current_step=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(status, nextStep, id);
      await logAction(action === "rejected" ? "reject" : "approve", "annual_increase_decision", id,
        `${step.label} — ${action} — ${status}`);
      res.json({ id, status, next_step: APPROVAL_STEPS[nextStep]?.label || null });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // بوابة الموظف: بياناته وحده؛ أي employee_id في الطلب يُتجاهل تماماً.
  app.get("/api/annual/me", requireOrganizationScope, async (req, res) => {
    try {
      const { employeeId } = organizationScope(res);
      if (!employeeId) return res.status(400).json({ error: "لا يوجد موظف مرتبط بهذا الحساب" });
      const year = Number(req.query.year) || currentYear();
      const emp = await db.prepare(
        `SELECT id, name, basic_salary, sponsorship_type, hire_month, to_char(hire_date, 'YYYY-MM-DD') AS hire_date
         FROM employees WHERE id = ?`
      ).get(employeeId) as any;
      if (!emp) return res.status(404).json({ error: "الموظف غير موجود" });
      const anniversary = nextAnniversary(emp.hire_date, emp.hire_month);
      const review = await db.prepare("SELECT * FROM annual_reviews WHERE employee_id=? AND cycle_year=?").get(employeeId, year);
      const decision = await db.prepare("SELECT * FROM annual_increase_decisions WHERE employee_id=? AND cycle_year=?").get(employeeId, year);
      res.json({
        year, employee: emp,
        anniversary: anniversary ? isoDate(anniversary) : null,
        reminder_date: anniversary ? isoDate(notifyDateOf(anniversary)) : null,
        review: review || null, decision: decision || null,
        suggested_percent: review ? suggestedPercent((review as any).rating) : 0,
        approval_steps: APPROVAL_STEPS,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/annual/scheduler/run", async (_req, res) => {
    const created = await runAnnualNotifier();
    res.json({ created });
  });
}
