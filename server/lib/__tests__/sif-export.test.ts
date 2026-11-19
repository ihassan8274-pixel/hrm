import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSifExport,
  normalizePeriod,
  normalizeValueDate,
  readSifProfile,
  SifError,
  validateSifIdentities,
} from '../sif-export';

let db: Database.Database;

const VALID_IBAN = 'SA0380000000608010167519';
const VALID_NID = '1012345678';

const setSetting = (key: string, value: string) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

const fullProfile = () => {
  setSetting('cr_number', '1010123456');
  setSetting('sif_settlement_bank_code', 'RJHS0000');
  setSetting('sif_bank_codes', JSON.stringify({ 'مصرف الراجحي': 'RJHS0000' }));
};

const addPayroll = (row: {
  id?: number;
  employee_id: number;
  month?: number;
  year?: number;
  net_salary?: number;
  cash_amount?: number;
  bank_amount?: number | null;
  payment_method?: string;
}) => {
  db.prepare(`
    INSERT INTO payroll (id, employee_id, month, year, basic_salary, housing_allowance, allowances,
                         deductions, net_salary, cash_amount, bank_amount, payment_method)
    VALUES (?, ?, ?, ?, 5000, 1000, 1000, 0, ?, ?, ?, ?)
  `).run(
    row.id ?? null,
    row.employee_id,
    row.month ?? 10,
    row.year ?? 2026,
    row.net_salary ?? 6000,
    row.cash_amount ?? 0,
    row.bank_amount === undefined ? 6000 : row.bank_amount,
    row.payment_method ?? 'bank'
  );
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER, month INTEGER, year INTEGER,
      basic_salary REAL, housing_allowance REAL, allowances REAL,
      deductions REAL, net_salary REAL, cash_amount REAL, bank_amount REAL,
      payment_method TEXT
    );
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY, name TEXT, national_id_iqama TEXT, saudi_iban TEXT,
      bank_name TEXT, entity_id INTEGER, branch_id INTEGER
    );
    INSERT INTO employees VALUES
      (1, 'موظف أول', '${VALID_NID}', '${VALID_IBAN}', 'مصرف الراجحي', 1, 10),
      (2, 'موظف ثانٍ', '${VALID_NID}', '${VALID_IBAN}', 'مصرف الراجحي', 1, 11),
      (3, 'موظف ثالث', '${VALID_NID}', '${VALID_IBAN}', 'بنك غير معرّف', 2, 10);
  `);
  addPayroll({ employee_id: 1 });
  addPayroll({ employee_id: 2 });
});

afterEach(() => db.close());

describe('bank profile reading', () => {
  it('reports every missing field instead of defaulting one', async () => {
    const profile = await readSifProfile(db);
    expect(profile.missing).toEqual(['cr_number', 'sif_settlement_bank_code', 'sif_bank_codes']);
    expect(profile.crNumber).toBe('');
  });

  it('treats an unparsable bank-code map as missing', async () => {
    setSetting('cr_number', '1010123456');
    setSetting('sif_settlement_bank_code', 'RJHS0000');
    setSetting('sif_bank_codes', 'not json');
    expect((await readSifProfile(db)).missing).toEqual(['sif_bank_codes']);
  });
});

describe('period and value date normalization', () => {
  it('rejects a month outside 1-12', () => {
    expect(() => normalizePeriod(13, 2026)).toThrow(SifError);
    expect(() => normalizePeriod(0, 2026)).toThrow(SifError);
  });

  it('requires an explicit value date', () => {
    expect(() => normalizeValueDate(undefined)).toThrow(/تاريخ القيمة/);
    expect(() => normalizeValueDate('')).toThrow(/تاريخ القيمة/);
  });

  it('rejects a value date that is not a real calendar date', () => {
    expect(() => normalizeValueDate('2026-02-31')).toThrow(/تقويمي/);
    expect(() => normalizeValueDate('2026-13-01')).toThrow(/تقويمي/);
  });

  it('accepts a real date and strips the separators', () => {
    expect(normalizeValueDate('2026-10-05')).toBe('20261005');
  });
});

describe('identity validation', () => {
  it('flags a missing or malformed IBAN and national id', () => {
    const issues = validateSifIdentities([
      { employee_id: 1, employee_name: 'أ', saudi_iban: '', national_id_iqama: '' },
      { employee_id: 2, employee_name: 'ب', saudi_iban: 'XX00', national_id_iqama: '123' },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0].invalid_fields.join(' ')).toMatch(/saudi_iban/);
    expect(issues[0].invalid_fields.join(' ')).toMatch(/national_id_iqama/);
  });

  it('accepts a well-formed Saudi identity', () => {
    const issues = validateSifIdentities([
      { employee_id: 1, employee_name: 'أ', saudi_iban: VALID_IBAN, national_id_iqama: VALID_NID },
    ]);
    expect(issues).toEqual([]);
  });
});

describe('bank file generation refusals', () => {
  const refusal = async (options: Parameters<typeof buildSifExport>[1]) =>
    buildSifExport(db, options).then(
      () => {
        throw new Error('expected a refusal');
      },
      (error: unknown) => error as SifError
    );

  it('refuses to build a file while the establishment profile is incomplete', async () => {
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('INCOMPLETE_BANK_PROFILE');
    expect(error.details.missing).toContain('cr_number');
  });

  it('refuses without a value date rather than inventing one', async () => {
    fullProfile();
    const error = await refusal({ month: 10, year: 2026, valueDate: '', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('MISSING_VALUE_DATE');
  });

  it('refuses when there is no payroll run for the period', async () => {
    fullProfile();
    const error = await refusal({ month: 3, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('NO_PAYROLL_RUN');
  });

  it('refuses when the caller scope has no payroll rows', async () => {
    fullProfile();
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: 99, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('NO_PAYROLL_RUN');
  });

  it('refuses when an identity is missing or malformed', async () => {
    fullProfile();
    db.prepare('UPDATE employees SET saudi_iban = NULL WHERE id = 1').run();
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('INVALID_SIF_IDENTITIES');
  });

  it('refuses when a bank has no routing code', async () => {
    fullProfile();
    addPayroll({ employee_id: 3 });
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('MISSING_BANK_CODE');
    expect(error.details.missing_count).toBe(1);
  });

  it('refuses when the file would contain no bank transfer at all', async () => {
    fullProfile();
    db.prepare("UPDATE payroll SET payment_method = 'cash', cash_amount = 6000, bank_amount = 0").run();
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('NO_BANK_ROWS');
  });

  it('refuses a profile field that would break the comma separated layout', async () => {
    setSetting('cr_number', '1010,1234');
    setSetting('sif_settlement_bank_code', 'RJHS0000');
    setSetting('sif_bank_codes', JSON.stringify({ 'مصرف الراجحي': 'RJHS0000' }));
    const error = await refusal({ month: 10, year: 2026, valueDate: '2026-10-05', scope: { entityId: null, branchId: null } });
    expect(error).toBeInstanceOf(SifError);
    expect(error.code).toBe('INVALID_BANK_PROFILE');
  });
});

describe('bank file generation', () => {
  it('writes a header and one record per bank transfer', async () => {
    fullProfile();
    const result = await buildSifExport(db, {
      month: 10, year: 2026, valueDate: '2026-10-05',
      scope: { entityId: null, branchId: null },
    });
    const lines = result.content.split('\r\n');
    expect(lines).toHaveLength(3);
    const header = lines[0].split(',');
    expect(header[0]).toBe('SCR');
    expect(header[1]).toBe('1010123456');
    expect(header[2]).toBe('RJHS0000');
    expect(header[3]).toBe('20261005');
    expect(header[4]).toMatch(/^\d{8}$/);
    expect(header[5]).toBe('12000.00');
    expect(header[6]).toBe('2');
    expect(header[7]).toBe('SAR');
    expect(lines[1]).toBe(`EDR,${VALID_NID},RJHS0000,${VALID_IBAN},6000.00,5000.00,1000.00,0.00,0.00`);
    expect(result.recordCount).toBe(2);
    expect(result.total).toBe(12000);
  });

  it('keeps only the rows inside the caller branch', async () => {
    fullProfile();
    const result = await buildSifExport(db, {
      month: 10, year: 2026, valueDate: '2026-10-05',
      scope: { entityId: 1, branchId: 10 },
    });
    expect(result.recordCount).toBe(1);
    expect(result.included.map((row) => row.employee_id)).toEqual([1]);
  });

  it('keeps only the rows inside the caller entity', async () => {
    fullProfile();
    setSetting('sif_bank_codes', JSON.stringify({ 'مصرف الراجحي': 'RJHS0000', 'بنك غير معرّف': 'XXXX0000' }));
    addPayroll({ employee_id: 3 });
    const result = await buildSifExport(db, {
      month: 10, year: 2026, valueDate: '2026-10-05',
      scope: { entityId: 1, branchId: null },
    });
    expect(result.included.map((row) => row.employee_id)).toEqual([1, 2]);
  });

  it('lists cash-paid employees as excluded instead of inventing a transfer', async () => {
    fullProfile();
    db.prepare("UPDATE payroll SET payment_method = 'cash', cash_amount = 6000, bank_amount = 0 WHERE employee_id = 2").run();
    const result = await buildSifExport(db, {
      month: 10, year: 2026, valueDate: '2026-10-05',
      scope: { entityId: null, branchId: null },
    });
    expect(result.recordCount).toBe(1);
    expect(result.cashExcluded).toEqual([{ employee_id: 2, employee_name: 'موظف ثانٍ', amount: 6000 }]);
  });
});
