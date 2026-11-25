import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'ar' | 'en';

export interface LanguageContextType {
  language: Language;
  direction: 'rtl' | 'ltr';
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, defaultText?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    // General
    'app.title': 'نظام إدارة الموارد البشرية والرواتب والامتثال السعودي',
    'app.subtitle': 'منصة رقمية متكاملة للمنشآت السعودية (قوى، مدد، التأمينات GOSI، الضمان CCHI)',
    'app.version': 'الإصدار 2.5.0 (متوافق مع قوى ومدد)',
    'country.ksa': 'المملكة العربية السعودية 🇸🇦',
    'currency.sar': 'ر.س',
    'btn.save': 'حفظ التغييرات',
    'btn.cancel': 'إلغاء',
    'btn.delete': 'حذف',
    'btn.edit': 'تعديل',
    'btn.add': 'إضافة جديد',
    'btn.export_pdf': 'تصدير PDF احترافي',
    'btn.export_excel': 'تصدير كشف Excel',
    'btn.download': 'تحميل',
    'btn.restore': 'استعادة النسخة',
    'btn.backup': 'نسخ احتياطي للبيانات',
    'btn.close': 'إغلاق',
    'btn.print': 'طباعة فورية',
    'btn.filter': 'تصفية وبحث',
    'btn.search': 'بحث...',
    'btn.quick_settings': 'تعديل سريع للإعدادات',
    'btn.renew': 'تجديد فوري',
    'btn.view_details': 'عرض التفاصيل',
    'btn.mark_read': 'تحديد الكل كمقروء',
    'btn.send_reminder': 'إرسال إشعار تذكير',
    'status.active': 'نشط',
    'status.expired': 'منتهي الصلاحية',
    'status.expiring_soon': 'قارب على الانتهاء',
    'status.warning': 'تنبيه',
    'status.critical': 'حرج جداً',
    'status.valid': 'ساري المفعول',
    'status.approved': 'معتمد',
    'status.pending': 'قيد المراجعة',
    'status.completed': 'مكتمل',

    // Login
    'login.title': 'مرحباً بعودتك',
    'login.subtitle': 'سجّل الدخول إلى حسابك',
    'login.username': 'اسم المستخدم',
    'login.usernamePlaceholder': 'أدخل اسم المستخدم',
    'login.password': 'كلمة المرور',
    'login.passwordPlaceholder': 'أدخل كلمة المرور',
    'login.showPassword': 'إظهار كلمة المرور',
    'login.hidePassword': 'إخفاء كلمة المرور',
    'login.signIn': 'تسجيل الدخول',
    'login.signingIn': 'جارٍ تسجيل الدخول...',
    'login.error': 'فشل تسجيل الدخول',
    'login.networkError': 'خطأ في الشبكة',
    'login.version': 'الإصدار 2.0.0',

    // Sign-in / account request
    'auth.tab.login': 'تسجيل الدخول',
    'auth.tab.signup': 'إنشاء حساب',
    'auth.welcome': 'مرحباً بعودتك',
    'auth.signupTitle': 'طلب تسجيل جديد',
    'auth.signupSubtitle': 'سيُراجع الطلب من الإدارة قبل تفعيل الحساب',
    'auth.fullName': 'الاسم الكامل',
    'auth.email': 'البريد الإلكتروني',
    'auth.phone': 'رقم الجوال',
    'auth.username': 'اسم المستخدم المقترح',
    'auth.password': 'كلمة المرور',
    'auth.confirmPassword': 'تأكيد كلمة المرور',
    'auth.remember': 'تذكرني',
    'auth.forgot': 'نسيت كلمة المرور؟',
    'auth.submitRequest': 'إرسال طلب التسجيل',
    'auth.submitting': 'جارٍ الإرسال...',
    'auth.requestSent': 'تم استلام الطلب',
    'auth.requestSentBody': 'رقم الطلب',
    'auth.requestPending': 'يبقى قيد المراجعة ولن يُفعّل الحساب إلا بعد اعتماد الإدارة.',
    'auth.backToLogin': 'العودة لتسجيل الدخول',
    'auth.passwordMismatch': 'تأكيد كلمة المرور غير مطابق',
    'auth.resetTitle': 'استعادة كلمة المرور',
    'auth.resetSubtitle': 'أدخل اسم المستخدم والبريد المسجل؛ سيراجع مدير النظام الطلب.',
    'auth.resetUsername': 'اسم المستخدم',
    'auth.resetSubmit': 'إرسال طلب الاستعادة',
    'auth.resetSent': 'تم استلام الطلب',
    'auth.resetSentBody': 'إن كان الحساب موجوداً، سيراجعه مدير النظام. لا يُنشأ تسجيل دخول من هذا الطلب.',
    'auth.resetClose': 'إغلاق',
    'auth.resetNote': 'لا يُخبر النظام ما إذا كان الحساب موجوداً، ولا يُنشأ تسجيل دخول من الطلب.',
    'auth.identityLine': 'نظام إدارة الموارد البشرية والرواتب',

    // Session / sign-out
    'btn.logout': 'تسجيل الخروج',
    'session.warningTitle': 'انتهاء الجلسة قريباً',
    'session.warningHint': 'لا يوجد نشاط منذ 15 دقيقة',
    'session.warningBody': 'سيتم تسجيل خروجك تلقائياً لحماية بياناتك. اضغط «متابعة العمل» للبقاء.',
    'session.countdown': 'الوقت المتبقي',
    'session.stay': 'متابعة العمل',
    'session.logoutNow': 'خروج الآن',

    // Nav Sections (specialised groups)
    'nav.sec.overview': 'نظرة عامة وقيادة',
    'nav.sec.people': 'إدارة الموظفين',
    'nav.sec.payroll_finance': 'الرواتب والمالية',
    'nav.sec.attendance': 'الحضور وأوقات العمل',
    'nav.sec.performance': 'الأداء والتطوير',
    'nav.sec.compliance': 'الامتثال والأنظمة السعودية',
    'nav.sec.operations': 'العمليات والأدوات الذكية',
    'nav.sec.main': 'الرئيسية والأنظمة السعودية ومجلس الإدارة',
    'nav.sec.hr': 'الموارد البشرية (HR)',
    'nav.sec.finance': 'المالية وحماية الأجور',
    'nav.sec.ess': 'الخدمة الذاتية',
    'nav.sec.admin': 'الإدارة والنظام',
    'nav.search_placeholder': 'ابحث في القائمة...',
    'nav.clear_search': 'مسح البحث',
    'nav.quick_access': 'الوصول السريع',
    'nav.no_results': 'لا توجد شاشات مطابقة',
    'nav.quick.dashboard': 'لوحة التحكم',
    'nav.quick.employees': 'الموظفون',
    'nav.quick.payroll': 'مسير الرواتب',
    'nav.quick.attendance': 'الحضور',
    'nav.quick.forms_center': 'النماذج',

    // Nav Items
    'nav.dashboard': 'لوحة التحكم العامة',
    'nav.executive_board': 'لوحة القيادة التنفيذية ومجلس الإدارة (ROI)',
    'nav.approval_workflows': 'مسارات وسلاسل الاعتماد (Workflows)',
    'nav.grievances': 'التظلمات ولجان التحقيق والإنذارات (المادة 209)',
    'nav.budgeting': 'ميزانية الموارد وتكاليف التعيين',
    'nav.rewards_kudos': 'التقدير والمكافآت (Kudos & Rewards)',
    'nav.smart_assets': 'الأصول والعهد الذكية (QR Handover)',
    'nav.ewa_wellness': 'سحب الراتب عند الطلب (EWA)',
    'nav.hse_safety': 'الصحة والسلامة وتفتيش المنشآت (HSE)',
    'nav.exit_interviews': 'محلل مقابلات الخروج (AI Exits)',
    'nav.saudi': 'الامتثال والأنظمة السعودية',
    'nav.wps_audit': 'تدقيق حماية الأجور (SIF & مدد)',
    'nav.medical': 'التأمين الطبي ومجلس الضمان (CCHI)',
    'nav.insurance_catalog': 'دليل شركات التأمين وفئات التغطية',
    'nav.talent_9box': 'مصفوفة المواهب (9-Box) والتعاقب',
    'nav.fleet': 'أسطول المركبات والمخالفات',
    'nav.flexible_telework': 'العمل المرن والعمل عن بعد',
    'nav.retention_ai': 'محلل مخاطر التسرب (AI Predictor)',
    'nav.qiwa_contracts': 'عقود قوى الموحدة',
    'nav.nitaqat_sim': 'محاكي نطاقات والتوطين',
    'nav.ai_letters': 'استوديو الخطابات (AI)',
    'nav.disciplinary': 'لائحة الجزاءات والتحقيق',
    'nav.clearance': 'إخلاء الطرف وإبراء الذمة',
    'nav.work_injuries': 'إصابات العمل (GOSI)',
    'nav.visas': 'التأشيرات وخدمات مقيم',
    'nav.provisions': 'المخصصات (IAS 19)',
    'nav.cost_employment': 'التكلفة الشاملة (TCOE)',
    'nav.overtime': 'العمل الإضافي ورمضان',
    'nav.ai_consultant': 'المستشار القانوني الذكي',
    'nav.reports': 'التقارير والتحليلات',
    'nav.branches': 'الفروع والمواقع',
    'nav.consolidated_reports': 'التقارير المجمعة بين الفروع',
    'nav.systems_hub': 'بوابة أنظمة معصوب حليب',
    'nav.users': 'إدارة المستخدمين',
    'nav.employees': 'الموظفين والإقامات',
    'nav.health_certificates': 'الشهادات الصحية والمتابعة (بلدي)',
    'nav.import_center': 'مركز الاستيراد الموحد (Excel)',
    'nav.payroll': 'مسير الرواتب (WPS)',
    'nav.allowances': 'تكويد البدلات',
    'nav.audit': 'سجل العمليات',
    'nav.loans': 'القروض والسلف',
    'nav.attendance': 'بيانات الحضور',
    'nav.departments': 'الإدارات والأقسام',
    'nav.bonuses': 'المكافآت والجزاءات',
    'nav.leaves': 'الإجازات والغياب',
    'nav.assets': 'الأصول والعهدة',
    'nav.documents': 'الأرشيف والوثائق',
    'nav.forms_center': 'مركز النماذج والطباعة',
    'nav.performance': 'تقييم الأداء',
    'nav.ess': 'بوابة الموظف (ESS)',
    'nav.recruitment': 'التوظيف (ATS)',
    'nav.expenses': 'المطالبات المالية',
    'nav.training': 'التدريب والتطوير',
    'nav.promotions': 'المسار الوظيفي',
    'nav.settings': 'بيانات المنشأة واللوائح',
    'nav.tasks': 'المشاريع والمهام',

    // Expiry Alerts
    'alerts.title': 'مركز التنبيهات الذكية وصلاحية الوثائق',
    'alerts.subtitle': 'متابعة حية لتنبيهات انتهاء الإقامات، التأمين الطبي، وعقود العمل والتراخيص',
    'alerts.critical_expiries': 'وثائق منتهية أو قاربت على الانتهاء',
    'alerts.iqama_expiries': 'إقامات الوافدين',
    'alerts.insurance_expiries': 'وثائق التأمين الطبي',
    'alerts.contract_expiries': 'عقود العمل (قوى)',
    'alerts.vehicle_expiries': 'رخص واشتراطات المركبات',
    'alerts.days_left': 'متبقي {days} يوم',
    'alerts.expired_ago': 'منتهي منذ {days} يوم',
    'alerts.no_critical': 'جميع الوثائق والإقامات سارية ولا توجد تنبيهات حرجة حالياً',
    'alerts.open_hub': 'فتح مركز التنبيهات',

    // Backup & Restore
    'backup.title': 'النسخ الاحتياطي واستعادة قاعدة البيانات',
    'backup.subtitle': 'تصدير نسخة كاملة بصيغة JSON أو استعادة بيانات المنشأة بأمان',
    'backup.export_btn': 'تحميل نسخة احتياطية (JSON)',
    'backup.restore_btn': 'استعادة قاعدة البيانات من ملف',
    'backup.drag_drop': 'اسحب ملف النسخة الاحتياطية (.json) هنا أو انقر للاختيار',
    'backup.success_export': 'تم تحميل النسخة الاحتياطية بنجاح',
    'backup.success_restore': 'تمت استعادة قاعدة البيانات بنجاح، جاري تحديث التطبيق',
    'backup.warning_restore': 'تنبيه: الاستعادة ستقوم باستبدال كافة البيانات الحالية بالبيانات الموجودة بالملف.',

    // PDF Export
    'pdf.modal_title': 'تصدير التقارير وكشوفات الرواتب الرسمية (PDF)',
    'pdf.modal_subtitle': 'إنشاء مستندات معتمدة متوافقة مع الأنظمة السعودية متضمنة شعار المنشأة والختم والـ QR',
    'pdf.select_report': 'اختر نوع التقرير المطلوب:',
    'pdf.report_payroll': 'كشف مسير الرواتب المعتمد (WPS Payroll)',
    'pdf.report_payslip': 'قسائم رواتب الموظفين (Individual Payslips)',
    'pdf.report_financial': 'التقرير المالي ومخصصات نهاية الخدمة والتأمينات',
    'pdf.report_compliance': 'تقرير الامتثال ونطاقات والتوطين (Saudi Compliance)',
    'pdf.report_executive': 'التقرير التنفيذي لمجلس الإدارة ومؤشرات الأداء',
    'pdf.report_budget': 'تقرير ميزانية الموارد البشرية وتكاليف التعيين',
    'pdf.include_stamp': 'تضمين ختم المنشأة المعتمد',
    'pdf.include_qr': 'تضمين رمز الاستجابة السريعة للتحقق (QR Code)',
    'pdf.include_signatures': 'تضمين خانات توقيع المدير العام والمدير المالي',
    'pdf.preview': 'معاينة المستند',
    'pdf.download_now': 'تحميل ملف PDF الآن',
    'pdf.printing': 'جاري إعداد الملف وتجهيز الطباعة...'
  },
  en: {
    // General
    'app.title': 'Saudi HR, Payroll & Compliance System',
    'app.subtitle': 'Comprehensive Enterprise Platform for Saudi Regulations (Qiwa, Mudad, GOSI, CCHI)',
    'app.version': 'Version 2.5.0 (Compliant with Qiwa & Mudad)',
    'country.ksa': 'Kingdom of Saudi Arabia 🇸🇦',
    'currency.sar': 'SAR',
    'btn.save': 'Save Changes',
    'btn.cancel': 'Cancel',
    'btn.delete': 'Delete',
    'btn.edit': 'Edit',
    'btn.add': 'Add New',
    'btn.export_pdf': 'Export Professional PDF',
    'btn.export_excel': 'Export Excel Sheet',
    'btn.download': 'Download',
    'btn.restore': 'Restore Backup',
    'btn.backup': 'Backup Data',
    'btn.close': 'Close',
    'btn.print': 'Print Now',
    'btn.filter': 'Filter & Search',
    'btn.search': 'Search...',
    'btn.quick_settings': 'Quick Settings',
    'btn.renew': 'Renew Now',
    'btn.view_details': 'View Details',
    'btn.mark_read': 'Mark All Read',
    'btn.send_reminder': 'Send Reminder',
    'status.active': 'Active',
    'status.expired': 'Expired',
    'status.expiring_soon': 'Expiring Soon',
    'status.warning': 'Warning',
    'status.critical': 'Critical',
    'status.valid': 'Valid',
    'status.approved': 'Approved',
    'status.pending': 'Pending',
    'status.completed': 'Completed',

    // Login
    'login.title': 'Welcome Back',
    'login.subtitle': 'Sign in to your account',
    'login.username': 'Username',
    'login.usernamePlaceholder': 'Enter your username',
    'login.password': 'Password',
    'login.passwordPlaceholder': 'Enter your password',
    'login.showPassword': 'Show password',
    'login.hidePassword': 'Hide password',
    'login.signIn': 'Sign In',
    'login.signingIn': 'Signing in...',
    'login.error': 'Login failed',
    'login.networkError': 'Network error',
    'login.version': 'Version 2.0.0',

    // Sign-in / account request
    'auth.tab.login': 'Sign in',
    'auth.tab.signup': 'Create account',
    'auth.welcome': 'Welcome back',
    'auth.signupTitle': 'New registration request',
    'auth.signupSubtitle': 'An administrator must approve this request before the account is active',
    'auth.fullName': 'Full name',
    'auth.email': 'Email address',
    'auth.phone': 'Mobile number',
    'auth.username': 'Preferred username',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm password',
    'auth.remember': 'Remember me',
    'auth.forgot': 'Forgot password?',
    'auth.submitRequest': 'Submit registration request',
    'auth.submitting': 'Submitting...',
    'auth.requestSent': 'Request received',
    'auth.requestSentBody': 'Reference number',
    'auth.requestPending': 'It stays pending and the account is not activated until administrator approval.',
    'auth.backToLogin': 'Back to sign in',
    'auth.passwordMismatch': 'Password confirmation does not match',
    'auth.resetTitle': 'Password recovery',
    'auth.resetSubtitle': 'Enter your username and registered email; an administrator will review the request.',
    'auth.resetUsername': 'Username',
    'auth.resetSubmit': 'Send recovery request',
    'auth.resetSent': 'Request received',
    'auth.resetSentBody': 'If the account exists, an administrator will review it. This request does not create a session.',
    'auth.resetClose': 'Close',
    'auth.resetNote': 'The system will not reveal whether the account exists, and no session is created from the request.',
    'auth.identityLine': 'Human Resources & Payroll Management System',

    // Session / sign-out
    'btn.logout': 'Sign out',
    'session.warningTitle': 'Your session is about to end',
    'session.warningHint': 'No activity for 15 minutes',
    'session.warningBody': 'You will be signed out automatically to protect your data. Choose “Keep working” to stay.',
    'session.countdown': 'Time remaining',
    'session.stay': 'Keep working',
    'session.logoutNow': 'Sign out now',

    // Nav Sections (specialised groups)
    'nav.sec.overview': 'Overview & Leadership',
    'nav.sec.people': 'Employee Management',
    'nav.sec.payroll_finance': 'Payroll & Finance',
    'nav.sec.attendance': 'Attendance & Working Time',
    'nav.sec.performance': 'Performance & Development',
    'nav.sec.compliance': 'Saudi Compliance',
    'nav.sec.operations': 'Operations & Smart Tools',
    'nav.sec.main': 'Dashboard, Saudi Compliance & Executive Board',
    'nav.sec.hr': 'Human Resources (HR)',
    'nav.sec.finance': 'Finance & Wage Protection',
    'nav.sec.ess': 'Employee Self-Service',
    'nav.sec.admin': 'Administration & Settings',
    'nav.search_placeholder': 'Search menu...',
    'nav.clear_search': 'Clear search',
    'nav.quick_access': 'Quick access',
    'nav.no_results': 'No matching screens',
    'nav.quick.dashboard': 'Dashboard',
    'nav.quick.employees': 'Employees',
    'nav.quick.payroll': 'Payroll',
    'nav.quick.attendance': 'Attendance',
    'nav.quick.forms_center': 'Forms',

    // Nav Items
    'nav.dashboard': 'Overview Dashboard',
    'nav.executive_board': 'Executive Boardroom (ROI)',
    'nav.approval_workflows': 'Approval Workflows',
    'nav.grievances': 'Grievances & Investigations (Art 209)',
    'nav.budgeting': 'HR Budget & Recruitment Costs',
    'nav.rewards_kudos': 'Kudos & Rewards Hub',
    'nav.smart_assets': 'Smart Assets & QR Handover',
    'nav.ewa_wellness': 'Earned Wage Access (EWA)',
    'nav.hse_safety': 'HSE & Safety Inspections',
    'nav.exit_interviews': 'Exit Interviews Analytics (AI)',
    'nav.saudi': 'Saudi Compliance & Nitaqat',
    'nav.wps_audit': 'Wage Protection Audit (SIF & Mudad)',
    'nav.medical': 'Medical Insurance (CCHI)',
    'nav.insurance_catalog': 'Insurance Companies & Coverage Categories',
    'nav.talent_9box': '9-Box Talent & Succession',
    'nav.fleet': 'Fleet Vehicles & Traffic Fines',
    'nav.flexible_telework': 'Flexible & Telework Shifts',
    'nav.retention_ai': 'Retention Risk Predictor (AI)',
    'nav.qiwa_contracts': 'Unified Qiwa Contracts',
    'nav.nitaqat_sim': 'Nitaqat & Saudization Simulator',
    'nav.ai_letters': 'AI HR Letter Studio',
    'nav.disciplinary': 'Disciplinary Code & Penalties',
    'nav.clearance': 'Employee Exit Clearance',
    'nav.work_injuries': 'Work Injuries (GOSI)',
    'nav.visas': 'Muqeem & Visas Portal',
    'nav.provisions': 'Accounting Provisions (IAS 19)',
    'nav.cost_employment': 'Total Cost of Employment (TCOE)',
    'nav.overtime': 'Overtime & Ramadan Hours',
    'nav.ai_consultant': 'Smart Labor Law Consultant',
    'nav.reports': 'Reports & Analytics',
    'nav.branches': 'Branches & Sites',
    'nav.consolidated_reports': 'Consolidated Branch Reports',
    'nav.systems_hub': 'Masoub Haleeb Systems Hub',
    'nav.users': 'User Management',
    'nav.employees': 'Employees & Iqamas',
    'nav.health_certificates': 'Health Certificates & Tracking (Balady)',
    'nav.import_center': 'Unified Import Center (Excel)',
    'nav.payroll': 'Payroll Processing (WPS)',
    'nav.allowances': 'Allowance Types',
    'nav.audit': 'Audit Logs',
    'nav.loans': 'Loans & Advances',
    'nav.attendance': 'Attendance Records',
    'nav.departments': 'Departments & Units',
    'nav.bonuses': 'Bonuses & Penalties',
    'nav.leaves': 'Leaves & Absence',
    'nav.assets': 'Company Assets',
    'nav.documents': 'Document Archive',
    'nav.forms_center': 'Forms & Print Center',
    'nav.performance': 'Performance Appraisals',
    'nav.ess': 'Employee Self Service (ESS)',
    'nav.recruitment': 'Recruitment (ATS)',
    'nav.expenses': 'Expense Claims',
    'nav.training': 'Training & Development',
    'nav.promotions': 'Career Promotions',
    'nav.settings': 'Company Settings & Rules',
    'nav.tasks': 'Projects & Tasks',

    // Expiry Alerts
    'alerts.title': 'Smart Expiry Alerts & Document Center',
    'alerts.subtitle': 'Real-time tracking of Iqama, Medical Insurance, Contracts, and License expirations',
    'alerts.critical_expiries': 'Expired or Expiring Documents',
    'alerts.iqama_expiries': 'Expatriate Iqamas',
    'alerts.insurance_expiries': 'Medical Insurance Policies',
    'alerts.contract_expiries': 'Employment Contracts (Qiwa)',
    'alerts.vehicle_expiries': 'Vehicle Licenses & Inspections',
    'alerts.days_left': '{days} days remaining',
    'alerts.expired_ago': 'Expired {days} days ago',
    'alerts.no_critical': 'All documents and Iqamas are currently valid with no urgent alerts',
    'alerts.open_hub': 'Open Alerts Center',

    // Backup & Restore
    'backup.title': 'Database Backup & System Restore',
    'backup.subtitle': 'Export complete JSON database snapshots or safely restore enterprise data',
    'backup.export_btn': 'Download Backup Snapshot (JSON)',
    'backup.restore_btn': 'Restore Database from File',
    'backup.drag_drop': 'Drag and drop backup file (.json) here or click to browse',
    'backup.success_export': 'Database backup exported and downloaded successfully',
    'backup.success_restore': 'Database restored successfully, refreshing application...',
    'backup.warning_restore': 'Warning: Restoring will overwrite all existing database records with data from the backup file.',

    // PDF Export
    'pdf.modal_title': 'Official PDF Reports & Statements Export',
    'pdf.modal_subtitle': 'Generate government-compliant PDF documents with company logo, seal, and verification QR',
    'pdf.select_report': 'Select Report Type:',
    'pdf.report_payroll': 'Official Payroll Sheet (WPS Payroll)',
    'pdf.report_payslip': 'Individual Employee Payslips',
    'pdf.report_financial': 'Consolidated Financial & GOSI / EOS Statement',
    'pdf.report_compliance': 'Saudi Compliance & Nitaqat Saudization Report',
    'pdf.report_executive': 'Boardroom Executive Performance & ROI Report',
    'pdf.report_budget': 'Department HR Budgets & Recruitment Costs',
    'pdf.include_stamp': 'Include Official Company Stamp',
    'pdf.include_qr': 'Include Verification QR Code',
    'pdf.include_signatures': 'Include General Manager & CFO Signature Blocks',
    'pdf.preview': 'Document Preview',
    'pdf.download_now': 'Download PDF Document',
    'pdf.printing': 'Preparing document for high-res print/download...'
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved === 'en' || saved === 'ar') ? saved : 'ar';
  });

  const direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('app_lang', language);
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState(prev => (prev === 'ar' ? 'en' : 'ar'));
  };

  const t = (key: string, defaultText?: string): string => {
    const dict = translations[language] || translations.ar;
    if (dict[key]) return dict[key];
    if (defaultText) return defaultText;
    // Fallback to Arabic if English missing or key
    if (translations.ar[key]) return translations.ar[key];
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
