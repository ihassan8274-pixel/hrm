import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), prepare: vi.fn(), run: vi.fn() }));
vi.mock('../../config/postgres', () => ({
  default: { prepare: (...args: unknown[]) => { mocks.prepare(...args); return { run: mocks.run }; } },
  queryOne: mocks.queryOne,
}));
vi.mock('../../config/env', () => ({
  config: { JWT_SECRET: 'test-only-organization-key', JWT_EXPIRY: '1h', IDLE_TIMEOUT_MS: 15 * 60 * 1000 },
}));
import { authenticateToken } from '../auth';

// Fixture only: both the mocked config above and this signing key are
// throwaway values for a unit test, never a deployed credential.
// nosemgrep: javascript.jsonwebtoken.security.jwt-hardcode.hardcoded-jwt-secret
const token = () => jwt.sign({ id: 7, role: 'admin', entity_id: 99 }, 'test-only-organization-key', { expiresIn: '1h' });
const account = { id: 7, username: 'fixture', role: 'finance', entity_id: 1, employee_id: null };
const call = async (header: string | undefined) => {
  const req = { headers: { authorization: header } } as Request & { user: typeof account };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  await authenticateToken(req, res as unknown as Response, next);
  return { req, res, next };
};
beforeEach(() => {
  mocks.queryOne.mockReset();
  mocks.prepare.mockReset();
  mocks.run.mockReset();
});

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

describe('server-side idle timeout', () => {
  it('revokes a session whose last real user action is too old', async () => {
    mocks.run.mockResolvedValue(undefined);
    mocks.queryOne.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('FROM sessions')
        ? { auth_last_activity: new Date(Date.now() - 16 * 60 * 1000).toISOString(), created_at: new Date().toISOString() }
        : account));
    const { res, next } = await call(`Bearer ${token()}`);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token revoked', code: 'SESSION_IDLE_TIMEOUT' });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps a session alive while the heartbeat is fresh', async () => {
    mocks.queryOne.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('FROM sessions')
        ? { auth_last_activity: new Date(Date.now() - 1000).toISOString(), created_at: new Date().toISOString() }
        : account));
    const { req, next } = await call(`Bearer ${token()}`);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.role).toBe('finance');
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
