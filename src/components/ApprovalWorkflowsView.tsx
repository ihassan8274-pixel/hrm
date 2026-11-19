import React, { useState, useEffect } from 'react';
import { 
  GitPullRequest, CheckCircle2, XCircle, Clock, 
  UserCheck, Shield, ChevronRight, Plus, 
  Layers, MessageSquare, AlertCircle, RefreshCw, X, Send
} from 'lucide-react';
import type { ApprovalWorkflow, ApprovalRequest, WorkflowStep } from '../types';

export default function ApprovalWorkflowsView() {
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inbox' | 'chains'>('inbox');

  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actorName, setActorName] = useState('المدير المفوض');
  const [actionLoading, setActionLoading] = useState(false);

  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [newRequestData, setNewRequestData] = useState({
    workflow_id: '',
    requester_id: '',
    request_type: 'loan_advance',
    request_title: '',
    amount: 5000,
    details: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [wRes, rRes, eRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/workflow-requests'),
        fetch('/api/employees')
      ]);

      setWorkflows(await wRes.json());
      setRequests(await rRes.json());
      const eData = await eRes.json();
      setEmployees(Array.isArray(eData) ? eData : (eData.employees || []));
    } catch (err) {
      console.error("Failed to load workflow data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: number, action: 'approved' | 'rejected') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/workflow-requests/${requestId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          actor_name: actorName,
          comments: actionComment || (action === 'approved' ? 'تم الاعتماد والموافقة' : 'تم الرفض لعدم استيفاء الشروط')
        })
      });

      if (res.ok) {
        setSelectedRequest(null);
        setActionComment('');
        fetchData();
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestData.workflow_id || !newRequestData.requester_id || !newRequestData.request_title) return;

    try {
      const res = await fetch('/api/workflow-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequestData)
      });
      if (res.ok) {
        setShowNewRequestModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to create request:", err);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div id="approval-workflows-view" className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-brand-800/40">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-brand-500/20 backdrop-blur rounded-xl border border-brand-400/30">
              <GitPullRequest className="w-6 h-6 text-brand-300" />
            </span>
            <h2 className="text-xl font-black">محرك الموافقات وسلاسل الاعتماد المتعددة (Approval Workflows)</h2>
          </div>
          <p className="text-sm text-brand-200/90 max-w-2xl">
            إدارة مسارات الاعتماد الذكية (المدير المباشر ⬅️ الموارد البشرية ⬅️ المالية ⬅️ الإدارة التنفيذية) وفق حدود الصلاحيات وسجلات التدقيق الزمني.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowNewRequestModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            إنشاء طلب جديد
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'inbox'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>صندوق طلبات الاعتماد ({requests.length})</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-400 text-amber-950 rounded-full text-[10px] font-black">
              {pendingCount} معلق
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('chains')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'chains'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>هيكلية وسلاسل المسارات النشطة ({workflows.length})</span>
        </button>
      </div>

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Requests List (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
                جاري تحميل طلبات الاعتماد...
              </div>
            ) : requests.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                لا توجد طلبات اعتماد مسجلة حالياً.
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className={`p-4 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition cursor-pointer space-y-3 ${
                    selectedRequest?.id === req.id
                      ? 'border-brand-500 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-brand-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-white text-sm">{req.request_title}</span>
                        {req.amount && req.amount > 0 && (
                          <span className="px-2 py-0.5 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 text-xs font-mono font-bold rounded">
                            {req.amount.toLocaleString()} ر.س
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        مقدم الطلب: <strong>{req.requester_name}</strong> ({req.requester_department || 'عام'})
                      </p>
                    </div>

                    {req.status === 'pending' ? (
                      <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-full text-[10px] font-bold border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        المستوى {req.current_level} من {req.max_levels} ({req.current_approver_role})
                      </span>
                    ) : req.status === 'approved' ? (
                      <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full text-[10px] font-bold border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        معتمد نهائياً
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-full text-[10px] font-bold border border-rose-300 dark:border-rose-800 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        مرفوض
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {req.details}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>المسار: {req.workflow_title}</span>
                    <span className="font-mono">{req.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Request Details & Action Panel (5 cols) */}
          <div className="lg:col-span-5">
            {selectedRequest ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5 sticky top-4">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">تفاصيل مسار الاعتماد</h3>
                    <span className="text-[10px] text-slate-400 font-mono">رقم الطلب #{selectedRequest.id}</span>
                  </div>
                  <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Main Summary */}
                <div className="space-y-2 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl space-y-1">
                    <span className="text-slate-500 block">عنوان وتفاصيل الطلب:</span>
                    <span className="font-bold text-slate-900 dark:text-white block">{selectedRequest.request_title}</span>
                    <p className="text-slate-600 dark:text-slate-300 text-xs mt-1">{selectedRequest.details}</p>
                  </div>

                  {selectedRequest.amount && selectedRequest.amount > 0 && (
                    <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800 text-brand-900 dark:text-brand-200 flex justify-between items-center">
                      <span>المبلغ المالي المطلوب:</span>
                      <span className="text-base font-black font-mono">{selectedRequest.amount.toLocaleString()} ر.س</span>
                    </div>
                  )}
                </div>

                {/* Visual Approval Chain Timeline */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">سجل التدقيق والموافقات:</h4>
                  
                  <div className="space-y-2">
                    {selectedRequest.history && selectedRequest.history.length > 0 ? (
                      selectedRequest.history.map((h, i) => (
                        <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs flex items-start gap-2 border border-slate-200 dark:border-slate-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex justify-between font-bold text-slate-800 dark:text-white">
                              <span>المستوى {h.level}: {h.actor_name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{h.action_date}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{h.comments}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">بانتظار موافقة المستوى الأول ({selectedRequest.current_approver_role})</p>
                    )}
                  </div>
                </div>

                {/* Action Section (if pending) */}
                {selectedRequest.status === 'pending' && (
                  <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">اسم متخذ القرار:</label>
                      <input
                        type="text"
                        value={actorName}
                        onChange={(e) => setActorName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">ملاحظات وقرار الاعتماد:</label>
                      <input
                        type="text"
                        value={actionComment}
                        onChange={(e) => setActionComment(e.target.value)}
                        placeholder="معتمد ومطابق للائحة / مرفوض لعدم اكتمال المرفقات..."
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleAction(selectedRequest.id, 'rejected')}
                        disabled={actionLoading}
                        className="flex-1 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-xl transition flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        رفض الطلب
                      </button>

                      <button
                        onClick={() => handleAction(selectedRequest.id, 'approved')}
                        disabled={actionLoading}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        اعتماد ونقل للتالي
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="p-8 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                <GitPullRequest className="w-8 h-8 text-slate-300 mx-auto" />
                <p>اختر طلباً من القائمة لعرض مسار الاعتماد واتخاذ الإجراء اللازم.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Chains Tab */}
      {activeTab === 'chains' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((w) => (
            <div key={w.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">{w.title}</h4>
                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold rounded-full">
                  نشط
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">{w.description}</p>

              {/* Steps Visual Chain */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 block">سلسلة الموافقات المتتالية:</span>
                {w.levels.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-brand-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                      {step.level}
                    </div>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{step.approver_role_ar}</span>
                    <span className="text-[10px] text-slate-400 mr-auto font-mono">SLA: {step.sla_hours}س</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-800 dark:text-white">إنشاء طلب اعتماد إداري جديد</h3>
              <button onClick={() => setShowNewRequestModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">مسار الاعتماد المطلوب:</label>
                <select
                  required
                  value={newRequestData.workflow_id}
                  onChange={(e) => setNewRequestData({ ...newRequestData, workflow_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value="">اختر مسار الاعتماد...</option>
                  {workflows.map(w => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">مقدم الطلب:</label>
                <select
                  required
                  value={newRequestData.requester_id}
                  onChange={(e) => setNewRequestData({ ...newRequestData, requester_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} - ({e.job_title || e.position})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">عنوان الطلب:</label>
                  <input
                    type="text"
                    required
                    value={newRequestData.request_title}
                    onChange={(e) => setNewRequestData({ ...newRequestData, request_title: e.target.value })}
                    placeholder="طلب سلفة زواج / دورة تدريبية"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">المبلغ المالي (إن وجد):</label>
                  <input
                    type="number"
                    value={newRequestData.amount}
                    onChange={(e) => setNewRequestData({ ...newRequestData, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">الشرح والتفاصيل والمبررات:</label>
                <textarea
                  rows={2}
                  value={newRequestData.details}
                  onChange={(e) => setNewRequestData({ ...newRequestData, details: e.target.value })}
                  placeholder="مبررات الطلب وخطة التنفيذ..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewRequestModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl"
                >
                  إرسال الطلب للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
