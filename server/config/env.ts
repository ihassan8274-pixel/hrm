import path from "path";
import fs from "fs";
import crypto from "crypto";
import { loadProjectEnv } from "./load-env";

// The same file the database layer loads, so both agree on which environment
// the process is running in.
loadProjectEnv();
import { log } from "../lib/logger";

const fromEnv = (process.env.JWT_SECRET || "").trim();

let jwtSecret = fromEnv;
let secretFile: string | null = null;

if (!jwtSecret) {
  secretFile = path.join(process.cwd(), ".jwt-secret");
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, "utf8").trim();
      if (saved) {
        jwtSecret = saved;
      }
    }
    if (!jwtSecret) {
      const generated = crypto.randomBytes(48).toString("base64");
      fs.writeFileSync(secretFile, generated + "\n", { mode: 0o600 });
      try {
        fs.chmodSync(secretFile, 0o600);
      } catch {}
      jwtSecret = generated;
      log.info(
        `[security] لم يُضبط JWT_SECRET في البيئة — تم توليد سرّ عشوائي (96 حرفًا) وحفظه في: ${secretFile}`
      );
    }
  } catch (e) {
    throw new Error(
      "تعذّر توليد أو قراءة JWT_SECRET: " + (e as Error).message
    );
  }
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8090,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRY: "24h",
  // A signed-in workstation must not stay authenticated when nobody is using it.
  // The browser tracks real user input with the same value (src/lib/sessionIdle.ts).
  IDLE_TIMEOUT_MS: Math.max(60_000, Number(process.env.IDLE_TIMEOUT_MS) || 15 * 60 * 1000),
  DB_PATH: process.env.DB_PATH || "payroll.db",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  // Comma-separated fallbacks; availability changes, so the assistant tries each in order.
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-flash-lite-latest,gemini-flash-latest,gemini-3.8-flash",
  APP_URL: process.env.APP_URL || "http://localhost:8090",
} as const;

/**
 * Checks the shape of the `.env` file itself.
 *
 * `dotenv` parses a multi-line quoted value into one clean string, so the
 * application never sees the problem — but `docker run --env-file .env` takes
 * the first physical line only and keeps the quote characters, and the
 * connection then fails with a misleading "password authentication failed".
 * The check runs at boot so the mistake is reported where it is made.
 */
export function assertEnvFileShape(envPath = path.join(process.cwd(), ".env")): void {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  const urlIndex = lines.findIndex((line) => /^\s*DATABASE_URL\s*=/.test(line));
  if (urlIndex === -1) return;

  const first = lines[urlIndex];
  const value = first.slice(first.indexOf("=") + 1).trim();
  const quoted = value.startsWith('"') || value.startsWith("'");

  // A quoted value is only a problem when it is not closed on the same line.
  const closesOnSameLine = !quoted || (value.length > 1 && value.endsWith(value[0]));
  const multiline = quoted && !closesOnSameLine;

  if (multiline) {
    throw new Error(
      `DATABASE_URL spans several lines in ${envPath} (line ${urlIndex + 1}). ` +
        "Put it on one line — `docker run --env-file` reads the first line only.",
    );
  }
  if (quoted) {
    throw new Error(
      `DATABASE_URL is quoted in ${envPath} (line ${urlIndex + 1}). ` +
        "Remove the quotes — `docker run --env-file` keeps them as part of the value.",
    );
  }
  try {
    const parsed = new URL(value);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
      throw new Error("unexpected protocol");
    }
  } catch {
    throw new Error(
      `DATABASE_URL in ${envPath} (line ${urlIndex + 1}) is not a valid PostgreSQL URL. ` +
        "Expected: postgresql://user:password@host:5432/database",
    );
  }
}