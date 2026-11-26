# Runbook — تمكين | EMPOWER

مرجع سريع لأي تعديل يصل إلى الإنتاج. الترتيب إلزامي.

## 1. قبل أي تعديل
- تأكد من أن الفرع `main` ومساحة العمل نظيفة: `git status --short`.
- لا تخترع بيانات إنتاجية. أي استيراد فروع/موظفين يجب أن يستند إلى مصدر معتمد.
- ثوابت لا تُلمس دون موافقة صريحة: `tax_rate=0`، العملة `SAR`، `geofence_radius_m` الحالي `200`، قاعدة 10 دقائق/100 م.

## 2. التحقق المحلي
```bat
npm run verify
npm audit
npm audit --omit=dev
pnpm audit
```
`npm run verify` يشغّل: `tsc --noEmit`، اختبارات Vitest، بوابات drift، فحص `.env`، فحص الأسرار `check:secrets`، ثم `vite build` وbundle السيرفر.

فاحص الأسرار يفحص الملفات المتتبّعة بحثاً عن مفاتيح PEM ورموز vendor وJWT ورابط قاعدة بيانات إنتاج بكلمة مرور حقيقية. لأي قيمة اختبار مقصودة أضف تعليقاً `check:secrets-allow <السبب>` في السطر نفسه أو فوقه. لفحص ملفات غير متتبّعة محلياً: `node scripts/check-secrets.cjs --all`.

كما يشغّل CI وظيفة `semgrep` بمجموعة قواعد `p/ci` (أو يدوياً محلياً: `semgrep scan --config p/ci --error`). القواعد تمنع مراجع Actions القابلة للتغيير، وتطلب `cooldown` في Dependabot، وتكشف الأسرار المكتوبة داخل الكود. الاستثناءات المقبولة تُعلَّق بـ `// nosemgrep: <rule-id>` مع سبب واضح، كما في اختبارات التوقيع التي تستخدم مفاتيح وهمية عمداً. مراجع Actions مُثبَّتة على SHA كامل مع تعليق بالإصدار (`# v4`) حتى لا يُعاد توجيه الوسم إلى كود آخر.

## 3. نسخة قاعدة البيانات قبل النشر
```bat
ssh -i C:\Users\masoo\.ssh\oracle_restocost -o StrictHostKeyChecking=no -o BatchMode=yes ubuntu@145.241.109.15 bash -s < scripts\backup-before-deploy.sh
```
احتفظ بالبصمة SHA256 المطبوعة في سجل النشر.

## 4. النشر
```bat
deploy.cmd
```
السكربت يعيد تشغيل `npm run verify`، ينسخ `dist` احتياطياً، يرفع `dist` والهجرات، يبدّل المجلد، ويعيد تشغيل PM2 `hr-payroll`.

## 5. التحقق بعد النشر
```bat
ssh -i C:\Users\masoo\.ssh\oracle_restocost -o StrictHostKeyChecking=no -o BatchMode=yes ubuntu@145.241.109.15 bash -s < scripts\verify-deploy-development.sh
```
تحقق يدوياً أيضاً من:
- `https://hr.restocost.shop/m` ⇒ `200`
- `/api/health` ⇒ `ok`، `/api/ready` ⇒ `database ok`
- `/api/notifications`, `/api/alerts/expiries`, `/api/audit-logs`, `/api/presence/me`, `POST /api/presence/recheck` بلا جلسة ⇒ `401`

## 6. التراجع
```bat
.\scripts\deploy.ps1 -Rollback
```
ثم أعد تشغيل خطوة التحقق رقم 5.

## 7. Commit و push
بعد اكتمال التحقق والنشر:
```bat
git add -A
git commit -m "<type>: <message>"
git push origin main
```

## مراقبة أخطاء الواجهة
لا يُرسل أي خطأ إلى أي جهة خارجية افتراضياً. إذا ضُبط `VITE_ERROR_REPORT_URL` (HTTPS فقط) أثناء البناء، تُرسل لقطة مختصرة عبر `navigator.sendBeacon`، بحد أقصى 20 بلاغاً لكل تحميل صفحة، مع إخفاء `Bearer` وكلمات المرور والمفاتيح من الرسالة. في كل الأحوال يُطبع الخطأ في console، وتعرض `ErrorBoundary` شاشة تعافٍ بدل الشاشة البيضاء. لا تُضف قيمة العنوان إلى المستودع؛ اضبطها في بيئة البناء فقط.

## ملاحظات بيئية
- الإنتاج PostgreSQL فقط مع `PGSCHEMA=payroll`، والمنفذ `8090`، وPM2 `hr-payroll` تحت `/opt/hr-payroll`.
- استعلامات `psql` تحتاج: `export PGOPTIONS="-c search_path=${PGSCHEMA:-public}"`.
- WebView يلفّ `dist` محلياً ويعيد كتابة `/api/` إلى `https://hr.restocost.shop` في `src/main.tsx` فقط؛ لا `server.url`.
- iOS PWA فقط؛ APK المعتمد `releases\tamkeen-empower-v2.0.0-vc7-debug.apk` (`versionCode 7`, `versionName 2.0.0`).
