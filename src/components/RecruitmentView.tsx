import React, { useState, useEffect } from 'react';
import { 
  Briefcase, Users, Plus, Star, MapPin, Building2, CheckCircle2, 
  XCircle, Clock, FileText, Sparkles, UserCheck, ShieldCheck, 
  AlertTriangle, ArrowRight, Printer, Share2, CheckSquare, 
  Calendar, Layers, FileCheck, Award, TrendingUp, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';

interface Job {
  id: number;
  title: string;
  department_name: string;
  status: 'open' | 'closed';
  description: string;
  created_at: string;
}

interface Candidate {
  id: number;
  job_id: number;
  job_title: string;
  name: string;
  email: string;
  phone: string;
  status: 'applied' | 'interview' | 'offered' | 'hired' | 'rejected';
  notes: string;
  created_at: string;
}

interface OnboardingTask {
  id: string;
  title: string;
  category: 'legal' | 'gosi_qiwa' | 'medical' | 'it_assets' | 'training';
  assigned_to: string;
  is_completed: boolean;
  completed_at?: string;
  article_ref?: string;
}

interface OnboardingJourney {
  id: number;
  employee_name: string;
  job_title: string;
  department: string;
  hire_date: string;
  probation_days_total: 90 | 180;
  probation_days_passed: number;
  probation_status: 'in_progress' | 'extended_180' | 'passed' | 'terminated';
  tasks: OnboardingTask[];
}

export default function RecruitmentView() {
  const { t, language } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tab, setTab] = useState<'jobs' | 'candidates' | 'onboarding' | 'offer_letter'>('jobs');
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [isAddingCandidate, setIsAddingCandidate] = useState(false);
  const [departments, setDepartments] = useState<{id: number, name: string}[]>([]);
  const [selectedOfferCandidate, setSelectedOfferCandidate] = useState<Candidate | null>(null);

  // Onboarding Journeys
  const [onboardings, setOnboardings] = useState<OnboardingJourney[]>([
    {
      id: 1,
      employee_name: 'عبدالعزيز إبراهيم الراجحي',
      job_title: 'مهندس برمجيات أول',
      department: 'تقنية المعلومات',
      hire_date: '2026-07-01',
      probation_days_total: 90,
      probation_days_passed: 56,
      probation_status: 'in_progress',
      tasks: [
        { id: 'T1', title: 'توثيق العقد عبر منصة قوى (Qiwa)', category: 'gosi_qiwa', assigned_to: 'الموارد البشرية', is_completed: true, completed_at: '2026-07-02', article_ref: 'المادة 51' },
        { id: 'T2', title: 'تسجيل المشترك في التأمينات (GOSI)', category: 'gosi_qiwa', assigned_to: 'الموارد البشرية', is_completed: true, completed_at: '2026-07-02' },
        { id: 'T3', title: 'إصدار بطاقة التأمين الطبي (CCHI فئة A+)', category: 'medical', assigned_to: 'مسؤول التأمين', is_completed: true, completed_at: '2026-07-04' },
        { id: 'T4', title: 'تسجيل وتدقيق الآيبان البنكي (WPS)', category: 'legal', assigned_to: 'المالية', is_completed: true, completed_at: '2026-07-05' },
        { id: 'T5', title: 'تسليم جهاز اللابتوب والعهدة الذكية (QR Handover)', category: 'it_assets', assigned_to: 'الدعم الفني IT', is_completed: true, completed_at: '2026-07-01' },
        { id: 'T6', title: 'تقييم منتصف فترة التجربة (اليوم 45)', category: 'training', assigned_to: 'المدير المباشر', is_completed: true, completed_at: '2026-08-15', article_ref: 'المادة 53' },
        { id: 'T7', title: 'التقييم النهائي لتثبيت التعيين (اليوم 85)', category: 'training', assigned_to: 'لجنة الموارد', is_completed: false, article_ref: 'المادة 53' }
      ]
    },
    {
      id: 2,
      employee_name: 'ريم منصور الدوسري',
      job_title: 'أخصائي توظيف واستقطاب',
      department: 'الموارد البشرية',
      hire_date: '2026-08-10',
      probation_days_total: 90,
      probation_days_passed: 16,
      probation_status: 'in_progress',
      tasks: [
        { id: 'T1', title: 'توثيق العقد عبر منصة قوى (Qiwa)', category: 'gosi_qiwa', assigned_to: 'الموارد البشرية', is_completed: true, completed_at: '2026-08-11' },
        { id: 'T2', title: 'تسجيل المشترك في التأمينات (GOSI)', category: 'gosi_qiwa', assigned_to: 'الموارد البشرية', is_completed: true, completed_at: '2026-08-11' },
        { id: 'T3', title: 'إصدار بطاقة التأمين الطبي (CCHI)', category: 'medical', assigned_to: 'مسؤول التأمين', is_completed: false },
        { id: 'T4', title: 'تسجيل وتدقيق الآيبان البنكي (WPS)', category: 'legal', assigned_to: 'المالية', is_completed: false },
        { id: 'T5', title: 'تسليم الأصول الرقمية والبطاقة الذكية', category: 'it_assets', assigned_to: 'الدعم الفني IT', is_completed: true, completed_at: '2026-08-10' },
        { id: 'T6', title: 'تقييم منتصف فترة التجربة (اليوم 45)', category: 'training', assigned_to: 'المدير المباشر', is_completed: false, article_ref: 'المادة 53' },
        { id: 'T7', title: 'التقييم النهائي لتثبيت التعيين', category: 'training', assigned_to: 'لجنة الموارد', is_completed: false, article_ref: 'المادة 53' }
      ]
    }
  ]);

  const [jobForm, setJobForm] = useState({ title: '', department_id: '', description: '' });
  const [candidateForm, setCandidateForm] = useState({ job_id: '', name: '', email: '', phone: '', notes: '' });

  // Offer Letter State
  const [offerDetails, setOfferDetails] = useState({
    candidate_name: 'سلطان فهد العتيبي',
    job_title: 'مدير العمليات التشغيلية',
    department: 'العمليات',
    basic_salary: 18000,
    housing_allowance: 4500,
    transport_allowance: 1500,
    start_date: '2026-09-01',
    probation_months: 3,
    annual_leave_days: 30,
    company_name: 'شركة المسار الرقمي للحلول المتكاملة'
  });

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/recruitment/jobs');
      setJobs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch('/api/recruitment/candidates');
      setCandidates(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      setDepartments(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchCandidates();
    fetchDepartments();
  }, []);

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/recruitment/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobForm)
    });
    setIsAddingJob(false);
    setJobForm({ title: '', department_id: '', description: '' });
    fetchJobs();
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/recruitment/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidateForm)
    });
    setIsAddingCandidate(false);
    setCandidateForm({ job_id: '', name: '', email: '', phone: '', notes: '' });
    fetchCandidates();
  };

  const toggleOnboardingTask = (journeyId: number, taskId: string) => {
    setOnboardings(prev => prev.map(j => {
      if (j.id !== journeyId) return j;
      return {
        ...j,
        tasks: j.tasks.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            is_completed: !t.is_completed,
            completed_at: !t.is_completed ? new Date().toISOString().split('T')[0] : undefined
          };
        })
      };
    }));
  };

  const extendProbationTo180 = (journeyId: number) => {
    setOnboardings(prev => prev.map(j => {
      if (j.id !== journeyId) return j;
      return {
        ...j,
        probation_days_total: 180,
        probation_status: 'extended_180'
      };
    }));
  };

  const passProbation = (journeyId: number) => {
    setOnboardings(prev => prev.map(j => {
      if (j.id !== journeyId) return j;
      return {
        ...j,
        probation_status: 'passed'
      };
    }));
  };

  const totalMonthlyOffer = offerDetails.basic_salary + offerDetails.housing_allowance + offerDetails.transport_allowance;

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {language === 'ar' ? 'إدارة التوظيف والاستقطاب ورحلة الموظف' : 'Recruitment, ATS & Onboarding'}
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {language === 'ar'
                ? 'إدارة الوظائف الشاغرة، مسار المرشحين، عروض العمل الرسمية، ورحلة تهيئة الموظف الجديد وفترة التجربة (المادة 53)'
                : 'Manage job vacancies, candidates pipeline, job offers, and Saudi 90-day onboarding journey'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tab === 'jobs' && (
            <button 
              onClick={() => setIsAddingJob(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة وظيفة شاغرة</span>
            </button>
          )}

          {tab === 'candidates' && (
            <button 
              onClick={() => setIsAddingCandidate(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مرشح جديد</span>
            </button>
          )}

          {tab === 'offer_letter' && (
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-black transition-all shadow-md text-xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة عرض العمل الرسمي</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit overflow-x-auto">
        <button 
          onClick={() => setTab('jobs')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${tab === 'jobs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Briefcase className="w-4 h-4" />
          <span>الوظائف الشاغرة ({jobs.length})</span>
        </button>

        <button 
          onClick={() => setTab('candidates')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${tab === 'candidates' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users className="w-4 h-4" />
          <span>المرشحين ومراحل المقابلات ({candidates.length})</span>
        </button>

        <button 
          onClick={() => setTab('onboarding')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${tab === 'onboarding' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>رحلة الموظف الجديد وفترة التجربة ({onboardings.length})</span>
        </button>

        <button 
          onClick={() => setTab('offer_letter')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${tab === 'offer_letter' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <FileText className="w-4 h-4 text-amber-500" />
          <span>استوديو عروض العمل (Job Offers)</span>
        </button>
      </div>

      {/* TAB 1: Jobs */}
      {tab === 'jobs' && (
        <motion.div 
          key="jobs" 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {jobs.map(job => (
            <div key={job.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:border-indigo-200 transition-all space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Briefcase className="w-6 h-6" />
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${job.status === 'open' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                  {job.status === 'open' ? 'مفتوحة للتقديم' : 'مغلقة'}
                </span>
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 mb-1">{job.title}</h3>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{job.department_name}</span>
                </div>
              </div>
              <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">{job.description}</p>
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(job.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
                <button 
                  onClick={() => {
                    setTab('offer_letter');
                    setOfferDetails(prev => ({ ...prev, job_title: job.title, department: job.department_name }));
                  }}
                  className="text-indigo-600 hover:underline font-black"
                >
                  إنشاء عرض عمل
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* TAB 2: Candidates */}
      {tab === 'candidates' && (
        <motion.div 
          key="candidates"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
        >
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">المرشح</th>
                <th className="px-6 py-4">الوظيفة المستهدفة</th>
                <th className="px-6 py-4">مرحلة المقابلة</th>
                <th className="px-6 py-4">معلومات الاتصال</th>
                <th className="px-6 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {candidates.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
                        {c.name[0]}
                      </div>
                      <div>
                        <p className="font-black text-slate-800">{c.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">قدم في: {new Date(c.created_at).toLocaleDateString('ar-EG')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-700">{c.job_title}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black ${
                      c.status === 'applied' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      c.status === 'interview' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      c.status === 'offered' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      c.status === 'hired' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {c.status === 'applied' && 'تم التقديم'}
                      {c.status === 'interview' && 'مرحلة المقابلات'}
                      {c.status === 'offered' && 'تم إرسال العرض'}
                      {c.status === 'hired' && 'تم التعيين والالتحاق'}
                      {c.status === 'rejected' && 'مستبعد'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-600 font-medium">{c.email}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">{c.phone}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => {
                        setOfferDetails(prev => ({
                          ...prev,
                          candidate_name: c.name,
                          job_title: c.job_title
                        }));
                        setTab('offer_letter');
                      }}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-[11px] transition-colors"
                    >
                      إصدار عرض عمل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* TAB 3: Onboarding & 90-Day Probation Journey */}
      {tab === 'onboarding' && (
        <motion.div 
          key="onboarding"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Saudi Labor Law Info Card */}
          <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-black uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>المادة 53 من نظام العمل السعودي (فترة التجربة)</span>
              </div>
              <h3 className="text-lg font-black">تنظيم فترة التجربة والتهيئة الرقمية</h3>
              <p className="text-xs text-emerald-100/80 leading-relaxed max-w-3xl">
                لا يجوز أن تزيد فترة التجربة على تسعين يوماً، ويجوز باتفاق كتابي بين العامل وصاحب العمل تمديدها لمدة لا تزيد على مائة وثمانين يوماً (180). لا يدخل في حساب فترة التجربة إجازتا عيدي الفطر والأضحى والإجازة المرضية.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 text-center shrink-0">
              <p className="text-[10px] text-emerald-200">الحد الأقصى للتمديد</p>
              <p className="text-xl font-mono font-black text-emerald-300">180 يوماً</p>
            </div>
          </div>

          {/* Onboarding Employees Grid */}
          <div className="space-y-6">
            {onboardings.map(journey => {
              const completedTasksCount = journey.tasks.filter(t => t.is_completed).length;
              const progressPct = Math.round((completedTasksCount / journey.tasks.length) * 100);
              const remainingProbation = Math.max(0, journey.probation_days_total - journey.probation_days_passed);

              return (
                <div key={journey.id} className="bg-white rounded-3xl border border-slate-100 shadow-xl p-6 space-y-6">
                  {/* Top bar of journey card */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center font-black text-emerald-700 text-base">
                        {journey.employee_name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-slate-800">{journey.employee_name}</h4>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            journey.probation_status === 'passed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            journey.probation_status === 'extended_180' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {journey.probation_status === 'in_progress' && 'فترة تجربة نشطة (90 يوماً)'}
                            {journey.probation_status === 'extended_180' && 'ممددة لـ 180 يوماً (المادة 53)'}
                            {journey.probation_status === 'passed' && 'تم اجتياز التجربة وتثبيت التعيين'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {journey.job_title} • {journey.department} • تاريخ المباشرة: {journey.hire_date}
                        </p>
                      </div>
                    </div>

                    {/* Probation countdown & quick actions */}
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center min-w-[120px]">
                        <p className="text-[10px] text-slate-400 font-bold">المتبقي من التجربة</p>
                        <p className="text-sm font-black font-mono text-indigo-600">{remainingProbation} يوماً</p>
                      </div>

                      {journey.probation_status === 'in_progress' && (
                        <button
                          onClick={() => extendProbationTo180(journey.id)}
                          className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors"
                        >
                          تمديد لـ 180 يوماً
                        </button>
                      )}

                      {journey.probation_status !== 'passed' && (
                        <button
                          onClick={() => passProbation(journey.id)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                        >
                          تثبيت التعيين
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-600">اكتمال متطلبات التهيئة والامتثال الحكومي</span>
                      <span className="text-emerald-600 font-mono">{completedTasksCount} / {journey.tasks.length} ({progressPct}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Tasks Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {journey.tasks.map(task => (
                      <div
                        key={task.id}
                        onClick={() => toggleOnboardingTask(journey.id, task.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                          task.is_completed 
                            ? 'bg-emerald-50/50 border-emerald-100 text-slate-800' 
                            : 'bg-slate-50 border-slate-200/80 hover:border-indigo-300'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                          task.is_completed 
                            ? 'bg-emerald-600 border-emerald-600 text-white' 
                            : 'border-slate-300 bg-white'
                        }`}>
                          {task.is_completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-bold ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {task.title}
                            </p>
                            {task.article_ref && (
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                {task.article_ref}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                            <span>المسؤول: {task.assigned_to}</span>
                            {task.completed_at && (
                              <span className="text-emerald-600 font-mono">● اكتمل في {task.completed_at}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* TAB 4: Official Saudi Job Offer Studio */}
      {tab === 'offer_letter' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Offer Editor */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-100 shadow-xl space-y-4">
            <h3 className="font-black text-slate-800 text-sm pb-2 border-b border-slate-100">
              بيانات عرض العمل (Job Offer Form)
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم المرشح</label>
              <input
                type="text"
                value={offerDetails.candidate_name}
                onChange={e => setOfferDetails({ ...offerDetails, candidate_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">المسمى الوظيفي</label>
                <input
                  type="text"
                  value={offerDetails.job_title}
                  onChange={e => setOfferDetails({ ...offerDetails, job_title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الإدارة</label>
                <input
                  type="text"
                  value={offerDetails.department}
                  onChange={e => setOfferDetails({ ...offerDetails, department: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الراتب الأساسي</label>
                <input
                  type="number"
                  value={offerDetails.basic_salary}
                  onChange={e => setOfferDetails({ ...offerDetails, basic_salary: Number(e.target.value) })}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-xs text-center"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">بدل السكن</label>
                <input
                  type="number"
                  value={offerDetails.housing_allowance}
                  onChange={e => setOfferDetails({ ...offerDetails, housing_allowance: Number(e.target.value) })}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-xs text-center"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">بدل النقل</label>
                <input
                  type="number"
                  value={offerDetails.transport_allowance}
                  onChange={e => setOfferDetails({ ...offerDetails, transport_allowance: Number(e.target.value) })}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-xs text-center"
                />
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-900">إجمالي الراتب الشهري:</span>
              <span className="font-mono font-black text-emerald-700 text-sm">
                {totalMonthlyOffer.toLocaleString()} SAR
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ المباشرة</label>
                <input
                  type="date"
                  value={offerDetails.start_date}
                  onChange={e => setOfferDetails({ ...offerDetails, start_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">فترة التجربة (أشهر)</label>
                <input
                  type="number"
                  value={offerDetails.probation_months}
                  onChange={e => setOfferDetails({ ...offerDetails, probation_months: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-xs"
                />
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs shadow-md shadow-indigo-200 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة العرض الرسمي المعتمد</span>
            </button>
          </div>

          {/* Offer Preview Paper */}
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-6 text-slate-800 printable-area">
            {/* Header */}
            <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900">
              <div>
                <h3 className="text-xl font-black text-slate-900">{offerDetails.company_name}</h3>
                <p className="text-xs text-slate-500 font-bold">المملكة العربية السعودية - إدارة الموارد البشرية</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Ref: JOB-OFFER-{new Date().getFullYear()}-098</p>
              </div>
              <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl">
                HR
              </div>
            </div>

            {/* Title */}
            <div className="text-center py-2 bg-slate-50 rounded-2xl border border-slate-100">
              <h2 className="text-base font-black text-slate-900">عرض عمل وظيفي رسمي (Official Job Offer)</h2>
              <p className="text-[11px] text-slate-500">وفقاً لأحكام نظام العمل السعودي ولوائحه التنفيذية</p>
            </div>

            {/* Intro */}
            <div className="text-xs leading-relaxed space-y-2">
              <p>
                السيد / <strong>{offerDetails.candidate_name}</strong> المحترم،
              </p>
              <p className="text-slate-600">
                يسر إدارة <strong>{offerDetails.company_name}</strong> أن تتقدم إليكم بهذا العرض الوظيفي للانضمام لفريق عملنا وفق الشروط والمزايا الموضحة أدناه:
              </p>
            </div>

            {/* Financial Package Table */}
            <table className="w-full text-right text-xs border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 font-black text-slate-700">
                <tr>
                  <th className="p-3 border-b">البند والبيان</th>
                  <th className="p-3 border-b text-center">المقدار الشهري (SAR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                <tr>
                  <td className="p-3 font-bold text-slate-800">المسمى الوظيفي والإدارة</td>
                  <td className="p-3 text-center font-bold text-indigo-700">{offerDetails.job_title} ({offerDetails.department})</td>
                </tr>
                <tr>
                  <td className="p-3">الراتب الأساسي (Basic Salary)</td>
                  <td className="p-3 text-center font-mono font-bold">{offerDetails.basic_salary.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-3">بدل السكن (Housing Allowance)</td>
                  <td className="p-3 text-center font-mono font-bold">{offerDetails.housing_allowance.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="p-3">بدل النقل (Transportation Allowance)</td>
                  <td className="p-3 text-center font-mono font-bold">{offerDetails.transport_allowance.toLocaleString()}</td>
                </tr>
                <tr className="bg-emerald-50/70 font-black text-emerald-900">
                  <td className="p-3">إجمالي الأجر الشهري الشامل (Gross Monthly Salary)</td>
                  <td className="p-3 text-center font-mono text-sm">{totalMonthlyOffer.toLocaleString()} SAR</td>
                </tr>
              </tbody>
            </table>

            {/* Key Terms */}
            <div className="bg-slate-50 p-4 rounded-2xl text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
              <p>● <strong>تاريخ المباشرة المتوقع:</strong> {offerDetails.start_date}</p>
              <p>● <strong>فترة التجربة:</strong> {offerDetails.probation_months} أشهر خاضعة للمادة 53 من نظام العمل السعودي.</p>
              <p>● <strong>الإجازة السنوية:</strong> {offerDetails.annual_leave_days} يوماً مدفوعة الأجر سنوياً.</p>
              <p>● <strong>التأمين الطبي:</strong> تغطية شاملة للموظف وعائلته حسب سياسة مجلس الضمان الصحي (CCHI).</p>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200">
              <div className="space-y-4">
                <p className="text-xs font-black text-slate-800">عن المنشأة / الموارد البشرية:</p>
                <div className="h-14 border-b border-dashed border-slate-300 flex items-end">
                  <span className="text-[10px] text-emerald-600 font-mono font-bold">✓ Approved by HR Management</span>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-black text-slate-800">موافقة وتوقيع المرشح:</p>
                <div className="h-14 border-b border-dashed border-slate-300 flex items-end">
                  <span className="text-[10px] text-slate-400">التوقيع والتاريخ: .....................</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adding Job Modal */}
      {isAddingJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-black text-slate-800 mb-6">إضافة وظيفة شاغرة</h3>
            <form onSubmit={handleAddJob} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">المسمى الوظيفي</label>
                <input 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-xs"
                  value={jobForm.title}
                  onChange={e => setJobForm({...jobForm, title: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الإدارة</label>
                <select 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-xs"
                  value={jobForm.department_id}
                  onChange={e => setJobForm({...jobForm, department_id: e.target.value})}
                >
                  <option value="">اختر الإدارة</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الوصف والمتطلبات</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 h-28 text-xs"
                  value={jobForm.description}
                  onChange={e => setJobForm({...jobForm, description: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all text-xs">حفظ الوظيفة</button>
                <button type="button" onClick={() => setIsAddingJob(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Adding Candidate Modal */}
      {isAddingCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-black text-slate-800 mb-6">إضافة مرشح جديد</h3>
            <form onSubmit={handleAddCandidate} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">الوظيفة المستهدفة</label>
                <select 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-xs"
                  value={candidateForm.job_id}
                  onChange={e => setCandidateForm({...candidateForm, job_id: e.target.value})}
                >
                  <option value="">اختر الوظيفة</option>
                  {jobs.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">اسم المرشح</label>
                <input 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-xs"
                  value={candidateForm.name}
                  onChange={e => setCandidateForm({...candidateForm, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">البريد الإلكتروني</label>
                  <input 
                    type="email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-xs"
                    value={candidateForm.email}
                    onChange={e => setCandidateForm({...candidateForm, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">رقم الجوال</label>
                  <input 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 text-left text-xs"
                    dir="ltr"
                    value={candidateForm.phone}
                    onChange={e => setCandidateForm({...candidateForm, phone: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">ملاحظات ومرفقات</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 h-20 text-xs"
                  value={candidateForm.notes}
                  onChange={e => setCandidateForm({...candidateForm, notes: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all text-xs">حفظ المرشح</button>
                <button type="button" onClick={() => setIsAddingCandidate(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
