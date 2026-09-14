import { useState, useEffect, FormEvent } from 'react';
import { 
  Sparkles, Users, Award, ShieldAlert, Plus, 
  TrendingUp, Compass, CheckCircle2, ChevronRight,
  Layers, X, UserCheck, Briefcase, Star, Edit3, Trash2
} from 'lucide-react';
import type { SuccessionPlanItem } from '../types';

export default function TalentMatrix9BoxView() {
  const [data, setData] = useState<any>(null);
  const [successionPlans, setSuccessionPlans] = useState<SuccessionPlanItem[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'9box' | 'succession'>('9box');
  const [selectedBox, setSelectedBox] = useState<string | null>(null);

  // Assessment Modal
  const [showAssessModal, setShowAssessModal] = useState(false);
  const [assessForm, setAssessForm] = useState({
    employee_id: '',
    performance_score: 3,
    potential_score: 3,
    key_strengths: 'قيادة الفرق، التفكير الاستراتيجي، الالتزام العالي',
    development_needs: 'إدارة الميزانيات المتقدمة، التدريب التنفيذي',
    readiness_timeline: 'ready_now'
  });

  // Succession Plan Modal
  const [showSuccessionModal, setShowSuccessionModal] = useState(false);
  const [successionForm, setSuccessionForm] = useState({
    critical_role_title: '',
    department_id: '',
    current_holder_id: '',
    risk_level: 'high',
    primary_successor_id: '',
    secondary_successor_id: '',
    readiness_status: 'ready_1_year',
    development_action_plan: 'برنامج إعداد القيادات التنفيذية وتدوير المهام',
    is_saudization_target: 1
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [nineRes, succRes, empRes, deptRes] = await Promise.all([
        fetch('/api/talent/9box'),
        fetch('/api/talent/succession'),
        fetch('/api/employees'),
        fetch('/api/departments')
      ]);

      if (nineRes.ok) setData(await nineRes.json());
      if (succRes.ok) setSuccessionPlans(await succRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
    } catch (err) {
      console.error('Error loading talent matrix:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveAssessment = async (e: FormEvent) => {
    e.preventDefault();
    if (!assessForm.employee_id) return;
    try {
      const res = await fetch('/api/talent/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessForm)
      });
      if (res.ok) {
        setShowAssessModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSuccession = async (e: FormEvent) => {
    e.preventDefault();
    if (!successionForm.critical_role_title) return;
    try {
      const res = await fetch('/api/talent/succession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successionForm)
      });
      if (res.ok) {
        setShowSuccessionModal(false);
        setSuccessionForm({
          critical_role_title: '',
          department_id: '',
          current_holder_id: '',
          risk_level: 'high',
          primary_successor_id: '',
          secondary_successor_id: '',
          readiness_status: 'ready_1_year',
          development_action_plan: 'برنامج إعداد القيادات التنفيذية وتدوير المهام',
          is_saudization_target: 1
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSuccession = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف خطة التعاقب الوظيفي لهذا المنصب؟')) return;
    try {
      const res = await fetch(`/api/talent/succession/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // 9-Box Grid Definitions
  const boxes = [
    { key: 'dilemma', title: 'علامة استفهام / لغز (Enigma)', perf: 1, pot: 3, color: 'bg-amber-50 border-amber-200 text-amber-900', badge: 'إمكانات عالية / أداء منخفض', icon: '❓' },
    { key: 'high_potential', title: 'موهبة نمو واعدة (Growth Talent)', perf: 2, pot: 3, color: 'bg-indigo-50 border-indigo-200 text-indigo-900', badge: 'إمكانات عالية / أداء جيد', icon: '🚀' },
    { key: 'star', title: 'النجم المستقبلي (Top Star)', perf: 3, pot: 3, color: 'bg-emerald-50 border-emerald-300 text-emerald-950', badge: 'إمكانات فائقة / أداء استثنائي', icon: '⭐' },
    
    { key: 'inconsistent', title: 'أداء غير مستقر (Inconsistent)', perf: 1, pot: 2, color: 'bg-rose-50 border-rose-200 text-rose-900', badge: 'إمكانات متوسطة / أداء منخفض', icon: '⚠️' },
    { key: 'core_player', title: 'اللاعب الأساسي (Core Player)', perf: 2, pot: 2, color: 'bg-blue-50 border-blue-200 text-blue-900', badge: 'عمود فقري للمؤسسة', icon: '💎' },
    { key: 'high_performer', title: 'متميز عالي الإنجاز (High Performer)', perf: 3, pot: 2, color: 'bg-teal-50 border-teal-200 text-teal-900', badge: 'إمكانات جيدة / أداء فائق', icon: '🏆' },
    
    { key: 'underperformer', title: 'منخفض الأداء (Underperformer)', perf: 1, pot: 1, color: 'bg-slate-100 border-slate-300 text-slate-900', badge: 'يتطلب خطة تصحيحية عاجلة', icon: '🛑' },
    { key: 'effective', title: 'فعال ومستقر (Effective)', perf: 2, pot: 1, color: 'bg-slate-50 border-slate-200 text-slate-800', badge: 'مستقر في موقعه الحالي', icon: '🎯' },
    { key: 'solid_performer', title: 'خبير ومرجع موثوق (Trusted Pro)', perf: 3, pot: 1, color: 'bg-cyan-50 border-cyan-200 text-cyan-900', badge: 'أداء عالٍ / مستقر تخصصياً', icon: '🏅' },
  ];

  const getReadinessLabel = (rd: string) => {
    switch (rd) {
      case 'ready_now': return 'جاهز للترقية فوراً';
      case 'ready_1_year': return 'جاهز خلال سنة واحدة';
      case 'ready_2_years': return 'جاهز خلال سنتين';
      default: return rd;
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'critical': return <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded font-bold">حرج جداً</span>;
      case 'high': return <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-bold">مرتفع</span>;
      case 'medium': return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-medium">متوسط</span>;
      default: return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded">منخفض</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              مصفوفة المواهب (9-Box Matrix) والتعاقب الوظيفي
              <span className="text-xs bg-purple-100 text-purple-800 font-semibold px-2.5 py-0.5 rounded-full">
                إدارة القيادات والكفاءات الوطنية
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              تقييم الأداء مقابل الإمكانات المستقبلية، بناء خطط التعاقب للوظائف الحرجة، وسعودة المناصب القيادية.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAssessModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm shadow-purple-200"
          >
            <UserCheck className="w-4 h-4" />
            تقييم موظف في المصفوفة
          </button>
          <button
            onClick={() => setShowSuccessionModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            إضافة خطة تعاقب وظيفي
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">نسبة المواهب الفائقة (Stars & Highs)</span>
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            </div>
            <div className="text-3xl font-black text-slate-800">%{data.highTalentRatio}</div>
            <div className="text-xs text-slate-400 mt-1">من إجمالي الكفاءات المقيمة</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">خطط التعاقب للوظائف الحرجة</span>
              <Briefcase className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{successionPlans.length} منصب قيادي</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">مغطاة بكوادر صف ثانٍ جاهزة</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">الموظفون النجوم (Top Stars)</span>
              <Award className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-purple-600">{data.boxCounts?.star || 0} قائد واعد</div>
            <div className="text-xs text-purple-500 mt-1">مؤهلون للترقية الفورية لمناصب عليا</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-sm font-medium">المناصب ذات المخاطر الحرجة</span>
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-rose-600">
              {successionPlans.filter(p => p.risk_level === 'critical' || p.risk_level === 'high').length} منصب
            </div>
            <div className="text-xs text-rose-500 mt-1">تتطلب تسريع تأهيل البديل الوطني</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('9box')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === '9box' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          مصفوفة الـ 9 مربعات التفاعلية (9-Box Grid)
        </button>
        <button
          onClick={() => setActiveTab('succession')}
          className={`pb-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'succession' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Compass className="w-4 h-4" />
          خطط التعاقب الوظيفي والقيادات ({successionPlans.length})
        </button>
      </div>

      {/* Tab 1: Interactive 9-Box Grid */}
      {activeTab === '9box' && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span className="font-semibold">
              المحور الرأسي (Y): الإمكانات المستقبلية (Potential) • المحور الأفقي (X): الأداء الحالي (Performance)
            </span>
            <span className="text-slate-400">اضغط على أي مربع لاستعراض وتصفية الموظفين المشمولين</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {boxes.map(box => {
              const count = data?.boxCounts?.[box.key] || 0;
              const empsInBox = data?.employees?.filter((e: any) => e.box_category === box.key) || [];
              const isSelected = selectedBox === box.key;

              return (
                <div
                  key={box.key}
                  onClick={() => setSelectedBox(isSelected ? null : box.key)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${box.color} ${
                    isSelected ? 'ring-4 ring-purple-400 shadow-md scale-[1.02]' : 'hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 font-bold text-sm">
                      <span>{box.icon}</span>
                      <span>{box.title}</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 shadow-xs">
                      {count}
                    </span>
                  </div>
                  <div className="text-xs opacity-80 mb-3">{box.badge}</div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {empsInBox.map((emp: any) => (
                      <div key={emp.id} className="bg-white/90 p-2 rounded-xl text-xs flex items-center justify-between border border-black/5 shadow-xs">
                        <div>
                          <span className="font-bold block text-slate-800">{emp.name}</span>
                          <span className="text-slate-500 text-[10px]">{emp.position} • {emp.department_name}</span>
                        </div>
                        {emp.is_saudi === 1 && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                            سعودي
                          </span>
                        )}
                      </div>
                    ))}
                    {empsInBox.length === 0 && (
                      <div className="text-[11px] text-center text-slate-400 py-3">لا يوجد موظفون في هذا المربع</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Succession Plans */}
      {activeTab === 'succession' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base">سجل خطط التعاقب للوظائف القيادية والحرجة</h2>
            <button
              onClick={() => setShowSuccessionModal(true)}
              className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة منصب قيادي
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="p-3.5">المنصب القيادي الحرج</th>
                  <th className="p-3.5">القسم</th>
                  <th className="p-3.5">شاغل الوظيفة الحالي</th>
                  <th className="p-3.5">مستوى الخطر</th>
                  <th className="p-3.5">الخليفة الأول (Primary Successor)</th>
                  <th className="p-3.5">الخليفة الاحتياطي</th>
                  <th className="p-3.5">الجاهزية والتطوير</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {successionPlans.map(plan => (
                  <tr key={plan.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-purple-600" />
                        <span>{plan.critical_role_title}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-600">{plan.department_name}</td>
                    <td className="p-3.5 font-medium text-slate-700">{plan.current_holder_name}</td>
                    <td className="p-3.5">{getRiskBadge(plan.risk_level)}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{plan.primary_successor_name}</div>
                      <div className="text-xs text-slate-500">{plan.primary_successor_position}</div>
                    </td>
                    <td className="p-3.5">
                      <div className="text-slate-700">{plan.secondary_successor_name || '---'}</div>
                    </td>
                    <td className="p-3.5">
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium inline-block mb-1">
                        {getReadinessLabel(plan.readiness_status)}
                      </span>
                      <div className="text-[11px] text-slate-500 max-w-xs">{plan.development_action_plan}</div>
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleDeleteSuccession(plan.id)}
                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                        title="حذف خطة التعاقب"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assessment Modal */}
      {showAssessModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-600" />
                تقييم موظف وتحديد موقعه في مصفوفة 9-Box
              </h3>
              <button onClick={() => setShowAssessModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssessment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الموظف المراد تقييمه *</label>
                <select
                  required
                  value={assessForm.employee_id}
                  onChange={e => setAssessForm({ ...assessForm, employee_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.position})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">درجة الأداء الحالي (1-3)</label>
                  <select
                    value={assessForm.performance_score}
                    onChange={e => setAssessForm({ ...assessForm, performance_score: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value={3}>3 - أداء استثنائي فائق (High)</option>
                    <option value={2}>2 - أداء جيد ومحقق للأهداف (Medium)</option>
                    <option value={1}>1 - دون التوقعات (Low)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الإمكانات المستقبلية (1-3)</label>
                  <select
                    value={assessForm.potential_score}
                    onChange={e => setAssessForm({ ...assessForm, potential_score: Number(e.target.value) })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value={3}>3 - إمكانات قيادية فائقة (High)</option>
                    <option value={2}>2 - إمكانات نمو واعدة (Medium)</option>
                    <option value={1}>1 - مستقر في موقعه الحالي (Low)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">أبرز نقاط القوة والتميز</label>
                <input
                  type="text"
                  value={assessForm.key_strengths}
                  onChange={e => setAssessForm({ ...assessForm, key_strengths: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الاحتياجات التطويرية وبرامج التدريب</label>
                <input
                  type="text"
                  value={assessForm.development_needs}
                  onChange={e => setAssessForm({ ...assessForm, development_needs: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الجدول الزمني للجاهزية والترقية</label>
                <select
                  value={assessForm.readiness_timeline}
                  onChange={e => setAssessForm({ ...assessForm, readiness_timeline: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="ready_now">جاهز للترقية فوراً (Ready Now)</option>
                  <option value="ready_1_year">جاهز خلال سنة واحدة (1 Year)</option>
                  <option value="ready_2_years">جاهز خلال سنتين (2 Years)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssessModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl"
                >
                  حفظ التقييم وتحديث المصفوفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Succession Modal */}
      {showSuccessionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Compass className="w-5 h-5 text-purple-600" />
                إعداد خطة تعاقب لمنصب قيادي حرج
              </h3>
              <button onClick={() => setShowSuccessionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSuccession} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">عنوان المنصب الحرج *</label>
                  <input
                    type="text"
                    required
                    value={successionForm.critical_role_title}
                    onChange={e => setSuccessionForm({ ...successionForm, critical_role_title: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                    placeholder="مثال: مدير العمليات التنفيذي (COO)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">القسم</label>
                  <select
                    value={successionForm.department_id}
                    onChange={e => setSuccessionForm({ ...successionForm, department_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر القسم...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الشاغل الحالي للمنصب</label>
                  <select
                    value={successionForm.current_holder_id}
                    onChange={e => setSuccessionForm({ ...successionForm, current_holder_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر الموظف...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">مستوى الخطر في حال الشغور</label>
                  <select
                    value={successionForm.risk_level}
                    onChange={e => setSuccessionForm({ ...successionForm, risk_level: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="critical">حرج جداً (Critical)</option>
                    <option value="high">مرتفع (High)</option>
                    <option value="medium">متوسط (Medium)</option>
                    <option value="low">منخفض (Low)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الخليفة الأول (المستهدف)</label>
                  <select
                    value={successionForm.primary_successor_id}
                    onChange={e => setSuccessionForm({ ...successionForm, primary_successor_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر الكفاءة البديلة...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.position})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">الخليفة الاحتياطي (الصف الثاني)</label>
                  <select
                    value={successionForm.secondary_successor_id}
                    onChange={e => setSuccessionForm({ ...successionForm, secondary_successor_id: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">اختر موظف بديل ثانٍ...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">خطة التطوير والتأهيل القيادي</label>
                <textarea
                  rows={2}
                  value={successionForm.development_action_plan}
                  onChange={e => setSuccessionForm({ ...successionForm, development_action_plan: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuccessionModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl"
                >
                  اعتماد خطة التعاقب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
