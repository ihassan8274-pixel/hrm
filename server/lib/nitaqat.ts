// Pure Nitaqat (نطاقات) band calculator.
//
// Extracted from server/routes/saudi.ts so the compliance thresholds can be
// unit tested without booting Express or touching the database. Kept free of
// any I/O deliberately — this is the piece a Saudi HR auditor would challenge,
// so it needs to be provable in isolation.

export type NitaqatTier = 'platinum' | 'high_green' | 'mid_green' | 'low_green' | 'red';

export interface NitaqatThresholds {
  platinum: number;
  high_green: number;
  mid_green: number;
  low_green: number;
}

/** Weighted rate contributed by one disabled Saudi under the Mo(w)aamah programme. */
const DISABLED_SAUDI_WEIGHT = 3; // contributes 4x in total (1 + 3)

export const NITAQAT_SECTOR_THRESHOLDS: Record<
  string,
  NitaqatThresholds & { name: string }
> = {
  tech: { platinum: 40, high_green: 30, mid_green: 20, low_green: 12, name: 'تقنية المعلومات والاتصالات' },
  // The UI sends "technology"; the original API used "tech". Both are accepted.
  technology: { platinum: 40, high_green: 30, mid_green: 20, low_green: 12, name: 'تقنية المعلومات والاتصالات' },
  retail: { platinum: 50, high_green: 38, mid_green: 26, low_green: 15, name: 'تجارة التجزئة والجملة' },
  construction: { platinum: 25, high_green: 18, mid_green: 12, low_green: 6, name: 'المقاولات والتشييد' },
  services: { platinum: 35, high_green: 26, mid_green: 18, low_green: 10, name: 'الخدمات العامة والاستشارات' },
};

/** Unknown sectors fall back to tech rather than throwing. */
export function resolveSector(sector?: string): NitaqatThresholds & { name: string } {
  return NITAQAT_SECTOR_THRESHOLDS[sector || ''] || NITAQAT_SECTOR_THRESHOLDS.tech;
}

export interface NitaqatScenario {
  saudiCount: number;
  expatCount: number;
  totalEmployees: number;
  /** Weighted contribution of disabled Saudis (disabledCount * 3). */
  saudiSpecialWeightsCount: number;
  /** Plain headcount percentage, rounded to 1 decimal. */
  saudizationPercentage: number;
  /** The weighted rate Nitaqat actually grades against. */
  weightedSaudizationPercentage: number;
  tier: NitaqatTier;
  saudisNeededForNextTier: number;
  expatsAllowedBeforeDowngrade: number;
  availableVisasToIssue: number;
}

export interface NitaqatInput {
  saudiCount: number;
  expatCount: number;
  disabledCount: number;
  thresholds: NitaqatThresholds;
}

/**
 * Computes the full Nitaqat picture for one headcount scenario.
 *
 * Disabled Saudis count 4x toward the weighted rate, which is the figure
 * Nitaqat measures. The tier is decided on the *weighted* rate, while the
 * plain headcount percentage is reported alongside for display.
 */
export function computeNitaqat(input: NitaqatInput): NitaqatScenario {
  const { saudiCount, expatCount, disabledCount, thresholds } = input;
  const weightedSaudis = saudiCount + disabledCount * DISABLED_SAUDI_WEIGHT;
  const totalEmployees = saudiCount + expatCount;

  const saudizationPercentage =
    totalEmployees > 0 ? Math.round((saudiCount / totalEmployees) * 1000) / 10 : 0;
  const weightedSaudizationPercentage =
    totalEmployees > 0
      ? Math.round((weightedSaudis / (totalEmployees + disabledCount * DISABLED_SAUDI_WEIGHT)) * 1000) / 10
      : 0;

  let tier: NitaqatTier = 'red';
  let availableVisasToIssue = 0;
  if (weightedSaudizationPercentage >= thresholds.platinum) {
    tier = 'platinum';
    availableVisasToIssue = Math.max(15, Math.floor(saudiCount * 2.5));
  } else if (weightedSaudizationPercentage >= thresholds.high_green) {
    tier = 'high_green';
    availableVisasToIssue = Math.max(8, Math.floor(saudiCount * 1.5));
  } else if (weightedSaudizationPercentage >= thresholds.mid_green) {
    tier = 'mid_green';
    availableVisasToIssue = Math.max(3, Math.floor(saudiCount * 0.8));
  } else if (weightedSaudizationPercentage >= thresholds.low_green) {
    tier = 'low_green';
    availableVisasToIssue = 1;
  }

  // Saudis required to reach the band one step up. Platinum has no next band.
  const NEXT_TIER_TARGET: Record<NitaqatTier, keyof NitaqatThresholds | null> = {
    red: 'low_green',
    low_green: 'mid_green',
    mid_green: 'high_green',
    high_green: 'platinum',
    platinum: null,
  };
  const nextTarget = NEXT_TIER_TARGET[tier];
  let saudisNeededForNextTier = 0;
  if (nextTarget) {
    const targetPct = thresholds[nextTarget];
    const needed = (targetPct * totalEmployees - 100 * weightedSaudis) / (100 - targetPct);
    saudisNeededForNextTier = Math.max(0, Math.ceil(needed));
  }

  // Expat headroom before dropping one band. A band with a 0% floor allows
  // effectively unlimited expats.
  const LOWER_TIER_TARGET: Record<NitaqatTier, keyof NitaqatThresholds | null> = {
    red: null,
    low_green: null,
    mid_green: 'low_green',
    high_green: 'mid_green',
    platinum: 'high_green',
  };
  const lowerTarget = LOWER_TIER_TARGET[tier];
  let expatsAllowedBeforeDowngrade: number;
  if (!lowerTarget) {
    expatsAllowedBeforeDowngrade = 999;
  } else {
    const lowerPct = thresholds[lowerTarget];
    expatsAllowedBeforeDowngrade = Math.max(
      0,
      Math.floor((100 * weightedSaudis - lowerPct * totalEmployees) / lowerPct),
    );
  }

  return {
    saudiCount,
    expatCount,
    totalEmployees,
    saudiSpecialWeightsCount: disabledCount * DISABLED_SAUDI_WEIGHT,
    saudizationPercentage,
    weightedSaudizationPercentage,
    tier,
    saudisNeededForNextTier,
    expatsAllowedBeforeDowngrade,
    availableVisasToIssue,
  };
}