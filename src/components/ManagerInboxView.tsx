import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, CalendarDays, GitPullRequest, Landmark } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ManagerInboxView() {
  const { user, hasRole } = useAuth();
  const canManageLoans = hasRole(['admin', 'hr_manager', 'finance']);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const load = async () => {
    const [l, r, n] = await Promise.all([
      fetch('/api/leaves').then(x => x.json()).catch(() => []),
      fetch('/api/workflow-requests').then(x => x.json()).catch(() => []),
      fetch('/api/loans').then(x => x.json()).catch(() => []),
    ]);
    setLeaves((Array.isArray(l) ? l : []).filter((x: any) => x.status === 'pending'));
    setRequests((Array.isArray(r) ? r : []).filter((x: any) => x.status === 'pending' || x.status === 'in_progress'));
    setLoans((Array.isArray(n) ? n : []).filter((x: any) => x.status === 'pending'));
  };
  useEffect(() => { load(); }, []);

  const actLeave = async (id: number, status: string) => {
    await fetch(`/api/leaves/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };
  const actWf = async (id: number, action: 'approved' | 'rejected') => {
    await fetch(`/api/workflow-requests/${id}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor_name: user?.username || 'مدير معتمد', comments: action === 'approved' ? 'موافقة' : 'رفض' })
    });
    load();
  };
  const actLoan = async (id: number, status: 'active' | 'rejected') => {
    await fetch(`/api/loans/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comments: status === 'active' ? 'اعتماد من صندوق المدير' : 'رفض من صندوق المدير' })
    });
    load();
  };

  return (
    <div className="space-y-5 p-4 max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">صندوق اعتماد المدير</h2>
        <button onClick={load} className="p-2 bg-slate-100 rounded-xl"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {canManageLoans && (
        <section className="bg-white rounded-2xl border p-4">
          <h3 className="font-black text-sm mb-3 flex items-center gap-2"><Landmark className="w-4 h-4" /> سلف بانتظار الاعتماد ({loans.length})</h3>
          {loans.map(ln => (
            <div key={ln.id} className="border-b border-slate-100 py-3">
              <p className="font-bold text-sm">{ln.employee_name} — {(ln.total_amount || 0).toLocaleString()} ر.س</p>
              <p className="text-xs text-slate-500">
                قسط شهري {(ln.monthly_installment || 0).toLocaleString()} ر.س
                {ln.workflow_max_levels ? ` — المستوى ${ln.workflow_level} من ${ln.workflow_max_levels}` : ''}
              </p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => actLoan(ln.id, 'active')} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد</button>
                <button onClick={() => actLoan(ln.id, 'rejected')} className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><XCircle className="w-3.5 h-3.5" /> رفض</button>
              </div>
            </div>
          ))}
          {loans.length === 0 && <p className="text-xs text-slate-400">لا سلف معلّقة</p>}
        </section>
      )}
      <section className="bg-white rounded-2xl border p-4">
        <h3 className="font-black text-sm mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4" /> إجازات معلّقة ({leaves.length})</h3>
        {leaves.map(lv => (
          <div key={lv.id} className="border-b border-slate-100 py-3">
            <p className="font-bold text-sm">{lv.employee_name} — {lv.type}</p>
            <p className="text-xs text-slate-500">{lv.start_date} → {lv.end_date} ({lv.days} يوم)</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => actLeave(lv.id, 'approved')} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد</button>
              <button onClick={() => actLeave(lv.id, 'rejected')} className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><XCircle className="w-3.5 h-3.5" /> رفض</button>
            </div>
          </div>
        ))}
        {leaves.length === 0 && <p className="text-xs text-slate-400">لا طلبات إجازة</p>}
      </section>
      <section className="bg-white rounded-2xl border p-4">
        <h3 className="font-black text-sm mb-3 flex items-center gap-2"><GitPullRequest className="w-4 h-4" /> سلاسل اعتماد ({requests.length})</h3>
        {requests.map(rq => (
          <div key={rq.id} className="border-b border-slate-100 py-3">
            <p className="font-bold text-sm">{rq.request_title || rq.request_type}</p>
            <p className="text-xs text-slate-500">{rq.requester_name || ''} {rq.amount ? `— ${Number(rq.amount).toLocaleString()} ر.س` : ''}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => actWf(rq.id, 'approved')} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">اعتماد</button>
              <button onClick={() => actWf(rq.id, 'rejected')} className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold">رفض</button>
            </div>
          </div>
        ))}
        {requests.length === 0 && <p className="text-xs text-slate-400">لا طلبات اعتماد</p>}
      </section>
    </div>
  );
}