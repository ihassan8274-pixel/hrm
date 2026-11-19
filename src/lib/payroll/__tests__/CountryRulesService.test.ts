import { describe, it, expect, beforeEach } from 'vitest';
import { CountryRulesService } from '../CountryRulesService';

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

function makeMockDataSource(opts: {
  country?: Record<string, unknown> | null;
  rulesRows?: { rule_key: string; rule_value: string }[];
}) {
  return {
    getCountry: async () => opts.country ?? undefined,
    getRules: async () => opts.rulesRows ?? [],
    getEntityCountry: async () => undefined,
  };
}

describe('CountryRulesService', () => {
  beforeEach(() => CountryRulesService.clearCache());

  it('uses country rule rows for rates and leave settings', async () => {
    const source = makeMockDataSource({
      country: saCountryRow,
      rulesRows: [
        { rule_key: 'insurance_emp_rate', rule_value: '9.75' },
        { rule_key: 'insurance_comp_rate', rule_value: '11.75' },
      ],
    });
    CountryRulesService.setDataSource(source);
    const rules = await CountryRulesService.getRules('SA');
    expect(rules.code).toBe('SA');
    expect(rules.insurance.employeeRate).toBe(9.75);
    expect(rules.insurance.employerRate).toBe(11.75);
    expect(rules.insurance.ceiling).toBe(45000);
    expect(rules.insurance.floor).toBe(2000);
    expect(rules.tax.type).toBe('none');
  });

  it('uses modern rule_key/rule_value rows when schema supports it', async () => {
    const source = makeMockDataSource({
      country: saCountryRow,
      rulesRows: [
        { rule_key: 'insurance_emp_rate', rule_value: '10.5' },
        { rule_key: 'insurance_comp_rate', rule_value: '12.0' },
        { rule_key: 'annual_leave_days', rule_value: '30' },
      ],
    });
    CountryRulesService.setDataSource(source);
    const rules = await CountryRulesService.getRules('SA');
    expect(rules.insurance.employeeRate).toBe(10.5);
    expect(rules.insurance.employerRate).toBe(12.0);
    expect(rules.leaves.annualDays).toBe(30);
  });

  it('throws when country is not found', async () => {
    CountryRulesService.setDataSource(makeMockDataSource({ country: null }));
    await expect(CountryRulesService.getRules('XX')).rejects.toThrow('Country not found: XX');
  });

  it('caches results and clearCache resets', async () => {
    const source = makeMockDataSource({
      country: saCountryRow,
    });
    CountryRulesService.setDataSource(source);
    const first = await CountryRulesService.getRules('SA');
    const second = await CountryRulesService.getRules('SA');
    expect(first).toBe(second); // same cached object reference
    CountryRulesService.clearCache();
    const third = await CountryRulesService.getRules('SA');
    expect(third).not.toBe(first); // fresh fetch after cache clear
  });
});
