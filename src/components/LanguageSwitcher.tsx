import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Globe } from 'lucide-react';

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      id="global-language-switcher-btn"
      onClick={toggleLanguage}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-xs font-bold text-slate-700 shadow-sm ${className}`}
      title={language === 'ar' ? 'Switch to English' : 'التبديل إلى اللغة العربية'}
    >
      <Globe className="w-4 h-4 text-brand-600" />
      <span>{language === 'ar' ? 'English (EN)' : '🇸🇦 العربية (AR)'}</span>
    </button>
  );
};
