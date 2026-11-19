import { createPublicKey, type JsonWebKey } from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Cloudflare Access as the trusted identity issuer.
 *
 * Access authenticates the person at the edge and forwards a signed assertion in
 * the `Cf-Access-Jwt-Assertion` header. Verifying that signature here is what makes
 * the login federated: payroll never receives a password from another system, and
 * never hands its own session to one. The assertion is only trusted because it is
 * signed by Cloudflare's key and carries this application's audience — a copy of
 * the header sent straight to the origin without a genuine signature is refused.
 */

export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AccessConfig {
  teamDomain: string;
  audience: string;
}

export interface AccessIdentity {
  email: string;
  subject: string;
}

/** Returns null when the operator has not configured Access, so the feature stays dormant. */
export function readAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig | null {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const audience = String(env.CF_ACCESS_AUD || "").trim();
  if (!teamDomain || !audience) return null;
  return { teamDomain, audience };
}

interface KeySet {
  pemByKid: Map<string, string>;
  fetchedAt: number;
}

const KEYS_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, KeySet>();

export function clearAccessKeyCache(): void {
  keyCache.clear();
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

async function fetchKeySet(
  teamDomain: string,
  fetchImpl: FetchLike
): Promise<Map<string, string>> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new AccessError(503, "تعذّر جلب مفاتيح التحقق من جهة الهوية");
  }
  const body = (await response.json()) as { keys?: Array<Record<string, unknown>> };
  const pemByKid = new Map<string, string>();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
    try {
      const pem = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" })
        .export({ type: "spki", format: "pem" })
        .toString();
      pemByKid.set(jwk.kid, pem);
    } catch {
      // A malformed published key must not take the whole set down with it.
    }
  }
  if (pemByKid.size === 0) {
    throw new AccessError(503, "جهة الهوية لم تنشر أي مفتاح تحقق صالح");
  }
  return pemByKid;
}

async function loadKeys(teamDomain: string, fetchImpl: FetchLike, force: boolean): Promise<Map<string, string>> {
  const cached = keyCache.get(teamDomain);
  if (!force && cached && Date.now() - cached.fetchedAt < KEYS_TTL_MS) {
    return cached.pemByKid;
  }
  const pemByKid = await fetchKeySet(teamDomain, fetchImpl);
  keyCache.set(teamDomain, { pemByKid, fetchedAt: Date.now() });
  return pemByKid;
}

export interface VerifyOptions {
  fetchImpl?: FetchLike;
}

export async function verifyAccessAssertion(
  token: string | undefined,
  config: AccessConfig,
  options: VerifyOptions = {}
): Promise<AccessIdentity> {
  if (!token || !token.trim()) {
    throw new AccessError(401, "لم تصل بطاقة هوية من بوابة الدخول الموحد");
  }
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new AccessError(401, "بطاقة الهوية غير مقروءة");
  }
  if (decoded.header.alg !== "RS256") {
    throw new AccessError(401, "خوارزمية توقيع بطاقة الهوية غير مقبولة");
  }
  const kid = decoded.header.kid;
  if (typeof kid !== "string" || !kid) {
    throw new AccessError(401, "بطاقة الهوية لا تحمل معرّف مفتاح");
  }

  let keys = await loadKeys(config.teamDomain, fetchImpl, false);
  let pem = keys.get(kid);
  if (!pem) {
    // Cloudflare rotates keys; an unknown kid is worth one refetch, not a refusal.
    keys = await loadKeys(config.teamDomain, fetchImpl, true);
    pem = keys.get(kid);
  }
  if (!pem) {
    throw new AccessError(401, "مفتاح توقيع بطاقة الهوية غير معروف");
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, pem, {
      algorithms: ["RS256"],
      issuer: `https://${config.teamDomain}`,
      audience: config.audience,
    }) as jwt.JwtPayload;
  } catch {
    throw new AccessError(401, "بطاقة الهوية مرفوضة: توقيع أو صلاحية أو جمهور غير مطابق");
  }

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) {
    throw new AccessError(401, "بطاقة الهوية لا تحمل بريدًا إلكترونيًا");
  }
  return { email, subject: String(payload.sub || "") };
}