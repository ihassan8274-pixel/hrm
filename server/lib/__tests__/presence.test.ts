import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  isPermitExpired,
  isRestrictedPolicy,
  mergeIntervals,
  mergedMinutes,
  minuteValue,
  permitExpiry,
  presenceLock,
  presencePermitMinutes,
} from "../presence";

describe("mergeIntervals", () => {
  it("returns an empty timeline for no intervals", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("keeps disjoint intervals separate", () => {
    expect(
      mergeIntervals([
        { in_at: "2026-01-01T08:00:00Z", out_at: "2026-01-01T09:00:00Z" },
        { in_at: "2026-01-01T11:00:00Z", out_at: "2026-01-01T12:00:00Z" },
      ]),
    ).toEqual([
      { start: Date.parse("2026-01-01T08:00:00Z"), end: Date.parse("2026-01-01T09:00:00Z") },
      { start: Date.parse("2026-01-01T11:00:00Z"), end: Date.parse("2026-01-01T12:00:00Z") },
    ]);
  });

  it("merges overlaps, adjacency and nesting without double counting", () => {
    const merged = mergeIntervals([
      { in_at: "2026-01-01T09:45:00Z", out_at: "2026-01-01T10:30:00Z" },
      { in_at: "2026-01-01T08:00:00Z", out_at: "2026-01-01T09:00:00Z" },
      { in_at: "2026-01-01T09:00:00Z", out_at: "2026-01-01T09:45:00Z" },
      { in_at: "2026-01-01T09:10:00Z", out_at: "2026-01-01T09:20:00Z" },
    ]);
    expect(merged).toEqual([
      { start: Date.parse("2026-01-01T08:00:00Z"), end: Date.parse("2026-01-01T10:30:00Z") },
    ]);
    expect(mergedMinutes(merged)).toBe(150);
  });

  it("drops open, backwards and unparseable intervals", () => {
    expect(
      mergeIntervals([
        { in_at: "2026-01-01T08:00:00Z", out_at: null },
        { in_at: "2026-01-01T09:00:00Z", out_at: "2026-01-01T08:00:00Z" },
        { in_at: "not-a-date", out_at: "2026-01-01T10:00:00Z" },
      ]),
    ).toEqual([]);
  });

  it("accepts Date objects and SQLite-style timestamps", () => {
    const merged = mergeIntervals([
      { in_at: new Date("2026-01-01T08:00:00Z"), out_at: new Date("2026-01-01T08:30:00Z") },
      { in_at: "2026-01-01 08:30:00", out_at: "2026-01-01 09:00:00" },
    ]);
    expect(merged).toHaveLength(1);
    expect(mergedMinutes(merged)).toBe(60);
  });
});

describe("minuteValue", () => {
  it("pro-rates salary over working days, hours and minutes", () => {
    // 12000 / (22 * 8 * 60) * 60 = 68.18
    expect(minuteValue(12000, 22, 8, 60)).toBe(68.18);
  });

  it("returns zero for zero salary or a zero denominator", () => {
    expect(minuteValue(0, 22, 8, 60)).toBe(0);
    expect(minuteValue(12000, 0, 8, 60)).toBe(0);
    expect(minuteValue(12000, 22, 0, 60)).toBe(0);
  });

  it("never returns a negative value", () => {
    expect(minuteValue(-1000, 22, 8, 60)).toBe(0);
    expect(minuteValue(12000, 22, 8, -60)).toBe(0);
    expect(minuteValue(12000, -22, 8, 60)).toBe(0);
  });
});

describe("haversineMeters", () => {
  it("is zero at the same point and about 111 km per degree of latitude", () => {
    expect(haversineMeters(24.7136, 46.6753, 24.7136, 46.6753)).toBe(0);
    expect(haversineMeters(24, 46, 25, 46)).toBeGreaterThan(110_000);
    expect(haversineMeters(24, 46, 25, 46)).toBeLessThan(112_000);
  });
});

describe("presence lock (10-minute rule)", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const nonce = `abcdef.${now + 10 * 60_000}`;

  it("restricts only explicit branch policies", () => {
    expect(isRestrictedPolicy("branch_bound")).toBe(true);
    expect(isRestrictedPolicy("branch_scoped")).toBe(true);
    for (const policy of ["open", "system_admin", "finance", "", undefined]) {
      expect(isRestrictedPolicy(policy)).toBe(false);
    }
  });

  it("reads the expiry from the self-describing nonce", () => {
    expect(permitExpiry(nonce)).toBe(now + 10 * 60_000);
    expect(permitExpiry("legacy-nonce")).toBeNull();
    expect(permitExpiry(null)).toBeNull();
  });

  it("locks a restricted user only after the grace window", () => {
    expect(isPermitExpired(nonce, now)).toBe(false);
    expect(isPermitExpired(nonce, now + 10 * 60_000 - 1)).toBe(false);
    expect(isPermitExpired(nonce, now + 10 * 60_000)).toBe(true);
    expect(presenceLock("branch_bound", nonce, now + 10 * 60_000)).toEqual({
      locked: true,
      expires_at: now + 10 * 60_000,
    });
  });

  it("keeps open, system_admin and finance permanently unlocked", () => {
    for (const policy of ["open", "system_admin", "finance"]) {
      expect(presenceLock(policy, nonce, now + 60 * 60_000)).toEqual({
        locked: false,
        expires_at: null,
      });
    }
  });

  it("does not lock a restricted user whose interval has no permit", () => {
    expect(presenceLock("branch_bound", null, now + 60 * 60_000).locked).toBe(false);
  });

  it("caps restricted permits at ten minutes even with a longer configured TTL", () => {
    expect(presencePermitMinutes("branch_bound", 60)).toBe(10);
    expect(presencePermitMinutes("branch_scoped", 60)).toBe(10);
    expect(presencePermitMinutes("open", 60)).toBe(60);
    expect(presencePermitMinutes("branch_bound", 0)).toBe(10);
  });
});
