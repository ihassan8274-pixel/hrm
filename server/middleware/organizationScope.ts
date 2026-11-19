import type { Request, Response, NextFunction } from 'express';
import db from '../config/postgres';
import { resolveOrganizationScope, ScopeError, type OrganizationScope } from '../lib/organization-scope';

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
