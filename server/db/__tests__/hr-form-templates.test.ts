import { describe, expect, it } from "vitest";
import { HR_FORM_TEMPLATES } from "../hr-form-templates";
import {
  buildTemplateContext,
  extractPlaceholders,
  findUnresolvedPlaceholders,
  renderTemplate,
} from "../../../src/lib/print/placeholders";

const byKey = (key: string) => {
  const template = HR_FORM_TEMPLATES.find((item) => item.template_key === key);
  if (!template) throw new Error(`قالب مفقود: ${key}`);
  return template;
};

describe("النماذج الإدارية المدمجة", () => {
  it("تغطي طلب التوظيف والجزاء والتقييم", () => {
    const keys = HR_FORM_TEMPLATES.map((template) => template.template_key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "job_application_form",
        "appointment_request",
        "disciplinary_action_form",
        "annual_performance_evaluation",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const template of HR_FORM_TEMPLATES) {
      expect(template.category).toBe("forms");
      expect(template.name_ar.length).toBeGreaterThan(0);
      expect(template.body_ar.length).toBeGreaterThan(100);
      expect(extractPlaceholders(template.body_ar).length).toBeGreaterThan(0);
    }
  });

  it("لا تشترط بيانات موظف في استمارة المتقدم ولا في اعتماد التعيين", () => {
    const context = buildTemplateContext({ company: { org_name: "شركة تجريبية للتحقق" } });
    for (const key of ["job_application_form", "appointment_request"]) {
      const unresolved = findUnresolvedPlaceholders(byKey(key).body_ar, context);
      expect(unresolved.filter((field) => field.startsWith("employee."))).toEqual([]);
      expect(unresolved.filter((field) => field.startsWith("salary."))).toEqual([]);
    }
  });

  it("تُنتج نصاً عربياً دون حقول غير مُحلَّلة بعد التعبئة", () => {
    const context = buildTemplateContext({
      company: { org_name: "شركة تجريبية للتحقق" },
      custom: Object.fromEntries(
        extractPlaceholders(byKey("job_application_form").body_ar)
          .filter((field) => field.startsWith("custom."))
          .map((field) => [field.slice("custom.".length), "قيمة"]),
      ),
    });
    const rendered = renderTemplate(byKey("job_application_form").body_ar, context);
    expect(rendered).not.toContain("{{");
    expect(rendered).not.toContain("«غير متوفر»");
    expect(rendered).toContain("شركة تجريبية للتحقق");
  });

  it("تتضمن استمارة التوظيف فترة التجربة والتمديد والتنقل بين الفروع", () => {
    const body = byKey("job_application_form").body_ar;
    expect(body).toContain("فترة تجربة مدتها 90 يوماً");
    expect(body).toContain("تمديدها لمدة مماثلة");
    expect(body).toContain("أي فرع من فروعها التابعة");
    expect(body).toContain("وفق خطتها التشغيلية");
    // لا حقول جديدة: البنود تستخدم هوية المنشأة نفسها.
    expect(
      extractPlaceholders(body).filter((field) => field.startsWith("custom.probation")),
    ).toEqual([]);
  });

  it("يستخدم نموذج الجزاء سنداً نظامياً وإقراراً بالاستلام", () => {
    const body = byKey("disciplinary_action_form").body_ar;
    expect(body).toContain("{{custom.legal_basis}}");
    expect(body).toContain("{{custom.employee_statement}}");
    expect(body).toContain("{{custom.previous_actions}}");
    expect(body).toContain("حقّي في التظلم");
  });

  it("يغطي نموذج التقييم معايير الدورة السنوية الخمسة", () => {
    const body = byKey("annual_performance_evaluation").body_ar;
    for (const criterion of [
      "الالتزام والحضور",
      "جودة الأداء",
      "الإنتاجية",
      "العمل الجماعي والقيادة",
      "السلامة وإجراءات الغذاء",
    ]) {
      expect(body).toContain(criterion);
    }
    expect(body).toContain("/ 25");
    expect(body).toContain("{{custom.total_score}}");
  });
});
