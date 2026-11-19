import db, { logAction, createNotification } from "../../config/postgres";
import express from "express";
import { requireOrganizationScope, organizationScope, denyEmployee } from "../../middleware/organizationScope";
import { scopeFilter } from "../../lib/organization-scope";
import { validateBody, loanCreateSchema, loanStatusUpdateSchema } from "../../middleware/validation";

/**
 * Employee loans (السلف): a request that goes through the approval workflow
 * before it becomes an active deduction on the payroll.
 */
export function registerLoans(app: express.Express) {
  app.get("/api/loans", requireOrganizationScope, async (req, res) => {
    const scope = organizationScope(res);
    const data = (await db.prepare(`
      SELECT l.*, e.name as employee_name
      FROM loans l
      JOIN employees e ON l.employee_id = e.id
      WHERE l.status IN ('active', 'pending', 'rejected')
        AND (? IS NULL OR e.entity_id = ?)
        AND (? IS NULL OR e.branch_id = ?)
        AND (? IS NULL OR e.id = ?)
      ORDER BY l.created_at DESC
    `).all(...scopeFilter(scope))) as any[];
    // مسار الاعتماد لكل سلفة: المستوى الحالي وسجل القرارات من محرّك سير العمل.
    const approvals = (await db.prepare(`
      SELECT ar.entity_id, ar.status as workflow_status, ar.current_level, ar.max_levels,
             ar.approval_history_json, w.title as workflow_title
      FROM approval_requests ar
      JOIN approval_workflows w ON ar.workflow_id = w.id
      WHERE ar.entity_type = 'loan'
    `).all()) as any[];
    const byLoan = new Map(approvals.map((a) => [Number(a.entity_id), a]));
    const enriched = data.map((loan) => {
      const a = byLoan.get(Number(loan.id));
      return {
        ...loan,
        workflow_status: a?.workflow_status ?? null,
        workflow_title: a?.workflow_title ?? null,
        workflow_level: a?.current_level ?? null,
        workflow_max_levels: a?.max_levels ?? null,
        workflow_history: (() => {
          try { return JSON.parse(a?.approval_history_json || "[]"); } catch { return []; }
        })(),
      };
    });
    res.json(enriched);
  });

  // ينشئ طلب اعتماد مرتبطاً بالسلفة عبر مسار loan_advance النشط، بنفس منطق
  // بوابة الموظف (essRequests) حتى يظهر الطلب في صندوق اعتماد المدير.
  const createLoanApproval = async (loanId: number, employee: { id: number; name: string }, total: number) => {
    const workflow = await db
      .prepare("SELECT id, levels_json FROM approval_workflows WHERE workflow_type = 'loan_advance' AND is_active = 1 LIMIT 1")
      .get() as any;
    if (!workflow) return null;
    const levels = (() => {
      try { return JSON.parse(workflow.levels_json || "[]"); } catch { return []; }
    })() as any[];
    const inserted = await db.prepare(`
      INSERT INTO approval_requests
        (workflow_id, requester_id, request_type, request_title, amount, details,
         current_level, max_levels, status, approval_history_json, entity_type, entity_id)
      VALUES (?, ?, 'loan', ?, ?, ?, 1, ?, 'pending', '[]', 'loan', ?)
    `).run(
      workflow.id,
      employee.id,
      `طلب سلفة بمبلغ ${total.toLocaleString("ar-SA")} ر.س — ${employee.name}`,
      total,
      `سلفة للموظف ${employee.name} بقسط شهري يُخصم من الراتب`,
      levels.length || 1,
      loanId,
    );
    return Number(inserted.lastInsertRowid);
  };

  app.post("/api/loans", requireOrganizationScope, validateBody(loanCreateSchema), async (req, res) => {
    const { employee_id, total_amount, monthly_installment } = req.body;
    if (await denyEmployee(res, organizationScope(res), Number(employee_id))) return;
    if (Number(monthly_installment) > Number(total_amount)) {
      return res.status(400).json({ error: 'القسط الشهري أكبر من قيمة السلفة' });
    }
    const employee = await db.prepare('SELECT id, name FROM employees WHERE id = ?').get(employee_id) as any;
    const info = (await db.prepare(`
      INSERT INTO loans (employee_id, total_amount, remaining_amount, monthly_installment, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(employee_id, total_amount, total_amount, monthly_installment));
    const loanId = Number(info.lastInsertRowid);
    const approvalRequestId = await createLoanApproval(loanId, employee, Number(total_amount));
    await logAction('create', 'loan', loanId, `Created loan request for employee ${employee_id} of ${total_amount} (pending approval)`);
    await createNotification(
      'طلب سلفة جديد',
      `سلفة بمبلغ ${Number(total_amount).toLocaleString("ar-SA")} ر.س للموظف ${employee?.name || employee_id} بانتظار الاعتماد.`,
      'info',
    );
    res.json({ success: true, id: loanId, approval_request_id: approvalRequestId, status: 'pending' });
  });

  app.put("/api/loans/:id/status", requireOrganizationScope, validateBody(loanStatusUpdateSchema), async (req, res) => {
    const { status, comments } = req.body;
    const loan = (await db.prepare(`
      SELECT l.*, e.name as employee_name FROM loans l
      JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(req.params.id)) as any;
    if (!loan) return res.status(404).json({ error: 'السلفة غير موجودة' });
    if (await denyEmployee(res, organizationScope(res), loan.employee_id, 'السلفة')) return;
    if (loan.status !== 'pending') {
      return res.status(400).json({ error: 'لا يمكن تغيير حالة سلفة غير معلّقة' });
    }
    await db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, loan.id);

    // مزامنة طلب الاعتماد المرتبط: القرار النهائي يُسجَّل في تاريخ المسار.
    const user = (req as any).user || {};
    const actorName = String(user.name || user.username || 'مدير معتمد');
    const approval = await db.prepare(`
      SELECT * FROM approval_requests WHERE entity_type = 'loan' AND entity_id = ? ORDER BY id DESC LIMIT 1
    `).get(loan.id) as any;
    if (approval) {
      const history = (() => {
        try { return JSON.parse(approval.approval_history_json || '[]'); } catch { return []; }
      })() as any[];
      history.push({
        level: approval.current_level,
        actor_name: actorName,
        action: status === 'active' ? 'approved' : 'rejected',
        action_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        comments: comments || '',
      });
      await db.prepare(`
        UPDATE approval_requests
        SET status = ?, current_level = max_levels, approval_history_json = ?
        WHERE id = ?
      `).run(status === 'active' ? 'approved' : 'rejected', JSON.stringify(history), approval.id);
    }
    await logAction(status === 'active' ? 'approve' : 'reject', 'loan', loan.id,
      `Loan ${loan.id} for ${loan.employee_name} → ${status}${comments ? ` — ${comments}` : ''}`);
    await createNotification(
      status === 'active' ? 'اعتماد سلفة' : 'رفض سلفة',
      `${status === 'active' ? 'اعتُمدت' : 'رُفضت'} سلفة الموظف ${loan.employee_name} بمبلغ ${Number(loan.total_amount).toLocaleString("ar-SA")} ر.س.`,
      status === 'active' ? 'success' : 'warning',
    );
    res.json({ success: true, id: loan.id, status });
  });
}
