-- إعفاء الموظف من خصم حصة التأمينات: لا يُستقطع من راتبه شيء،
-- وتتحمل المنشأة الحصتين (حصة العامل + حصة صاحب العمل) في المسير.
-- الافتراضي 0 حتى يستمر الوضع الحالي لمن لم يُعلَّم يدوياً.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gosi_exempt INTEGER NOT NULL DEFAULT 0;
