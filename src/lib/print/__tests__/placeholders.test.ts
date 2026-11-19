import { describe, it, expect } from "vitest";
import {
  buildTemplateContext,
  extractPlaceholders,
  findUnresolvedPlaceholders,
  formatArabicDate,
  formatCurrency,
  renderTemplate,
} from "../placeholders";

describe("محرّك القوالب", () => {
  it("يستبدل الحقل بقيمته", () => {
    const result = renderTemplate("السيد {{employee.name}}", { "employee.name": "أحمد" });
    expect(result).toBe("السيد أحمد");
  });

  it("يكتب «غير متوفر» بدل الحقل الفارغ", () => {
    const result = renderTemplate("الغرض: {{custom.purpose}}", {});
    expect(result).toContain("غير متوفر");
  });

  it("يتجاهل المسافات داخل الأقواس", () => {
    expect(renderTemplate("{{ employee.name }}", { "employee.name": "سالم" })).toBe("سالم");
  });

  it("يقيّم الشرط: يطبع الفرع حين تكون القيمة موجودة", () => {
    const template = '{{employee.department ? " — إدارة {employee.department}" : ""}}';
    const result = renderTemplate(template, { "employee.department": "المبيعات" });
    expect(result).toBe(" — إدارة المبيعات");
  });

  it("يقيّم الشرط: يفرّغ النص حين تكون القيمة فارغة", () => {
    const template = '{{employee.department ? " — إدارة {employee.department}" : ""}}';
    const result = renderTemplate(template, { "employee.department": "" });
    expect(result).toBe("");
  });

  it("يجمع الحقول المستعملة في القالب بلا تكرار", () => {
    const template =
      "{{employee.name}} — {{employee.name}} — {{employee.department ? \"إدارة {employee.department}\" : \"\"}}";
    expect(extractPlaceholders(template)).toEqual(["employee.name", "employee.department"]);
  });

  it("يبلّغ عن الحقول غير المملوءة فقط", () => {
    const template = '{{employee.name}} و {{custom.purpose}}';
    const context = { "employee.name": "أحمد" };
    expect(findUnresolvedPlaceholders(template, context)).toEqual(["custom.purpose"]);
  });

  it("لا يبلّغ عن حقل شرطي لم يُحقق شرطه", () => {
    const template = '{{employee.department ? "إدارة {employee.department}" : ""}}';
    expect(findUnresolvedPlaceholders(template, { "employee.department": "" })).toEqual([]);
  });
});

describe("تنسيق القيم", () => {
  it("يحوّل التاريخ إلى صيغة عربية", () => {
    expect(formatArabicDate("2026-11-13")).toBe("13 نوفمبر 2026");
  });

  it("يترك التاريخ غير الصالح كما هو", () => {
    expect(formatArabicDate("غير محدد")).toBe("غير محدد");
  });

  it("ينسّق المبلغ بالريال", () => {
    expect(formatCurrency(11500, "SAR")).toBe("11,500.00 ر.س");
  });
});

describe("بناء السياق من بيانات الموظف", () => {
  const context = buildTemplateContext({
    employee: {
      name: "أحمد العتيبي",
      position: "مدير مبيعات",
      department_name: "المبيعات",
      branch_name: "الفرع الرئيسي",
      national_id_iqama: "1012345678",
      join_date: "2023-04-01",
      basic_salary: 8000,
      housing_allowance: 2500,
      transport_allowance: 1000,
    } as any,
    salary: { basic_salary: 8000, total_salary: 11500 } as any,
    company: { org_name: "شركة مطعم معصوب حليب", currency: "SAR" } as any,
    custom: { purpose: "طلب تمويل" },
  });

  it("يجمع بيانات الموظف في مفاتيح مسطّحة", () => {
    expect(context["employee.name"]).toBe("أحمد العتيبي");
    expect(context["employee.department"]).toBe("المبيعات");
    expect(context["company.name"]).toBe("شركة مطعم معصوب حليب");
  });

  it("ينسّق الأجر بعملة المنشأة", () => {
    expect(context["salary.total"]).toBe("11,500.00 ر.س");
  });

  it("يقرأ الحقول الإضافية تحت custom.", () => {
    expect(context["custom.purpose"]).toBe("طلب تمويل");
  });
});
