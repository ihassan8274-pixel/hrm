import db from "../config/postgres";
import { log } from "./logger";
import { generatePayrollPeriod } from "../routes/payroll/period";

/**
 * Automatic monthly payroll generation.
 *
 * Once an hour the scheduler looks at the *previous* calendar month and,
 * if it has not been generated yet, builds it through the exact same core
 * used by POST /api/payroll/generate. A marker in `settings` records the last
 * period handled, so:
 *
 *   - a restart never back-fills old months (the marker starts from the
 *     newest period already present in the payroll register);
 *   - a period generated manually by a user is recognised and skipped;
 *   - a locked period is left alone and retried after it is unlocked.
 *
 * No employee is ever paid twice: generatePayrollPeriod() itself skips any
 * employee who already has a row for the period.
 */

const LAST_PERIOD_KEY = "payroll_auto_last_period";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

const keyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

function previousPeriod(now: Date = new Date()): { year: number; month: number } {
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const previous = new Date(firstOfThisMonth - 1);
  return { year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1 };
}

async function readMarker(): Promise<string | null> {
  const row = (await db.prepare("SELECT value FROM settings WHERE key = ?").get(LAST_PERIOD_KEY)) as any;
  return row?.value || null;
}

async function writeMarker(key: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(LAST_PERIOD_KEY, key);
}

/** On a fresh install, seed the marker from the newest period already on file. */
async function ensureMarker(): Promise<string | null> {
  const existing = await readMarker();
  if (existing) return existing;
  const row = (await db.prepare("SELECT MAX(year * 100 + month) AS period FROM payroll").get()) as any;
  const raw = row?.period;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const key = keyOf(Math.floor(raw / 100), raw % 100);
    await writeMarker(key);
    return key;
  }
  return null;
}

export interface AutoGenerationResult {
  period: string;
  status: "generated" | "already-present" | "already-covered" | "locked" | "not-ready" | "no-employees";
  count?: number;
}

export async function runPayrollAutoGeneration(now: Date = new Date()): Promise<AutoGenerationResult> {
  const { year, month } = previousPeriod(now);
  const period = keyOf(year, month);

  const marker = await ensureMarker();
  if (marker && period <= marker) {
    return { period, status: "already-covered" };
  }

  const employees = (await db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get()) as any;
  if (!employees?.n) {
    return { period, status: "no-employees" };
  }

  const existing = (await db.prepare("SELECT COUNT(*) AS n FROM payroll WHERE year = ? AND month = ?").get(year, month)) as any;
  if (existing?.n) {
    // Somebody generated this period by hand. Remember it so we stop trying.
    await writeMarker(period);
    return { period, status: "already-present", count: existing.n };
  }

  const result = await generatePayrollPeriod(month, year, { entityId: null, branchId: null, employeeId: null }, "auto");
  if (result.skipped) {
    // Do not mark the period as handled when it was refused: the next tick must
    // retry once the operator has fixed the data or unlocked the period.
    return { period, status: result.reason === "not_ready" ? "not-ready" : "locked" };
  }

  await writeMarker(period);
  return { period, status: "generated", count: result.count };
}

/** Called once from server startup. Both timers are unref'd so they never hold the process open. */
export function startPayrollAutoScheduler(): void {
  setTimeout(() => {
    void runPayrollAutoGeneration().catch((e) => log.error("[payroll-auto] startup run failed", e));
  }, STARTUP_DELAY_MS).unref?.();
  setInterval(() => {
    void runPayrollAutoGeneration().catch((e) => log.error("[payroll-auto] periodic run failed", e));
  }, CHECK_INTERVAL_MS).unref?.();
}
