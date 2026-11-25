import type { CapacitorConfig } from '@capacitor/cli';

/**
 * تمكين | EMPOWER — غلاف التطبيق الأصلي.
 *
 * التطبيق يحزم نفس بناء الويب (dist) ولا يعيد تنفيذ أي منطق مصادقة أو صلاحيات.
 * الاستدعاءات /api تُعاد كتابتها إلى نطاق الإنتاج داخل main.tsx عند العمل داخل WebView،
 * لذلك لا نعتمد على server.url (كان سيمنع العمل دون اتصال).
 */
const config: CapacitorConfig = {
  appId: 'com.empower.hr.tamkeen',
  appName: 'تمكين | EMPOWER',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#102A56',
    useLegacyBridge: false,
  },
  ios: {
    backgroundColor: '#102A56',
    contentInset: 'always',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
