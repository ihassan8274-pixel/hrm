import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, DollarSign, Award, 
  BarChart3, PieChart, ShieldCheck, Printer, 
  Download, RefreshCw, Layers, ArrowUpRight, CheckCircle2
} from 'lucide-react';
import type { ExecutiveAnalytics } from '../types';

export default function ExecutiveBoardroomView() {
  const [analytics, setAnalytics] = useState<ExecutiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/executive/analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load executive analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintBrief = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-400 text-sm">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
        جاري تجميع المؤشرات الاستراتيجية للوحة مجلس الإدارة...
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div id="executive-boardroom-view" className="space-y-6">
      
      {/* Top Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-indigo-900/40">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-indigo-500/20 backdrop-blur rounded-xl border border-indigo-400/30">
              <Award className="w-6 h-6 text-indigo-300" />
            </span>
            <h2 className="text-xl font-black">لوحة القيادة التنفيذية ومؤشرات مجلس الإدارة (Executive Boardroom & HR ROI)</h2>
          </div>
          <p className="text-sm text-indigo-200/80 max-w-2xl">
            التحليلات الاستراتيجية لرأس المال البشري، العائد على الاستثمار، كفاءة كتل الأجور، ومؤشرات الامتثال الموحدة.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePrintBrief}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-indigo-900/40"
          >
            <Printer className="w-4 h-4" />
            طباعة التقرير التنفيذي الرسمي
          </button>
        </div>
      </div>

      {/* Strategic KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Human Capital ROI */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>العائد على رأس المال البشري (HC-ROI):</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-600 font-mono">
            {analytics.humanCapitalRoi}x
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            كل 1 ر.س يُستثمر في الأجور يولد <strong>{analytics.humanCapitalRoi} ر.س</strong> أرباح تشغيلية مضافة.
          </p>
        </div>

        {/* Total Annual Wage Bill */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>كتلة الأجور والمزايا السنوية:</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-white font-mono">
            {analytics.annualizedWageBill.toLocaleString()} ر.س
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>الشهري: {analytics.totalMonthlyPayroll.toLocaleString()} ر.س</span>
            <span className="text-indigo-600 font-semibold font-mono">100% WPS</span>
          </div>
        </div>

        {/* Saudization Rate */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>نسبة التوطين الاستراتيجية:</span>
            <ShieldCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-3xl font-black text-teal-600 font-mono">
            {analytics.saudizationRate}%
          </div>
          <p className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
            النطاق البلاتيني المرتفع (أعلى من مستهدفات قطاع الأعمال).
          </p>
        </div>

        {/* Cost Per Employee */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>متوسط تكلفة الموظف السنوية:</span>
            <Users className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-white font-mono">
            {analytics.costPerEmployee.toLocaleString()} ر.س
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>معدل التسرب: {analytics.turnoverRateAnnual}%</span>
            <span>متوسط البقاء: {analytics.averageTenureYears} سنوات</span>
          </div>
        </div>

      </div>

      {/* Main Breakdown Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Department-level Payroll Allocation Matrix (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                توزيع كتل الأجور والسعودة حسب الإدارات
              </h3>
              <p className="text-xs text-slate-500">مصفوفة التكلفة والإنتاجية لكل قطاع بالمنشأة</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">الإدارة / القسم</th>
                  <th className="p-3">العدد</th>
                  <th className="p-3">إجمالي الأجور</th>
                  <th className="p-3">متوسط الأجر</th>
                  <th className="p-3">السعودة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {analytics.departmentsBreakdown.map((d) => (
                  <tr key={d.department_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3 font-sans font-bold text-slate-800 dark:text-white">
                      {d.department_name}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {d.employee_count} موظف
                    </td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {d.total_salary.toLocaleString()} ر.س
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {d.avg_salary.toLocaleString()} ر.س
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        d.saudization_rate >= 50
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}>
                        {d.saudization_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quarterly Cost Trends & Projections (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                الاتجاه الربع سنوي ومؤشر الإنتاجية
              </h3>
              <p className="text-xs text-slate-500">تتبع النمو والتوسع المستهدف 2026</p>
            </div>
          </div>

          <div className="space-y-3">
            {analytics.quarterlyTrends.map((q, idx) => (
              <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-white">{q.quarter}</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{q.payroll_cost.toLocaleString()} ر.س</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>الكوادر: {q.headcount} موظف</span>
                  <span className="text-emerald-600 font-semibold">مؤشر الإنتاجية: {q.productivity_index}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full" 
                    style={{ width: `${q.productivity_index}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Compliance Assurance Box */}
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              جاهزية الامتثال الحكومي الشامل 100%:
            </span>
            <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300 text-[11px]">
              <div>✅ حماية الأجور (مدد WPS)</div>
              <div>✅ التأمينات الاجتماعية (GOSI)</div>
              <div>✅ التغطية الطبية (CCHI)</div>
              <div>✅ توثيق العقود الرقمية (قوى)</div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
