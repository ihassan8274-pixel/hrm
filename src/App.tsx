import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
  Users, 
  Building2, 
  LayoutDashboard, 
  BadgeDollarSign, 
  Menu, 
  X,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  History,
  ShieldCheck,
  HandCoins,
  Settings,
  Landmark,
  Clock,
  Star,
  Wallet,
  FileText,
  User,
  Briefcase,
  Receipt,
  GraduationCap,
  TrendingUp,
  Target,
  ClipboardList,
  Scale,
  Plane,
  Calculator,
  DollarSign,
  Sparkles,
  HeartPulse,
  FileSpreadsheet,
  Stethoscope,
  ShieldAlert,
  UserCheck,
  Car,
  FileCheck2,
  Layers,
  Laptop,
  TrendingDown,
  Award,
  HardHat,
  GitPullRequest,
  Network,
  UserMinus,
  Bot,
  MessageSquare,
  Printer,
  Database,
  Globe,
  Bell,
  UserCog,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Branch, Employee, PayrollRecord, Stats, AppSettings } from './types';
import { useLanguage } from './context/LanguageContext';
import { LanguageSwitcher } from './components/LanguageSwitcher';
// Modals are opened on demand. Keeping these eager would drag the ~594KB
// jsPDF/html2canvas chunk into the initial page load for every user, even
// though only a few ever export a PDF.
const PdfExportModal = lazy(() => import('./components/PdfExportModal').then(m => ({ default: m.PdfExportModal })));
const BackupRestoreModal = lazy(() => import('./components/BackupRestoreModal').then(m => ({ default: m.BackupRestoreModal })));
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { MustChangePasswordView } from './components/MustChangePasswordView';
import SessionIdleGuard from './components/SessionIdleGuard';
import ErrorBoundary from './components/ErrorBoundary';

// Components
// NotificationBell renders in the header on every screen, so it stays eager.
import NotificationBell from './components/NotificationBell';

// Every routed screen is code-split. These were all static imports, which
// pulled 58 screens plus jsPDF/html2canvas/recharts into one ~3.4MB bundle that
// every user downloaded on first paint. The heavy export/PDF libraries are
// isolated further by manualChunks in vite.config.ts.
const DashboardView = lazy(() => import('./components/DashboardView'));
const SaudiComplianceView = lazy(() => import('./components/SaudiComplianceView'));
const BranchesView = lazy(() => import('./components/BranchesView'));
const EmployeesView = lazy(() => import('./components/EmployeesView'));
const HealthCertificatesView = lazy(() => import('./components/HealthCertificatesView'));
const ImportCenterView = lazy(() => import('./components/ImportCenterView'));
const PayrollView = lazy(() => import('./components/PayrollView'));
const AllowanceTypesView = lazy(() => import('./components/AllowanceTypesView'));
const AuditLogsView = lazy(() => import('./components/AuditLogsView'));
const DepartmentsView = lazy(() => import('./components/DepartmentsView'));
const BonusesView = lazy(() => import('./components/BonusesView'));
const LoansView = lazy(() => import('./components/LoansView'));
const AttendanceView = lazy(() => import('./components/AttendanceView'));
const ReportsView = lazy(() => import('./components/ReportsView'));
const ExtendedReportsView = lazy(() => import('./components/ExtendedReportsView'));
const LeavesView = lazy(() => import('./components/LeavesView'));
const AssetsView = lazy(() => import('./components/AssetsView'));
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const PerformanceView = lazy(() => import('./components/PerformanceView'));
const ESSView = lazy(() => import('./components/ESSView'));
const AnnualCycleView = lazy(() => import('./components/AnnualCycleView'));
const RecruitmentView = lazy(() => import('./components/RecruitmentView'));
const ExpensesView = lazy(() => import('./components/ExpensesView'));
const TrainingView = lazy(() => import('./components/TrainingView'));
const PromotionsView = lazy(() => import('./components/PromotionsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const TasksView = lazy(() => import('./components/TasksView'));
const VisasMuqeemView = lazy(() => import('./components/VisasMuqeemView'));
const AccountingProvisionsView = lazy(() => import('./components/AccountingProvisionsView'));
const TotalCostEmploymentView = lazy(() => import('./components/TotalCostEmploymentView'));
const OvertimeRamadanView = lazy(() => import('./components/OvertimeRamadanView'));
const LaborLawAiConsultantView = lazy(() => import('./components/LaborLawAiConsultantView'));
const QiwaContractsView = lazy(() => import('./components/QiwaContractsView'));
const DisciplinaryMatrixView = lazy(() => import('./components/DisciplinaryMatrixView'));
const ExitClearanceView = lazy(() => import('./components/ExitClearanceView'));
const WorkInjuriesView = lazy(() => import('./components/WorkInjuriesView'));
const NitaqatSimulatorView = lazy(() => import('./components/NitaqatSimulatorView'));
const AiHrLetterStudioView = lazy(() => import('./components/AiHrLetterStudioView'));
const MedicalInsuranceView = lazy(() => import('./components/MedicalInsuranceView'));
const InsuranceCatalogView = lazy(() => import('./components/InsuranceCatalogView'));
const WpsAuditSifView = lazy(() => import('./components/WpsAuditSifView'));
const TalentMatrix9BoxView = lazy(() => import('./components/TalentMatrix9BoxView'));
const FleetManagementView = lazy(() => import('./components/FleetManagementView'));
const FlexibleWorkTeleworkView = lazy(() => import('./components/FlexibleWorkTeleworkView'));
const AiRetentionPredictorView = lazy(() => import('./components/AiRetentionPredictorView'));
const EarnedWageAccessView = lazy(() => import('./components/EarnedWageAccessView'));
const HseSafetyComplianceView = lazy(() => import('./components/HseSafetyComplianceView'));
const ExecutiveBoardroomView = lazy(() => import('./components/ExecutiveBoardroomView'));
const ExitInterviewAnalyticsView = lazy(() => import('./components/ExitInterviewAnalyticsView'));
const ApprovalWorkflowsView = lazy(() => import('./components/ApprovalWorkflowsView'));
const GrievancesView = lazy(() => import('./components/GrievancesView').then(m => ({ default: m.GrievancesView })));
const BudgetingView = lazy(() => import('./components/BudgetingView').then(m => ({ default: m.BudgetingView })));
const RewardsKudosView = lazy(() => import('./components/RewardsKudosView').then(m => ({ default: m.RewardsKudosView })));
const SmartAssetsView = lazy(() => import('./components/SmartAssetsView').then(m => ({ default: m.SmartAssetsView })));
const AttendanceKioskView = lazy(() => import('./components/AttendanceKioskView'));
const BranchLiveAttendanceView = lazy(() => import('./components/BranchLiveAttendanceView'));
const ManagerInboxView = lazy(() => import('./components/ManagerInboxView'));
const EmployeeDocumentsView = lazy(() => import('./components/EmployeeDocumentsView'));
const AlertsCenterView = lazy(() => import('./components/AlertsCenterView'));
const TransfersView = lazy(() => import('./components/TransfersView'));
const SalaryReportsView = lazy(() => import('./components/SalaryReportsView'));
const ConsolidatedBranchesView = lazy(() => import('./components/ConsolidatedBranchesView'));
const SystemsHubView = lazy(() => import('./components/SystemsHubView'));
const FormsCenterView = lazy(() => import('./components/FormsCenterView').then(m => ({ default: m.FormsCenterView })));
const UsersView = lazy(() => import('./components/UsersView'));
// Opened on demand from the floating launcher, so it must stay lazy too.
const AiHrCopilotModal = lazy(() => import('./components/AiHrCopilotModal'));

type View = 
  | 'dashboard' 
  | 'saudi' 
  | 'executive_board'
  | 'approval_workflows'
  | 'grievances'
  | 'budgeting'
  | 'rewards_kudos'
  | 'smart_assets'
  | 'ewa_wellness'
  | 'hse_safety'
  | 'exit_interviews'
  | 'medical'
  | 'wps_audit'
  | 'talent_9box'
  | 'fleet'
  | 'flexible_telework'
  | 'retention_ai'
  | 'qiwa_contracts' 
  | 'nitaqat_sim' 
  | 'ai_letters' 
  | 'disciplinary' 
  | 'clearance' 
  | 'work_injuries' 
  | 'visas' 
  | 'provisions' 
  | 'cost_employment' 
  | 'overtime' 
  | 'ai_consultant' 
  | 'branches'
  | 'insurance_catalog'
  | 'employees'
  | 'health_certificates'
  | 'import_center'
  | 'payroll'
  | 'allowances' 
  | 'audit' 
  | 'loans' 
  | 'attendance' 
  | 'reports' 
  | 'extended_reports'
  | 'departments' 
  | 'bonuses' 
  | 'leaves' 
  | 'assets' 
  | 'documents'
  | 'forms_center' 
  | 'performance' 
  | 'ess' 
  | 'recruitment' 
  | 'expenses' 
  | 'training' 
  | 'promotions' 
  | 'settings' 
  | 'tasks'
  | 'attendance_kiosk'
  | 'attendance_live'
  | 'manager_inbox'
  | 'employee_documents'
  | 'alerts_center'
  | 'transfers'
  | 'salary_reports'
  | 'consolidated_reports'
  | 'systems_hub'
  | 'annual_cycle'
  | 'users';

/** Shown while a lazily-loaded screen chunk is in flight. */
function ScreenLoader() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent" />
        <span className="text-sm text-slate-500">جارٍ تحميل الشاشة…</span>
      </div>
    </div>
  );
}

// Inner App component that requires authentication
function AuthenticatedApp() {
  const { t, language, direction } = useLanguage();
  const { user, logout, hasRole, isLoading } = useAuth();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [navSearch, setNavSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const navSearchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses the menu search from anywhere in the app. The search stays
  // behind the same allow() gate as the buttons, so it can never reveal a screen
  // the current role cannot open.
  useEffect(() => {
    const onMenuShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSidebarOpen(true);
        requestAnimationFrame(() => navSearchRef.current?.focus());
      }
      if (event.key === 'Escape' && document.activeElement === navSearchRef.current) {
        setNavSearch('');
        navSearchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onMenuShortcut);
    return () => window.removeEventListener('keydown', onMenuShortcut);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (document.activeElement === navSearchRef.current) return;
      if (event.key === 'Escape' && !window.matchMedia('(min-width: 768px)').matches) {
        setIsSidebarOpen(false);
        sidebarToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSidebarOpen]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnMobile = () => { if (!desktop.matches) setIsSidebarOpen(false); };
    desktop.addEventListener('change', closeOnMobile);
    return () => desktop.removeEventListener('change', closeOnMobile);
  }, []);
  const [showCopilot, setShowCopilot] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // A = الوضع النهاري، B = الوضع الليلي. الهوية C ثابتة في كلا الوضعين.
  const [isNight, setIsNight] = useState(() => {
    const saved = localStorage.getItem('app_theme');
    if (saved) return saved === 'night';
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    // شاشة الدخول/التسجيل ليلية دائماً، ولا نكتب app_theme قبل الدخول حتى يبقى اختيار المستخدم محفوظاً.
    const night = user ? isNight : true;
    root.classList.toggle('dark', night);
    root.setAttribute('data-theme', night ? 'night' : 'day');
    if (user) localStorage.setItem('app_theme', isNight ? 'night' : 'day');
  }, [isNight, user]);

  const [settings, setSettings] = useState<AppSettings>({
    org_name: 'شركة مطعم معصوب حليب',
    country: 'المملكة العربية السعودية',
    currency: 'SAR',
    tax_rate: 0,
    insurance_emp_rate: 9.75,
    insurance_comp_rate: 11.75
  });
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<AppSettings>(settings);

  // All hooks must run unconditionally and in the same order on every render, so the settings
  // fetch below is hoisted above the early returns (loading spinner / not logged in).
  // `isLoggedIn` is a primitive dependency: it keeps a stable identity across renders, whereas
  // depending on `user` (an object) could re-fire the fetch on every render. The guard also
  // keeps the call after login, since before login there is no token and /api/settings -> 401.
  const isLoggedIn = !!user;

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.org_name) {
          const loadedSettings = {
            org_name: data.org_name || 'شركة المسار الرقمي للحلول المتكاملة',
            country: data.country || 'المملكة العربية السعودية',
            currency: data.currency || 'SAR',
            tax_rate: Number(data.tax_rate) || 0,
            insurance_emp_rate: Number(data.insurance_emp_rate) || 9.75,
            insurance_comp_rate: Number(data.insurance_comp_rate) || 11.75
          };
          setSettings(loadedSettings);
          setTempSettings(loadedSettings);
        }
      })
      .catch(err => console.error("App settings error:", err));
  }, [isLoggedIn]);

  // Single screen/role matrix for the shell (sidebar + header actions). It mirrors the
  // server's RBAC policy, so a control whose API call is classified is never rendered for a
  // role the endpoint would answer with 403.
  const role = user?.role || '';
  const allow = (id: string) => {
    if (!role) return false; // no user/role must not grant any screen
    // Account administration answers 403 for every role but admin, so the
    // screen must not appear for hr_manager even though it owns every other.
    if (id === 'users') return role === 'admin';
    if (role === 'admin' || role === 'hr_manager') return true;
    if (role === 'employee_ess') return id === 'ess';
    if (role === 'finance') return ['dashboard', 'payroll', 'wps_audit', 'loans', 'bonuses', 'expenses', 'allowances', 'reports', 'salary_reports', 'consolidated_reports', 'provisions', 'cost_employment', 'budgeting', 'annual_cycle', 'extended_reports'].includes(id);
    if (role === 'branch_manager') return ['dashboard', 'attendance', 'attendance_kiosk', 'attendance_live', 'employees', 'leaves', 'approval_workflows', 'manager_inbox', 'ess', 'alerts_center', 'forms_center', 'annual_cycle'].includes(id);
    // Fail-closed: an unrecognised role must never inherit every screen.
    return false;
  };
  // "الإعدادات السريعة" writes PUT /api/settings -> settings.manage (admin, hr_manager).
  const canManageSettings = allow('settings');
  // "تصدير PDF" reads /api/saudi/compliance-summary -> saudi.compliance. finance holds that
  // permission even though the compliance screen id is not part of finance's sidebar list.
  const canExportCompliancePdf = allow('saudi') || role === 'finance';

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // The bootstrap admin runs on a documented default password until it is
  // changed. Nothing else in the app renders until that happens, so the default
  // is never usable beyond this screen.
  if (user.must_change_password) {
    return <MustChangePasswordView />;
  }

  const handleUpdateSettings = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tempSettings)
    });
    setSettings(tempSettings);
    setIsEditingSettings(false);
  };

  // Specialised sections keep all 64 screens reachable without a 24-item first
  // section. Ids, labels, icons and the allow() gate are unchanged.
  const navSections = [
    {
      titleKey: 'nav.sec.overview',
      defaultTitle: 'نظرة عامة وقيادة',
      items: [
        { id: 'dashboard', key: 'nav.dashboard', defaultLabel: 'لوحة التحكم العامة', icon: LayoutDashboard },
        { id: 'executive_board', key: 'nav.executive_board', defaultLabel: 'لوحة القيادة التنفيذية ومجلس الإدارة (ROI)', icon: Award },
        { id: 'reports', key: 'nav.reports', defaultLabel: 'التقارير والتحليلات', icon: TrendingUp },
        { id: 'extended_reports', key: 'nav.extended_reports', defaultLabel: 'التقارير التشغيلية المتقدمة', icon: FileText },
        { id: 'consolidated_reports', key: 'nav.consolidated_reports', defaultLabel: 'التقارير المجمعة بين الفروع', icon: Network },
        { id: 'budgeting', key: 'nav.budgeting', defaultLabel: 'ميزانية الموارد وتكاليف التعيين', icon: DollarSign },
        { id: 'cost_employment', key: 'nav.cost_employment', defaultLabel: 'التكلفة الشاملة (TCOE)', icon: DollarSign },
        { id: 'provisions', key: 'nav.provisions', defaultLabel: 'المخصصات (IAS 19)', icon: Calculator },
        { id: 'approval_workflows', key: 'nav.approval_workflows', defaultLabel: 'مسارات وسلاسل الاعتماد (Workflows)', icon: GitPullRequest },
        { id: 'manager_inbox', key: 'nav.manager_inbox', defaultLabel: 'صندوق اعتماد المدير (جوال)', icon: UserCheck },
      ]
    },
    {
      titleKey: 'nav.sec.people',
      defaultTitle: 'إدارة الموظفين',
      items: [
        { id: 'employees', key: 'nav.employees', defaultLabel: 'الموظفين والإقامات', icon: Users },
        { id: 'employee_documents', key: 'nav.employee_documents', defaultLabel: 'ملف الموظف والوثائق', icon: FileText },
        { id: 'departments', key: 'nav.departments', defaultLabel: 'الإدارات والأقسام', icon: Building2 },
        { id: 'branches', key: 'nav.branches', defaultLabel: 'الفروع والمواقع', icon: Building2 },
        { id: 'recruitment', key: 'nav.recruitment', defaultLabel: 'التوظيف (ATS)', icon: Briefcase },
        { id: 'transfers', key: 'nav.transfers', defaultLabel: 'نقل الموظف بين الفروع', icon: GitPullRequest },
        { id: 'leaves', key: 'nav.leaves', defaultLabel: 'الإجازات والغياب', icon: Clock },
        { id: 'import_center', key: 'nav.import_center', defaultLabel: 'مركز الاستيراد الموحد (Excel)', icon: FileSpreadsheet },
        { id: 'documents', key: 'nav.documents', defaultLabel: 'الأرشيف والوثائق', icon: ShieldCheck },
        { id: 'forms_center', key: 'nav.forms_center', defaultLabel: 'مركز النماذج والطباعة', icon: Printer },
      ]
    },
    {
      titleKey: 'nav.sec.payroll_finance',
      defaultTitle: 'الرواتب والمالية',
      items: [
        { id: 'payroll', key: 'nav.payroll', defaultLabel: 'مسير الرواتب (WPS)', icon: BadgeDollarSign },
        { id: 'salary_reports', key: 'nav.salary_reports', defaultLabel: 'تقارير الرواتب', icon: TrendingUp },
        { id: 'expenses', key: 'nav.expenses', defaultLabel: 'المطالبات المالية', icon: Receipt },
        { id: 'loans', key: 'nav.loans', defaultLabel: 'القروض والسلف', icon: Landmark },
        { id: 'bonuses', key: 'nav.bonuses', defaultLabel: 'المكافآت والجزاءات', icon: HandCoins },
        { id: 'allowances', key: 'nav.allowances', defaultLabel: 'تكويد البدلات', icon: Settings },
        { id: 'annual_cycle', key: 'nav.annual_cycle', defaultLabel: 'دورة الزيادة السنوية', icon: TrendingUp },
        { id: 'ewa_wellness', key: 'nav.ewa_wellness', defaultLabel: 'سحب الراتب عند الطلب (EWA)', icon: Wallet },
      ]
    },
    {
      titleKey: 'nav.sec.attendance',
      defaultTitle: 'الحضور وأوقات العمل',
      items: [
        { id: 'attendance', key: 'nav.attendance', defaultLabel: 'بيانات الحضور', icon: Clock },
        { id: 'attendance_kiosk', key: 'nav.attendance_kiosk', defaultLabel: 'جهاز الحضور (Kiosk)', icon: Clock },
        { id: 'attendance_live', key: 'nav.attendance_live', defaultLabel: 'حضور الفروع الآن', icon: Users },
        { id: 'overtime', key: 'nav.overtime', defaultLabel: 'العمل الإضافي ورمضان', icon: Clock },
        { id: 'flexible_telework', key: 'nav.flexible_telework', defaultLabel: 'العمل المرن والعمل عن بعد', icon: Laptop },
        { id: 'tasks', key: 'nav.tasks', defaultLabel: 'المشاريع والمهام', icon: Target },
      ]
    },
    {
      titleKey: 'nav.sec.performance',
      defaultTitle: 'الأداء والتطوير',
      items: [
        { id: 'performance', key: 'nav.performance', defaultLabel: 'تقييم الأداء', icon: Star },
        { id: 'talent_9box', key: 'nav.talent_9box', defaultLabel: 'مصفوفة المواهب (9-Box) والتعاقب', icon: Layers },
        { id: 'promotions', key: 'nav.promotions', defaultLabel: 'المسار الوظيفي', icon: TrendingUp },
        { id: 'training', key: 'nav.training', defaultLabel: 'التدريب والتطوير', icon: GraduationCap },
        { id: 'rewards_kudos', key: 'nav.rewards_kudos', defaultLabel: 'التقدير والمكافآت (Kudos & Rewards)', icon: Award },
        { id: 'retention_ai', key: 'nav.retention_ai', defaultLabel: 'محلل مخاطر التسرب (AI Predictor)', icon: TrendingDown },
        { id: 'exit_interviews', key: 'nav.exit_interviews', defaultLabel: 'محلل مقابلات الخروج (AI Exits)', icon: UserMinus },
      ]
    },
    {
      titleKey: 'nav.sec.compliance',
      defaultTitle: 'الامتثال والأنظمة السعودية',
      items: [
        { id: 'saudi', key: 'nav.saudi', defaultLabel: 'الامتثال والأنظمة السعودية', icon: Scale },
        { id: 'wps_audit', key: 'nav.wps_audit', defaultLabel: 'تدقيق حماية الأجور (SIF & مدد)', icon: FileCheck2 },
        { id: 'qiwa_contracts', key: 'nav.qiwa_contracts', defaultLabel: 'عقود قوى الموحدة', icon: FileText },
        { id: 'medical', key: 'nav.medical', defaultLabel: 'التأمين الطبي ومجلس الضمان (CCHI)', icon: HeartPulse },
        { id: 'insurance_catalog', key: 'nav.insurance_catalog', defaultLabel: 'دليل شركات التأمين وفئات التغطية', icon: Layers },
        { id: 'visas', key: 'nav.visas', defaultLabel: 'التأشيرات وخدمات مقيم', icon: Plane },
        { id: 'nitaqat_sim', key: 'nav.nitaqat_sim', defaultLabel: 'محاكي نطاقات والتوطين', icon: Target },
        { id: 'health_certificates', key: 'nav.health_certificates', defaultLabel: 'الشهادات الصحية والمتابعة (بلدي)', icon: Stethoscope },
        { id: 'disciplinary', key: 'nav.disciplinary', defaultLabel: 'لائحة الجزاءات والتحقيق', icon: ShieldAlert },
        { id: 'grievances', key: 'nav.grievances', defaultLabel: 'التظلمات ولجان التحقيق والإنذارات (المادة 209)', icon: Scale },
        { id: 'work_injuries', key: 'nav.work_injuries', defaultLabel: 'إصابات العمل (GOSI)', icon: HeartPulse },
        { id: 'clearance', key: 'nav.clearance', defaultLabel: 'إخلاء الطرف وإبراء الذمة', icon: UserCheck },
        { id: 'hse_safety', key: 'nav.hse_safety', defaultLabel: 'الصحة والسلامة وتفتيش المنشآت (HSE)', icon: HardHat },
      ]
    },
    {
      titleKey: 'nav.sec.operations',
      defaultTitle: 'العمليات والأدوات الذكية',
      items: [
        { id: 'assets', key: 'nav.assets', defaultLabel: 'الأصول والعهدة', icon: Wallet },
        { id: 'smart_assets', key: 'nav.smart_assets', defaultLabel: 'الأصول والعهد الذكية (QR Handover)', icon: Laptop },
        { id: 'fleet', key: 'nav.fleet', defaultLabel: 'أسطول المركبات والمخالفات', icon: Car },
        { id: 'systems_hub', key: 'nav.systems_hub', defaultLabel: 'بوابة أنظمة معصوب حليب', icon: Layers },
        { id: 'alerts_center', key: 'nav.alerts_center', defaultLabel: 'مركز التنبيهات', icon: Bell },
        { id: 'ai_letters', key: 'nav.ai_letters', defaultLabel: 'استوديو الخطابات (AI)', icon: Sparkles },
        { id: 'ai_consultant', key: 'nav.ai_consultant', defaultLabel: 'المستشار القانوني الذكي', icon: Sparkles },
      ]
    },
    {
      titleKey: 'nav.sec.ess',
      defaultTitle: 'الخدمة الذاتية',
      items: [
        { id: 'ess', key: 'nav.ess', defaultLabel: 'بوابة الموظف (ESS)', icon: User },
      ]
    },
    {
      titleKey: 'nav.sec.admin',
      defaultTitle: 'الإدارة والنظام',
      items: [
        { id: 'users', key: 'nav.users', defaultLabel: 'إدارة المستخدمين', icon: UserCog },
        { id: 'audit', key: 'nav.audit', defaultLabel: 'سجل العمليات', icon: History },
        { id: 'settings', key: 'nav.settings', defaultLabel: 'بيانات المنشأة واللوائح', icon: Settings },
      ]
    }
  ];

  const allNavItems = navSections.flatMap(section => section.items);
  const quickAccess = [
    { id: 'dashboard', key: 'nav.quick.dashboard', defaultLabel: 'لوحة التحكم' },
    { id: 'employees', key: 'nav.quick.employees', defaultLabel: 'الموظفون' },
    { id: 'payroll', key: 'nav.quick.payroll', defaultLabel: 'مسير الرواتب' },
    { id: 'attendance', key: 'nav.quick.attendance', defaultLabel: 'الحضور' },
    { id: 'forms_center', key: 'nav.quick.forms_center', defaultLabel: 'النماذج' },
  ];

  const navigateTo = (id: View) => {
    setActiveView(id);
    setNavSearch('');
    if (!window.matchMedia('(min-width: 768px)').matches) setIsSidebarOpen(false);
  };

  const navQuery = navSearch.trim().toLocaleLowerCase();
  const filteredSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => allow(item.id)).filter(item => {
        if (!navQuery) return true;
        return (
          t(item.key, item.defaultLabel).toLocaleLowerCase().includes(navQuery) ||
          item.defaultLabel.toLocaleLowerCase().includes(navQuery) ||
          item.id.toLocaleLowerCase().includes(navQuery)
        );
      }),
    }))
    .filter(section => section.items.length > 0);

  const currentLabel = () => {
    for (const section of navSections) {
      const item = section.items.find(i => i.id === activeView);
      if (item) return t(item.key, item.defaultLabel);
    }
    return '';
  };

  return (
    <div className="flex h-screen bg-transparent font-sans" dir={direction}>
      {isSidebarOpen && <button type="button" aria-label="إغلاق القائمة" onClick={() => setIsSidebarOpen(false)} className="print-hide fixed inset-0 z-[15] bg-slate-900/20 md:hidden" />}
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 288 : 80 }}
        className="text-navy-800 dark:text-slate-200 h-full transition-all duration-300 absolute start-0 top-0 md:relative z-20 flex flex-col shrink-0
                   bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-e border-shell-line/80 dark:border-slate-800/80"
      >
        <div className={`flex items-center border-b border-shell-line dark:border-slate-800 shrink-0 ${isSidebarOpen ? 'p-4 justify-between' : 'p-2.5 flex-col gap-2'}`}>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2.5 min-w-0"
          >
            <img
              src="/brand/empower-3d-icon.png"
              alt=""
              className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-brand-900/25 shrink-0"
            />
            {isSidebarOpen && (
              <div className="overflow-hidden leading-tight">
                <span className="font-sans text-[14px] font-black truncate block max-w-[180px] text-navy-900 dark:text-white" title={settings.org_name}>
                  تمكين <span dir="ltr" className="text-brand-600">| EMPOWER</span>
                </span>
                <span className="text-[9px] text-brand-600 dark:text-brand-300 font-bold block truncate max-w-[180px]">
                  {language === 'ar' ? 'الموارد البشرية والرواتب والامتثال' : 'Saudi HR & Compliance'}
                </span>
              </div>
            )}
          </motion.div>
          <button
            ref={sidebarToggle}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-shell-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-brand-600 dark:hover:text-brand-300"
            aria-label={isSidebarOpen ? 'طي القائمة' : 'توسيع القائمة'}
            aria-expanded={isSidebarOpen}
            aria-controls="primary-navigation"
          >
            {isSidebarOpen ? (
              direction === 'rtl' ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />
            ) : (
              direction === 'rtl' ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>

        <nav id="primary-navigation" className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {isSidebarOpen && (
            <div className="shrink-0 space-y-3">
              <div className="relative group">
                <Search className="w-4 h-4 absolute inset-y-0 start-3 my-auto text-slate-400 group-focus-within:text-brand-600 pointer-events-none transition-colors" />
                <input
                  ref={navSearchRef}
                  type="search"
                  value={navSearch}
                  onChange={event => setNavSearch(event.target.value)}
                  placeholder={t('nav.search_placeholder', 'ابحث في القائمة...')}
                  aria-label={t('nav.search_placeholder', 'ابحث في القائمة...')}
                  className="w-full bg-shell-50/80 dark:bg-slate-800/80 border border-shell-line dark:border-slate-700 rounded-xl py-2 ps-9 pe-8 text-[12px] font-bold text-navy-800 dark:text-slate-100 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 transition-all"
                />
                {navSearch ? (
                  <button
                    type="button"
                    onClick={() => { setNavSearch(''); navSearchRef.current?.focus(); }}
                    aria-label={t('nav.clear_search', 'مسح البحث')}
                    className="absolute inset-y-0 end-2 my-auto p-1 text-slate-400 hover:text-brand-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="absolute inset-y-0 end-2 my-auto h-5 px-1.5 flex items-center rounded border border-shell-line dark:border-slate-700 bg-white dark:bg-slate-800 text-[9px] font-mono text-slate-400">Ctrl K</kbd>
                )}
              </div>

              {!navQuery && (
                <div>
                  <p className="px-1 pb-2 text-[10px] font-black tracking-widest text-slate-400">
                    {t('nav.quick_access', 'الوصول السريع')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickAccess.filter(q => allow(q.id)).map(q => (
                      <motion.button
                        key={q.id}
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => navigateTo(q.id as View)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-br from-brand-50 to-white border border-brand-100 text-brand-700 text-[10.5px] font-bold hover:border-brand-300 hover:shadow-sm transition-colors"
                      >
                        {t(q.key, q.defaultLabel)}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredSections.map(section => {
            const isCollapsed = !navQuery && collapsedSections[section.titleKey];
            return (
              <div key={section.titleKey} className="space-y-1">
                {isSidebarOpen ? (
                  <button
                    type="button"
                    onClick={() => setCollapsedSections(prev => ({ ...prev, [section.titleKey]: !prev[section.titleKey] }))}
                    aria-expanded={!isCollapsed}
                    className="group w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-shell-50 to-transparent hover:from-brand-50/70 transition-all"
                  >
                    <span className="flex-1 text-start text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-brand-600 transition-colors">
                      {t(section.titleKey, section.defaultTitle)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 bg-white dark:bg-slate-800 border border-shell-line dark:border-slate-700 rounded-full px-1.5 py-0.5">
                      {section.items.length}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      isCollapsed ? (direction === 'rtl' ? 'rotate-90' : '-rotate-90') : ''
                    }`} />
                  </button>
                ) : (
                  <div className="mx-3 my-2 border-t border-shell-line dark:border-slate-800" />
                )}

                {!isCollapsed && section.items.map(item => {
                  const isActive = activeView === item.id;
                  const label = t(item.key, item.defaultLabel);
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      data-view={item.id}
                      whileHover={{ scale: 1.012 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => navigateTo(item.id as View)}
                      title={!isSidebarOpen ? label : undefined}
                      aria-label={label}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl relative overflow-hidden transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-brand-50 via-brand-50/60 to-transparent dark:from-brand-950/60 dark:via-brand-900/40 text-brand-700 dark:text-brand-300 font-bold shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-shell-100 dark:hover:bg-slate-800 hover:text-navy-900 dark:hover:text-white'
                      } ${isSidebarOpen ? '' : 'justify-center'}`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="nav-active-indicator"
                          className="absolute inset-y-1.5 right-0 w-[3px] rounded-l-full bg-brand-600 shadow-[0_0_10px_rgba(23,105,209,0.6)]"
                        />
                      )}
                      <span className={`grid place-items-center rounded-lg transition-all duration-200 ${isActive ? 'bg-brand-100/80 p-1.5' : 'p-0'}`}>
                        <item.icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                          isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 group-hover:text-brand-500 dark:group-hover:text-brand-300'
                        }`} />
                      </span>
                      {isSidebarOpen && <span className="font-bold text-[12.5px] truncate text-start">{label}</span>}
                    </motion.button>
                  );
                })}
              </div>
            );
          })}

          {navQuery && filteredSections.length === 0 && (
            <div className="px-3 py-10 text-center">
              <Search className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <p className="text-[12px] text-slate-400">{t('nav.no_results', 'لا توجد شاشات مطابقة')}</p>
            </div>
          )}
        </nav>

        {isSidebarOpen && (
          <div className="p-3 border-t border-shell-line dark:border-slate-800 shrink-0 space-y-2">
            {canManageSettings && (
            <button 
              onClick={() => {
                setTempSettings(settings);
                setIsEditingSettings(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-shell-100 dark:bg-slate-800 hover:bg-shell-200 dark:hover:bg-slate-700 rounded-xl text-xs text-navy-700 dark:text-slate-200 hover:text-navy-900 dark:hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand-600" />
                <span className="font-bold">{t('btn.quick_settings')}</span>
              </div>
              <span className="text-[10px] bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-navy-700 dark:text-slate-200 border border-shell-line dark:border-slate-700">{settings.currency || 'SAR'}</span>
            </button>
            )}
            <button
              type="button"
              id="sidebar-logout-btn"
              onClick={logout}
              title={t('btn.logout')}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>{t('btn.logout')}</span>
            </button>
            <div className="p-2.5 bg-shell-50 dark:bg-slate-800/60 rounded-xl border border-shell-line dark:border-slate-800 text-center">
              <p className="text-[10px] text-slate-400">{t('app.title')}</p>
              <p className="text-[11px] font-mono font-bold text-navy-700 dark:text-brand-300">{t('app.version')}</p>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 ms-20 md:ms-0 overflow-auto flex flex-col">
        {/* Top Header Bar */}
        <header className="h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-shell-line/80 dark:border-slate-800/80 px-3 sm:px-6 md:px-8 flex items-center justify-between gap-2 sticky top-0 z-10 shrink-0 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-base md:text-lg font-black text-navy-900 dark:text-white">
              {currentLabel()}
            </h2>
          </div>

          {/* Quick Header Utility Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* 1. PDF Export Button (hidden when /api/saudi/compliance-summary would 403) */}
            {canExportCompliancePdf && (
            <button
              id="top-header-pdf-export-btn"
              onClick={() => setShowPdfModal(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all shadow-sm"
              title={t('btn.export_pdf')}
            >
              <Printer className="w-4 h-4 text-emerald-700" />
              <span>{language === 'ar' ? 'تصدير PDF' : 'PDF Export'}</span>
            </button>
            )}

            {/* 2. Database Backup & Restore Button */}
            <button
              id="top-header-backup-btn"
              onClick={() => setShowBackupModal(true)}
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm"
              title={t('backup.title')}
            >
              <Database className="w-4 h-4 text-brand-600" />
              <span>{language === 'ar' ? 'النسخ والاحتياط' : 'Backup DB'}</span>
            </button>

            {/* 3. Theme toggle — A نهاري / B ليلي (الهوية C لا تتغير) */}
            <button
              type="button"
              id="top-header-theme-toggle"
              onClick={() => setIsNight(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm"
              title={isNight ? (language === 'ar' ? 'الوضع النهاري (A)' : 'Day mode (A)') : (language === 'ar' ? 'الوضع الليلي (B)' : 'Night mode (B)')}
              aria-label={isNight ? 'الوضع النهاري' : 'الوضع الليلي'}
              aria-pressed={isNight}
            >
              {isNight ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-600" />}
              <span className="hidden sm:inline">{language === 'ar' ? (isNight ? 'نهاري' : 'ليلي') : (isNight ? 'Day' : 'Night')}</span>
            </button>

            {/* 4. Sign out — revokes the server session, not just the local cache */}
            <button
              type="button"
              id="top-header-logout-btn"
              onClick={logout}
              title={t('btn.logout')}
              aria-label={t('btn.logout')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t('btn.logout')}</span>
            </button>

            {/* 5. Language Switcher Toggle */}
            <LanguageSwitcher />

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

            {/* 4. Smart Expiry Alerts & Notification Bell */}
            <NotificationBell onNavigate={(viewId) => { if (allow(viewId)) setActiveView(viewId as View); }} />

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* 5. Company Info */}
            <div className="hidden sm:block text-left rtl:text-right">
              <p className="text-xs font-black text-slate-800 dark:text-white truncate max-w-[140px]">{settings.org_name}</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{t('country.ksa')}</p>
            </div>
            
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </header>

        <div className="p-3 sm:p-6 md:p-8 flex-1 min-w-0" data-screen={activeView}>
          {/* No AnimatePresence mode="wait" here: its exit gating deadlocks with
              lazy (Suspense) screens — the first navigation after load never
              swaps the view. Enter-only animation swaps unconditionally. */}
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
              {/* Screens are code-split, so each one loads on first visit. */}
              <Suspense fallback={<ScreenLoader />}>
              {activeView === 'dashboard' && <DashboardView />}
              {activeView === 'executive_board' && <ExecutiveBoardroomView />}
              {activeView === 'approval_workflows' && <ApprovalWorkflowsView />}
              {activeView === 'grievances' && <GrievancesView />}
              {activeView === 'budgeting' && <BudgetingView />}
              {activeView === 'rewards_kudos' && <RewardsKudosView />}
              {activeView === 'smart_assets' && <SmartAssetsView />}
              {activeView === 'ewa_wellness' && <EarnedWageAccessView />}
              {activeView === 'hse_safety' && <HseSafetyComplianceView />}
              {activeView === 'exit_interviews' && <ExitInterviewAnalyticsView />}
              {activeView === 'saudi' && <SaudiComplianceView />}
              {activeView === 'wps_audit' && <WpsAuditSifView />}
              {activeView === 'medical' && <MedicalInsuranceView />}
              {activeView === 'insurance_catalog' && <InsuranceCatalogView />}
              {activeView === 'talent_9box' && <TalentMatrix9BoxView />}
              {activeView === 'fleet' && <FleetManagementView />}
              {activeView === 'flexible_telework' && <FlexibleWorkTeleworkView />}
              {activeView === 'retention_ai' && <AiRetentionPredictorView />}
              {activeView === 'qiwa_contracts' && <QiwaContractsView />}
              {activeView === 'nitaqat_sim' && <NitaqatSimulatorView />}
              {activeView === 'ai_letters' && <AiHrLetterStudioView />}
              {activeView === 'disciplinary' && <DisciplinaryMatrixView />}
              {activeView === 'clearance' && <ExitClearanceView />}
              {activeView === 'work_injuries' && <WorkInjuriesView />}
              {activeView === 'visas' && <VisasMuqeemView />}
              {activeView === 'provisions' && <AccountingProvisionsView />}
              {activeView === 'cost_employment' && <TotalCostEmploymentView />}
              {activeView === 'overtime' && <OvertimeRamadanView />}
              {activeView === 'ai_consultant' && <LaborLawAiConsultantView />}
              {activeView === 'branches' && <BranchesView />}
              {activeView === 'employees' && <EmployeesView />}
              {activeView === 'health_certificates' && <HealthCertificatesView />}
              {activeView === 'import_center' && <ImportCenterView />}
              {activeView === 'payroll' && <PayrollView />}
              {activeView === 'allowances' && <AllowanceTypesView />}
              {activeView === 'audit' && <AuditLogsView />}
              {activeView === 'loans' && <LoansView />}
              {activeView === 'attendance' && <AttendanceView />}
              {activeView === 'reports' && <ReportsView />}
              {activeView === 'extended_reports' && <ExtendedReportsView />}
              {activeView === 'departments' && <DepartmentsView />}
              {activeView === 'bonuses' && <BonusesView />}
              {activeView === 'leaves' && <LeavesView />}
              {activeView === 'assets' && <AssetsView />}
              {activeView === 'documents' && <DocumentsView />}
              {activeView === 'forms_center' && <FormsCenterView />}
              {activeView === 'performance' && <PerformanceView />}
              {activeView === 'ess' && <ESSView />}
              {activeView === 'annual_cycle' && <AnnualCycleView />}
              {activeView === 'recruitment' && <RecruitmentView />}
              {activeView === 'expenses' && <ExpensesView />}
              {activeView === 'training' && <TrainingView />}
              {activeView === 'promotions' && <PromotionsView />}
              {activeView === 'settings' && <SettingsView />}
              {activeView === 'tasks' && <TasksView />}
              {activeView === 'attendance_kiosk' && <AttendanceKioskView />}
              {activeView === 'attendance_live' && <BranchLiveAttendanceView />}
              {activeView === 'manager_inbox' && <ManagerInboxView />}
              {activeView === 'employee_documents' && <EmployeeDocumentsView />}
              {activeView === 'alerts_center' && <AlertsCenterView />}
              {activeView === 'transfers' && <TransfersView />}
              {activeView === 'salary_reports' && <SalaryReportsView />}
              {activeView === 'consolidated_reports' && <ConsolidatedBranchesView />}
              {activeView === 'systems_hub' && <SystemsHubView onOpenReports={() => { if (allow('consolidated_reports')) setActiveView('consolidated_reports'); }} />}
              {activeView === 'users' && <UsersView />}
              </Suspense>
          </motion.div>
        </div>
      </main>

      {/* Floating AI HR Copilot Launcher */}
      <button
        id="floating-ai-copilot-btn"
        onClick={() => setShowCopilot(true)}
        className="no-print fixed bottom-6 left-6 rtl:left-6 ltr:right-6 z-40 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white px-4 py-3.5 rounded-full shadow-2xl hover:shadow-emerald-500/40 transition-all transform hover:scale-105 flex items-center gap-2.5 border-2 border-emerald-300/40"
        title="المساعد الذكي للموارد البشرية (AI Copilot)"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
        </span>
        <Sparkles className="w-5 h-5 text-emerald-100" />
        <span className="font-bold text-xs pl-1">{language === 'ar' ? 'مساعد HR الذكي (AI)' : 'AI HR Copilot'}</span>
      </button>

      {/* AI HR Copilot Modal */}
      {showCopilot && (
        <Suspense fallback={null}>
          <AiHrCopilotModal 
            isOpen={showCopilot}
            onClose={() => setShowCopilot(false)}
            onNavigate={(viewId) => {
              if (allow(viewId)) setActiveView(viewId as View);
              setShowCopilot(false);
            }}
          />
        </Suspense>
      )}

      {/* PDF Export Modal */}
      {showPdfModal && (
        <PdfExportModal 
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Backup & Restore Modal */}
      {showBackupModal && (
        <BackupRestoreModal 
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
        />
      )}

      {/* Quick Settings Modal */}
      {isEditingSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-8 shadow-2xl border border-transparent dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-black text-slate-800 dark:text-white">{t('btn.quick_settings')}</h3>
               <button onClick={() => setIsEditingSettings(false)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">اسم المؤسسة / المنشأة</label>
                <input 
                  type="text" 
                  value={tempSettings.org_name}
                  onChange={e => setTempSettings({ ...tempSettings, org_name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 text-right font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">الدولة والأنظمة</label>
                  <select 
                    value={tempSettings.country}
                    onChange={e => setTempSettings({ ...tempSettings, country: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 text-right font-bold text-xs"
                  >
                    <option value="المملكة العربية السعودية">المملكة العربية السعودية (GOSI & قوى)</option>
                    <option value="الإمارات">الإمارات</option>
                    <option value="مصر">مصر</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">العملة الأساسية</label>
                  <input 
                    type="text" 
                    value={tempSettings.currency}
                    onChange={e => setTempSettings({ ...tempSettings, currency: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 text-right font-bold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">نسبة تأمينات الموظف (%)</label>
                  <input 
                    type="number" 
                    value={tempSettings.insurance_emp_rate}
                    onChange={e => setTempSettings({ ...tempSettings, insurance_emp_rate: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 text-right font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">نسبة تأمينات المنشأة (%)</label>
                  <input 
                    type="number" 
                    value={tempSettings.insurance_comp_rate}
                    onChange={e => setTempSettings({ ...tempSettings, insurance_comp_rate: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100 text-right font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={handleUpdateSettings}
                  className="flex-1 bg-brand-600 text-white py-3.5 rounded-2xl font-black hover:bg-brand-700 transition-all shadow-md shadow-emerald-200"
                >
                  {t('btn.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 15-minute idle guard: warns at 60s, then signs out and revokes the session. */}
      <SessionIdleGuard />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
