import React from 'react';
import { Loader2 } from 'lucide-react';

export const inputCls =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all disabled:opacity-60';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export const Btn: React.FC<BtnProps> = ({
  children,
  loading = false,
  loadingText,
  className = '',
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
  >
    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
    <span>{loading && loadingText ? loadingText : children}</span>
  </button>
);
