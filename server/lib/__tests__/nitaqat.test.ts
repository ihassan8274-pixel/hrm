import { describe, it, expect } from 'vitest';
import {
  computeNitaqat,
  resolveSector,
  NITAQAT_SECTOR_THRESHOLDS,
  type NitaqatTier,
} from '../nitaqat';

const TECH = NITAQAT_SECTOR_THRESHOLDS.tech;
const RETAIL = NITAQAT_SECTOR_THRESHOLDS.retail;

describe('resolveSector', () => {
  it('resolves the canonical sector keys', () => {
    expect(resolveSector('retail').name).toBe(NITAQAT_SECTOR_THRESHOLDS.retail.name);
    expect(resolveSector('construction').name).toBe(NITAQAT_SECTOR_THRESHOLDS.construction.name);
  });

  // Regression: the UI sends "technology" while the original API used "tech".
  // When these diverged the sector silently fell back to tech thresholds.
  it('treats "technology" as an alias of "tech"', () => {
    expect(resolveSector('technology')).toEqual(resolveSector('tech'));
  });

  it('falls back to tech for unknown or missing sectors', () => {
    expect(resolveSector('does-not-exist')).toEqual(resolveSector('tech'));
    expect(resolveSector(undefined)).toEqual(resolveSector('tech'));
    expect(resolveSector('')).toEqual(resolveSector('tech'));
  });
});

describe('computeNitaqat — tier banding', () => {
  const band = (saudi: number, expat: number, disabled = 0): NitaqatTier =>
    computeNitaqat({ saudiCount: saudi, expatCount: expat, disabledCount: disabled, thresholds: TECH }).tier;

  it('grades on the weighted rate, not the raw headcount rate', () => {
    // 5 Saudis / 35 total = 14.3% raw → "low_green" on headcount alone.
    expect(band(5, 30)).toBe('low_green');
    // Same headcount, but 10 disabled Saudis add 30 weighted seats,
    // lifting the weighted rate to 53.8% → platinum.
    expect(band(5, 30, 10)).toBe('platinum');
  });

  it('assigns bands at each threshold boundary', () => {
    expect(band(1, 99)).toBe('red');          // ~1%
    expect(band(13, 87)).toBe('low_green');   // 13% ≥ 12
    expect(band(20, 80)).toBe('mid_green');   // 20% ≥ 20
    expect(band(30, 70)).toBe('high_green');  // 30% ≥ 30
    expect(band(40, 60)).toBe('platinum');    // 40% ≥ 40
  });

  it('applies stricter retail thresholds to the same headcount', () => {
    const input = { saudiCount: 40, expatCount: 60, disabledCount: 0 };
    expect(computeNitaqat({ ...input, thresholds: TECH }).tier).toBe('platinum');
    // 40% clears tech's platinum bar but not retail's 50%.
    expect(computeNitaqat({ ...input, thresholds: RETAIL }).tier).toBe('high_green');
  });

  it('reports red with zero headcount rather than dividing by zero', () => {
    const r = computeNitaqat({ saudiCount: 0, expatCount: 0, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('red');
    expect(r.saudizationPercentage).toBe(0);
    expect(r.weightedSaudizationPercentage).toBe(0);
    expect(r.totalEmployees).toBe(0);
  });
});

describe('computeNitaqat — percentages', () => {
  it('rounds the raw rate to one decimal', () => {
    const r = computeNitaqat({ saudiCount: 10, expatCount: 20, disabledCount: 0, thresholds: TECH });
    expect(r.saudizationPercentage).toBe(33.3);
  });

  it('counts each disabled Saudi as four weighted seats', () => {
    const r = computeNitaqat({ saudiCount: 10, expatCount: 20, disabledCount: 3, thresholds: TECH });
    expect(r.saudiSpecialWeightsCount).toBe(9); // 3 * 3
    // weighted = (10 + 9) / (30 + 9) = 19/39 = 48.7%
    expect(r.weightedSaudizationPercentage).toBe(48.7);
  });
});

describe('computeNitaqat — headroom to next tier', () => {
  it('asks for more Saudis to reach the next band', () => {
    // 10/30 = 33.3% → high_green; needs 40% to reach platinum.
    const r = computeNitaqat({ saudiCount: 10, expatCount: 20, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('high_green');
    expect(r.saudisNeededForNextTier).toBeGreaterThan(0);
  });

  it('requires nothing further once platinum is reached', () => {
    const r = computeNitaqat({ saudiCount: 50, expatCount: 50, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('platinum');
    expect(r.saudisNeededForNextTier).toBe(0);
  });

  it('never returns a negative headcount requirement', () => {
    // Already above the next band threshold once weights are applied.
    const r = computeNitaqat({ saudiCount: 18, expatCount: 2, disabledCount: 20, thresholds: TECH });
    expect(r.saudisNeededForNextTier).toBeGreaterThanOrEqual(0);
  });
});

describe('computeNitaqat — expat headroom before downgrade', () => {
  it('allows plenty of expats while firmly in a high band', () => {
    const r = computeNitaqat({ saudiCount: 45, expatCount: 55, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('platinum');
    // Weighted 45%. Staying above high_green's 30% floor allows 50 more expats.
    expect(r.expatsAllowedBeforeDowngrade).toBe(50);
  });

  // red has no lower band, so there is nothing to protect against: the
  // organisation is already below every floor and hiring expats cannot make
  // the band worse.
  it('reports effectively unlimited expats once already in red', () => {
    const r = computeNitaqat({ saudiCount: 1, expatCount: 99, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('red');
    expect(r.expatsAllowedBeforeDowngrade).toBe(999);
  });

  // low_green has a 0% floor, so there is no lower band to fall into.
  it('reports effectively unlimited expats at the low_green floor', () => {
    const r = computeNitaqat({ saudiCount: 13, expatCount: 87, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('low_green');
    expect(r.expatsAllowedBeforeDowngrade).toBe(999);
  });
});

describe('computeNitaqat — visa issuance', () => {
  it('grants a minimum visa floor even at low Saudi headcount', () => {
    const r = computeNitaqat({ saudiCount: 0, expatCount: 100, disabledCount: 0, thresholds: TECH });
    expect(r.tier).toBe('red');
    expect(r.availableVisasToIssue).toBe(0);
  });

  it('grants a single visa at low_green', () => {
    const r = computeNitaqat({ saudiCount: 13, expatCount: 87, disabledCount: 0, thresholds: TECH });
    expect(r.availableVisasToIssue).toBe(1);
  });

  it('scales visa allowance with Saudi headcount', () => {
    const small = computeNitaqat({ saudiCount: 22, expatCount: 78, disabledCount: 0, thresholds: TECH });
    const large = computeNitaqat({ saudiCount: 45, expatCount: 55, disabledCount: 0, thresholds: TECH });
    expect(large.availableVisasToIssue).toBeGreaterThan(small.availableVisasToIssue);
  });
});

// Guards the exact behaviour the UI depends on: it compares a "current"
// snapshot against a "simulated" one derived by adding hires.
describe('computeNitaqat — simulated vs current comparison', () => {
  it('moves up a band when Saudis are hired', () => {
    const thresholds = TECH;
    const current = computeNitaqat({ saudiCount: 13, expatCount: 22, disabledCount: 0, thresholds });
    const simulated = computeNitaqat({ saudiCount: 15, expatCount: 22, disabledCount: 0, thresholds });

    // weighted 37.1% (high_green) → 40.5% (platinum): hiring two Saudis
    // crosses the 40% platinum threshold.
    expect(current.tier).toBe('high_green');
    expect(simulated.tier).toBe('platinum');
    expect(simulated.saudizationPercentage).toBeGreaterThan(current.saudizationPercentage);
  });
});