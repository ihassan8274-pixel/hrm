/**
 * The renewal kinds the quick-renew endpoint understands.
 *
 * The handler used to branch on the raw `type` value, so any value outside
 * this list skipped both branches and the endpoint still answered
 * `{ success: true }` — the client believed the renewal had happened while
 * neither `employees` nor `government_renewals` had changed. The check lives
 * here so it can be unit-tested without a database.
 */
export const RENEWAL_TYPES = ["iqama", "both", "medical_insurance"] as const;

export type RenewalType = (typeof RENEWAL_TYPES)[number];

export function isRenewalType(value: unknown): value is RenewalType {
  return typeof value === "string" && (RENEWAL_TYPES as readonly string[]).includes(value);
}
