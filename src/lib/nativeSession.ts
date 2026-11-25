import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/**
 * جلسة التطبيق الأصلي.
 *
 * الويب: localStorage كما كان الحال قبل التغليف (لا تغيير في السلوك).
 * الأصلي: Keychain على iOS وSharedPreferences المشفّر بمفتاح Android Keystore على أندرويد.
 * لا تُستخدم حزمة التخزين الآمن على الويب لأنها هناك تخزّن بدون تشفير.
 */
const NATIVE = Capacitor.isNativePlatform();

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const BIOMETRIC_KEY = 'biometric_enabled';
const SNAPSHOT_KEY = 'ess_offline_snapshot';
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const read = async (key: string): Promise<string | null> => {
  if (!NATIVE) return localStorage.getItem(key);
  try {
    const value = await SecureStorage.get(key);
    return typeof value === 'string' ? value : value == null ? null : JSON.stringify(value);
  } catch {
    return null;
  }
};

const write = async (key: string, value: string): Promise<void> => {
  if (!NATIVE) {
    localStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStorage.set(key, value);
    localStorage.removeItem(key);
  } catch {
    // لا نُسقط الجلسة بسبب تعذّر الوصول إلى Keychain؛ الطلبات ستفشل بوضوح إن كان التوكن مفقوداً.
  }
};

const erase = async (key: string): Promise<void> => {
  if (!NATIVE) {
    localStorage.removeItem(key);
    return;
  }
  try {
    await SecureStorage.remove(key);
  } catch {
    // تجاهل: مفتاح غير موجود أصلاً.
  }
  localStorage.removeItem(key);
};

const parseUser = (raw: string | null): any | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** يقرأ التوكن مع ترحيل لمرة واحدة من نسخة PWA كانت تستخدم localStorage. */
export async function getAuthToken(): Promise<string | null> {
  const token = await read(TOKEN_KEY);
  if (NATIVE && !token) {
    const legacy = localStorage.getItem(TOKEN_KEY);
    if (legacy) {
      const legacyUser = localStorage.getItem(USER_KEY) || '';
      await write(TOKEN_KEY, legacy);
      if (legacyUser) await write(USER_KEY, legacyUser);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return legacy;
    }
  }
  return token;
}

export async function getAuthUser(): Promise<any | null> {
  const user = parseUser(await read(USER_KEY));
  if (NATIVE && !user) {
    const legacy = parseUser(localStorage.getItem(USER_KEY));
    if (legacy) {
      await write(USER_KEY, JSON.stringify(legacy));
      localStorage.removeItem(USER_KEY);
      return legacy;
    }
  }
  return user;
}

export async function setSession(token: string, user: any): Promise<void> {
  await write(TOKEN_KEY, token);
  await write(USER_KEY, JSON.stringify(user));
}

export async function updateAuthUser(patch: Record<string, unknown>): Promise<void> {
  const current = await getAuthUser();
  if (!current) return;
  await write(USER_KEY, JSON.stringify({ ...current, ...patch }));
}

export async function clearSession(): Promise<void> {
  await erase(TOKEN_KEY);
  await erase(USER_KEY);
  await clearOfflineSnapshot();
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await read(BIOMETRIC_KEY)) === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await write(BIOMETRIC_KEY, '1');
  else await erase(BIOMETRIC_KEY);
}

/**
 * لقطة قراءة فقط للبيانات المحمّلة آخر مرة. تُحفظ مشفّرة على الجهاز،
 * وتُعرض عند انقطاع الاتصال مع وسم واضح بأنها بيانات قديمة. لا تُستخدم للكتابة.
 */
export async function saveOfflineSnapshot(payload: unknown): Promise<void> {
  if (!NATIVE) return;
  try {
    await SecureStorage.set(SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // تجاهل: التخزين قد يكون ممتلئاً أو الجهاز مقفلاً.
  }
}

export async function loadOfflineSnapshot(): Promise<{ savedAt: number; payload: any } | null> {
  if (!NATIVE) return null;
  try {
    const raw = await SecureStorage.get(SNAPSHOT_KEY);
    if (typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) {
      await clearOfflineSnapshot();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearOfflineSnapshot(): Promise<void> {
  await erase(SNAPSHOT_KEY);
}

export const isNativeApp = NATIVE;
