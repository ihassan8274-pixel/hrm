import { describe, expect, it } from "vitest";
import { isGosiExempt } from "../country-rules";

describe("isGosiExempt", () => {
  it("accepts the numeric flag stored in PostgreSQL and the boolean UI flag", () => {
    expect(isGosiExempt({ gosi_exempt: 1 })).toBe(true);
    expect(isGosiExempt({ gosi_exempt: true })).toBe(true);
  });

  it("treats every non-exempt value as covered, so nothing is withheld by accident", () => {
    expect(isGosiExempt({ gosi_exempt: 0 })).toBe(false);
    expect(isGosiExempt({ gosi_exempt: false })).toBe(false);
    expect(isGosiExempt({ gosi_exempt: null })).toBe(false);
    expect(isGosiExempt({})).toBe(false);
    expect(isGosiExempt(null)).toBe(false);
  });
});
