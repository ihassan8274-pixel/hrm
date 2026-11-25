// النماذج الإدارية المطلوبة: طلب توظيف (استمارة المتقدم + اعتماد التعيين)،
// جزاء إداري، وتقييم سنوي.
//
// الملف خالٍ من أي استيراد لقاعدة البيانات حتى يمكن فحصه في الاختبارات
// دون الحاجة إلى DATABASE_URL. يُدمج في BUILT_IN_TEMPLATES في forms-seed.ts،
// فيُزرع مرة واحدة بنفس آلية القوالب المدمجة الأخرى ولا يُكتب فوق تعديل
// أجراه المسؤول.

export interface HRFormTemplate {
  template_key: string;
  name_ar: string;
  name_en: string;
  category: string;
  subject_label: string;
  body_ar: string;
}

export const HR_FORM_TEMPLATES: HRFormTemplate[] = [
  {
    template_key: "job_application_form",
    name_ar: "استمارة طلب توظيف",
    name_en: "Job Application Form",
    category: "forms",
    subject_label: "طلب توظيف",
    body_ar: `استمارة طلب توظيف

البيانات الشخصية
الاسم: {{custom.applicant_name}}
رقم الهوية/الإقامة: {{custom.national_id}} — الجنسية: {{custom.nationality}}
تاريخ الميلاد: {{custom.birth_date}} — الهاتف: {{custom.mobile}}
البريد الإلكتروني: {{custom.email}}
العنوان: {{custom.address}}

البيانات الأكاديمية والمهنية
المسمى المتقدم له: {{custom.position_applied}} — تاريخ التوفر: {{custom.available_date}}
المؤهل: {{custom.qualification}} — الجامعة/المعهد: {{custom.university}} — سنة التخرج: {{custom.graduation_year}}
سنوات الخبرة: {{custom.experience_years}} — جهة العمل السابقة: {{custom.previous_employer}}
الراتب المتوقع: {{custom.expected_salary}} ر.س

إقرار المتقدم وشروط التوظيف
أقر أنا الموقع أدناه بصحة البيانات المذكورة أعلاه، وأتحمل مسؤولية ما يثبت عدم صحتها، وأوافق على التحقق من هويتي ومؤهلاتي وخبراتي وفق إجراءات {{company.name}} المعتمدة.

أولاً — فترة التجربة
يخضع الموظف لفترة تجربة مدتها 90 يوماً من تاريخ المباشرة، وللشركة تمديدها لمدة مماثلة إذا رأت ذلك من مصلحة العمل، وفق نظام العمل السعودي ولائحة {{company.name}} المعتمدة.

ثانياً — التنقل بين الفروع
للشركة الحق في تشغيل العامل في أي فرع من فروعها التابعة، ونقله بينها وفق خطتها التشغيلية ومقتضيات العمل، بما لا يمسّ بحقوقه المقررة نظامياً.

اسم المتقدم: ______________     التوقيع: ______________     التاريخ: ______________

تعبئة الموارد البشرية (لا تُملأ من المتقدم)
نتيجة الفرز: ______________     المقابلة: ______________     الاعتماد: ______________`,
  },
  {
    template_key: "appointment_request",
    name_ar: "نموذج طلب تعيين (اعتماد داخلي)",
    name_en: "Internal Appointment Request",
    category: "forms",
    subject_label: "طلب تعيين",
    body_ar: `نموذج طلب تعيين — اعتماد داخلي

رقم الطلب: {{custom.request_number}} — التاريخ: {{custom.request_date}}
إلى: إدارة الموارد البشرية في {{company.name}}
مقدّم الطلب: {{custom.requesting_manager}} — الفرع: {{custom.branch}} — الإدارة: {{custom.department}}

المسمى المطلوب: {{custom.position}} — عدد الوظائف: {{custom.headcount}}
مبرر الطلب: {{custom.justification}}

بيانات المرشح المقترح
الاسم: {{custom.candidate_name}} — رقم الهوية/الإقامة: {{custom.candidate_national_id}}
نوع العقد: {{custom.contract_type}} — تاريخ المباشرة: {{custom.start_date}}
الراتب الأساسي المقترح: {{custom.salary}} ر.س
بدل السكن: {{custom.housing_allowance}} ر.س — بدل النقل: {{custom.transport_allowance}} ر.س
الإجمالي الشهري المقترح: {{custom.total_salary}} ر.س

الاعتمادات
مدير الفرع: ______________     التاريخ: ______________
المدير المالي: ______________     التاريخ: ______________
مدير الموارد البشرية: ______________     التاريخ: ______________
الإدارة العامة: ______________     التاريخ: ______________`,
  },
  {
    template_key: "disciplinary_action_form",
    name_ar: "نموذج جزاء إداري",
    name_en: "Disciplinary Action Form",
    category: "forms",
    subject_label: "جزاء إداري",
    body_ar: `قرار جزاء إداري

رقم القرار: {{custom.decision_number}} — التاريخ: {{date.today}}
إلى السيد/ة {{employee.name}} — المسمى: {{employee.position}} — الفرع: {{employee.branch}}

الموضوع: جزاء إداري وفق لائحة الجزاءات المعتمدة في {{company.name}} ونظام العمل السعودي.

أولاً — واقعة المخالفة
تاريخ الواقعة: {{custom.incident_date}} — تاريخ التحقيق: {{custom.investigation_date}}
وصف المخالفة: {{custom.violation}}
البند/المادة المخالَفة: {{custom.clause}} — الشهود والمراجع: {{custom.witnesses}}
أقوال الموظف وتنبيهه: {{custom.employee_statement}}

ثانياً — التقييم والجزاء
نوع الجزاء: {{custom.penalty_type}} — مدته: {{custom.penalty_days}} يوم
الخصم النظامي (إن وُجد): {{custom.deduction_amount}} ر.س
السند النظامي: {{custom.legal_basis}}
تاريخ سريان القرار: {{custom.effective_date}}

ثالثاً — الإجراءات والاعتماد
الإنذارات والإجراءات السابقة: {{custom.previous_actions}}
خطة التصحيح المطلوبة: {{custom.corrective_plan}}
مراجعة بعد: {{custom.review_date}}
أعدّ القرار: {{custom.prepared_by}} — اعتمد القرار: {{custom.approved_by}}

أقر باستلام هذا القرار وإبلاغي بمضمونه، ومع حقّي في التظلم وفق الإجراءات المعتمدة.
اسم الموظف: ______________     التوقيع: ______________     التاريخ: ______________`,
  },
  {
    template_key: "annual_performance_evaluation",
    name_ar: "نموذج التقييم السنوي",
    name_en: "Annual Performance Evaluation",
    category: "forms",
    subject_label: "تقييم سنوي",
    body_ar: `نموذج التقييم السنوي للموظف

الموظف: {{employee.name}} — المسمى: {{employee.position}}
الإدارة: {{employee.department}} — الفرع: {{employee.branch}}
فترة التقييم: {{custom.evaluation_period}} — تاريخ التقييم: {{custom.evaluation_date}}
المقيّم: {{custom.evaluator_name}} — الصفة: {{custom.evaluator_position}}

المعايير — الدرجة من 5 لكل معيار، والمجموع من 25
1) الالتزام والحضور: {{custom.attendance_score}} / 5 — ملاحظات: {{custom.attendance_note}}
2) جودة الأداء: {{custom.quality_score}} / 5 — ملاحظات: {{custom.quality_note}}
3) الإنتاجية: {{custom.productivity_score}} / 5 — ملاحظات: {{custom.productivity_note}}
4) العمل الجماعي والقيادة: {{custom.teamwork_score}} / 5 — ملاحظات: {{custom.teamwork_note}}
5) السلامة وإجراءات الغذاء: {{custom.safety_score}} / 5 — ملاحظات: {{custom.safety_note}}

النتيجة: {{custom.total_score}} / 25 — التقدير: {{custom.rating}}
نقاط القوة: {{custom.strengths}}
مجالات التحسين: {{custom.improvement_areas}}
الاحتياج التدريبي: {{custom.training_needs}}
التوصية: {{custom.recommendation}}
ملاحظات الموظف: {{custom.employee_comments}}

توقيع المقيّم: ______________     توقيع الموظف: ______________     تاريخ التسليم: ______________`,
  },
];
