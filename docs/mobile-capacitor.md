# تمكين | EMPOWER — غلاف الجوال (Capacitor)

> الحالة: الغلاف الأصلي مُنشأ ومُهيّأ. بناء iOS ونشر المتاجر يحتاجان جهاز Mac/Xcode وحسابي المتاجر ومفاتيح توقيع، وهي غير متوفرة في هذه البيئة.

## 1. المعمارية

- التطبيق يغلّف **نفس بناء الويب** (`dist`) الذي ي service `/m`؛ لا توجد واجهة منفصلة ولا منطق مصادقة/صلاحيات مكرّر.
- داخل WebView تُعاد كتابة مسارات `/api/...` إلى `https://hr.restocost.shop` في `src/main.tsx` فقط عندما `Capacitor.isNativePlatform()`.
- على الويب تبقى المسارات نسبية كما كانت، ويعمل الـ service worker الخاص بـ `/m` كما هو.
- الجلسة:
  - الويب: `localStorage` (سلوك PWA لم يتغير).
  - الجهاز: `@aparajita/capacitor-secure-storage` → Keychain على iOS وSharedPreferences المشفّر بمفتاح Android Keystore على أندرويد. لا تُستخدم الحزمة على الويب لأن تخزينها هناك غير مشفّر.
  - عند أول تشغيل أصلي تتم ترجرة توكن PWA القديم من `localStorage` إلى التخزين الآمن ثم يُحذف من `localStorage`.
- الالتقاط الحيوي (بصمة/Face ID) هو **قفل جهاز** فقط: لا يمنح صلاحيات ولا يكتب جلسة. الصلاحيات تُحسب في الخادم. يُعاد القفل عند مغادرة التطبيق والعودة إليه.
- البيانات دون اتصال: لقطة قراءة فقط مشفّرة، صالحة 7 أيام، تُحذف عند تسجيل الخروج، ويظهر وسم واضح أنها «آخر ما تم تحميله». لا تُرفع طلبات ولا اعتمادات منها.
- التنبيهات الفورية: `PushNotifications` يسجّل الرمز لدى `POST /api/push-tokens`؛ الخادم يربطه بالمستخدم من الجلسة ولا يثق بأي معرّف في جسم الطلب. **الإرسال الفعلي يحتاج FCM/APNs** (انظر القسم 4).

## 2. البناء محلياً

المتطلبات المعتمدة في هذه البيئة: Java 21، `ANDROID_HOME=C:\Android\Sdk`، منصات Android 35/36.

```bat
npm run mobile:android:debug
```

الأمر ينفّذ `npm run build` ثم `npx cap sync` ثم `gradlew.bat assembleDebug`.
الناتج: `android\app\build\outputs\apk\debug\app-debug.apk`.

بعد أي تغيير في الواجهة أو إضافة/تحديث إضافة Capacitor:

```bat
npm run mobile:sync
```

لإضافة المنصات من الصفر:

```bat
npm run mobile:add
```

> لا تُرفع مجلدات `android/app/src/main/assets/public` و`ios/App/App/public` إلى Git؛ تُولَّد من `dist` بواسطة `cap sync`.

## 3. الأيقونات وشاشة البداية

```bat
npx --yes @capacitor/assets@4 generate --iconBackgroundColor #102A56 --splashBackgroundColor #102A56
```

> على Windows cmd لا تضع اللون بين علامات تنصيص — المانيفست الذي يقرأه sharp سيرفض القيمة مع علامات الاقتباس.

## 4. ما يتبقى للمتاجر والتنبيهات (خارج نطاق هذه البيئة)

| العنصر | الحالة | المطلوب |
| --- | --- | --- |
| توقيع release | غير موجود |keystore جديد + كلمة مرور محفوظة بأمان |
| Google Play | لم يُنشأ | حساب مطور، `aab` موقّع، بيانات隐私/الوصول |
| App Store | لم يُنشأ | Mac/Xcode، حساب Apple Developer، APNs auth key |
| FCM | لم يُنشأ | مشروع Firebase + `google-services.json` + خدمة إرسال من الخادم |
| APNs | لم يُنشأ | مفتاح APNs وتفعيله في المشروع |
| إرسال التنبيه عند الاعتماد | لم يُفعّل | ربط `sendNotification` بنقاط الاعتماد بعد توفير FCM/APNs |

حتى تتوفر هذه العناصر، تبقى التنبيهات داخل التطبيق فورية عند فتحه (`pushNotificationReceived`)، بينما لا تصل إشعارات النظام عندما يكون مغلقاً.

## 5. ملاحظات أمنية

- `android:allowBackup="false"` لمنع نسخ بيانات التطبيق على جهاز آخر.
- الأذونات المطلوبة فقط: Internet، POST_NOTIFICATIONS، USE_BIOMETRIC/USE_FINGERPRINT.
- أصول WebView المحلية (`capacitor://localhost` وما شابهها) مسموح بها صراحةً في CORS الخادم، بينما يبقى رفض أي أصل آخر في الإنتاج سارياً.
- لا تُخزَّن كلمة المرور في الغلاف الأصلي؛ المصادقة تتم عبر الخادم كما في الويب.
