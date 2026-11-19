// WebAuthn challenge store.
//
// Extracted from server/routes/attendance.ts so the challenge lifecycle can be
// unit tested without Express, SQLite, or a real authenticator.
//
// Why this exists: a WebAuthn challenge is the anti-replay guarantee. If a
// challenge is minted fresh at verification time instead of being remembered
// from the options call, the ceremony can never succeed; if it is not consumed,
// a captured assertion can be replayed. Both failure modes are silent at
// runtime, so they are pinned down by tests here.

export interface PendingChallenge {
  challenge: string;
  employeeId?: number;
  expires: number;
}

/** Challenges are short-lived; the browser ceremony takes seconds, not minutes. */
export const CHALLENGE_TTL_MS = 120_000;

export class ChallengeStore {
  private readonly entries = new Map<string, PendingChallenge>();

  constructor(private readonly ttlMs: number = CHALLENGE_TTL_MS) {}

  /** Mints and remembers a challenge under `key`, replacing any prior one. */
  issue(key: string, challenge: string, employeeId?: number): string {
    this.entries.set(key, { challenge, employeeId, expires: Date.now() + this.ttlMs });
    return challenge;
  }

  /**
   * Returns the challenge for `key` and removes it in the same step, so it can
   * only ever be spent once. Returns null when absent or already expired.
   */
  consume(key: string): string | null {
    const pending = this.entries.get(key);
    if (!pending) return null;
    this.entries.delete(key);
    if (pending.expires < Date.now()) return null;
    return pending.challenge;
  }

  /** Non-destructive peek, used by diagnostics and tests. */
  peek(key: string): PendingChallenge | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Drops expired entries so a long-lived process does not leak memory. */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expires < now) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Namespace builders keep the "which flow owns this challenge" contract in one place. */
export const challengeKeys = {
  login: (deviceToken: string) => `login:${deviceToken}`,
  register: (employeeId: number | string) => `register:${employeeId}`,
};

/**
 * Resolves the WebAuthn relying-party origin.
 *
 * `expectedOrigin` must match where the browser actually ran the ceremony, or
 * verification fails. Derived from the live request by default so local and
 * LAN kiosk deployments work unchanged; override with WEBAUTHN_ORIGIN when the
 * app sits behind a proxy or a custom hostname.
 */
export function expectedOriginFor(
  req: { protocol: string; get(name: string): string | undefined },
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.WEBAUTHN_ORIGIN) return env.WEBAUTHN_ORIGIN;
  return `${req.protocol}://${req.get("host")}`;
}

/** Relying-party ID the browser must be scoped to. */
export function kioskRpId(env: NodeJS.ProcessEnv = process.env): string {
  return env.WEBAUTHN_RP_ID || "localhost";
}