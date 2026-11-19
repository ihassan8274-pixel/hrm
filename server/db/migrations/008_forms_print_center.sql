-- مركز النماذج والطباعة (Forms & Print Center)
--
-- document_templates: قوالب المستندات الرسمية (خطابات، شهادات، إنذارات، عقود).
-- body_ar يحمل الحقول على صيغة {{employee.name}} — نفس المحرّك في
-- src/lib/print/placeholders.ts، فيبقى النص المولَّد واحداً في المعاينة والحفظ.
--
-- generated_documents: كل مستند صدر فعلاً (نص مُجمَّد + البيانات وقت الإصدار).
-- تخزين النص المُجمَّد مقصود: لو تغيّر القالب لاحقاً يبقى المستند الصادر
-- كما وُقّع، لأن ما خرج من باب المنشأة لا يعاد كتابته بتعديل قالب.
CREATE TABLE IF NOT EXISTS document_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  category TEXT NOT NULL DEFAULT 'letters',
  subject_label TEXT,
  body_ar TEXT NOT NULL,
  body_en TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  employee_id INTEGER,
  reference_number TEXT,
  content TEXT NOT NULL,
  fields_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'issued',
  issued_by INTEGER,
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  branch_id INTEGER,
  employee_branch_id INTEGER,
  employee_entity_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_document_templates_active ON document_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_generated_documents_employee ON generated_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_template ON generated_documents(template_key);
CREATE INDEX IF NOT EXISTS idx_generated_documents_issued ON generated_documents(issued_at);
