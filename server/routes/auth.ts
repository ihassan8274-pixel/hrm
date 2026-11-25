// Route module. Registered from server/index.ts; the order there is the route order.
import db from "../config/postgres";
import { JWT_SECRET, JWT_EXPIRY, authLimiter, authenticateToken, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  signupRequestSchema,
  passwordResetRequestSchema,
} from "../middleware/validation";
import { AccessError, readAccessConfig, verifyAccessAssertion } from "../lib/cloudflare-access";
import { countActiveAdminsAfter } from "../lib/account-guards";
import { DEFAULT_ADMIN_PASSWORD } from "../config/credentials";
import { hashPassword, needsRehash, verifyPassword, verifyPasswordSync } from "../lib/password";
import jwt from "jsonwebtoken";
import express from "express";
import { randomUUID, randomInt } from "crypto";
import { log } from "../lib/logger";

export function registerAuth(app: express.Express) {

  // Both the password login and the federated login end in the same local session,
  // so the two paths cannot drift apart in what they grant.
  const issueSession = async (user: any, req: express.Request) => {
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, entity_id: user.entity_id, employee_id: user.employee_id, jti: randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // Server-side idle enforcement starts at login; browsers extend it only on
    // genuine user input through POST /api/auth/activity.
    await db.prepare("INSERT INTO sessions (user_id, token, expires_at, ip_address, auth_last_activity) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, token, expiresAt, req.ip, new Date().toISOString());
    const entity = user.entity_id
      ? await db.prepare("SELECT * FROM entities WHERE id = ?").get(user.entity_id) as any
      : null;
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        entity_id: user.entity_id,
        employee_id: user.employee_id,
        // The client routes straight to the change-password screen when set.
        must_change_password: user.must_change_password === 1,
        entity: entity ? { id: entity.id, name_ar: entity.name_ar, name_en: entity.name_en, country_code: entity.country_code, currency: entity.currency } : null
      }
    };
  };

    // Login

  app.post("/api/auth/login", authLimiter, validateBody(loginSchema), async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      const user = await db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username) as any;
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const validPassword = await verifyPassword(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      // Legacy bcrypt hashes keep working, but are upgraded without holding up
      // the response. The conditional UPDATE makes concurrent logins harmless.
      if (needsRehash(user.password_hash)) {
        void hashPassword(password)
          .then((newHash) =>
            db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?")
              .run(newHash, user.id, user.password_hash),
          )
          .catch((err) => log.warn("Password rehash failed:", err));
      }
      res.json(await issueSession(user, req));
    } catch (err) {
      log.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Register (admin only)

  app.post("/api/auth/register", authenticateToken, requireRole('admin'), validateBody(registerSchema), async (req, res) => {
    try {
      const { username, password, role, entity_id, employee_id, email } = req.body;
      if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
      }
      const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }
      // An account may only be bound to an entity that exists — a dangling
      // entity_id would silently widen or narrow the account's reach.
      if (entity_id) {
        const entity = await db.prepare("SELECT id FROM entities WHERE id = ?").get(entity_id);
        if (!entity) {
          return res.status(400).json({ error: "الكيان غير موجود" });
        }
      }
      if (employee_id && !await db.prepare("SELECT id FROM employees WHERE id = ?").get(employee_id)) {
        return res.status(400).json({ error: "الموظف غير موجود" });
      }
      const address = String(email ?? "").trim().toLowerCase();
      if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
      }
      const passwordHash = await hashPassword(password);
      try {
        // An admin-created account starts on a password somebody else chose, so
        // it carries the same forced-change obligation as a provisioned one.
        const result = await db.prepare(
          "INSERT INTO users (username, password_hash, role, entity_id, employee_id, email, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)"
        ).run(username, passwordHash, role, entity_id || null, employee_id || null, address || null);
        res.json({ success: true, user_id: result.lastInsertRowid });
      } catch (err: any) {
        if (String(err?.message || "").includes("UNIQUE")) {
          return res.status(409).json({ error: "هذا البريد مرتبط بحساب آخر" });
        }
        throw err;
      }
    } catch (err) {
      log.error("Register error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Public registration request (fail-closed)
    //
    // This is deliberately NOT /api/auth/register. It only stages the request
    // for an administrator; it never creates a user, a session, or grants a
    // role. The chosen password is kept as a one-way hash so the approving admin
    // can create the account without ever seeing the clear text.

  app.post("/api/auth/signup-request", authLimiter, validateBody(signupRequestSchema), async (req, res) => {
    try {
      const { full_name, email, phone, username, password } = req.body;
      const address = String(email).trim().toLowerCase();
      const handle = String(username).trim();
      const passwordHash = await hashPassword(password);
      const result = await db.prepare(
        "INSERT INTO signup_requests (full_name, email, phone, username, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)"
      ).run(String(full_name).trim(), address, String(phone).trim(), handle, passwordHash);
      log.info(`[auth] signup request #${result.lastInsertRowid} queued for review`);
      // The reference number is the only thing the requester gets back — no
      // token, no role, no indication that an account now exists.
      res.status(201).json({ id: Number(result.lastInsertRowid), status: "pending" });
    } catch (err) {
      log.error("Signup request error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Public password-recovery request (fail-closed)
    //
    // The answer is identical whether or not the username/email pair matches an
    // active account, so the endpoint cannot be used to enumerate staff. A
    // match only stages a row for an administrator; no session, token, role or
    // new password is created, and no secret is ever stored in clear text.

  app.post("/api/auth/password-reset-request", authLimiter, validateBody(passwordResetRequestSchema), async (req, res) => {
    try {
      const handle = String(req.body.username).trim();
      const address = String(req.body.email).trim().toLowerCase();
      const user = await db.prepare(
        "SELECT id, username FROM users WHERE username = ? AND lower(COALESCE(email, '')) = ? AND status = 'active'"
      ).get(handle, address) as any;
      if (user) {
        // One open request per account: repeated form submissions must not
        // flood the administrator's review queue.
        await db.prepare(
          `INSERT INTO password_reset_requests (user_id, username, contact_email, status, created_at)
           SELECT ?, ?, ?, 'pending', CURRENT_TIMESTAMP
           WHERE NOT EXISTS (
             SELECT 1 FROM password_reset_requests WHERE user_id = ? AND status = 'pending'
           )`
        ).run(user.id, user.username, address, user.id);
      }
      res.json({
        success: true,
        message: "إن كان الحساب موجوداً، ستتم مراجعة الطلب من مدير النظام. لا يُنشأ تسجيل دخول من هذا الطلب."
      });
    } catch (err) {
      log.error("Password reset request error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Get current user

  app.get("/api/auth/me", authenticateToken, (req, res) => {
    const user = (req as any).user;
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      entity_id: user.entity_id,
      employee_id: user.employee_id
    });
  });

    // Idle heartbeat: only a real user action may extend the server-side session.
    // Background polling deliberately does not call this route.

  app.post("/api/auth/activity", authenticateToken, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access token required" });
    await db.prepare("UPDATE sessions SET auth_last_activity = ? WHERE token = ? AND user_id = ?")
      .run(new Date().toISOString(), token, (req as any).user?.id);
    res.json({ success: true });
  });

    // Logout

  app.post("/api/auth/logout", authenticateToken, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    res.json({ success: true });
  });

    // Change password

  app.put("/api/auth/change-password", authenticateToken, validateBody(changePasswordSchema), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
      }
      const user = (req as any).user;
      const dbUser = await db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as any;
      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const validPassword = await verifyPassword(currentPassword, dbUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: "Current password incorrect" });
      }
      const newHash = await hashPassword(newPassword);
      // Clearing the flag is the whole point of the forced change.
      await db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
        .run(newHash, user.id);
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      await db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, token);
      res.json({ success: true });
    } catch (err) {
      log.error("Change password error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Federated identity (Cloudflare Access)

  // The client asks before it tries, so a deployment without Access shows the
  // ordinary password form and never fires a request that is destined to fail.
  app.get("/api/auth/sso-config", (_req, res) => {
    res.json({ enabled: readAccessConfig() !== null });
  });

  // The login screen offers the factory-default admin credential only while it is
  // still the live password. Once admin is changed or reset, this flips to false so
  // the quick-fill helper disappears and never pre-fills a value that no longer signs in.
  app.get("/api/auth/bootstrap-status", authLimiter, async (_req, res) => {
    const admin = await db.prepare("SELECT password_hash, must_change_password FROM users WHERE username = 'admin'").get() as any;
    const defaultAdminActive = !!admin && admin.must_change_password === 1 && verifyPasswordSync(DEFAULT_ADMIN_PASSWORD, admin.password_hash);
    res.json({ defaultAdminActive });
  });

  app.post("/api/auth/sso-login", authLimiter, async (req, res) => {
    const config = readAccessConfig();
    if (!config) {
      return res.status(404).json({ error: "الدخول الموحد غير مفعّل على هذا الخادم" });
    }
    try {
      const identity = await verifyAccessAssertion(req.get("cf-access-jwt-assertion"), config);
      const user = await db.prepare("SELECT * FROM users WHERE lower(email) = ? AND status = 'active'").get(identity.email) as any;
      if (!user) {
        return res.status(403).json({ error: "لا يوجد حساب رواتب مرتبط بهذا البريد — اربط البريد بالحساب أولًا" });
      }
      res.json(await issueSession(user, req));
    } catch (err) {
      if (err instanceof AccessError) return res.status(err.status).json({ error: err.message });
      log.error("SSO login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Identity binding (admin only)

  app.get("/api/auth/users", authenticateToken, requireRole('admin'), async (_req, res) => {
    const users = await db.prepare(
      `SELECT u.id, u.username, u.role, u.status, u.email, u.entity_id, u.employee_id, u.must_change_password,
              e.name_ar AS entity_name, emp.name AS employee_name
       FROM users u
       LEFT JOIN entities e ON e.id = u.entity_id
       LEFT JOIN employees emp ON emp.id = u.employee_id
       ORDER BY u.id`
    ).all();
    res.json(users);
  });

  // Binding an address to an account is what lets a federated identity reach it,
  // so it is an administrative act and never a self-service one.
  app.put("/api/auth/users/:id/email", authenticateToken, requireRole('admin'), async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
    }
    const target = await db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!target) return res.status(404).json({ error: "الحساب غير موجود" });
    try {
      await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email || null, req.params.id);
    } catch (err: any) {
      if (String(err?.message || "").includes("UNIQUE")) {
        return res.status(409).json({ error: "هذا البريد مرتبط بحساب آخر" });
      }
      throw err;
    }
    res.json({ success: true, email: email || null });
  });

    // Account administration (admin only)

  const ACCOUNT_ROLES = ["admin", "hr_manager", "finance", "branch_manager", "employee_ess"];

    // Registration-request review (admin only) — approval is what creates the account.

  app.get("/api/auth/signup-requests", authenticateToken, requireRole('admin'), async (_req, res) => {
    const rows = await db.prepare(
      `SELECT id, full_name, email, phone, username, status, review_note, created_at, reviewed_at
       FROM signup_requests
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC`
    ).all();
    // password_hash is intentionally never selected: this list is admin-only,
    // but a hash leaks nothing useful and should not travel at all.
    res.json(rows);
  });

  app.post("/api/auth/signup-requests/:id/approve", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const request = await db.prepare("SELECT * FROM signup_requests WHERE id = ?").get(req.params.id) as any;
      if (!request) return res.status(404).json({ error: "الطلب غير موجود" });
      if (request.status !== 'pending') {
        return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
      }

      // Least privilege by default. A requester cannot ask for `admin` here —
      // that would turn an anonymous form into a privilege-escalation path.
      const role = req.body?.role === undefined ? "employee_ess" : String(req.body.role);
      if (!ACCOUNT_ROLES.includes(role) || role === "admin") {
        return res.status(400).json({ error: "الدور المطلوب غير مسموح به" });
      }
      const entity_id = req.body?.entity_id || null;
      const employee_id = req.body?.employee_id || null;
      if (entity_id && !await db.prepare("SELECT id FROM entities WHERE id = ?").get(entity_id)) {
        return res.status(400).json({ error: "الكيان غير موجود" });
      }
      if (employee_id && !await db.prepare("SELECT id FROM employees WHERE id = ?").get(employee_id)) {
        return res.status(400).json({ error: "الموظف غير موجود" });
      }
      const clash = await db.prepare(
        "SELECT id FROM users WHERE username = ? OR lower(email) = lower(?)"
      ).get(request.username, request.email) as any;
      if (clash) {
        return res.status(409).json({ error: "اسم المستخدم أو البريد مرتبط بحساب موجود — ارفض الطلب واطلب بيانات أخرى" });
      }

      const actor = (req as any).user;
      const userId = await db.transaction(async () => {
        // Re-check inside the transaction so two concurrent approvals cannot
        // create two accounts from the same request.
        const fresh = await db.prepare("SELECT status FROM signup_requests WHERE id = ?").get(req.params.id) as any;
        if (!fresh || fresh.status !== 'pending') throw new Error("ALREADY_REVIEWED");
        const inserted = await db.prepare(
          "INSERT INTO users (username, password_hash, role, entity_id, employee_id, email, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)"
        ).run(request.username, request.password_hash, role, entity_id, employee_id, request.email);
        await db.prepare(
          "UPDATE signup_requests SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, user_id = ? WHERE id = ?"
        ).run(actor.id, inserted.lastInsertRowid, req.params.id);
        return inserted.lastInsertRowid;
      })();
      res.json({ success: true, user_id: Number(userId) });
    } catch (err: any) {
      if (String(err?.message).includes("ALREADY_REVIEWED")) {
        return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
      }
      if (String(err?.message || "").includes("UNIQUE")) {
        return res.status(409).json({ error: "اسم المستخدم أو البريد مرتبط بحساب موجود" });
      }
      log.error("Signup request approval error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/signup-requests/:id/reject", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const fresh = await db.prepare("SELECT status FROM signup_requests WHERE id = ?").get(req.params.id) as any;
      if (!fresh) return res.status(404).json({ error: "الطلب غير موجود" });
      if (fresh.status !== 'pending') {
        return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
      }
      const note = String(req.body?.note ?? "").trim().slice(0, 500) || null;
      const actor = (req as any).user;
      await db.prepare(
        "UPDATE signup_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?"
      ).run(actor.id, note, req.params.id);
      res.json({ success: true });
    } catch (err) {
      log.error("Signup request rejection error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

    // Password-recovery requests: review is administrative. Closing a request
    // does not reset the password by itself — the admin must issue a temporary
    // credential through /api/auth/users/:id/password, which invalidates all
    // existing sessions and forces a change on first login.

  app.get("/api/auth/password-reset-requests", authenticateToken, requireRole('admin'), async (_req, res) => {
    const rows = await db.prepare(
      `SELECT r.id, r.user_id, r.username, r.contact_email, r.status, r.created_at, r.reviewed_at, r.review_note,
              u.status AS account_status
       FROM password_reset_requests r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC`
    ).all();
    res.json(rows);
  });

  const reviewPasswordResetRequest = async (req: express.Request, res: express.Response, action: 'resolved' | 'rejected') => {
    try {
      const request = await db.prepare("SELECT id, status FROM password_reset_requests WHERE id = ?").get(req.params.id) as any;
      if (!request) return res.status(404).json({ error: "الطلب غير موجود" });
      if (request.status !== 'pending') {
        return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
      }
      const note = String(req.body?.review_note ?? "").trim().slice(0, 500) || null;
      const actor = (req as any).user;
      await db.prepare(
        "UPDATE password_reset_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(action, note, actor.id, req.params.id);
      res.json({ success: true, status: action });
    } catch (err) {
      log.error("Password reset request review error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  app.post("/api/auth/password-reset-requests/:id/resolve", authenticateToken, requireRole('admin'),
    (req, res) => { void reviewPasswordResetRequest(req, res, 'resolved'); });

  app.post("/api/auth/password-reset-requests/:id/reject", authenticateToken, requireRole('admin'),
    (req, res) => { void reviewPasswordResetRequest(req, res, 'rejected'); });

  // An admin who demotes or suspends themselves, or removes the last active
  // admin, locks everybody out of the screen that could undo it.
  app.put("/api/auth/users/:id", authenticateToken, requireRole('admin'), async (req, res) => {
    const target = await db.prepare("SELECT id, role, status, entity_id, employee_id FROM users WHERE id = ?").get(req.params.id) as any;
    if (!target) return res.status(404).json({ error: "الحساب غير موجود" });

    const actor = (req as any).user;
    const role = req.body?.role === undefined ? target.role : String(req.body.role);
    const status = req.body?.status === undefined ? target.status : String(req.body.status);
    if (!ACCOUNT_ROLES.includes(role)) return res.status(400).json({ error: "الدور غير معروف" });
    if (!["active", "suspended"].includes(status)) return res.status(400).json({ error: "حالة الحساب غير معروفة" });

    if (Number(target.id) === Number(actor.id) && (role !== 'admin' || status !== 'active')) {
      return res.status(400).json({ error: "لا يمكنك تخفيض دور حسابك أو إيقافه — اطلب ذلك من مدير آخر" });
    }
    const activeAdminCount = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as any;
    if (countActiveAdminsAfter(Number(activeAdminCount?.count || 0), target.role, target.status, role, status) === 0) {
      return res.status(400).json({ error: "لازم يفضل حساب مدير نشط واحد على الأقل في النظام" });
    }

    const entity_id = req.body?.entity_id === undefined ? target.entity_id : (req.body.entity_id || null);
    const employee_id = req.body?.employee_id === undefined ? target.employee_id : (req.body.employee_id || null);
    if (entity_id && !await db.prepare("SELECT id FROM entities WHERE id = ?").get(entity_id)) {
      return res.status(400).json({ error: "الكيان غير موجود" });
    }
    if (employee_id && !await db.prepare("SELECT id FROM employees WHERE id = ?").get(employee_id)) {
      return res.status(400).json({ error: "الموظف غير موجود" });
    }

    await db.prepare("UPDATE users SET role = ?, status = ?, entity_id = ?, employee_id = ? WHERE id = ?")
      .run(role, status, entity_id, employee_id, target.id);
    res.json({ success: true });
  });

  // Resetting someone else's credential is an administrative act; resetting your
  // own goes through change-password, which still demands the current password.
  app.put("/api/auth/users/:id/password", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const target = await db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id) as any;
      if (!target) return res.status(404).json({ error: "الحساب غير موجود" });
      if (Number(target.id) === Number((req as any).user.id)) {
        return res.status(400).json({ error: "لتغيير كلمة مرورك استخدم شاشة تغيير كلمة المرور" });
      }

      const supplied = req.body?.newPassword === undefined ? "" : String(req.body.newPassword);
      if (supplied && supplied.length < 8) {
        return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
      }
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      const password = supplied || Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join('');

      const hash = await hashPassword(password);
      await db.transaction(async () => {
        await db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(hash, target.id);
        await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
      })();
      // Returned once so the admin can hand it over; it is never stored in clear.
      res.json({ success: true, password, must_change_password: true });
    } catch (err) {
      log.error("Admin password reset error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

}
