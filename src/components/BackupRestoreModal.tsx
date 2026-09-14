import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  FileJson, 
  HardDrive,
  ShieldAlert,
  ArrowDownToLine,
  History
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ 
  isOpen, 
  onClose,
  onSuccess 
}) => {
  const { t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    tables_count?: number;
    records_count?: number;
    exported_at?: string;
    version?: string;
  } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportBackup = async () => {
    setIsExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('فشل تصدير النسخة الاحتياطية');

      const data = await res.json();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      const filename = `saudi_hr_backup_${new Date().toISOString().split('T')[0]}_${Date.now().toString().slice(-4)}.json`;
      
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setMessage({
        type: 'success',
        text: `تم تصدير النسخة الاحتياطية بنجاح (${data.tables_count} جدول، ${data.records_count} سجل)`
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'حدث خطأ أثناء تحميل النسخة الاحتياطية' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const tables = json.tables || json;
        const tablesCount = Object.keys(tables).length;
        let totalRecords = 0;
        Object.values(tables).forEach((rows: any) => {
          if (Array.isArray(rows)) totalRecords += rows.length;
        });

        setParsedPreview({
          tables_count: json.tables_count || tablesCount,
          records_count: json.records_count || totalRecords,
          exported_at: json.exported_at || new Date().toISOString(),
          version: json.version || '1.0'
        });
        setMessage(null);
      } catch (err) {
        setMessage({ type: 'error', text: 'ملف JSON غير صالح أو تالف' });
        setSelectedFile(null);
        setParsedPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) return;
    setIsRestoring(true);
    setMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const payload = JSON.parse(event.target?.result as string);
          const res = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'فشلت عملية الاستعادة');
          }

          const result = await res.json();
          setMessage({
            type: 'success',
            text: `تمت استعادة قاعدة البيانات بنجاح (${result.restored_tables} جدول و ${result.restored_records} سجل). جاري تحديث الصفحة...`
          });

          setTimeout(() => {
            if (onSuccess) onSuccess();
            window.location.reload();
          }, 1800);
        } catch (err: any) {
          setMessage({ type: 'error', text: err.message || 'خطأ أثناء تطبيق النسخة الاحتياطية' });
          setIsRestoring(false);
        }
      };
      reader.readAsText(selectedFile);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'فشلت عملية الاستعادة' });
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-600/30">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">{t('backup.title')}</h3>
              <p className="text-xs text-slate-500">{t('backup.subtitle')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          
          {/* Status/Error Messages */}
          {message && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-bold ${
              message.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Section 1: Export Backup */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                <ArrowDownToLine className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800">تصدير وحفظ نسخة احتياطية كاملة</h4>
                <p className="text-xs text-slate-500 mt-0.5">تنزيل ملف JSON يحتوي على كافة الموظفين، الرواتب، الأصول، والإعدادات</p>
              </div>
            </div>

            <button
              onClick={handleExportBackup}
              disabled={isExporting}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'جاري التصدير...' : t('backup.export_btn')}</span>
            </button>
          </div>

          {/* Section 2: Restore Backup */}
          <div className="p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800">{t('backup.restore_btn')}</h4>
                <p className="text-xs text-slate-500 mt-0.5">اختر ملف نسخة احتياطية (.json) لاسترجاع البيانات بالكامل</p>
              </div>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/30 p-6 rounded-2xl text-center cursor-pointer transition-colors"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".json,application/json" 
                className="hidden" 
              />
              <FileJson className="w-10 h-10 text-indigo-500 mx-auto mb-2 opacity-80" />
              <p className="text-xs font-bold text-slate-700">
                {selectedFile ? selectedFile.name : t('backup.drag_drop')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">يدعم ملفات JSON المنتجة بواسطة النظام</p>
            </div>

            {/* Preview details if file parsed */}
            {parsedPreview && (
              <div className="bg-indigo-50/70 border border-indigo-200 p-4 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-indigo-900 font-bold">
                  <span>معاينة محتوى النسخة:</span>
                  <span className="font-mono text-[11px] bg-indigo-200/60 px-2 py-0.5 rounded">v{parsedPreview.version}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <p>عدد الجداول: <span className="font-bold text-slate-900 font-mono">{parsedPreview.tables_count}</span></p>
                  <p>إجمالي السجلات: <span className="font-bold text-slate-900 font-mono">{parsedPreview.records_count}</span></p>
                </div>
                <p className="text-[10px] text-slate-500">تاريخ التصدير: {new Date(parsedPreview.exported_at || '').toLocaleString('ar-SA')}</p>
              </div>
            )}

            {/* Restore Warning */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{t('backup.warning_restore')}</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleRestoreBackup}
                disabled={!selectedFile || isRestoring}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                <span>{isRestoring ? 'جاري الاستعادة...' : 'تأكيد واستعادة قاعدة البيانات'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            {t('btn.close')}
          </button>
        </div>

      </div>
    </div>
  );
};
