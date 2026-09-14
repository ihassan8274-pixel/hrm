import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Heart, 
  Gift, 
  Smile, 
  Send, 
  Sparkles, 
  ShoppingBag, 
  Calendar, 
  Fuel, 
  Activity, 
  Headphones, 
  CheckCircle2, 
  Plus, 
  X,
  TrendingUp,
  MessageSquare
} from 'lucide-react';
import { PeerKudos, RewardCatalogItem, RewardRedemption, PulseSurveyScore } from '../types';

interface RewardsKudosViewProps {
  onBack?: () => void;
}

export const RewardsKudosView: React.FC<RewardsKudosViewProps> = () => {
  const [activeTab, setActiveTab] = useState<'kudos' | 'catalog' | 'surveys'>('kudos');
  const [kudosList, setKudosList] = useState<PeerKudos[]>([]);
  const [catalog, setCatalog] = useState<RewardCatalogItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [surveys, setSurveys] = useState<PulseSurveyScore[]>([]);
  const [userPoints, setUserPoints] = useState(650);

  // Send Kudos Modal
  const [showSendKudos, setShowSendKudos] = useState(false);
  const [newKudos, setNewKudos] = useState({
    sender_id: 1,
    sender_name: 'عبد الله بن فهد السبيعي',
    recipient_id: 3,
    recipient_name: 'أحمد محمود عبد الرحمن',
    recipient_job: 'مهندس برمجيات أول',
    core_value: 'innovation' as const,
    message: '',
    points_awarded: 50
  });

  const fetchData = async () => {
    try {
      const [kRes, cRes, rRes, sRes] = await Promise.all([
        fetch('/api/kudos'),
        fetch('/api/rewards/catalog'),
        fetch('/api/rewards/redemptions'),
        fetch('/api/surveys/pulse')
      ]);

      if (kRes.ok) setKudosList(await kRes.json());
      if (cRes.ok) setCatalog(await cRes.json());
      if (rRes.ok) setRedemptions(await rRes.json());
      if (sRes.ok) setSurveys(await sRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSendKudos = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/kudos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKudos)
      });
      if (res.ok) {
        setShowSendKudos(false);
        setNewKudos({
          sender_id: 1,
          sender_name: 'عبد الله بن فهد السبيعي',
          recipient_id: 3,
          recipient_name: 'أحمد محمود عبد الرحمن',
          recipient_job: 'مهندس برمجيات أول',
          core_value: 'innovation',
          message: '',
          points_awarded: 50
        });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLike = async (id: number) => {
    try {
      await fetch(`/api/kudos/${id}/like`, { method: 'POST' });
      setKudosList(kudosList.map(k => k.id === id ? { ...k, likes_count: (k.likes_count || 0) + 1 } : k));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRedeemReward = async (reward: RewardCatalogItem) => {
    if (userPoints < reward.points_required) {
      alert(`رصيدك الحالي (${userPoints} نقطة) غير كافٍ لاستبدال هذه المكافأة (${reward.points_required} نقطة).`);
      return;
    }

    try {
      const res = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: 1,
          employee_name: 'عبد الله بن فهد السبيعي',
          reward_id: reward.id,
          reward_title: reward.title,
          points_spent: reward.points_required
        })
      });
      if (res.ok) {
        const data = await res.json();
        setUserPoints(prev => prev - reward.points_required);
        alert(`تهانينا! تم استبدال المكافأة بنجاح. كود القسيمة: ${data.redemption_code}`);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getCoreValueBadge = (val: string) => {
    switch (val) {
      case 'innovation':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">الابتكار والحلول الذكية</span>;
      case 'teamwork':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">العمل الجماعي والتعاون</span>;
      case 'customer_delight':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">إسعاد العملاء والمستفيدين</span>;
      case 'safety_first':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">السلامة والامتثال أولاً</span>;
      case 'leadership':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">القيادة والإلهام</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">التميز في الأداء</span>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'gift_card': return <ShoppingBag className="w-5 h-5 text-indigo-600" />;
      case 'extra_leave': return <Calendar className="w-5 h-5 text-emerald-600" />;
      case 'fuel_card': return <Fuel className="w-5 h-5 text-amber-600" />;
      case 'wellness': return <Activity className="w-5 h-5 text-rose-600" />;
      case 'tech': return <Headphones className="w-5 h-5 text-purple-600" />;
      default: return <Gift className="w-5 h-5 text-indigo-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">برنامج التقدير والمكافآت والارتباط الوظيفي (Kudos & Rewards)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              تعزيز ثقافة الشكر بين الزملاء، متجر استبدال النقاط بالمزايا، ومؤشرات نبض الرضا الوظيفي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-center">
            <span className="text-xs text-amber-800 font-semibold block">رصيد نقاطك المتاحة:</span>
            <span className="text-lg font-black text-amber-600 font-mono">{userPoints} نقطة</span>
          </div>

          <button
            onClick={() => setShowSendKudos(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>إرسال بطاقة شكر وتقدير</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('kudos')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'kudos'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>حائط الشكر والتقدير (Peer Kudos)</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
            {kudosList.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'catalog'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>متجر المكافآت والمزايا</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">
            {catalog.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('surveys')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'surveys'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Smile className="w-4 h-4" />
          <span>مؤشرات نبض الرضا الوظيفي (Pulse Survey)</span>
        </button>
      </div>

      {/* TAB 1: KUDOS WALL */}
      {activeTab === 'kudos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kudosList.map((k) => (
            <div key={k.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-amber-200 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center">
                      {k.sender_name.slice(0, 1)}
                    </div>
                    <div>
                      <h4 className="text-xs text-slate-500">من: <span className="font-semibold text-slate-800">{k.sender_name}</span></h4>
                      <h4 className="text-xs text-slate-500">إلى: <span className="font-bold text-indigo-600">{k.recipient_name}</span> ({k.recipient_job})</h4>
                    </div>
                  </div>
                  <div>{getCoreValueBadge(k.core_value)}</div>
                </div>

                <p className="mt-3 text-sm text-slate-700 leading-relaxed bg-amber-50/40 p-3 rounded-lg border border-amber-100/60">
                  "{k.message}"
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                  +{k.points_awarded} نقطة
                </span>

                <button
                  onClick={() => handleLike(k.id)}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-rose-600 transition-colors px-2.5 py-1 rounded-lg hover:bg-rose-50"
                >
                  <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                  <span className="font-semibold">{k.likes_count || 0}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: REWARDS CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {catalog.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      {getCategoryIcon(r.category)}
                    </div>
                    <span className="text-sm font-black font-mono text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      {r.points_required} نقطة
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base">{r.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">المتوفر: {r.stock_quantity} قسيمة</span>
                  <button
                    onClick={() => handleRedeemReward(r)}
                    disabled={userPoints < r.points_required || r.stock_quantity <= 0}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      userPoints >= r.points_required && r.stock_quantity > 0
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    استبدال المكافأة
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Redemptions history */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">سجل عمليات الاستبدال الأخيرة في المنشأة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">الموظف</th>
                    <th className="py-2.5 px-3">المكافأة المستبدلة</th>
                    <th className="py-2.5 px-3">النقاط</th>
                    <th className="py-2.5 px-3">كود القسيمة</th>
                    <th className="py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {redemptions.map((rd) => (
                    <tr key={rd.id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{rd.employee_name}</td>
                      <td className="py-2.5 px-3 text-slate-700">{rd.reward_title}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-600">{rd.points_spent}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">{rd.redemption_code}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          معتمد ومسلّم
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PULSE SURVEYS */}
      {activeTab === 'surveys' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">مؤشر نبض الرضا والارتباط المؤسسي (Q3 2026)</h3>
                <p className="text-xs text-slate-500 mt-0.5">استطلاع رأي دوري مجهول الهوية شارك به 48 موظفاً وموظفة في المنشأة</p>
              </div>
              <div className="text-left">
                <span className="text-2xl font-black text-emerald-600 font-mono">87.4%</span>
                <span className="block text-xs text-slate-500">متوسط الرضا العام</span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              {surveys.map((s) => (
                <div key={s.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{s.category}</span>
                    <span className="font-mono font-bold text-indigo-600">{s.score_percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${s.score_percentage >= 85 ? 'bg-emerald-500' : s.score_percentage >= 75 ? 'bg-indigo-500' : 'bg-amber-500'}`}
                      style={{ width: `${s.score_percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SEND KUDOS */}
      {showSendKudos && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 text-amber-600">
                <Sparkles className="w-5 h-5" />
                إرسال بطاقة شكر وتقدير لزميل (Kudos)
              </h3>
              <button onClick={() => setShowSendKudos(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendKudos} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الزميل المكرم:</label>
                <input
                  type="text"
                  required
                  placeholder="اسم الزميل"
                  value={newKudos.recipient_name}
                  onChange={(e) => setNewKudos({ ...newKudos, recipient_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القيمة المؤسسية المجسدة:</label>
                  <select
                    value={newKudos.core_value}
                    onChange={(e) => setNewKudos({ ...newKudos, core_value: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="innovation">الابتكار والحلول الذكية</option>
                    <option value="teamwork">العمل الجماعي والتعاون</option>
                    <option value="customer_delight">إسعاد المستفيدين</option>
                    <option value="safety_first">السلامة والامتثال أولاً</option>
                    <option value="leadership">القيادة والإلهام</option>
                    <option value="excellence">التميز في الأداء</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">النقاط الممنوحة:</label>
                  <select
                    value={newKudos.points_awarded}
                    onChange={(e) => setNewKudos({ ...newKudos, points_awarded: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value={25}>25 نقطة</option>
                    <option value={50}>50 نقطة</option>
                    <option value={75}>75 نقطة</option>
                    <option value={100}>100 نقطة (إنجاز استثنائي)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">رسالة الشكر والتقدير:</label>
                <textarea
                  required
                  rows={3}
                  placeholder="اكتب كلمات تقدير وتوضيح لإنجاز الزميل..."
                  value={newKudos.message}
                  onChange={(e) => setNewKudos({ ...newKudos, message: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> نشر على حائط الشكر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
