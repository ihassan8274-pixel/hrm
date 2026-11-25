// القوالب الرسمية المدمجة لمركز النماذج والطباعة.
//
// تُزرع مرة واحدة عند الإقلاع، وتُعلَّم بـ is_system = 1: يمكن تعديل نصها
// (المسؤول يخصصها باسم المنشأة) لكن لا تُحذف — لأن مستندات صدرت بالفعل
// تشير إليها.
// الحقول على صيغة {{employee.name}} — نفس المحرّك في src/lib/print/placeholders.ts.

import db from "../config/postgres";
import { DEFAULT_BRAND, LEGACY_VALUES } from "../../src/lib/print/brand";
import { HR_FORM_TEMPLATES } from "./hr-form-templates";

export { HR_FORM_TEMPLATES } from "./hr-form-templates";

export interface BuiltInTemplate {
  template_key: string;
  name_ar: string;
  name_en: string;
  category: string;
  subject_label: string;
  body_ar: string;
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    template_key: "salary_letter",
    name_ar: "خطاب راتب",
    name_en: "Salary Letter",
    category: "letters",
    subject_label: "خطاب راتب",
    body_ar:
      "السادة / ______________ المحترمين\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "نشهد أن السيد/ة {{employee.name}}، برقم هوية/إقامة {{employee.national_id}}، " +
      "يعمل في {{company.name}} بمنصب {{employee.position}}" +
      "{{employee.department ? \" — إدارة {employee.department}\" : \"\"}}" +
      "{{employee.branch ? \" — فرع {employee.branch}\" : \"\"}}، " +
      "وقد التحق العمل بتاريخ {{employee.join_date}}، وحالته من حيث الأجر كالتالي:\n\n" +
      "الراتب الأساسي: {{salary.basic}}\n" +
      "بدل السكن: {{salary.housing}}\n" +
      "بدل النقل: {{salary.transport}}\n" +
      "إجمالي الأجر: {{salary.total}}\n\n" +
      "وقد حُرر هذا الخطاب بناءً على طلبه في الغرض: {{custom.purpose}}، " +
      "وذلك اعتباراً من {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "employment_certificate",
    name_ar: "شهادة عمل",
    name_en: "Employment Certificate",
    category: "certificates",
    subject_label: "شهادة عمل",
    body_ar:
      "السادة / ______________ المحترمين\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "نشهد أن السيد/ة {{employee.name}}، برقم هوية/إقامة {{employee.national_id}}، " +
      "يعمل حالياً في {{company.name}} بمنصب {{employee.position}}" +
      "{{employee.department ? \" في إدارة {employee.department}\" : \"\"}} " +
      "منذ تاريخ {{employee.join_date}}، وأن ما بينه وبين المنشأة علاقة عمل نظامية ومستمرة.\n\n" +
      "وقد أُصدرت هذه الشهادة بناءً على طلبه لأغراض: {{custom.purpose}}، " +
      "اعتباراً من {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "to_whom_it_may_concern",
    name_ar: "خطاب إلى من يهمه الأمر",
    name_en: "To Whom It May Concern",
    category: "letters",
    subject_label: "خطاب إلى من يهمه الأمر",
    body_ar:
      "السادة / ______________ المحترمين\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "نحيط علماً بأن السيد/ة {{employee.name}}، برقم هوية/إقامة {{employee.national_id}}، " +
      "يشغل منصب {{employee.position}} في {{company.name}}" +
      "{{employee.branch ? \" (فرع {employee.branch})\" : \"\"}} " +
      "منذ {{employee.join_date}}، وأن حالته الوظيفية: {{custom.purpose}}.\n\n" +
      "وقد مُنح بناءً على طلبه ليكون معلماً على ما ورد أعلاه.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "service_certificate",
    name_ar: "شهادة خدمة",
    name_en: "Service Certificate",
    category: "certificates",
    subject_label: "شهادة خدمة",
    body_ar:
      "السادة / ______________ المحترمين\n\n" +
      "نشهد أن السيد/ة {{employee.name}} قد أدى الخدمة الفعلية للمنشأة المذكورة " +
      "بمنصب {{employee.position}} خلال الفترة من {{employee.contract_start}} " +
      "إلى {{employee.contract_end}}، وقد أحسن في العمل والتزم بالأنظمة واللوائح " +
      "الصادرة عن الشركة.\n\n" +
      "وبناءً على طلبه، أُصدرت هذه الشهادة بتاريخ {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "official_warning",
    name_ar: "إنذار رسمي (إنذار أول)",
    name_en: "Official Warning (First)",
    category: "warnings",
    subject_label: "إنذار رسمي",
    body_ar:
      "السيد/ة {{employee.name}} المحترم/ة\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "إشارة إلى ما وقع بتاريخ {{custom.incident_date}} من {{custom.violation}}، " +
      "وهي إخلال بالأنظمة واللوائح المعتمدة في {{company.name}} " +
      "(البند: {{custom.clause}} من لائحة الجزاءات)، وبناءً على المادة 80 من نظام العمل.\n\n" +
      "فقد تم توجيه إنذار كتابي إلى السيد/ة {{employee.name}}، " +
      "مع التنبيه على وجوب الالتزام التام بالأنظمة وعدم تكرار المخالفة، " +
      "جرياً عليه في حالة التكرار اتخاذ الإجراءات النظامية حيال ذلك.\n\n" +
      "وقد تم إبلاغه بهذا الإنذار بتاريخ {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "final_warning",
    name_ar: "إنذار نهائي",
    name_en: "Final Warning",
    category: "warnings",
    subject_label: "إنذار نهائي",
    body_ar:
      "السيد/ة {{employee.name}} المحترم/ة\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "بالإشارة إلى الإنذار الكتابي رقم {{doc.reference}} بتاريخ {{custom.previous_warning_date}} " +
      "بشأن {{custom.violation}}، فقد ثبت تكرار المخالفة بتاريخ {{custom.incident_date}}، " +
      "وذلك رغم أنه تم تنبيهه كتابياً على عدم التكرار.\n\n" +
      "وعليه فهذا إنذار نهائي قبل اتخاذ الإجراءات النظامية المنصوص عليها " +
      "في نظام العمل ولائحة الجزاءات المعتمدة، وعلى رأسها إنهاء الخدمة " +
      "طبقاً للمادة 80 من النظام.\n\n" +
      "وقد تم تسليمه بتاريخ {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "transfer_letter",
    name_ar: "خطاب نقل",
    name_en: "Transfer Letter",
    category: "letters",
    subject_label: "خطاب نقل",
    body_ar:
      "السيد/ة {{employee.name}} المحترم/ة\n\n" +
      "السلام عليكم ورحمة الله وبركاته، وبعد:\n\n" +
      "بناءً على ما تقتضيه مصلحة العمل، فقد تم نقل السيد/ة {{employee.name}} " +
      "من فرع {{employee.branch}} إلى {{custom.to_branch}}، وذلك اعتباراً من {{custom.effective_date}}، " +
      "مع حفظ جميع حقوقه النظامية المقررة له.\n\n" +
      "يُرجى العلم والتعاون مع الإدارة الجديدة في إجراءات انتقاله.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "leave_confirmation",
    name_ar: "إجازة / خط إجازة",
    name_en: "Leave Confirmation",
    category: "letters",
    subject_label: "إجازة",
    body_ar:
      "السيد/ة {{employee.name}} المحترم/ة\n\n" +
      "نحيط علماً بأن إدارة الموارد البشرية في {{company.name}} منحتكم إجازة " +
      "من نوع {{custom.leave_type}} لمدة {{custom.days}} يوم، " +
      "اعتباراً من {{custom.start_date}} إلى {{custom.end_date}}، " +
      "مع وجوب العودة للعمل في {{custom.return_date}} " +
      "أو في اليوم التالي لانتهاء الإجازة، أيهما أقرب.\n\n" +
      "نأمل التعاون مع الإدارة لضمان تغطية الأعمال أثناء غيابكم.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  {
    template_key: "work_contract",
    name_ar: "عقد عمل",
    name_en: "Employment Contract",
    category: "contracts",
    subject_label: "عقد عمل",
    body_ar:
      "عقد عمل\n\n" +
      "أُبرم هذا العقد بتاريخ {{date.today}} بين:\n\n" +
      "الطرف الأول (المنشأة): {{company.name}}\n" +
      "الرقم الموحد: {{company.unified_number}} — السجل التجاري: {{company.cr_number}}\n" +
      "العنوان: {{company.address}}\n\n" +
      "الطرف الثاني (العامل): {{employee.name}} — رقم الهوية/الإقامة: {{employee.national_id}} — " +
      "الجنسية: {{employee.nationality}}\n\n" +
      "البند الأول — الوظيفة: يعمل الطرف الثاني بمنصب {{employee.position}}" +
      "{{employee.department ? \" بإدارة {employee.department}\" : \"\"}} " +
      "بفرع {{employee.branch}}.\n\n" +
      "البند الثاني — الأجر: الأجر الأساسي {{salary.basic}}، وبدل السكن {{salary.housing}}، " +
      "وبدل النقل {{salary.transport}}، بإجمالي أجر شهري {{salary.total}}، " +
      "تُصرف حسب كشف الرواتب المعتمد من {{company.name}}.\n\n" +
      "البند الثالث — مدة العقد: عقد {{employee.contract_type}} يبدأ من {{employee.contract_start}}" +
      "{{employee.contract_end ? \" وينتهي بتاريخ {employee.contract_end}\" : \"\"}}، " +
      "ويخضع لنظام العمل ولائحته التنفيذية.\n\n" +
      "البند الرابع — ساعات العمل: تُحدَّد وفق جداول الدوام المعتمدة في {{company.name}}، " +
      "مع مراعاة ساعات العمل الرسمية للأسبوع.\n\n" +
      "البند الخامس — الإجازات: يستحق الطرف الثاني إجازة سنوية مدفوعة وفق نظام العمل، " +
      "وكافة الإجازات المنصوص عليها نظاماً.\n\n" +
      "البند السادس — السرية: يلتزم الطرف الثاني بالسرية التامة بشأن بيانات المنشأة " +
      "وعملائها.\n\n" +
      "وأُعد هذا العقد من نسختين، بيد كل طرف نسخة، للعمل بموجبها.\n\n" +
      "الطرف الأول: ______________     الطرف الثاني: ______________",
  },
  {
    template_key: "loan_voucher",
    name_ar: "سند صرف سلفة",
    name_en: "Loan Advance Voucher",
    category: "finance",
    subject_label: "سند صرف سلفة",
    body_ar:
      "سند صرف سلفة موظف\n\n" +
      "رقم السند: {{custom.voucher_number}} — التاريخ: {{date.today}}\n\n" +
      "صُرف إلى السيد/ة {{employee.name}}، برقم هوية/إقامة {{employee.national_id}}، " +
      "الذي يعمل بمنصب {{employee.position}}" +
      "{{employee.department ? \" — إدارة {employee.department}\" : \"\"}}" +
      "{{employee.branch ? \" — فرع {employee.branch}\" : \"\"}}، " +
      "مبلغ سلفة قدره {{custom.loan_amount}} ر.س (فقط {{custom.amount_in_words}} ريال سعودي لا غير).\n\n" +
      "طريقة السداد: تُخصم أقساط شهرية مقدار كل منها {{custom.installment}} ر.س من الراتب، " +
      "بدءاً من مسير الشهر التالي للاعتماد، وحتى سداد كامل المبلغ.\n\n" +
      "مرجع الاعتماد: {{custom.approval_reference}}\n\n" +
      "أقر أنا الموقع أدناه باستلام المبلغ المذكور أعلاه والتزامي بسداده وفق الجدول المعتمد، " +
      "وفي حالة انتهاء خدمتي قبل السداد الكامل يُخصم الرصيد المتبقي من مستحقاتي النهائية.\n\n" +
      "المستلم: ______________     المحاسب: ______________     المدير المالي: ______________",
  },
  {
    template_key: "compliance_statement",
    name_ar: "إفادة / خطاب تسوية امتثال",
    name_en: "Compliance Statement",
    category: "reports",
    subject_label: "إفادة امتثال",
    body_ar:
      "السادة / ______________ المحترمين\n\n" +
      "نفيدكم بأن السيد/ة {{employee.name}}، برقم هوية/إقامة {{employee.national_id}}، " +
      "مسجل في {{company.name}}، " +
      "رقم اشتراكه في التأمينات الاجتماعية: {{custom.gosi_number}}، " +
      "ومستوفٍ لاشترطات نظام العمل والتأمينات الاجتماعية في المملكة.\n\n" +
      "وقد صدرت هذه الإفادة بناءً على طلبه لأغراض: {{custom.purpose}}، " +
      "اعتباراً من {{date.today}}.\n\n" +
      "وتفضلوا بقبول فائق الاحترام والتقدير.",
  },
  ...HR_FORM_TEMPLATES,
];

/**
 * يزرع هوية المنشأة (ورقة الشركة) إن لم تكن مضبوطة.
 *
 * لا يكتب فوق إعداد حفظه المسؤول: الشرط الوحيد للكتابة أن يكون المفتاح
 * غائباً أو فارغاً، أو أن يحمل الاسم القديم الافتراضي — فيتحول مرة واحدة
 * إلى هوية المنشأة الحقيقية، وبعدها يبقى ما عدّله المسؤول.
 */
export async function seedBrandSettings(): Promise<void> {
  const rows = (await db.prepare("SELECT key, value FROM settings").all()) as any[];
  const current = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  for (const [key, value] of Object.entries(DEFAULT_BRAND)) {
    const existing = current[key];
    const legacy = LEGACY_VALUES[key]?.includes(existing ?? "");
    if (existing === undefined || existing === "" || legacy) {
      await db
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(key, value);
    }
  }
}

/**
 * يزرع القوالب المدمجة إن لم تكن موجودة.
 *
 * لا يلمس القوالب التي عدّلها المسؤول: الإدخال يتم فقط عند غياب المفتاح،
 * فإعادة تشغيل الخادم لا تُرجع نصاً عدّله أحدهم إلى النص الأصلي.
 */
export async function seedFormTemplates(): Promise<void> {
  for (const template of BUILT_IN_TEMPLATES) {
    await db
      .prepare(
        `INSERT INTO document_templates
           (template_key, name_ar, name_en, category, subject_label, body_ar, is_system, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1)
         ON CONFLICT (template_key) DO NOTHING`
      )
      .run(
        template.template_key,
        template.name_ar,
        template.name_en,
        template.category,
        template.subject_label,
        template.body_ar,
      );
  }
}
