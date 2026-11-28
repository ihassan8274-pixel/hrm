/**
 * Production error reporting without a hard dependency on a vendor SDK.
 *
 * The console always gets a redacted local report. A self-hosted collector is
 * used when enabled at build time; no vendor URL, API key or user identity is
 * ever embedded. Outbound payloads carry only four short, sanitized fields.
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

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  url?: string;
  level: 'error' | 'warn' | 'info';
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

function cap(text: string, max = MAX_TEXT): string {
  return redact(text).slice(0, max);
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
  if (error instanceof Error && error.stack) return cap(error.stack);
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
    message: cap(messageOf(error)),
    path: path(),
    at: now(),
  };
  const stack = stackOf(error);
  if (stack) report.stack = stack;
  if (componentStack) report.componentStack = cap(componentStack);
  return report;
}

/** Keep only a path-like fragment; no query, token, kiosk code or numeric id. */
export function safeClientUrl(path: string): string {
  const noQuery = (path || '/').split(/[?#]/)[0] || '/';
  return cap(noQuery, 300)
    .replace(/\/kiosk\/[^/]+/gi, '/kiosk/[redacted]')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/** The only shape accepted by /api/client-errors (and its strict server schema). */
export function buildClientErrorPayload(report: ErrorReport): ClientErrorPayload {
  const stack = report.stack || report.componentStack;
  const payload: ClientErrorPayload = {
    message: cap(report.message, 500),
    level: 'error',
  };
  if (stack) payload.stack = cap(stack, 4000);
  const url = safeClientUrl(report.path);
  if (url) payload.url = url;
  return payload;
}

/** Opt-in collector: same-origin self-hosted by default, HTTPS alias for native builds. */
export function reportUrl(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_CLIENT_ERRORS_ENABLED === 'false' && !env?.VITE_ERROR_REPORT_URL) return undefined;
  const explicit = env?.VITE_ERROR_REPORT_URL;
  if (explicit && /^https:\/\//.test(explicit)) return explicit;
  const endpoint = env?.VITE_CLIENT_ERROR_ENDPOINT || '/api/client-errors';
  return /^\/api\/client-errors\/?$/.test(endpoint) ? endpoint : undefined;
}

/**
 * Log locally always; send only when a collector was configured.
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
    new Blob([JSON.stringify(buildClientErrorPayload(report))], { type: 'application/json' }),
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
