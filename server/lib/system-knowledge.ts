/**
 * Descriptive map of the product for the AI assistant.
 *
 * This is documentation, not data: it contains no employee rows, no counts,
 * no database columns and no file paths. It lets the assistant answer "where
 * do I find X / who can do Y" without inventing a screen or a permission.
 * The nav id is the same id used by src/lib/navigation.ts.
 */

export interface SystemModule {
  navId: string;
  titleAr: string;
  sectionAr: string;
  descriptionAr: string;
  roles: string[];
  /** Descriptive search phrases only — never a DB identifier or a new screen name. */
  searchTermsAr?: string[];
}

export const SYSTEM_MODULES: SystemModule[] = [
  { navId: 'dashboard', titleAr: 'لوحة التحكم العامة', sectionAr: 'نظرة عامة وقيادة', descriptionAr: 'مؤشرات مجمّعة للحضور والرواتب والتكاليف داخل نطاق المستخدم.', roles: ['admin', 'hr_manager', 'finance', 'branch_manager'] },
  { navId: 'executive_board', titleAr: 'لوحة القيادة التنفيذية', sectionAr: 'نظرة عامة وقيادة', descriptionAr: 'قراءات توجيهية ومؤشرات أداء مجمّعة للإدارة العليا.', roles: ['admin', 'hr_manager'] },
  { navId: 'reports_hub', titleAr: 'مركز التقارير والمساعد الذكي', sectionAr: 'نظرة عامة وقيادة', descriptionAr: 'دليل التقارير المعتمدة، باني تقارير بحقول ومرشحات مسموحة، ومساعد يجيب من قيم مجمّعة فقط.', roles: ['admin', 'hr_manager'], searchTermsAr: ['دليل التقارير', 'باني التقارير', 'المساعد الذكي'] },
  { navId: 'extended_reports', titleAr: 'التقارير التشغيلية المتقدمة', sectionAr: 'نظرة عامة وقيادة', descriptionAr: 'ستة تقارير تشغيلية مع تصدير CSV داخل النطاق المؤسسي.', roles: ['admin', 'hr_manager', 'finance'] },
  { navId: 'salary_reports', titleAr: 'تقارير الرواتب', sectionAr: 'الرواتب والمالية', descriptionAr: 'تقارير الرواتب على مستوى الشركة والفرع وكشوف الراتب والمخصصات.', roles: ['admin', 'hr_manager', 'finance'], searchTermsAr: ['كشف الراتب', 'رواتب الفرع'] },
  { navId: 'employees', titleAr: 'الموظفون والإقامات', sectionAr: 'إدارة الموظفين', descriptionAr: 'ملفات الموظفين ووثائقهم وإقاماتهم داخل النطاق المسموح.', roles: ['admin', 'hr_manager', 'branch_manager'] },
  { navId: 'branches', titleAr: 'الفروع والمواقع', sectionAr: 'إدارة الموظفين', descriptionAr: 'تعريف الفروع وإحداثيات مركز الفرع على الخادم فقط، دون بث موقع حي.', roles: ['admin', 'hr_manager'] },
  { navId: 'leaves', titleAr: 'الإجازات والغياب', sectionAr: 'إدارة الموظفين', descriptionAr: 'طلبات الإجازات وأرصدتها واعتماداتها.', roles: ['admin', 'hr_manager', 'branch_manager'] },
  { navId: 'payroll', titleAr: 'مسير الرواتب (WPS)', sectionAr: 'الرواتب والمالية', descriptionAr: 'إعداد المسير وحالة الاعتماد والدفع؛ المسير يبقى مسودة حتى الاعتماد.', roles: ['admin', 'hr_manager', 'finance'], searchTermsAr: ['اعتماد المسير', 'حالة الاعتماد', 'حالة الدفع', 'دفع الرواتب'] },
  { navId: 'overtime', titleAr: 'العمل الإضافي', sectionAr: 'الرواتب والمالية', descriptionAr: 'ساعات الإضافي؛ يُحتسب المعتمد فقط ويُمنع الدفع المزدوج.', roles: ['admin', 'hr_manager'] },
  { navId: 'attendance', titleAr: 'بيانات الحضور', sectionAr: 'الحضور وأوقات العمل', descriptionAr: 'سجلات الدخول والخروج والتعديلات اليدوية داخل النطاق.', roles: ['admin', 'hr_manager', 'branch_manager'] },
  { navId: 'presence_gate', titleAr: 'بوابة التواجد', sectionAr: 'الحضور وأوقات العمل', descriptionAr: 'عيّنة موقع واحدة عند انتهاء التصريح؛ لا بث موقع ولا خريطة حية ولا تخزين إحداثيات خام على الجهاز.', roles: ['admin', 'hr_manager', 'branch_manager', 'employee_ess'], searchTermsAr: ['انتهاء التصريح'] },
  { navId: 'presence_exits', titleAr: 'طلبات الخروج غير المعتمد', sectionAr: 'الحضور وأوقات العمل', descriptionAr: 'طلبات مرتبطة بسجلات الموافقات، ويُخصم وقتها من ساعات التواجد فقط.', roles: ['admin', 'hr_manager', 'branch_manager'] },
  { navId: 'presence_reports', titleAr: 'تقارير التواجد والانحراف', sectionAr: 'الحضور وأوقات العمل', descriptionAr: 'بلاغات الانحراف تُرسل للموارد البشرية ومدير النظام دون قفل تلقائي أو خصم راتب.', roles: ['admin', 'hr_manager', 'branch_manager', 'employee_ess'] },
  { navId: 'training', titleAr: 'التدريب', sectionAr: 'الأداء والتطوير', descriptionAr: 'الدورات والتسجيلات وشهادات الإتمام المستخدمة في الترقيات.', roles: ['admin', 'hr_manager'] },
  { navId: 'promotions', titleAr: 'الترقيات', sectionAr: 'الأداء والتطوير', descriptionAr: 'تتطلب تقييمًا وتسجيلًا تدريبيًا بشهادة غير فارغة وحدًا أدنى للتقييم.', roles: ['admin', 'hr_manager'] },
  { navId: 'saudi', titleAr: 'الامتثال السعودي', sectionAr: 'الامتثال والأنظمة السعودية', descriptionAr: 'مؤشرات نظام العمل والتأمينات وحماية الأجور؛ نسبة الضريبة صفر في هذا النظام.', roles: ['admin', 'hr_manager', 'finance'] },
  { navId: 'ai_consultant', titleAr: 'المستشار القانوني الذكي', sectionAr: 'العمليات والأدوات الذكية', descriptionAr: 'استشارات نظام العمل السعودي واللوائح التنفيذية.', roles: ['admin', 'hr_manager'] },
  { navId: 'forms_center', titleAr: 'مركز النماذج والطباعة', sectionAr: 'العمليات والأدوات الذكية', descriptionAr: 'قوالب المستندات الرسمية وإصدارها بخط عربي ثابت.', roles: ['admin', 'hr_manager', 'branch_manager'] },
  { navId: 'ess', titleAr: 'بوابة الخدمة الذاتية', sectionAr: 'الخدمة الذاتية', descriptionAr: 'الموظف يرى نفسه فقط وينفذ طلباته الخاصة؛ لا يرى بيانات زملائه.', roles: ['employee_ess'] },
  { navId: 'alerts_center', titleAr: 'مركز التنبيهات', sectionAr: 'الإدارة والنظام', descriptionAr: 'تنبيهات انتهاء الوثائق؛ الإشعارات غير الموجّهة للمدير والموارد البشرية فقط.', roles: ['admin', 'hr_manager', 'finance', 'branch_manager'] },
  { navId: 'settings', titleAr: 'إعدادات النظام', sectionAr: 'الإدارة والنظام', descriptionAr: 'إعدادات المنشأة والهوية البصرية والوضع الليلي داخل النظام فقط.', roles: ['admin', 'hr_manager'] },
];

/** Metadata only — safe for the prompt and for the UI. */
export function systemKnowledge() {
  return SYSTEM_MODULES.map(({ navId, titleAr, sectionAr, descriptionAr, roles, searchTermsAr }) => ({
    navId, titleAr, sectionAr, descriptionAr, roles,
    ...(searchTermsAr ? { searchTermsAr } : {}),
  }));
}

const STOP_WORDS = new Set([
  'ما', 'ماذا', 'فرق', 'بين', 'كيف', 'اين', 'هل', 'عن', 'في', 'من', 'الى', 'على',
  'مع', 'هذا', 'هذه', 'ذي', 'تي', 'شاشه', 'شاشات', 'نظام', 'مكان', 'اعرف', 'اجد', 'تجد',
]);

function normalizeArabic(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ');
}

function normalizePhrase(value: string) {
  return normalizeArabic(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/^[وبف]+/, '').replace(/^ال/, ''))
    .join(' ');
}

function screenWords(value: string) {
  return new Set(
    normalizePhrase(value)
      .split(' ')
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

/** Deterministic screen matching; every result is an existing SYSTEM_MODULES entry. */
export function matchingScreens(question: string) {
  const q = normalizePhrase(question);
  if (q.length < 2) return [];
  const questionWords = screenWords(question);
  if (questionWords.size === 0) return [];

  const scored = SYSTEM_MODULES.map((module) => {
    const terms = [
      module.titleAr.replace(/\([^)]*\)/g, ''),
      ...(module.searchTermsAr ?? []),
    ].map(normalizePhrase).filter(Boolean);
    const extraWords = screenWords([
      module.titleAr, module.sectionAr, module.descriptionAr, module.navId.replace(/[_-]+/g, ' '),
    ].join(' '));
    const termWords = new Set(terms.flatMap((term) => term.split(' ')));

    let score = 0;
    if (terms[0] && q.includes(terms[0])) score += 10;
    for (const term of terms.slice(1)) if (q.includes(term)) score += 6;
    for (const word of questionWords) {
      if (termWords.has(word)) score += 3;
      if (extraWords.has(word)) score += 1;
    }
    return { module, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ module }) => ({
    navId: module.navId,
    titleAr: module.titleAr,
    sectionAr: module.sectionAr,
    roles: module.roles,
  }));
}
