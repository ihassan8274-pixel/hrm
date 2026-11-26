import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryOne, state } = vi.hoisted(() => ({
  queryOne: vi.fn(),
  state: { throw: "" as string },
}));
vi.mock("../../config/postgres", () => ({
  // A plain wrapper keeps Vitest's mock-call bookkeeping out of the fail-closed
  // branch: a throwing vi.fn would be reported as a test error even though the
  // middleware catches it and forwards it to next().
  queryOne: (...args: unknown[]) => {
    if (state.throw) throw state.throw;
    return queryOne(...args);
  },
}));

import { enforcePresenceLock } from "../presenceLock";

const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as any;
const req = (user: unknown, url = "/api/employees") =>
  ({ user, originalUrl: url, path: url }) as any;

describe("presence lock middleware", () => {
  beforeEach(() => { queryOne.mockReset(); state.throw = ""; });

  it("never queries for an unauthenticated request", async () => {
    const response = res();
    const next = vi.fn();
    await enforcePresenceLock(req(undefined), response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("keeps fail-open policies and unexpired permits unlocked", async () => {
    const next = vi.fn();
    queryOne.mockResolvedValue({ policy: "open", permit_nonce: `n.${Date.now() + 60_000}` });
    await enforcePresenceLock(req({ id: 7, role: "employee_ess" }), res(), next);
    expect(next).toHaveBeenCalledOnce();

    next.mockClear();
    queryOne.mockResolvedValue({ policy: "branch_bound", permit_nonce: `n.${Date.now() + 60_000}` });
    await enforcePresenceLock(req({ id: 7, role: "employee_ess" }), res(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when a restricted permit has expired", async () => {
    queryOne.mockResolvedValue({ policy: "branch_scoped", permit_nonce: `n.${Date.now() - 1}` });
    const response = res();
    const next = vi.fn();
    await enforcePresenceLock(req({ id: 9, role: "employee_ess" }), response, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ locked: true, reason: "presence_locked" }));
  });

  it("leaves recovery routes reachable so the employee can close the interval", async () => {
    queryOne.mockResolvedValue({ policy: "branch_bound", permit_nonce: `n.${Date.now() - 1}` });
    for (const url of ["/api/presence/me", "/api/presence/checkout", "/api/presence/recheck", "/api/presence/gate"]) {
      const response = res();
      const next = vi.fn();
      await enforcePresenceLock(req({ id: 9, role: "employee_ess" }, url), response, next);
      expect(next, url).toHaveBeenCalledOnce();
      expect(response.status, url).not.toHaveBeenCalled();
    }
  });

  it("never locks administrators or finance even with a stale restrictive row", async () => {
    for (const role of ["admin", "hr_manager", "finance"]) {
      const next = vi.fn();
      const response = res();
      await enforcePresenceLock(req({ id: 1, role }), response, next);
      expect(next, role).toHaveBeenCalledOnce();
      expect(response.status, role).not.toHaveBeenCalled();
    }
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("fails closed by forwarding a lookup error instead of unlocking", async () => {
    state.throw = "db down";
    const forwarded: unknown[] = [];
    const next = ((error?: unknown) => { forwarded.push(error); }) as any;
    await enforcePresenceLock(req({ id: 9, role: "employee_ess" }), res(), next);
    expect(forwarded).toEqual(["db down"]);
  });
});
