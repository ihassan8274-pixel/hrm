// Self-hosted, anonymous frontend error collector.
//
// This endpoint is deliberately public (a logged-out user can still report a
// crash) but accepts only four redacted fields. It never reads cookies,
// headers, user ids, IP addresses or tokens, and it never echoes submitted
// content back to the browser. Failures are silent so reporting itself can
// never break the UI.
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import db from "../config/postgres";
import { config } from "../config/env";
import { validateBody } from "../middleware/validation";
import { log } from "../lib/logger";

const redactSecrets = (text: string) => text
  .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
  .replace(/\b(token|password|secret|api[_-]?key)=([^&\s"']+)/gi, "$1=[redacted]");

/** Server-side copy of the frontend redaction; frontend code is not imported. */
export function clean(text: string, max = 500, preserveLines = false): string {
  const flattened = preserveLines
    ? text.replace(/[\u0000-\u001F\u007F]/g, (c) => (c === "\n" || c === "\t" ? c : " "))
    : text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ");
  return redactSecrets(flattened).trim().slice(0, max);
}

/** Keeps only a path-like, identifier-free URL fragment — never a full URL. */
export function safeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  let value = raw;
  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).pathname; } catch { value = "/"; }
  }
  const path = value.split(/[?#]/)[0] || "/";
  return clean(path, 300)
    .replace(/\/kiosk\/[^/]+/gi, "/kiosk/[redacted]")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().trim().min(1).max(4000).optional(),
  url: z.string().trim().max(300).optional(),
  level: z.enum(["error", "warn", "info"]).default("error"),
}).strict();

export type ClientErrorBody = z.infer<typeof clientErrorSchema>;

const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many error reports" },
});

export function registerClientErrors(app: express.Express) {
  app.post(
    "/api/client-errors",
    clientErrorLimiter,
    (req, res, next) => {
      const length = Number(req.headers["content-length"] || 0);
      if (Number.isFinite(length) && length > 16_000) {
        res.status(413).json({ error: "Payload too large" });
        return;
      }
      next();
    },
    validateBody(clientErrorSchema),
    async (req, res) => {
      const body = req.body as ClientErrorBody;
      if (!config.CLIENT_ERROR_REPORTING_ENABLED) {
        res.status(204).end();
        return;
      }
      try {
        await db.prepare(
          `INSERT INTO client_errors (message, stack, url, level) VALUES (?, ?, ?, ?)`,
        ).run(
          clean(body.message),
          body.stack ? clean(body.stack, 4000, true) : null,
          safeUrl(body.url) ?? null,
          body.level,
        );
      } catch (error) {
        log.error("[client-errors] insert failed:", error instanceof Error ? error.message : String(error));
      }
      res.status(204).end();
    },
  );
}
