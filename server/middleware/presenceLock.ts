import type { Request, Response, NextFunction } from "express";
import { queryOne } from "../config/postgres";
import { presenceLock } from "../lib/presence";

/**
 * Server-side lock for branch-restricted users.
 *
 * Only an explicit `branch_bound` / `branch_scoped` policy can lock anyone —
 * users without a policy stay fail-open, so no employee is affected merely by
 * the absence of a branch assignment. The permit nonce carries its own expiry,
 * which makes the decision stateless and safe across process restarts.
 *
 * No coordinates are read here: the only inputs are the stored policy and the
 * permit timestamp of the latest open interval.
 */
export const PRESENCE_LOCK_RECOVERY = /^\/api\/presence\/(?:gate|checkout|me|recheck|exit-requests?)(?:\/|$)/;
export const PRESENCE_LOCK_EXEMPT = /^\/api\/(?:auth|settings|notifications|push-tokens|guides|health|ready|metrics)(?:\/|$)/;

export async function enforcePresenceLock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as any).user;
  if (!user?.id) return next();
  const url = String(req.originalUrl || req.path || "").split("?")[0];
  if (PRESENCE_LOCK_EXEMPT.test(url) || PRESENCE_LOCK_RECOVERY.test(url)) return next();
  // Matching the fixed role decisions: administrators and finance are never
  // branch-bound, even if a stale policy row says otherwise.
  const role = String(user.role || "");
  if (role === "admin" || role === "hr_manager" || role === "finance") return next();

  try {
    const row = await queryOne(
      `SELECT p.policy AS policy, i.permit_nonce AS permit_nonce
       FROM users u
       LEFT JOIN user_access_policy p ON p.user_id = u.id
       LEFT JOIN presence_intervals i ON i.user_id = u.id AND i.out_at IS NULL
       WHERE u.id = ?
       ORDER BY i.in_at DESC LIMIT 1`,
      Number(user.id),
    ) as { policy: string | null; permit_nonce: string | null } | undefined;

    const lock = presenceLock(row?.policy, row?.permit_nonce);
    if (!lock.locked) return next();

    return void res.status(403).json({
      error: "انتهت صلاحية تصريح التواجد — سجّل الخروج ثم عد للتسجيل داخل الفرع",
      locked: true,
      reason: "presence_locked",
      expires_at: lock.expires_at ? new Date(lock.expires_at).toISOString() : null,
    });
  } catch (error) {
    // A failed lock lookup must not silently unlock a restricted account.
    return next(error);
  }
}
