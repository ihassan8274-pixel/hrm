-- الجهة المُصدِرة للإنذار الرسمي: اسم الموظف/الجهة (نص حر) وليس رقم مستخدم.
-- في SQLite كان العمود INTEGER ويتقبّل النص، أما Postgres فيرفض النص في عمود
-- INTEGER فتُفشل عملية إصدار الإنذار كلياً. لذلك يُحوَّل العمود إلى TEXT.
ALTER TABLE official_warnings
  ALTER COLUMN issued_by TYPE TEXT;
