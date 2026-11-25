-- الشهادة الصحية (بلدي) إلزامية لمن يعمل في تداول الطعام فقط،
-- وليست شرطاً على كل موظف. العلامة تُضبط من ملف الموظف.
-- الافتراضي 0 حتى تتوقف التنبيهات الجماعية فوراً، ويُعلَّم الموظفون الخاضعون فقط.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_cert_required INTEGER NOT NULL DEFAULT 0;
