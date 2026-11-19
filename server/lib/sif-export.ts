
// Bank-file generation for WPS / Mudad salary protection.
//
// Nothing in here may invent an identity: a commercial-registration number, a
// bank routing code or a value date that the operator never configured is a
// lie in a file that leaves the building. Every one of them is either read
// from the settings table or supplied by the caller, and a missing value
// blocks the export instead of being defaulted.

export interface SifScope {
  entityId: number | null;
  branchId: number | null;
}

export class SifError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'SifError';
  }
}

const SAUDI_IBAN_RE = /^SA[0-9A-Z]{22}$/;
const SAUDI_NATIONAL_ID_RE = /^[12][0-9]{9}$/;

// A value that reaches the file must never break the comma separated layout.
const SAFE_FIELD_RE = /^[A-Za-z0-9]+$/;

export interface SifProfile {
  crNumber: string;
  settlementBankCode: string;
  bankCodes: Record<string, string>;
  missing: string[];
}

export interface SifExportOptions {
  month: unknown;
  year: unknown;
  valueDate: unknown;
  scope: SifScope;
}

export interface SifExportResult {
  fileName: string;
  content: string;
  total: number;
  recordCount: number;
  currency: 'SAR';
  generatedAt: string;
  valueDate: string;
  profile: { crNumber: string; settlementBankCode: string };
  included: { employee_id: number; employee_name: string }[];
  cashExcluded: { employee_id: number; employee_name: string; amount: number }[];
}

export async function readSifProfile(db: any): Promise<SifProfile> {
  const rows = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('cr_number','sif_settlement_bank_code','sif_bank_codes')")
    .all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = String(row.value || "").trim();

  const missing: string[] = [];
  if (!map.cr_number) missing.push("cr_number");
  if (!map.sif_settlement_bank_code) missing.push("sif_settlement_bank_code");

  let bankCodes: Record<string, string> = {};
  if (!map.sif_bank_codes) {
    missing.push("sif_bank_codes");
  } else {
    try {
      const parsed = JSON.parse(map.sif_bank_codes);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [name, code] of Object.entries(parsed)) {
          if (typeof code === "string" && code.trim()) bankCodes[name.trim()] = code.trim();
        }
      } else {
        missing.push("sif_bank_codes");
      }
    } catch {
      missing.push("sif_bank_codes");
    }
  }

  return {
    crNumber: map.cr_number || "",
    settlementBankCode: map.sif_settlement_bank_code || "",
    bankCodes,
    missing,
  };
}

export function normalizePeriod(month: unknown, year: unknown): { month: number; year: number } {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new SifError(400, "INVALID_PERIOD", "الشهر يجب أن يكون رقمًا بين 1 و 12");
  }
  if (!Number.isInteger(y) || y < 1900 || y > 9999) {
    throw new SifError(400, "INVALID_PERIOD", "السنة يجب أن تكون رقمًا بين 1900 و 9999");
  }
  return { month: m, year: y };
}

export function normalizeValueDate(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new SifError(
      400,
      "MISSING_VALUE_DATE",
      "حدّد تاريخ القيمة (تاريخ صرف الحوالات) — لا يوجد تاريخ افتراضي"
    );
  }
  const digits = value.replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new SifError(400, "INVALID_VALUE_DATE", "تاريخ القيمة يجب أن يكون بالصيغة YYYY-MM-DD");
  }
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const check = new Date(year, month - 1, day);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    throw new SifError(400, "INVALID_VALUE_DATE", "تاريخ القيمة ليس تاريخًا تقويميًا صحيحًا");
  }
  return digits;
}

function amount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  return amount(value).toFixed(2);
}

export function validateSifIdentities(
  rows: { employee_id: number; employee_name: string; saudi_iban: string; national_id_iqama: string }[]
) {
  const issues: { employee_id: number; employee_name: string; invalid_fields: string[] }[] = [];
  for (const row of rows) {
    const invalid_fields: string[] = [];
    const iban = row.saudi_iban == null ? "" : String(row.saudi_iban).replace(/\s+/g, "").toUpperCase();
    if (!iban) invalid_fields.push("saudi_iban: مفقود");
    else if (!SAUDI_IBAN_RE.test(iban)) invalid_fields.push("saudi_iban: غير صالح (يجب أن يبدأ بـ SA ويتكوّن من 24 حرفًا/رقمًا)");
    const nid = row.national_id_iqama == null ? "" : String(row.national_id_iqama).replace(/\s+/g, "");
    if (!nid) invalid_fields.push("national_id_iqama: مفقود");
    else if (!SAUDI_NATIONAL_ID_RE.test(nid)) invalid_fields.push("national_id_iqama: غير صالح (يجب 10 أرقام تبدأ بـ 1 أو 2)");
    if (invalid_fields.length) {
      issues.push({ employee_id: row.employee_id, employee_name: row.employee_name, invalid_fields });
    }
  }
  return issues;
}

/**
 * Builds the payroll bank file from a saved payroll run.
 *
 * Amounts come from the payroll row (the period that was actually approved);
 * identity and routing come from the current employee record, because an IBAN
 * has to be valid on the transfer date, not on the payroll date.
 */
export async function buildSifExport(db: any, options: SifExportOptions): Promise<SifExportResult> {
  const { month, year } = normalizePeriod(options.month, options.year);
  const valueDate = normalizeValueDate(options.valueDate);
  const profile = await readSifProfile(db);

  if (profile.missing.length) {
    throw new SifError(
      400,
      "INCOMPLETE_BANK_PROFILE",
      "بيانات المنشأة/البنك غير مكتملة — أكملها من الإعدادات قبل تصدير ملف البنك",
      { missing: profile.missing }
    );
  }
  if (!SAFE_FIELD_RE.test(profile.crNumber) || !SAFE_FIELD_RE.test(profile.settlementBankCode)) {
    throw new SifError(
      400,
      "INVALID_BANK_PROFILE",
      "رقم السجل التجاري أو كود البنك يحتوي على رموز غير مسموحة في ملف البنك"
    );
  }

  const rows = await db
    .prepare(
      `SELECT p.*, e.name as employee_name, e.national_id_iqama, e.saudi_iban, e.bank_name,
              e.entity_id, e.branch_id
       FROM payroll p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.month = ? AND p.year = ?`
    )
    .all(month, year) as any[];

  if (!rows.length) {
    throw new SifError(400, "NO_PAYROLL_RUN", "لا يوجد مسير رواتب مسجل لهذا الشهر — أنشئ المسير أولاً");
  }

  const scoped = rows.filter((row) => {
    if (options.scope.entityId != null && row.entity_id !== options.scope.entityId) return false;
    if (options.scope.branchId != null && row.branch_id !== options.scope.branchId) return false;
    return true;
  });

  if (!scoped.length) {
    throw new SifError(400, "NO_PAYROLL_RUN", "لا يوجد مسير رواتب مسجل لهذا الشهر ضمن نطاقك");
  }

  const identityIssues = validateSifIdentities(
    scoped.map((row) => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      saudi_iban: row.saudi_iban,
      national_id_iqama: row.national_id_iqama,
    }))
  );
  if (identityIssues.length) {
    throw new SifError(
      400,
      "INVALID_SIF_IDENTITIES",
      "تعذّر توليد ملف البنك: توجد بيانات هوية أو IBAN ناقصة أو غير صالحة. صحّحها ثم أعد المحاولة.",
      { invalid_count: identityIssues.length, issues: identityIssues }
    );
  }

  const missingBankCodes: { employee_id: number; employee_name: string; bank_name: string }[] = [];
  const bankCodeOf = (row: any) => {
    const bankName = String(row.bank_name || "").trim();
    const code = profile.bankCodes[bankName];
    if (!code) {
      missingBankCodes.push({ employee_id: row.employee_id, employee_name: row.employee_name, bank_name: bankName || "(غير محدد)" });
      return "";
    }
    return code;
  };

  const records: { employee_id: number; employee_name: string; line: string; net: number }[] = [];
  const cashExcluded: { employee_id: number; employee_name: string; amount: number }[] = [];

  for (const row of scoped) {
    const code = bankCodeOf(row);
    if (!code) continue;
    if (!SAFE_FIELD_RE.test(code)) {
      throw new SifError(
        400,
        "INVALID_BANK_PROFILE",
        "كود البنك يحتوي على رموز غير مسموحة — استخدم أرقامًا أو حروفًا لاتينية فقط"
      );
    }
    const cashAmount = amount(row.cash_amount);
    const bankAmount = row.payment_method === "cash" ? 0 : amount(row.bank_amount == null ? row.net_salary : row.bank_amount);
    if (bankAmount <= 0) {
      cashExcluded.push({ employee_id: row.employee_id, employee_name: row.employee_name, amount: cashAmount });
      continue;
    }
    const nationalId = String(row.national_id_iqama || "").replace(/\s+/g, "");
    const iban = String(row.saudi_iban || "").replace(/\s+/g, "").toUpperCase();
    const basic = amount(row.basic_salary);
    const housing = amount(row.housing_allowance);
    const allowances = amount(row.allowances);
    const other = allowances - housing;
    const deductions = amount(row.deductions);
    records.push({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      net: bankAmount,
      line: `EDR,${nationalId},${code},${iban},${money(bankAmount)},${money(basic)},${money(housing)},${money(other)},${money(deductions)}`,
    });
  }

  if (missingBankCodes.length) {
    throw new SifError(
      400,
      "MISSING_BANK_CODE",
      "تعذّر توليد ملف البنك: كود بعض البنوك غير معرّف في الإعدادات (sif_bank_codes)",
      { missing_count: missingBankCodes.length, missing: missingBankCodes }
    );
  }

  if (!records.length) {
    throw new SifError(400, "NO_BANK_ROWS", "لا توجد حوالات بنكية في هذا المسير — كلها مدفوعة نقدًا");
  }

  const total = records.reduce((sum, record) => sum + record.net, 0);
  const createdAt = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const header = `SCR,${profile.crNumber},${profile.settlementBankCode},${valueDate},${createdAt},${total.toFixed(2)},${records.length},SAR`;
  const content = [header, ...records.map((record) => record.line)].join("\r\n");
  const stamp = `${year}${String(month).padStart(2, "0")}`;

  return {
    fileName: `SIF_${profile.crNumber}_${stamp}.sif`,
    content,
    total: Math.round(total * 100) / 100,
    recordCount: records.length,
    currency: "SAR",
    generatedAt: new Date().toISOString(),
    valueDate,
    profile: { crNumber: profile.crNumber, settlementBankCode: profile.settlementBankCode },
    included: records.map((record) => ({ employee_id: record.employee_id, employee_name: record.employee_name })),
    cashExcluded,
  };
}
