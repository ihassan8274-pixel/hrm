import { useState, useEffect } from 'react';
import { Upload, Trash2, FileText, Eye, RefreshCw, IdCard, FileBadge, Stethoscope, FilePlus2 } from 'lucide-react';

interface Employee { id: number; name: string; position: string; branch_id: number; passport_number: string; passport_expiry: string; health_cert_expiry: string; iqama_expiry_gregorian: string; iqama_profession: string; job_title: string; }
interface Doc { id: number; employee_id: number; doc_type: string; doc_number: string; expiry_date: string; file_path: string; notes: string; }

const DOC_TYPES = [
  { v: 'passport', l: 'جواز سفر', i: FileBadge },
  { v: 'iqama', l: 'إقامة', i: IdCard },
  { v: 'health_cert', l: 'شهادة صحية', i: Stethoscope },
  { v: 'contract', l: 'عقد عمل', i: FileText },
  { v: 'other', l: 'أخرى', i: FilePlus2 },
];

export default function EmployeeDocumentsView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [upload, setUpload] = useState({ doc_type: 'passport', doc_number: '', expiry_date: '', notes: '', data_uri: '' });
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const e = await fetch('/api/employees').then(r => r.json());
    setEmployees(e);
    const d = await fetch('/api/employee-documents').then(r => r.json());
    setDocs(d);
  };
  useEffect(() => { load(); }, []);

  const emp = employees.find(e => String(e.id) === selectedEmp);
  const empDocs = docs.filter(d => String(d.employee_id) === selectedEmp);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setUpload({ ...upload, data_uri: String(reader.result) });
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!selectedEmp) return setMessage('اختر الموظف أولاً');
    const res = await fetch('/api/employee-documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: Number(selectedEmp), ...upload })
    });
    const data = await res.json();
    if (data.success) { setMessage('تم رفع الوثيقة'); setUpload({ doc_type: 'passport', doc_number: '', expiry_date: '', notes: '', data_uri: '' }); load(); }
    else setMessage(data.error || 'فشل الرفع');
  };

  const del = async (id: number) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800">ملف الموظف والوثائق</h2>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"><RefreshCw className="w-4 h-4" /> تحديث</button>
      </div>

      {message && <div className="px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee selector */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4">اختر الموظف</h3>
          <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
            <option value="">— اختر —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
          </select>
          {emp && (
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-400">الوظيفة</span><span className="font-bold text-slate-700">{emp.position || emp.job_title}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-400">مسمى الإقامة</span><span className="font-bold text-slate-700">{emp.iqama_profession || '—'}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-400">انتهاء الإقامة</span><span className="font-bold text-slate-700">{emp.iqama_expiry_gregorian || '—'}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-400">رقم الجواز</span><span className="font-bold text-slate-700">{emp.passport_number || '—'}</span></div>
              <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-400">انتهاء الجواز</span><span className="font-bold text-slate-700">{emp.passport_expiry || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">انتهاء الشهادة الصحية</span><span className="font-bold text-slate-700">{emp.health_cert_expiry || '—'}</span></div>
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-emerald-600" /> رفع وثيقة</h3>
          <div className="space-y-3">
            <select value={upload.doc_type} onChange={e => setUpload({ ...upload, doc_type: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50">
              {DOC_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <input value={upload.doc_number} onChange={e => setUpload({ ...upload, doc_number: e.target.value })} placeholder="رقم الوثيقة" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <input type="date" value={upload.expiry_date} onChange={e => setUpload({ ...upload, expiry_date: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <input value={upload.notes} onChange={e => setUpload({ ...upload, notes: e.target.value })} placeholder="ملاحظات" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            <input type="file" accept="image/*,application/pdf" onChange={e => onFile(e.target.files?.[0])} className="w-full text-sm" />
            {upload.data_uri && <p className="text-[11px] text-brand-600 font-bold">تم اختيار ملف ✓</p>}
            <button onClick={submit} className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-brand-700">حفظ الوثيقة</button>
          </div>
        </div>

        {/* Gallery */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-1">
          <h3 className="font-black text-slate-800 mb-4">وثائق {emp?.name || ''}</h3>
          <div className="space-y-3">
            {empDocs.map(d => {
              const t = DOC_TYPES.find(x => x.v === d.doc_type);
              return (
                <div key={d.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-3">
                    {t ? <t.i className="w-5 h-5 text-brand-600" /> : <FileText className="w-5 h-5 text-slate-400" />}
                    <div>
                      <p className="font-bold text-sm text-slate-700">{t?.l || d.doc_type}</p>
                      <p className="text-[11px] text-slate-400">{d.doc_number} {d.expiry_date ? `· ينتهي ${d.expiry_date}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {d.file_path && <a href={d.file_path} target="_blank" className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600"><Eye className="w-4 h-4" /></a>}
                    <button onClick={() => del(d.id)} className="p-1.5 bg-white border border-red-200 rounded-lg text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
            {empDocs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">لا توجد وثائق لهذا الموظف</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
