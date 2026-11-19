import { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, Users, Award, ShieldAlert, 
  HelpCircle, RefreshCw, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Briefcase
} from 'lucide-react';
import type { NitaqatSimulationResult } from '../types';

export default function NitaqatSimulatorView() {
  const [sector, setSector] = useState('technology');
  const [currentSaudis, setCurrentSaudis] = useState(6);
  const [currentExpats, setCurrentExpats] = useState(4);
  const [specialNeedsSaudis, setSpecialNeedsSaudis] = useState(1);
  const [addSaudis, setAddSaudis] = useState(0);
  const [addExpats, setAddExpats] = useState(0);
  const [addSpecialNeeds, setAddSpecialNeeds] = useState(0);

  const [simResult, setSimResult] = useState<NitaqatSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runSimulation = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/saudi/nitaqat-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector,
          current_saudis: currentSaudis,
          current_expats: currentExpats,
          special_needs_saudis: specialNeedsSaudis + addSpecialNeeds,
          add_saudis: addSaudis,
          add_expats: addExpats
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'فشل تشغيل المحاكاة');
      setSimResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch using actual employees
    fetch('/api/employees')
      .then(r => r.json())
      .then(emps => {
        if (Array.isArray(emps) && emps.length > 0) {
          const sCount = emps.filter(e => e.is_saudi === 1 || e.nationality === 'سعودي').length;
          const eCount = emps.length - sCount;
          setCurrentSaudis(sCount);
          setCurrentExpats(eCount);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    runSimulation();
  }, [sector, currentSaudis, currentExpats, specialNeedsSaudis, addSaudis, addExpats, addSpecialNeeds]);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'platinum':
        return { bg: 'bg-brand-900 text-white', border: 'border-brand-700', label: 'بلاتيني (أعلى نطاق)' };
      case 'high_green':
        return { bg: 'bg-emerald-700 text-white', border: 'border-emerald-600', label: 'أخضر مرتفع' };
      case 'mid_green':
        return { bg: 'bg-emerald-500 text-white', border: 'border-emerald-400', label: 'أخضر متوسط' };
      case 'low_green':
        return { bg: 'bg-lime-600 text-white', border: 'border-lime-500', label: 'أخضر منخفض' };
      case 'red':
      default:
        return { bg: 'bg-rose-600 text-white', border: 'border-rose-500', label: 'نطاق أحمر (حرج)' };
    }
  };

  const currentTierInfo = simResult ? getTierColor(simResult.currentTier) : null;
  const simTierInfo = simResult ? getTierColor(simResult.simulatedTier) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">محاكي نطاقات والتوطين الاحترافي (نطاقات المطور)</h2>
            <p className="text-sm text-slate-500">حساب فوري لمعامل التوطين، مضاعف برنامج مواءمة لذوي الإعاقة (4x)، ورصيد التأشيرات المتاحة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-teal-500"
          >
            <option value="technology">قطاع تقنية المعلومات والاتصالات</option>
            <option value="retail">قطاع تجارة الجملة والتجزئة</option>
            <option value="services">قطاع الخدمات المهنية والاستشارات</option>
            <option value="construction">قطاع المقاولات والتشييد</option>
          </select>
        </div>
      </div>

      {/* Main Barometer & Simulation Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            بيانات القوى العاملة الحالية
          </h3>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>الموظفون السعوديون</span>
                <span className="font-bold text-teal-700">{currentSaudis} موظف</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={currentSaudis}
                onChange={(e) => setCurrentSaudis(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                <span>الموظفون غير السعوديين (الوافدون)</span>
                <span className="font-bold text-slate-700">{currentExpats} موظف</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={currentExpats}
                onChange={(e) => setCurrentExpats(Number(e.target.value))}
                className="w-full accent-slate-600"
              />
            </div>

            <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl">
              <div className="flex justify-between font-semibold text-teal-900 mb-1">
                <span>سعوديون من ذوي الإعاقة (برنامج مواءمة)</span>
                <span className="font-bold text-teal-800">{specialNeedsSaudis} (يعادل {specialNeedsSaudis * 4} سعوديين)</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                value={specialNeedsSaudis}
                onChange={(e) => setSpecialNeedsSaudis(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
              <p className="text-[10px] text-teal-700 mt-1">يُحسب العامل ذو الإعاقة بأربعة عمال سعوديين في نطاقات وفق اشتراطات الوزارة.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs">سيناريو التوظيف والاستقدام المستقبلي:</h4>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 font-semibold">إضافة سعوديين (+)</label>
                <input
                  type="number"
                  min="0"
                  value={addSaudis}
                  onChange={(e) => setAddSaudis(Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-emerald-700"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-semibold">استقدام وافدين (+)</label>
                <input
                  type="number"
                  min="0"
                  value={addExpats}
                  onChange={(e) => setAddExpats(Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-rose-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results & Tier Barometer */}
        <div className="lg:col-span-2 space-y-6">
          {simResult && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
              {/* Comparison Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-xs text-slate-500 font-semibold">الوضع الحالي للمنشأة</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-slate-800">{simResult.currentSaudizationPercentage}%</span>
                    <span className="text-xs text-slate-500">نسبة التوطين المحتسبة</span>
                  </div>
                  <div className="mt-3">
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${currentTierInfo?.bg}`}>
                      {currentTierInfo?.label}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-teal-400 bg-teal-50/40">
                  <span className="text-xs text-teal-800 font-bold">الوضع المتوقع بعد السيناريو</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-teal-900">{simResult.simulatedSaudizationPercentage}%</span>
                    <span className="text-xs text-teal-700 font-medium">نسبة التوطين الجديدة</span>
                  </div>
                  <div className="mt-3">
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${simTierInfo?.bg}`}>
                      {simTierInfo?.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actionable Insights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                  <span className="text-emerald-800 font-bold block mb-1">للترقية للنطاق الأعلى:</span>
                  <p className="text-emerald-950 font-bold text-sm">
                    تحتاج توظيف {simResult.simulated.saudisNeededForNextTier} سعودي
                  </p>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                  <span className="text-amber-800 font-bold block mb-1">هامش الأمان قبل الهبوط:</span>
                  <p className="text-amber-950 font-bold text-sm">
                    مسموح حتى {simResult.simulated.expatsAllowedBeforeDowngrade} وافد
                  </p>
                </div>

                <div className="p-3.5 bg-brand-50 border border-brand-200 rounded-xl text-xs">
                  <span className="text-brand-800 font-bold block mb-1">رصيد التأشيرات الفورية:</span>
                  <p className="text-brand-950 font-bold text-sm">
                    {simResult.simulated.availableVisasToIssue} تأشيرة عمل متاحة
                  </p>
                </div>
              </div>

              {/* Nitaqat Tiers Scale */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">مقياس نطاقات المطور لقطاع ({simResult.sectorName}):</span>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] font-bold">
                  <div className={`p-2.5 rounded-lg border ${simResult.simulatedTier === 'red' ? 'ring-2 ring-rose-500 scale-105' : 'opacity-70'} bg-rose-100 text-rose-800 border-rose-300`}>
                    نطاق أحمر
                    <div className="text-[9px] font-normal">&lt; {simResult.tierThresholds.low_green}%</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${simResult.simulatedTier === 'low_green' ? 'ring-2 ring-lime-600 scale-105' : 'opacity-70'} bg-lime-100 text-lime-800 border-lime-300`}>
                    أخضر منخفض
                    <div className="text-[9px] font-normal">{simResult.tierThresholds.low_green}% - {simResult.tierThresholds.mid_green}%</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${simResult.simulatedTier === 'mid_green' ? 'ring-2 ring-emerald-600 scale-105' : 'opacity-70'} bg-emerald-100 text-emerald-800 border-emerald-300`}>
                    أخضر متوسط
                    <div className="text-[9px] font-normal">{simResult.tierThresholds.mid_green}% - {simResult.tierThresholds.high_green}%</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${simResult.simulatedTier === 'high_green' ? 'ring-2 ring-teal-600 scale-105' : 'opacity-70'} bg-teal-100 text-teal-800 border-teal-300`}>
                    أخضر مرتفع
                    <div className="text-[9px] font-normal">{simResult.tierThresholds.high_green}% - {simResult.tierThresholds.platinum}%</div>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${simResult.simulatedTier === 'platinum' ? 'ring-2 ring-brand-800 scale-105' : 'opacity-70'} bg-brand-100 text-brand-900 border-brand-300`}>
                    بلاتيني
                    <div className="text-[9px] font-normal">&gt; {simResult.tierThresholds.platinum}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Restricted Professions Saudization Compliance Meter */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-teal-600" />
          نسب توطين المهن الحصرية والمقيدة (قرارات وزارة الموارد البشرية)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span>الموارد البشرية والتوظيف</span>
              <span className="text-emerald-700">100% (توطين كامل)</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-600 h-full w-full" />
            </div>
            <span className="text-[10px] text-slate-500">حظر تشغيل غير السعوديين في وظائف HR</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span>مهن المحاسبة والمالية</span>
              <span className="text-emerald-700">30% كحد أدنى</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-600 h-full w-[45%]" />
            </div>
            <span className="text-[10px] text-slate-500">للمنشآت التي يعمل بها 5 محاسبين فأكثر</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span>مهن المبيعات والتسويق</span>
              <span className="text-emerald-700">35% كحد أدنى</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-600 h-full w-[50%]" />
            </div>
            <span className="text-[10px] text-slate-500">مندوبو ومسؤولو المبيعات</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span>مهن الاتصالات وتقنية المعلومات</span>
              <span className="text-emerald-700">25% كحد أدنى</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-600 h-full w-[60%]" />
            </div>
            <span className="text-[10px] text-slate-500">تطوير البرمجيات وإدارة الشبكات</span>
          </div>
        </div>
      </div>
    </div>
  );
}
