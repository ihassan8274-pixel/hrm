import "dotenv/config";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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
      console.log(
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
  DB_PATH: process.env.DB_PATH || "payroll.db",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  APP_URL: process.env.APP_URL || "http://localhost:8090",
} as const;