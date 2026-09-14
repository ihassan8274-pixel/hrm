import { CountryConfig, InsuranceRules, TaxBracket, EOSRules, LeaveRules, WorkTimeRules, WPSRules } from './payroll-types';

export class CountryRulesService {
  private static cache: Map<string, CountryConfig> = new Map();
  private static db: any = null;

  static setDatabase(db: any) {
    this.db = db;
    this.cache.clear();
  }

  static async getRules(countryCode: string): Promise<CountryConfig> {
    if (this.cache.has(countryCode)) {
      return this.cache.get(countryCode)!;
    }

    if (!this.db) {
      throw new Error('Database not initialized in CountryRulesService');
    }

    const country = this.db.prepare('SELECT * FROM countries WHERE code = ? AND is_active = 1').get(countryCode);
    if (!country) {
      throw new Error(`Country not found: ${countryCode}`);
    }

    const config = this.buildConfigFromDb(country);
    this.cache.set(countryCode, config);
    return config;
  }

  private static buildConfigFromDb(country: any): CountryConfig {
    const cols = (this.db.prepare('PRAGMA table_info(country_rules)').all() as { name: string }[]).map((c) => c.name);
    const hasRuleKeyValue = cols.includes('rule_key') && cols.includes('rule_value');
    const hasIsActive = cols.includes('is_active');

    // Modern schema: rows of rule_key/rule_value (optionally filtered by is_active when the column exists)
    if (hasRuleKeyValue) {
      const sql = `SELECT * FROM country_rules WHERE country_code = ?${hasIsActive ? ' AND is_active = 1' : ''}`;
      const customRules = this.db.prepare(sql).all(countryCode);
      return this.buildConfig(country, customRules as any[]);
    }

    // Legacy schema: single row of flat country fields (no rule_key/rule_value, and no is_active column)
    const legacy = this.db.prepare('SELECT * FROM country_rules WHERE country_code = ?').get(countryCode);
    const legacyRules: { rule_key: string; rule_value: string }[] = [];
    if (legacy) {
      const flat: Record<string, unknown> = {
        insurance_emp_rate: legacy.insurance_emp_rate,
        insurance_comp_rate: legacy.insurance_comp_rate,
        tax_type: legacy.tax_type,
        eos_months_per_year: legacy.eosb_months_per_year,
        annual_leave_days: legacy.annual_leave_days,
        working_hours_per_day: legacy.working_hours,
      };
      for (const [k, v] of Object.entries(flat)) {
        if (v !== null && v !== undefined && v !== '') legacyRules.push({ rule_key: k, rule_value: String(v) });
      }
      if (legacy.tax_type === 'progressive') {
        const legacyBrackets = this.db.prepare(
          'SELECT lower_bound AS min, upper_bound AS max, rate FROM tax_brackets WHERE country_code = ? ORDER BY lower_bound'
        ).all(countryCode) as { min: number; max: number | null; rate: number }[];
        if (legacyBrackets.length) {
          legacyRules.push({ rule_key: 'tax_brackets_json', rule_value: JSON.stringify(legacyBrackets) });
        }
      }
    }
    return this.buildConfig(country, legacyRules);
  }

  private static buildConfig(country: any, customRules: any[]): CountryConfig {
    const rulesMap = new Map(customRules.map(r => [r.rule_key, r.rule_value]));

    return {
      code: country.code,
      name_ar: country.name_ar,
      name_en: country.name_en,
      currency: country.currency,
      currency_symbol_ar: country.currency_symbol_ar,
      currency_symbol_en: country.currency_symbol_en,
      insurance: {
        employeeRate: parseFloat(rulesMap.get('insurance_emp_rate') || country.insurance_emp_rate),
        employerRate: parseFloat(rulesMap.get('insurance_comp_rate') || country.insurance_comp_rate),
        ceiling: country.insurance_ceiling ? parseFloat(rulesMap.get('insurance_ceiling') || country.insurance_ceiling) : undefined,
        floor: country.insurance_floor ? parseFloat(rulesMap.get('insurance_floor') || country.insurance_floor) : undefined,
        ceilingAppliedOn: (rulesMap.get('insurance_ceiling_on') as 'gross' | 'basic_plus_housing') || 'basic_plus_housing'
      },
      tax: this.parseTax(country, rulesMap),
      eos: {
        type: (rulesMap.get('eos_type') as EOSRules['type']) || country.eos_type,
        monthsPerYear: parseFloat(rulesMap.get('eos_months_per_year') || country.eos_months_per_year),
        maxYears: country.eos_max_years ? parseInt(rulesMap.get('eos_max_years') || country.eos_max_years) : undefined,
        basis: (rulesMap.get('eos_basis') as EOSRules['basis']) || 'last_basic'
      },
      leaves: {
        annualDays: parseInt(rulesMap.get('annual_leave_days') || country.annual_leave_days),
        sickDays: parseInt(rulesMap.get('sick_leave_days') || country.sick_leave_days),
        maternityDays: parseInt(rulesMap.get('maternity_leave_days') || country.maternity_leave_days),
        paternityDays: parseInt(rulesMap.get('paternity_leave_days') || country.paternity_leave_days),
        carryForwardMax: parseInt(rulesMap.get('carry_forward_max') || '0')
      },
      workTime: {
        hoursPerDay: parseFloat(rulesMap.get('working_hours_per_day') || country.working_hours_per_day),
        daysPerWeek: parseInt(rulesMap.get('working_days_per_week') || country.working_days_per_week),
        weekendDays: JSON.parse(rulesMap.get('weekend_days_json') || country.weekend_days_json),
        overtimeRate: parseFloat(rulesMap.get('overtime_rate') || '1.5'),
        ramadanHoursPerDay: parseFloat(rulesMap.get('ramadan_hours_per_day') || '6')
      },
      wps: {
        format: (rulesMap.get('wps_format') as WPSRules['format']) || country.wps_format,
        bankCodeLength: parseInt(rulesMap.get('wps_bank_code_length') || '3'),
        routingCodeLength: parseInt(rulesMap.get('wps_routing_code_length') || '9')
      }
    };
  }

  private static parseTax(country: any, rulesMap: Map<string, string>): { type: 'none' | 'progressive' | 'flat'; brackets?: TaxBracket[]; flatRate?: number } {
    const taxType = rulesMap.get('tax_type') || country.tax_type || 'none';
    
    if (taxType === 'flat') {
      return { type: 'flat', flatRate: parseFloat(rulesMap.get('tax_flat_rate') || '0') };
    }
    
    if (taxType === 'progressive') {
      const bracketsJson = rulesMap.get('tax_brackets_json');
      if (bracketsJson) {
        try {
          return { type: 'progressive', brackets: JSON.parse(bracketsJson) };
        } catch {
          // fall through to defaults
        }
      }
      // Default progressive brackets per country
      return { type: 'progressive', brackets: this.getDefaultTaxBrackets(country.code) };
    }
    
    return { type: 'none' };
  }

  private static getDefaultTaxBrackets(countryCode: string): TaxBracket[] {
    const defaults: Record<string, TaxBracket[]> = {
      'EG': [
        { min: 0, max: 15000, rate: 0 },
        { min: 15000, max: 30000, rate: 0.025 },
        { min: 30000, max: 45000, rate: 0.10 },
        { min: 45000, max: 60000, rate: 0.15 },
        { min: 60000, max: 200000, rate: 0.20 },
        { min: 200000, max: 400000, rate: 0.225 },
        { min: 400000, max: null, rate: 0.25 }
      ],
      'JO': [
        { min: 0, max: 5000, rate: 0.05 },
        { min: 5000, max: 10000, rate: 0.10 },
        { min: 10000, max: 15000, rate: 0.15 },
        { min: 15000, max: 20000, rate: 0.20 },
        { min: 20000, max: null, rate: 0.25 }
      ]
    };
    return defaults[countryCode] || [];
  }

  static async getEntityRules(entityId: number): Promise<CountryConfig> {
    if (!this.db) throw new Error('Database not initialized');
    const entity = this.db.prepare('SELECT country_code FROM entities WHERE id = ?').get(entityId);
    if (!entity) throw new Error(`Entity not found: ${entityId}`);
    return this.getRules(entity.country_code);
  }

  static clearCache() {
    this.cache.clear();
  }
}

export const countryRulesService = CountryRulesService;