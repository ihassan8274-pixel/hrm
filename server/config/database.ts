import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "payroll.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -32768");

export function logAction(
  action: string,
  entity_type: string,
  entity_id: number | null,
  details: string
) {
  db.prepare(
    `INSERT INTO audit_logs (action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?)`
  ).run(action, entity_type, entity_id, details);
}

export function createNotification(
  title: string,
  message: string,
  type: string = "info"
) {
  db.prepare(
    `INSERT INTO notifications (title, message, type)
     VALUES (?, ?, ?)`
  ).run(title, message, type);
}

export function settingsMap(): Record<string, string> {
  const rows = db.prepare("SELECT * FROM settings").all() as Record<
    string,
    string
  >[];
  return rows.reduce<Record<string, string>>((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
}

export function isPayrollLocked(month: number, year: number): boolean {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(`payroll_lock_${year}_${month}`) as any;
  return row?.value === "1";
}

export function screenIsLocked(month: number, year: number): boolean {
  return isPayrollLocked(month, year);
}

export default db;