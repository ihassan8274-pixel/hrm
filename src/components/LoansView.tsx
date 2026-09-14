import { useState, useEffect } from 'react';
import { Landmark, Plus, Search, User, CreditCard, Clock, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Loan {
  id: number;
  employee_id: number;
  employee_name: string;
  total_amount: number;
  remaining_amount: number;
  monthly_installment: number;
  status: string;
  created_at: string;
}

interface Employee {
  id: number;
  name: string;
}

export default function LoansView() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newLoan, setNewLoan] = useState({
    employee_id: 0,
    total_amount: 0,
    monthly_installment: 0
  });

  const fetchData = async () => {
    const [lRes, eRes] = await Promise.all([
      fetch('/api/loans'),
      fetch('/api/employees')
    ]);
    const [lData, eData] = await Promise.all([lRes.json(), eRes.json()]);
    setLoans(lData);
    setEmployees(eData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async () => {
    await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLoan)
    });
    setIsModalOpen(false);
    fetchData();
  };

  const filteredLoans = loans.filter(l => l.employee_name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة القروض والسلف</h1>
          <p className="text-slate-500 text-sm">متابعة المبالغ المستحقة والأقساط الشهرية للموظفين</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
        >
          <Plus className="w-5 h-5" />
          <span>منح قرض جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm col-span-3 flex items-center px-4">
          <Search className="w-5 h-5 text-slate-400 ml-4" />
          <input 
            type="text" 
            placeholder="البحث عن موظف..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-medium text-slate-700 text-right"
          />
        </div>
        <div className="bg-indigo-600 p-4 rounded-2xl text-white shadow-lg shadow-indigo-100 flex flex-col justify-center items-center">
           <p className="text-[10px] uppercase font-bold opacity-80">إجمالي الذمم القائمة</p>
           <p className="text-xl font-bold font-mono">
             {(loans.reduce((acc, curr) => acc + curr.remaining_amount, 0) || 0).toLocaleString()} <span className="text-xs">EGP</span>
           </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500">الموظف</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 text-center">المبلغ الكلي</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 text-center">المتبقي</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 text-center">القسط الشهري</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 text-center">تاريخ المنح</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredLoans.map(loan => (
              <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="font-bold text-slate-800">{loan.employee_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-mono text-sm">{(loan.total_amount || 0).toLocaleString()}</td>
                <td className="px-6 py-4 text-center font-mono text-sm text-red-500 font-bold">{(loan.remaining_amount || 0).toLocaleString()}</td>
                <td className="px-6 py-4 text-center font-mono text-sm text-indigo-600">{(loan.monthly_installment || 0).toLocaleString()}</td>
                <td className="px-6 py-4 text-center text-xs text-slate-400">
                  {new Date(loan.created_at).toLocaleDateString('ar-EG')}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                    {loan.status}
                  </span>
                </td>
              </tr>
            ))}
            {filteredLoans.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-20 text-center text-slate-300">
                   <Landmark className="w-12 h-12 mx-auto mb-4 opacity-10" />
                   <p>لا توجد قروض قائمة حالياً</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl relative"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute left-6 top-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                <Plus className="text-indigo-600" />
                إنشاء قرض جديد لموظف
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">الموظف</label>
                  <select 
                    value={newLoan.employee_id}
                    onChange={e => setNewLoan({ ...newLoan, employee_id: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                  >
                    <option value="0">اختر موظفاً...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">إجمالي القرض (EGP)</label>
                    <input 
                      type="number"
                      value={newLoan.total_amount}
                      onChange={e => setNewLoan({ ...newLoan, total_amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">القسط الشهري (EGP)</label>
                    <input 
                      type="number"
                      value={newLoan.monthly_installment}
                      onChange={e => setNewLoan({ ...newLoan, monthly_installment: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-right font-mono"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-2xl flex justify-between items-center">
                   <div className="text-right">
                      <p className="text-xs font-bold text-indigo-900">مدة السداد المتوقعة</p>
                      <p className="text-[10px] text-indigo-600">سيتم الخصم تلقائياً من الرواتب القادمة</p>
                   </div>
                   <div className="text-xl font-bold text-indigo-700">
                     {newLoan.monthly_installment > 0 ? (newLoan.total_amount / newLoan.monthly_installment).toFixed(1) : 0} <span className="text-[10px]">شهر</span>
                   </div>
                </div>

                <button 
                  onClick={handleCreate}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200 mt-4"
                >
                  اعتماد وتثبيت القرض
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
