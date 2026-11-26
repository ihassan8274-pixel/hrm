## ما الذي تغيّر؟

## لماذا؟
اربط الـ PR برقم Issue إن وُجد: `Closes #...`

## قائمة التحقق
- [ ] `npm run verify` أخضر (lint + test + drift + env + build)
- [ ] `npm audit` و`npm audit --omit=dev` و`pnpm audit` عند الصفر
- [ ] لا تعديل على `geofence_radius_m` أو قواعد الرواتب دون موافقة صريحة
- [ ] ESS لا يرى إلا نفسه، والتقارير الستة محصورة بـ admin/hr_manager/finance
- [ ] لا بث موقع، لا خريطة حية، لا تخزين إحداثيات خام على الجهاز
- [ ] أُضيف/حدَّث اختبار يمنع تكرار الخطأ إن كان PR إصلاحاً
- [ ] نُسخة DB قبل النشر، ونُفّذ `deploy.cmd`, ثم `scripts/verify-deploy-development.sh`

## طابع النشر
`YYYYMMDD-HHMMSS`: ...

## التراجع
`.\\scripts\\deploy.ps1 -Rollback` عند الحاجة.
