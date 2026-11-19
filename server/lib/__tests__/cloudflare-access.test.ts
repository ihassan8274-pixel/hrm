import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccessError,
  clearAccessKeyCache,
  readAccessConfig,
  verifyAccessAssertion,
} from '../cloudflare-access';

const TEAM = 'team.example.cloudflareaccess.com';
const AUD = 'aud-tag-for-the-payroll-app';
const config = { teamDomain: TEAM, audience: AUD };

function makeKey(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid,
    jwk: { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid, use: 'sig', alg: 'RS256' },
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

const keyA = makeKey('key-a');
const keyB = makeKey('key-b');

const sign = (payload: Record<string, unknown>, key = keyA, options: jwt.SignOptions = {}) =>
  jwt.sign(
    { iss: `https://${TEAM}`, aud: AUD, ...payload },
    key.pem,
    { algorithm: 'RS256', keyid: key.kid, expiresIn: '5m', ...options }
  );

const serving = (keys: Array<Record<string, unknown>>) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ keys }),
});

const identity = { email: 'Person@Example.com', sub: 'subject-1' };

beforeEach(() => clearAccessKeyCache());

describe('readAccessConfig', () => {
  it('is dormant until both the team domain and the audience are set', () => {
    expect(readAccessConfig({})).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM })).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_AUD: AUD })).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD })).toEqual(config);
  });

  it('accepts a pasted URL and normalises it to a bare host', () => {
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: `https://${TEAM}/`, CF_ACCESS_AUD: AUD }))
      .toEqual(config);
  });
});

describe('verifyAccessAssertion', () => {
  it('returns the asserted address in lower case', async () => {
    const token = sign(identity);
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .resolves.toEqual({ email: 'person@example.com', subject: 'subject-1' });
  });

  it('refuses a missing or unreadable assertion', async () => {
    const fetchImpl = serving([keyA.jwk]);
    await expect(verifyAccessAssertion(undefined, config, { fetchImpl })).rejects.toBeInstanceOf(AccessError);
    await expect(verifyAccessAssertion('not-a-jwt', config, { fetchImpl })).rejects.toBeInstanceOf(AccessError);
  });

  it('refuses an assertion signed with a symmetric algorithm', async () => {
    const token = jwt.sign(identity, 'shared-secret', { algorithm: 'HS256', keyid: keyA.kid });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses a signature made by a different key that reuses the key id', async () => {
    const token = sign(identity, keyB, { keyid: keyA.kid });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses an unknown key id', async () => {
    const token = sign(identity, keyB);
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses the wrong audience, so an assertion for another app cannot log in here', async () => {
    const token = sign({ ...identity, aud: 'some-other-app' });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses the wrong issuer', async () => {
    const token = sign({ ...identity, iss: 'https://evil.example.com' });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses an expired assertion', async () => {
    const token = sign(identity, keyA, { expiresIn: -60 });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('refuses an assertion that carries no address to map', async () => {
    const token = sign({ sub: 'subject-1' });
    await expect(verifyAccessAssertion(token, config, { fetchImpl: serving([keyA.jwk]) }))
      .rejects.toMatchObject({ status: 401 });
  });

  it('reports an unreachable issuer as a service failure, not a bad credential', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({}) });
    await expect(verifyAccessAssertion(sign(identity), config, { fetchImpl }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('refuses an issuer that publishes no usable key', async () => {
    await expect(verifyAccessAssertion(sign(identity), config, { fetchImpl: serving([]) }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('refetches once when the key rotated after the cache was filled', async () => {
    let published = [keyA.jwk];
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ keys: published }) });
    await verifyAccessAssertion(sign(identity), config, { fetchImpl });
    published = [keyB.jwk];
    await expect(verifyAccessAssertion(sign(identity, keyB), config, { fetchImpl }))
      .resolves.toEqual({ email: 'person@example.com', subject: 'subject-1' });
  });
});

describe('users.email mapping', () => {
  const migration = readFileSync(
    fileURLToPath(new URL('../../db/migrations/007_user_email_identity.sql', import.meta.url)),
    'utf8'
  );

  const seed = () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, status TEXT);');
    db.exec(migration);
    db.prepare("INSERT INTO users (id, username, status) VALUES (1, 'admin', 'active'), (2, 'ess1', 'active'), (3, 'ess2', 'active')").run();
    return db;
  };

  it('leaves every existing account without an address, so password logins are untouched', () => {
    const db = seed();
    expect(db.prepare('SELECT COUNT(*) n FROM users WHERE email IS NULL').get()).toEqual({ n: 3 });
    db.close();
  });

  it('allows many accounts to share the absence of an address', () => {
    const db = seed();
    expect(() => db.prepare('UPDATE users SET email = NULL').run()).not.toThrow();
    db.close();
  });

  it('maps an address to exactly one account regardless of letter case', () => {
    const db = seed();
    db.prepare('UPDATE users SET email = ? WHERE id = 1').run('person@example.com');
    expect(() => db.prepare('UPDATE users SET email = ? WHERE id = 2').run('Person@Example.com')).toThrow(/UNIQUE/);
    expect(db.prepare('SELECT id FROM users WHERE lower(email) = ?').get('person@example.com')).toEqual({ id: 1 });
    db.close();
  });

  it('lets an address move to another account once it is cleared', () => {
    const db = seed();
    db.prepare('UPDATE users SET email = ? WHERE id = 1').run('person@example.com');
    db.prepare('UPDATE users SET email = NULL WHERE id = 1').run();
    expect(() => db.prepare('UPDATE users SET email = ? WHERE id = 2').run('person@example.com')).not.toThrow();
    db.close();
  });
});