import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, HardHat, Flame, AlertTriangle, 
  CheckCircle2, Plus, Calendar, MapPin, 
  Eye, RefreshCw, X, FileText, CheckSquare, Clock
} from 'lucide-react';
import type { HseInspection, HsePpeLog, HseStats } from '../types';

export default function HseSafetyComplianceView() {
  const [inspections, setInspections] = useState<HseInspection[]>([]);
  const [ppeLogs, setPpeLogs] = useState<HsePpeLog[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [stats, setStats] = useState<HseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inspections' | 'ppe'>('inspections');

  const [showAddInspectionModal, setShowAddInspectionModal] = useState(false);
  const [showAddPpeModal, setShowAddPpeModal] = useState(false);

  // Form states
  const [newInspection, setNewInspection] = useState({
    branch_id: '',
    inspector_name: '',
    inspection_date: new Date().toISOString().split('T')[0],
    category: 'fire_safety',
    status: 'compliant',
    score: 95,
    findings: '',
    corrective_actions: '',
    deadline_date: ''
  });

  const [newPpe, setNewPpe] = useState({
    employee_id: '',
    item_name: 'خوذة أمان معتمدة SASO',
    item_type: 'helmet',
    issue_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [iRes, pRes, sRes, bRes, eRes] = await Promise.all([
        fetch('/api/hse/inspections'),
        fetch('/api/hse/ppe-logs'),
        fetch('/api/hse/stats'),
        fetch('/api/branches'),
        fetch('/api/employees')
      ]);

      setInspections(await iRes.json());
      setPpeLogs(await pRes.json());
      setStats(await sRes.json());
      setBranches(await bRes.json());
      const eData = await eRes.json();
      setEmployees(Array.isArray(eData) ? eData : (eData.employees || []));
    } catch (err) {
      console.error("Failed to load HSE data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInspection.branch_id || !newInspection.inspector_name) return;

    try {
      const res = await fetch('/api/hse/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInspection)
      });
      if (res.ok) {
        setShowAddInspectionModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("Error adding inspection:", err);
    }
  };

  const handleCreatePpe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPpe.employee_id || !newPpe.item_name) return;

    try {
      const res = await fetch('/api/hse/ppe-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPpe)
      });
      if (res.ok) {
        setShowAddPpeModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("Error adding PPE log:", err);
    }
  };

  const categoryLabels: { [key: string]: string } = {
    fire_safety: 'مكافحة الحريق والإنذار المبكر',
    emergency_exits: 'مخارج الطوارئ ومسارات الإخلاء',
    electrical: 'التمديدات والقواطع الكهربائية',
    ventilation: 'التهوية وجودة الهواء الداخلي',
    first_aid: 'حقائب الإسعافات الأولية والكوادر',
    ppe_compliance: 'الالتزام بمهمات الوقاية الشخصية'
  };

  return (
    <div id="hse-safety-view" className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-700 via-orange-600 to-rose-700 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-amber-500/20 backdrop-blur rounded-xl border border-amber-400/30">
              <HardHat className="w-6 h-6 text-amber-200" />
            </span>
            <h2 className="text-xl font-black">الصحة والسلامة المهنية وتفتيش بيئة العمل (HSE & Safety)</h2>
          </div>
          <p className="text-sm text-amber-100/90 max-w-2xl">
            مراقبة بيئة العمل والامتثال لكود البناء السعودي واشتراطات الدفاع المدني وإدارة مهمات الوقاية الشخصية (PPE).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAddInspectionModal(true)}
            className="px-4 py-2 bg-white text-amber-900 rounded-xl text-xs font-bold hover:bg-amber-50 transition shadow flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            تسجيل جولة تفتيشية
          </button>
          <button
            onClick={() => setShowAddPpeModal(true)}
            className="px-4 py-2 bg-amber-900/60 border border-amber-300/40 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            صرف عهدة وقاية (PPE)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>معدل الامتثال العام للسلامة:</span>
              <ShieldAlert className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              {stats.complianceRate}%
            </div>
            <span className="text-[11px] text-slate-400">مطابق للمعايير واللوائح الوطنية</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>ملاحظات تتطلب إجراء تصحيحي:</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-600 font-mono">
              {stats.openViolations}
            </div>
            <span className="text-[11px] text-slate-400">جاري متابعة إغلاقها مع مدراء الفروع</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>المخاطر الحرجة المفتوحة:</span>
              <Flame className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              {stats.criticalIssues}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">سجل خالي من الحوادث الجسيمة</span>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>مهمات الوقاية السارية (PPE):</span>
              <HardHat className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-2xl font-black text-cyan-600 font-mono">
              {stats.activePpeCount}
            </div>
            <span className="text-[11px] text-slate-400">مسلمة للكوادر الميدانية والفنية</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('inspections')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'inspections'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>سجل الجولات التفتيشية وفحص المنشآت ({inspections.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ppe')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'ppe'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <HardHat className="w-4 h-4" />
          <span>سجل مهمات الوقاية الشخصية (PPE) ({ppeLogs.length})</span>
        </button>
      </div>

      {/* Content Table */}
      {activeTab === 'inspections' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">الفرع / المنشأة</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">المفتش وتاريخ الفحص</th>
                  <th className="p-3">نسبة المطابقة</th>
                  <th className="p-3">الملاحظات والإجراء التصحيحي</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {inspections.map((ins) => (
                  <tr key={ins.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3">
                      <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                        {ins.branch_name || 'الفرع الرئيسي'}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {categoryLabels[ins.category] || ins.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="text-slate-800 dark:text-slate-200">{ins.inspector_name}</div>
                      <span className="text-[10px] text-slate-400 font-mono">{ins.inspection_date}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-black font-mono text-sm text-emerald-600">
                        {ins.score}%
                      </span>
                    </td>
                    <td className="p-3 max-w-xs">
                      <div className="text-slate-800 dark:text-slate-200">{ins.findings}</div>
                      {ins.corrective_actions && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200 dark:border-amber-900">
                          الإجراء: {ins.corrective_actions} (المهلة: {ins.deadline_date})
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {ins.status === 'compliant' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          مطابق ومعتمد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          <Clock className="w-3 h-3" />
                          متابعة تصحيحية
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">الموظف المستلم</th>
                  <th className="p-3">أداة / مهمة الوقاية</th>
                  <th className="p-3">تاريخ الصرف</th>
                  <th className="p-3">تاريخ انتهاء الصلاحية</th>
                  <th className="p-3">ملاحظات العهدة</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ppeLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3">
                      <div className="font-bold text-slate-800 dark:text-white">{log.employee_name}</div>
                      <span className="text-[10px] text-slate-400">{log.department_name || 'عام'}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <HardHat className="w-3.5 h-3.5 text-cyan-600" />
                        {log.item_name}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{log.issue_date}</td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{log.expiry_date}</td>
                    <td className="p-3 text-slate-500">{log.notes || 'عهدة نشطة'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        سارية ومطابقة
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Inspection Modal */}
      {showAddInspectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-800 dark:text-white">تسجيل جولة تفتيش سلامة مهنية جديدة</h3>
              <button onClick={() => setShowAddInspectionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInspection} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الفرع أو المنشأة:</label>
                <select
                  required
                  value={newInspection.branch_id}
                  onChange={(e) => setNewInspection({ ...newInspection, branch_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value="">اختر الفرع...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">اسم المفتش المعتمد:</label>
                  <input
                    type="text"
                    required
                    value={newInspection.inspector_name}
                    onChange={(e) => setNewInspection({ ...newInspection, inspector_name: e.target.value })}
                    placeholder="م. تركي الغامدي"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تصنيف الفحص:</label>
                  <select
                    value={newInspection.category}
                    onChange={(e) => setNewInspection({ ...newInspection, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="fire_safety">مكافحة الحريق والإنذار</option>
                    <option value="emergency_exits">مخارج الطوارئ والإخلاء</option>
                    <option value="electrical">التمديدات الكهربائية</option>
                    <option value="first_aid">الإسعافات الأولية</option>
                    <option value="ppe_compliance">مهمات الوقاية الشخصية</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">درجة الامتثال (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newInspection.score}
                    onChange={(e) => setNewInspection({ ...newInspection, score: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">الحالة:</label>
                  <select
                    value={newInspection.status}
                    onChange={(e) => setNewInspection({ ...newInspection, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="compliant">مطابق ومعتمد</option>
                    <option value="needs_action">يتطلب إجراء تصحيحي</option>
                    <option value="critical">خطر حرج</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الملاحظات ونتائج الفحص:</label>
                <textarea
                  rows={2}
                  value={newInspection.findings}
                  onChange={(e) => setNewInspection({ ...newInspection, findings: e.target.value })}
                  placeholder="وصف تفصيلي لحالة الموقع..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الإجراء التصحيحي المطلوب والمهلة:</label>
                <input
                  type="text"
                  value={newInspection.corrective_actions}
                  onChange={(e) => setNewInspection({ ...newInspection, corrective_actions: e.target.value })}
                  placeholder="إجراء الصيانة أو إزالة العوائق..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddInspectionModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
                >
                  حفظ الجولة التفتيشية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add PPE Modal */}
      {showAddPpeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-800 dark:text-white">صرف عهدة وقاية شخصية (PPE) لموظف</h3>
              <button onClick={() => setShowAddPpeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePpe} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الموظف المستلم:</label>
                <select
                  required
                  value={newPpe.employee_id}
                  onChange={(e) => setNewPpe({ ...newPpe, employee_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - ({e.job_title || e.position})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">اسم ووصف أداة الوقاية:</label>
                <input
                  type="text"
                  required
                  value={newPpe.item_name}
                  onChange={(e) => setNewPpe({ ...newPpe, item_name: e.target.value })}
                  placeholder="خوذة أمان معتمدة ANSI Z89.1"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تاريخ الصرف:</label>
                  <input
                    type="date"
                    value={newPpe.issue_date}
                    onChange={(e) => setNewPpe({ ...newPpe, issue_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">تاريخ انتهاء الصلاحية:</label>
                  <input
                    type="date"
                    required
                    value={newPpe.expiry_date}
                    onChange={(e) => setNewPpe({ ...newPpe, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">ملاحظات إضافية:</label>
                <input
                  type="text"
                  value={newPpe.notes}
                  onChange={(e) => setNewPpe({ ...newPpe, notes: e.target.value })}
                  placeholder="تسليم بموجب إقرار استلام موقع..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPpeModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
                >
                  تسجيل العهدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
