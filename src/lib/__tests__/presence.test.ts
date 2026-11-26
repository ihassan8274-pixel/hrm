import { describe, expect, it } from 'vitest';
import {
  isRestrictedPresencePolicy, parseGoogleMapsCoordinates, policyLabel,
  presenceRecheckDelay, rowsOf,
} from '../presence';

describe('presence UI helpers', () => {
  it('reads coordinates from Google Maps links without contacting Google', () => {
    expect(parseGoogleMapsCoordinates('https://www.google.com/maps/place/Masobi/@26.4011609,50.0988522,17z')).toEqual({ latitude: 26.4011609, longitude: 50.0988522 });
    expect(parseGoogleMapsCoordinates('https://maps.google.com/?q=26.3435808,50.0397883')).toEqual({ latitude: 26.3435808, longitude: 50.0397883 });
    expect(parseGoogleMapsCoordinates('https://www.google.com/maps/place/x!3d26.2762147!4d50.1841272!16s')).toEqual({ latitude: 26.2762147, longitude: 50.1841272 });
    expect(parseGoogleMapsCoordinates('26.9573644, 49.6764059')).toEqual({ latitude: 26.9573644, longitude: 49.6764059 });
  });

  it('rejects text that has no usable coordinates', () => {
    expect(parseGoogleMapsCoordinates('https://www.google.com/maps')).toBeNull();
    expect(parseGoogleMapsCoordinates('')).toBeNull();
  });

  it('accepts both wrapped and bare list responses', () => {
    expect(rowsOf({ policies: [{ user_id: 1 }] }, 'policies')).toHaveLength(1);
    expect(rowsOf([{ user_id: 1 }, { user_id: 2 }], 'policies')).toHaveLength(2);
    expect(rowsOf({}, 'policies')).toEqual([]);
  });

  it('labels the fail-open policy clearly', () => {
    expect(policyLabel('branch_bound')).toContain('مقيد');
    expect(policyLabel(undefined)).toBe('مفتوح');
  });

  it('schedules exactly one recheck at permit expiry', () => {
    expect(isRestrictedPresencePolicy('branch_bound')).toBe(true);
    expect(isRestrictedPresencePolicy('branch_scoped')).toBe(true);
    for (const policy of ['open', 'system_admin', 'finance', undefined]) {
      expect(isRestrictedPresencePolicy(policy)).toBe(false);
    }
    const now = Date.parse('2026-11-26T12:00:00Z');
    expect(presenceRecheckDelay('2026-11-26T12:10:00Z', now)).toBe(10 * 60_000);
    expect(presenceRecheckDelay('2026-11-26T11:59:00Z', now)).toBe(0);
    expect(presenceRecheckDelay(null, now)).toBeNull();
    expect(presenceRecheckDelay('invalid', now)).toBeNull();
  });
});
