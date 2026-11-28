import { ScopeError, type OrganizationScope } from './organization-scope';

/**
 * Single source of truth for the reports module.
 *
 * Two different things live here:
 *
 *  - `REPORT_CATALOG`: metadata for the reports that already exist. It is used
 *    by the hub screen and by the AI assistant, so neither has to guess an
 *    endpoint or invent a column name.
 *  - `CUSTOM_DATASETS`: a small, explicitly allowlisted set of fields and
 *    filters for the custom report builder. A request can only choose from
 *    these entries; it never supplies SQL text, a table or an identifier.
 *
 * Nothing in this file holds employee data. Every query built from it is
 * bound to the caller's organization scope and every value stays a bound
 * parameter.
 */

export interface CatalogEntry {
  key: string;
  titleAr: string;
  descriptionAr: string;
  group: 'operational' | 'salary' | 'consolidated';
  endpoint: string;
  csvEndpoint?: string;
  aliases: string[];
}

export const REPORT_CATALOG: CatalogEntry[] = [
  {
    key: 'attendance-duty', titleAr: 'الحضور والواجبات',
    descriptionAr: 'سجلات الحضور والغياب والانحرافات لنطاقك خلال الفترة المحددة.',
    group: 'operational', endpoint: '/api/reports/attendance-duty',
    csvEndpoint: '/api/reports/attendance-duty/csv',
    aliases: ['حضور', 'غياب', 'انحراف', 'attendance'],
  },
  {
    key: 'payroll-overtime', titleAr: 'الرواتب والإضافي',
    descriptionAr: 'الرواتب المستحقة وساعات العمل الإضافي المعتمدة.',
    group: 'operational', endpoint: '/api/reports/payroll-overtime',
    csvEndpoint: '/api/reports/payroll-overtime/csv',
    aliases: ['راتب', 'إضافي', 'overtime', 'payroll'],
  },
  {
    key: 'expiry-alerts', titleAr: 'تنبيهات الانتهاء',
    descriptionAr: 'الوثائق والصلاحيات القريبة من الانتهاء مع مستوى الخطورة.',
    group: 'operational', endpoint: '/api/reports/expiry-alerts',
    csvEndpoint: '/api/reports/expiry-alerts/csv',
    aliases: ['انتهاء', 'وثائق', 'الإقامة', 'expiry'],
  },
  {
    key: 'ksa-compliance', titleAr: 'الامتثال السعودي',
    descriptionAr: 'مؤشرات نظام العمل والتأمينات وحماية الأجور.',
    group: 'operational', endpoint: '/api/reports/ksa-compliance',
    csvEndpoint: '/api/reports/ksa-compliance/csv',
    aliases: ['امتثال', 'سعودي', 'جوسي', 'ksa', 'gosi'],
  },
  {
    key: 'training-promotions', titleAr: 'التدريب والترقيات',
    descriptionAr: 'الدورات والتسجيلات والترقيات المستوفية للشروط.',
    group: 'operational', endpoint: '/api/reports/training-promotions',
    csvEndpoint: '/api/reports/training-promotions/csv',
    aliases: ['تدريب', 'ترقية', 'training', 'promotion'],
  },
  {
    key: 'service-termination', titleAr: 'إنهاء الخدمة',
    descriptionAr: 'حالات إنهاء الخدمة ومكافآت نهاية الخدمة المحسوبة.',
    group: 'operational', endpoint: '/api/reports/service-termination',
    csvEndpoint: '/api/reports/service-termination/csv',
    aliases: ['إنهاء', 'نهاية الخدمة', 'مكافأة', 'termination', 'eos'],
  },
  {
    key: 'company-salary', titleAr: 'تقرير الرواتب للشركة',
    descriptionAr: 'ملخص الرواتب على مستوى الشركة أو الكيان.',
    group: 'salary', endpoint: '/api/reports/company-salary',
    aliases: ['رواتب الشركة', 'salary company'],
  },
  {
    key: 'branch-salary', titleAr: 'تقرير رواتب الفرع',
    descriptionAr: 'تفصيل الرواتب لفرع واحد داخل النطاق المسموح.',
    group: 'salary', endpoint: '/api/reports/branch-salary',
    aliases: ['رواتب الفرع', 'salary branch'],
  },
  {
    key: 'payroll-statement', titleAr: 'كشف الراتب',
    descriptionAr: 'كشف تفصيلي لفترة راتب محددة.',
    group: 'salary', endpoint: '/api/reports/payroll-statement',
    aliases: ['كشف', 'statement'],
  },
  {
    key: 'provisions', titleAr: 'المخصصات',
    descriptionAr: 'مخصصات نهاية الخدمة والإجازات والالتزامات.',
    group: 'salary', endpoint: '/api/reports/provisions',
    aliases: ['مخصصات', 'provisions'],
  },
  {
    key: 'consolidated', titleAr: 'التقرير الموحّد للأفرع',
    descriptionAr: 'مقارنة مجمّعة عبر الأفرع داخل النطاق المسموح.',
    group: 'consolidated', endpoint: '/api/reports/consolidated',
    aliases: ['موحد', 'الأفرع', 'consolidated'],
  },
];

export type BuilderFieldType = 'text' | 'number' | 'date';

export interface BuilderField {
  key: string;
  labelAr: string;
  type: BuilderFieldType;
  /** Trusted SQL fragment from this file; never taken from the request. */
  sql: string;
}

export interface BuilderFilter extends BuilderField {
  /** Optional fixed comparison operator. Every value stays bound. */
  op?: '=' | 'like' | '>=' | '<';
  enumValues?: string[];
}

export interface BuilderDataset {
  key: string;
  labelAr: string;
  descriptionAr: string;
  /** Fixed FROM/JOIN text. The employee alias `e` carries the scope. */
  from: string;
  order: string;
  fields: BuilderField[];
  filters: BuilderFilter[];
  defaultFields: string[];
}

export const CUSTOM_DATASETS: BuilderDataset[] = [
  {
    key: 'employees', labelAr: 'الموظفون',
    descriptionAr: 'بيانات الموظف الأساسية داخل نطاقك، دون أرقام الهوية أو بيانات البنك.',
    from: 'FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN branches b ON e.branch_id = b.id',
    order: 'e.id',
    fields: [
      { key: 'id', labelAr: 'الرقم', type: 'number', sql: 'e.id' },
      { key: 'name', labelAr: 'الاسم', type: 'text', sql: 'e.name' },
      { key: 'position', labelAr: 'المسمى', type: 'text', sql: 'e.position' },
      { key: 'department', labelAr: 'القسم', type: 'text', sql: 'd.name' },
      { key: 'branch', labelAr: 'الفرع', type: 'text', sql: 'b.name' },
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'e.status' },
      { key: 'contract_type', labelAr: 'نوع العقد', type: 'text', sql: 'e.contract_type' },
      { key: 'basic_salary', labelAr: 'الراتب الأساسي', type: 'number', sql: 'e.basic_salary' },
      { key: 'housing_allowance', labelAr: 'بدل السكن', type: 'number', sql: 'e.housing_allowance' },
      { key: 'transport_allowance', labelAr: 'بدل النقل', type: 'number', sql: 'e.transport_allowance' },
      { key: 'end_service_date', labelAr: 'تاريخ نهاية الخدمة', type: 'date', sql: 'e.end_service_date' },
    ],
    filters: [
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'e.status' },
      { key: 'contract_type', labelAr: 'نوع العقد', type: 'text', sql: 'e.contract_type' },
      { key: 'branch_id', labelAr: 'الفرع', type: 'number', sql: 'e.branch_id' },
      { key: 'name', labelAr: 'الاسم يحتوي', type: 'text', sql: 'e.name', op: 'like' },
    ],
    defaultFields: ['id', 'name', 'position', 'department', 'branch', 'status', 'basic_salary'],
  },
  {
    key: 'payroll', labelAr: 'الرواتب',
    descriptionAr: 'مسير الرواتب مع حالة الاعتماد والدفع، داخل نطاقك.',
    from: 'FROM payroll p JOIN employees e ON p.employee_id = e.id',
    order: 'p.year DESC, p.month DESC, p.id',
    fields: [
      { key: 'id', labelAr: 'الرقم', type: 'number', sql: 'p.id' },
      { key: 'employee', labelAr: 'الموظف', type: 'text', sql: 'e.name' },
      { key: 'month', labelAr: 'الشهر', type: 'number', sql: 'p.month' },
      { key: 'year', labelAr: 'السنة', type: 'number', sql: 'p.year' },
      { key: 'basic_salary', labelAr: 'الأساسي', type: 'number', sql: 'p.basic_salary' },
      { key: 'allowances', labelAr: 'البدلات', type: 'number', sql: 'p.allowances' },
      { key: 'deductions', labelAr: 'الخصومات', type: 'number', sql: 'p.deductions' },
      { key: 'net_salary', labelAr: 'الصافي', type: 'number', sql: 'p.net_salary' },
      { key: 'approval_status', labelAr: 'الاعتماد', type: 'text', sql: 'p.approval_status' },
      { key: 'payment_status', labelAr: 'الدفع', type: 'text', sql: 'p.payment_status' },
    ],
    filters: [
      { key: 'month', labelAr: 'الشهر', type: 'number', sql: 'p.month' },
      { key: 'year', labelAr: 'السنة', type: 'number', sql: 'p.year' },
      { key: 'approval_status', labelAr: 'الاعتماد', type: 'text', sql: 'p.approval_status' },
      { key: 'payment_status', labelAr: 'الدفع', type: 'text', sql: 'p.payment_status' },
    ],
    defaultFields: ['id', 'employee', 'month', 'year', 'basic_salary', 'allowances', 'deductions', 'net_salary'],
  },
  {
    key: 'attendance', labelAr: 'الحضور',
    descriptionAr: 'سجلات الدخول والخروج دون أي إحداثيات خام.',
    from: 'FROM attendance_logs a JOIN employees e ON a.employee_id = e.id',
    order: 'a.check_in_time DESC, a.id',
    fields: [
      { key: 'id', labelAr: 'الرقم', type: 'number', sql: 'a.id' },
      { key: 'employee', labelAr: 'الموظف', type: 'text', sql: 'e.name' },
      { key: 'check_in_time', labelAr: 'الدخول', type: 'date', sql: 'a.check_in_time' },
      { key: 'check_out_time', labelAr: 'الخروج', type: 'date', sql: 'a.check_out_time' },
      { key: 'method', labelAr: 'الطريقة', type: 'text', sql: 'a.method' },
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'a.status' },
    ],
    filters: [
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'a.status' },
      { key: 'method', labelAr: 'الطريقة', type: 'text', sql: 'a.method' },
      { key: 'from_date', labelAr: 'من تاريخ', type: 'date', sql: 'a.check_in_time', op: '>=' },
      { key: 'to_date', labelAr: 'إلى تاريخ', type: 'date', sql: 'a.check_in_time', op: '<' },
    ],
    defaultFields: ['id', 'employee', 'check_in_time', 'check_out_time', 'method', 'status'],
  },
  {
    key: 'overtime', labelAr: 'العمل الإضافي',
    descriptionAr: 'ساعات الإضافي وقيمتها مع حالة الاعتماد.',
    from: 'FROM overtime_records o JOIN employees e ON o.employee_id = e.id',
    order: 'o.year DESC, o.month DESC, o.id',
    fields: [
      { key: 'id', labelAr: 'الرقم', type: 'number', sql: 'o.id' },
      { key: 'employee', labelAr: 'الموظف', type: 'text', sql: 'e.name' },
      { key: 'date', labelAr: 'التاريخ', type: 'date', sql: 'o.date' },
      { key: 'hours', labelAr: 'الساعات', type: 'number', sql: 'o.hours' },
      { key: 'total_overtime_pay', labelAr: 'القيمة', type: 'number', sql: 'o.total_overtime_pay' },
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'o.status' },
      { key: 'month', labelAr: 'الشهر', type: 'number', sql: 'o.month' },
      { key: 'year', labelAr: 'السنة', type: 'number', sql: 'o.year' },
    ],
    filters: [
      { key: 'status', labelAr: 'الحالة', type: 'text', sql: 'o.status', enumValues: ['pending', 'approved', 'rejected'] },
      { key: 'month', labelAr: 'الشهر', type: 'number', sql: 'o.month' },
      { key: 'year', labelAr: 'السنة', type: 'number', sql: 'o.year' },
    ],
    defaultFields: ['id', 'employee', 'date', 'hours', 'total_overtime_pay', 'status'],
  },
  {
    key: 'expiry', labelAr: 'الانتهاءات',
    descriptionAr: 'تنبيهات الوثائق والصلاحيات القريبة من الانتهاء.',
    from: 'FROM alerts_expiries x JOIN employees e ON x.employee_id = e.id',
    order: 'x.days_until_expiry, x.id',
    fields: [
      { key: 'id', labelAr: 'الرقم', type: 'number', sql: 'x.id' },
      { key: 'employee', labelAr: 'الموظف', type: 'text', sql: 'e.name' },
      { key: 'alert_type', labelAr: 'النوع', type: 'text', sql: 'x.alert_type' },
      { key: 'severity', labelAr: 'الخطورة', type: 'text', sql: 'x.severity' },
      { key: 'entity_value', labelAr: 'التفصيل', type: 'text', sql: 'x.entity_value' },
      { key: 'days_until_expiry', labelAr: 'الأيام المتبقية', type: 'number', sql: 'x.days_until_expiry' },
      { key: 'is_read', labelAr: 'مقروء', type: 'number', sql: 'x.is_read' },
    ],
    filters: [
      { key: 'alert_type', labelAr: 'النوع', type: 'text', sql: 'x.alert_type' },
      { key: 'severity', labelAr: 'الخطورة', type: 'text', sql: 'x.severity', enumValues: ['info', 'warning', 'critical'] },
      { key: 'is_read', labelAr: 'مقروء', type: 'number', sql: 'x.is_read', enumValues: ['0', '1'] },
    ],
    defaultFields: ['id', 'employee', 'alert_type', 'severity', 'entity_value', 'days_until_expiry'],
  },
];

const SCOPE_CLAUSE = '(? IS NULL OR e.entity_id = ?) AND (? IS NULL OR e.branch_id = ?) AND (? IS NULL OR e.id = ?)';

function scopeParams(scope: OrganizationScope): unknown[] {
  return [scope.entityId, scope.entityId, scope.branchId, scope.branchId, scope.employeeId, scope.employeeId];
}

export interface ValidatedSpec {
  dataset: BuilderDataset;
  fields: BuilderField[];
  filters: Array<{ filter: BuilderFilter; value: string | number }>;
  limit: number;
}

function filterValue(raw: unknown, filter: BuilderFilter): string | number {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new ScopeError(400, `قيمة المرشح ${filter.labelAr} غير صالحة`);
  }
  const text = String(raw).trim();
  if (!text || text.length > 64) throw new ScopeError(400, `قيمة المرشح ${filter.labelAr} غير صالحة`);
  if (filter.enumValues && !filter.enumValues.includes(text)) {
    throw new ScopeError(400, `قيمة المرشح ${filter.labelAr} غير مسموحة`);
  }
  if (filter.type === 'number') {
    if (!/^\d+$/.test(text)) throw new ScopeError(400, `${filter.labelAr}: أدخل رقمًا صحيحًا`);
    const value = Number(text);
    if (!Number.isSafeInteger(value)) throw new ScopeError(400, `${filter.labelAr}: الرقم كبير جدًا`);
    return value;
  }
  if (filter.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`))) {
      throw new ScopeError(400, `${filter.labelAr}: استخدم صيغة YYYY-MM-DD`);
    }
    return text;
  }
  return text;
}

/** Validates a builder spec against the allowlist before any SQL is assembled. */
export function validateBuilderSpec(raw: unknown): ValidatedSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScopeError(400, 'مواصفة التقرير غير صالحة');
  }
  const body = raw as Record<string, unknown>;
  const dataset = CUSTOM_DATASETS.find((d) => d.key === body.dataset);
  if (!dataset) throw new ScopeError(400, 'مجموعة البيانات غير مسموحة');

  const requested = body.fields === undefined ? dataset.defaultFields : body.fields;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 12) {
    throw new ScopeError(400, 'اختر حقلًا واحدًا على الأقل وبحد أقصى 12 حقلًا');
  }
  const keys = requested.map((k) => String(k));
  if (new Set(keys).size !== keys.length) throw new ScopeError(400, 'تكرار الحقول غير مسموح');
  const fields = keys.map((key) => {
    const field = dataset.fields.find((f) => f.key === key);
    if (!field) throw new ScopeError(400, `الحقل ${key} غير مسموح في هذه المجموعة`);
    return field;
  });

  const rawFilters = body.filters === undefined ? [] : body.filters;
  if (!Array.isArray(rawFilters) || rawFilters.length > 6) {
    throw new ScopeError(400, 'عدد المرشحات يتجاوز الحد المسموح');
  }
  const filters = rawFilters.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ScopeError(400, 'المرشح غير صالح');
    }
    const entry = item as Record<string, unknown>;
    const filter = dataset.filters.find((f) => f.key === String(entry.key));
    if (!filter) throw new ScopeError(400, `المرشح ${String(entry.key)} غير مسموح`);
    return { filter, value: filterValue(entry.value, filter) };
  });

  const limit = body.limit === undefined ? 200 : Number(body.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new ScopeError(400, 'حد الصفوف يجب أن يكون بين 1 و1000');
  }
  return { dataset, fields, filters, limit };
}

export interface CustomReport {
  dataset: string;
  columns: Array<{ key: string; labelAr: string; type: BuilderFieldType }>;
  rows: unknown[][];
  returned: number;
  truncated: boolean;
  generated_at: string;
}

/**
 * Builds a scoped custom report. Column and filter identifiers come only from
 * CUSTOM_DATASETS; every value is bound as a parameter. No `${}` is spliced
 * into SQL text here — the drift gate stays green without another allowlist.
 */
export async function buildCustomReport(
  db: any, scope: OrganizationScope, raw: unknown, now = new Date(),
): Promise<CustomReport> {
  const spec = validateBuilderSpec(raw);
  const columns = spec.fields.map((f) => ({ key: f.key, labelAr: f.labelAr, type: f.type }));
  const select = spec.fields.map((f) => f.sql + ' AS "' + f.key + '"').join(', ');
  const params: unknown[] = [...scopeParams(scope)];

  let sql = 'SELECT ' + select + ' ' + spec.dataset.from + ' WHERE ' + SCOPE_CLAUSE;
  for (const { filter, value } of spec.filters) {
    const op = filter.op ?? '=';
    if (op === 'like') {
      const escaped = String(value).replace(/[\\%_]/g, '\\$&');
      sql += ' AND ' + filter.sql + " LIKE ? ESCAPE '\\'";
      params.push('%' + escaped + '%');
    } else if (op === '>=') {
      sql += ' AND ' + filter.sql + ' >= ?';
      params.push(typeof value === 'string' ? value + 'T00:00:00Z' : value);
    } else if (op === '<') {
      sql += ' AND ' + filter.sql + ' < ?';
      params.push(typeof value === 'string' ? value + 'T00:00:00Z' : value);
    } else {
      sql += ' AND ' + filter.sql + ' = ?';
      params.push(value);
    }
  }
  sql += ' ORDER BY ' + spec.dataset.order + ' LIMIT ?';
  params.push(spec.limit + 1);

  const found = await db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const truncated = found.length > spec.limit;
  const rows = truncated ? found.slice(0, spec.limit) : found;
  return {
    dataset: spec.dataset.key,
    columns,
    rows: rows.map((row) => spec.fields.map((f) => row[f.key] ?? null)),
    returned: rows.length,
    truncated,
    generated_at: now.toISOString(),
  };
}

/** Metadata only — safe to hand to the UI and to the AI prompt. */
export function reportsSchema() {
  return {
    catalog: REPORT_CATALOG.map(({ aliases: _aliases, ...entry }) => entry),
    datasets: CUSTOM_DATASETS.map((d) => ({
      key: d.key, labelAr: d.labelAr, descriptionAr: d.descriptionAr,
      fields: d.fields.map(({ sql: _sql, ...f }) => f),
      filters: d.filters.map(({ sql: _sql, ...f }) => f),
      defaultFields: d.defaultFields,
    })),
  };
}

/** True only for an explicit request to produce a report/file, not for a question. */
export function asksForGeneratedReport(question: string) {
  const q = question
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه');
  return /(انشئ|انشىء|اصنع|اعمل|جهز|ولد|اعطني|اعط|اريد|احتاج|صدر|نزل|استخرج|اخرج|حمل|اطبع)\s*(لي\s*)?(تقرير|تقريرا|ملف|ملفا|كشف|كشفا|مستند|جدول|csv|pdf)/.test(q);
}
