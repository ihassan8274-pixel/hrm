import db, { logAction } from "../config/postgres";
import { resolveWriteScope } from "../lib/organization-scope";
import express from "express";
import * as XLSX from "xlsx";
import { syncEmployeeSnapshot } from "./healthCertificates";
import { log } from "../lib/logger";

// ---------------------------------------------------------------------------
// Unified Excel/CSV importer for the dormant HR modules.
// Flow: preview (parse + validate + map, nothing written) -> commit (tx insert).
// ---------------------------------------------------------------------------

const MAX_ROWS = 2000;

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] ?? d);
}

function normalizeText(s: string): string {
  return normalizeDigits(String(s ?? ""))
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "") // tashkeel + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const cleaned = normalizeDigits(String(v))
    .replace(/[٫]/g, ".")
    .replace(/[,\s]|ر\.?س\.?|ج\.?م\.?|SAR|EGP/gi, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

function excelSerialToDate(serial: number): Date | null {
  if (!isFinite(serial) || serial < 1 || serial > 60000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return fmtDate(v);
  if (typeof v === "number") {
    const d = excelSerialToDate(v);
    return d ? fmtDate(d) : null;
  }
  const s = normalizeDigits(String(v)).trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2], da = +m[3];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    return null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const da = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    return null;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d{4}/.test(s)) return fmtDate(d);
  return null;
}

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
  for (const c of line) if (c in counts) counts[c]++;
  let best = ","; let bestN = -1;
  for (const [d, n] of Object.entries(counts)) if (n > bestN) { best = d; bestN = n; }
  return best;
}

// --- Lookups -------------------------------------------------------------

type EmployeeRec = { id: number; name: string; iqama: string | null; status: string };

/**
 * The employees a spreadsheet may point at. An import must not be able to
 * attach a row to an employee of another organization, so the index is built
 * from the caller's entity only.
 */
async function buildEmployeeIndex(entityId: number | null): Promise<Map<string, EmployeeRec[]>> {
  const rows = await db.prepare(
    "SELECT id, name, national_id_iqama, status FROM employees WHERE (? IS NULL OR entity_id = ?)"
  ).all(entityId, entityId) as any[];
  const idx = new Map<string, EmployeeRec[]>();
  for (const r of rows) {
    const rec: EmployeeRec = { id: r.id, name: r.name, iqama: r.national_id_iqama || null, status: r.status };
    const key = normalizeText(r.name);
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key)!.push(rec);
    if (rec.iqama) {
      const ik = normalizeText(rec.iqama);
      if (!idx.has(ik)) idx.set(ik, []);
      idx.get(ik)!.push(rec);
    }
  }
  return idx;
}

function matchEmployee(value: string, idx: Map<string, EmployeeRec[]>): { id: number; name: string } | { error: string } {
  const raw = normalizeDigits(String(value ?? "")).trim();
  if (!raw) return { error: "قيمة الموظف فارغة" };
  const exact = idx.get(normalizeText(raw));
  if (exact && exact.length > 0) {
    const uniq = [...new Map(exact.map(e => [e.id, e])).values()];
    if (uniq.length === 1) return { id: uniq[0].id, name: uniq[0].name };
  }
  const numeric = parseNumber(raw);
  if (numeric !== null && Number.isInteger(numeric)) {
    const byIqama = idx.get(normalizeText(raw));
    if (byIqama) return matchEmployee(raw, idx); // iqama path handled by exact above
  }
  const candidates = new Map<number, EmployeeRec>();
  for (const [key, recs] of idx) {
    if (key.includes(normalizeText(raw))) for (const r of recs) candidates.set(r.id, r);
  }
  if (candidates.size === 1) {
    const e = [...candidates.values()][0];
    return { id: e.id, name: e.name };
  }
  if (candidates.size > 1) {
    return { error: `أكثر من موظف مطابق: ${[...candidates.values()].slice(0, 3).map(e => e.name).join("، ")} — استخدم الاسم الكامل` };
  }
  return { error: `لا يوجد موظف باسم «${raw}»` };
}

async function matchDepartment(value: string, entityId: number | null): Promise<{ id: number; name: string } | { error: string }> {
  const raw = String(value ?? "").trim();
  if (!raw) return { error: "الإدارة فارغة" };
  const rows = await db.prepare(
    "SELECT id, name, name_en FROM departments WHERE (? IS NULL OR entity_id = ?)"
  ).all(entityId, entityId) as any[];
  const n = normalizeText(raw);
  const exact = rows.find(r => normalizeText(r.name) === n || normalizeText(r.name_en || "") === n);
  if (exact) return { id: exact.id, name: exact.name };
  const partial = rows.filter(r => normalizeText(r.name).includes(n) || normalizeText(r.name_en || "").includes(n));
  if (partial.length === 1) return { id: partial[0].id, name: partial[0].name };
  if (partial.length > 1) return { error: `أكثر من إدارة مطابقة لـ «${raw}»` };
  return { error: `لا توجد إدارة باسم «${raw}»` };
}

// --- Column / module registry ---------------------------------------------

type ColType = "text" | "number" | "date" | "enum" | "employee" | "department";

type Column = {
  key: string;
  label: string;
  type: ColType;
  required?: boolean;
  aliases?: string[];
  options?: Array<{ value: string; label: string }>;
  example?: string;
};

type ModuleDef = {
  key: string;
  label: string;
  description: string;
  table: string;
  columns: Column[];
  insert?: (data: Record<string, any>) => void | Promise<void>;
  afterInsert?: (data: Record<string, any>) => void | Promise<void>;
  uniqueness?: { field: string; dbColumn: string; message: string };
};

const enumOpts = (pairs: Array<[string, string]>): Column["options"] =>
  pairs.map(([value, label]) => ({ value, label }));

const MEDICAL_SYNC = `
  UPDATE employees SET
    insurance_company = (SELECT insurance_company FROM medical_policies WHERE employee_id = ? AND status = 'active' ORDER BY coverage_end DESC LIMIT 1),
    medical_insurance_category = (SELECT category FROM medical_policies WHERE employee_id = ? AND status = 'active' ORDER BY coverage_end DESC LIMIT 1),
    medical_insurance_policy = (SELECT policy_number FROM medical_policies WHERE employee_id = ? AND status = 'active' ORDER BY coverage_end DESC LIMIT 1),
    medical_insurance_expiry = (SELECT coverage_end FROM medical_policies WHERE employee_id = ? AND status = 'active' ORDER BY coverage_end DESC LIMIT 1),
    medical_dependents_count = (SELECT COALESCE(SUM(dependents), 0) FROM medical_policies WHERE employee_id = ? AND status = 'active')
  WHERE id = ?`;

export const IMPORT_MODULES: ModuleDef[] = [
  {
    key: "health_certificates",
    label: "الشهادات الصحية",
    description: "شهادات البلدية/أجير لكل موظف — بعد الاستيراد تُحدَّث بطاقة الموظف وتعمل تنبيهات الانتهاء تلقائياً.",
    table: "health_certificates",
    columns: [
      { key: "employee_id", label: "الموظف", type: "employee", required: true, example: "محمد أحمد السيد" },
      { key: "certificate_number", label: "رقم الشهادة", type: "text", aliases: ["رقم الشهاده", "certificate"], example: "BLD-2026-00123" },
      { key: "profession_on_cert", label: "المهنة في الشهادة", type: "text", aliases: ["المهنة"], example: "عامل تجهيز أطعمة" },
      { key: "issue_date", label: "تاريخ الإصدار", type: "date", aliases: ["تاريخ الاصدار"], example: "2026-01-15" },
      { key: "expiry_date", label: "تاريخ الانتهاء", type: "date", required: true, example: "2027-01-14" },
      {
        key: "issuing_authority", label: "جهة الإصدار", type: "enum",
        options: enumOpts([["البلدية (بلدي)", "البلدية (بلدي)"], ["أجير", "أجير"], ["وزارة الصحة", "وزارة الصحة"], ["مستشفى معتمد", "مستشفى معتمد"], ["أخرى", "أخرى"]]),
        example: "البلدية (بلدي)",
      },
      { key: "notes", label: "ملاحظات", type: "text", example: "" },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO health_certificates (employee_id, certificate_number, profession_on_cert, issue_date, expiry_date, issuing_authority, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`)
        .run(d.employee_id, d.certificate_number || null, d.profession_on_cert || null, d.issue_date || null, d.expiry_date, d.issuing_authority || "البلدية (بلدي)", d.notes || null);
    },
    afterInsert: (d) => syncEmployeeSnapshot(d.employee_id),
  },
  {
    key: "medical_policies",
    label: "وثائق التأمين الطبي",
    description: "وثائق CCHI لكل موظف — تُحدَّث بطاقة الموظف (شركة التأمين/الفئة/رقم الوثيقة/الانتهاء) بعد الاستيراد.",
    table: "medical_policies",
    columns: [
      { key: "employee_id", label: "الموظف", type: "employee", required: true, example: "محمد أحمد السيد" },
      { key: "insurance_company", label: "شركة التأمين", type: "text", example: "التعاونية للتأمين" },
      { key: "policy_number", label: "رقم الوثيقة", type: "text", example: "POL-2026-889" },
      {
        key: "category", label: "الفئة التأمينية", type: "enum",
        options: enumOpts([["VIP", "VIP"], ["Class A", "A"], ["Class B", "B"], ["Class C", "C"], ["Class D", "D"]]),
        example: "Class A",
      },
      { key: "coverage_start", label: "بداية التغطية", type: "date", aliases: ["تاريخ البداية"], example: "2026-01-01" },
      { key: "coverage_end", label: "نهاية التغطية", type: "date", aliases: ["تاريخ الانتهاء"], example: "2026-12-31" },
      { key: "premium", label: "القسط السنوي", type: "number", example: "2500" },
      { key: "dependents", label: "عدد التابعين", type: "number", example: "2" },
      {
        key: "status", label: "الحالة", type: "enum",
        options: enumOpts([["active", "نشطة"], ["expired", "منتهية"], ["cancelled", "ملغاة"]]),
        example: "نشطة",
      },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO medical_policies (employee_id, insurance_company, policy_number, category, coverage_start, coverage_end, premium, dependents, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(d.employee_id, d.insurance_company || null, d.policy_number || null, d.category || null, d.coverage_start || null, d.coverage_end || null, d.premium ?? null, d.dependents ?? 0, d.status || "active");
    },
    afterInsert: async (d) => {
      await db.prepare(MEDICAL_SYNC).run(d.employee_id, d.employee_id, d.employee_id, d.employee_id, d.employee_id, d.employee_id);
    },
  },
  {
    key: "fleet_vehicles",
    label: "أسطول المركبات",
    description: "مركبات الشركة مع مستحقات التأمين والاستمارة والفحص الدوري لتغذية تنبيهات الانتهاء.",
    table: "fleet_vehicles",
    uniqueness: { field: "plate_number", dbColumn: "plate_number", message: "رقم اللوحة مسجل مسبقاً" },
    columns: [
      { key: "plate_number", label: "رقم اللوحة", type: "text", required: true, example: "ح ب ط 4821" },
      { key: "brand", label: "الماركة", type: "text", example: "تويوتا" },
      { key: "model", label: "الموديل", type: "text", example: "هايلوكس" },
      { key: "year", label: "سنة الصنع", type: "number", example: "2023" },
      { key: "color", label: "اللون", type: "text", example: "أبيض" },
      { key: "vin", label: "رقم الهيكل (VIN)", type: "text", example: "MR0HC3CD101234567" },
      {
        key: "fuel_type", label: "نوع الوقود", type: "enum",
        options: enumOpts([["petrol", "بنزين"], ["diesel", "ديزل"], ["electric", "كهربائي"], ["hybrid", "هجين"]]),
        example: "بنزين",
      },
      { key: "assigned_employee_id", label: "الموظف المخصص", type: "employee", example: "محمد أحمد السيد" },
      { key: "purchase_date", label: "تاريخ الشراء", type: "date", example: "2023-05-10" },
      { key: "purchase_value", label: "قيمة الشراء", type: "number", example: "85000" },
      { key: "insurance_expiry", label: "انتهاء التأمين", type: "date", example: "2026-12-01" },
      { key: "registration_expiry", label: "انتهاء الاستمارة", type: "date", example: "2026-11-20" },
      { key: "inspection_expiry", label: "انتهاء الفحص الدوري", type: "date", example: "2026-10-30" },
      {
        key: "status", label: "الحالة", type: "enum",
        options: enumOpts([["active", "نشطة"], ["maintenance", "صيانة"], ["sold", "مباعة"], ["written_off", "خارج الخدمة"]]),
        example: "نشطة",
      },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO fleet_vehicles (plate_number, brand, model, year, color, vin, fuel_type, assigned_employee_id, purchase_date, purchase_value, insurance_expiry, registration_expiry, inspection_expiry, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(d.plate_number, d.brand || null, d.model || null, d.year ?? null, d.color || null, d.vin || null, d.fuel_type || "petrol", d.assigned_employee_id || null, d.purchase_date || null, d.purchase_value ?? null, d.insurance_expiry || null, d.registration_expiry || null, d.inspection_expiry || null, d.status || "active");
    },
  },
  {
    key: "loans",
    label: "القروض والسلف",
    description: "قروض الموظفين مع أقساطها الشهرية لتُخصم من المسير.",
    table: "loans",
    columns: [
      { key: "employee_id", label: "الموظف", type: "employee", required: true, example: "محمد أحمد السيد" },
      { key: "total_amount", label: "إجمالي القرض", type: "number", required: true, example: "12000" },
      { key: "remaining_amount", label: "المتبقي", type: "number", aliases: ["المتبقي حاليا"], example: "12000" },
      { key: "monthly_installment", label: "القسط الشهري", type: "number", example: "1000" },
      {
        key: "status", label: "الحالة", type: "enum",
        options: enumOpts([["active", "نشط"], ["paid", "مسدد"], ["completed", "منتهٍ"], ["cancelled", "ملغي"]]),
        example: "نشط",
      },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO loans (employee_id, total_amount, remaining_amount, monthly_installment, status)
        VALUES (?, ?, ?, ?, ?)`)
        .run(d.employee_id, d.total_amount, d.remaining_amount ?? d.total_amount, d.monthly_installment ?? null, d.status || "active");
    },
  },
  {
    key: "leaves",
    label: "الإجازات",
    description: "سجل إجازات الموظفين (سنوية/مرضية/اضطرارية) بحالات الاعتماد.",
    table: "leaves",
    columns: [
      { key: "employee_id", label: "الموظف", type: "employee", required: true, example: "محمد أحمد السيد" },
      {
        key: "type", label: "نوع الإجازة", type: "enum",
        options: enumOpts([["annual", "سنوية"], ["sick", "مرضية"], ["emergency", "اضطرارية"], ["unpaid", "بدون راتب"], ["hajj", "حج"], ["maternity", "أمومة"]]),
        example: "سنوية",
      },
      { key: "start_date", label: "تاريخ البداية", type: "date", required: true, example: "2026-11-15" },
      { key: "end_date", label: "تاريخ النهاية", type: "date", required: true, example: "2026-11-25" },
      { key: "days", label: "عدد الأيام", type: "number", example: "10" },
      {
        key: "status", label: "الحالة", type: "enum",
        options: enumOpts([["pending", "قيد الانتظار"], ["approved", "معتمدة"], ["rejected", "مرفوضة"], ["cancelled", "ملغاة"]]),
        example: "معتمدة",
      },
      { key: "reason", label: "السبب", type: "text", example: "إجازة سنوية مستحقة" },
    ],
    insert: async (d) => {
      let days = d.days;
      if ((days === null || days === undefined) && d.start_date && d.end_date) {
        days = Math.max(1, Math.round((new Date(d.end_date + "T00:00:00Z").getTime() - new Date(d.start_date + "T00:00:00Z").getTime()) / 86400000) + 1);
      }
      await db.prepare(`INSERT INTO leaves (employee_id, type, start_date, end_date, days, status, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(d.employee_id, d.type || "annual", d.start_date, d.end_date, days ?? null, d.status || "pending", d.reason || null);
    },
  },
  {
    key: "appraisals",
    label: "تقييمات الأداء",
    description: "نتائج الدوريات الدورية لتقييم الموظفين (تقييم من 1 إلى 5).",
    table: "appraisals",
    columns: [
      { key: "employee_id", label: "الموظف", type: "employee", required: true, example: "محمد أحمد السيد" },
      { key: "rating", label: "التقييم (1-5)", type: "number", required: true, example: "4.5" },
      { key: "comments", label: "ملاحظات التقييم", type: "text", example: "أداء متميز في التحضير والجودة" },
      { key: "period", label: "فترة التقييم", type: "text", aliases: ["الفترة"], example: "2026-H1" },
      { key: "appraisal_date", label: "تاريخ التقييم", type: "date", example: "2026-06-30" },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO appraisals (employee_id, rating, comments, period, appraisal_date)
        VALUES (?, ?, ?, ?, ?)`)
        .run(d.employee_id, d.rating, d.comments || null, d.period || null, d.appraisal_date || null);
    },
  },
  {
    key: "recruitment_jobs",
    label: "الوظائف الشاغرة",
    description: "إعلانات التوظيف المفتوحة ضمن نظام ATS.",
    table: "recruitment_jobs",
    columns: [
      { key: "title", label: "المسمى الوظيفي", type: "text", required: true, example: "طاهي برجر أول" },
      { key: "department_id", label: "الإدارة", type: "department", example: "المطبخ" },
      { key: "description", label: "الوصف الوظيفي", type: "text", example: "إدارة خط تحضير البرجر وضبط الجودة" },
      { key: "requirements", label: "المتطلبات", type: "text", example: "خبرة 3 سنوات + شهادة صحية سارية" },
      { key: "salary_range_min", label: "أقل راتب", type: "number", example: "4000" },
      { key: "salary_range_max", label: "أعلى راتب", type: "number", example: "6000" },
      {
        key: "employment_type", label: "نوع التعاقد", type: "enum",
        options: enumOpts([["full_time", "دوام كامل"], ["part_time", "دوام جزئي"], ["contract", "عقد"]]),
        example: "دوام كامل",
      },
      { key: "location", label: "الموقع", type: "text", example: "الرياض - الفرع الرئيسي" },
      {
        key: "status", label: "الحالة", type: "enum",
        options: enumOpts([["open", "مفتوحة"], ["on_hold", "معلقة"], ["closed", "مغلقة"], ["filled", "مشغولة"]]),
        example: "مفتوحة",
      },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO recruitment_jobs (title, department_id, description, requirements, salary_range_min, salary_range_max, employment_type, location, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(d.title, d.department_id || null, d.description || null, d.requirements || null, d.salary_range_min ?? null, d.salary_range_max ?? null, d.employment_type || "full_time", d.location || null, d.status || "open");
    },
  },
  {
    key: "kudos",
    label: "التقدير والمكافآت",
    description: "سجل شكر وتقدير بين الموظفين (Kudos) مع نقاط المكافآت.",
    table: "kudos",
    columns: [
      { key: "from_employee_id", label: "من (المُرسل)", type: "employee", required: true, example: "مدير الفرع" },
      { key: "to_employee_id", label: "إلى (المُكرَّم)", type: "employee", required: true, example: "محمد أحمد السيد" },
      {
        key: "type", label: "نوع التقدير", type: "enum",
        options: enumOpts([["innovation", "ابتكار"], ["teamwork", "عمل جماعي"], ["customer_delight", "إبهار العملاء"], ["safety_first", "السلامة أولاً"], ["leadership", "قيادة"]]),
        example: "عمل جماعي",
      },
      { key: "message", label: "الرسالة", type: "text", example: "تعاون مميز في يوم الضغط الأسبوعي" },
      { key: "points", label: "النقاط", type: "number", example: "10" },
      {
        key: "is_anonymous", label: "مجهول؟", type: "enum",
        options: enumOpts([["1", "نعم"], ["0", "لا"]]),
        example: "لا",
      },
    ],
    insert: async (d) => {
      await db.prepare(`INSERT INTO kudos (from_employee_id, to_employee_id, type, message, points, is_anonymous)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(d.from_employee_id, d.to_employee_id, d.type || null, d.message || null, d.points ?? 10, d.is_anonymous ?? 0);
    },
  },
];

function getModule(key: string): ModuleDef | undefined {
  return IMPORT_MODULES.find(m => m.key === key);
}

// --- Cell -> column value --------------------------------------------------

async function convertCell(raw: unknown, col: Column, ctx: { empIdx: Map<string, EmployeeRec[]>; entityId: number | null }): Promise<{ value: any; error?: string }> {
  const empty = raw === null || raw === undefined || String(raw).trim() === "";
  if (empty) {
    if (col.required) return { value: null, error: `«${col.label}» مطلوب` };
    return { value: null };
  }
  switch (col.type) {
    case "text":
      return { value: normalizeDigits(String(raw)).trim() };
    case "number": {
      const n = parseNumber(raw);
      if (n === null) return { value: null, error: `«${col.label}» ليس رقماً صحيحاً (${raw})` };
      return { value: n };
    }
    case "date": {
      const d = parseDate(raw);
      if (!d) return { value: null, error: `«${col.label}» تاريخ غير مفهوم (${raw}) — الصيغ المقبولة: 2026-01-31 أو 31/01/2026` };
      return { value: d };
    }
    case "enum": {
      const s = normalizeDigits(String(raw)).trim();
      const opt = (col.options || []).find(o => o.value.toLowerCase() === s.toLowerCase() || normalizeText(o.label) === normalizeText(s));
      if (!opt) return { value: null, error: `«${col.label}» قيمة غير معروفة (${s}) — المسموح: ${(col.options || []).map(o => o.label).join("، ")}` };
      return { value: opt.value };
    }
    case "employee": {
      const r = matchEmployee(String(raw), ctx.empIdx);
      if ("error" in r) return { value: null, error: `«${col.label}»: ${r.error}` };
      return { value: r.id };
    }
    case "department": {
      const r = await matchDepartment(String(raw), ctx.entityId);
      if ("error" in r) return { value: null, error: `«${col.label}»: ${r.error}` };
      return { value: r.id };
    }
  }
}

// --- Parsing entry ---------------------------------------------------------

function extractGrid(filename: string, buf: Buffer): string[][] {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
    return grid.map(row => row.map(cell => (cell instanceof Date ? fmtDate(cell) : cell === null || cell === undefined ? "" : String(cell))));
  }
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = lower.endsWith(".tsv") ? "\t" : detectDelimiter(firstLine);
  return parseCsv(text, delim);
}

export function registerImporter(app: express.Express) {
  // Module catalog + current row counts (drives the screen).
  app.get("/api/import/modules", (req, res) => {
    try {
      res.json(IMPORT_MODULES.map(async m => ({
        key: m.key,
        label: m.label,
        description: m.description,
        count: (await db.prepare(`SELECT COUNT(*) as c FROM ${m.table}`).get() as any).c,
        columns: m.columns.map(c => ({ key: c.key, label: c.label, type: c.type, required: !!c.required, options: c.options?.map(o => o.label) })),
      })));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // CSV template download (UTF-8 BOM so Arabic opens correctly in Excel).
  app.get("/api/import/template/:module", (req, res) => {
    const m = getModule(req.params.module);
    if (!m) return res.status(404).json({ error: "وحدة غير معروفة" });
    const header = m.columns.map(c => c.label);
    const examples = [0, 1].map(i => m.columns.map(c => c.example ?? (i === 0 ? "" : "")));
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = "\uFEFF" + [header, examples[0]].map(r => r.map(esc).join(",")).join("\r\n") + "\r\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="template-${m.key}.csv"`);
    res.send(csv);
  });

  // Parse + validate + map. Nothing is written.
  app.post("/api/import/preview", async (req, res) => {
    try {
      const scope = (await resolveWriteScope(db, (req as any).user?.id, req.query as Record<string, unknown>));
      if (!scope) return res.status(403).json({ error: "الحساب غير مرتبط بكيان — لا يمكن الاستيراد قبل ربط الحساب بكيان" });
      const { module: moduleKey, filename, content_base64 } = req.body || {};
      const m = getModule(moduleKey);
      if (!m) return res.status(400).json({ error: "وحدة غير معروفة" });
      if (!content_base64) return res.status(400).json({ error: "لم يتم إرسال الملف" });

      let buf: Buffer;
      try {
        buf = Buffer.from(String(content_base64), "base64");
      } catch {
        return res.status(400).json({ error: "ملف غير قابل للقراءة" });
      }
      if (buf.length === 0) return res.status(400).json({ error: "الملف فارغ" });
      if (buf.length > 18 * 1024 * 1024) return res.status(400).json({ error: "حجم الملف يتجاوز 18MB" });

      const grid = extractGrid(filename || "", buf);
      if (grid.length < 2) return res.status(400).json({ error: "الملف لا يحتوي على صفوف بيانات (رأس + صف واحد على الأقل)" });

      // Map header row -> columns by label/aliases.
      const headerRow = grid[0].map(h => normalizeText(String(h)));
      const colIndex = new Map<number, Column>();
      const matchedHeaders: string[] = [];
      const unmappedHeaders: string[] = [];
      m.columns.forEach(c => {
        const aliases = [c.label, ...(c.aliases || [])].map(normalizeText);
        const i = headerRow.findIndex(h => aliases.includes(h));
        if (i >= 0) colIndex.set(i, c);
      });
      grid[0].forEach((h, i) => {
        if (String(h).trim() === "") return;
        if (colIndex.has(i)) matchedHeaders.push(String(h).trim()); else unmappedHeaders.push(String(h).trim());
      });
      const missingColumns = m.columns.filter(c => c.required && ![...colIndex.values()].some(c2 => c2.key === c.key)).map(c => c.label);
      if (missingColumns.length > 0) {
        return res.status(400).json({
          error: `أعمدة مطلوبة غير موجودة في الملف: ${missingColumns.join("، ")}`,
          hint: `الأعمدة المطلوبة: ${m.columns.map(c => c.label).join(" | ")}`,
        });
      }

      const empIdx = await buildEmployeeIndex(scope.entityId);
      const rows: any[] = [];
      const dataRows = grid.slice(1).filter(r => r.some(c => String(c).trim() !== ""));
      if (dataRows.length > MAX_ROWS) return res.status(400).json({ error: `عدد الصفوف يتجاوز الحد (${MAX_ROWS})` });

      for (const [i, r] of dataRows.entries()) {
        const data: Record<string, any> = {};
        const display: Record<string, string> = {};
        const errors: Array<{ field: string; message: string }> = [];
        for (const [idx, col] of colIndex) {
          display[col.key] = String(r[idx] ?? "").trim();
          const { value, error } = await convertCell(r[idx], col, { empIdx, entityId: scope.entityId });
          data[col.key] = value;
          if (error) errors.push({ field: col.label, message: error });
        }
        rows.push({ row: i + 2, data, display, ok: errors.length === 0, errors });
      }

      // Duplicate uniqueness checks (in-file + in-db), e.g. plate numbers.
      if (m.uniqueness) {
        const seen = new Map<string, number>();
        const existing = new Set(
          (await db.prepare(`SELECT ${m.uniqueness.dbColumn} v FROM ${m.table}`).all() as any[])
            .map(r => normalizeText(String(r.v ?? "")))
        );
        for (const r of rows) {
          const v = normalizeText(String(r.data[m.uniqueness.field] ?? ""));
          if (!v) continue;
          if (existing.has(v) || (seen.get(v) ?? 0) > 1) {
            r.ok = false;
            r.errors.push({ field: m.uniqueness.field, message: m.uniqueness.message });
          }
          seen.set(v, (seen.get(v) ?? 0) + 1);
        }
      }

      const valid = rows.filter(r => r.ok).length;
      res.json({
        module: m.key,
        total: rows.length,
        valid,
        invalid: rows.length - valid,
        matched_headers: matchedHeaders,
        unmapped_headers: unmappedHeaders,
        columns: m.columns.map(c => ({ key: c.key, label: c.label, type: c.type, required: !!c.required })),
        rows,
      });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "فشل تحليل الملف: " + (e as Error).message });
    }
  });

  // Commit: insert the previously previewed (already validated) rows in one tx.
  app.post("/api/import/commit", async (req, res) => {
    try {
      const scope = (await resolveWriteScope(db, (req as any).user?.id, req.query as Record<string, unknown>));
      if (!scope) return res.status(403).json({ error: "الحساب غير مرتبط بكيان — لا يمكن الاستيراد قبل ربط الحساب بكيان" });
      const { module: moduleKey, rows } = req.body || {};
      const m = getModule(moduleKey);
      if (!m) return res.status(400).json({ error: "وحدة غير معروفة" });
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "لا توجد صفوف للاستيراد" });
      if (rows.length > MAX_ROWS) return res.status(400).json({ error: `عدد الصفوف يتجاوز الحد (${MAX_ROWS})` });

      const empIdx = await buildEmployeeIndex(scope.entityId);

      // Re-validate every row: the client sends parsed data, but the server
      // never trusts it — same validation as preview, required fields included.
      // When raw_values are present they re-parse from the original cell text.
      const validated: Record<string, any>[] = [];
      const rejected: Array<{ row: number; errors: any[] }> = [];
      const rawRows = Array.isArray((req.body as any).raw_values) ? (req.body as any).raw_values : null;
      for (const [i, r] of rows.entries()) {
        const data: Record<string, any> = {};
        const errors: Array<{ field: string; message: string }> = [];
        const source = rawRows && rawRows[i] ? rawRows[i] : r;
        for (const col of m.columns) {
          const { value, error } = await convertCell(source[col.key], col, { empIdx, entityId: scope.entityId });
          data[col.key] = value;
          if (error) errors.push({ field: col.label, message: error });
        }
        if (errors.length > 0) rejected.push({ row: i + 2, errors });
        else validated.push(data);
      }

      let inserted = 0;
      if (validated.length > 0) {
        const tx = db.transaction(async () => {
          for (const d of validated) {
            await m.insert!(d);
            inserted++;
            await m.afterInsert?.(d);
          }
        });
        await tx();
        await logAction("import", m.table, null, `${m.label}: استيراد ${inserted} صف من ملف Excel`);
      }

      res.json({ inserted, rejected });
    } catch (e) {
      log.error(e);
      res.status(500).json({ error: "فشل الاستيراد: " + (e as Error).message });
    }
  });
}
