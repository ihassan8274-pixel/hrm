/**
 * Password hashing with a native-backed, non-blocking primitive.
 *
 * New hashes use Node's scrypt, which runs on the libuv threadpool. The old
 * bcryptjs hashes stay readable so nobody is locked out by a deployment, and
 * successful legacy logins are upgraded in the background by the auth route.
 *
 * Stored format: scrypt$<N>$<r>$<p>$<saltHex>$<derivedKeyHex>
 */
import {
  randomBytes,
  scrypt as cryptoScrypt,
  scryptSync as cryptoScryptSync,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";

const PREFIX = "scrypt";
const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };

function optionsFor(n: number, r: number, p: number): ScryptOptions {
  // Node rejects maxmem <= 128*N*r, so leave a comfortable margin. The cap
  // prevents a malformed stored hash from forcing an unbounded allocation.
  return { N: n, r, p, maxmem: Math.min(128 * n * r * 2, 256 * 1024 * 1024) };
}

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    cryptoScrypt(password, salt, KEYLEN, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export function isScryptHash(hash: string): boolean {
  return typeof hash === "string" && hash.startsWith(`${PREFIX}$`);
}

/** True when a stored hash should be upgraded to the current format. */
export function needsRehash(hash: string): boolean {
  return !isScryptHash(hash);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, optionsFor(N, R, P));
  return `${PREFIX}$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = cryptoScryptSync(password, salt, KEYLEN, optionsFor(N, R, P));
  return `${PREFIX}$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyScrypt(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isSafeInteger(n) || n < 1024 || n > (1 << 20) || (n & (n - 1)) !== 0) return false;
  if (!Number.isSafeInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isSafeInteger(p) || p < 1 || p > 16) return false;
  if (!new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "i").test(parts[4])) return false;
  if (!new RegExp(`^[0-9a-f]{${KEYLEN * 2}}$`, "i").test(parts[5])) return false;

  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  try {
    const actual = await derive(password, salt, optionsFor(n, r, p));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function verifyScryptSync(password: string, hash: string): boolean {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isSafeInteger(n) || n < 1024 || n > (1 << 20) || (n & (n - 1)) !== 0) return false;
  if (!Number.isSafeInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isSafeInteger(p) || p < 1 || p > 16) return false;
  if (!new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "i").test(parts[4])) return false;
  if (!new RegExp(`^[0-9a-f]{${KEYLEN * 2}}$`, "i").test(parts[5])) return false;

  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  try {
    const actual = cryptoScryptSync(password, salt, KEYLEN, optionsFor(n, r, p));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Verifies both the new scrypt format and legacy bcryptjs hashes. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash || typeof hash !== "string") return false;
  if (isScryptHash(hash)) return verifyScrypt(password, hash);
  return bcrypt.compare(password, hash);
}

/** Synchronous variant for startup checks that cannot be async. */
export function verifyPasswordSync(password: string, hash: string): boolean {
  if (!hash || typeof hash !== "string") return false;
  if (isScryptHash(hash)) return verifyScryptSync(password, hash);
  return bcrypt.compareSync(password, hash);
}
