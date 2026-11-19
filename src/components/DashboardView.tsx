import { useState, useEffect } from 'react';
import { Users, Building2, BadgeDollarSign, TrendingUp, History, ShieldCheck, Activity, PieChart as PieChartIcon, BarChart as BarChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Stats, AuditLog } from '../types';
import { getCurrencySymbol } from '../utils/currency';
import { apiGet, safeArray } from '../lib/api';

interface ExtendedStats extends Stats {
  payrollByDept: { name: string, value: number }[];
}

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const CARD_CONFIG = [
  { label: 'إجمالي الفروع', icon: Building2, color: 'bg-brand-500', trend: '+12% منذ الشهر الماضي', valueKey: 'totalBranches' },
  { label: 'إجمالي الموظفين', icon: Users, color: 'bg-brand-500', trend: 'نمو مستمر', valueKey: 'totalEmployees' },
  { label: 'رواتب الشهر الحالي', icon: BadgeDollarSign, color: 'bg-emerald-500', trend: 'بناءً على المسيرات المعتمدة', valueKey: 'totalMonthlyPayroll' },
];

function DashboardView() {
  const [stats, setStats] = useState<ExtendedStats>({
    totalBranches: 0,
    totalEmployees: 0,
    totalMonthlyPayroll: 0,
    payrollByDept: []
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [currency, setCurrency] = useState('SAR');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [settingsRes, statsRes, logsRes] = await Promise.allSettled([
          apiGet('/api/settings'),
          apiGet('/api/stats'),
          apiGet('/api/audit-logs')
        ]);

        if (!mounted) return;

        if (settingsRes.status === 'fulfilled' && settingsRes.value?.currency) {
          setCurrency(settingsRes.value.currency);
        }

        if (statsRes.status === 'fulfilled' && statsRes.value) {
          setStats(statsRes.value);
        }

        if (logsRes.status === 'fulfilled') {
          const logsData = logsRes.value;
          if (Array.isArray(logsData)) {
            setLogs(logsData.slice(0, 5));
          }
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => { mounted = false; };
  }, []);

  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const CARD_CONFIG = [
    { label: 'إجمالي الفروع', icon: Building2, color: 'bg-brand-500', trend: '+12% منذ الشهر الماضي', valueKey: 'totalBranches' },
    { label: 'إجمالي الموظفين', icon: Users, color: 'bg-brand-500', trend: 'نمو مستمر', valueKey: 'totalEmployees' },
    { label: 'رواتب الشهر الحالي', icon: BadgeDollarSign, color: 'bg-emerald-500', trend: 'بناءً على المسيرات المعتمدة', valueKey: 'totalMonthlyPayroll' },
  ];

  const cards = CARD_CONFIG.map(cfg => {
    return {
      label: cfg.label,
      icon: cfg.icon,
      color: cfg.color,
      trend: cfg.trend,
      value: cfg.valueKey === 'totalMonthlyPayroll' 
        ? `${(stats?.totalMonthlyPayroll || 0).toLocaleString()} ${getCurrencySymbol(currency)}`
        : stats?.[cfg.valueKey] || 0
    };
  });

  if (loading) {
    return (
      <div className="space-y-8 font-sans">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-pulse">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">إجمالي الفروع</p>
                <h3 className="text-2xl font-bold mt-2 text-slate-800">—</h3>
              </div>
              <div className="bg-brand-500 p-3 rounded-xl">
                <Building2 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-pulse">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">إجمالي الموظفين</p>
                  <h3 className="text-2xl font-bold mt-2 text-slate-800">—</h3>
                </div>
                <div className="bg-brand-500 p-3 rounded-xl">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-pulse">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-slate-500 text-sm font-medium">رواتب الشهر الحالي</p>
                    <h3 className="text-2xl font-bold mt-2 text-slate-800">—</h3>
                  </div>
                  <div className="bg-emerald-500 p-3 rounded-xl">
                    <BadgeDollarSign className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-[400px]">
                <div className="animate-pulse h-full bg-slate-50 rounded-xl" />
              </div>
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm h-[400px]">
                <div className="animate-pulse h-full bg-slate-50 rounded-xl" />
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <div className="animate-pulse space-y-4">
                <div className="h-16 bg-slate-50 rounded-xl" />
                <div className="h-16 bg-slate-50 rounded-xl" />
                <div className="h-16 bg-slate-50 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">{card.label}</p>
                <h3 className="text-2xl font-bold mt-2 text-slate-800">{card.value}</h3>
              </div>
              <div className={`${card.color} p-3 rounded-xl shadow-lg shadow-brand-200`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 font-medium">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>{card.trend}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <BarChartIcon className="w-5 h-5 text-brand-500" />
            توزيع الرواتب حسب الإدارات
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.payrollByDept || []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} style={{ fontSize: '12px', fontWeight: 'bold' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <PieChartIcon className="w-5 h-5 text-emerald-500" />
            نسبة الإنفاق عبر الإدارات
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats?.payrollByDept || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.payrollByDept || []).map((entry, index) => {
                    return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" />
          آخر العمليات في النظام
        </h3>
        <div className="space-y-4">
          {safeArray<AuditLog>(logs).map((log) => (
            <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                  log.action === 'create' ? 'bg-emerald-100 text-emerald-600' :
                  log.action === 'update' ? 'bg-brand-100 text-brand-600' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {log.action.slice(0, 3).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{log.details}</p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {new Date(log.created_at).toLocaleString('ar-EG')} • {log.entity_type}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400">{log.created_by}</span>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="py-10 text-center text-slate-400">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-10" />
              <p className="text-sm">لا توجد سجلات حالياً</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardView;