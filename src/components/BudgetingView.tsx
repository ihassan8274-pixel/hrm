import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  PieChart as PieIcon, 
  Building2, 
  ShieldCheck, 
  Plane, 
  Award, 
  Sparkles, 
  Save, 
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle
} from 'lucide-react';
import { DepartmentBudget, BudgetForecastScenario } from '../types';

interface BudgetingViewProps {
  onBack?: () => void;
}

export const BudgetingView: React.FC<BudgetingViewProps> = () => {
  const [budgets, setBudgets] = useState<DepartmentBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState<DepartmentBudget | null>(null);

  // Hiring simulator state
  const [newSaudis, setNewSaudis] = useState(2);
  const [avgSaudiSalary, setAvgSaudiSalary] = useState(8500);
  const [newExpats, setNewExpats] = useState(1);
  const [avgExpatSalary, setAvgExpatSalary] = useState(6000);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/budgets/departments');
      if (res.ok) {
        const data = await res.json();
        setBudgets(data);
        if (data.length > 0) setSelectedDept(data[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, []);

  const totalAllocatedAll = budgets.reduce((acc, b) => acc + (b.total_allocated || 0), 0);
  const totalSpentAll = budgets.reduce((acc, b) => acc + (b.actual_spent || 0), 0);
  const totalHeadcountCap = budgets.reduce((acc, b) => acc + (b.headcount_cap || 0), 0);
  const totalCurrentHeadcount = budgets.reduce((acc, b) => acc + (b.current_headcount || 0), 0);

  // Simulation Calculations
  // Saudi cost: Salary * 12 + GOSI (11.75%) + Medical insurance (2500) + EOS Provision (0.5 mo = salary * 0.5)
  const annualSaudiCostPerHead = (avgSaudiSalary * 12) + (avgSaudiSalary * 12 * 0.1175) + 2500 + (avgSaudiSalary * 0.5);
  // Expat cost: Salary * 12 + GOSI (2%) + Work Permit/Maktab Amal (9600) + Iqama (650) + Medical (2500) + Annual Flight Ticket (3000) + EOS Provision (avgExpatSalary * 0.5)
  const annualExpatCostPerHead = (avgExpatSalary * 12) + (avgExpatSalary * 12 * 0.02) + 9600 + 650 + 2500 + 3000 + (avgExpatSalary * 0.5);

  const totalIncrementalAnnual = (newSaudis * annualSaudiCostPerHead) + (newExpats * annualExpatCostPerHead);
  const totalIncrementalMonthly = totalIncrementalAnnual / 12;

  const handleUpdateDeptBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDept) return;

    try {
      const res = await fetch(`/api/budgets/departments/${selectedDept.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedDept)
      });
      if (res.ok) {
        alert('تم حفظ ميزانية الإدارة بنجاح');
        fetchBudgets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">ميزانية الموارد البشرية والرواتب والتكاليف التقديرية</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              تخطيط تكاليف الرواتب والتأمينات ورسوم رخص العمل (9600 ر.س) والتأمين الطبي وتذاكر السفر ومخصصات نهاية الخدمة
            </p>
          </div>
        </div>

        <button
          onClick={fetchBudgets}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي الميزانية السنوية المعتمدة</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {totalAllocatedAll.toLocaleString()} <span className="text-xs font-normal text-slate-500">ر.س</span>
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>المنفق الفعلي حتى الآن:</span>
            <span className="font-semibold text-slate-700 font-mono">{totalSpentAll.toLocaleString()} ر.س</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">نسبة استهلاك الميزانية</span>
            <TrendingUp className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {totalAllocatedAll > 0 ? Math.round((totalSpentAll / totalAllocatedAll) * 100) : 0}%
          </p>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div 
              className="bg-brand-600 h-full rounded-full" 
              style={{ width: `${Math.min(100, (totalSpentAll / (totalAllocatedAll || 1)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">سقف القوى العاملة (Headcount Cap)</span>
            <Users className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {totalCurrentHeadcount} <span className="text-sm font-normal text-slate-500">/ {totalHeadcountCap} موظف</span>
          </p>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            متاح تعيين {Math.max(0, totalHeadcountCap - totalCurrentHeadcount)} شواغر معتمدة
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">المتبقي الصافي للمشاريع</span>
            <PieIcon className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2 font-mono">
            {(totalAllocatedAll - totalSpentAll).toLocaleString()} <span className="text-xs font-normal text-slate-500">ر.س</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            مخصص للترقيات والبدلات والمكافآت
          </p>
        </div>
      </div>

      {/* Main Budget Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Departments Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            توزيع ميزانيات الإدارات والأقسام لعام 2026
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">الإدارة</th>
                  <th className="py-3 px-3">سقف الكادر</th>
                  <th className="py-3 px-3">ميزانية الرواتب</th>
                  <th className="py-3 px-3">رخص وتأمين</th>
                  <th className="py-3 px-3">الإجمالي المعتمد</th>
                  <th className="py-3 px-3">المصروف الفعلي</th>
                  <th className="py-3 px-3">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {budgets.map((b) => (
                  <tr 
                    key={b.id} 
                    className={`hover:bg-slate-50 transition-colors ${selectedDept?.id === b.id ? 'bg-brand-50/50' : ''}`}
                  >
                    <td className="py-3.5 px-3 font-bold text-slate-900">
                      {b.department_name || `إدارة ${b.department_id}`}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="font-mono">{b.current_headcount} / {b.headcount_cap}</span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-700">
                      {b.allocated_salaries?.toLocaleString()} ر.س
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-700">
                      {((b.allocated_medical || 0) + (b.allocated_work_permits || 0)).toLocaleString()} ر.س
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-slate-900">
                      {b.total_allocated?.toLocaleString()} ر.س
                    </td>
                    <td className="py-3.5 px-3 font-mono text-emerald-700">
                      {b.actual_spent?.toLocaleString()} ر.س
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        onClick={() => setSelectedDept(b)}
                        className="px-2.5 py-1 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded text-xs font-semibold"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit form */}
          {selectedDept && (
            <form onSubmit={handleUpdateDeptBudget} className="mt-4 p-4 border border-brand-100 bg-brand-50/30 rounded-xl space-y-3">
              <h4 className="font-bold text-xs text-brand-900">
                تعديل بنود ميزانية ({selectedDept.department_name || `إدارة ${selectedDept.department_id}`})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1">الرواتب الأساسية والبدلات:</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_salaries}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_salaries: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">اشتراكات التأمينات GOSI:</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_gosi}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_gosi: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">التأمين الطبي CCHI:</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_medical}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_medical: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">رسوم رخص العمل (مكتب العمل):</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_work_permits}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_work_permits: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">تذاكر سفر وإجازات:</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_flight_tickets}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_flight_tickets: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">مخصص نهاية الخدمة (EOS):</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_end_of_service}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_end_of_service: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">التدريب والتحفيز:</label>
                  <input
                    type="number"
                    value={selectedDept.allocated_training_rewards}
                    onChange={(e) => setSelectedDept({ ...selectedDept, allocated_training_rewards: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">سقف الكادر (Headcount):</label>
                  <input
                    type="number"
                    value={selectedDept.headcount_cap}
                    onChange={(e) => setSelectedDept({ ...selectedDept, headcount_cap: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-200 rounded font-mono bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 hover:bg-brand-700"
                >
                  <Save className="w-3.5 h-3.5" /> حفظ التحديثات
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right 1 Col: Smart Headcount Cost Simulator */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-900 text-base">محاكي تكلفة التعيينات الجديدة</h3>
          </div>
          <p className="text-xs text-slate-500">
            احتساب شامل للتكلفة الحقيقية (الراتب + التأمينات 11.75% + رخصة العمل 9,600 ر.س + الإقامة + التأمين الصحي + التذكرة السنوية + مكافأة نهاية الخدمة).
          </p>

          <div className="space-y-3 pt-2">
            <div className="bg-slate-50 p-3 rounded-lg space-y-2">
              <span className="text-xs font-bold text-slate-800 block">الكفاءات الوطنية (سعوديين):</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">عدد الموظفين:</label>
                  <input
                    type="number"
                    min={0}
                    value={newSaudis}
                    onChange={(e) => setNewSaudis(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">متوسط الراتب (ر.س):</label>
                  <input
                    type="number"
                    step={500}
                    value={avgSaudiSalary}
                    onChange={(e) => setAvgSaudiSalary(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg space-y-2">
              <span className="text-xs font-bold text-slate-800 block">الكفاءات الوافدة (غير سعوديين):</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">عدد الموظفين:</label>
                  <input
                    type="number"
                    min={0}
                    value={newExpats}
                    onChange={(e) => setNewExpats(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">متوسط الراتب (ر.س):</label>
                  <input
                    type="number"
                    step={500}
                    value={avgExpatSalary}
                    onChange={(e) => setAvgExpatSalary(Number(e.target.value))}
                    className="w-full p-1.5 border border-slate-200 rounded font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Results Box */}
          <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl space-y-3">
            <span className="text-xs font-bold text-emerald-900 block">الأثر المالي المباشر على الميزانية:</span>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-700">
                <span>التكلفة السنوية الإضافية:</span>
                <span className="font-bold font-mono text-emerald-900 text-sm">
                  {Math.round(totalIncrementalAnnual).toLocaleString()} ر.س
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span>الأثر الشهري على مسير الرواتب:</span>
                <span className="font-bold font-mono text-slate-900">
                  {Math.round(totalIncrementalMonthly).toLocaleString()} ر.س / شهر
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span>رسوم حكومية سنوية (رخص + إقامات):</span>
                <span className="font-bold font-mono text-slate-900">
                  {Math.round(newExpats * (9600 + 650)).toLocaleString()} ر.س
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
