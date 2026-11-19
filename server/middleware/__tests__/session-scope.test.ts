import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock('../../config/postgres', () => ({ default: { prepare: vi.fn() }, queryOne: mocks.queryOne }));
vi.mock('../../config/env', () => ({ config: { JWT_SECRET: 'test-only-organization-key', JWT_EXPIRY: '1h' } }));
import { authenticateToken } from '../auth';

const token = () => jwt.sign({ id: 7, role: 'admin', entity_id: 99 }, 'test-only-organization-key', { expiresIn: '1h' });
const account = { id: 7, username: 'fixture', role: 'finance', entity_id: 1, employee_id: null };
const call = async (header: string | undefined) => {
  const req = { headers: { authorization: header } } as Request & { user: typeof account };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  await authenticateToken(req, res as unknown as Response, next);
  return { req, res, next };
};
beforeEach(() => { mocks.queryOne.mockReset(); });

describe('live session organization identity', () => {
  it('refreshes role and entity instead of trusting stale JWT privileges', async () => {
    const sessionGet = vi.fn().mockResolvedValue({ ok: 1 });
    mocks.queryOne.mockImplementation((sql: string, ...params: unknown[]) =>
      sql.includes('FROM sessions') ? sessionGet(sql, ...params) : Promise.resolve(account));
    const t = token();
    const { req, next } = await call(`Bearer ${t}`);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.role).toBe('finance');
    expect(req.user.entity_id).toBe(1);
    expect(sessionGet).toHaveBeenCalledWith(expect.stringContaining('FROM sessions'), t, 7);
  });
  it('refuses disabled or deleted accounts even with a valid session', async () => {
    mocks.queryOne.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('FROM sessions') ? { ok: 1 } : undefined));
    const { res, next } = await call(`Bearer ${token()}`);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('rejects a revoked session', async () => {
    mocks.queryOne.mockResolvedValue(undefined);
    const { res, next } = await call(`Bearer ${token()}`);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('requires a token', async () => {
    const { res, next } = await call(undefined);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
