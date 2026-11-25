import { useState, useEffect } from 'react';
import {
  GraduationCap, Award, BookOpen, Plus, User, Clock, CheckCircle,
  RefreshCw, Sparkles, X, AlertTriangle,
} from 'lucide-react';

/**
 * Training is a real register, not placeholder cards. Every enrollment cites
 * an employee and optionally the appraisal that recommended it; completion
 * requires a certificate number and is what a promotion later verifies.
 */
export default function TrainingView() {
  const [courses, setCourses] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: '', category: '', duration_hours: '0', target_position: '' });
  const [enrollForm, setEnrollForm] = useState({ employee_id: 0, course_id: 0, appraisal_id: 0 });
  const [completion, setCompletion] = useState<{ id: number; certificate_number: string; score: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, eRes, empRes, appRes] = await Promise.all([
        fetch('/api/training/courses'),
        fetch('/api/training/enrollments'),
        fetch('/api/employees'),
        fetch('/api/appraisals'),
      ]);
      const [c, e, emp, app] = await Promise.all([
        cRes.json().catch(() => []),
        eRes.json().catch(() => []),
        empRes.json().catch(() => []),
        appRes.json().catch(() => []),
      ]);
      setCourses(Array.isArray(c) ? c : []);
      setEnrollments(Array.isArray(e) ? e : []);
      setEmployees(Array.isArray(emp) ? emp : []);
      setAppraisals(Array.isArray(app) ? app : []);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const post = async (url: string, body: unknown, okText: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'تعذّر تنفيذ الطلب');
    setNotice({ kind: 'ok', text: okText });
    await load();
    return data;
  };

  const addCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await post('/api/training/courses', {
        title: courseForm.title,
        category: courseForm.category || null,
        duration_hours: Number(courseForm.duration_hours) || 0,
        target_position: courseForm.target_position || null,
      }, 'تمت إضافة الدورة');
      setCourseForm({ title: '', category: '', duration_hours: '0', target_position: '' });
      setShowCourseForm(false);
    } catch (e) { setNotice({ kind: 'err', text: (e as Error).message }); }
  };

  const enroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollForm.employee_id) {
      setNotice({ kind: 'err', text: 'اختر الموظف أولاً' });
      return;
    }
    try {
      await post('/api/training/enrollments', {
        employee_id: enrollForm.employee_id,
        course_id: enrollForm.course_id || null,
        appraisal_id: enrollForm.appraisal_id || null,
      }, 'تم تسجيل الموظف في الدورة');
      setEnrollForm({ employee_id: 0, course_id: 0, appraisal_id: 0 });
    } catch (e) { setNotice({ kind: 'err', text: (e as Error).message }); }
  };

  const recommend = async () => {
    try {
      const data = await post('/api/training/recommend-from-appraisal', { threshold: 3 }, 'تم تحديث التوصيات');
      setNotice({ kind: 'ok', text: `تم إنشاء ${data.created ?? 0} توصية تدريب من تقييمات الأداء` });
    } catch (e) { setNotice({ kind: 'err', text: (e as Error).message }); }
  };

  const complete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completion) return;
    if (!completion.certificate_number.trim()) {
      setNotice({ kind: 'err', text: 'رقم الشهادة مطلوب — لا يُكمل تدريب بلا شهادة' });
      return;
    }
    try {
      await post(`/api/training/enrollments/${completion.id}/complete`, {
        certificate_number: completion.certificate_number.trim(),
        score: completion.score ? Number(completion.score) : null,
      }, 'تم توثيق إكمال التدريب');
      setCompletion(null);
    } catch (e) { setNotice({ kind: 'err', text: (e as Error).message }); }
  };

  const completed = enrollments.filter((e) => e.status === 'completed' && e.certificate_number);
  const hours = enrollments.reduce((sum, e) => {
    const course = courses.find((c) => Number(c.id) === Number(e.course_id));
    return sum + (Number(course?.duration_hours) || 0);
  }, 0);

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">التدريب والتطوير</h2>
          <p className="text-slate-500 text-sm mt-1">سجل تدريب موثّق يغذّي الترقية — التوصية تبدأ من تقييم الأداء وتنتهي بشهادة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={recommend} disabled={loading}
            className="flex items-center gap-2 bg-brand-50 text-brand-700 px-4 py-3 rounded-2xl font-bold hover:bg-brand-100 transition-all text-xs disabled:opacity-50">
            <Sparkles className="w-4 h-4" />
            <span>توصيات من التقييمات</span>
          </button>
          <button onClick={() => setShowCourseForm((v) => !v)}
            className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100">
            {showCourseForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            <span>إضافة دورة تدريبية</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-2xl text-sm font-bold flex items-center gap-2 ${
          notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}>
          {notice.kind === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {notice.text}
        </div>
      )}

      {showCourseForm && (
        <form onSubmit={addCourse} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <label className="text-xs font-bold text-slate-600">
            عنوان الدورة
            <input required value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            التصنيف
            <input value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            الساعات
            <input type="number" min="0" value={courseForm.duration_hours}
              onChange={(e) => setCourseForm({ ...courseForm, duration_hours: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            الوظيفة المستهدفة
            <input value={courseForm.target_position} onChange={(e) => setCourseForm({ ...courseForm, target_position: e.target.value })}
              placeholder="اختياري — يربط الشهادة بالترقية"
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="md:col-span-4 bg-brand-600 text-white rounded-xl py-2 text-xs font-black">حفظ الدورة</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'دورات نشطة', value: courses.filter((c) => c.status === 'active').length, color: 'text-brand-600', icon: BookOpen },
          { label: 'تسجيلات تحت التدريب', value: enrollments.filter((e) => e.status !== 'completed').length, color: 'text-brand-600', icon: User },
          { label: 'شهادات مكتملة', value: completed.length, color: 'text-emerald-600', icon: Award },
          { label: 'ساعات موثقة', value: hours, color: 'text-amber-600', icon: Clock },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4"><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
            <div className={`text-2xl font-black ${stat.color} mt-1`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800">تسجيل موظف في دورة</h3>
          <button onClick={() => void load()} className="text-slate-400 hover:text-brand-600"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <form onSubmit={enroll} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="text-xs font-bold text-slate-600">الموظف
            <select value={enrollForm.employee_id} onChange={(e) => setEnrollForm({ ...enrollForm, employee_id: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value={0}>— اختر الموظف —</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">الدورة
            <select value={enrollForm.course_id} onChange={(e) => setEnrollForm({ ...enrollForm, course_id: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value={0}>بدون دورة محددة</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">تقييم مصدر التوصية
            <select value={enrollForm.appraisal_id} onChange={(e) => setEnrollForm({ ...enrollForm, appraisal_id: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value={0}>تسجيل يدوي</option>
              {appraisals.map((a) => (
                <option key={a.id} value={a.id}>{a.employee_name} — {a.rating} ({a.period || a.appraisal_date || 'بدون فترة'})</option>
              ))}
            </select>
          </label>
          <button type="submit" className="bg-slate-900 text-white rounded-xl py-2 text-xs font-black">إضافة تسجيل</button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div key={course.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:border-brand-200 transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl"><GraduationCap className="w-6 h-6" /></div>
              <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black">{course.status || 'active'}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{course.title}</h3>
            <p className="text-slate-500 text-xs mb-4">{course.description || 'لا يوجد وصف مسجل'}</p>
            <div className="flex items-center gap-4 pt-4 border-t border-slate-50 text-[10px] font-bold text-slate-400">
              <span>{course.duration_hours || 0} ساعة</span>
              <span>{course.enrollment_count || 0} مشترك</span>
              {course.target_position && <span>تستهدف: {course.target_position}</span>}
            </div>
          </div>
        ))}
        {!courses.length && <div className="lg:col-span-3 bg-slate-50 p-8 rounded-3xl text-center text-sm font-bold text-slate-400">لا توجد دورات مسجلة بعد</div>}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <h3 className="px-6 py-4 font-black text-slate-800 border-b border-slate-100">سجل التدريب</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50/80 text-xs font-black text-slate-500">
              <tr>
                <th className="px-6 py-3">الموظف</th>
                <th className="px-6 py-3">الدورة / المصدر</th>
                <th className="px-6 py-3">الحالة</th>
                <th className="px-6 py-3">الشهادة</th>
                <th className="px-6 py-3">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollments.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3 font-bold text-slate-700">{row.employee_name}</td>
                  <td className="px-6 py-3 text-xs text-slate-500">
                    {row.course_title || 'دورة غير محددة'}
                    {row.appraisal_id && <span className="mr-2 text-brand-600">• من تقييم {row.appraisal_rating}</span>}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
                      row.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>{row.status === 'completed' ? 'مكتمل' : row.status}</span>
                  </td>
                  <td className="px-6 py-3 font-mono text-[11px] text-slate-600">{row.certificate_number || '—'}</td>
                  <td className="px-6 py-3">
                    {row.status === 'completed' ? (
                      <span className="text-emerald-600 text-xs font-black">جاهز للترقية</span>
                    ) : (
                      <button onClick={() => setCompletion({ id: row.id, certificate_number: '', score: '' })}
                        className="bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-[11px] font-black hover:bg-brand-100">
                        توثيق الإكمال
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!enrollments.length && <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">لا توجد تسجيلات بعد</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {completion && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" dir="rtl">
          <form onSubmit={complete} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-800">توثيق إكمال التدريب</h3>
              <button type="button" onClick={() => setCompletion(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <label className="block text-xs font-bold text-slate-600">رقم الشهادة
              <input required value={completion.certificate_number}
                onChange={(e) => setCompletion({ ...completion, certificate_number: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-bold text-slate-600">الدرجة (اختياري)
              <input type="number" value={completion.score}
                onChange={(e) => setCompletion({ ...completion, score: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="w-full bg-brand-600 text-white rounded-xl py-3 text-xs font-black">حفظ الشهادة</button>
          </form>
        </div>
      )}
    </div>
  );
}
