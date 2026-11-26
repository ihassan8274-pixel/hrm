/**
 * Single source of truth for the desktop navigation.
 *
 * Screens are declared once as a flat list. Sections, quick-access chips,
 * search results, labels and counts are all derived from that list at render
 * time, so adding a screen never means editing several hard-coded JSX arrays.
 * Visibility is still decided by the caller's `canOpen` (the allow() gate),
 * which mirrors server RBAC and fails closed.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Award, BadgeDollarSign, Bell, Briefcase, Building2, Calculator, Car,
  ChevronRight, ClipboardList, Clock, Database, DollarSign, DoorOpen,
  FileBarChart2, FileCheck2, FileSpreadsheet, FileText, Fingerprint,
  GitPullRequest, GraduationCap, HardHat, HeartPulse, HandCoins, History,
  Laptop, Landmark, Layers, LayoutDashboard, LogOut,
  MessageSquare, Network, Plane, Printer, Receipt, Scale, Settings, ShieldAlert,
  ShieldCheck, Sparkles, Stethoscope, Star, Target, TrendingDown, TrendingUp,
  User, UserCheck, UserCog, UserMinus, Users, Wallet,
} from 'lucide-react';

export type View =
  | 'dashboard' | 'saudi' | 'executive_board' | 'approval_workflows'
  | 'grievances' | 'budgeting' | 'rewards_kudos' | 'smart_assets'
  | 'ewa_wellness' | 'hse_safety' | 'exit_interviews' | 'medical'
  | 'wps_audit' | 'talent_9box' | 'fleet' | 'flexible_telework'
  | 'retention_ai' | 'qiwa_contracts' | 'nitaqat_sim' | 'ai_letters'
  | 'disciplinary' | 'clearance' | 'work_injuries' | 'visas'
  | 'provisions' | 'cost_employment' | 'overtime' | 'ai_consultant'
  | 'branches' | 'insurance_catalog' | 'employees' | 'health_certificates'
  | 'import_center' | 'payroll' | 'allowances' | 'audit' | 'loans'
  | 'attendance' | 'reports' | 'extended_reports' | 'presence_gate'
  | 'presence_policies' | 'presence_schedules' | 'presence_exits'
  | 'presence_reports' | 'presence_violations' | 'presence_drift'
  | 'departments' | 'bonuses' | 'leaves' | 'assets' | 'documents'
  | 'forms_center' | 'performance' | 'ess' | 'recruitment' | 'expenses'
  | 'training' | 'promotions' | 'settings' | 'tasks'
  | 'attendance_kiosk' | 'attendance_live' | 'manager_inbox'
  | 'employee_documents' | 'alerts_center' | 'transfers'
  | 'salary_reports' | 'consolidated_reports' | 'systems_hub'
  | 'annual_cycle' | 'users';

export type NavSectionId =
  | 'overview' | 'people' | 'payroll_finance' | 'attendance'
  | 'performance' | 'compliance' | 'operations' | 'ess' | 'admin';

export type NavItem = {
  id: View;
  section: NavSectionId;
  key: string;
  defaultLabel: string;
  icon: LucideIcon;
  /** Shown as a chip above the sections when the user is not searching. */
  quick?: boolean;
  /** Short label used by the quick-access chip (unchanged from the old UI). */
  quickKey?: string;
  quickLabel?: string;
  /** Chip order, independent of the section-grouped declaration order. */
  quickOrder?: number;
  /** Extra search words (for example an English product name). */
  aliases?: string[];
};

export type NavSection = {
  id: NavSectionId;
  titleKey: string;
  defaultTitle: string;
};

export const NAV_SECTIONS: NavSection[] = [
  { id: 'overview', titleKey: 'nav.sec.overview', defaultTitle: 'نظرة عامة وقيادة' },
  { id: 'people', titleKey: 'nav.sec.people', defaultTitle: 'إدارة الموظفين' },
  { id: 'payroll_finance', titleKey: 'nav.sec.payroll_finance', defaultTitle: 'الرواتب والمالية' },
  { id: 'attendance', titleKey: 'nav.sec.attendance', defaultTitle: 'الحضور وأوقات العمل' },
  { id: 'performance', titleKey: 'nav.sec.performance', defaultTitle: 'الأداء والتطوير' },
  { id: 'compliance', titleKey: 'nav.sec.compliance', defaultTitle: 'الامتثال والأنظمة السعودية' },
  { id: 'operations', titleKey: 'nav.sec.operations', defaultTitle: 'العمليات والأدوات الذكية' },
  { id: 'ess', titleKey: 'nav.sec.ess', defaultTitle: 'الخدمة الذاتية' },
  { id: 'admin', titleKey: 'nav.sec.admin', defaultTitle: 'الإدارة والنظام' },
];

export const NAV_ITEMS: NavItem[] = [
  // overview
  { id: 'dashboard', section: 'overview', key: 'nav.dashboard', defaultLabel: 'لوحة التحكم العامة', icon: LayoutDashboard, quick: true, quickKey: 'nav.quick.dashboard', quickLabel: 'لوحة التحكم', quickOrder: 1 },
  { id: 'executive_board', section: 'overview', key: 'nav.executive_board', defaultLabel: 'لوحة القيادة التنفيذية ومجلس الإدارة (ROI)', icon: Award },
  { id: 'reports', section: 'overview', key: 'nav.reports', defaultLabel: 'التقارير والتحليلات', icon: TrendingUp },
  { id: 'extended_reports', section: 'overview', key: 'nav.extended_reports', defaultLabel: 'التقارير التشغيلية المتقدمة', icon: FileText, aliases: ['operational reports'] },
  { id: 'consolidated_reports', section: 'overview', key: 'nav.consolidated_reports', defaultLabel: 'التقارير المجمعة بين الفروع', icon: Network },
  { id: 'budgeting', section: 'overview', key: 'nav.budgeting', defaultLabel: 'ميزانية الموارد وتكاليف التعيين', icon: DollarSign },
  { id: 'cost_employment', section: 'overview', key: 'nav.cost_employment', defaultLabel: 'التكلفة الشاملة (TCOE)', icon: DollarSign, aliases: ['tc oe'] },
  { id: 'provisions', section: 'overview', key: 'nav.provisions', defaultLabel: 'المخصصات (IAS 19)', icon: Calculator, aliases: ['ias'] },
  { id: 'approval_workflows', section: 'overview', key: 'nav.approval_workflows', defaultLabel: 'مسارات وسلاسل الاعتماد (Workflows)', icon: GitPullRequest, aliases: ['workflow'] },
  { id: 'manager_inbox', section: 'overview', key: 'nav.manager_inbox', defaultLabel: 'صندوق اعتماد المدير (جوال)', icon: UserCheck },
  // people
  { id: 'employees', section: 'people', key: 'nav.employees', defaultLabel: 'الموظفين والإقامات', icon: Users, quick: true, quickKey: 'nav.quick.employees', quickLabel: 'الموظفون', quickOrder: 2 },
  { id: 'employee_documents', section: 'people', key: 'nav.employee_documents', defaultLabel: 'ملف الموظف والوثائق', icon: FileText },
  { id: 'departments', section: 'people', key: 'nav.departments', defaultLabel: 'الإدارات والأقسام', icon: Building2 },
  { id: 'branches', section: 'people', key: 'nav.branches', defaultLabel: 'الفروع والمواقع', icon: Building2 },
  { id: 'recruitment', section: 'people', key: 'nav.recruitment', defaultLabel: 'التوظيف (ATS)', icon: Briefcase, aliases: ['ats'] },
  { id: 'transfers', section: 'people', key: 'nav.transfers', defaultLabel: 'نقل الموظف بين الفروع', icon: GitPullRequest },
  { id: 'leaves', section: 'people', key: 'nav.leaves', defaultLabel: 'الإجازات والغياب', icon: Clock },
  { id: 'import_center', section: 'people', key: 'nav.import_center', defaultLabel: 'مركز الاستيراد الموحد (Excel)', icon: FileSpreadsheet, aliases: ['excel'] },
  { id: 'documents', section: 'people', key: 'nav.documents', defaultLabel: 'الأرشيف والوثائق', icon: ShieldCheck },
  { id: 'forms_center', section: 'people', key: 'nav.forms_center', defaultLabel: 'مركز النماذج والطباعة', icon: Printer, quick: true, quickKey: 'nav.quick.forms_center', quickLabel: 'النماذج', quickOrder: 5 },
  // payroll & finance
  { id: 'payroll', section: 'payroll_finance', key: 'nav.payroll', defaultLabel: 'مسير الرواتب (WPS)', icon: BadgeDollarSign, quick: true, quickKey: 'nav.quick.payroll', quickLabel: 'مسير الرواتب', quickOrder: 3, aliases: ['wps'] },
  { id: 'salary_reports', section: 'payroll_finance', key: 'nav.salary_reports', defaultLabel: 'تقارير الرواتب', icon: TrendingUp },
  { id: 'expenses', section: 'payroll_finance', key: 'nav.expenses', defaultLabel: 'المطالبات المالية', icon: Receipt },
  { id: 'loans', section: 'payroll_finance', key: 'nav.loans', defaultLabel: 'القروض والسلف', icon: Landmark },
  { id: 'bonuses', section: 'payroll_finance', key: 'nav.bonuses', defaultLabel: 'المكافآت والجزاءات', icon: HandCoins },
  { id: 'allowances', section: 'payroll_finance', key: 'nav.allowances', defaultLabel: 'تكويد البدلات', icon: Settings },
  { id: 'annual_cycle', section: 'payroll_finance', key: 'nav.annual_cycle', defaultLabel: 'دورة الزيادة السنوية', icon: TrendingUp },
  { id: 'ewa_wellness', section: 'payroll_finance', key: 'nav.ewa_wellness', defaultLabel: 'سحب الراتب عند الطلب (EWA)', icon: Wallet, aliases: ['ewa'] },
  // attendance & presence
  { id: 'attendance', section: 'attendance', key: 'nav.attendance', defaultLabel: 'بيانات الحضور', icon: Clock, quick: true, quickKey: 'nav.quick.attendance', quickLabel: 'الحضور', quickOrder: 4 },
  { id: 'attendance_kiosk', section: 'attendance', key: 'nav.attendance_kiosk', defaultLabel: 'جهاز الحضور (Kiosk)', icon: Clock, aliases: ['kiosk'] },
  { id: 'attendance_live', section: 'attendance', key: 'nav.attendance_live', defaultLabel: 'حضور الفروع الآن', icon: Users },
  { id: 'presence_gate', section: 'attendance', key: 'nav.presence_gate', defaultLabel: 'بوابة التواجد (عيّنة موقع واحدة)', icon: Fingerprint },
  { id: 'presence_exits', section: 'attendance', key: 'nav.presence_exits', defaultLabel: 'طلبات الخروج غير المعتمد', icon: DoorOpen },
  { id: 'presence_reports', section: 'attendance', key: 'nav.presence_reports', defaultLabel: 'تقرير ساعات التواجد', icon: FileBarChart2 },
  { id: 'presence_violations', section: 'attendance', key: 'nav.presence_violations', defaultLabel: 'المخالفات وسلسلة الاعتماد', icon: ShieldCheck },
  { id: 'presence_policies', section: 'attendance', key: 'nav.presence_policies', defaultLabel: 'سياسات ونطاق الفروع', icon: Network },
  { id: 'presence_schedules', section: 'attendance', key: 'nav.presence_schedules', defaultLabel: 'توقيتات العمل', icon: Clock },
  { id: 'presence_drift', section: 'attendance', key: 'nav.presence_drift', defaultLabel: 'تنبيهات انحراف السياسة', icon: Bell },
  { id: 'overtime', section: 'attendance', key: 'nav.overtime', defaultLabel: 'العمل الإضافي ورمضان', icon: Clock },
  { id: 'flexible_telework', section: 'attendance', key: 'nav.flexible_telework', defaultLabel: 'العمل المرن والعمل عن بعد', icon: Laptop },
  { id: 'tasks', section: 'attendance', key: 'nav.tasks', defaultLabel: 'المشاريع والمهام', icon: Target },
  // performance
  { id: 'performance', section: 'performance', key: 'nav.performance', defaultLabel: 'تقييم الأداء', icon: Star },
  { id: 'talent_9box', section: 'performance', key: 'nav.talent_9box', defaultLabel: 'مصفوفة المواهب (9-Box) والتعاقب', icon: Layers, aliases: ['9-box'] },
  { id: 'promotions', section: 'performance', key: 'nav.promotions', defaultLabel: 'المسار الوظيفي', icon: TrendingUp },
  { id: 'training', section: 'performance', key: 'nav.training', defaultLabel: 'التدريب والتطوير', icon: GraduationCap },
  { id: 'rewards_kudos', section: 'performance', key: 'nav.rewards_kudos', defaultLabel: 'التقدير والمكافآت (Kudos & Rewards)', icon: Award, aliases: ['kudos'] },
  { id: 'retention_ai', section: 'performance', key: 'nav.retention_ai', defaultLabel: 'محلل مخاطر التسرب (AI Predictor)', icon: TrendingDown, aliases: ['ai'] },
  { id: 'exit_interviews', section: 'performance', key: 'nav.exit_interviews', defaultLabel: 'محلل مقابلات الخروج (AI Exits)', icon: UserMinus },
  // compliance
  { id: 'saudi', section: 'compliance', key: 'nav.saudi', defaultLabel: 'الامتثال والأنظمة السعودية', icon: Scale },
  { id: 'wps_audit', section: 'compliance', key: 'nav.wps_audit', defaultLabel: 'تدقيق حماية الأجور (SIF & مدد)', icon: FileCheck2, aliases: ['sif'] },
  { id: 'qiwa_contracts', section: 'compliance', key: 'nav.qiwa_contracts', defaultLabel: 'عقود قوى الموحدة', icon: FileText, aliases: ['qiwa'] },
  { id: 'medical', section: 'compliance', key: 'nav.medical', defaultLabel: 'التأمين الطبي ومجلس الضمان (CCHI)', icon: HeartPulse, aliases: ['cchi'] },
  { id: 'insurance_catalog', section: 'compliance', key: 'nav.insurance_catalog', defaultLabel: 'دليل شركات التأمين وفئات التغطية', icon: Layers },
  { id: 'visas', section: 'compliance', key: 'nav.visas', defaultLabel: 'التأشيرات وخدمات مقيم', icon: Plane, aliases: ['muqeem'] },
  { id: 'nitaqat_sim', section: 'compliance', key: 'nav.nitaqat_sim', defaultLabel: 'محاكي نطاقات والتوطين', icon: Target, aliases: ['nitaqat'] },
  { id: 'health_certificates', section: 'compliance', key: 'nav.health_certificates', defaultLabel: 'الشهادات الصحية والمتابعة (بلدي)', icon: Stethoscope, aliases: ['balady'] },
  { id: 'disciplinary', section: 'compliance', key: 'nav.disciplinary', defaultLabel: 'لائحة الجزاءات والتحقيق', icon: ShieldAlert },
  { id: 'grievances', section: 'compliance', key: 'nav.grievances', defaultLabel: 'التظلمات ولجان التحقيق والإنذارات (المادة 209)', icon: Scale },
  { id: 'work_injuries', section: 'compliance', key: 'nav.work_injuries', defaultLabel: 'إصابات العمل (GOSI)', icon: HeartPulse, aliases: ['gosi'] },
  { id: 'clearance', section: 'compliance', key: 'nav.clearance', defaultLabel: 'إخلاء الطرف وإبراء الذمة', icon: UserCheck },
  { id: 'hse_safety', section: 'compliance', key: 'nav.hse_safety', defaultLabel: 'الصحة والسلامة وتفتيش المنشآت (HSE)', icon: HardHat, aliases: ['hse'] },
  // operations
  { id: 'assets', section: 'operations', key: 'nav.assets', defaultLabel: 'الأصول والعهدة', icon: Wallet },
  { id: 'smart_assets', section: 'operations', key: 'nav.smart_assets', defaultLabel: 'الأصول والعهد الذكية (QR Handover)', icon: Laptop, aliases: ['qr'] },
  { id: 'fleet', section: 'operations', key: 'nav.fleet', defaultLabel: 'أسطول المركبات والمخالفات', icon: Car },
  { id: 'systems_hub', section: 'operations', key: 'nav.systems_hub', defaultLabel: 'بوابة أنظمة معصوب حليب', icon: Layers },
  { id: 'alerts_center', section: 'operations', key: 'nav.alerts_center', defaultLabel: 'مركز التنبيهات', icon: Bell },
  { id: 'ai_letters', section: 'operations', key: 'nav.ai_letters', defaultLabel: 'استوديو الخطابات (AI)', icon: Sparkles },
  { id: 'ai_consultant', section: 'operations', key: 'nav.ai_consultant', defaultLabel: 'المستشار القانوني الذكي', icon: Sparkles },
  // self service / admin
  { id: 'ess', section: 'ess', key: 'nav.ess', defaultLabel: 'بوابة الموظف (ESS)', icon: User, aliases: ['employee self service'] },
  { id: 'users', section: 'admin', key: 'nav.users', defaultLabel: 'إدارة المستخدمين', icon: UserCog },
  { id: 'audit', section: 'admin', key: 'nav.audit', defaultLabel: 'سجل العمليات', icon: History },
  { id: 'settings', section: 'admin', key: 'nav.settings', defaultLabel: 'بيانات المنشأة واللوائح', icon: Settings },
];

export type BuiltNavSection = NavSection & {
  items: NavItem[];
  isCollapsed: boolean;
};

export type QuickAccessItem = {
  id: View;
  key: string;
  defaultLabel: string;
};

export type BuiltNavigation = {
  sections: BuiltNavSection[];
  quick: QuickAccessItem[];
  labelFor: (id: string) => string;
  sectionOf: (id: string) => NavSection | undefined;
  total: number;
};

export type NavBuildOptions = {
  canOpen: (id: string) => boolean;
  t: (key: string, fallback: string) => string;
  query?: string;
  collapsed?: Record<string, boolean>;
};

function matches(item: NavItem, query: string, t: NavBuildOptions['t']): boolean {
  const haystack = [
    t(item.key, item.defaultLabel),
    item.defaultLabel,
    item.id,
    ...(item.aliases || []),
  ].join(' ').toLocaleLowerCase();
  return haystack.includes(query);
}

/** Every section starts closed, so the menu is compact until the user picks one. */
export function defaultCollapsedSections(): Record<string, boolean> {
  return Object.fromEntries(NAV_SECTIONS.map(section => [section.titleKey, true]));
}

/** Accordion: opening one section closes every other section. */
export function openNavSection(
  collapsed: Record<string, boolean>,
  titleKey?: string,
): Record<string, boolean> {
  const next = defaultCollapsedSections();
  if (titleKey) next[titleKey] = false;
  return next;
}

/** Section key for a view id, used by the shell before its early returns. */
export function navSectionTitleKeyFor(id: string): string | undefined {
  const item = NAV_ITEMS.find(candidate => candidate.id === id);
  return item && NAV_SECTIONS.find(section => section.id === item.section)?.titleKey;
}

/** Clicking an open section closes it; clicking a closed one opens it alone. */
export function toggleNavSection(
  collapsed: Record<string, boolean>,
  titleKey: string,
): Record<string, boolean> {
  const isOpen = collapsed[titleKey] === false;
  return openNavSection(collapsed, isOpen ? undefined : titleKey);
}

/** Derive everything the sidebar renders from the flat declaration above. */
export function buildNavigation({
  canOpen, t, query = '', collapsed = {},
}: NavBuildOptions): BuiltNavigation {
  const q = query.trim().toLocaleLowerCase();
  const sections: BuiltNavSection[] = NAV_SECTIONS.map(section => ({
    ...section,
    items: NAV_ITEMS.filter(item => item.section === section.id && canOpen(item.id))
      .filter(item => !q || matches(item, q, t)),
    isCollapsed: !q && !!collapsed[section.titleKey],
  })).filter(section => section.items.length > 0);

  const itemById = new Map(NAV_ITEMS.map(item => [item.id, item]));
  const sectionById = new Map(NAV_SECTIONS.map(section => [section.id, section]));
  return {
    sections,
    quick: q ? [] : NAV_ITEMS.filter(item => item.quick && canOpen(item.id))
      .sort((a, b) => (a.quickOrder ?? 999) - (b.quickOrder ?? 999))
      .map(item => ({
        id: item.id,
        key: item.quickKey || item.key,
        defaultLabel: item.quickLabel || item.defaultLabel,
      })),
    labelFor: (id) => {
      const item = itemById.get(id as View);
      return item ? t(item.key, item.defaultLabel) : '';
    },
    sectionOf: (id) => {
      const item = itemById.get(id as View);
      return item ? sectionById.get(item.section) : undefined;
    },
    total: NAV_ITEMS.filter(item => canOpen(item.id)).length,
  };
}
