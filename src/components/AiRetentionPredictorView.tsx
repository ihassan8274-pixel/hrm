import { useState, useEffect } from 'react';
import { 
  Sparkles, AlertTriangle, ShieldCheck, TrendingDown, 
  UserX, RefreshCw, CheckCircle2, ChevronRight, Award,
  DollarSign, Clock, HeartHandshake, ShieldAlert, ArrowUpRight
} from 'lucide-react';
import type { RetentionRiskAssessment } from '../types';

export default function AiRetentionPredictorView() {
  const [assessments, setAssessments] = useState<RetentionRiskAssessment[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [selectedEmp, setSelectedEmp] = useState<RetentionRiskAssessment | null>(null);

  const fetchRisks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/retention/risks');
      if (res.ok) {
        const data = await res.json();
        setAssessments(data.assessments || []);
        setStats({
          criticalCount: data.criticalCount || 0,
          highCount: data.highCount || 0,
          averageRiskScore: data.averageRiskScore || 0,
          totalAssessed: data.assessments?.length || 0
        });
      }
    } catch (err) {
      console.error('Error fetching retention risks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisks();
  }, []);

  const filteredList = assessments.filter(a => {
    if (filterLevel === 'all') return true;
    return a.risk_level === filterLevel;
  });

  const getRiskBadge = (level: string, score: number) => {
    switch (level) {
      case 'critical':
        return (
          <span className="bg-red-100 text-red-800 border border-red-200 text-xs px-2.5 py-1 rounded-full font-black flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
            خطر حرج ({score}%)
          </span>
        );
      case 'high':
        return (
          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-600"></span>
            خطر مرتفع ({score}%)
          </span>
        );
      case 'medium':
        return (
          <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-medium">
            متوسط ({score}%)
          </span>
        );
      default:
        return (
          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-medium">
            مستقر وآمن ({score}%)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              محلل الذكاء الاصطناعي لمخاطر تسرب واستبقاء الكفاءات (AI Retention Predictor)
              <span className="text-xs bg-rose-100 text-rose-800 font-semibold px-2.5 py-0.5 rounded-full">
                تنبؤ استباقي للاستقالات
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              تحليل المؤشرات الخفية (مقارنة الراتب بالسوق، ركود الترقية، تكرار الإجازات، والأداء) لاقتراح مبادرات استبقاء ذكية.
            </p>
          </div>
        </div>

        <button
          onClick={fetchRisks}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          إعادة التحليل الذكي
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">حالات الخطر الحرج (مستهدف مغادرة)</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-black text-red-600">{stats.criticalCount || 0} كفاءة</div>
          <div className="text-xs text-red-500 mt-1">احتمالية الاستقالة خلال 90 يوماً تتجاوز 75%</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">حالات الخطر المرتفع</span>
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-amber-600">{stats.highCount || 0} موظف</div>
          <div className="text-xs text-amber-600 mt-1">تتطلب تدخلاً ومراجعة للحزم التحفيزية</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">متوسط مؤشر خطر التسرب العام</span>
            <TrendingDown className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-3xl font-black text-slate-800">%{stats.averageRiskScore || 0}</div>
          <div className="text-xs text-slate-400 mt-1">على مستوى كافة قطاعات المنشأة</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-sm font-medium">الموظفون المستقرون (Low Risk)</span>
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-emerald-600">
            {(stats.totalAssessed || 0) - (stats.criticalCount || 0) - (stats.highCount || 0)} موظف
          </div>
          <div className="text-xs text-emerald-600 mt-1">رضا وظيفي واستقرار مستدام</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          {[
            { key: 'all', label: `الكل (${assessments.length})` },
            { key: 'critical', label: `الحرج (${stats.criticalCount})` },
            { key: 'high', label: `المرتفع (${stats.highCount})` },
            { key: 'medium', label: 'المتوسط' },
            { key: 'low', label: 'المستقر' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterLevel(f.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterLevel === f.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Analyzed Employees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredList.map(emp => (
          <div
            key={emp.employee_id}
            className={`p-5 rounded-2xl border transition-all ${
              emp.risk_level === 'critical'
                ? 'bg-red-50/20 border-red-200 hover:border-red-400'
                : emp.risk_level === 'high'
                ? 'bg-amber-50/20 border-amber-200 hover:border-amber-400'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-base">{emp.employee_name}</span>
                  {emp.is_saudi === 1 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      كادر وطني
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {emp.job_title} • {emp.department_name} ({emp.years_in_company} سنة في الشركة)
                </div>
              </div>

              <div>{getRiskBadge(emp.risk_level, emp.risk_score)}</div>
            </div>

            {/* Risk Factors */}
            <div className="space-y-2 mb-4">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                أبرز عوامل ومسببات مخاطر التسرب المرصودة:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-600 bg-white/80 p-3 rounded-xl border border-slate-100">
                {emp.top_risk_factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-red-500 font-bold shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* AI Recommended Retention Actions */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
                توصيات الذكاء الاصطناعي للاستبقاء (Retention Safeguards):
              </span>
              <div className="space-y-1.5">
                {emp.recommended_actions.map((act, i) => (
                  <div key={i} className="text-xs bg-emerald-50 text-emerald-900 p-2.5 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <span>{act}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
