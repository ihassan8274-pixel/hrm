import { describe, it, expect, beforeEach } from 'vitest';
import { CountryRulesService } from '../CountryRulesService';

const saLegacyRow = {
  country_code: 'SA',
  insurance_emp_rate: 9.75,
  insurance_comp_rate: 11.75,
  tax_type: 'none',
  eosb_months_per_year: 0.5,
  annual_leave_days: 21,
  working_hours: 8,
};

const saCountryRow = {
  code: 'SA',
  name_ar: 'السعودية',
  name_en: 'Saudi Arabia',
  currency: 'SAR',
  currency_symbol_ar: 'ر.س',
  currency_symbol_en: 'SAR',
  insurance_emp_rate: 0,
  insurance_comp_rate: 0,
  insurance_ceiling: 45000,
  insurance_floor: 2000,
  tax_type: 'none',
  eos_type: 'half_month_per_year',
  eos_months_per_year: 0.5,
  eos_max_years: null,
  annual_leave_days: 21,
  sick_leave_days: 0,
  maternity_leave_days: 0,
  paternity_leave_days: 0,
  working_hours_per_day: 8,
  working_days_per_week: 6,
  weekend_days_json: '[5,6]',
  wps_format: 'sama',
};

function makeMockDb(opts: {
  country?: Record<string, unknown> | null;
  legacyRow?: Record<string, unknown>;
  rulesRows?: { rule_key: string; rule_value: string }[];
  schemaCols?: { name: string }[];
}) {
  return {
    prepare(sql: string) {
      const lower = sql.toLowerCase();
      if (lower.includes('pragma table_info')) {
        return { all: () => opts.schemaCols ?? [] };
      }
      if (lower.includes('from countries')) {
        return { get: () => opts.country ?? undefined };
      }
      if (lower.includes('from tax_brackets')) {
        return { all: () => [] };
      }
      if (lower.includes('from country_rules')) {
        return {
          all: () => opts.rulesRows ?? [],
          get: () => opts.legacyRow ?? undefined,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

describe('CountryRulesService', () => {
  beforeEach(() => CountryRulesService.clearCache());

  it('returns correct rates from legacy flat row (no is_active column)', async () => {
    const db = makeMockDb({
      country: saCountryRow,
      legacyRow: saLegacyRow,
      schemaCols: [{ name: 'id' }, { name: 'country_code' }, { name: 'insurance_emp_rate' }],
    });
    CountryRulesService.setDatabase(db);
    const rules = await CountryRulesService.getRules('SA');
    expect(rules.code).toBe('SA');
    expect(rules.insurance.employeeRate).toBe(9.75);
    expect(rules.insurance.employerRate).toBe(11.75);
    expect(rules.insurance.ceiling).toBe(45000);
    expect(rules.insurance.floor).toBe(2000);
    expect(rules.tax.type).toBe('none');
  });

  it('uses modern rule_key/rule_value rows when schema supports it', async () => {
    const db = makeMockDb({
      country: saCountryRow,
      rulesRows: [
        { rule_key: 'insurance_emp_rate', rule_value: '10.5' },
        { rule_key: 'insurance_comp_rate', rule_value: '12.0' },
        { rule_key: 'annual_leave_days', rule_value: '30' },
      ],
      schemaCols: [{ name: 'rule_key' }, { name: 'rule_value' }, { name: 'is_active' }],
    });
    CountryRulesService.setDatabase(db);
    const rules = await CountryRulesService.getRules('SA');
    expect(rules.insurance.employeeRate).toBe(10.5);
    expect(rules.insurance.employerRate).toBe(12.0);
    expect(rules.leaves.annualDays).toBe(30);
  });

  it('throws when country is not found', async () => {
    const db = makeMockDb({ country: null });
    CountryRulesService.setDatabase(db);
    await expect(CountryRulesService.getRules('XX')).rejects.toThrow('Country not found: XX');
  });

  it('caches results and clearCache resets', async () => {
    const db = makeMockDb({
      country: saCountryRow,
      legacyRow: saLegacyRow,
      schemaCols: [{ name: 'id' }],
    });
    CountryRulesService.setDatabase(db);
    const first = await CountryRulesService.getRules('SA');
    const second = await CountryRulesService.getRules('SA');
    expect(first).toBe(second); // same cached object reference
    CountryRulesService.clearCache();
    const third = await CountryRulesService.getRules('SA');
    expect(third).not.toBe(first); // fresh fetch after cache clear
  });
});
