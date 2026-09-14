import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, DollarSign, ArrowUpRight, ArrowDownRight, FileText, Database, Share2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReportsView() {
  const [payrollTrends, setPayrollTrends] = useState<any[]>([]);
  const [headcount, setHeadcount] = useState<any>({ byDept: [], byBranch: [] });
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'excel'>('visual');

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(d => d && setStats(d))
      .catch(e => console.error("Reports stats error:", e));
      
    fetch('/api/analytics/payroll-trends')
      .then(res => res.json())
      .then(d => d && Array.isArray(d) && setPayrollTrends(d))
      .catch(e => console.error("Reports trends error:", e));
      
    fetch('/api/analytics/headcount')
      .then(res => res.json())
      .then(d => d && setHeadcount(d))
      .catch(e => console.error("Reports headcount error:", e));
  }, []);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-8 font-sans pb-10">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-black text-slate-800">التقارير والتحليلات</h1>
          <p className="text-slate-500 text-sm mt-1">نظرة شاملة على أداء المؤسسة والتكاليف التشغيلية</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
           <button 
             onClick={() => setActiveTab('visual')}
             className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${activeTab === 'visual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
           >
             رسوم بيانية
           </button>
           <button 
             onClick={() => setActiveTab('excel')}
             className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${activeTab === 'excel' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
           >
             ربط إكسيل (Direct Link)
           </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'visual' ? (
          <motion.div 
            key="visual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                 <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-tighter">إجمالي الرواتب</p>
                 <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold text-slate-800">{(stats?.totalMonthlyPayroll || 0).toLocaleString()} <span className="text-[10px]">EGP</span></h4>
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                       <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                 </div>
                 <p className="text-[10px] text-emerald-600 mt-2 font-bold flex items-center gap-1">
                   <ArrowUpRight className="w-3 h-3" />
                   +12% عن الشهر الماضي
                 </p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                 <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-tighter">عدد الموظفين</p>
                 <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold text-slate-800">{stats?.totalEmployees || 0} <span className="text-[10px]">موظف</span></h4>
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                       <Users className="w-4 h-4 text-blue-500" />
                    </div>
                 </div>
                 <p className="text-[10px] text-slate-400 mt-2 font-bold">نمو مستقر في التعيينات</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                 <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-tighter">تكلفة الضرائب</p>
                 <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold text-slate-800">{( (stats?.totalMonthlyPayroll || 0) * 0.1).toLocaleString()} <span className="text-[10px]">EGP</span></h4>
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                       <DollarSign className="w-4 h-4 text-orange-500" />
                    </div>
                 </div>
                 <p className="text-[10px] text-orange-600 mt-2 font-bold">10% من إجمالي الكتلة</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                 <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-tighter">معدل الدوران</p>
                 <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold text-slate-800">2.4%</h4>
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                       <ArrowDownRight className="w-4 h-4 text-red-500" />
                    </div>
                 </div>
                 <p className="text-[10px] text-emerald-600 mt-2 font-bold">-0.5% تحسن عن العام الماضي</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500" />
                  نمو كتلة الرواتب (نصف سنوي)
                </h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payrollTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} name="إجمالي الرواتب" barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  توزيع الموظفين حسب الإدارة
                </h3>
                <div className="h-[300px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                          data={(headcount?.byDept || []).map((d: any) => ({ name: d.name, value: d.count }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {(headcount?.byDept || []).map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                     </PieChart>
                  </ResponsiveContainer>
                  <div className="w-1/2 space-y-3">
                     {(headcount?.byDept || []).map((item: any, i: number) => (
                       <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs font-bold text-slate-600">{item.name} ({item.count})</span>
                       </div>
                     ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="excel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-right">
              <div className="flex items-center gap-4 mb-8">
                 <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
                   <Database className="w-8 h-8" />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-slate-800">ربط البيانات المباشر مع Excel</h3>
                   <p className="text-slate-500 text-sm font-bold">استخرج تقاريرك الخاصة وولد الجداول المخصصة عبر ربط برنامج إكسيل بنظامك مباشرة</p>
                 </div>
              </div>

              <div className="space-y-8">
                 <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-indigo-500" />
                      روابط الربط (API Links)
                    </h4>
                    <div className="space-y-4">
                       {[
                         { name: 'بيانات الموظفين', url: `${window.location.origin}/api/excel/employees`, desc: 'جميع بيانات الموظفين، الإدارة، والرواتب' },
                         { name: 'مسير الرواتب المكتمل', url: `${window.location.origin}/api/excel/payroll`, desc: 'سجل جميع الرواتب التي تم صرفها' }
                       ].map((link, i) => (
                         <div key={i} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm">
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(link.url);
                                alert('تم نسخ الرابط! استخدمه في Excel: Get Data > From Web');
                              }}
                              className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest"
                            >
                              نسخ الرابط
                            </button>
                            <div className="text-right">
                               <p className="font-bold text-sm text-slate-800">{link.name}</p>
                               <p className="text-[10px] text-slate-400 mt-0.5">{link.desc}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="font-bold text-slate-800">كيفية الربط في Excel:</h4>
                    <ol className="list-decimal list-inside space-y-3 text-sm text-slate-600 font-bold">
                       <li>افتح برنامج Microsoft Excel</li>
                       <li>انتقل إلى تبويب <span className="text-indigo-600">بيانات (Data)</span></li>
                       <li>اضغط على <span className="text-indigo-600">الحصول على بيانات (Get Data)</span></li>
                       <li>اختر <span className="text-indigo-600">من مصادر أخرى &gt; من الويب (From Web)</span></li>
                       <li>الصق الرابط الذي قمت بنسخه أعلاه واضغط OK</li>
                    </ol>
                 </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-3xl text-white shadow-xl flex flex-col justify-between text-right">
               <div>
                  <h4 className="text-xl font-black mb-4">لماذا الربط المباشر؟</h4>
                  <ul className="space-y-4">
                     {[
                       'تحديث تلقائي للبيانات بضغطة زر واحدة',
                       'تجاوز قوالب النظام وتصميم تقاريرك الخاصة',
                       'ربط البيانات بـ Power BI للتحليلات المتقدمة',
                       'توليد رسوم بيانية مخصصة غير محدودة'
                     ].map((point, i) => (
                       <li key={i} className="flex gap-3 text-sm font-bold text-indigo-100 items-start">
                         <CheckCircle2 className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" />
                         <span>{point}</span>
                       </li>
                     ))}
                  </ul>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
