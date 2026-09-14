import { useState, useEffect } from 'react';
import { Users, Building2, BadgeDollarSign, TrendingUp, History, ShieldCheck, Activity, PieChart as PieChartIcon, BarChart as BarChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Stats, AuditLog } from '../types';
import { getCurrencySymbol } from '../utils/currency';

interface ExtendedStats extends Stats {
  payrollByDept: { name: string, value: number }[];
}

export default function DashboardView() {
  const [stats, setStats] = useState<ExtendedStats>({
    totalBranches: 0,
    totalEmployees: 0,
    totalMonthlyPayroll: 0,
    payrollByDept: []
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [currency, setCurrency] = useState('SAR');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => { if (data?.currency) setCurrency(data.currency); })
      .catch(() => {});

    fetch('/api/stats')
      .then(res => res.json())
      .then(data => data && setStats(data))
      .catch(err => console.error("Dashboard stats error:", err));

    fetch('/api/audit-logs')
      .then(res => res.json())
      .then(data => data && Array.isArray(data) && setLogs(data.slice(0, 5)))
      .catch(err => console.error("Dashboard logs error:", err));
  }, []);

  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const cards = [
    { label: 'إجمالي الفروع', value: stats.totalBranches, icon: Building2, color: 'bg-indigo-500', trend: '+12% منذ الشهر الماضي' },
    { label: 'إجمالي الموظفين', value: stats.totalEmployees, icon: Users, color: 'bg-blue-500', trend: 'نمو مستمر' },
    { label: 'رواتب الشهر الحالي', value: `${(stats?.totalMonthlyPayroll || 0).toLocaleString()} ${getCurrencySymbol(currency)}`, icon: BadgeDollarSign, color: 'bg-emerald-500', trend: 'بناءً على المسيرات المعتمدة' },
  ];

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
              <div className={`${card.color} p-3 rounded-xl shadow-lg shadow-indigo-200`}>
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
            <BarChartIcon className="w-5 h-5 text-indigo-500" />
            توزيع الرواتب حسب الإدارات
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
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
            <ResponsiveContainer width="100%" height="100%">
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
                  {(stats?.payrollByDept || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
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
          <Activity className="w-5 h-5 text-blue-500" />
          آخر العمليات في النظام
        </h3>
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                  log.action === 'create' ? 'bg-emerald-100 text-emerald-600' :
                  log.action === 'update' ? 'bg-blue-100 text-blue-600' :
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
