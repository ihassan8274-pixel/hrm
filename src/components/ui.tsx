import React, { type ReactNode } from 'react';
import { Loader2, X, AlertTriangle, Inbox } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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
  'w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-navy-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all disabled:opacity-60 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-medium';

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


/**
 * The modal every screen draws by hand.
 *
 * Seventy-four screens, sixty-seven of them with their own copy of the same
 * overlay, the same card, the same close button and the same rounding — and
 * every one of them a little different, so a change to the modal's appearance
 * is a change in sixty-seven files. This is the one.
 *
 * The exit animation needs the parent to hold the conditional, so the screen
 * keeps its <AnimatePresence>:
 *
 *   <AnimatePresence>{open && <Modal title="…" onClose={close}>…</Modal>}</AnimatePresence>
 */
export interface ModalProps {
  /** The heading of the modal. */
  title?: ReactNode;
  /** Called when the backdrop, the escape key or the close button is used. */
  onClose: () => void;
  /** The body. */
  children?: ReactNode;
  /** The buttons at the bottom of the card. */
  footer?: ReactNode;
  /** The width of the card. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Printed modals do not carry the overlay. */
  printable?: boolean;
  /** Hides the close button — for a modal the user has to answer. */
  hideClose?: boolean;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
  printable = false,
  hideClose = false,
}: ModalProps) {
  // The escape key closes the modal, the way it closes a dialog everywhere
  // else on the screen.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={
        printable
          ? "fixed inset-0 z-50 flex items-center justify-center p-4 print:bg-white print:static print:p-0"
          : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      }
      onClick={(event) => {
        // The click that closes the modal is the one on the backdrop, not the
        // one that started inside the card.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-white w-full ${SIZES[size]} rounded-3xl p-8 shadow-2xl relative`}
        role="dialog"
        aria-modal="true"
      >
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {title && <h3 className="text-xl font-bold mb-8">{title}</h3>}
        {children}
        {footer && <div className="mt-8 flex items-center justify-end gap-3">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}

/** The animation wrapper, so every screen does not import framer-motion itself. */
export function ModalLayer({ children }: { children: ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}


/**
 * A field of a form: the label, the control and what went wrong with it.
 *
 * The label, the colours and the rounding are the same in every screen, and
 * they are written out again in every screen. This puts them in one place, so
 * a field looks the same whether it is on the payslips or on the leave
 * request.
 */
export interface FormFieldProps {
  label: string;
  /** Marks the field as required and adds the asterisk. */
  required?: boolean;
  /** The reason the field cannot be used. */
  error?: string;
  /** A line of help under the control. */
  hint?: string;
  /** Renders a select instead of an input. */
  options?: { value: string | number; label: string }[];
  type?: string;
  value?: string | number;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** The rows of a textarea. */
  rows?: number;
  /** Two fields side by side. */
  half?: boolean;
  children?: ReactNode;
  /** Applied to the control when the field is a select. */
  className?: string;
}

export const CONTROL_CLASS =
  "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-right font-bold";

export function FormField({
  label,
  required = false,
  error,
  hint,
  options,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  half = false,
  children,
  className = "",
}: FormFieldProps) {
  const border = error ? "border-rose-300" : "border-slate-200";
  return (
    <div className={half ? "" : "w-full"}>
      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children ?? (options ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${CONTROL_CLASS} ${border} ${className}`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${CONTROL_CLASS} ${border} ${className}`}
        />
      ) : (
        <input
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${CONTROL_CLASS} ${border} ${className}`}
        />
      ))}
      {error && <p className="mt-1.5 text-xs text-rose-600 font-bold">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}


/**
 * A table of records.
 *
 * The columns are described rather than written out: the header, the cell and
 * the way the column is aligned are declared once, and the rows are plain
 * objects. A screen that only needs to show a list therefore writes four
 * lines instead of a table.
 */
export interface DataTableColumn<T> {
  /** The field of the row this column shows. */
  key: string;
  /** The heading of the column. */
  header: ReactNode;
  /** The cell. When it is missing the field itself is shown. */
  render?: (row: T, index: number) => ReactNode;
  /** Extra classes for the cells of the column. */
  className?: string;
  /** Extra classes for the heading of the column. */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** The value that identifies a row. It has to be unique. */
  rowKey: (row: T, index: number) => string | number;
  /** What the table shows when there is nothing to show. */
  empty?: ReactNode;
  /** The classes of the table itself. */
  className?: string;
  /** The classes of a row. */
  rowClassName?: (row: T, index: number) => string;
  /** Called when a row is clicked. */
  onRowClick?: (row: T, index: number) => void;
  /** The caption of the table, for the readers of a screen. */
  caption?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className = "",
  rowClassName,
  onRowClick,
  caption,
}: DataTableProps<T>) {
  if (!rows.length && empty) {
    return <>{empty}</>;
  }
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-right text-sm ${className}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`p-3 whitespace-nowrap ${column.headerClassName || ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={rowClassName ? rowClassName(row, index) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={`p-3 ${column.className || ""}`}>
                  {column.render
                    ? column.render(row, index)
                    : String((row as Record<string, unknown>)[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/**
 * The question before an action that cannot be undone.
 *
 * The destructive actions in the application — deleting an employee, closing a
 * payroll period, wiping a backup — each wrote their own confirmation, with
 * their own wording for the button that confirms and their own idea of what
 * happens if the answer is no.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The question, and what happens if the answer is yes. */
  message: React.ReactNode;
  /** The label of the button that confirms. */
  confirmLabel?: string;
  /** The label of the button that cancels. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The confirmation is red rather than the brand colour. */
  destructive?: boolean;
  /** The confirmation is busy. */
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
  destructive = true,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <Modal title={title} onClose={onCancel} hideClose size="sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-sm text-slate-600 leading-6">{message}</div>
          </div>
          <div className="mt-8 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-sm transition-colors disabled:opacity-50 ${
                destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-800 hover:bg-slate-900"
              }`}
            >
              {busy ? "…" : confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}

/** The animation the modal uses, so a screen does not import it. */
export const ConfirmLayer = motion;


/**
 * What a screen shows when it has nothing to show.
 *
 * Without it, an empty list is a blank space, and the user cannot tell
 * whether the screen is still loading, has no records, or has failed.
 */
export interface EmptyStateProps {
  title: string;
  /** A line under the title. */
  description?: string;
  /** The action that would fill the screen. */
  action?: ReactNode;
  /** The icon in the circle. */
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 bg-white rounded-2xl border border-slate-200">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center">
        {icon || <Inbox className="w-7 h-7" />}
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-700">{title}</h3>
      {description && <p className="mt-1.5 text-xs text-slate-400 max-w-sm leading-6">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}


/**
 * The screen is waiting for something.
 *
 * Every screen that fetches its records wrote its own spinner, and half of
 * them had no spinner at all — so a slow request looked like an empty
 * screen.
 */
export interface LoadingProps {
  /** The line under the spinner. */
  label?: string;
  /** The height of the block, so the layout does not jump. */
  className?: string;
}

export function Loading({ label = "جارٍ التحميل...", className = "py-12" }: LoadingProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-slate-400 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
