import { useState, useEffect } from 'react';
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
  UserMinus,
  Bot,
  MessageSquare,
  Printer,
  Database,
  Globe,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Branch, Employee, PayrollRecord, Stats, AppSettings } from './types';
import { useLanguage } from './context/LanguageContext';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { PdfExportModal } from './components/PdfExportModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';

// Components
import DashboardView from './components/DashboardView';
import SaudiComplianceView from './components/SaudiComplianceView';
import BranchesView from './components/BranchesView';
import EmployeesView from './components/EmployeesView';
import PayrollView from './components/PayrollView';
import AllowanceTypesView from './components/AllowanceTypesView';
import AuditLogsView from './components/AuditLogsView';
import DepartmentsView from './components/DepartmentsView';
import BonusesView from './components/BonusesView';
import NotificationBell from './components/NotificationBell';
import LoansView from './components/LoansView';
import AttendanceView from './components/AttendanceView';
import ReportsView from './components/ReportsView';
import LeavesView from './components/LeavesView';
import AssetsView from './components/AssetsView';
import DocumentsView from './components/DocumentsView';
import PerformanceView from './components/PerformanceView';
import ESSView from './components/ESSView';
import RecruitmentView from './components/RecruitmentView';
import ExpensesView from './components/ExpensesView';
import TrainingView from './components/TrainingView';
import PromotionsView from './components/PromotionsView';
import SettingsView from './components/SettingsView';
import TasksView from './components/TasksView';
import VisasMuqeemView from './components/VisasMuqeemView';
import AccountingProvisionsView from './components/AccountingProvisionsView';
import TotalCostEmploymentView from './components/TotalCostEmploymentView';
import OvertimeRamadanView from './components/OvertimeRamadanView';
import LaborLawAiConsultantView from './components/LaborLawAiConsultantView';
import QiwaContractsView from './components/QiwaContractsView';
import DisciplinaryMatrixView from './components/DisciplinaryMatrixView';
import ExitClearanceView from './components/ExitClearanceView';
import WorkInjuriesView from './components/WorkInjuriesView';
import NitaqatSimulatorView from './components/NitaqatSimulatorView';
import AiHrLetterStudioView from './components/AiHrLetterStudioView';
import MedicalInsuranceView from './components/MedicalInsuranceView';
import WpsAuditSifView from './components/WpsAuditSifView';
import TalentMatrix9BoxView from './components/TalentMatrix9BoxView';
import FleetManagementView from './components/FleetManagementView';
import FlexibleWorkTeleworkView from './components/FlexibleWorkTeleworkView';
import AiRetentionPredictorView from './components/AiRetentionPredictorView';
import EarnedWageAccessView from './components/EarnedWageAccessView';
import HseSafetyComplianceView from './components/HseSafetyComplianceView';
import ExecutiveBoardroomView from './components/ExecutiveBoardroomView';
import ExitInterviewAnalyticsView from './components/ExitInterviewAnalyticsView';
import ApprovalWorkflowsView from './components/ApprovalWorkflowsView';
import AiHrCopilotModal from './components/AiHrCopilotModal';
import { GrievancesView } from './components/GrievancesView';
import { BudgetingView } from './components/BudgetingView';
import { RewardsKudosView } from './components/RewardsKudosView';
import { SmartAssetsView } from './components/SmartAssetsView';
import AttendanceKioskView from './components/AttendanceKioskView';
import BranchLiveAttendanceView from './components/BranchLiveAttendanceView';
import ManagerInboxView from './components/ManagerInboxView';
import EmployeeDocumentsView from './components/EmployeeDocumentsView';
import AlertsCenterView from './components/AlertsCenterView';
import TransfersView from './components/TransfersView';
import SalaryReportsView from './components/SalaryReportsView';

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
  | 'employees' 
  | 'payroll' 
  | 'allowances' 
  | 'audit' 
  | 'loans' 
  | 'attendance' 
  | 'reports' 
  | 'departments' 
  | 'bonuses' 
  | 'leaves' 
  | 'assets' 
  | 'documents' 
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
  | 'salary_reports';

// Inner App component that requires authentication
function AuthenticatedApp() {
  const { t, language, direction } = useLanguage();
  const { user, logout, hasRole, isLoading } = useAuth();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCopilot, setShowCopilot] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const [settings, setSettings] = useState<AppSettings>({
    org_name: 'شركة المسار الرقمي للحلول المتكاملة',
    country: 'المملكة العربية السعودية',
    currency: 'SAR',
    tax_rate: 0,
    insurance_emp_rate: 9.75,
    insurance_comp_rate: 11.75
  });
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<AppSettings>(settings);

  // Single screen/role matrix for the shell (sidebar + header actions). It mirrors the
  // server's RBAC policy, so a control whose API call is classified is never rendered for a
  // role the endpoint would answer with 403.
  const role = user?.role || '';
  const allow = (id: string) => {
    if (!role) return false; // no user/role must not grant any screen
    if (role === 'admin' || role === 'hr_manager') return true;
    if (role === 'employee_ess') return id === 'ess';
    if (role === 'finance') return ['dashboard', 'payroll', 'wps_audit', 'loans', 'bonuses', 'expenses', 'allowances', 'reports', 'salary_reports', 'provisions', 'cost_employment', 'budgeting'].includes(id);
    if (role === 'branch_manager') return ['dashboard', 'attendance', 'attendance_kiosk', 'attendance_live', 'employees', 'leaves', 'approval_workflows', 'manager_inbox', 'ess', 'alerts_center'].includes(id);
    return true;
  };
  // "الإعدادات السريعة" writes PUT /api/settings -> settings.manage (admin, hr_manager).
  const canManageSettings = allow('settings');
  // "تصدير PDF" reads /api/saudi/compliance-summary -> saudi.compliance. finance holds that
  // permission even though the compliance screen id is not part of finance's sidebar list.
  const canExportCompliancePdf = allow('saudi') || role === 'finance';

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={() => {}} />;
  }

  useEffect(() => {
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
  }, []);

  const handleUpdateSettings = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tempSettings)
    });
    setSettings(tempSettings);
    setIsEditingSettings(false);
  };

  const navSections = [
    {
      titleKey: 'nav.sec.main',
      defaultTitle: 'الرئيسية والأنظمة السعودية ومجلس الإدارة',
      items: [
        { id: 'dashboard', key: 'nav.dashboard', defaultLabel: 'لوحة التحكم العامة', icon: LayoutDashboard },
        { id: 'executive_board', key: 'nav.executive_board', defaultLabel: 'لوحة القيادة التنفيذية ومجلس الإدارة (ROI)', icon: Award },
        { id: 'approval_workflows', key: 'nav.approval_workflows', defaultLabel: 'مسارات وسلاسل الاعتماد (Workflows)', icon: GitPullRequest },
        { id: 'manager_inbox', key: 'nav.manager_inbox', defaultLabel: 'صندوق اعتماد المدير (جوال)', icon: UserCheck },
        { id: 'grievances', key: 'nav.grievances', defaultLabel: 'التظلمات ولجان التحقيق والإنذارات (المادة 209)', icon: Scale },
        { id: 'budgeting', key: 'nav.budgeting', defaultLabel: 'ميزانية الموارد وتكاليف التعيين', icon: DollarSign },
        { id: 'ewa_wellness', key: 'nav.ewa_wellness', defaultLabel: 'سحب الراتب عند الطلب (EWA)', icon: Wallet },
        { id: 'hse_safety', key: 'nav.hse_safety', defaultLabel: 'الصحة والسلامة وتفتيش المنشآت (HSE)', icon: HardHat },
        { id: 'saudi', key: 'nav.saudi', defaultLabel: 'الامتثال والأنظمة السعودية', icon: Scale },
        { id: 'wps_audit', key: 'nav.wps_audit', defaultLabel: 'تدقيق حماية الأجور (SIF & مدد)', icon: FileCheck2 },
        { id: 'medical', key: 'nav.medical', defaultLabel: 'التأمين الطبي ومجلس الضمان (CCHI)', icon: HeartPulse },
        { id: 'qiwa_contracts', key: 'nav.qiwa_contracts', defaultLabel: 'عقود قوى الموحدة', icon: FileText },
        { id: 'nitaqat_sim', key: 'nav.nitaqat_sim', defaultLabel: 'محاكي نطاقات والتوطين', icon: Target },
        { id: 'flexible_telework', key: 'nav.flexible_telework', defaultLabel: 'العمل المرن والعمل عن بعد', icon: Laptop },
        { id: 'ai_letters', key: 'nav.ai_letters', defaultLabel: 'استوديو الخطابات (AI)', icon: Sparkles },
        { id: 'disciplinary', key: 'nav.disciplinary', defaultLabel: 'لائحة الجزاءات والتحقيق', icon: ShieldAlert },
        { id: 'clearance', key: 'nav.clearance', defaultLabel: 'إخلاء الطرف وإبراء الذمة', icon: UserCheck },
        { id: 'work_injuries', key: 'nav.work_injuries', defaultLabel: 'إصابات العمل (GOSI)', icon: HeartPulse },
        { id: 'visas', key: 'nav.visas', defaultLabel: 'التأشيرات وخدمات مقيم', icon: Plane },
        { id: 'provisions', key: 'nav.provisions', defaultLabel: 'المخصصات (IAS 19)', icon: Calculator },
        { id: 'cost_employment', key: 'nav.cost_employment', defaultLabel: 'التكلفة الشاملة (TCOE)', icon: DollarSign },
        { id: 'overtime', key: 'nav.overtime', defaultLabel: 'العمل الإضافي ورمضان', icon: Clock },
        { id: 'ai_consultant', key: 'nav.ai_consultant', defaultLabel: 'المستشار القانوني الذكي', icon: Sparkles },
        { id: 'reports', key: 'nav.reports', defaultLabel: 'التقارير والتحليلات', icon: TrendingUp },
      ]
    },
    {
      titleKey: 'nav.sec.hr',
      defaultTitle: 'الموارد البشرية (HR)',
      items: [
        { id: 'employees', key: 'nav.employees', defaultLabel: 'الموظفين والإقامات', icon: Users },
        { id: 'rewards_kudos', key: 'nav.rewards_kudos', defaultLabel: 'التقدير والمكافآت (Kudos & Rewards)', icon: Award },
        { id: 'smart_assets', key: 'nav.smart_assets', defaultLabel: 'الأصول والعهد الذكية (QR Handover)', icon: Laptop },
        { id: 'exit_interviews', key: 'nav.exit_interviews', defaultLabel: 'محلل مقابلات الخروج (AI Exits)', icon: UserMinus },
        { id: 'talent_9box', key: 'nav.talent_9box', defaultLabel: 'مصفوفة المواهب (9-Box) والتعاقب', icon: Layers },
        { id: 'retention_ai', key: 'nav.retention_ai', defaultLabel: 'محلل مخاطر التسرب (AI Predictor)', icon: TrendingDown },
        { id: 'fleet', key: 'nav.fleet', defaultLabel: 'أسطول المركبات والمخالفات', icon: Car },
        { id: 'departments', key: 'nav.departments', defaultLabel: 'الإدارات والأقسام', icon: Building2 },
        { id: 'recruitment', key: 'nav.recruitment', defaultLabel: 'التوظيف (ATS)', icon: Briefcase },
        { id: 'leaves', key: 'nav.leaves', defaultLabel: 'الإجازات والغياب', icon: Clock },
        { id: 'documents', key: 'nav.documents', defaultLabel: 'الأرشيف والوثائق', icon: ShieldCheck },
        { id: 'assets', key: 'nav.assets', defaultLabel: 'الأصول والعهدة', icon: Wallet },
        { id: 'performance', key: 'nav.performance', defaultLabel: 'تقييم الأداء', icon: Star },
        { id: 'training', key: 'nav.training', defaultLabel: 'التدريب والتطوير', icon: GraduationCap },
        { id: 'promotions', key: 'nav.promotions', defaultLabel: 'المسار الوظيفي', icon: TrendingUp },
        { id: 'tasks', key: 'nav.tasks', defaultLabel: 'المشاريع والمهام', icon: Target },
      ]
    },
    {
      titleKey: 'nav.sec.finance',
      defaultTitle: 'المالية وحماية الأجور',
      items: [
        { id: 'payroll', key: 'nav.payroll', defaultLabel: 'مسير الرواتب (WPS)', icon: BadgeDollarSign },
        { id: 'expenses', key: 'nav.expenses', defaultLabel: 'المطالبات المالية', icon: Receipt },
        { id: 'loans', key: 'nav.loans', defaultLabel: 'القروض والسلف', icon: Landmark },
        { id: 'bonuses', key: 'nav.bonuses', defaultLabel: 'المكافآت والجزاءات', icon: HandCoins },
        { id: 'attendance', key: 'nav.attendance', defaultLabel: 'بيانات الحضور', icon: Clock },
        { id: 'allowances', key: 'nav.allowances', defaultLabel: 'تكويد البدلات', icon: Settings },
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
        { id: 'branches', key: 'nav.branches', defaultLabel: 'الفروع والمواقع', icon: Building2 },
        { id: 'settings', key: 'nav.settings', defaultLabel: 'بيانات المنشأة واللوائح', icon: Settings },
        { id: 'audit', key: 'nav.audit', defaultLabel: 'سجل العمليات', icon: History },
      ]
    },
    {
      titleKey: 'nav.sec.new',
      defaultTitle: 'الميزات الجديدة',
      items: [
        { id: 'attendance_kiosk', key: 'nav.attendance_kiosk', defaultLabel: 'جهاز الحضور (Kiosk)', icon: Clock },
        { id: 'attendance_live', key: 'nav.attendance_live', defaultLabel: 'حضور الفروع الآن', icon: Users },
        { id: 'employee_documents', key: 'nav.employee_documents', defaultLabel: 'ملف الموظف والوثائق', icon: FileText },
        { id: 'alerts_center', key: 'nav.alerts_center', defaultLabel: 'مركز التنبيهات', icon: Bell },
        { id: 'transfers', key: 'nav.transfers', defaultLabel: 'نقل الموظف بين الفروع', icon: GitPullRequest },
        { id: 'salary_reports', key: 'nav.salary_reports', defaultLabel: 'تقارير الرواتب', icon: TrendingUp },
      ]
    }
  ];

  const currentLabel = () => {
    for (const section of navSections) {
      const item = section.items.find(i => i.id === activeView);
      if (item) return t(item.key, item.defaultLabel);
    }
    return '';
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans" dir={direction}>
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-slate-900 text-white h-full transition-all duration-300 relative z-20 flex flex-col shrink-0"
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <div className="bg-emerald-600 p-2 rounded-xl shadow-md shadow-emerald-900/30">
                <Scale className="w-6 h-6 text-white" />
              </div>
              <div className="overflow-hidden">
                <span 
                  className="text-sm font-black tracking-tight truncate block max-w-[170px]"
                  title={settings.org_name}
                >
                  {settings.org_name}
                </span>
                <span className="text-[10px] text-emerald-400 font-bold block">
                  {language === 'ar' ? 'نظام HR والرواتب والامتثال' : 'Saudi HR & Compliance'}
                </span>
              </div>
            </motion.div>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
          >
            {isSidebarOpen ? (
              direction === 'rtl' ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />
            ) : (
              direction === 'rtl' ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
          {navSections.map((section, idx) => {
            const items = section.items.filter(i => allow(i.id));
            if (!items.length) return null;
            return (
            <div key={idx} className="space-y-1">
              {isSidebarOpen && (
                <p className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 opacity-60">
                  {t(section.titleKey, section.defaultTitle)}
                </p>
              )}
              {items.map((item) => {
                const isActive = activeView === item.id;
                const isSaudiCompliance = item.id === 'saudi';
                const label = t(item.key, item.defaultLabel);

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id as View)}
                    title={!isSidebarOpen ? label : undefined}
                    className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl transition-all ${
                      isActive 
                        ? (isSaudiCompliance ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 font-bold' : 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 font-bold')
                        : (isSaudiCompliance ? 'text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-200' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white')
                    }`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : (isSaudiCompliance ? 'text-emerald-400' : 'text-slate-400')}`} />
                    {isSidebarOpen && <span className="font-bold text-xs truncate">{label}</span>}
                  </button>
                );
              })}
            </div>
          );
          })}
        </nav>

        {isSidebarOpen && (
          <div className="p-4 border-t border-slate-800 shrink-0 space-y-2">
            {canManageSettings && (
            <button 
              onClick={() => {
                setTempSettings(settings);
                setIsEditingSettings(true);
              }}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-xs text-slate-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="font-bold">{t('btn.quick_settings')}</span>
              </div>
              <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-emerald-400">{settings.currency || 'SAR'}</span>
            </button>
            )}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60 text-center">
              <p className="text-[10px] text-slate-400">{t('app.title')}</p>
              <p className="text-[11px] font-mono font-bold text-emerald-400">{t('app.version')}</p>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 md:px-8 flex items-center justify-between sticky top-0 z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-base md:text-lg font-black text-slate-800">
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
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-sm"
              title={t('backup.title')}
            >
              <Database className="w-4 h-4 text-indigo-600" />
              <span>{language === 'ar' ? 'النسخ والاحتياط' : 'Backup DB'}</span>
            </button>

            {/* 3. Language Switcher Toggle */}
            <LanguageSwitcher />

            <div className="w-px h-6 bg-slate-200" />

            {/* 4. Smart Expiry Alerts & Notification Bell */}
            <NotificationBell onNavigate={(viewId) => setActiveView(viewId as View)} />

            <div className="w-px h-6 bg-slate-200 hidden sm:block" />

            {/* 5. Company Info */}
            <div className="hidden sm:block text-left rtl:text-right">
              <p className="text-xs font-black text-slate-800 truncate max-w-[140px]">{settings.org_name}</p>
              <p className="text-[10px] text-emerald-600 font-bold">{t('country.ksa')}</p>
            </div>
            
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-700 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </header>

        <div className="p-6 md:p-8 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
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
              {activeView === 'payroll' && <PayrollView />}
              {activeView === 'allowances' && <AllowanceTypesView />}
              {activeView === 'audit' && <AuditLogsView />}
              {activeView === 'loans' && <LoansView />}
              {activeView === 'attendance' && <AttendanceView />}
              {activeView === 'reports' && <ReportsView />}
              {activeView === 'departments' && <DepartmentsView />}
              {activeView === 'bonuses' && <BonusesView />}
              {activeView === 'leaves' && <LeavesView />}
              {activeView === 'assets' && <AssetsView />}
              {activeView === 'documents' && <DocumentsView />}
              {activeView === 'performance' && <PerformanceView />}
              {activeView === 'ess' && <ESSView />}
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
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating AI HR Copilot Launcher */}
      <button
        id="floating-ai-copilot-btn"
        onClick={() => setShowCopilot(true)}
        className="fixed bottom-6 left-6 rtl:left-6 ltr:right-6 z-40 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white px-4 py-3.5 rounded-full shadow-2xl hover:shadow-emerald-500/40 transition-all transform hover:scale-105 flex items-center gap-2.5 border-2 border-emerald-300/40"
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
        <AiHrCopilotModal 
          isOpen={showCopilot}
          onClose={() => setShowCopilot(false)}
          onNavigate={(viewId) => {
            setActiveView(viewId as View);
            setShowCopilot(false);
          }}
        />
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
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-black text-slate-800">{t('btn.quick_settings')}</h3>
               <button onClick={() => setIsEditingSettings(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">اسم المؤسسة / المنشأة</label>
                <input 
                  type="text" 
                  value={tempSettings.org_name}
                  onChange={e => setTempSettings({ ...tempSettings, org_name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">الدولة والأنظمة</label>
                  <select 
                    value={tempSettings.country}
                    onChange={e => setTempSettings({ ...tempSettings, country: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold text-xs"
                  >
                    <option value="المملكة العربية السعودية">المملكة العربية السعودية (GOSI & قوى)</option>
                    <option value="الإمارات">الإمارات</option>
                    <option value="مصر">مصر</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">العملة الأساسية</label>
                  <input 
                    type="text" 
                    value={tempSettings.currency}
                    onChange={e => setTempSettings({ ...tempSettings, currency: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-right font-bold font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">نسبة تأمينات الموظف (%)</label>
                  <input 
                    type="number" 
                    value={tempSettings.insurance_emp_rate}
                    onChange={e => setTempSettings({ ...tempSettings, insurance_emp_rate: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-right font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">نسبة تأمينات المنشأة (%)</label>
                  <input 
                    type="number" 
                    value={tempSettings.insurance_comp_rate}
                    onChange={e => setTempSettings({ ...tempSettings, insurance_comp_rate: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-right font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={handleUpdateSettings}
                  className="flex-1 bg-emerald-600 text-white py-3.5 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200"
                >
                  {t('btn.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
