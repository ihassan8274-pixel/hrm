import type { Request, Response, NextFunction } from 'express';
import db from '../config/postgres';
import {
  resolveOrganizationScope,
  assertEmployeeWritableScope,
  ScopeError,
  type OrganizationScope,
} from '../lib/organization-scope';

export async function requireOrganizationScope(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.organizationScope = await resolveOrganizationScope(db, (req as Request & { user: { id: number } }).user.id, req.query);
    next();
  } catch (error) {
    if (error instanceof ScopeError) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}

export function organizationScope(res: Response): OrganizationScope {
  return res.locals.organizationScope;
}

/**
 * Refuses the request when the target employee sits outside the caller's
 * scope. Returns true when the response has already been sent, so the caller
 * can `if (await denyEmployee(...)) return;`.
 */
export async function denyEmployee(
  res: Response,
  scope: OrganizationScope,
  employeeId: number,
  label = 'الموظف',
): Promise<boolean> {
  try {
    await assertEmployeeWritableScope(db, scope, employeeId, label);
    return false;
  } catch (error) {
    if (error instanceof ScopeError) {
      res.status(error.status).json({ error: error.message });
      return true;
    }
    throw error;
  }
}
