import { PushNotifications, type PushNotificationSchema, type Token } from '@capacitor/push-notifications';
import { isNativeApp } from './nativeSession';

/**
 * تسجيل التنبيهات الفورية داخل الغلاف الأصلي فقط.
 * رمز FCM/APNs يُرسل إلى الخادم ليُخزّن مرتبطاً بالمستخدم الحالي؛ الخادم لا يثق
 * بأي معرّف مستخدم قادم من التطبيق. لا تُخزّن الرموز في تخزين الويب.
 */
let started = false;

export async function startNativePush(onNotification?: (notification: PushNotificationSchema) => void): Promise<void> {
  if (!isNativeApp || started) return;
  started = true;

  try {
    await PushNotifications.addListener('registration', (token: Token) => {
      void sendToken(token.value);
    });
    await PushNotifications.addListener('registrationError', error => {
      console.warn('[push] registration error', error.error);
    });
    await PushNotifications.addListener('pushNotificationReceived', notification => {
      onNotification?.(notification);
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', action => {
      onNotification?.(action.notification);
    });

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();
  } catch {
    started = false;
  }
}

async function sendToken(token: string): Promise<void> {
  const platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios';
  try {
    // window.fetch المُغلّف في main.tsx يضيف توكن الجلسة ويعيد كتابة المسار.
    await fetch('/api/push-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    });
  } catch {
    // يبقى الرمز على الجهاز؛ سيُعاد تسجيله عند تشغيل التطبيق القادم.
  }
}
