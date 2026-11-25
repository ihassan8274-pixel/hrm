#!/usr/bin/env node
/**
 * Local-only / staging-only PostgreSQL dump restore helper.
 *
 * No new dependencies: uses node built-ins plus the `pg` package already in
 * package.json. Never prints passwords from connection URLs.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HELP = `
استعادة تفريغة PostgreSQL (محلي/Staging فقط) — restore-db.mjs

الاستخدام:
  node scripts/restore-db.mjs --backup <path> --dry-run [options]
  node scripts/restore-db.mjs --backup <path> --confirm [options]
  npm run db:restore -- --backup <path> --dry-run

الخيارات:
  --backup <path>        مسار ملف التفريغة (مطلوب). يجب أن يكون ملفاً موجوداً وغير فارغ.
  --target-url <url>     قاعدة الوجهة. الافتراضي من متغير البيئة DATABASE_URL.
  --dry-run              يطبع أمر pg_restore بالضبط (بدون تنفيذ أي شيء) ولا يتصل بقاعدة بيانات.
  --confirm              مطلوب لأي استعادة حقيقية. يتم تجاهله مع --dry-run.
  --pg-restore <path>    مسار أداة pg_restore (الافتراضي: pg_restore من PATH).
  --clean                إضافة --clean --if-exists (احذف هذه الكائنات فقط على قاعدة قابلة للاستهلاك).
  --schema <name>        المخطط الذي تتم عليه validators بعد الاستعادة (الافتراضي: payroll).
  --i-know-this-is-production
                         السماح بمنفذ الإنتاج 5433. يطبع تحذيراً قوياً ولا يزال يتطلب --confirm.
  --help                 عرض هذه الرسالة.

قواعد الأمان:
  - بدون --dry-run يجب تمرير --confirm، وإلا يرفض السكربت العمل.
  - المنفذ 5433 مرفوض ما لم يمرر --i-know-this-is-production.
  - كلمات المرور في الروابط تُستبدل دائماً بـ *** في كل المخرجات.
  - الاستعادة الحقيقية إلى الإنتاج خارج نطاق هذه المرحلة وتتطلب موافقة صريحة من المستخدم.
`;

const OPTIONS_WITH_VALUE = new Set(["backup", "target-url", "pg-restore", "schema"]);
const FLAG_OPTIONS = new Set([
  "dry-run",
  "confirm",
  "clean",
  "i-know-this-is-production",
  "help",
]);
const ALL_OPTIONS = new Set([...OPTIONS_WITH_VALUE, ...FLAG_OPTIONS]);

/** Redact passwords from URLs and common connection-string forms. */
function redact(value) {
  return String(value)
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, "$1***@")
    .replace(/(password\s*[=:]\s*)([^\s&;]+)/gi, "$1***")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***");
}

function out(...parts) {
  console.log(redact(parts.map(String).join(" ")));
}

function err(...parts) {
  console.error(redact(parts.map(String).join(" ")));
}

function fail(message, code = 1) {
  err(`ERROR: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}. Use --help.`);
    }
    const eq = token.indexOf("=");
    const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);
    if (!ALL_OPTIONS.has(key)) {
      fail(`Unknown option --${key}. Use --help.`);
    }
    if (FLAG_OPTIONS.has(key)) {
      if (inlineValue !== undefined) fail(`--${key} does not take a value.`);
      result[key] = true;
    } else {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        fail(`--${key} requires a value.`);
      }
      result[key] = value;
    }
  }
  return result;
}

/** Quote a single argument for a readable, copy-pasteable command line. */
function quoteArg(arg) {
  return /^[A-Za-z0-9_@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(" ");
}

function parseTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("Invalid target URL. Expected a postgresql:// or postgres:// connection string.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail("Target URL must use the postgresql:// or postgres:// scheme.");
  }
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "(unset)";
  return { port, host: url.hostname || "(unset)", database };
}

function assertSafeIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    fail(`Unsafe schema name ${JSON.stringify(name)}. Use only letters, digits, _ or $ (must not start with a digit).`);
  }
  return `"${name}"`;
}

async function verify(connectionString, schema) {
  const quotedSchema = assertSafeIdentifier(schema);
  const { Client } = await import("pg");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();

    const tables = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1",
      [schema],
    );
    out(`Verification: tables in schema "${schema}" = ${tables.rows[0].n}`);

    // to_regclass takes a parameter; the identifier used in the final query
    // is validated above and quoted with double quotes (never interpolated raw).
    const relation = await client.query("SELECT to_regclass($1) AS rel", [
      `${quotedSchema}.employees`,
    ]);
    if (!relation.rows[0]?.rel) {
      out(`Verification: table "${schema}".employees not present; row count skipped.`);
      return;
    }
    const employees = await client.query(
      `SELECT count(*)::int AS n FROM ${quotedSchema}.employees`,
    );
    out(`Verification: employees in "${schema}".employees = ${employees.rows[0].n}`);
  } catch (error) {
    fail(`Verification failed: ${error?.message ?? error}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    out(HELP);
    return;
  }

  if (!args.backup) {
    fail("--backup <path> is required. Use --help for usage.");
  }

  const targetUrl = args["target-url"] ?? process.env.DATABASE_URL;
  if (!targetUrl) {
    fail("No target URL: pass --target-url <url> or set DATABASE_URL.");
  }
  const { port, host, database } = parseTarget(targetUrl);

  if (port === "5433") {
    if (!args["i-know-this-is-production"]) {
      fail(
        "Refusing to target port 5433 (known production port). " +
          "For a deliberate drill use a disposable database on another port. " +
          "If this really is an approved production restore, pass --i-know-this-is-production (and --confirm).",
      );
    }
    err(
      "STRONG WARNING: target port 5433 is the known production port. " +
        "Production restores are out of scope for this trial and require explicit user approval. " +
        "Continue only if you have that approval.",
    );
  }

  const schema = args.schema ?? "payroll";
  assertSafeIdentifier(schema);

  const backupPath = path.resolve(args.backup);
  let backupStat;
  try {
    backupStat = fs.statSync(backupPath);
  } catch {
    fail(`Backup file does not exist: ${backupPath}`);
  }
  if (!backupStat.isFile()) {
    fail(`Backup path is not a regular file: ${backupPath}`);
  }
  if (backupStat.size === 0) {
    fail(`Backup file is empty: ${backupPath}`);
  }

  const pgRestore = args["pg-restore"] ?? "pg_restore";
  const restoreArgs = ["--no-owner", "--no-privileges"];
  if (args.clean) {
    restoreArgs.push("--clean", "--if-exists");
  } else {
    restoreArgs.push("--exit-on-error");
  }
  restoreArgs.push("-d", targetUrl, backupPath);

  out(`Target: ${host}:${port}/${database} (credentials redacted)`);
  out(`Backup: ${backupPath} (${backupStat.size} bytes)`);
  out(`Verification schema: ${schema}`);

  if (args["dry-run"]) {
    out("MODE: DRY-RUN — no command executed, no database connection opened.");
    out("pg_restore command that would run (credentials redacted):");
    out(formatCommand(pgRestore, restoreArgs));
    out("Exact argv (JSON, credentials redacted): " + JSON.stringify([pgRestore, ...restoreArgs]));
    if (args.confirm) {
      out("Note: --confirm was supplied but ignored because --dry-run takes precedence.");
    }
    return;
  }

  if (!args.confirm) {
    fail("Refusing to restore without --confirm. Use --dry-run to preview the command.");
  }
  if (args.clean) {
    err("WARNING: --clean --if-exists will DROP existing objects in the target database.");
  }

  out("Restoring with pg_restore ...");
  const result = spawnSync(pgRestore, restoreArgs, {
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    fail(`Could not start pg_restore: ${result.error.message}`);
  }
  if (result.stdout?.trim()) out(result.stdout.trimEnd());
  if (result.stderr?.trim()) err(result.stderr.trimEnd());
  if (result.status !== 0) {
    fail(`pg_restore exited with status ${result.status ?? "unknown"}; verification skipped.`);
  }

  out("pg_restore completed. Running lightweight verification ...");
  await verify(targetUrl, schema);
  out("Verification finished.");
}

main().catch((error) => {
  fail(`Unexpected error: ${error?.message ?? error}`);
});
