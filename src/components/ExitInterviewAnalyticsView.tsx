import React, { useState, useEffect } from 'react';
import { 
  UserMinus, Brain, AlertCircle, TrendingDown, 
  DollarSign, Sparkles, Plus, Star, MessageSquare, 
  BarChart3, RefreshCw, X, CheckCircle2, ChevronRight
} from 'lucide-react';
import type { ExitInterview, ExitInterviewAnalytics } from '../types';

export default function ExitInterviewAnalyticsView() {
  const [interviews, setInterviews] = useState<ExitInterview[]>([]);
  const [analytics, setAnalytics] = useState<ExitInterviewAnalytics | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    employee_id: '',
    departure_date: new Date().toISOString().split('T')[0],
    primary_reason: 'salary',
    reason_details: '',
    manager_rating: 3,
    culture_rating: 4,
    benefits_rating: 3,
    would_recommend_score: 7,
    retention_feedback: '',
    estimated_replacement_cost: 28000,
    ai_sentiment: 'neutral'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [iRes, aRes, eRes] = await Promise.all([
        fetch('/api/exit-interviews'),
        fetch('/api/exit-interviews/analytics'),
        fetch('/api/employees')
      ]);

      setInterviews(await iRes.json());
      setAnalytics(await aRes.json());
      const eData = await eRes.json();
      setEmployees(Array.isArray(eData) ? eData : (eData.employees || []));
    } catch (err) {
      console.error("Failed to load exit interviews:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id) return;

    try {
      const res = await fetch('/api/exit-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowAddModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("Error creating exit interview:", err);
    }
  };

  const reasonLabels: { [key: string]: string } = {
    salary: 'تنافسية الراتب والبدلات المالية',
    career_growth: 'فرص التطور والترقية المهنية',
    management: 'أسلوب الإدارة المباشرة',
    work_life_balance: 'التوازن بين العمل والحياة',
    relocation: 'الانتقال الجغرافي / ظروف عائلية',
    toxic_culture: 'بيئة وثقافة العمل الداخلية',
    health_personal: 'أسباب صحية وشخصية'
  };

  return (
    <div id="exit-interview-view" className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-purple-800/40">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-purple-500/20 backdrop-blur rounded-xl border border-purple-400/30">
              <Brain className="w-6 h-6 text-purple-300" />
            </span>
            <h2 className="text-xl font-black">محلل مقابلات الخروج وأسباب الاستقالة (AI Exit Interview & Turnover)</h2>
          </div>
          <p className="text-sm text-purple-200/90 max-w-2xl">
            استكشاف الأسباب الجذرية للمغادرة بالذكاء الاصطناعي، احتساب تكلفة استبدال الكفاءات، ووضع خطط وقائية لرفع استقرار الموظفين.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-900/40"
        >
          <Plus className="w-4 h-4" />
          تسجيل مقابلة خروج جديدة
        </button>
      </div>

      {/* Analytics KPI Row */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>إجمالي مقابلات الخروج:</span>
              <UserMinus className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-black text-slate-800 dark:text-white font-mono">
              {analytics.totalExits}
            </div>
            <span className="text-[11px] text-slate-400">حالات موثقة ومحللة آلياً</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>التكلفة المقدرة لاستبدال الكفاءات:</span>
              <DollarSign className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              {analytics.totalReplacementCost.toLocaleString()} ر.س
            </div>
            <span className="text-[11px] text-slate-400">تشمل الاستقطاب، الإحلال، والتدريب</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>متوسط تقييم ثقافة الشركة:</span>
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-500 font-mono">
              {analytics.avgCultureRating} / 5.0
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">مستوى رضا إيجابي عام</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>تقييم الإدارة المباشرة:</span>
              <Star className="w-4 h-4 text-indigo-500 fill-indigo-500" />
            </div>
            <div className="text-2xl font-black text-indigo-600 font-mono">
              {analytics.avgManagerRating} / 5.0
            </div>
            <span className="text-[11px] text-slate-400">علاقات قيادية متوازنة</span>
          </div>
        </div>
      )}

      {/* Main Grid: AI Insights & Reasons Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Top Resignation Reasons & Department Hotspots (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                أبرز دوافع الاستقالة ومغادرة العمل
              </h3>
              <span className="text-xs text-slate-400">ترتيب تنازلي حسب التكرار</span>
            </div>

            {analytics && analytics.topReasons.map((r, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800 dark:text-white">{r.reason}</span>
                  <span className="text-purple-600 font-mono">{r.percentage}% ({r.count} موظف)</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${r.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Exit Interviews Ledger */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">سجل المقابلات المسجلة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">الموظف</th>
                    <th className="p-2.5">الدافع الرئيسي</th>
                    <th className="p-2.5">تاريخ المغادرة</th>
                    <th className="p-2.5">التكلفة</th>
                    <th className="p-2.5">المشاعر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {interviews.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="p-2.5">
                        <div className="font-bold text-slate-800 dark:text-white">{ex.employee_name}</div>
                        <span className="text-[10px] text-slate-400">{ex.department_name || 'عام'}</span>
                      </td>
                      <td className="p-2.5 text-slate-700 dark:text-slate-300">
                        {reasonLabels[ex.primary_reason] || ex.primary_reason}
                      </td>
                      <td className="p-2.5 font-mono text-slate-500">{ex.departure_date}</td>
                      <td className="p-2.5 font-mono font-bold text-rose-600">
                        {ex.estimated_replacement_cost?.toLocaleString()} ر.س
                      </td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ex.ai_sentiment === 'positive' 
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : ex.ai_sentiment === 'negative'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {ex.ai_sentiment === 'positive' ? 'إيجابي' : ex.ai_sentiment === 'negative' ? 'سلبي' : 'حيادي'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right: AI Synthesis & Recommendations (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-slate-50 dark:from-purple-950/40 dark:via-indigo-950/40 dark:to-slate-900 border border-purple-200 dark:border-purple-800/60 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                الاستنتاجات الاستراتيجية لمحرك الذكاء الاصطناعي
              </h3>
            </div>

            {analytics && (
              <div className="space-y-3">
                {analytics.aiStrategicInsights.map((insight, idx) => (
                  <div key={idx} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-purple-100 dark:border-purple-900 text-xs text-slate-700 dark:text-slate-200 leading-relaxed shadow-sm flex items-start gap-2.5">
                    <ChevronRight className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Retention ROI Safeguard */}
            <div className="p-4 bg-purple-600 text-white rounded-xl space-y-1.5 text-xs shadow-md">
              <span className="font-bold block">مردود برامج الاستبقاء:</span>
              <p className="text-purple-100 text-[11px] leading-relaxed">
                تقليل تسرب موظفَين اثنين فقط سنوياً يوفر على المنشأة ما يقارب <strong>60,000 ر.س</strong> من تكاليف الاستقطاب والتدريب وإعادة التأهيل.
              </p>
            </div>
          </div>

        </div>

      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-800 dark:text-white">توثيق مقابلة خروج واستقالة</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الموظف المستقيل:</label>
                <select
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - ({e.job_title || e.position})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">دافع المغادرة الأساسي:</label>
                  <select
                    value={formData.primary_reason}
                    onChange={(e) => setFormData({ ...formData, primary_reason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="salary">تنافسية الراتب والبدلات</option>
                    <option value="career_growth">فرص التطور والترقية</option>
                    <option value="management">أسلوب الإدارة المباشرة</option>
                    <option value="work_life_balance">التوازن بين العمل والحياة</option>
                    <option value="relocation">الانتقال الجغرافي / عائلي</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تاريخ آخر يوم عمل:</label>
                  <input
                    type="date"
                    value={formData.departure_date}
                    onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">تفاصيل وأسباب الاستقالة المذكورة:</label>
                <textarea
                  rows={2}
                  value={formData.reason_details}
                  onChange={(e) => setFormData({ ...formData, reason_details: e.target.value })}
                  placeholder="ملاحظات الموظف أثناء جلسة الخروج..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تقييم بيئة العمل (1 - 5):</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formData.culture_rating}
                    onChange={(e) => setFormData({ ...formData, culture_rating: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تكلفة الإحلال التقديرية (ر.س):</label>
                  <input
                    type="number"
                    value={formData.estimated_replacement_cost}
                    onChange={(e) => setFormData({ ...formData, estimated_replacement_cost: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
                >
                  حفظ وتحليل المقابلة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
