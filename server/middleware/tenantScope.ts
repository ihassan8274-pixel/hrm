import type { Request, Response, NextFunction } from "express";
import db from "../config/postgres";
import { resolveWriteScope, ScopeError } from "../lib/organization-scope";
import { assertTenantWriteScope } from "../lib/tenant-write-scope";
import { WRITE_METHODS, normalizeApiUrl } from "./auth";

/**
 * Applies the tenant scope to every authenticated write. Read routes are left
 * to their own filters, and anonymous kiosk traffic carries no account, so it
 * passes through untouched.
 */
export async function enforceTenantWriteScope(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: { id: number } }).user;
  if (!user?.id) return next();
  if (!WRITE_METHODS.has(req.method.toUpperCase())) return next();

  try {
    const scope = await resolveWriteScope(db, user.id, req.query as Record<string, unknown>);
    await assertTenantWriteScope(db, scope, {
      method: req.method.toUpperCase(),
      url: normalizeApiUrl(req.originalUrl || req.path),
      body: (req.body ?? {}) as Record<string, unknown>,
    });
    next();
  } catch (error) {
    if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}
