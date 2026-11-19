import { useState, useEffect } from 'react';
import { 
  Calendar, Search, User, Clock, AlertTriangle, Save, Filter, 
  MapPin, CheckCircle2, XCircle, ArrowUpRight, Fingerprint, 
  Sparkles, Moon, Sun, Laptop, ShieldCheck, Download, RefreshCw,
  Building, ChevronRight, AlertCircle, Smartphone, Compass
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';

interface Attendance {
  id?: number;
  employee_id: number;
  employee_name: string;
  month: number;
  year: number;
  absence_days: number;
  overtime_hours: number;
}

interface Employee {
  id: number;
  name: string;
  department_name?: string;
  branch_name?: string;
  basic_salary?: number;
  is_saudi?: number;
  job_title?: string;
}

interface PunchLog {
  id: string;
  employee_id: number;
  employee_name: string;
  department: string;
  date: string;
  time_in: string;
  time_out: string;
  location: string;
  verification_method: 'gps_mobile' | 'biometric_fingerprint' | 'facial_recognition' | 'rfid_card';
  status: 'on_time' | 'late' | 'early_leave' | 'absent' | 'overtime';
  late_minutes: number;
  overtime_minutes: number;
  gps_coords?: string;
}

export default function AttendanceView() {
  const { t, language } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'monthly' | 'live_gps' | 'punches' | 'ramadan_rules'>('monthly');

  // Ramadan & Labor Law shift rules
  const [isRamadanMode, setIsRamadanMode] = useState(false);
  const [standardShiftHours, setStandardShiftHours] = useState(8);

  // Live GPS punch simulation state
  const [selectedPunchEmp, setSelectedPunchEmp] = useState<number | ''>('');
  const [punchLocation, setPunchLocation] = useState<'riyadh_hq' | 'jeddah_branch' | 'dammam_hub' | 'remote_telework'>('riyadh_hq');
  const [punchActionType, setPunchActionType] = useState<'in' | 'out'>('in');
  const [gpsStatus, setGpsStatus] = useState<{ active: boolean; message: string; accuracy: number }>({
    active: true,
    message: 'الموقع الجغرافي داخل النطاق المعتمد (Geofence: 45m)',
    accuracy: 98
  });
  const [lastPunchAlert, setLastPunchAlert] = useState<string | null>(null);

  // Simulated punch logs
  const [punchLogs, setPunchLogs] = useState<PunchLog[]>([
    {
      id: 'PUNCH-901',
      employee_id: 1,
      employee_name: 'محمد عبدالله القحطاني',
      department: 'الموارد البشرية',
      date: new Date().toISOString().split('T')[0],
      time_in: '08:02 ص',
      time_out: '05:05 م',
      location: 'المركز الرئيسي - الرياض (طريق الملك فهد)',
      verification_method: 'gps_mobile',
      status: 'on_time',
      late_minutes: 0,
      overtime_minutes: 35,
      gps_coords: '24.7136° N, 46.6753° E'
    },
    {
      id: 'PUNCH-902',
      employee_id: 2,
      employee_name: 'سارة خالد المنصور',
      department: 'المالية والمحاسبة',
      date: new Date().toISOString().split('T')[0],
      time_in: '08:42 ص',
      time_out: '05:00 م',
      location: 'فرع جدة (طريق الكورنيش)',
      verification_method: 'facial_recognition',
      status: 'late',
      late_minutes: 42,
      overtime_minutes: 0,
      gps_coords: '21.5433° N, 39.1728° E'
    },
    {
      id: 'PUNCH-903',
      employee_id: 3,
      employee_name: 'أحمد محمود المصري',
      department: 'تقنية المعلومات',
      date: new Date().toISOString().split('T')[0],
      time_in: '07:55 ص',
      time_out: '06:30 م',
      location: 'العمل عن بعد (Telework)',
      verification_method: 'gps_mobile',
      status: 'overtime',
      late_minutes: 0,
      overtime_minutes: 90,
      gps_coords: '24.7743° N, 46.7386° E'
    },
    {
      id: 'PUNCH-904',
      employee_id: 4,
      employee_name: 'فاطمة عمر الشهري',
      department: 'العمليات والتطوير',
      date: new Date().toISOString().split('T')[0],
      time_in: '08:10 ص',
      time_out: '04:15 م',
      location: 'فرع الدمام',
      verification_method: 'biometric_fingerprint',
      status: 'early_leave',
      late_minutes: 10,
      overtime_minutes: 0,
      gps_coords: '26.4207° N, 50.0888° E'
    }
  ]);

  const fetchData = async () => {
    try {
      const [eRes, aRes] = await Promise.all([
        fetch('/api/employees'),
        fetch(`/api/attendance?month=${month}&year=${year}`)
      ]);
      const [eData, aData] = await Promise.all([eRes.json(), aRes.json()]);
      setEmployees(eData);
      setAttendance(aData);
      if (eData.length > 0 && selectedPunchEmp === '') {
        setSelectedPunchEmp(eData[0].id);
      }
    } catch (err) {
      console.error('Error fetching attendance data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, year]);

  useEffect(() => {
    if (isRamadanMode) {
      setStandardShiftHours(6);
    } else {
      setStandardShiftHours(8);
    }
  }, [isRamadanMode]);

  const updateEntry = (employeeId: number, field: 'absence_days' | 'overtime_hours', value: number) => {
    const existingIndex = attendance.findIndex(a => a.employee_id === employeeId);
    if (existingIndex > -1) {
      const newAtt = [...attendance];
      newAtt[existingIndex] = { ...newAtt[existingIndex], [field]: value };
      setAttendance(newAtt);
    } else {
      const emp = employees.find(e => e.id === employeeId);
      setAttendance([...attendance, { 
        employee_id: employeeId, 
        employee_name: emp?.name || '', 
        month, 
        year, 
        absence_days: field === 'absence_days' ? value : 0, 
        overtime_hours: field === 'overtime_hours' ? value : 0 
      }]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const entry of attendance) {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      }
      setLastPunchAlert('تم حفظ وتحديث سجلات الحضور والغياب الشهرية بنجاح!');
      setTimeout(() => setLastPunchAlert(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimulateLivePunch = () => {
    const emp = employees.find(e => e.id === Number(selectedPunchEmp));
    if (!emp) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
    const locationNameMap: Record<string, string> = {
      riyadh_hq: 'المركز الرئيسي - الرياض (طريق الملك فهد)',
      jeddah_branch: 'فرع جدة (طريق الكورنيش)',
      dammam_hub: 'فرع الدمام والمنطقة الشرقية',
      remote_telework: 'العمل عن بعد المعتمد (منصة العمل المرن)'
    };

    const newPunch: PunchLog = {
      id: `PUNCH-${Math.floor(1000 + Math.random() * 9000)}`,
      employee_id: emp.id,
      employee_name: emp.name,
      department: emp.department_name || 'عام',
      date: now.toISOString().split('T')[0],
      time_in: punchActionType === 'in' ? timeStr : '08:00 ص',
      time_out: punchActionType === 'out' ? timeStr : '--:--',
      location: locationNameMap[punchLocation],
      verification_method: punchLocation === 'remote_telework' ? 'gps_mobile' : 'gps_mobile',
      status: 'on_time',
      late_minutes: 0,
      overtime_minutes: punchActionType === 'out' ? 30 : 0,
      gps_coords: '24.7136° N, 46.6753° E'
    };

    setPunchLogs([newPunch, ...punchLogs]);
    setLastPunchAlert(`تم تسجيل ${punchActionType === 'in' ? 'حضور' : 'انصراف'} الموظف (${emp.name}) بنجاح عبر نظام التحقق الجغرافي GPS!`);
    setTimeout(() => setLastPunchAlert(null), 4000);
  };

  // Sync punch logs to monthly attendance summary
  const handleAutoSyncFromPunches = () => {
    const newAttendance = [...attendance];
    // Calculate overtime & absences based on logs
    punchLogs.forEach(log => {
      const existingIdx = newAttendance.findIndex(a => a.employee_id === log.employee_id);
      const otHours = Math.round(log.overtime_minutes / 60);
      if (existingIdx > -1) {
        newAttendance[existingIdx].overtime_hours = Math.max(newAttendance[existingIdx].overtime_hours, otHours);
      } else {
        newAttendance.push({
          employee_id: log.employee_id,
          employee_name: log.employee_name,
          month,
          year,
          absence_days: 0,
          overtime_hours: otHours
        });
      }
    });

    setAttendance(newAttendance);
    setLastPunchAlert('تم احتساب الساعات ومزامنة سجلات البصمة مع المسير بنجاح!');
    setTimeout(() => setLastPunchAlert(null), 4000);
  };

  const filteredEmployees = employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalAbsence = attendance.reduce((acc, curr) => acc + (Number(curr.absence_days) || 0), 0);
  const totalOvertime = attendance.reduce((acc, curr) => acc + (Number(curr.overtime_hours) || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Alert banner */}
      <AnimatePresence>
        {lastPunchAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-500 text-white rounded-2xl flex items-center justify-between shadow-lg shadow-emerald-500/20 text-xs font-bold"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-100" />
              <span>{lastPunchAlert}</span>
            </div>
            <button onClick={() => setLastPunchAlert(null)} className="text-emerald-100 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with quick stats */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="p-2.5 bg-brand-50 text-brand-700 rounded-2xl border border-brand-100">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">
                {language === 'ar' ? 'إدارة الحضور والانصراف والبصمة الذكية' : 'Smart Attendance & GPS Punch'}
              </h1>
              <p className="text-slate-500 text-xs font-medium">
                {language === 'ar' 
                  ? 'متابعة الدوام اليومي، أجهزة البصمة البيومترية، التحقق الجغرافي GPS، والامتثال لساعات العمل حسب نظام العمل السعودي'
                  : 'Daily attendance tracking, biometric logs, GPS geofencing & Saudi labor law shift compliance'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Ramadan Mode Toggle */}
          <button
            onClick={() => setIsRamadanMode(!isRamadanMode)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border ${
              isRamadanMode 
                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/30 animate-pulse' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>{isRamadanMode ? 'نظام شهر رمضان نشط (6 ساعات/يوم)' : 'تفعيل دوام رمضان (المادة 98)'}</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select 
              value={month} 
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs"
            >
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>شهر {i+1}</option>)}
            </select>
            <span className="text-slate-300">/</span>
            <select 
              value={year} 
              onChange={e => setYear(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 mb-1">إجمالي الموظفين المسجلين</p>
            <h3 className="text-2xl font-black text-slate-800">{employees.length} <span className="text-xs text-slate-400 font-normal">موظف</span></h3>
          </div>
          <div className="w-11 h-11 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center font-bold">
            <User className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 mb-1">ساعات العمل القياسية لليوم</p>
            <h3 className="text-2xl font-black text-brand-600">{standardShiftHours} <span className="text-xs text-brand-400 font-normal">ساعات / يوم</span></h3>
          </div>
          <div className="w-11 h-11 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center font-bold">
            {isRamadanMode ? <Moon className="w-5 h-5 text-amber-500" /> : <Sun className="w-5 h-5" />}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 mb-1">إجمالي أيام الغياب للشهر</p>
            <h3 className="text-2xl font-black text-red-600">{totalAbsence} <span className="text-xs text-red-400 font-normal">يوم غياب</span></h3>
          </div>
          <div className="w-11 h-11 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center font-bold">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 mb-1">إجمالي ساعات العمل الإضافي</p>
            <h3 className="text-2xl font-black text-emerald-600">{totalOvertime} <span className="text-xs text-emerald-400 font-normal">ساعة (×1.5)</span></h3>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-2xl shadow-sm overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'monthly'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول الحركات الشهرية ومسير الرواتب</span>
        </button>

        <button
          onClick={() => setActiveTab('live_gps')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'live_gps'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Smartphone className="w-4 h-4 text-emerald-600" />
          <span>تسجيل الحضور الذكي (GPS Geofence)</span>
        </button>

        <button
          onClick={() => setActiveTab('punches')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'punches'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>سجلات أجهزة البصمة الحية ({punchLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('ramadan_rules')}
          className={`py-3.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'ramadan_rules'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          <span>لوائح نظام العمل (المواد 98 و 107)</span>
        </button>
      </div>

      {/* TAB 1: Monthly Attendance Matrix */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center px-4 flex-1">
              <Search className="w-4 h-4 text-slate-400 ml-3" />
              <input 
                type="text" 
                placeholder="بحث باسم الموظف أو الرقم الوظيفي..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs text-right"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoSyncFromPunches}
                className="flex items-center gap-1.5 bg-emerald-50 text-brand-800 border border-emerald-200 px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-100 transition-all text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>مزامنة تلقائية من البصمة</span>
              </button>

              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-xl font-black hover:bg-brand-700 transition-all active:scale-95 disabled:opacity-50 text-xs shadow-md shadow-brand-200"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات في المسير'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold text-slate-500">الموظف والوظيفة</th>
                  <th className="px-6 py-4 font-bold text-slate-500">القسم / الفرع</th>
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">أيام الغياب (خصم)</th>
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">ساعات الإضافي (×1.5)</th>
                  <th className="px-6 py-4 font-bold text-slate-500 text-center">حالة الإدخال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredEmployees.map(emp => {
                  const entry = attendance.find(a => a.employee_id === emp.id);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                            {emp.name.slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-black text-slate-800">{emp.name}</p>
                            <p className="text-[10px] text-slate-400">{emp.job_title || 'موظف'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700">{emp.department_name || 'الإدارة العامة'}</p>
                        <p className="text-[10px] text-slate-400">{emp.branch_name || 'المركز الرئيسي'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100">
                          <input 
                            type="number"
                            min="0"
                            max="31"
                            value={entry?.absence_days || 0}
                            onChange={e => updateEntry(emp.id, 'absence_days', Number(e.target.value))}
                            className="w-10 bg-transparent text-center font-black text-red-600 outline-none text-xs"
                          />
                          <span className="text-[10px] font-bold text-red-400">يوم</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                          <input 
                            type="number"
                            min="0"
                            max="120"
                            value={entry?.overtime_hours || 0}
                            onChange={e => updateEntry(emp.id, 'overtime_hours', Number(e.target.value))}
                            className="w-10 bg-transparent text-center font-black text-emerald-600 outline-none text-xs"
                          />
                          <span className="text-[10px] font-bold text-emerald-400">ساعة</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {entry && (entry.absence_days > 0 || entry.overtime_hours > 0) ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            تم التحديث
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            دوام كامل منتظم
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Live GPS Geofenced Punch Simulator */}
      {activeTab === 'live_gps' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-100 shadow-xl space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Smartphone className="w-5 h-5 text-brand-600" />
              <h3 className="font-black text-slate-800 text-sm">تسجيل بصمة فورية عبر الهاتف (GPS)</h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">اختر الموظف</label>
              <select
                value={selectedPunchEmp}
                onChange={e => setSelectedPunchEmp(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:ring-2 focus:ring-brand-500"
              >
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} - {e.department_name || 'عام'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">موقع العمل الجغرافي (Geofence)</label>
              <select
                value={punchLocation}
                onChange={e => setPunchLocation(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="riyadh_hq">المقر الرئيسي - الرياض (طريق الملك فهد)</option>
                <option value="jeddah_branch">فرع جدة (طريق الكورنيش)</option>
                <option value="dammam_hub">فرع الدمام والمنطقة الشرقية</option>
                <option value="remote_telework">العمل عن بعد (Telework معتمد)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">نوع الحركة</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPunchActionType('in')}
                  className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                    punchActionType === 'in' 
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-200' 
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تسجيل حضور</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPunchActionType('out')}
                  className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                    punchActionType === 'out' 
                      ? 'bg-slate-900 text-white border-black shadow-md' 
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>تسجيل انصراف</span>
                </button>
              </div>
            </div>

            {/* GPS Diagnostic */}
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                  دقة تحديد الموقع (GPS Accuracy)
                </span>
                <span>{gpsStatus.accuracy}%</span>
              </div>
              <p className="text-[10px] text-emerald-700 font-medium">{gpsStatus.message}</p>
            </div>

            <button
              onClick={handleSimulateLivePunch}
              className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-brand-600 hover:from-brand-700 hover:to-brand-700 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-200 text-xs transition-all active:scale-95"
            >
              <Fingerprint className="w-4 h-4" />
              <span>تأكيد تسجيل البصمة الآن</span>
            </button>
          </div>

          {/* Interactive Geofence Map Card */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-500" />
                  <span>خريطة النطاق الجغرافي للمنشأة (Geofencing Radius)</span>
                </h3>
                <span className="text-[10px] bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full font-bold">
                  نصف القطر المعتمد: 150 متر
                </span>
              </div>

              {/* Styled Mock Map Container */}
              <div className="h-64 bg-slate-900 rounded-2xl relative overflow-hidden border border-slate-800 flex items-center justify-center p-4">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
                
                {/* Visual Geofence circle */}
                <div className="w-40 h-40 rounded-full border-2 border-dashed border-emerald-400 bg-emerald-500/10 flex items-center justify-center animate-pulse">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <div className="w-4 h-4 bg-emerald-400 rounded-full shadow-lg shadow-emerald-400" />
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 bg-slate-800/90 backdrop-blur-sm px-3 py-2 rounded-xl text-white text-[10px] font-mono border border-slate-700 space-y-0.5">
                  <p className="text-emerald-400 font-bold">● Active Site: King Fahd Rd HQ</p>
                  <p className="text-slate-400">Lat: 24.7136° N | Long: 46.6753° E</p>
                </div>

                <div className="absolute top-4 left-4 bg-emerald-500/90 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow">
                  ✓ داخل النطاق (In Bounds)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold mb-0.5">منع التحايل (Anti-Spoofing)</p>
                <p className="text-xs font-black text-slate-800">مفعل (Mock GPS Blocked)</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold mb-0.5">بصمة الوجه / الحيوية</p>
                <p className="text-xs font-black text-slate-800">متاح عبر التطبيق (AI Liveness)</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold mb-0.5">التزامن مع قوى ومدد</p>
                <p className="text-xs font-black text-emerald-600">فوري ومؤتمت</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Biometric Punch Logs */}
      {activeTab === 'punches' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-black text-slate-800 text-sm">سجلات الحضور والانصراف اليومية لأجهزة البصمة</h3>
              <p className="text-slate-400 text-xs">سجل الحركات اللحظية الواردة من أجهزة البصمة وتطبيقات الجوال</p>
            </div>
            <button
              onClick={handleAutoSyncFromPunches}
              className="flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-brand-700 text-xs shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>مزامنة السجلات مع المسير</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-500">المعرف</th>
                  <th className="px-4 py-3 font-bold text-slate-500">الموظف</th>
                  <th className="px-4 py-3 font-bold text-slate-500">وقت الحضور</th>
                  <th className="px-4 py-3 font-bold text-slate-500">وقت الانصراف</th>
                  <th className="px-4 py-3 font-bold text-slate-500">طريقة التحقق</th>
                  <th className="px-4 py-3 font-bold text-slate-500">الموقع / الإحداثيات</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {punchLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-400 text-[10px]">{log.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-800">{log.employee_name}</p>
                      <p className="text-[10px] text-slate-400">{log.department}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-700">{log.time_in}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{log.time_out}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {log.verification_method === 'gps_mobile' && '📱 GPS الجوال'}
                        {log.verification_method === 'biometric_fingerprint' && '👆 بصمة الإصبع'}
                        {log.verification_method === 'facial_recognition' && '👤 بصمة الوجه'}
                        {log.verification_method === 'rfid_card' && '💳 بطاقة RFID'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-700 text-[11px]">{log.location}</p>
                      <p className="text-[9px] font-mono text-slate-400">{log.gps_coords}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.status === 'on_time' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                          <CheckCircle2 className="w-3 h-3" />
                          حضور في الوقت
                        </span>
                      )}
                      {log.status === 'late' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                          <AlertCircle className="w-3 h-3" />
                          تأخير {log.late_minutes} دقيقة
                        </span>
                      )}
                      {log.status === 'overtime' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">
                          <ArrowUpRight className="w-3 h-3" />
                          إضافي {log.overtime_minutes} دقيقة
                        </span>
                      )}
                      {log.status === 'early_leave' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
                          <Clock className="w-3 h-3" />
                          خروج مبكر
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Saudi Labor Law Compliance Rules (Articles 98 & 107) */}
      {activeTab === 'ramadan_rules' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <Moon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">المادة 98: ساعات العمل الفعلية وشهر رمضان</h3>
                <p className="text-slate-400 text-xs">نظام العمل الصادر بالمرسوم الملكي رقم (م/51)</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p>
                <strong>1. الأيام العادية:</strong> لا يجوز تشغيل العامل تشغيلاً فعلياً أكثر من <strong>8 ساعات في اليوم الواحد</strong> إذا اعتمد صاحب العمل المعيار اليومي، أو أكثر من <strong>48 ساعة في الأسبوع</strong> إذا اعتمد المعيار الأسبوعي.
              </p>
              <p>
                <strong>2. شهر رمضان المبارك:</strong> تُخفض ساعات العمل الفعلية خلال شهر رمضان للمسلمين، بحيث لا تزيد على <strong>6 ساعات في اليوم الواحد أو 36 ساعة في الأسبوع</strong>.
              </p>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900">الوضع الحالي للنظام:</span>
              <span className="font-black text-amber-700 bg-white px-3 py-1 rounded-xl shadow-sm">
                {isRamadanMode ? '🌙 دوام رمضان (6 ساعات)' : '☀️ دوام اعتيادي (8 ساعات)'}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">المادة 107: احتساب العمل الإضافي</h3>
                <p className="text-slate-400 text-xs">أجر الساعة الأساسي + 50% من الأجر الأساسي</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p>
                <strong>1. قيمة ساعة الإضافي:</strong> يلتزم صاحب العمل بأن يدفع للعامل عن ساعات العمل الإضافية أجراً يوازي أجر الساعة مضافاً إليه <strong>50% من أجره الأساسي (1.5×)</strong>.
              </p>
              <p>
                <strong>2. أيام العطل والأعياد:</strong> تعد جميع ساعات العمل المنجزة في أيام العطلات الأسبوعية والأعياد الرسمية (عيد الفطر وعيد الأضحى واليوم الوطني ويوم التأسيس) ساعات عمل إضافية بالكامل.
              </p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-900">معادلة مسير الرواتب المطبقة:</span>
              <span className="font-mono font-black text-emerald-700 bg-white px-3 py-1 rounded-xl shadow-sm">
                (Basic / 240) × 1.5 × OvertimeHours
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
