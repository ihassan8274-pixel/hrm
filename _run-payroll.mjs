import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();
const db = new Database("payroll.db");
db.pragma("busy_timeout = 5000");
const user = db.prepare("SELECT * FROM users WHERE username='admin'").get();
const token = jwt.sign({ id: user.id, username: user.username, role: user.role, entity_id: user.entity_id, employee_id: user.employee_id, jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: "2h" });
db.prepare("INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)").run(user.id, token, new Date(Date.now() + 2 * 3600e3).toISOString(), "script-run");

const BASE = "http://localhost:8090";
const H = { "Content-Type": "application/json", "Authorization": "Bearer " + token };

const gen = await fetch(BASE + "/api/payroll/generate", { method: "POST", headers: H, body: JSON.stringify({ month: 10, year: 2026 }) });
const genJson = await gen.json();
console.log("GENERATE:", gen.status, JSON.stringify(genJson).slice(0, 300));

const rows = db.prepare(`SELECT p.employee_id, p.basic_salary, p.housing_allowance, p.transport_allowance, p.other_allowances, p.gross_salary, p.gosi_employee_deduction, p.gosi_employer_contribution, p.net_salary
  FROM payroll p WHERE p.month=10 AND p.year=2026`).all();
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
console.log("DB PAYROLL: rows=", rows.length,
  "| gross=", sum("gross_salary").toFixed(2),
  "| gosi_emp=", sum("gosi_employee_deduction").toFixed(2),
  "| gosi_comp=", sum("gosi_employer_contribution").toFixed(2),
  "| net=", sum("net_salary").toFixed(2));
db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
console.log("session cleaned");
