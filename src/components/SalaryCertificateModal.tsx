import { useState, useEffect, useRef } from 'react';
import { FileText, Printer, CheckCircle, ShieldCheck, Download, X, Building2, QrCode as QrIcon } from 'lucide-react';
import QRCode from 'qrcode';
import type { Employee, SalaryCertificateRecord } from '../types';
import { Letterhead } from '../lib/print/letterhead';
import { useLetterhead } from '../lib/print/use-letterhead';

interface Props {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onCertificateCreated?: () => void;
}

export default function SalaryCertificateModal({ employee, isOpen, onClose, onCertificateCreated }: Props) {
  const [addressedTo, setAddressedTo] = useState('إلى من يهمه الأمر');
  const [purpose, setPurpose] = useState<'bank_loan' | 'credit_card' | 'embassy_visa' | 'real_estate_rental' | 'government_agency' | 'general'>('bank_loan');
  const [includeAllowances, setIncludeAllowances] = useState(true);
  const [includeIban, setIncludeIban] = useState(true);
  const [loading, setLoading] = useState(false);
  const [certificate, setCertificate] = useState<SalaryCertificateRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);
  // ترويسة موحّدة مع بقية مخرجات النظام (ورقة الشركة).
  const company = useLetterhead();

  const purposeOptions = [
    { value: 'bank_loan', label: 'تمويل شخصي / عقاري (بنكي)' },
    { value: 'credit_card', label: 'إصدار بطاقة ائتمانية' },
    { value: 'embassy_visa', label: 'تقديم على تأشيرة سفر (سفارة)' },
    { value: 'real_estate_rental', label: 'عقد إيجار سكني (منصة إيجار)' },
    { value: 'government_agency', label: 'جهة حكومية / رسمية' },
    { value: 'general', label: 'عام (إلى من يهمه الأمر)' },
  ];

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/salary-certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          addressed_to: addressedTo,
          purpose,
          include_allowances: includeAllowances,
          include_bank_iban: includeIban
        })
      });
      const data = await res.json();
      if (data.success) {
        const verifyUrl = `${window.location.origin}/verify-cert/${data.qr_code}`;
        const qrUrl = await QRCode.toDataURL(verifyUrl, { width: 140, margin: 1 });
        setQrDataUrl(qrUrl);
        setCertificate({
          id: data.id,
          employee_id: employee.id,
          certificate_number: data.certificate_number,
          addressed_to: addressedTo,
          purpose,
          include_allowances: includeAllowances ? 1 : 0,
          include_bank_iban: includeIban ? 1 : 0,
          qr_verification_code: data.qr_code,
          issue_date: new Date().toISOString().split('T')[0],
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'issued',
          created_at: new Date().toISOString()
        });
        if (onCertificateCreated) onCertificateCreated();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const totalMonthlyWage = employee.basic_salary + (includeAllowances ? (employee.housing_allowance || 0) + (employee.transport_allowance || 0) + (employee.other_allowances || 0) : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className="bg-white w-full max-w-4xl rounded-3xl p-6 md:p-8 shadow-2xl my-8">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">إصدار شهادة تعريف بالراتب معتمدة</h3>
              <p className="text-xs text-slate-400">مزودة برمز استجابة سريعة (QR Code) للتحقق الفوري معتمدة من المنشأة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!certificate ? (
          <div className="mt-6 space-y-6">
            <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-emerald-950">{employee.name}</p>
                <p className="text-xs text-emerald-700 font-medium">الهوية / الإقامة: {employee.national_id_iqama} | المسمى: {employee.job_title || employee.position}</p>
              </div>
              <div className="text-left rtl:text-right">
                <span className="text-xs text-emerald-800 font-bold">الراتب الأساسي: {employee.basic_salary.toLocaleString()} ر.س</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">موجهة إلى (الجهة المستلمة)</label>
                <input 
                  type="text" 
                  value={addressedTo}
                  onChange={(e) => setAddressedTo(e.target.value)}
                  placeholder="مثال: مصرف الراجحي / بنك الرياض / السفارة الإيطالية"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الغرض من الشهادة</label>
                <select 
                  value={purpose}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setPurpose(val);
                    if (val === 'bank_loan') setAddressedTo('إلى: البنك / جهة التمويل الموقرة');
                    else if (val === 'embassy_visa') setAddressedTo('To: The Visa & Consular Section');
                    else if (val === 'real_estate_rental') setAddressedTo('إلى: منصة إيجار / المؤجر المحترم');
                    else if (val === 'general') setAddressedTo('إلى: من يهمه الأمر');
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {purposeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={includeAllowances} 
                  onChange={(e) => setIncludeAllowances(e.target.checked)} 
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                تضمين تفاصيل البدلات (سكن، نقل، أخرى)
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={includeIban} 
                  onChange={(e) => setIncludeIban(e.target.checked)} 
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                تضمين رقم الآيبان البنكي (Saudi IBAN)
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={onClose} 
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                إلغاء
              </button>
              <button 
                type="button" 
                onClick={handleGenerate} 
                disabled={loading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all"
              >
                {loading ? 'جارِ التوليد والتوثيق...' : 'توليد الشهادة الرسمية'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Printable Document Preview */}
            <div 
              ref={printRef}
              className="bg-white border-2 border-slate-200 rounded-2xl p-8 text-slate-800 space-y-6 print:m-0 print:border-none print:p-0"
              style={{ minHeight: '520px' }}
            >
              {/* Certificate Header — الترويسة الموحّدة لكل مخرجات النظام */}
              <Letterhead company={company} />

              <div className="flex justify-between items-start pb-4">
                <div className="space-y-1">
                  <div className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-lg text-xs font-black">
                    شهادة تعريف بالراتب
                  </div>
                </div>
                <div className="text-left rtl:text-right space-y-1">
                  <p className="text-[10px] font-mono font-bold text-slate-600 mt-1">الرقم: {certificate.certificate_number}</p>
                  <p className="text-[10px] text-slate-500">التاريخ: {certificate.issue_date}</p>
                </div>
              </div>

              {/* Addressed To */}
              <div className="pt-2">
                <p className="text-sm font-black text-slate-900">{certificate.addressed_to}</p>
                <p className="text-xs text-slate-600 mt-1 font-medium">السلام عليكم ورحمة الله وبركاته،، وبعد،</p>
              </div>

              {/* Body Statement */}
              <div className="text-xs leading-relaxed text-slate-700 space-y-3 text-justify font-medium">
                <p>
                  تشهد <strong>{company.org_name}</strong> بأن الموظف الموضحة بياناته أدناه يعمل لدينا وتحت كفالتنا، وما زال على رأس العمل حتى تاريخ إصدار هذا الخطاب:
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">اسم الموظف:</span>
                    <span className="font-black text-slate-800">{employee.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">الجنسية:</span>
                    <span className="font-bold text-slate-800">{employee.nationality || 'سعودي'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">رقم الهوية / الإقامة:</span>
                    <span className="font-mono font-bold text-slate-800">{employee.national_id_iqama}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">المسمى الوظيفي:</span>
                    <span className="font-bold text-slate-800">{employee.job_title || employee.position}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">تاريخ الالتحاق:</span>
                    <span className="font-bold text-slate-800">{employee.contract_start_date || '2022-01-01'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">القسم / الإدارة:</span>
                    <span className="font-bold text-slate-800">{employee.department_name || 'الإدارة العامة'}</span>
                  </div>
                </div>

                <p className="font-bold text-slate-900 pt-2">بيان الأجور والمستحقات الشهرية (بالريال السعودي):</p>

                <table className="w-full text-right text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2.5 border-b border-slate-200">الراتب الأساسي</th>
                      {certificate.include_allowances === 1 && (
                        <>
                          <th className="p-2.5 border-b border-slate-200">بدل السكن</th>
                          <th className="p-2.5 border-b border-slate-200">بدل النقل</th>
                          <th className="p-2.5 border-b border-slate-200">بدلات أخرى</th>
                        </>
                      )}
                      <th className="p-2.5 border-b border-slate-200 bg-emerald-50 text-emerald-900 font-black">إجمالي الراتب الشهري</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="p-2.5 font-bold">{employee.basic_salary.toLocaleString()} ر.س</td>
                      {certificate.include_allowances === 1 && (
                        <>
                          <td className="p-2.5 font-medium">{(employee.housing_allowance || 0).toLocaleString()} ر.س</td>
                          <td className="p-2.5 font-medium">{(employee.transport_allowance || 0).toLocaleString()} ر.س</td>
                          <td className="p-2.5 font-medium">{(employee.other_allowances || 0).toLocaleString()} ر.س</td>
                        </>
                      )}
                      <td className="p-2.5 font-black text-emerald-700 bg-emerald-50/50">{totalMonthlyWage.toLocaleString()} ر.س</td>
                    </tr>
                  </tbody>
                </table>

                {certificate.include_bank_iban === 1 && employee.saudi_iban && (
                  <div className="p-3 bg-brand-50/60 border border-brand-100 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-bold text-brand-900">الحساب البنكي المعتمد لتحويل الراتب (IBAN):</span>
                    <span className="font-mono font-bold text-brand-800" dir="ltr">{employee.saudi_iban}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 pt-2">
                  أُعطيت له هذه الشهادة بناءً على طلبه لتقديمها إلى الجهة المذكورة أعلاه، دون أدنى مسؤولية مالية أو قانونية على الشركة تجاه حقوق الغير. هذه الشهادة سارية المفعول لمدة (30) يوماً من تاريخ إصدارها حتى {certificate.valid_until}.
                </p>
              </div>

              {/* Seal and QR Footer */}
              <div className="flex justify-between items-end pt-4 border-t border-slate-200">
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-900">إدارة الموارد البشرية والامتثال</p>
                  <p className="text-[11px] text-slate-500">شركة المسار الرقمي للحلول المتكاملة</p>
                  <div className="inline-flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold mt-1">
                    <CheckCircle className="w-3.5 h-3.5" /> وثيقة رسمية معتمدة إلكترونياً
                  </div>
                </div>

                {qrDataUrl && (
                  <div className="text-center p-2 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <img src={qrDataUrl} alt="QR Verification" className="w-24 h-24 mx-auto" />
                    <span className="text-[9px] font-mono text-slate-400 block mt-1">مسح للتحقق الفوري</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-2">
              <button 
                type="button" 
                onClick={() => setCertificate(null)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold"
              >
                ← إصدار شهادة أخرى
              </button>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  إغلاق
                </button>
                <button 
                  type="button" 
                  onClick={handlePrint}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الشهادة / تصدير PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
