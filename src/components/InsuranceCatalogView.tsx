import { useState, useEffect, FormEvent } from 'react';
import {
  Building2, Layers3, Plus, Edit2, Trash2, X, ShieldCheck,
  ToggleLeft, ToggleRight, AlertCircle, RefreshCw, CheckCircle2
} from 'lucide-react';

interface Company {
  id: number;
  name: string;
  is_active: boolean;
  employee_count: number;
  policy_count: number;
}

interface Category {
  id: number;
  code: string;
  label_ar: string;
  is_active: boolean;
  employee_count: number;
  policy_count: number;
}

type Tab = 'companies' | 'categories';

export default function InsuranceCatalogView() {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [labelAr, setLabelAr] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [cRes, catRes] = await Promise.all([
        fetch('/api/medical/insurance-companies'),
        fetch('/api/medical/coverage-categories')
      ]);
      if (!cRes.ok || !catRes.ok) throw new Error('تعذّر تحميل دليل التأمين الطبي');
      setCompanies(await cRes.json());
      setCategories(await catRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const mutate = async (url: string, body: unknown, method: string) => {
    setError('');
    setNotice('');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `تعذّر إتمام العملية (${res.status})`);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setLabelAr('');
    setShowForm(true);
  };

  const openEdit = (item: Company | Category) => {
    setEditingId(item.id);
    if (tab === 'companies') {
      setName((item as Company).name);
    } else {
      setCode((item as Category).code);
      setLabelAr((item as Category).label_ar);
    }
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (tab === 'companies') {
        const url = editingId
          ? `/api/medical/insurance-companies/${editingId}`
          : '/api/medical/insurance-companies';
        await mutate(url, { name: name.trim() }, editingId ? 'PUT' : 'POST');
        setNotice(editingId ? 'تم تحديث شركة التأمين وتعديل ارتباطات الموظفين' : 'تمت إضافة شركة التأمين');
      } else {
        const url = editingId
          ? `/api/medical/coverage-categories/${editingId}`
          : '/api/medical/coverage-categories';
        await mutate(url, { code: code.trim(), label_ar: labelAr.trim() }, editingId ? 'PUT' : 'POST');
        setNotice(editingId ? 'تم تحديث فئة التغطية وتعديل ارتباطات الموظفين' : 'تمت إضافة فئة التغطية');
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    }
  };

  const toggleActive = async (item: Company | Category) => {
    try {
      if (tab === 'companies') {
        const c = item as Company;
        await mutate(`/api/medical/insurance-companies/${c.id}`, { name: c.name, is_active: !c.is_active }, 'PUT');
      } else {
        const c = item as Category;
        await mutate(`/api/medical/coverage-categories/${c.id}`, { code: c.code, label_ar: c.label_ar, is_active: !c.is_active }, 'PUT');
      }
      setNotice('تم تحديث حالة الخيار');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحديث الحالة');
    }
  };

  const handleDelete = async (item: Company | Category) => {
    const label = tab === 'companies' ? (item as Company).name : (item as Category).label_ar;
    if (!confirm(`هل أنت متأكد من حذف «${label}»؟ لن يُحذف أي سجل موظف، وسيُمنع الحذف إن كان الخيار مستخدماً.`)) return;
    try {
      await mutate(tab === 'companies'
        ? `/api/medical/insurance-companies/${item.id}`
        : `/api/medical/coverage-categories/${item.id}`, {}, 'DELETE');
      setNotice('تم حذف الخيار');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحذف');
    }
  };

  const isUsed = (item: Company | Category) => item.employee_count > 0 || item.policy_count > 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              دليل شركات التأمين وفئات شبكة العلاج والتغطية
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              الخيارات المعتمدة في شاشة الموظف ووثائق مجلس الضمان الصحي (CCHI). التعديل ينعكس على القوائم فوراً.
            </p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {tab === 'companies' ? 'إضافة شركة تأمين' : 'إضافة فئة تغطية'}
        </button>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-4">
        <button
          onClick={() => { setTab('companies'); setShowForm(false); setError(''); setNotice(''); }}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            tab === 'companies' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 dark:text-slate-400'
          }`}
        >
          <Building2 className="w-4 h-4" />
          شركات التأمين ({companies.length})
        </button>
        <button
          onClick={() => { setTab('categories'); setShowForm(false); setError(''); setNotice(''); }}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            tab === 'categories' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 dark:text-slate-400'
          }`}
        >
          <Layers3 className="w-4 h-4" />
          فئات التغطية ({categories.length})
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-brand-100 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 dark:text-slate-100">
              {editingId ? 'تعديل الخيار' : tab === 'companies' ? 'شركة تأمين جديدة' : 'فئة تغطية جديدة'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          {tab === 'companies' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">اسم شركة التأمين</label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: شركة تأمين سعودية معتمدة من CCHI"
                className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl text-sm"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">الرمز المخزن في سجل الموظف</label>
                <input
                  required
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="مثال: Class E"
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">الاسم المعروض بالعربية</label>
                <input
                  required
                  type="text"
                  value={labelAr}
                  onChange={e => setLabelAr(e.target.value)}
                  placeholder="مثال: فئة E - تغطية أساسية"
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl text-sm"
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-slate-900 dark:bg-brand-600 text-white rounded-xl text-sm font-bold">
              {editingId ? 'تحديث' : 'حفظ'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold">
              إلغاء
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            {tab === 'companies' ? 'شركات التأمين المعتمدة' : 'فئات شبكة العلاج والتغطية'}
          </h2>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="p-3.5">{tab === 'companies' ? 'شركة التأمين' : 'الفئة'}</th>
                <th className="p-3.5">الاستخدام</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {tab === 'companies' ? companies.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-3.5 font-bold text-slate-800 dark:text-slate-100">{c.name}</td>
                  <td className="p-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {c.employee_count} موظف · {c.policy_count} وثيقة
                  </td>
                  <td className="p-3.5">
                    <button onClick={() => toggleActive(c)} className="flex items-center gap-1.5 text-xs font-semibold">
                      {c.is_active
                        ? <ToggleRight className="w-5 h-5 text-emerald-600" />
                        : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                      <span className={c.is_active ? 'text-emerald-600' : 'text-slate-500'}>{c.is_active ? 'مفعّلة' : 'معطّلة'}</span>
                    </button>
                  </td>
                  <td className="p-3.5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-slate-800 rounded-lg" title="تعديل">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={isUsed(c)}
                        title={isUsed(c) ? 'لا يمكن حذف خيار مستخدم؛ استخدم الإلغاء' : 'حذف'}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : categories.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-3.5">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{c.label_ar}</span>
                    <span className="mr-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded" dir="ltr">{c.code}</span>
                  </td>
                  <td className="p-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {c.employee_count} موظف · {c.policy_count} وثيقة
                  </td>
                  <td className="p-3.5">
                    <button onClick={() => toggleActive(c)} className="flex items-center gap-1.5 text-xs font-semibold">
                      {c.is_active
                        ? <ToggleRight className="w-5 h-5 text-emerald-600" />
                        : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                      <span className={c.is_active ? 'text-emerald-600' : 'text-slate-500'}>{c.is_active ? 'مفعّلة' : 'معطّلة'}</span>
                    </button>
                  </td>
                  <td className="p-3.5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-slate-800 rounded-lg" title="تعديل">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={isUsed(c)}
                        title={isUsed(c) ? 'لا يمكن حذف خيار مستخدم؛ استخدم الإلغاء' : 'حذف'}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {((tab === 'companies' ? companies : categories).length === 0) && !loading && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-400">لا توجد خيارات معرّفة بعد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        <strong className="text-slate-700 dark:text-slate-200">ملاحظة:</strong> إلغاء التفعيل يخفي الخيار من قوائم الإضافة فقط ولا يغيّر بيانات الموظفين الحالية. تعديل الاسم أو الرمز يحدّث سجلات الموظفين والوثائق المرتبطة به تلقائياً.
      </div>
    </div>
  );
}
