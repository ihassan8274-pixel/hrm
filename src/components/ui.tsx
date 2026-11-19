import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shared form controls.
 *
 * Everything routes through `brand-*`, the single hue defined in index.css.
 * These classes previously used brand-500/brand-600, which put a second blue
 * alongside the sidebar and meant "primary action" was two different blues
 * depending on whether a screen used <Btn> or a hand-written <button>.
 *
 * Emerald is deliberately NOT used here: it is reserved for compliance and
 * success state (GOSI, WPS, Saudization, approved). An action button must
 * never look like a compliance pass.
 */

export const inputCls =
  'w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-navy-800 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all disabled:opacity-60 placeholder:text-slate-400 placeholder:font-medium';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  /** Visual weight. `primary` is the default action colour. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

const BTN_VARIANTS: Record<NonNullable<BtnProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-navy-800 border border-slate-300 hover:bg-shell-100',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
};

export const Btn: React.FC<BtnProps> = ({
  children,
  loading = false,
  loadingText,
  className = '',
  disabled,
  variant = 'primary',
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-60 ${BTN_VARIANTS[variant]} ${className}`}
  >
    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
    <span>{loading && loadingText ? loadingText : children}</span>
  </button>
);
