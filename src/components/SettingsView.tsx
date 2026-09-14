import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Shield, 
  Clock, 
  Calendar, 
  CheckCircle, 
  Save, 
  Info, 
  Building2, 
  Landmark, 
  ShieldCheck, 
  FileText,
  Database,
  Download,
  Upload,
  Globe,
  Printer,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { BackupRestoreModal } from './BackupRestoreModal';
import { PdfExportModal } from './PdfExportModal';

export default function SettingsView() {
  const { t, language, setLanguage, direction } = useLanguage();
  const [settings, setSettings] = useState<Record<string, string>>({
    org_name: 'شركة المسار الرقمي للحلول المتكاملة',
    cr_number: '1010892341',
    unified_number_700: '7001928374',
    mol_establishment_id: '12-98472',
    gosi_establishment_id: '80923419',
    cchi_policy_number: 'POL-TAW-2026-99',
    nitaqat_category: 'أخضر مرتفع',
    saudi_gosi_emp_rate: '0.0975',
    saudi_gosi_comp_rate: '0.1175',
    expat_gosi_comp_rate: '0.02',
    work_permit_annual_fee: '9600',
    iqama_renewal_fee: '650',
    currency: 'SAR',
    country: 'المملكة العربية السعودية'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');
  const [clearMessage, setClearMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleClearData = async () => {
    setClearing(true);
    setClearMessage(null);
    try {
      const res = await fetch('/api/admin/clear-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: clearPassword, confirm_text: clearConfirm })
      });
      const data = await res.json();
      if (data.success) {
        setClearMessage({ type: 'success', text: `تم تفريغ النظام من البيانات (${data.cleared_tables} جدول)` });
        setClearPassword(''); setClearConfirm('');
      } else {
        setClearMessage({ type: 'error', text: data.error || 'فشل التفريغ' });
      }
    } catch (e) {
      setClearMessage({ type: 'error', text: (e as Error).message });
    } finally { setClearing(false); }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setMessage(language === 'ar' ? 'تم حفظ وتحديث إعدادات النظام والامتثال بنجاح' : 'System settings updated successfully');
      setTimeout(() => setMessage(''), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans" dir={direction}>
      {/* Header */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-3xl">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {language === 'ar' ? 'إعدادات المنشأة والامتثال للأنظمة السعودية' : 'Company Settings & Saudi Compliance'}
            </h2>
            <p className="text-slate-500 text-sm">
              {language === 'ar' ? 'أرقام الربط الحكومي (قوى، التأمينات GOSI، مدد، الضمان CCHI) واللوائح' : 'Government Integration (Qiwa, GOSI, Mudad, CCHI) & Rules'}
            </p>
          </div>
        </div>

        {message && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{message}</span>
          </div>
        )}
      </div>

      {/* Quick Action Utilities Row (i18n, Backup/Restore, PDF Export) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Language & Localization */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-800">
              {language === 'ar' ? 'لغة النظام واتجاه الواجهة' : 'System Language & Direction'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'ar' ? 'التبديل الفوري بين اللغة العربية والإنجليزية مع تعديل اتجاه الواجهة (RTL/LTR)' : 'Switch dynamically between Arabic and English with full RTL/LTR support'}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => setLanguage('ar')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                language === 'ar' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🇸🇦 العربية</span>
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                language === 'en' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🇬🇧 English</span>
            </button>
          </div>
        </div>

        {/* Card 2: Database Backup & Restore */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-800">{t('backup.title')}</h3>
            <p className="text-xs text-slate-500 mt-1">{t('backup.subtitle')}</p>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowBackupModal(true)}
              className="w-full py-2.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>{language === 'ar' ? 'إدارة النسخ الاحتياطي والاستعادة' : 'Manage Backup & Restore'}</span>
            </button>
          </div>
        </div>

        {/* Card 3: PDF Statements & Official Reports */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-800">
              {language === 'ar' ? 'تصدير التقارير والمسيرات (PDF)' : 'Export Official PDF Reports'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'ar' ? 'كشوفات الرواتب الرسمية، قسائم الموظفين، والتقارير المالية المعتمدة بختم المنشأة' : 'Generate stamped official payroll sheets, employee payslips, and compliance reports'}
            </p>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowPdfModal(true)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
            >
              <Printer className="w-4 h-4" />
              <span>{language === 'ar' ? 'فتح منصة تصدير PDF' : 'Open PDF Export Studio'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Card 1: Official Saudi Establishment Profile */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">بيانات المنشأة الرسمية (السجل والرقم الموحد)</h3>
                <p className="text-xs text-slate-400">تستخدم في تصدير كشوفات الرواتب الرسمية والخطابات ومسيرات مدد</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">اسم المنشأة / الشركة بالكامل</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-bold text-slate-800 text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  value={settings.org_name || ''}
                  onChange={e => setSettings({ ...settings, org_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم السجل التجاري (CR)</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.cr_number || ''}
                    onChange={e => setSettings({ ...settings, cr_number: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">الرقم الوطني الموحد (700)</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.unified_number_700 || ''}
                    onChange={e => setSettings({ ...settings, unified_number_700: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم المنشأة في وزارة الموارد (قوى)</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.mol_establishment_id || ''}
                    onChange={e => setSettings({ ...settings, mol_establishment_id: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رقم اشتراك التأمينات (GOSI)</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.gosi_establishment_id || ''}
                    onChange={e => setSettings({ ...settings, gosi_establishment_id: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">رقم بوليصة التأمين الطبي الموحدة (مجلس الضمان CCHI)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                  value={settings.cchi_policy_number || ''}
                  onChange={e => setSettings({ ...settings, cchi_policy_number: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Saudi GOSI & Government Tariffs */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">نسب التأمينات والرسوم الحكومية المعتمدة</h3>
                <p className="text-xs text-slate-400">تستخدم في الحسابات التلقائية لمسيرات الرواتب والمخصصات</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">استقطاع الموظف السعودي للتأمينات (GOSI)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                      value={settings.saudi_gosi_emp_rate || '0.0975'}
                      onChange={e => setSettings({ ...settings, saudi_gosi_emp_rate: e.target.value })}
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">9.75%</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">مساهمة المنشأة في تأمينات السعودي</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                      value={settings.saudi_gosi_comp_rate || '0.1175'}
                      onChange={e => setSettings({ ...settings, saudi_gosi_comp_rate: e.target.value })}
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">11.75%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">نسبة الأخطار المهنية للوافد (صاحب العمل)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.expat_gosi_comp_rate || '0.02'}
                    onChange={e => setSettings({ ...settings, expat_gosi_comp_rate: e.target.value })}
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">2.00%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">المقابل المالي السنوي لرخصة العمل (ر.س)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.work_permit_annual_fee || 9600}
                    onChange={e => setSettings({ ...settings, work_permit_annual_fee: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">رسوم تجديد الإقامة للجوازات (ر.س)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-mono font-bold text-slate-800 text-sm"
                    value={settings.iqama_renewal_fee || 650}
                    onChange={e => setSettings({ ...settings, iqama_renewal_fee: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Country & Currency */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Landmark className="w-5 h-5 text-emerald-600" /> الدولة والعملة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">الدولة</label>
              <select
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-bold text-slate-800 text-sm"
                value={settings.country || ''}
                onChange={e => setSettings({ ...settings, country: e.target.value })}
              >
                <option value="المملكة العربية السعودية">المملكة العربية السعودية</option>
                <option value="الإمارات">الإمارات</option>
                <option value="مصر">مصر</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">العملة</label>
              <select
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none font-bold text-slate-800 text-sm"
                value={settings.currency || 'SAR'}
                onChange={e => setSettings({ ...settings, currency: e.target.value })}
              >
                <option value="SAR">ريال سعودي (ر.س)</option>
                <option value="EGP">جنيه مصري (ج.م)</option>
                <option value="AED">درهم إماراتي (د.إ)</option>
                <option value="KWD">دينار كويتي (د.ك)</option>
                <option value="QAR">ريال قطري (ر.ق)</option>
                <option value="BHD">دينار بحريني (د.ب)</option>
                <option value="OMR">ريال عماني (ر.ع)</option>
                <option value="USD">دولار أمريكي ($)</option>
              </select>
              <p className="text-[11px] text-slate-400">تظهر هذه العملة في لوحة التحكم والتقارير.</p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3 pt-2">
          <button 
            type="submit" 
            disabled={isLoading}
            className="px-10 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isLoading ? 'جاري الحفظ...' : t('btn.save')}</span>
          </button>
        </div>
      </form>

      {/* Admin Danger Zone */} 
      <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-red-600 text-white rounded-2xl"><ShieldAlert className="w-6 h-6" /></div>
          <div>
            <h3 className="font-black text-red-800 text-lg">منطقة مدير النظام (إجراء خطير)</h3>
            <p className="text-xs text-red-600 font-bold">تفريغ النظام من جميع البيانات — لا يمكن التراجع</p>
          </div>
        </div>
        <p className="text-sm text-red-700 mb-4">يحذف جميع الموظفين والرواتب والحضور والوثائق والتنبيهات والسجلات نهائياً. تُبقى بيانات الإعدادات والفروع والأقسام. يتطلب كلمة مرور مدير النظام وتأكيد كتابي.</p>
        <button onClick={() => { setShowClearModal(true); setClearMessage(null); }} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-red-200 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> تفريغ النظام من البيانات
        </button>
      </div>

      {/* Modals */}
      {showBackupModal && (
        <BackupRestoreModal 
          isOpen={showBackupModal}
          onClose={() => setShowBackupModal(false)}
        />
      )}

      {showPdfModal && (
        <PdfExportModal 
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-black text-red-700 flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> تأكيد تفريغ البيانات</h3>
              <button onClick={() => setShowClearModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-5">هذا الإجراء <b className="text-red-600">نهائي ولا يمكن التراجع عنه</b>. سيتم حذف جميع بيانات الموظفين والرواتب والحضور والوثائق والسجلات.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">كلمة مرور مدير النظام</label>
                <input type="password" value={clearPassword} onChange={e => setClearPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">اكتب كلمة (تفريغ) للتأكيد</label>
                <input type="text" value={clearConfirm} onChange={e => setClearConfirm(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold" placeholder="تفريغ" />
              </div>
              {clearMessage && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold ${clearMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{clearMessage.text}</div>
              )}
              <button onClick={handleClearData} disabled={clearing}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> {clearing ? 'جارٍ التفريغ...' : 'تفريغ البيانات نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
