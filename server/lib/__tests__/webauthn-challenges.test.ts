import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ChallengeStore,
  CHALLENGE_TTL_MS,
  challengeKeys,
  expectedOriginFor,
  kioskRpId,
} from '../webauthn-challenges';

describe('ChallengeStore — issuing and consuming', () => {
  let store: ChallengeStore;
  beforeEach(() => {
    vi.useFakeTimers();
    store = new ChallengeStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a challenge that was issued under the same key', () => {
    store.issue('login:dev1', 'challenge-abc');
    expect(store.consume('login:dev1')).toBe('challenge-abc');
  });

  // Regression: the original bug verified against a freshly generated random
  // challenge that the browser had never seen, so biometric login could never
  // succeed. This pins the contract that the *issued* value comes back.
  it('returns exactly the value issued, never a freshly generated one', () => {
    store.issue('login:dev1', 'server-issued-value');
    expect(store.consume('login:dev1')).toBe('server-issued-value');
  });

  it('returns null for an unknown key', () => {
    expect(store.consume('login:never-issued')).toBeNull();
  });
});

describe('ChallengeStore — single use (anti-replay)', () => {
  let store: ChallengeStore;
  beforeEach(() => {
    store = new ChallengeStore();
  });

  it('cannot be consumed twice', () => {
    store.issue('login:dev1', 'one-shot');
    expect(store.consume('login:dev1')).toBe('one-shot');
    expect(store.consume('login:dev1')).toBeNull();
  });

  it('removes the entry on consumption so it cannot leak state', () => {
    store.issue('login:dev1', 'one-shot');
    expect(store.has('login:dev1')).toBe(true);
    store.consume('login:dev1');
    expect(store.has('login:dev1')).toBe(false);
  });

  it('keeps flows isolated from one another', () => {
    store.issue(challengeKeys.login('device-A'), 'challenge-A');
    store.issue(challengeKeys.login('device-B'), 'challenge-B');

    expect(store.consume(challengeKeys.login('device-B'))).toBe('challenge-B');
    // Consuming B must not invalidate A.
    expect(store.consume(challengeKeys.login('device-A'))).toBe('challenge-A');
  });

  it('does not let a login challenge satisfy a registration', () => {
    store.issue(challengeKeys.login('dev1'), 'login-challenge');
    expect(store.consume(challengeKeys.register(7))).toBeNull();
  });
});

describe('ChallengeStore — expiry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accepts a challenge just before it expires', () => {
    const store = new ChallengeStore();
    store.issue('k', 'v');
    vi.advanceTimersByTime(CHALLENGE_TTL_MS - 1000);
    expect(store.consume('k')).toBe('v');
  });

  it('rejects a challenge once expired', () => {
    const store = new ChallengeStore();
    store.issue('k', 'v');
    vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1000);
    expect(store.consume('k')).toBeNull();
  });

  it('discards an expired entry rather than returning it', () => {
    const store = new ChallengeStore();
    store.issue('k', 'v');
    vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1);
    store.consume('k');
    expect(store.has('k')).toBe(false);
  });

  it('replaces a prior challenge when the same key is re-issued', () => {
    const store = new ChallengeStore();
    store.issue('k', 'first');
    store.issue('k', 'second');
    // Only the newest challenge is valid; the first was superseded.
    expect(store.consume('k')).toBe('second');
  });

  it('honours a custom TTL', () => {
    const store = new ChallengeStore(50);
    store.issue('k', 'v');
    vi.advanceTimersByTime(60);
    expect(store.consume('k')).toBeNull();
  });
});

describe('ChallengeStore — prune', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('removes only expired entries', () => {
    const store = new ChallengeStore();
    store.issue('old', 'a');
    vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1000);
    store.issue('new', 'b');

    expect(store.prune()).toBe(1);
    expect(store.has('old')).toBe(false);
    expect(store.has('new')).toBe(true);
  });

  it('is safe to call on an empty store', () => {
    expect(new ChallengeStore().prune()).toBe(0);
  });
});

describe('challengeKeys', () => {
  it('namespaces login challenges by device token', () => {
    expect(challengeKeys.login('abc')).toBe('login:abc');
  });

  it('namespaces registration challenges by employee id', () => {
    expect(challengeKeys.register(42)).toBe('register:42');
    expect(challengeKeys.register('42')).toBe('register:42');
  });

  it('does not collide between flows', () => {
    expect(challengeKeys.login('x')).not.toBe(challengeKeys.register('x'));
  });
});

describe('expectedOriginFor', () => {
  const req = (protocol: string, host?: string) => ({
    protocol,
    get: () => host,
  });

  it('derives the origin from the live request by default', () => {
    expect(expectedOriginFor(req('https', 'payroll.example.com'), {})).toBe(
      'https://payroll.example.com'
    );
  });

  // Without this, an IP-based LAN kiosk (http://192.168.1.50:8090) would always
  // be rejected because the origin was hardcoded to https://localhost.
  it('honours the actual host, including LAN IP and port', () => {
    expect(expectedOriginFor(req('http', '192.168.1.50:8090'), {})).toBe(
      'http://192.168.1.50:8090'
    );
  });

  it('prefers WEBAUTHN_ORIGIN when configured (proxy / custom hostname)', () => {
    expect(
      expectedOriginFor(req('http', 'internal:3000'), { WEBAUTHN_ORIGIN: 'https://hr.example.com' })
    ).toBe('https://hr.example.com');
  });
});

describe('kioskRpId', () => {
  it('defaults to localhost', () => {
    expect(kioskRpId({})).toBe('localhost');
  });

  it('uses WEBAUTHN_RP_ID when set', () => {
    expect(kioskRpId({ WEBAUTHN_RP_ID: 'payroll.example.com' })).toBe('payroll.example.com');
  });
});