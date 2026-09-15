import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import bodyParser from "body-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import https from "https";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { CountryRulesService } from "../src/lib/payroll/CountryRulesService";
import { PayrollCalculator } from "../src/lib/payroll/PayrollCalculator";
import "dotenv/config";
import db, { logAction, createNotification } from "./config/database";
import { initializeDatabase } from "./db/schema";
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


let __dirname = process.cwd();
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  __dirname = process.cwd();
}

initializeDatabase();


import { registerAuth } from "./routes/auth";
import { registerCore } from "./routes/core";
import { registerEmployees } from "./routes/employees";
import { registerPayroll } from "./routes/payroll";
import { registerAttendance } from "./routes/attendance";
import { registerSaudi } from "./routes/saudi";
import { registerReports } from "./routes/reports";
import { registerWorkflows } from "./routes/workflows";
import { registerCompliance } from "./routes/compliance";
import { registerAi } from "./routes/ai";
import { registerHrModules } from "./routes/hrModules";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors());
  app.use(bodyParser.json());

  setupAuthGate(app);

  registerAuth(app);
  registerCore(app);
  registerEmployees(app);
  registerPayroll(app);
  registerAttendance(app);
  registerSaudi(app);
  registerReports(app);
  registerWorkflows(app);
  registerCompliance(app);
  registerAi(app);
  registerHrModules(app);


  seedExtendedModules();

  // Initialize Country Rules Service
  CountryRulesService.setDatabase(db);

  async function runDbBackup() {
    try {
      const dir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `payroll-${new Date().toISOString().slice(0, 10)}.db`);
      // WAL-safe: db.backup() checkpoints the WAL into a consistent snapshot (a plain
      // file copy could miss writes still sitting in payroll.db-wal).
      await db.backup(dest);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_auto_backup', ?)").run(new Date().toISOString());
    } catch (e) { console.error("backup failed", e); }
  }

  function pushDocExpiryNotifications() {
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const emps = db.prepare("SELECT * FROM employees").all() as any[];
      for (const e of emps) {
        if (e.iqama_expiry_gregorian && e.iqama_expiry_gregorian <= in30) {
          createNotification("قرب انتهاء إقامة", `إقامة ${e.name} تنتهي ${e.iqama_expiry_gregorian}`, "warning");
        }
        if (e.health_cert_expiry && e.health_cert_expiry <= in30) {
          createNotification("شهادة صحية", `الشهادة الصحية لـ ${e.name} تنتهي ${e.health_cert_expiry}`, "warning");
        }
        if (e.medical_insurance_expiry && e.medical_insurance_expiry <= in30) {
          createNotification("تأمين طبي", `تأمين ${e.name} ينتهي ${e.medical_insurance_expiry}`, "warning");
        }
      }
    } catch (e) { console.error(e); }
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

  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    https
      .createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app)
      .listen(PORT, "0.0.0.0", () => {
        console.log(`Server running at https://0.0.0.0:${PORT} (HTTPS مفعّل — بصمة الهاتف تعمل)`);
      });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log("تنبيه: بصمة الوجه/الإصبع على هاتف الفرع تتطلب HTTPS. اضبط SSL_KEY_PATH و SSL_CERT_PATH.");
    });
  }
}

startServer();

