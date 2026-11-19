import { useState, useEffect } from 'react';
import { GraduationCap, Award, BookOpen, Plus, User, Calendar, CheckCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TrainingView() {
  const [courses, setCourses] = useState<any[]>([]);
  const [isAddingCourse, setIsAddingCourse] = useState(false);

  useEffect(() => {
    // Placeholder data for training as we didn't add all API endpoints yet
    setCourses([
      { id: 1, name: 'أساسيات الموارد البشرية', description: 'دورة تدريبية في كيفية إدارة الفرق', date: '2024-05-10', status: 'نشط' },
      { id: 2, name: 'الأمن السيبراني للمكاتب', description: 'أساسيات حماية البيانات', date: '2024-06-15', status: 'قيد التخطيط' },
    ]);
  }, []);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">التدريب والتطوير</h2>
          <p className="text-slate-500 text-sm mt-1">رفع كفاءة الموظفين من خلال خطط تدريبية مستمرة</p>
        </div>
        <button 
          onClick={() => setIsAddingCourse(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة دورة تدريبية</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'دورات نشطة', value: 3, color: 'text-brand-600', icon: BookOpen },
          { label: 'موظفون تحت التدريب', value: 25, color: 'text-brand-600', icon: User },
          { label: 'شهادات مكتملة', value: 12, color: 'text-emerald-600', icon: Award },
          { label: 'ساعات تدريبية', value: 140, color: 'text-amber-600', icon: Clock },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
               <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
            <div className={`text-2xl font-black ${stat.color} mt-1`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {courses.map(course => (
          <div key={course.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:border-brand-200 transition-all">
            <div className="flex justify-between items-start mb-6">
               <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl">
                 <GraduationCap className="w-6 h-6" />
               </div>
               <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                 {course.status}
               </span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{course.name}</h3>
            <p className="text-slate-500 text-xs mb-6 line-clamp-2">{course.description}</p>
            <div className="flex items-center gap-4 pt-6 border-t border-slate-50">
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{course.date}</span>
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                  <User className="w-3.5 h-3.5" />
                  <span>12 مشترك</span>
               </div>
            </div>
            <button className="w-full mt-6 py-3 bg-slate-50 text-slate-600 rounded-2xl text-xs font-black hover:bg-slate-100 transition-all">إدارة المشتركين</button>
          </div>
        ))}

        <div className="bg-slate-50 p-6 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-slate-100 transition-colors">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
               <Plus className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400">إضافة خطة تدريبية جديدة</p>
        </div>
      </div>
    </div>
  );
}
