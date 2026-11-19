// محرّك القوالب المشترك بين الخادم والواجهة.
//
// كل مستند في «مركز النماذج والطباعة» هو نص يحوي حقولاً مثل {{employee.name}}
// و{{salary.total}}. هذا الملف هو المصدر الوحيد لطريقة قراءة هذه الحقول،
// فيبقى السلوك واحداً: نفس القالب، نفس السياق، نفس النص — سواء عاينه
// المستخدم في المتصفح أو خُزِّن في قاعدة البيانات.
//
// يبقى الملف خالصاً (بلا React) ليعمل على السيرفر أيضاً: استيراده من
// server/routes لا يجرّ معه أي كود عميل.

/** سياق مسطّح: المفتاح هو اسم الحقل كما يظهر داخل {{ ... }}. */
export type PlaceholderContext = Record<string, string | number | null | undefined>;

/**
 * يلتقط {{...}} مع السماح بأقواس مفردة داخل التعبير الشرطي.
 *Lazy: يتوقف عند أول }} بعد الفتح.
 */
const PLACEHOLDER_PATTERN = /\{\{(.*?)\}\}/gs;

/**
 * صيغة شرطية داخل حقل: {{employee.department ? " — إدارة {employee.department}" : ""}}
 *
 * الشرط «حقل القيمة موجود» — القيم الفارغة تعني «لا شيء يُطبع». الفرع
 * المختار może أن يضم حقولاً بين أقواس مفردة تُملأ من السياق.
 * التقييم يتم نصياً بلا eval: الحقول المسموحة محدودة (مسار + نصوص).
 */
const CONDITIONAL_PATTERN =
  /^([a-zA-Z0-9_.]+)\s*\?\s*(['"])([\s\S]*?)\2\s*:\s*(['"])([\s\S]*?)\4$/;

/** الحقول داخل فرع نصي: {employee.department} */
const INNER_PATTERN = /\{([a-zA-Z0-9_.]+)\}/g;

/** نص يُعرض مكان الحقل غير المتوفر، حتى لا يخرج المستند وفيه فراغ صامت. */
export const MISSING_PLACEHOLDER = "«غير متوفر»";

/** يقرأ قيمة حقل من السياق: المفتاح المسطّح أولاً، ثم المسار المتشعّب. */
function lookup(context: PlaceholderContext, path: string): string | number | null | undefined {
  if (Object.prototype.hasOwnProperty.call(context, path)) return context[path];
  const parts = path.split(".");
  let current: any = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

interface Resolution {
  text: string;
  /** الحقول التي لم يجد لها قيمة (يعني «غير متوفر» في النص). */
  unresolved: string[];
}

/**
 * يقيّم تعبير حقل واحد: إمّا قيمة مباشرة، وإما صيغة شرطية.
 */
function resolveExpression(inner: string, context: PlaceholderContext): Resolution {
  const trimmed = inner.trim();
  const conditional = CONDITIONAL_PATTERN.exec(trimmed);
  if (conditional) {
    const [, path, , thenText, , elseText] = conditional;
    const value = lookup(context, path);
    const taken = value !== undefined && value !== null && String(value) !== "" ? thenText : elseText;
    const unresolved: string[] = [];
    const text = taken.replace(INNER_PATTERN, (_match, field: string) => {
      const inner_value = lookup(context, field);
      if (inner_value === undefined || inner_value === null || inner_value === "") {
        unresolved.push(field);
        return MISSING_PLACEHOLDER;
      }
      return String(inner_value);
    });
    return { text, unresolved };
  }

  const value = lookup(context, trimmed);
  if (value === undefined || value === null || value === "") {
    return { text: MISSING_PLACEHOLDER, unresolved: [trimmed] };
  }
  return { text: String(value), unresolved: [] };
}

/**
 * يجمع أسماء الحقول المستعملة في قالب، بترتيب أول ظهور ودون تكرار.
 * تُستعمل في محرّر القوالب: كل حقل يظهر في القائمة الجانبية.
 */
export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(PLACEHOLDER_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    const inner = match[1];
    const conditional = CONDITIONAL_PATTERN.exec(inner.trim());
    const keys: string[] = [];
    if (conditional) {
      keys.push(conditional[1]);
      for (const branch of [conditional[3], conditional[5]]) {
        const innerPattern = new RegExp(INNER_PATTERN.source, "g");
        let innerMatch: RegExpExecArray | null;
        while ((innerMatch = innerPattern.exec(branch)) !== null) keys.push(innerMatch[1]);
      }
    } else {
      keys.push(inner.trim());
    }
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(key);
    }
  }
  return found;
}

/**
 * يستبدل حقول القالب بقيمها من السياق.
 * الحقل غير الموجود يبقى بصيغة «غير متوفر» بدل الفراغ، لأن المستند المطبوع
 * لا يصح أن يحمل فراغاً يقرأه المتلقي كـ«نُسي» أو «لا يوجد».
 */
export function renderTemplate(
  template: string,
  context: PlaceholderContext,
  options: { missingText?: string } = {},
): string {
  const missingText = options.missingText ?? MISSING_PLACEHOLDER;
  return template.replace(PLACEHOLDER_PATTERN, (whole, inner: string) => {
    const resolution = resolveExpression(inner, context);
    if (resolution.unresolved.length > 0 && resolution.text === MISSING_PLACEHOLDER) {
      return missingText;
    }
    return resolution.text;
  });
}

/** الحقول التي لم يُعثر لها على قيمة — تُعرض للمستخدم قبل الحفظ والطباعة. */
export function findUnresolvedPlaceholders(
  template: string,
  context: PlaceholderContext,
): string[] {
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(PLACEHOLDER_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    for (const key of resolveExpression(match[1], context).unresolved) {
      if (seen.has(key)) continue;
      seen.add(key);
      unresolved.push(key);
    }
  }
  return unresolved;
}

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** 2026-11-13 -> «13 نوفمبر 2026». تاريخ غير صالح يبقى كما هو. */
export function formatArabicDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getDate()} ${ARABIC_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

/** رقم بفواصل الآلاف وبحد أقصى منزلتين عشريتين. */
export function formatNumber(value?: number | string | null): string {
  if (value === undefined || value === null || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** مبلغ بعملة المنشأة: «12,345.00 ر.س». */
export function formatCurrency(
  value?: number | string | null,
  currency = "SAR",
): string {
  const formatted = formatNumber(value);
  if (!formatted) return "";
  return `${formatted} ${currency === "SAR" ? "ر.س" : currency}`;
}

/** الحروف الأولى من الاسم — تُستخدم في «م.س / م.ع». */
export function salutation(name?: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `السيّد/ة ${parts[0]}`;
  return `السيّد/ة ${parts[0]}`;
}

/**
 * يبني السياق من بيانات حقيقية (موظف + قسيمة راتب + المنشأة + حقول إضافية).
 * يُستعمل في الخادم عند الحفظ، وفي الواجهة عند المعاينة الحية، فيتطابق النص
 * في الحالتين.
 */
export function buildTemplateContext(input: {
  employee?: Record<string, any> | null;
  salary?: Record<string, any> | null;
  company?: Record<string, any> | null;
  document?: Record<string, any> | null;
  custom?: Record<string, any> | null;
}): PlaceholderContext {
  const employee = input.employee ?? {};
  const salary = input.salary ?? {};
  const company = input.company ?? {};
  const document = input.document ?? {};
  const custom = input.custom ?? {};

  const currency = company.currency || "SAR";
  const total = salary.total_salary ?? salary.total ?? salary.net_salary ?? employee.total_salary ?? null;
  const basic = salary.basic_salary ?? employee.basic_salary ?? null;

  const context: PlaceholderContext = {
    // المنشأة
    "company.name": company.org_name || company.name || "",
    "company.cr_number": company.cr_number || "",
    "company.vat_number": company.vat_number || "",
    "company.unified_number": company.unified_number_700 || "",
    "company.subscription_number": company.establishment_subscription_number || "",
    "company.country": company.country || "المملكة العربية السعودية",
    "company.currency": currency,
    "company.address": company.address || company.org_address_ar || "",
    "company.address_en": company.org_address_en || "",
    "company.po_box": company.po_box || "",
    "company.email": company.email || company.org_email || "",
    "company.phone": company.phone || company.org_phone || "",

    // الموظف
    "employee.name": employee.name || "",
    "employee.salutation": salutation(employee.name),
    "employee.position": employee.position || employee.job_title || "",
    "employee.job_title": employee.job_title || employee.position || "",
    "employee.department": employee.department_name || employee.department || "",
    "employee.branch": employee.branch_name || employee.branch || "",
    "employee.national_id": employee.national_id_iqama || "",
    "employee.nationality": employee.nationality || "",
    "employee.join_date": formatArabicDate(employee.join_date || employee.contract_start_date),
    "employee.contract_start": formatArabicDate(employee.contract_start_date || employee.join_date),
    "employee.contract_end": formatArabicDate(employee.contract_end_date),
    "employee.contract_type":
      employee.contract_type === "unlimited" ? "غير محدد المدة" : "محدد المدة",
    "employee.iban": employee.saudi_iban || employee.iban || employee.bank_account || "",
    "employee.bank_name": employee.bank_name || "",
    "employee.email": employee.email || "",
    "employee.phone": employee.phone || "",
    "employee.salary": formatCurrency(basic, currency),

    // الراتب
    "salary.basic": formatCurrency(basic, currency),
    "salary.housing": formatCurrency(salary.housing_allowance ?? employee.housing_allowance, currency),
    "salary.transport": formatCurrency(salary.transport_allowance ?? employee.transport_allowance, currency),
    "salary.other": formatCurrency(salary.other_allowances ?? employee.other_allowances, currency),
    "salary.total": formatCurrency(total, currency),
    "salary.gross": formatCurrency(salary.gross_salary ?? salary.gross, currency),
    "salary.net": formatCurrency(salary.net_salary, currency),
    "salary.deductions": formatCurrency(salary.deductions, currency),
    "salary.month": salary.month ?? "",
    "salary.year": salary.year ?? "",
    "salary.period":
      salary.month && salary.year
        ? `${ARABIC_MONTHS[Number(salary.month) - 1] || salary.month} ${salary.year}`
        : "",

    // المستند
    "doc.number": document.number || document.certificate_number || "",
    "doc.reference": document.reference || "",
    "doc.subject": document.subject || document.addressed_to || "",
    "doc.purpose": document.purpose || "",
    "doc.issue_date": formatArabicDate(document.issue_date),
    "doc.valid_until": formatArabicDate(document.valid_until),

    // التاريخ
    "date.today": formatArabicDate(new Date().toISOString().slice(0, 10)),
  };

  // حقول إضافية يملؤها المستخدم وقت الإصدار (الغرض، المدة، المرجع...).
  for (const [key, value] of Object.entries(custom)) {
    context[`custom.${key}`] = value === null || value === undefined ? "" : String(value);
  }

  return context;
}

/**
 * الحقول التي يطلبها القالب من المستخدم — كل ما لم تجده في بيانات الموظف.
 * تُستعمل لعرض خانات الإدخال في نموذج الإصدار.
 */
export function listCustomFields(
  template: string,
  context: PlaceholderContext,
): string[] {
  return extractPlaceholders(template).filter((key) => {
    if (key.startsWith("custom.")) return true;
    const value = context[key];
    return value === undefined || value === null || value === "";
  });
}
