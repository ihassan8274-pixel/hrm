/**
 * اختبار تحمّل مركّز: 200 موظف يسجّلون الدخول معاً ثم يسجّلون الخروج معاً.
 *
 * الأمان: يعمل فقط على خادم الاختبار المحلي (127.0.0.1:13100) وقاعدة
 * payroll_test في الحاوية المؤقتة على المنفذ 55433. يرفض العمل ضد الإنتاج
 * صراحةً. كل مستخدم يستخدم X-Forwarded-For مختلفاً لأن authLimiter هو
 * 10 طلبات / 15 دقيقة لكل IP.
 *
 *   USERS=200 ROUNDS=3 node scripts/auth-load-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import pg from "pg";

const BASE = process.env.BASE_URL || "http://127.0.0.1:13100";
const USERS = Number(process.env.USERS || 200);
const ROUNDS = Number(process.env.ROUNDS || 3);
const PASSWORD = process.env.LOAD_PASSWORD || "LoadTest@2026";
const PORT = Number(process.env.LOAD_PORT || 13100);
const RUN_ID = process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.resolve("scripts", ".build");
const OUT = path.join(OUT_DIR, `auth-load-report-${RUN_ID}.json`);

if (/restocost\.shop|145\.241\.109\.15/.test(BASE) && process.env.LOAD_TEST_ALLOW_PRODUCTION_HOST !== "1") {
  throw new Error("Refusing to load-test a production host without LOAD_TEST_ALLOW_PRODUCTION_HOST=1");
}

const envFile = fs.readFileSync(path.join(OUT_DIR, "test.env"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!dbUrl || !/55433|payroll_test/.test(dbUrl)) {
  throw new Error("Expected the disposable payroll_test database on port 55433 in scripts/.build/test.env");
}
const monitor = new pg.Client({ connectionString: dbUrl });

const records = [];
const samples = [];
const statusCounts = {};
let sampling = false;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx] * 100) / 100;
}

function summarize(label, list) {
  const ok = list.filter((r) => r.status >= 200 && r.status < 300);
  const times = ok.map((r) => r.ms);
  return {
    label,
    requests: list.length,
    ok: ok.length,
    failed: list.length - ok.length,
    statuses: list.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {}),
    latency_ms: {
      min: times.length ? Math.round(Math.min(...times) * 100) / 100 : null,
      avg: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100 : null,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      max: times.length ? Math.round(Math.max(...times) * 100) / 100 : null,
    },
  };
}

async function call(user, round, method, route, body, label) {
  const started = performance.now();
  const payload = typeof body === "function" ? body(user) : body;
  let status = 0;
  let detail = "";
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        // One simulated client IP per employee; repeated rounds stay below 10/IP.
        "X-Forwarded-For": user.ip,
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    status = res.status;
    if (!res.ok) detail = (await res.text()).slice(0, 160);
    else if (route === "/api/auth/login") {
      const json = await res.json();
      user.token = json.token;
      user.userId = json.user?.id;
    } else await res.arrayBuffer();
  } catch (error) {
    status = 0;
    detail = String(error?.message || error).slice(0, 160);
  }
  const ms = performance.now() - started;
  records.push({ label, round, method, route, status, ms, detail });
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  return status;
}

function runPs(command) {
  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-Command", command], { timeout: 15000 }, (err, stdout) => {
      resolve(err ? "" : String(stdout).trim());
    });
  });
}

async function resolveServerPid() {
  const raw = await runPs(
    `(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
  );
  return Number(raw) || 0;
}

async function sampleOnce(pid, t) {
  const ps = pid
    ? await runPs(`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){"$($p.CPU)|$([math]::Round($p.WorkingSet64/1MB,1))"}`)
    : "";
  const [cpuSec, memMb] = ps.split("|").map(Number);
  let db = {};
  try {
    const r = await monitor.query(
      `SELECT count(*) FILTER (WHERE state='active')::int AS active,
              count(*) FILTER (WHERE state='idle in transaction')::int AS idle_tx,
              count(*)::int AS total,
              (SELECT xact_commit FROM pg_stat_database WHERE datname=current_database())::bigint AS commits,
              (SELECT xact_rollback FROM pg_stat_database WHERE datname=current_database())::bigint AS rollbacks
       FROM pg_stat_activity WHERE datname=current_database()`,
    );
    db = r.rows[0] || {};
  } catch {}
  samples.push({ t_ms: Math.round(t), cpu_seconds: cpuSec || null, mem_mb: memMb || null, db });
}

async function barrierPhase(users, round, method, route, body, label) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const tasks = users.map(async (user) => {
    await gate;
    return call(user, round, method, route, body, label);
  });
  release();
  return Promise.all(tasks);
}

async function main() {
  await monitor.connect();
  const pid = await resolveServerPid();
  const cores = os.cpus().length;
  console.log(JSON.stringify({ base: BASE, users: USERS, rounds: ROUNDS, server_pid: pid, cores, monitor: "payroll_test" }));

  const warm = { index: 0, token: null, ip: "10.60.0.250" };
  let warmStatus = 0;
  for (let attempt = 0; attempt < 2 && warmStatus !== 200; attempt++) {
    warmStatus = await call(warm, 0, "POST", "/api/auth/login", { username: "load_user_01", password: PASSWORD }, "warmup-login");
    if (warmStatus !== 200) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (warmStatus !== 200) throw new Error(`Warmup login failed: ${warmStatus} ${records.at(-1)?.detail}`);
  await call(warm, 0, "POST", "/api/auth/logout", {}, "warmup-logout");

  // Warmup is outside the measurement window.
  records.length = 0;
  for (const key of Object.keys(statusCounts)) delete statusCounts[key];

  const users = Array.from({ length: USERS }, (_, i) => ({
    index: i,
    username: `load_user_${String(i + 1).padStart(2, "0")}`,
    token: null,
    ip: `10.60.${Math.floor(i / 254) + 1}.${(i % 254) + 1}`,
  }));

  let prevCpu = null;
  let prevAt = null;
  const cpuPct = [];
  const timer = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const t = performance.now();
      await sampleOnce(pid, t);
      const last = samples.at(-1);
      if (prevCpu != null && last?.cpu_seconds != null) {
        const dCpu = last.cpu_seconds - prevCpu;
        const dSec = (t - prevAt) / 1000;
        if (dSec > 0) cpuPct.push(Math.max(0, Math.min(100, (dCpu / dSec / cores) * 100)));
      }
      if (last?.cpu_seconds != null) { prevCpu = last.cpu_seconds; prevAt = t; }
    } finally {
      sampling = false;
    }
  }, 1000);

  const started = performance.now();
  const roundSummaries = [];
  for (let round = 1; round <= ROUNDS; round++) {
    await barrierPhase(users, round, "POST", "/api/auth/login", (user) => ({
      username: user.username,
      password: PASSWORD,
    }), "login");
    await barrierPhase(users, round, "POST", "/api/auth/logout", () => ({}), "logout");
    const roundRecords = records.filter((r) => r.round === round);
    roundSummaries.push({
      round,
      ...summarize(`round-${round}`, roundRecords),
      login: summarize(`round-${round}-login`, roundRecords.filter((r) => r.label === "login")),
      logout: summarize(`round-${round}-logout`, roundRecords.filter((r) => r.label === "logout")),
    });
    // Tokens from a finished round must not leak into the next one.
    for (const user of users) user.token = null;
  }
  const durationMs = performance.now() - started;
  clearInterval(timer);
  await sampleOnce(pid, performance.now());

  const byLabel = {};
  for (const label of [...new Set(records.map((r) => r.label))]) {
    byLabel[label] = summarize(label, records.filter((r) => r.label === label));
  }
  const ok = records.filter((r) => r.status >= 200 && r.status < 300).length;
  const report = {
    run_id: RUN_ID,
    at: new Date().toISOString(),
    config: { base: BASE, users: USERS, rounds: ROUNDS, port: PORT, cores, server_pid: pid },
    duration_ms: Math.round(durationMs),
    throughput_rps: Math.round((records.length / (durationMs / 1000)) * 100) / 100,
    requests: records.length,
    ok,
    failed: records.length - ok,
    error_rate_pct: Math.round(((records.length - ok) / Math.max(1, records.length)) * 10000) / 100,
    status_counts: statusCounts,
    endpoint_summary: byLabel,
    rounds: roundSummaries,
    overall_latency_ms: summarize("all", records).latency_ms,
    cpu_pct: {
      samples: cpuPct.length,
      avg: cpuPct.length ? Math.round((cpuPct.reduce((a, b) => a + b, 0) / cpuPct.length) * 100) / 100 : null,
      p95: percentile(cpuPct, 95),
      max: cpuPct.length ? Math.round(Math.max(...cpuPct) * 100) / 100 : null,
    },
    monitor_samples: samples,
    non_2xx_examples: records.filter((r) => r.status < 200 || r.status >= 300).slice(0, 20),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report: OUT,
    duration_s: Math.round(durationMs / 1000),
    requests: report.requests,
    ok: report.ok,
    failed: report.failed,
    throughput_rps: report.throughput_rps,
    login: byLabel.login,
    logout: byLabel.logout,
    overall_latency_ms: report.overall_latency_ms,
    cpu_pct: report.cpu_pct,
    db_last: samples.at(-1)?.db,
  }, null, 2));
  if (report.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await monitor.end().catch(() => {});
  });
