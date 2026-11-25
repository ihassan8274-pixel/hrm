# دليل الاستعادة والتدريب على الاستعادة (Restore Drill)

> **تحذير مهم:** هذا الدليل مخصص للاستخدام **المحلي / Staging** ولحالات التعافي الطارئ بعد موافقة صريحة.
> **الاستعادة إلى الإنتاج خارج نطاق التجربة الحالية**، ولا يجوز تنفيذها دون موافقة المستخدم صراحةً.
> أي أمر يظهر تحته المنفذ `5433` يُرفض افتراضياً من السكربت، ولا يُسمح به إلا بعلم صريح وموافقة مسبقة.

## 1. الغرض

يوفّر هذا الدليل إجراءً **مُختبَراً وقابلاً للتكرار** لاستعادة تفريغات PostgreSQL ( dumping backups ) إلى قاعدة قابلة للاستهلاك، من أجل:

- التدريب على الاستعادة (restore drill) بشكل دوري دون لمس بيانات الإنتاج.
- التحقق من سلامة النسخ الاحتياطي قبل الحاجة الحقيقية إليها.
- إعداد بيئة Staging أو التعافي الطارئ بعد توقيع الموافقة.

القاعدة الذهبية: **لا تُعتبر النسخة الاحتياطية صالحة إلا إذا تم استعادتها فعلياً والتحقق منها**.

## 2. جرد النسخ الاحتياطي

### 2.1 النسخة المحلية المعروفة

| العنصر | القيمة |
| --- | --- |
| المسار | `C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump` |
| الحجم المرصود | `303395` بايت |
| SHA-256 المرصود بتاريخ 2026-11-24 | `4790A6F34A12FBB84E3B3BCE4A9D4C8633076BA5E2B4385182C9FAB5883DEE81` |

التحقق قبل أي استخدام (Windows PowerShell):

```powershell
Get-Item -LiteralPath 'C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump' | Select-Object FullName, Length, LastWriteTimeUtc
Get-FileHash -LiteralPath 'C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump' -Algorithm SHA256
```

أو على Linux/macOS:

```bash
ls -l hr-payroll-20261122-065148.dump
sha256sum hr-payroll-20261122-065148.dump
```

> لا تعتمد على القيم المذكورة أعلاه بشكل أعمى: إذا اختلف الـ hash أو التاريخ أو الحجم، توقف وأعد الجرد.

### 2.2 نسخ الخادم عبر systemd

على الخادم توجد نسخ احتياطية تُنشأ عبر وحدات **systemd** يومياً **وعند الإقلاع (boot)**، مع **احتفاظ بآخر 14 يوماً** فقط. قبل استخدام أي نسخة من الخادم:

1. تحقق من المسار الفعلي ومن وجود الوحدة (لا تفترض اسماً ثابتاً):

   ```bash
   systemctl list-units --type=service --all | grep -i 'payroll.*backup\|backup.*payroll'
   systemctl list-timers --all | grep -i 'payroll.*backup\|backup.*payroll'
   ```

2. راجع السجلات وتأكد من نجاح آخر تشغيل:

   ```bash
   journalctl -u <backup-service-name> -n 100 --no-pager
   ```

3. اعرض النسخ ضمن نافذة الـ 14 يوماً وتحقق من الحجم والـ hash:

   ```bash
   find <backup-directory> -maxdepth 1 -type f -name '*.dump' -mtime -14 -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
   sha256sum <backup-directory>/<chosen-file>.dump
   ```

> استبدل `<backup-service-name>` و`<backup-directory>` بالقيم الفعلية على الخادم. **لا تنسخ كلمات مرور أو روابط اتصال إلى السجلات أو إلى المستند.**

## 3. المتطلبات المسبقة (Pre-flight checks)

### 3.1 اتصال PostgreSQL

البيئة المعروفة محلياً:

- المضيف: `127.0.0.1`
- المنفذ: `5433`
- قاعدة البيانات: `hr_payroll`
- المخطط (schema): `payroll`
- الدور (role): `hr_payroll_app`

أولاً، تأكد أن الخادم مستجيب:

```bash
pg_isready -h 127.0.0.1 -p 5433 -d hr_payroll
```

ثم تحقق من الهوية والمخطط:

```bash
psql "<DATABASE_URL>" -c 'SELECT current_database(), current_user, version();'
psql "<DATABASE_URL>" -c "SELECT nspname FROM pg_namespace WHERE nspname = 'payroll';"
```

> `<DATABASE_URL>` يُقرأ من البيئة ولا يُكتب في السجلات. السكربت `scripts/restore-db.mjs` يحذف كلمات المرور من كل مخرجاته تلقائياً.

### 3.2 إيقاف التطبيق أثناء الاستعادة

يجب ألا يكون هناك كاتب (writer) على قاعدة الوجهة أثناء الاستعادة:

- محلياً: أوقف التطبيق قبل الاستعادة (مثلاً عبر `stop-app.bat`) إذا كانت الوجهة ليست قاعدة منفصلة.
- على Staging: أوقف الخدمة المسؤولة عن التطبيق قبل التنفيذ.
- تحقق من عدم وجود اتصالات نشطة:

  ```sql
  SELECT pid, usename, application_name, state, left(query, 80) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid();
  ```

> إذا ظهرت اتصالات `active` أو `idle in transaction`، **أوقف** ولا تبدأ الاستعادة.

### 3.3 المساحة الحرة

توفّر مساحة حرة كافية (القاعدة العملية: **3 أضعاف حجم التفريغة** على الأقل للفهرسة والـ WAL أثناء البناء):

```bash
df -h <pgdata-mount>
```

أو على Windows:

```powershell
Get-PSDrive -Name C | Select-Object Name, Free, Used
```

### 3.4 مطابقة إصدار الـ migrations

الوجهة يجب أن تكون على نفس إصدار المخطط الذي أُخذت منه التفريغة. في وقت كتابة هذا الدليل أعلى إصدار في `server/db/postgres/` هو `017`:

```bash
# أعلى ملف متاح في الكود
ls server/db/postgres/*.sql | sort | tail -n 1
```

```sql
-- أعلى إصدار مطبق في القاعدة (داخل مخطط payroll)
SELECT MAX(version) AS max_version FROM payroll.schema_migrations;
```

**معايير الرفض:** إذا اختلف أعلى رقم في القاعدة عن أعلى ملف SQL، أو ظهر تعارض في أسماء الملفات (حيث يطبع نظام الـ migrations تحذير `skipped because their version number belongs to an older migration set`)، **أوقف** واتفق على الإصدار قبل المتابعة.

## 4. صيغ الأوامر باستخدام `scripts/restore-db.mjs`

السكربت لا يضيف أي dependency جديد؛ يستخدم `node:child_process` و`pg` الموجود أصلاً في `package.json`.

### 4.1 معاينة آمنة (إلزامية قبل أي تنفيذ)

```bash
node scripts/restore-db.mjs --backup "C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump" --dry-run
```

أو عبر npm:

```bash
npm run db:restore -- --backup "C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump" --dry-run
```

- `--dry-run` يطبع **أمر `pg_restore` الذي سيُنفَّذ** (مع استبدال كلمة المرور بـ `***`) ولا ينفّذ شيئاً ولا يتصل بقاعدة بيانات.
- لا حاجة لـ `--confirm` في وضع المعاينة.

### 4.2 استعادة حقيقية إلى قاعدة قابلة للاستهلاك

```bash
node scripts/restore-db.mjs \
  --backup "C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump" \
  --target-url "<DISPOSABLE_DATABASE_URL>" \
  --confirm \
  --schema payroll
```

خيارات إضافية:

| الخيار | المعنى |
| --- | --- |
| `--pg-restore <path>` | تحديد مسار `pg_restore` بدلاً من البحث في `PATH`. |
| `--clean` | إضافة `--clean --if-exists`; **يحذف الكائنات الموجودة** — استخدمه فقط على قاعدة قابلة للاستهلاك. |
| `--schema <name>` | المخطط الذي تُجرى عليه validators بعد الاستعادة (الافتراضي `payroll`). |
| `--i-know-this-is-production` | يجب تمريره للسماح بالمنفذ `5433`، ومع ذلك يطبع تحذيراً قوياً ولا يُلغي الحاجة إلى `--confirm`. |

بدون `--dry-run` يرفض السكربت العمل ما لم يُمرر `--confirm`. كما يرفض ملفاً غير موجود أو فارغاً، ويرفض المنفذ `5433` دون العلم الصريح.

## 5. تمرين الاستعادة خطوة بخطوة (Disposable DB)

> لا تستخدم قاعدة `hr_payroll` على المنفذ `5433` في هذا التمرين. أنشئ قاعدة منفصلة على منفذ آخر (مثلاً `5432` أو `55433` للحاوية).

1. **أنشئ قاعدة قابلة للاستهلاك** (مثال؛ استبدل بيانات الاتصال المحلية):

   ```bash
   createdb -h 127.0.0.1 -p 5432 -U <local-user> hr_payroll_restore_drill
   ```

   وإذا لزم الأمر، أنشئ المخطط والدور داخلها:

   ```sql
   CREATE ROLE hr_payroll_app LOGIN PASSWORD '<local-only-password>';
   CREATE SCHEMA payroll AUTHORIZATION hr_payroll_app;
   ```

2. **أوقف أي تطبيق يكتب في هذه القاعدة** (إن كانت مشتركة) وتأكد من خلو `pg_stat_activity` كما في §3.2.

3. **تحقق من النسخة** (الحجم + SHA-256) كما في §2، وسجّل النتيجة في محضر التمرين.

4. **عاين الأمر**:

   ```bash
   node scripts/restore-db.mjs --backup "C:\Users\masoo\hr-payroll-backups\hr-payroll-20261122-065148.dump" --dry-run
   ```

   قارن أمر `pg_restore` المطبوع بالمتوقع: يجب أن يحتوي على `--no-owner --no-privileges`، و إما `--exit-on-error` أو `--clean --if-exists` عند طلب `--clean`.

5. **نفّذ الاستعادة** إلى `hr_payroll_restore_drill` باستخدام `--confirm` كما في §4.2.

6. **تحقق آلياً خفيفاً**: السكربت يطبع بعد الاستعادة عدد الجداول في المخطط وعدد الصفوف في `payroll.employees` إن وُجد.

7. **تحقق يدوياً**:

   ```sql
   SELECT count(*) AS tables_in_payroll
   FROM information_schema.tables
   WHERE table_schema = 'payroll';

   SELECT count(*) AS employees
   FROM payroll.employees;
   ```

   **القيمة المرجعية:** عدد الموظفين المتوقع في التفريغة المعروفة هو **181**. أي انحراف يستوجب التوقف والتحقق من الـ hash وإصدار الـ migrations قبل اعتبار التمرين ناجحاً.

   ```sql
   -- المبلغ المرجعي 608400 هو إجمالي (gross) وليس صافي (net).
   -- قارنه فقط بنفس الفترة وعمود الإجمالي، ولا تستخدمه كقيمة صافية.
   SELECT period_year, period_month, SUM(gross_earnings) AS gross_total, SUM(net_pay) AS net_total
   FROM payroll.salary_slips
   GROUP BY period_year, period_month
   ORDER BY period_year, period_month;
   ```

   > **صياغة دقيقة:** الرقم `608400` مرجع لـ **الإجمالي (gross)** ضمن مجموعة بيانات/فترة محددة، **وليس** صافي الرواتب. لا تستنتج أن "الصافي = 608400"، ولا تطابق الرقم إلا بعد تثبيت نفس الفترة ونفس قواعد الاشتقاق.

8. **سجّل النتيجة**: التاريخ، مسار النسخة، الـ hash، إصدار الـ migrations، عدد الجداول، عدد الموظفين، واسم من نفّذ التمرين.

## 6. الإجهاض والتراجع (Abort / Rollback)

أوقف فوراً ولا تُكمل الاستعادة إذا تحقق أي مما يلي:

- فشل `pg_isready` أو ظهرت اتصالات نشطة على الوجهة.
- اختلف إصدار `schema_migrations` عن أعلى ملف `server/db/postgres/*.sql`.
- اختلف `SHA-256` أو حجم النسخة عن القيمة المسجلة.
- خرج `pg_restore` برقم غير صفر (السكربت يتوقف ولا يشغّل الـ validators).
- عدد الجداول أقل بكثير من المتوقع، أو `payroll.employees` ≠ 181 للتفريغة المرجعية.
- ظهر المنفذ `5433` دون علم صريح، أو طُلبت استعادة إنتاجية دون موافقة المستخدم.

**التراجع في التمرين:** بما أن الوجهة قابلة للاستهلاك، يكفي حذفها وإعادة إنشائها من الصفر:

```bash
dropdb -h 127.0.0.1 -p 5432 -U <local-user> hr_payroll_restore_drill
```

**التراجع على Staging:** أوقف التطبيق، أعد الاستعادة من آخر نسخة **مُتحقَّق منها**، ثم أعد تطبيق الـ migrations، ثم أعد تشغيل التطبيق بعد التأكد من §3.1–§3.4.

**الإنتاج:** لأي استعادة إنتاجية، يتطلب الأمر موافقة صريحة من المستخدم وخطة تراجع معتمدة؛ **هذا خارج نطاق المرحلة الحالية ولا ينفّذ هنا**.
