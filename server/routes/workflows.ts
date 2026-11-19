// Route module. Registered from server/index.ts; the order there is the route order.
import db, { logAction, createNotification } from "../config/postgres";
import express from "express";

/**
 * يضمن وجود مسارات اعتماد بوابة الموظف (شكاوى/مقترحات/تطوير إجراءات).
 * البذرة الأولى تزرع المسارات فقط عند جدول فارغ، وقواعد الإنتاج زُرعت قبل
 * إضافة هذه الأنواع — فبدون هذا الضمان تُرفع طلبات الموظف بلا مسار اعتماد.
 * idempotent: يضيف الناقص فقط ولا يمس المسارات الموجودة أو المعدّلة.
 */
export async function ensureEssWorkflows(): Promise<void> {
  const missing: Array<{ type: string; title: string; description: string; levels: any[] }> = [
    {
      type: "grievance",
      title: "مسار فحص التظلمات الإدارية (المادة 209)",
      description: "تشكيل لجنة الفحص ثم عرض القرار على صاحب الصلاحية",
      levels: [
        { level: 1, approver_role: "hr_manager", approver_role_ar: "مدير الموارد البشرية", sla_hours: 48 },
        { level: 2, approver_role: "ceo", approver_role_ar: "الرئيس التنفيذي", sla_hours: 72 },
      ],
    },
    {
      type: "suggestion",
      title: "مسار استقبال المقترحات وقياس أثرها",
      description: "دراسة المقترح من الموارد البشرية ثم عرضه على صاحب القرار",
      levels: [
        { level: 1, approver_role: "hr_manager", approver_role_ar: "مدير الموارد البشرية", sla_hours: 72 },
        { level: 2, approver_role: "department_head", approver_role_ar: "رئيس القسم المعني", sla_hours: 120 },
      ],
    },
    {
      type: "process_improvement",
      title: "مسار مقترحات تطوير الإجراءات وسير العمل",
      description: "توصيات تطوير الإجراءات المعتمدة ومنهجية التنفيذ",
      levels: [
        { level: 1, approver_role: "hr_manager", approver_role_ar: "مدير الموارد البشرية", sla_hours: 72 },
        { level: 2, approver_role: "ceo", approver_role_ar: "الرئيس التنفيذي", sla_hours: 168 },
      ],
    },
  ];
  for (const wf of missing) {
    const existing = await db
      .prepare("SELECT id FROM approval_workflows WHERE workflow_type = ? LIMIT 1")
      .get(wf.type);
    if (existing) continue;
    await db.prepare(`
      INSERT INTO approval_workflows (workflow_type, title, description, conditions_json, levels_json, is_active)
      VALUES (?, ?, ?, '{}', ?, 1)
    `).run(wf.type, wf.title, wf.description, JSON.stringify(wf.levels));
    console.log(`[workflows] ensured missing workflow: ${wf.type}`);
  }
}

export function registerWorkflows(app: express.Express) {

  /**
   * ينقل قرار الاعتماد إلى السجل الأصلي الذي طلبه الموظف.
   *
   * الطلب في سير العمل وسجلُّه في جدوله (سلفة/إجازة/تظلم/مقترح) لهما
   * حالتان منفصلتان، فلولا هذا الربط لبقي السلف معلقاً بعد اعتماده،
   * أو فاعلاً قبل اعتماده.
   */
  async function applyDecisionToEntity(
    request: any,
    decision: "approved" | "rejected",
    comments: string,
    actorName: string,
  ): Promise<void> {
    const entityType = request?.entity_type;
    const entityId = Number(request?.entity_id || 0);
    if (!entityType || !entityId) return;
    const approved = decision === "approved";
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    try {
      if (entityType === "loan") {
        await db
          .prepare("UPDATE loans SET status = ? WHERE id = ?")
          .run(approved ? "active" : "rejected", entityId);
      } else if (entityType === "leave") {
        await db
          .prepare("UPDATE leaves SET status = ?, approved_at = ? WHERE id = ?")
          .run(approved ? "approved" : "rejected", approved ? stamp : null, entityId);
      } else if (entityType === "grievance") {
        await db
          .prepare("UPDATE employee_grievances SET status = ? WHERE id = ?")
          .run(approved ? "under_review" : "rejected", entityId);
      } else if (entityType === "suggestion") {
        await db
          .prepare(
            "UPDATE employee_suggestions SET status = ?, hr_response = ?, responded_at = ? WHERE id = ?",
          )
          .run(approved ? "accepted" : "rejected", comments || `قرار ${actorName}`, stamp, entityId);
      }
    } catch (e) {
      console.error("failed to apply workflow decision to entity:", e);
    }
  }

    // Recruitment

  app.get('/api/recruitment/jobs', async (req, res) => {
    const jobs = await db.prepare(`
      SELECT j.*, d.name as department_name 
      FROM job_openings j
      LEFT JOIN departments d ON j.department_id = d.id
    `).all();
    res.json(jobs);
  });

  app.post('/api/recruitment/jobs', async (req, res) => {
    const { title, department_id, description } = req.body;
    await db.prepare('INSERT INTO job_openings (title, department_id, description) VALUES (?, ?, ?)').run(title, department_id, description);
    res.json({ success: true });
  });

  app.get('/api/recruitment/candidates', async (req, res) => {
    const candidates = await db.prepare(`
      SELECT c.*, j.title as job_title 
      FROM candidates c
      LEFT JOIN job_openings j ON c.job_id = j.id
    `).all();
    res.json(candidates);
  });

  app.post('/api/recruitment/candidates', async (req, res) => {
    const { job_id, name, email, phone, cv_url, notes } = req.body;
    await db.prepare('INSERT INTO candidates (job_id, name, email, phone, cv_url, notes) VALUES (?, ?, ?, ?, ?, ?)').run(job_id, name, email, phone, cv_url, notes);
    res.json({ success: true });
  });

    // Checklists

  app.get('/api/checklists/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const items = await db.prepare('SELECT * FROM checklists WHERE employee_id = ?').all(employeeId);
    res.json(items);
  });

  app.post('/api/checklists', async (req, res) => {
    const { employee_id, item_name, type } = req.body;
    await db.prepare('INSERT INTO checklists (employee_id, item_name, type) VALUES (?, ?, ?)').run(employee_id, item_name, type);
    res.json({ success: true });
  });

  app.put('/api/checklists/:id/toggle', async (req, res) => {
    const { id } = req.params;
    await db.prepare('UPDATE checklists SET is_completed = 1 - is_completed WHERE id = ?').run(id);
    res.json({ success: true });
  });

    // Policies

  app.get('/api/policies', async (req, res) => {
    const data = await db.prepare('SELECT * FROM policies').all();
    res.json(data);
  });

    // Projects & Tasks

  app.get('/api/projects', async (req, res) => {
    const data = await db.prepare(`
      SELECT p.*, d.name as department_name 
      FROM projects p
      LEFT JOIN departments d ON p.department_id = d.id
    `).all();
    res.json(data);
  });

  app.post('/api/projects', async (req, res) => {
    const { name, department_id, start_date, end_date } = req.body;
    await db.prepare('INSERT INTO projects (name, department_id, start_date, end_date) VALUES (?, ?, ?, ?)').run(name, department_id, start_date, end_date);
    res.json({ success: true });
  });

  app.get('/api/tasks', async (req, res) => {
    const data = await db.prepare(`
      SELECT t.*, p.name as project_name, e.name as employee_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN employees e ON t.assignee_id = e.id
    `).all();
    res.json(data);
  });

  app.post('/api/tasks', async (req, res) => {
    const { project_id, employee_id, title, description, due_date } = req.body;
    await db.prepare('INSERT INTO tasks (project_id, employee_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)').run(project_id, employee_id, title, description, due_date);
    res.json({ success: true });
  });

    // ==========================================
    // 8. RAMADAN & WORKING HOURS POLICY (المادة 98)
    // ==========================================

  app.get('/api/policies/ramadan', async (req, res) => {
    const ramadanMode = await db.prepare("SELECT value FROM settings WHERE key = 'ramadan_mode'").get() as any;
    const ramadanHours = await db.prepare("SELECT value FROM settings WHERE key = 'ramadan_working_hours'").get() as any;
    const standardHours = await db.prepare("SELECT value FROM settings WHERE key = 'standard_working_hours'").get() as any;
    res.json({
      ramadan_mode: ramadanMode?.value === 'true',
      ramadan_working_hours: Number(ramadanHours?.value || 6),
      standard_working_hours: Number(standardHours?.value || 8)
    });
  });

  app.put('/api/policies/ramadan', async (req, res) => {
    const { ramadan_mode, ramadan_working_hours, standard_working_hours } = req.body;
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ramadan_mode', ?)").run(ramadan_mode ? 'true' : 'false');
    if (ramadan_working_hours) {
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ramadan_working_hours', ?)").run(String(ramadan_working_hours));
    }
    if (standard_working_hours) {
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('standard_working_hours', ?)").run(String(standard_working_hours));
    }
    await logAction('update', 'policy', null, `Updated Ramadan policy to ${ramadan_mode ? 'Enabled' : 'Disabled'}`);
    res.json({ success: true });
  });

    // GET workflows

  app.get("/api/workflows", async (req, res) => {
    const rows = await db.prepare("SELECT * FROM approval_workflows").all() as any[];
    const parsed = rows.map(r => ({
      ...r,
      conditions: JSON.parse(r.conditions_json || '{}'),
      levels: JSON.parse(r.levels_json || '[]')
    }));
    res.json(parsed);
  });

    // GET approval requests

  app.get("/api/workflow-requests", async (req, res) => {
    const rows = await db.prepare(`
      SELECT ar.*, w.title as workflow_title, w.levels_json, e.name as requester_name, d.name as requester_department
      FROM approval_requests ar
      JOIN approval_workflows w ON ar.workflow_id = w.id
      JOIN employees e ON ar.requester_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY ar.id DESC
    `).all() as any[];
    const parsed = rows.map(r => {
      const levels = JSON.parse(r.levels_json || '[]');
      const currentLevelObj = levels.find((l: any) => l.level === r.current_level);
      return {
        ...r,
        current_approver_role: currentLevelObj?.approver_role_ar || `المستوى ${r.current_level}`,
        history: JSON.parse(r.approval_history_json || '[]')
      };
    });
    res.json(parsed);
  });

    // POST action on approval request (approve / reject)

  app.post("/api/workflow-requests/:id/action", async (req, res) => {
    const { action, actor_name, comments } = req.body;
    const reqId = req.params.id;
    const request = await db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(reqId) as any;
    if (!request) return res.status(404).json({ error: "الطلب غير موجود" });
    const history = JSON.parse(request.approval_history_json || '[]');
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    history.push({
      level: request.current_level,
      actor_name: actor_name || 'مدير معتمد',
      action,
      action_date: nowStr,
      comments: comments || ''
    });
    let newStatus = request.status;
    let nextLevel = request.current_level;
    if (action === 'rejected') {
      newStatus = 'rejected';
    } else if (action === 'approved') {
      if (request.current_level >= request.max_levels) {
        newStatus = 'approved';
      } else {
        nextLevel = request.current_level + 1;
        newStatus = 'pending';
      }
    }
    await db.prepare(`
      UPDATE approval_requests 
      SET current_level = ?, status = ?, approval_history_json = ?
      WHERE id = ?
    `).run(nextLevel, newStatus, JSON.stringify(history), reqId);
    // القرار النهائي ينعكس على السجل الأصلي (سلفة/إجازة/تظلم/مقترح)،
    // حتى لا يبقى الطلب «معتمداً» في مكان وسليفاً في آخر.
    if (newStatus !== 'pending') {
      await applyDecisionToEntity(request, newStatus, comments || '', actor_name || 'مدير معتمد');
    }
    res.json({ success: true, newStatus, current_level: nextLevel });
  });

    // POST new approval request

  app.post("/api/workflow-requests", async (req, res) => {
    const { workflow_id, requester_id, request_type, request_title, amount, details } = req.body;
    const workflow = await db.prepare("SELECT * FROM approval_workflows WHERE id = ?").get(workflow_id) as any;
    if (!workflow) return res.status(404).json({ error: "المسار غير موجود" });
    const levels = JSON.parse(workflow.levels_json || '[]');
    const maxLevels = levels.length || 1;
    const result = await db.prepare(`
      INSERT INTO approval_requests (workflow_id, requester_id, request_type, request_title, amount, details, current_level, max_levels, status, approval_history_json)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'pending', '[]')
    `).run(workflow_id, requester_id, request_type || workflow.workflow_type, request_title, amount || 0, details || '', maxLevels);
    res.json({ success: true, id: result.lastInsertRowid });
  });

    // ====================================================
    // API: Kudos, Rewards & Surveys (التقدير والمكافآت والارتباط)
    // ====================================================

  app.get("/api/kudos", async (req, res) => {
    try {
      const rows = await db.prepare("SELECT * FROM peer_kudos ORDER BY created_at DESC LIMIT 50").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع بطاقات التقدير" });
    }
  });

  app.post("/api/kudos", async (req, res) => {
    try {
      const { sender_id, sender_name, recipient_id, recipient_name, recipient_job, core_value, message, points_awarded } = req.body;
      const result = await db.prepare(`
        INSERT INTO peer_kudos (sender_id, sender_name, recipient_id, recipient_name, recipient_job, core_value, message, points_awarded, likes_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(sender_id, sender_name, recipient_id, recipient_name, recipient_job || '', core_value || 'teamwork', message, points_awarded || 50);
      await createNotification('بطاقة تقدير جديدة (Kudos)', `حصل الموظف ${recipient_name} على بطاقة شكر من ${sender_name} بمقدار ${points_awarded || 50} نقطة!`, 'success');
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال بطاقة التقدير" });
    }
  });

  app.post("/api/kudos/:id/like", async (req, res) => {
    try {
      await db.prepare("UPDATE peer_kudos SET likes_count = likes_count + 1 WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل التفاعل" });
    }
  });

  app.get("/api/rewards/catalog", async (req, res) => {
    try {
      const rows = await db.prepare("SELECT * FROM reward_catalog ORDER BY points_required ASC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع متجر المكافآت" });
    }
  });

  app.get("/api/rewards/redemptions", async (req, res) => {
    try {
      const rows = await db.prepare("SELECT * FROM reward_redemptions ORDER BY created_at DESC").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع عمليات الاستبدال" });
    }
  });

  app.post("/api/rewards/redeem", async (req, res) => {
    try {
      const { employee_id, employee_name, reward_id, reward_title, points_spent } = req.body;
      const code = `RWD-${Date.now().toString().slice(-6)}`;
      const result = await db.prepare(`
        INSERT INTO reward_redemptions (employee_id, employee_name, reward_id, reward_title, points_spent, redemption_code, status)
        VALUES (?, ?, ?, ?, ?, ?, 'approved')
      `).run(employee_id, employee_name, reward_id, reward_title, points_spent, code);
      await db.prepare("UPDATE reward_catalog SET stock_quantity = MAX(0, stock_quantity - 1) WHERE id = ?").run(reward_id);
      res.json({ id: result.lastInsertRowid, redemption_code: code, success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل استبدال المكافأة" });
    }
  });

  app.get("/api/surveys/pulse", async (req, res) => {
    try {
      const rows = await db.prepare("SELECT * FROM pulse_survey_results").all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "فشل استرجاع استطلاعات النبض" });
    }
  });

    // ====================================================
    // API: Impending Document & Iqama Expiry Alerts (تنبيهات انتهاء الإقامات والتأمين)
    // ====================================================

  app.get("/api/alerts/expiries", async (req, res) => {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const employees = await db.prepare(`
        SELECT e.*, d.name as department_name, b.name as branch_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN branches b ON e.branch_id = b.id
      `).all() as any[];
      const alerts: Array<{
        id: string;
        category: 'iqama' | 'insurance' | 'contract' | 'work_permit' | 'vehicle';
        title: string;
        employee_id?: number;
        employee_name?: string;
        department_name?: string;
        document_number?: string;
        expiry_date: string;
        days_left: number;
        severity: 'critical' | 'warning' | 'info';
        status_text: string;
        action_label: string;
        action_type: string;
      }> = [];
      employees.forEach(emp => {
        const isSaudi = emp.is_saudi === 1 || emp.nationality === 'سعودي';
        if (!isSaudi && emp.iqama_expiry_gregorian) {
          const expDate = new Date(emp.iqama_expiry_gregorian);
          const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (days <= 90) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            let statusText = `متبقي ${days} يوم على انتهاء الإقامة`;
            if (days <= 0) {
              severity = 'critical';
              statusText = `الإقامة منتهية منذ ${Math.abs(days)} يوم (غرامة مضاعفة)`;
            } else if (days <= 30) {
              severity = 'critical';
              statusText = `حرج: متبقي ${days} يوم فقط على انتهاء الإقامة`;
            } else if (days <= 60) {
              severity = 'warning';
              statusText = `تنبيه: متبقي ${days} يوم على انتهاء الإقامة`;
            }
            alerts.push({
              id: `iqama-${emp.id}`,
              category: 'iqama',
              title: `تجديد إقامة: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: emp.national_id_iqama || emp.border_number || 'N/A',
              expiry_date: emp.iqama_expiry_gregorian,
              days_left: days,
              severity,
              status_text: statusText,
              action_label: 'تجديد فوري عبر قوى',
              action_type: 'renew_iqama'
            });
          }
        }
        if (emp.medical_insurance_expiry) {
          const medExp = new Date(emp.medical_insurance_expiry);
          const days = Math.ceil((medExp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (days <= 60) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            let statusText = `متبقي ${days} يوم على انتهاء وثيقة التأمين الطبي CCHI`;
            if (days <= 0) {
              severity = 'critical';
              statusText = `وثيقة التأمين الطبي منتهية منذ ${Math.abs(days)} يوم`;
            } else if (days <= 30) {
              severity = 'critical';
              statusText = `حرج: متبقي ${days} يوم على انتهاء بطاقة التأمين`;
            } else {
              severity = 'warning';
            }
            alerts.push({
              id: `med-${emp.id}`,
              category: 'insurance',
              title: `تجديد التأمين الطبي: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: emp.medical_insurance_policy || emp.insurance_number || 'N/A',
              expiry_date: emp.medical_insurance_expiry,
              days_left: days,
              severity,
              status_text: statusText,
              action_label: 'تجديد بوليصة التأمين CCHI',
              action_type: 'renew_insurance'
            });
          }
        }
        if (emp.contract_end_date && emp.contract_type === 'fixed') {
          const contExp = new Date(emp.contract_end_date);
          const days = Math.ceil((contExp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (days <= 90) {
            let severity: 'critical' | 'warning' | 'info' = 'info';
            if (days <= 0) severity = 'critical';
            else if (days <= 30) severity = 'critical';
            else if (days <= 60) severity = 'warning';
            alerts.push({
              id: `contract-${emp.id}`,
              category: 'contract',
              title: `انتهاء عقد العمل: ${emp.name}`,
              employee_id: emp.id,
              employee_name: emp.name,
              department_name: emp.department_name || 'عام',
              document_number: `عقد قوى محدد المدة`,
              expiry_date: emp.contract_end_date,
              days_left: days,
              severity,
              status_text: days <= 0 ? `العقد منتهي منذ ${Math.abs(days)} يوم` : `متبقي ${days} يوم على نهاية العقد (مهلة الإشعار)`,
              action_label: 'تجديد العقد في قوى',
              action_type: 'renew_contract'
            });
          }
        }
      });
      try {
        const vehicles = await db.prepare("SELECT * FROM fleet_vehicles").all() as any[];
        vehicles.forEach(v => {
          if (v.istimara_expiry) {
            const istExp = new Date(v.istimara_expiry);
            const days = Math.ceil((istExp.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (days <= 60) {
              alerts.push({
                id: `veh-ist-${v.id}`,
                category: 'vehicle',
                title: `تجديد رخصة سير مركبة: ${v.make_model} (${v.plate_number})`,
                document_number: v.plate_number,
                expiry_date: v.istimara_expiry,
                days_left: days,
                severity: days <= 15 ? 'critical' : 'warning',
                status_text: days <= 0 ? 'استمارة المركبة منتهية' : `متبقي ${days} يوم على فحص/استمارة المركبة`,
                action_label: 'تجديد عبر أبشر أعمال',
                action_type: 'renew_vehicle'
              });
            }
          }
        });
      } catch (err) {}
      alerts.sort((a, b) => {
        const severityRank = { critical: 0, warning: 1, info: 2 };
        if (severityRank[a.severity] !== severityRank[b.severity]) {
          return severityRank[a.severity] - severityRank[b.severity];
        }
        return a.days_left - b.days_left;
      });
      const summary = {
        total_alerts: alerts.length,
        critical_count: alerts.filter(a => a.severity === 'critical').length,
        warning_count: alerts.filter(a => a.severity === 'warning').length,
        iqama_count: alerts.filter(a => a.category === 'iqama').length,
        insurance_count: alerts.filter(a => a.category === 'insurance').length,
        contract_count: alerts.filter(a => a.category === 'contract').length
      };
      res.json({ summary, alerts });
    } catch (e) {
      console.error("Alerts error:", e);
      res.status(500).json({ error: "فشل استرجاع تنبيهات الوثائق" });
    }
  });

  app.post("/api/alerts/send-reminder", async (req, res) => {
    try {
      const { alert_id, title, message } = req.body;
      await createNotification(title || 'تذكير بالوثيقة', message || 'تم إرسال إشعار تذكيري لتجديد الوثيقة', 'warning');
      res.json({ success: true, message: 'تم إرسال الإشعار بنجاح' });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال التذكير" });
    }
  });

    // ---- Alerts: expiries, job mismatch, lateness ----

  app.get("/api/alerts/employee-expiries", async (req, res) => {
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const in180 = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10);
      const emps = await db.prepare("SELECT * FROM employees").all() as any[];
      const alerts: any[] = [];
      emps.forEach(e => {
        if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'iqama', label: 'إقامة', expiry: e.iqama_expiry_gregorian, days_left: Math.ceil((new Date(e.iqama_expiry_gregorian).getTime() - now.getTime()) / 86400000) });
        }
        if (e.health_cert_expiry && e.health_cert_expiry <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'health_cert', label: 'شهادة صحية', expiry: e.health_cert_expiry, days_left: Math.ceil((new Date(e.health_cert_expiry).getTime() - now.getTime()) / 86400000) });
        }
        if (e.passport_expiry && e.passport_expiry <= in180) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'passport', label: 'جواز سفر', expiry: e.passport_expiry, days_left: Math.ceil((new Date(e.passport_expiry).getTime() - now.getTime()) / 86400000) });
        }
        if (e.medical_insurance_expiry && e.medical_insurance_expiry <= in30) {
          alerts.push({ employee_id: e.id, name: e.name, type: 'medical', label: 'تأمين طبي', expiry: e.medical_insurance_expiry, days_left: Math.ceil((new Date(e.medical_insurance_expiry).getTime() - now.getTime()) / 86400000) });
        }
      });
      res.json(alerts);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/alerts/job-mismatch", async (req, res) => {
    try {
      const emps = await db.prepare("SELECT * FROM employees").all() as any[];
      const mismatches = emps.filter(e => {
        const iq = (e.iqama_profession || '').trim();
        const job = (e.job_title || e.position || '').trim();
        return iq && job && iq.toLowerCase() !== job.toLowerCase();
      }).map(e => ({
        employee_id: e.id, name: e.name, iqama_profession: e.iqama_profession, job_title: e.job_title || e.position
      }));
      res.json(mismatches);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/alerts/lateness", async (req, res) => {
    try {
      const rows = await db.prepare(`
        SELECT l.*, e.name as employee_name, b.name as branch_name
        FROM attendance_logs l
        LEFT JOIN employees e ON e.id = l.employee_id
        LEFT JOIN branches b ON b.id = l.branch_id
        WHERE l.status = 'late' OR l.check_in_time IS NULL
        ORDER BY l.check_in_time DESC LIMIT 200
      `).all();
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

}
