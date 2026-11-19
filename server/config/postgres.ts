import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, PoolClient, QueryResult, types } from "pg";
import dotenv from "dotenv";

const loadedEnv = dotenv.config({ override: true });

// Preserve the API's existing JSON date strings and numeric IDs from SQLite.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1114, (value) => value);
types.setTypeParser(1184, (value) => value);

const schema = (process.env.PGSCHEMA || "payroll").trim();
if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  throw new Error("PGSCHEMA must be a simple PostgreSQL schema name.");
}

const connectionString = (process.env.DATABASE_URL || "").trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to start the PostgreSQL application.");
}
if (process.env.NODE_ENV !== "production" && !loadedEnv.parsed?.DATABASE_URL?.trim()) {
  throw new Error("Set DATABASE_URL in the project .env file before starting the development server; inherited database URLs are not used.");
}

const transactions = new AsyncLocalStorage<PoolClient>();
const pool = new Pool({
  connectionString,
  max: Number.parseInt(process.env.PG_POOL_MAX || "12", 10),
  idleTimeoutMillis: Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || "30000", 10),
  connectionTimeoutMillis: Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || "10000", 10),
  options: `-c search_path=${schema}`,
});

pool.on("error", (error) => {
  console.error("[postgres] idle client error", error);
});

const noIdPrimaryKeyTables = new Set(["countries", "schema_migrations", "settings"]);

function parameterize(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  let output = "";
  let index = 0;
  const namedValues: unknown[] = [];
  const namedIndexes = new Map<string, number>();
  const namedParams = params.length === 1 && params[0] !== null && typeof params[0] === "object" && !Array.isArray(params[0])
    ? params[0] as Record<string, unknown>
    : null;
  let state: "code" | "single" | "double" | "line" | "block" = "code";
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (state === "single") {
      output += char;
      if (char === "'" && next === "'") output += sql[++i];
      else if (char === "'") state = "code";
    } else if (state === "double") {
      output += char;
      if (char === '"' && next === '"') output += sql[++i];
      else if (char === '"') state = "code";
    } else if (state === "line") {
      output += char;
      if (char === "\n") state = "code";
    } else if (state === "block") {
      output += char;
      if (char === "*" && next === "/") {
        output += sql[++i];
        state = "code";
      }
    } else if (char === "'") {
      output += char;
      state = "single";
    } else if (char === '"') {
      output += char;
      state = "double";
    } else if (char === "-" && next === "-") {
      output += char + sql[++i];
      state = "line";
    } else if (char === "/" && next === "*") {
      output += char + sql[++i];
      state = "block";
    } else if (char === "?" && !namedParams) {
      // Postgres لا يستطيع استنتاج نوع المعامل في «$n IS NULL» وحده، فيرمي
      // 42P18 (indeterminate datatype). النمط شائع في الاستعلامات المقيَّدة
      // بنطاق الكيان («? IS NULL OR entity_id = ?»).-cast إلى نص يحلّها:
      // المعامل يُستعمل في اختبار IS NULL فقط، فنوعه لا يحمل معنى آخر.
      const rest = sql.slice(i + 1);
      const isNullTest = /^\s*IS\s+(NOT\s+)?NULL\b/i.test(rest);
      output += `$${++index}${isNullTest ? "::text" : ""}`;
    } else if (namedParams && char === "@" && /[A-Za-z_]/.test(next || "")) {
      let end = i + 1;
      while (/[A-Za-z0-9_]/.test(sql[end] || "")) end++;
      const name = sql.slice(i + 1, end);
      if (!Object.prototype.hasOwnProperty.call(namedParams, name)) throw new Error(`Missing SQL parameter: ${name}`);
      if (!namedIndexes.has(name)) {
        namedIndexes.set(name, namedValues.length + 1);
        namedValues.push(namedParams[name]);
      }
      output += `$${namedIndexes.get(name)}`;
      i = end - 1;
    } else {
      output += char;
    }
  }
  return { sql: output, params: namedParams ? namedValues : params };
}

function postgresSql(sql: string, returningId = false): string {
  let normalized = sql.trim().replace(/;\s*$/, "");
  const ignore = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(normalized);
  const replace = /^INSERT\s+OR\s+REPLACE\s+INTO\s+/i.test(normalized);
  normalized = normalized.replace(/^INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO\s+/i, "INSERT INTO ");

  if (replace && /^INSERT\s+INTO\s+settings\b/i.test(normalized)) {
    normalized += " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
  }
  if (ignore) normalized += " ON CONFLICT DO NOTHING";

  if (returningId && /^INSERT\s+INTO\s+/i.test(normalized)) {
    const table = normalized.match(/^INSERT\s+INTO\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)?.slice(1).find(Boolean);
    if (table && !noIdPrimaryKeyTables.has(table.toLowerCase()) && !/\bRETURNING\b/i.test(normalized)) {
      normalized += " RETURNING id";
    }
  }
  return normalized;
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const executor = transactions.getStore() || pool;
  const normalized = parameterize(sql.trim().replace(/;\s*$/, ""), params);
  return executor.query<T>(normalized.sql, normalized.params);
}

export async function queryAll<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return (await query<T>(sql, params)).rows;
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  return (await query<T>(sql, params)).rows[0];
}

export interface ExecutionResult {
  changes: number;
  lastInsertRowid: number | string | undefined;
  rows: Record<string, unknown>[];
}

export async function execute(sql: string, ...params: unknown[]): Promise<ExecutionResult> {
  const result = await query<Record<string, unknown>>(postgresSql(sql, true), params);
  return {
    changes: result.rowCount || 0,
    lastInsertRowid: result.rows[0]?.id as number | string | undefined,
    rows: result.rows,
  };
}

export async function executeScript(sql: string): Promise<void> {
  const executor = transactions.getStore() || pool;
  const compatibleSql = sql
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
    .replace(/\bINT\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")
    .replace(/\bREAL\b/gi, "DOUBLE PRECISION")
    .replace(/\bDATETIME\b/gi, "TIMESTAMPTZ");
  await executor.query(compatibleSql);
}

export function transaction<TArgs extends unknown[], TResult>(
  work: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    if (transactions.getStore()) return await work(...args);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactions.run(client, () => work(...args));
      await client.query("COMMIT");
      return await result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

export async function closePostgresPool(): Promise<void> {
  await pool.end();
}

export async function ensurePostgresSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    client.release();
  }
}

export async function logAction(action: string, entityType: string, entityId: number | null, details: string): Promise<void> {
  await execute(
    "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)",
    action, entityType, entityId, details,
  );
}

export async function createNotification(title: string, message: string, type = "info"): Promise<void> {
  await execute("INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)", title, message, type);
}

function prepare(sql: string) {
  return {
    get: (...params: unknown[]) => queryOne(sql, ...params),
    all: (...params: unknown[]) => queryAll(sql, ...params),
    run: (...params: unknown[]) => execute(sql, ...params),
  };
}

export const postgres = {
  prepare,
  exec: executeScript,
  queryAll,
  queryOne,
  execute,
  executeScript,
  transaction,
  logAction,
  createNotification,
  ensurePostgresSchema,
};
export default postgres;
