/**
 * Production error reporting without a hard dependency on a vendor SDK.
 *
 * Reporting stays opt-in: nothing is sent unless VITE_ERROR_REPORT_URL is set
 * at build time. Messages are redacted and capped because a React stack can
 * contain request URLs with bearer tokens or query strings.
 */

export type RuntimeErrorKind = 'react' | 'window' | 'rejection';

export interface ErrorReport {
  kind: RuntimeErrorKind;
  message: string;
  stack?: string;
  componentStack?: string;
  path: string;
  at: string;
}

const MAX_TEXT = 2000;
const MAX_REPORTS_PER_PAGE = 20;

let sent = 0;

/** Remove credentials that commonly appear in fetch errors and stack traces. */
export function redact(text: string): string {
  return text
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|password|secret|api[_-]?key)=([^&\s"']+)/gi, '$1=[redacted]');
}

function truncate(text: string): string {
  return redact(text).slice(0, MAX_TEXT);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

function stackOf(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return truncate(error.stack);
  return undefined;
}

export function buildErrorReport(
  kind: RuntimeErrorKind,
  error: unknown,
  componentStack?: string,
  now: () => string = () => new Date().toISOString(),
  path: () => string = () => (typeof window === 'undefined' ? '' : window.location.pathname),
): ErrorReport {
  const report: ErrorReport = {
    kind,
    message: truncate(messageOf(error)),
    path: path(),
    at: now(),
  };
  const stack = stackOf(error);
  if (stack) report.stack = stack;
  if (componentStack) report.componentStack = truncate(componentStack);
  return report;
}

function reportUrl(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_ERROR_REPORT_URL;
  return url && /^https:\/\//.test(url) ? url : undefined;
}

/**
 * Log locally always; send only when an HTTPS collector was configured.
 * Returns whether a report was handed to the browser's beacon queue.
 */
export function reportRuntimeError(kind: RuntimeErrorKind, error: unknown, componentStack?: string): boolean {
  const report = buildErrorReport(kind, error, componentStack);
  console.error('[runtime-error]', report);

  const url = reportUrl();
  if (!url || sent >= MAX_REPORTS_PER_PAGE) return false;
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;

  sent += 1;
  return navigator.sendBeacon(
    url,
    new Blob([JSON.stringify(report)], { type: 'application/json' }),
  );
}

let handlersInstalled = false;

/** Catch errors outside React render (promises, listeners, third-party code). */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    reportRuntimeError('window', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeError('rejection', event.reason);
  });
}
