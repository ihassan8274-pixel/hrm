import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  run: vi.fn(),
  generate: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../config/postgres", () => ({
  default: {
    prepare: (sql: string) => ({
      get: (...params: unknown[]) => mocks.get(sql, ...params),
      run: (...params: unknown[]) => mocks.run(sql, ...params),
    }),
  },
}));
vi.mock("../logger", () => ({ log: { error: mocks.logError, info: vi.fn() } }));
vi.mock("../../routes/payroll/period", () => ({ generatePayrollPeriod: mocks.generate }));

import { runPayrollAutoGeneration } from "../payroll-auto-scheduler";

let marker: string | null;
let latestPeriod: number | null;
let activeEmployees: number;
let existingRows: number;

beforeEach(() => {
  marker = null;
  latestPeriod = null;
  activeEmployees = 181;
  existingRows = 0;
  mocks.get.mockReset();
  mocks.run.mockReset();
  mocks.generate.mockReset();
  mocks.logError.mockReset();
  mocks.get.mockImplementation((sql: string) => {
    if (sql.includes("settings WHERE key")) return Promise.resolve(marker ? { value: marker } : undefined);
    if (sql.includes("MAX(year")) return Promise.resolve({ period: latestPeriod });
    if (sql.includes("FROM employees")) return Promise.resolve({ n: activeEmployees });
    if (sql.includes("FROM payroll")) return Promise.resolve({ n: existingRows });
    return Promise.resolve(undefined);
  });
  mocks.run.mockImplementation((_sql: string, key: string, value: string) => {
    if (key === "payroll_auto_last_period") marker = value;
    return Promise.resolve({});
  });
  mocks.generate.mockResolvedValue({ count: 181, existing: 0, skipped: false });
});

describe("monthly payroll auto scheduler", () => {
  it("targets the previous calendar month, including across a year boundary", async () => {
    marker = "2026-11";
    expect((await runPayrollAutoGeneration(new Date("2027-01-15T00:00:00Z"))).period).toBe("2026-12");
    expect((await runPayrollAutoGeneration(new Date("2026-03-01T00:00:00Z"))).period).toBe("2026-02");
  });

  it("does not back-fill old months on a fresh install that already has payroll", async () => {
    latestPeriod = 202611; // newest register entry = 2026/11
    const result = await runPayrollAutoGeneration(new Date("2026-11-23T00:00:00Z"));
    expect(result).toMatchObject({ period: "2026-10", status: "already-covered" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("generates the previous month on a genuinely empty installation", async () => {
    const result = await runPayrollAutoGeneration(new Date("2026-11-23T00:00:00Z"));
    expect(result).toMatchObject({ period: "2026-10", status: "generated", count: 181 });
    expect(mocks.generate).toHaveBeenCalledWith(10, 2026, { entityId: null, branchId: null, employeeId: null }, "auto");
    expect(marker).toBe("2026-10");
  });

  it("recognises a manually generated period and only records the marker", async () => {
    marker = "2026-09";
    existingRows = 181;
    const result = await runPayrollAutoGeneration(new Date("2026-11-23T00:00:00Z"));
    expect(result).toMatchObject({ period: "2026-10", status: "already-present", count: 181 });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(marker).toBe("2026-10");
  });

  it("leaves a locked period for a later retry without advancing the marker", async () => {
    mocks.generate.mockResolvedValue({ count: 0, existing: 0, skipped: true, reason: "locked" });
    const result = await runPayrollAutoGeneration(new Date("2026-11-23T00:00:00Z"));
    expect(result).toMatchObject({ period: "2026-10", status: "locked" });
    expect(marker).toBeNull();
  });

  it("never creates an empty period when there are no active employees", async () => {
    activeEmployees = 0;
    const result = await runPayrollAutoGeneration(new Date("2026-11-23T00:00:00Z"));
    expect(result.status).toBe("no-employees");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
