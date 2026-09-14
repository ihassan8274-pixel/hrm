import React, { useState, useEffect } from 'react';
import { Target, ClipboardList, Plus, CheckCircle2, Clock, User, Briefcase, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Project {
  id: number;
  name: string;
  department_name: string;
  status: string;
  start_date: string;
}

interface Task {
  id: number;
  title: string;
  project_name: string;
  employee_name: string;
  status: string;
  due_date: string;
}

export default function TasksView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddingProject, setIsAddingProject] = useState(false);

  useEffect(() => {
    fetch('/api/projects').then(res => res.json()).then(setProjects);
    fetch('/api/tasks').then(res => res.json()).then(setTasks);
  }, []);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-emerald-50 text-emerald-600';
      case 'in_progress': return 'bg-blue-50 text-blue-600';
      default: return 'bg-amber-50 text-amber-600';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-800">إدارة المشاريع والمهام</h2>
          <p className="text-slate-500 text-sm mt-1">متابعة إنجاز الفرق وتوزيع المهام على الموظفين</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={() => setIsAddingProject(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Plus className="w-5 h-5" />
              <span>مشروع جديد</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-500" />
              أحدث المهام
            </h3>
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold border-2 border-dashed border-slate-50 rounded-2xl">
                  لا توجد مهام مسجلة حالياً
                </div>
              ) : (
                tasks.map(task => (
                  <div key={task.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-4">
                       <div className={`p-2 rounded-xl ${getStatusColor(task.status)}`}>
                         <Clock className="w-5 h-5" />
                       </div>
                       <div>
                         <p className="font-bold text-slate-800">{task.title}</p>
                         <p className="text-xs text-slate-500 mt-0.5">{task.project_name} • {task.employee_name}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                       <span className="text-[10px] font-black text-slate-400 uppercase">{task.due_date}</span>
                       <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                         <CheckCircle2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
             <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
               <Target className="w-5 h-5 text-emerald-500" />
               المشاريع النشطة
             </h3>
             <div className="space-y-4">
                {projects.map(project => (
                  <div key={project.id} className="p-5 bg-slate-50 rounded-2xl">
                     <div className="flex justify-between items-start mb-4">
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-black uppercase tracking-widest">{project.department_name}</span>
                        <span className="text-[10px] font-bold text-slate-400">{project.status}</span>
                     </div>
                     <h4 className="font-bold text-slate-800 mb-1">{project.name}</h4>
                     <p className="text-xs text-slate-500 mb-4">بدأ في: {project.start_date}</p>
                     <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-indigo-500 rounded-full" />
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
