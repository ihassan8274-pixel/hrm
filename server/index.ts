// Server entry point. Mounts the auth gate, then the route modules below.
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import https from "https";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { CountryRulesService } from "../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../src/lib/payroll/PayrollCalculator";
import "dotenv/config";
import db, { logAction, createNotification, closePostgresPool } from "./config/postgres";
import { runPostgresMigrations } from "./db/postgres-migrate";
import { seedExtendedModules } from "./db/seed";
import {
  JWT_SECRET,
  JWT_EXPIRY,
  authLimiter,
  pairPhoneLimiter,
  kioskLimiter,
  enrollLimiter,
  authenticateToken,
  requireRole,
  setupAuthGate,
  reportUnclassifiedWriteRoutes,
} from "./middleware/auth";

import { registerAuth } from "./routes/auth";
import { registerCore } from "./routes/core";
import { registerEmployees } from "./routes/employees";
import { registerPayroll } from "./routes/payroll";
import { registerAttendance } from "./routes/attendance";
import { registerPresence, startPresenceJobs, refreshBranchCache } from "./routes/presence";
import { registerSaudi } from "./routes/saudi";
import { registerReports } from "./routes/reports";
import { registerWorkflows } from "./routes/workflows";
import { registerCompliance } from "./routes/compliance";
import { registerAi } from "./routes/ai";
import { registerReportsHub } from "./routes/reportsHub";
import { registerHrModules } from "./routes/hrModules";
import { registerHealthCertificates, needsHealthCert } from "./routes/healthCertificates";
import { registerImporter } from "./routes/importer";
import { registerForms } from "./routes/forms";
import { registerEssRequests } from "./routes/essRequests";
import { registerAnnualCycle, startAnnualCycleScheduler } from "./routes/annualCycle";
import { registerPushTokens } from "./routes/pushTokens";
import { startPayrollAutoScheduler } from "./lib/payroll-auto-scheduler";
import { enforceTenantWriteScope } from "./middleware/tenantScope";
import { enforcePresenceLock } from "./middleware/presenceLock";
import { assertEnvFileShape } from "./config/env";
import { log, requestLogger } from "./lib/logger";
import { recordRequest, snapshotMetrics } from "./lib/metrics";

// Fatal-error handling.
//
// `process.exit(1)` the moment an exception escapes turns any transient
// failure into a restart loop: `restart: unless-stopped` in docker-compose.yml
// brings the container straight back, and while PostgreSQL is still starting
// (57P03) that loop never ends. The handlers below therefore log the whole
// error, give in-flight work a grace period, and only then exit.
const FATAL_EXIT_GRACE_MS = 10_000;
let fatalExitScheduled = false;

const scheduleFatalExit = (reason: string) => {
  if (fatalExitScheduled) return;
  fatalExitScheduled = true;
  log.error(`[fatal] ${reason} — exiting in ${FATAL_EXIT_GRACE_MS / 1000}s`);
  // unref: the timer must not keep the process alive on its own.
  setTimeout(() => process.exit(1), FATAL_EXIT_GRACE_MS).unref?.();
};

process.on("uncaughtException", (err) => {
  log.error("[fatal] Uncaught Exception:", err);
  scheduleFatalExit("uncaught exception");
});

process.on("unhandledRejection", (reason) => {
  // A rejected promise is not fatal by itself: the request that produced it
  // fails and the rest of the process keeps serving. Node's default (terminate)
  // is exactly the restart loop this handler exists to prevent.
  log.error("[error] Unhandled Rejection:", reason);
});

const __dirname = process.cwd();

function installAsyncRouteForwarding(app: express.Express) {
  const wrap = (handler: any): any => {
    if (Array.isArray(handler)) return handler.map(wrap);
    if (typeof handler !== "function") return handler;
    if (handler.length === 4) {
      return function (error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) {
        const result = handler.call(this, error, req, res, next);
        if (result && typeof result.then === "function") result.catch(next);
        return result;
      };
    }
    return function (req: express.Request, res: express.Response, next: express.NextFunction) {
      const result = handler.call(this, req, res, next);
      if (result && typeof result.then === "function") result.catch(next);
      return result;
    };
  };

  for (const method of ["use", "get", "post", "put", "patch", "delete", "options"] as const) {
    const original = app[method].bind(app) as (...args: any[]) => any;
    (app as any)[method] = (...args: any[]) => original(...args.map(wrap));
  }
}

/**
 * Runs the migrations, retrying while PostgreSQL is not accepting connections.
 *
 * The database usually needs a few more seconds than the app container when
 * both start together, and the old behaviour (an unhandled rejection that
 * exited immediately) turned that into a restart loop.
 */
async function runMigrationsWithRetry(attempts = 10, delayMs = 3000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runPostgresMigrations();
      return;
    } catch (error) {
      lastError = error;
      log.error(
        `[startup] database not ready (attempt ${attempt}/${attempts}):`,
        (error as Error).message,
      );
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function startServer() {
  // A malformed .env fails here, with a message that names the file and the
  // line, instead of much later as a connection error.
  assertEnvFileShape();
  await runMigrationsWithRetry();
  const app = express();
  // The production instance sits behind Cloudflare Tunnel. Without this the
  // socket peer is always the local connector, so express-rate-limit groups
  // every visitor under one IP and logs a validation warning on every request.
  app.set("trust proxy", 1);
  installAsyncRouteForwarding(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.disable("x-powered-by");

  // CORS: allow same-origin by default; restrict via CORS_ORIGINS env (comma-separated)
  const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  // WebView الأصلي يرسل requests من أصل محلي خاص بالمنصة؛ ليست مواقع خارجية
  // ولا يمكن لصفحة ويب عادية انتحالها. تُسمح هذه الأصول دائماً بغض النظر عن CORS_ORIGINS.
  const nativeWebViewOrigins = new Set([
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "ionic://localhost",
  ]);
  // An empty allow-list means "any origin", which on a system that holds
  // payroll data is a cross-site request forgery surface. In production that
  // is a configuration error, not a default: refuse to start instead of
  // serving wide open. Set CORS_ORIGINS to the comma-separated list of the
  // origins that are allowed to call the API.
  if (process.env.NODE_ENV === "production" && corsOrigins.length === 0) {
    log.error(
      "[security] CORS_ORIGINS is empty — refusing to start in production. " +
        "Set CORS_ORIGINS to the comma-separated list of allowed origins.",
    );
    process.exit(1);
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return cors()(req, res, next);
    if (nativeWebViewOrigins.has(origin)) return cors()(req, res, next);
    // The app serving its own UI is always allowed, even when the allow-list
    // names other origins — otherwise setting CORS_ORIGINS would break the
    // application's own pages. The forwarded host is checked as well for
    // deployments behind a reverse proxy.
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const selfHosts = new Set([req.headers.host, forwardedHost].filter(Boolean));
    try {
      if (selfHosts.has(new URL(origin).host)) return cors()(req, res, next);
    } catch {}
    if (corsOrigins.length === 0 || corsOrigins.includes(origin)) return cors()(req, res, next);
    return res.status(403).json({ error: "Origin not allowed" });
  });

  app.use(bodyParser.json({ limit: "25mb" }));

  // Request identity and timing.
  //
  // Every request gets an id — taken from the caller when one is supplied, so
  // a report can be traced across a proxy, and generated otherwise. The id
  // comes back in the response header and on every log line of that request,
  // which is what turns "the screen was slow yesterday" into something that
  // can be found.
  app.use((req, res, next) => {
    const supplied = String(req.headers["x-request-id"] || "").trim();
    const requestId = supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = `${req.method} ${req.route?.path || req.path}`;
      recordRequest(route, durationMs, res.statusCode >= 400);
      requestLogger(requestId).info(
        { method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs) },
        "request",
      );
    });
    next();
  });

  // Liveness/readiness probes.
  //
  // These are registered before the auth gate because orchestrators, load
  // balancers and the Windows launcher poll them without credentials. Both
  // answer with coarse status only — no schema, row counts, or configuration —
  // so they are safe to expose anonymously.
  //
  //   /api/health  liveness:  is the process up? (no dependency checks)
  //   /api/ready   readiness: can it actually serve traffic? (checks the DB)
  const startedAt = Date.now();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime_seconds: Math.round((Date.now() - startedAt) / 1000) });
  });

  app.get("/api/ready", (_req, res) => {
    try {
      // A trivial query proves the connection is live and the schema is
      // readable. Anything slower or erroring means we are not ready.
      db.prepare("SELECT 1").get();
      res.json({ status: "ready", database: "ok" });
    } catch (err) {
      log.error("[ready] database check failed:", err);
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  setupAuthGate(app);

  // Presence lock: a restricted user whose 10-minute permit has lapsed gets
  // 403 on branch-bound work, while recovery routes stay reachable. Users with
  // no explicit policy are never locked (fail-open).
  app.use(enforcePresenceLock);

  // Server metrics: how many requests each route served, how many failed and
  // how long they took. It sits behind the auth gate and the RBAC matrix
  // (metrics.view), because the route names are internal information.
  app.get("/api/metrics", (req, res) => {
    res.json(snapshotMetrics());
  });

  // Protected training guides. The HTML files live outside dist with mode 600;
  // only a signed-in user can read them, and the name is allowlisted so a
  // caller cannot traverse to any other file on the server.
  const TRAINING_GUIDES = new Set([
    "TRAINING_INDEX.html",
    "TRAINING_EMPLOYEE.html",
    "TRAINING_HR.html",
    "TRAINING_FINANCE.html",
    "TRAINING_SETTINGS.html",
  ]);
  app.get("/api/guides/:name", (req, res) => {
    const name = String(req.params.name || "");
    if (!TRAINING_GUIDES.has(name)) return res.status(404).json({ error: "الدليل غير موجود" });
    const file = path.join(process.cwd(), "private-prototypes", name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "الدليل غير منشور على الخادم" });
    res.setHeader("Cache-Control", "private, no-store");
    res.type("html; charset=utf-8").sendFile(file);
  });

  // The write-side tenant guard runs right after the auth gate, so every
  // authenticated write is checked against the caller's entity and branch
  // before it reaches a handler. It has to sit here and not inside the route
  // modules: the rule has to hold for the routes nobody re-reads when the
  // permission table changes.
  app.use(enforceTenantWriteScope);

  // Branch coordinates drive the presence gate. Refresh the in-memory cache
  // once a branch write has completed, without changing the core route module.
  app.use((req, res, next) => {
    if (/^\/api\/branches(?:\/|$)/.test(req.path) && ["POST", "PUT", "DELETE"].includes(req.method.toUpperCase())) {
      res.once("finish", () => {
        void refreshBranchCache().catch((error) => log.error("[presence] branch cache refresh failed:", error));
      });
    }
    next();
  });

  registerAuth(app);
  registerCore(app);
  registerEmployees(app);
  registerPayroll(app);
  registerAttendance(app);
  registerPresence(app);
  registerSaudi(app);
  registerReports(app);
  registerReportsHub(app);
  registerWorkflows(app);
  registerCompliance(app);
  registerAi(app);
  registerHrModules(app);
  registerHealthCertificates(app);
  registerImporter(app);
  registerForms(app);
  registerEssRequests(app);
  registerAnnualCycle(app);
  registerPushTokens(app);
  startAnnualCycleScheduler();
  startPayrollAutoScheduler();
  startPresenceJobs();


  await seedExtendedModules();
  // مسارات اعتماد بوابة الموظف الناقصة في قواعد زُرعت قبل إضافتها.
  const { ensureEssWorkflows } = await import("./routes/workflows");
  await ensureEssWorkflows();
  // القوالب الرسمية المدمجة لمركز النماذج والطباعة — تُزرع مرة واحدة ولا
  // تُلمس إن عدّلها المسؤول من قبل (الإدخال يتخطى المفتاح الموجود).
  const { seedFormTemplates, seedBrandSettings } = await import("./db/forms-seed");
  await seedBrandSettings();
  await seedFormTemplates();
  // Ensure an admin user exists on fresh databases
  const { ensureBootstrapAdmin } = await import("./db/seed");
  await ensureBootstrapAdmin();

  async function runDbBackup() {
    try {
      const dir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const backupData = await db.transaction(async () => {
        await db.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const tables = await db.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name").all() as { name: string }[];
        const data: Record<string, unknown[]> = {};
        for (const { name } of tables) {
          const safeName = name.replace(/"/g, '""');
          data[name] = await db.prepare(`SELECT * FROM "${safeName}"`).all();
        }
        return data;
      })();
      const date = new Date().toISOString().slice(0, 10);
      const dest = path.join(dir, `payroll-${date}.json`);
      const temporary = `${dest}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ app_name: "Saudi HR & Payroll System", exported_at: new Date().toISOString(), tables: backupData }), { mode: 0o600 });
      fs.renameSync(temporary, dest);
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_auto_backup', ?)").run(new Date().toISOString());
    } catch (e) { log.error("backup failed", e); }
  }

  async function pushDocExpiryNotifications() {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      // The job runs at every boot and every 12h; without this guard the same
      // expiring document produces a duplicate notification row each cycle.
      const alreadySent = async (title: string, message: string) =>
        !!(await db
          .prepare(
            `SELECT 1 FROM notifications WHERE title = ? AND message = ?
             AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' LIMIT 1`
          )
          .get(title, message));
      const notify = async (title: string, message: string, type: string) => {
        if (await alreadySent(title, message)) return;
        await createNotification(title, message, type);
      };
      const emps = await db.prepare("SELECT * FROM employees WHERE status = 'active'").all() as any[];
      for (const e of emps) {
        if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= today) {
          await notify("إقامة منتهية", `إقامة ${e.name} منتهية منذ ${e.iqama_expiry_gregorian} — يجب التجديد فورًا`, "error");
        } else if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= in30) {
          await notify("قرب انتهاء إقامة", `إقامة ${e.name} تنتهي ${e.iqama_expiry_gregorian}`, "warning");
        }
        // الشهادة الصحية إلزامية لخاضعي تداول الطعام فقط.
        if (needsHealthCert(e)) {
          if (e.health_cert_expiry && e.health_cert_expiry <= today) {
            await notify("شهادة صحية منتهية", `الشهادة الصحية لـ ${e.name} منتهية منذ ${e.health_cert_expiry} — الموظف غير مسموح له بالعمل`, "error");
          } else if (e.health_cert_expiry && e.health_cert_expiry <= in30) {
            await notify("شهادة صحية", `الشهادة الصحية لـ ${e.name} تنتهي ${e.health_cert_expiry}`, "warning");
          }
        }
        if (e.medical_insurance_expiry && e.medical_insurance_expiry <= in30) {
          await notify("تأمين طبي", `تأمين ${e.name} ينتهي ${e.medical_insurance_expiry}`, "warning");
        }
      }
      // Food-sector requirement: only employees flagged as health-cert
      // subjects (food handlers) are counted. Aggregate alert, once per day.
      const missingCerts = ((await db
        .prepare(
          `SELECT COUNT(*) as c FROM employees e
           WHERE e.status = 'active' AND COALESCE(e.health_cert_required, 0) = 1 AND NOT EXISTS (
             SELECT 1 FROM health_certificates hc
              WHERE hc.employee_id = e.id AND hc.status = 'active' AND hc.expiry_date::date >= CURRENT_DATE
           )`
        )
        .get()) as any).c;
      if (missingCerts > 0) {
        await notify(
          "الشهادات الصحية",
          `${missingCerts} موظفًا بدون شهادة صحية سارية — تابعهم من وحدة الشهادات الصحية`,
          "warning"
        );
      }
    } catch (e) { log.error(e instanceof Error ? e.message : String(e)); }
  }

  // --- Static / SPA serving — MUST stay registered after every /api route ---
  // app.get("*") is a catch-all. While it sat above /api/backup/status it swallowed that
  // route in production and answered with index.html instead of JSON. Registering this last
  // keeps GET / serving the SPA while every /api/* path reaches its own handler.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  reportUnclassifiedWriteRoutes(app);
  runDbBackup();
  pushDocExpiryNotifications();
  setInterval(runDbBackup, 24 * 60 * 60 * 1000);
  setInterval(pushDocExpiryNotifications, 12 * 60 * 60 * 1000);

  // Error handling middleware - return JSON errors instead of HTML
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    log.error("Server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    https
      .createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app)
      .listen(PORT, "0.0.0.0", () => {
        log.info(`Server running at https://0.0.0.0:${PORT} (HTTPS مفعّل — بصمة الهاتف تعمل)`);
      });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      log.info(`Server running at http://localhost:${PORT}`);
      log.info("تنبيه: بصمة الوجه/الإصبع على هاتف الفرع تتطلب HTTPS. اضبط SSL_KEY_PATH و SSL_CERT_PATH.");
    });
  }
}

startServer().catch(async (error) => {
  log.error("Server startup failed:", error);
  await closePostgresPool();
  process.exit(1);
});
