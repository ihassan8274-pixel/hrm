import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  hashPasswordSync,
  isScryptHash,
  needsRehash,
  verifyPassword,
  verifyPasswordSync,
} from "../password";

describe("password hashing", () => {
  it("creates a non-blocking scrypt hash that verifies", async () => {
    const hash = await hashPassword("LoadTest@2026");
    expect(isScryptHash(hash)).toBe(true);
    expect(needsRehash(hash)).toBe(false);
    expect(await verifyPassword("LoadTest@2026", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("supports the synchronous variant used by seed scripts", () => {
    const hash = hashPasswordSync("Sync@2026");
    expect(isScryptHash(hash)).toBe(true);
    expect(verifyPasswordSync("Sync@2026", hash)).toBe(true);
    expect(verifyPasswordSync("wrong", hash)).toBe(false);
  });

  it("still verifies legacy bcrypt hashes and marks them for rehash", async () => {
    const legacy = bcrypt.hashSync("Legacy@2026", 10);
    expect(needsRehash(legacy)).toBe(true);
    expect(await verifyPassword("Legacy@2026", legacy)).toBe(true);
    expect(verifyPasswordSync("Legacy@2026", legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
  });

  it("rejects malformed or tampered hashes", async () => {
    const hash = await hashPassword("Tamper@2026");
    const tampered = `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`;
    expect(await verifyPassword("Tamper@2026", tampered)).toBe(false);
    expect(await verifyPassword("Tamper@2026", "scrypt$not$valid")).toBe(false);
    expect(await verifyPassword("Tamper@2026", "")).toBe(false);
  });
});
