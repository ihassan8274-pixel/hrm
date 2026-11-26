import { describe, expect, it } from "vitest";
import {
  ESS_READ_ALLOWLIST,
  ESS_WRITE_ALLOWLIST,
  PERM,
  ROUTE_PERMISSIONS,
  hasPermission,
  normalizeApiUrl,
} from "../auth";

const ruleFor = (method: string, url: string) =>
  ROUTE_PERMISSIONS.find((rule) =>
    (rule.method === "*" || rule.method === method) && rule.pattern.test(normalizeApiUrl(url)),
  );

const readAllowed = (url: string) =>
  ESS_READ_ALLOWLIST.some((rule) => rule.pattern.test(normalizeApiUrl(url)));
const writeAllowed = (method: string, url: string) =>
  ESS_WRITE_ALLOWLIST.some((rule) => rule.method === method && rule.pattern.test(normalizeApiUrl(url)));

describe("branch presence permissions", () => {
  it("gives PRESENCE_MANAGE only to admin and hr_manager", () => {
    for (const role of ["admin", "hr_manager"]) {
      expect(hasPermission(role, PERM.PRESENCE_MANAGE), role).toBe(true);
    }
    for (const role of ["branch_manager", "finance", "employee_ess", "", "unknown"]) {
      expect(hasPermission(role, PERM.PRESENCE_MANAGE), role || "anonymous").toBe(false);
    }
  });

  it("keeps branch_manager on ATTENDANCE_MANAGE but not PRESENCE_MANAGE", () => {
    expect(hasPermission("branch_manager", PERM.ATTENDANCE_MANAGE)).toBe(true);
    expect(hasPermission("branch_manager", PERM.PRESENCE_MANAGE)).toBe(false);
    expect(hasPermission("finance", PERM.ATTENDANCE_MANAGE)).toBe(false);
  });

  it("maps management routes to PRESENCE_MANAGE", () => {
    const managed: Array<[string, string]> = [
      ["GET", "/api/presence/users"],
      ["GET", "/api/presence/policies"],
      ["POST", "/api/presence/policies"],
      ["GET", "/api/presence/scopes"],
      ["POST", "/api/presence/scopes"],
      ["POST", "/api/presence/schedules"],
      ["POST", "/api/presence/violations/12/decide"],
      ["POST", "/api/presence/drift/3/ack"],
    ];
    for (const [method, url] of managed) {
      expect(ruleFor(method, url)?.perm, `${method} ${url}`).toBe(PERM.PRESENCE_MANAGE);
    }
  });

  it("maps supervisor routes to ATTENDANCE_MANAGE", () => {
    const supervised: Array<[string, string]> = [
      ["POST", "/api/presence/gate"],
      ["POST", "/api/presence/recheck"],
      ["POST", "/api/presence/checkout"],
      ["GET", "/api/presence/me"],
      ["GET", "/api/presence/schedules"],
      ["POST", "/api/presence/exit-request"],
      ["GET", "/api/presence/exit-requests"],
      ["GET", "/api/presence/violations"],
      ["GET", "/api/presence/reports/hours"],
      ["GET", "/api/presence/reports/hours/csv"],
      ["GET", "/api/presence/reports/violations"],
      ["GET", "/api/presence/reports/violations/csv"],
      ["POST", "/api/presence/violations/12/confirm"],
      ["GET", "/api/presence/drift"],
    ];
    for (const [method, url] of supervised) {
      expect(ruleFor(method, url)?.perm, `${method} ${url}`).toBe(PERM.ATTENDANCE_MANAGE);
    }
  });

  it("allowlists exactly the ESS presence self-service surface", () => {
    for (const url of [
      "/api/presence/me",
      "/api/presence/schedules",
      "/api/presence/exit-requests",
      "/api/presence/violations",
      "/api/presence/reports/hours",
      "/api/presence/reports/hours/csv",
      "/api/presence/reports/violations",
      "/api/presence/reports/violations/csv",
    ]) {
      expect(readAllowed(url), url).toBe(true);
    }
    for (const url of [
      "/api/presence/users",
      "/api/presence/policies",
      "/api/presence/scopes",
      "/api/presence/drift",
    ]) {
      expect(readAllowed(url), url).toBe(false);
    }
    expect(writeAllowed("POST", "/api/presence/gate")).toBe(true);
    expect(writeAllowed("POST", "/api/presence/recheck")).toBe(true);
    expect(writeAllowed("POST", "/api/presence/checkout")).toBe(true);
    expect(writeAllowed("POST", "/api/presence/exit-request")).toBe(true);
    for (const [method, url] of [
      ["POST", "/api/presence/policies"],
      ["POST", "/api/presence/scopes"],
      ["POST", "/api/presence/schedules"],
      ["POST", "/api/presence/violations/12/confirm"],
      ["POST", "/api/presence/violations/12/decide"],
      ["POST", "/api/presence/drift/3/ack"],
    ]) {
      expect(writeAllowed(method, url), `${method} ${url}`).toBe(false);
    }
  });

  it("denies ESS every presence route outside the allowlists", () => {
    for (const [method, url] of [
      ["GET", "/api/presence/users"],
      ["GET", "/api/presence/policies"],
      ["GET", "/api/presence/scopes"],
      ["GET", "/api/presence/drift"],
      ["POST", "/api/presence/schedules"],
      ["POST", "/api/presence/violations/12/decide"],
    ]) {
      const essCanCall = method === "GET" ? readAllowed(url) : writeAllowed(method, url);
      expect(essCanCall, `${method} ${url}`).toBe(false);
    }
  });
});
