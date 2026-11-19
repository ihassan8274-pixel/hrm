export async function apiFetch<T>(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      credentials: 'include',
    });
    if (res.status === 401) return null;
    if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Unknown' })); throw new Error(err.error || `HTTP ${res.status}`); }
    return res.json();
  } catch { return null; }
}
export const apiGet = <T>(url: string) => apiFetch<T>(url);
export const apiMutate = <T>(url: string, data: any, method = 'POST') => apiFetch<T>(url, { method, body: JSON.stringify(data) });
export const safeArray = <T>(d: any): T[] => Array.isArray(d) ? d : [];
export const safeMap = <T, R>(arr: any, fn: (item: T, i: number) => R) => Array.isArray(arr) ? arr.map(fn) : [];
export const safeFilter = <T>(arr: any, fn: (item: T) => boolean) => Array.isArray(arr) ? arr.filter(fn) : [];

/**
 * Downloads a protected endpoint as a file.
 *
 * A plain <a href> cannot be used here: the API requires a bearer token, and a
 * bare navigation sends none, so the request comes back 401. This helper goes
 * through fetch (which the app's global override turns into an authenticated
 * request), surfaces the server's coded refusal instead of saving an error
 * page as if it were the file, and only then writes the blob to disk.
 */
export interface ProtectedDownloadError {
  message: string;
  code?: string;
  status: number;
}

export async function downloadProtectedFile(
  url: string,
  fallbackFileName: string
): Promise<ProtectedDownloadError | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { message: 'تعذّر الاتصال بالخادم', status: 0 };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return {
      message: body?.error || `تعذّر تنزيل الملف (${res.status})`,
      code: body?.code,
      status: res.status,
    };
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const fileName = match ? match[1] : fallbackFileName;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
  return null;
}