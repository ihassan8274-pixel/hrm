/**
 * Load test: 50 concurrent ESS users logging in at the same instant and then
 * performing real read/write transactions against the throwaway test server.
 *
 * Safety: BASE_URL defaults to the local test server on port 13100, which is
 * started with PAYROLL_ENV_FILE=scripts/.build/test.env (database payroll_test
 * in the disposable container). It will refuse to run against the production
 * host unless LOAD_TEST_ALLOW_PRODUCTION_HOST=1 is set explicitly.
 *
 *   node scripts/load-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync } from "node:child_process";
import pg from "pg";

const BASE = process.env.BASE_URL || "http://127.0.0.1:13100";
const USERS = Number(process.env.USERS || 50);
const PASSWORD = process.env.LOAD_PASSWORD || "LoadTest@2026";
const CYCLES = Number(process.env.CYCLES || 3);
const PORT = Number(process.env.LOAD_PORT || 13100);
const RUN_ID = process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.resolve("scripts", ".build");
const OUT = path.join(OUT_DIR, `load-report-${RUN_ID}.json`);

if (/restocost\.shop|145\.241\.109\.15/.test(BASE) && process.env.LOAD_TEST_ALLOW_PRODUCTION_HOST !== "1") {
  throw new Error("Refusing to load-test a production host without LOAD_TEST_ALLOW_PRODUCTION_HOST=1");
}

/* -------------------------------------------------------------- env / db */
const envFile = fs.readFileSync(path.join(OUT_DIR, "test.env"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL missing from scripts/.build/test.env");
const monitor = new pg.Client({ connectionString: dbUrl });

/* ------------------------------------------------------------ collection */
const records = [];
const samples = [];
const statusCounts = {};
let monitorTimer = null;
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

async function call(user, method, route, body, label) {
  const started = performance.now();
  let status = 0;
  let detail = "";
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: user.token ? `Bearer ${user.token}` : "",
        // 50 distinct simulated client IPs: the login limiter is 10/15min *per IP*.
        "X-Forwarded-For": `10.60.${RUN_ID.length % 200}.${user.index + 1}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    if (!res.ok) detail = (await res.text()).slice(0, 160);
    else if (method === "POST" && route === "/api/auth/login") {
      const json = await res.json();
      user.token = json.token;
      user.userId = json.user?.id;
      user.role = json.user?.role;
    } else {
      await res.arrayBuffer();
    }
  } catch (error) {
    status = 0;
    detail = String(error?.message || error).slice(0, 160);
  }
  const ms = performance.now() - started;
  records.push({ label, method, route, status, ms, detail });
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  return status;
}

/* ---------------------------------------------------------- OS / DB probe */
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
  samples.push({ t_ms: t, cpu_seconds: cpuSec || null, mem_mb: memMb || null, db });
}

/* ------------------------------------------------------------------ main */
async function main() {
  await monitor.connect();
  const pid = await resolveServerPid();
  const cores = os.cpus().length;
  console.log(JSON.stringify({ base: BASE, users: USERS, cycles: CYCLES, server_pid: pid, cores, monitor: "payroll_test" }));

  const warm = { index: 0, token: null };
  // The very first native scrypt call can pay a one-off module/threadpool
  // initialisation cost; retry once so that cost never fails the whole run.
  let warmStatus = 0;
  for (let attempt = 0; attempt < 2 && warmStatus !== 200; attempt++) {
    warmStatus = await call(warm, "POST", "/api/auth/login", { username: "load_user_01", password: PASSWORD }, "warmup-login");
    if (warmStatus !== 200) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (warmStatus !== 200) throw new Error(`Warmup login failed: ${warmStatus} ${records.at(-1)?.detail}`);
  await call(warm, "GET", "/api/auth/me", null, "warmup-me");

  // Let the one-off warmup requests leave the measurement window.
  records.length = 0;
  for (const key of Object.keys(statusCounts)) delete statusCounts[key];

  const users = Array.from({ length: USERS }, (_, i) => ({
    index: i,
    username: `load_user_${String(i + 1).padStart(2, "0")}`,
    token: null,
  }));

  let prevCpu = null;
  let prevAt = null;
  const cpuPct = [];
  monitorTimer = setInterval(async () => {
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

  // Barrier: every virtual user hits /api/auth/login at the same instant.
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const runners = users.map(async (user) => {
    await gate;
    const loginStatus = await call(user, "POST", "/api/auth/login", { username: user.username, password: PASSWORD }, "login");
    if (loginStatus !== 200) return;
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      await call(user, "GET", "/api/auth/me", null, "read:me");
      await call(user, "GET", "/api/notifications", null, "read:notifications");
      await call(user, "GET", "/api/employees", null, "read:employees");
      await call(user, "GET", "/api/ess/requests", null, "read:ess-requests");
      await call(user, "POST", "/api/ess/requests", {
        type: "suggestion",
        title: `Load test ${RUN_ID} u${user.index + 1} c${cycle + 1}`,
        details: "Disposable test record",
        category: "operations",
      }, "write:ess-request");
      await call(user, "POST", "/api/push-tokens", {
        token: `load-token-${RUN_ID}-${user.index}-${cycle}`,
        platform: "android",
      }, "write:push-token");
      await call(user, "PUT", "/api/notifications/read-all", {}, "write:notifications-read-all");
      await call(user, "POST", "/api/auth/activity", {}, "write:activity");
    }
    await call(user, "POST", "/api/auth/logout", {}, "logout");
  });
  release();
  await Promise.all(runners);

  const durationMs = performance.now() - started;
  clearInterval(monitorTimer);
  monitorTimer = null;
  await sampleOnce(pid, performance.now());

  const byLabel = {};
  for (const label of [...new Set(records.map((r) => r.label))]) {
    byLabel[label] = summarize(label, records.filter((r) => r.label === label));
  }
  const ok = records.filter((r) => r.status >= 200 && r.status < 300).length;
  const report = {
    run_id: RUN_ID,
    at: new Date().toISOString(),
    config: { base: BASE, users: USERS, cycles: CYCLES, port: PORT, cores, server_pid: pid },
    duration_ms: Math.round(durationMs),
    throughput_rps: Math.round((records.length / (durationMs / 1000)) * 100) / 100,
    requests: records.length,
    ok,
    failed: records.length - ok,
    error_rate_pct: Math.round(((records.length - ok) / Math.max(1, records.length)) * 10000) / 100,
    status_counts: statusCounts,
    endpoint_summary: byLabel,
    overall_latency_ms: summarize("all", records).latency_ms,
    cpu_pct: {
      samples: cpuPct.length,
      avg: cpuPct.length ? Math.round((cpuPct.reduce((a, b) => a + b, 0) / cpuPct.length) * 100) / 100 : null,
      p95: percentile(cpuPct, 95),
      max: cpuPct.length ? Math.round(Math.max(...cpuPct) * 100) / 100 : null,
    },
    monitor_samples: samples,
    non_2xx_examples: records.filter((r) => r.status < 200 || r.status >= 300).slice(0, 12),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report: OUT,
    duration_s: Math.round(durationMs / 1000),
    requests: report.requests,
    ok: report.ok,
    failed: report.failed,
    rps: report.throughput_rps,
    overall: report.overall_latency_ms,
    login: byLabel.login?.latency_ms,
    cpu_pct: report.cpu_pct,
    db_connections: samples.length ? samples.at(-1).db : null,
    statuses: statusCounts,
  }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (monitorTimer) clearInterval(monitorTimer);
    await monitor.end().catch(() => {});
  });
