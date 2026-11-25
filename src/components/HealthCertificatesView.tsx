import { useState, useEffect, FormEvent, useMemo } from 'react';
import {
  Stethoscope, Plus, Users, AlertCircle, CheckCircle2, Trash2, Clock,
  FileText, X, RefreshCw, Search, BadgeCheck, Pencil, CalendarClock
} from 'lucide-react';
import type { HealthCertificate } from '../types';

type StatusFilter = 'all' | 'valid' | 'expiring' | 'expired';

const AUTHORITIES = ['البلدية (بلدي)', 'أجير', 'وزارة الصحة', 'مستشفى معتمد', 'أخرى'];

export default function HealthCertificatesView() {
  const [certs, setCerts] = useState<HealthCertificate[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'registry' | 'missing'>('registry');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HealthCertificate | null>(null);
  const [form, setForm] = useState({
    employee_id: '',
    certificate_number: '',
    profession_on_cert: '',
    issue_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    issuing_authority: AUTHORITIES[0],
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [certRes, statRes, empRes] = await Promise.all([
        fetch('/api/health-certificates'),
        fetch('/api/health-certificates/stats'),
        fetch('/api/employees')
      ]);
      if (certRes.ok) setCerts(await certRes.json());
      if (statRes.ok) setStats(await statRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error('Error fetching health certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAdd = (employeeId?: number) => {
    const emp = employees.find(e => e.id === employeeId);
    setEditing(null);
    setForm({
      employee_id: employeeId ? String(employeeId) : '',
      certificate_number: '',
      profession_on_cert: emp?.position || emp?.job_title || '',
      issue_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      issuing_authority: AUTHORITIES[0],
      notes: ''
    });
    setShowModal(true);
  };

  const openEdit = (cert: HealthCertificate) => {
    setEditing(cert);
    setForm({
      employee_id: String(cert.employee_id),
      certificate_number: cert.certificate_number || '',
      profession_on_cert: cert.profession_on_cert || '',
      issue_date: cert.issue_date || '',
      expiry_date: cert.expiry_date,
      issuing_authority: cert.issuing_authority || AUTHORITIES[0],
      notes: cert.notes || ''
    });
    setShowModal(true);
  };

  const openRenew = (cert: HealthCertificate) => {
    setEditing(null);
    setForm({
      employee_id: String(cert.employee_id),
      certificate_number: '',
      profession_on_cert: cert.profession_on_cert || cert.employee_position || '',
      issue_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      issuing_authority: cert.issuing_authority || AUTHORITIES[0],
      notes: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.employee_id || !form.expiry_date) return;
    const payload = {
      employee_id: Number(form.employee_id),
      certificate_number: form.certificate_number,
      profession_on_cert: form.profession_on_cert,
      issue_date: form.issue_date,
      expiry_date: form.expiry_date,
      issuing_authority: form.issuing_authority,
      notes: form.notes,
      status: editing ? (editing.status === 'active' ? 'active' : editing.status) : 'active'
    };
    try {
      const res = editing
        ? await fetch(`/api/health-certificates/${editing.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          })
        : await fetch('/api/health-certificates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الشهادة الصحية؟')) return;
    try {
      const res = await fetch(`/api/health-certificates/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const statusBadge = (cert: HealthCertificate) => {
    if (cert.status === 'replaced') {
      return <span className="bg-slate-100 text-slate-500 text-xs px-2.5 py-0.5 rounded-full font-medium">مستبدلة</span>;
    }
    switch (cert.cert_status) {
      case 'valid':
        return (
          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> سارية
          </span>
        );
      case 'expiring':
        return (
          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> تنتهي بعد {cert.days_left} يوم
          </span>
        );
      default:
        return (
          <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> منتهية
          </span>
        );
    }
  };

  const filteredCerts = useMemo(() => {
    let list = certs;
    if (activeTab === 'registry') {
      if (statusFilter !== 'all') {
        list = list.filter(c =>
          statusFilter === 'valid' ? c.cert_status === 'valid' && c.status === 'active'
            : statusFilter === 'expiring' ? c.cert_status === 'expiring' && c.status === 'active'
            : c.cert_status === 'expired' && c.status === 'active'
        );
      }
    }
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(c =>
        (c.employee_name || '').includes(q) ||
        (c.certificate_number || '').includes(q) ||
        (c.employee_position || '').includes(q)
      );
    }
    return list;
  }, [certs, statusFilter, search, activeTab]);

  const kpi = (label: string, value: number, Icon: any, cls: string, sub?: string) => (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={`p-1.5 rounded-lg ${cls}`}><Icon className="w-5 h-5" /></span>
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Stethoscope className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              الشهادات الصحية ومتابعتها
              <span className="text-xs bg-rose-100 text-rose-800 font-semibold px-2.5 py-0.5 rounded-full">
                اشتراط البلدية للمطاعم وخدمات الوجبات
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              متابعة سريان الشهادات الصحية للموظفين الخاضعين لتداول الطعام فقط، التجديد قبل الانتهاء، وتنبيهات فورية للمنتهية وغير المسجلين.
            </p>
          </div>
        </div>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm self-start md:self-center"
        >
          <Plus className="w-4 h-4" />
          إصدار / تسجيل شهادة
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {kpi('شهادات سارية', stats.valid, CheckCircle2, 'bg-emerald-50 text-emerald-600')}
          {kpi('قاربت على الانتهاء (60 يوم)', stats.expiring, CalendarClock, 'bg-amber-50 text-amber-600', 'تتطلب تجديدًا قريبًا')}
          {kpi('شهادات منتهية', stats.expired, AlertCircle, 'bg-rose-50 text-rose-600', 'ممنوع العمل قبل التجديد')}
          {kpi('بدون شهادة', stats.missing, Users, 'bg-slate-100 text-slate-600', `من إجمالي ${stats.total_employees} موظف خاضع`)}
          {kpi('نسبة الالتزام', stats.coverage_pct, BadgeCheck, 'bg-sky-50 text-sky-600', 'موظفون بشهادة سارية')}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('registry')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'registry' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          سجل الشهادات ({certs.length})
        </button>
        <button
          onClick={() => setActiveTab('missing')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'missing' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          بدون شهادة صحية ({stats?.missing ?? 0})
        </button>
      </div>

      {/* Registry tab */}
      {activeTab === 'registry' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                ['all', 'الكل'], ['valid', 'سارية'], ['expiring', 'قاربت'], ['expired', 'منتهية']
              ] as [StatusFilter, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                    statusFilter === val
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو رقم الشهادة..."
                className="pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-sm w-full md:w-64 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">رقم الشهادة</th>
                  <th className="p-3.5">الجهة المصدرة</th>
                  <th className="p-3.5">تاريخ الإصدار</th>
                  <th className="p-3.5">تاريخ الانتهاء</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCerts.map(cert => (
                  <tr key={cert.id} className={`hover:bg-slate-50/50 transition-colors ${cert.status !== 'active' ? 'opacity-60' : ''}`}>
                    <td className="p-3.5">
                      <div className="font-medium text-slate-800">{cert.employee_name}</div>
                      <div className="text-xs text-slate-400">{cert.profession_on_cert || cert.employee_position}</div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{cert.certificate_number || '—'}</td>
                    <td className="p-3.5 text-slate-600">{cert.issuing_authority}</td>
                    <td className="p-3.5 text-slate-600 font-mono text-xs">{cert.issue_date || '—'}</td>
                    <td className="p-3.5 font-mono text-slate-700">{cert.expiry_date}</td>
                    <td className="p-3.5">{statusBadge(cert)}</td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {cert.status === 'active' && (
                          <button
                            onClick={() => openRenew(cert)}
                            className="text-emerald-600 hover:text-emerald-700 p-1.5 hover:bg-emerald-50 rounded-lg transition-all"
                            title="تجديد (إصدار شهادة جديدة)"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(cert)}
                          className="text-slate-500 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
                          title="تعديل"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cert.id)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCerts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {loading ? 'جارٍ التحميل...' : 'لا توجد شهادات مسجلة — ابدأ بإصدار شهادة جديدة'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Missing tab */}
      {activeTab === 'missing' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              الموظفون الخاضعون لتداول الطعام وبدون شهادة صحية سارية — ممنوع توظيفهم في الأعمال الغذائية قبل الاستخراج
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">المهنة</th>
                  <th className="p-3.5">الجنسية</th>
                  <th className="p-3.5 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.missing_employees || []).map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 font-medium text-slate-800">{emp.name}</td>
                    <td className="p-3.5 text-slate-600">{emp.position || '—'}</td>
                    <td className="p-3.5 text-slate-600">{emp.nationality || '—'}</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => openAdd(emp.id)}
                        className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        تسجيل شهادة
                      </button>
                    </td>
                  </tr>
                ))}
                {(stats?.missing_employees || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <span className="text-emerald-700 font-bold">جميع الموظفين الخاضعين لديهم شهادة صحية سارية</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit / Renew Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-rose-600" />
                {editing ? 'تعديل شهادة صحية' : 'إصدار / تسجيل شهادة صحية'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف *</label>
                <select
                  required
                  disabled={!!editing}
                  value={form.employee_id}
                  onChange={e => {
                    const emp = employees.find(x => x.id === Number(e.target.value));
                    setForm({ ...form, employee_id: e.target.value, profession_on_cert: emp?.position || emp?.job_title || form.profession_on_cert });
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white disabled:opacity-70"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.position || 'موظف'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الشهادة</label>
                  <input
                    type="text"
                    value={form.certificate_number}
                    onChange={e => setForm({ ...form, certificate_number: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-mono"
                    placeholder="كما يظهر في شهادة بلدي"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الجهة المصدرة</label>
                  <select
                    value={form.issuing_authority}
                    onChange={e => setForm({ ...form, issuing_authority: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    {AUTHORITIES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">المهنة في الشهادة</label>
                <input
                  type="text"
                  value={form.profession_on_cert}
                  onChange={e => setForm({ ...form, profession_on_cert: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  placeholder="مثال: عامل تحضير أطعمة"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ الإصدار</label>
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={e => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">تاريخ الانتهاء *</label>
                  <input
                    type="date"
                    required
                    value={form.expiry_date}
                    onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  placeholder="فحوصات، ملاحظات الفحص الطبي..."
                />
              </div>

              {!editing && (
                <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  عند التسجيل، أي شهادة سارية سابقة لنفس الموظف تُعلَّم تلقائيًا كـ «مستبدلة» ويُحدَّث تاريخ الانتهاء في ملف الموظف.
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-all"
                >
                  {editing ? 'حفظ التعديلات' : 'حفظ الشهادة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
