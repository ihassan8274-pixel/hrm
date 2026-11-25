// مركز النماذج والطباعة.
//
// ثلاث تبويبات في مكان واحد:
//   1) القوالب        — اختيار قالب وإصداره لموظف (أو لدفعة موظفين).
//   2) المستندات     — أرشيف ما صدر فعلاً، مع إعادة طباعته.
//   3) إدارة القوالب  — تخصيص نصوص القوالب (للمسؤول ومدير الموارد البشرية).
//
// المعاينة تُبنى على نفس محرّك الحقول الذي يستعمله الخادم (src/lib/print/
// placeholders.ts)، فما يراه المستخدم على الورق هو ما يُحفظ في الأرشيف.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileText,
  Layers,
  Printer,
  Save,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { DocumentPaper } from "../lib/print/document-paper";
import type { LetterheadData } from "../lib/print/letterhead";
import { exportPaperToPdf, triggerPrint } from "../lib/print/print-actions";
import { extractPlaceholders } from "../lib/print/placeholders";

interface FormTemplate {
  id: number;
  template_key: string;
  name_ar: string;
  name_en?: string;
  category: string;
  subject_label?: string;
  body_ar: string;
  is_system: number;
  is_active: number;
  placeholders?: string[];
}

interface IssuedDocument {
  id: number;
  template_key: string;
  title: string;
  employee_id?: number;
  employee_name?: string;
  reference_number?: string;
  status?: string;
  issued_at?: string;
  content?: string;
}

interface EmployeeOption {
  id: number;
  name: string;
  position?: string;
  branch_name?: string;
  department_name?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  letters: "خطابات",
  certificates: "شهادات",
  warnings: "إنذارات",
  contracts: "عقود",
  reports: "إقرارات وتقارير",
  finance: "سندات مالية",
  forms: "نماذج إدارية",
};

/** تسميات عربية لحقول إضافية شائعة، مع fallback إلى اسم الحقل نفسه. */
const CUSTOM_FIELD_LABELS: Record<string, string> = {
  purpose: "الغرض",
  incident_date: "تاريخ الواقعة",
  violation: "وصف المخالفة",
  clause: "البند",
  previous_warning_date: "تاريخ الإنذار السابق",
  to_branch: "الفرع المنقول إليه",
  effective_date: "تاريخ السريان",
  leave_type: "نوع الإجازة",
  days: "عدد الأيام",
  start_date: "تاريخ البداية",
  end_date: "تاريخ النهاية",
  return_date: "تاريخ العودة",
  gosi_number: "رقم التأمينات",
  voucher_number: "رقم السند",
  loan_amount: "قيمة السلفة (ر.س)",
  amount_in_words: "المبلغ كتابةً",
  installment: "القسط الشهري (ر.س)",
  approval_reference: "مرجع الاعتماد",

  // استمارة طلب التوظيف
  applicant_name: "اسم المتقدم",
  national_id: "رقم الهوية/الإقامة",
  nationality: "الجنسية",
  birth_date: "تاريخ الميلاد",
  mobile: "الهاتف الجوال",
  email: "البريد الإلكتروني",
  address: "العنوان",
  position_applied: "المسمى المتقدم له",
  available_date: "تاريخ التوفر",
  qualification: "المؤهل",
  university: "الجامعة/المعهد",
  graduation_year: "سنة التخرج",
  experience_years: "سنوات الخبرة",
  previous_employer: "جهة العمل السابقة",
  expected_salary: "الراتب المتوقع (ر.س)",

  // طلب التعيين الداخلي
  request_number: "رقم الطلب",
  request_date: "تاريخ الطلب",
  requesting_manager: "مقدّم الطلب",
  branch: "الفرع",
  department: "الإدارة",
  position: "المسمى الوظيفي",
  headcount: "عدد الوظائف",
  justification: "مبرر الطلب",
  candidate_name: "اسم المرشح",
  candidate_national_id: "رقم هوية المرشح",
  contract_type: "نوع العقد",
  salary: "الراتب الأساسي (ر.س)",
  housing_allowance: "بدل السكن (ر.س)",
  transport_allowance: "بدل النقل (ر.س)",
  total_salary: "الإجمالي الشهري (ر.س)",

  // الجزاء الإداري
  decision_number: "رقم القرار",
  investigation_date: "تاريخ التحقيق",
  witnesses: "الشهود والمراجع",
  employee_statement: "أقوال الموظف",
  penalty_type: "نوع الجزاء",
  penalty_days: "مدة الجزاء (أيام)",
  deduction_amount: "الخصم النظامي (ر.س)",
  legal_basis: "السند النظامي",
  previous_actions: "الإجراءات السابقة",
  corrective_plan: "خطة التصحيح",
  review_date: "تاريخ المراجعة",
  prepared_by: "أعدّ القرار",
  approved_by: "اعتمد القرار",

  // التقييم السنوي
  evaluation_period: "فترة التقييم",
  evaluation_date: "تاريخ التقييم",
  evaluator_name: "اسم المقيّم",
  evaluator_position: "صفة المقيّم",
  attendance_score: "الالتزام والحضور (من 5)",
  attendance_note: "ملاحظات الالتزام والحضور",
  quality_score: "جودة الأداء (من 5)",
  quality_note: "ملاحظات جودة الأداء",
  productivity_score: "الإنتاجية (من 5)",
  productivity_note: "ملاحظات الإنتاجية",
  teamwork_score: "العمل الجماعي والقيادة (من 5)",
  teamwork_note: "ملاحظات العمل الجماعي",
  safety_score: "السلامة وإجراءات الغذاء (من 5)",
  safety_note: "ملاحظات السلامة",
  total_score: "الدرجة الكلية (من 25)",
  rating: "التقدير",
  strengths: "نقاط القوة",
  improvement_areas: "مجالات التحسين",
  training_needs: "الاحتياج التدريبي",
  recommendation: "التوصية",
  employee_comments: "ملاحظات الموظف",
};

const DATE_FIELD_HINTS = ["date", "deadline", "until"];
const NUMBER_FIELD_HINTS = ["days", "amount", "salary", "allowance", "score", "year", "count"];

function fieldKind(key: string): "date" | "number" | "text" {
  const lower = key.toLowerCase();
  if (DATE_FIELD_HINTS.some((hint) => lower.includes(hint))) return "date";
  if (NUMBER_FIELD_HINTS.some((hint) => lower.includes(hint))) return "number";
  return "text";
}

function fieldLabel(key: string): string {
  if (CUSTOM_FIELD_LABELS[key]) return CUSTOM_FIELD_LABELS[key];
  return key.replace(/_/g, " ");
}

export const FormsCenterView: React.FC = () => {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [company, setCompany] = useState<LetterheadData>({});
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);

  const [tab, setTab] = useState<"templates" | "documents" | "manage">("templates");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  // حالة الإصدار
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [month, setMonth] = useState<number | "">(new Date().getMonth() + 1);
  const [year, setYear] = useState<number | "">(new Date().getFullYear());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ content: string; unresolved: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // الأرشيف
  const [viewing, setViewing] = useState<IssuedDocument | null>(null);
  const [archiveFilter, setArchiveFilter] = useState("");

  // إدارة القوالب
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [draft, setDraft] = useState({ name_ar: "", category: "letters", subject_label: "", body_ar: "" });

  const paperRef = useRef<HTMLDivElement>(null);
  const archivePaperRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------ تحميل البيانات

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/forms/templates");
      if (!response.ok) return;
      setTemplates((await response.json()) ?? []);
    } catch (error) {
      console.error("forms: failed to load templates", error);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const response = await fetch("/api/employees");
      if (!response.ok) return;
      const rows = (await response.json()) ?? [];
      setEmployees(
        rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          position: row.position,
          branch_name: row.branch_name,
          department_name: row.department_name,
        })),
      );
    } catch (error) {
      console.error("forms: failed to load employees", error);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/forms/documents");
      if (!response.ok) return;
      setDocuments((await response.json()) ?? []);
    } catch (error) {
      console.error("forms: failed to load documents", error);
    }
  }, []);

  const loadLetterhead = useCallback(async () => {
    try {
      const response = await fetch("/api/forms/letterhead");
      if (!response.ok) return;
      const data = await response.json();
      setCompany(data.company ?? {});
    } catch (error) {
      console.error("forms: failed to load letterhead", error);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadEmployees();
    loadDocuments();
    loadLetterhead();
  }, [loadTemplates, loadEmployees, loadDocuments, loadLetterhead]);

  // --------------------------------------------------------------- المعاينة

  const customFields = useMemo(() => {
    if (!selectedTemplate) return [] as string[];
    const keys = extractPlaceholders(selectedTemplate.body_ar)
      .filter((key) => key.startsWith("custom."))
      .map((key) => key.slice("custom.".length));
    return Array.from(new Set(keys));
  }, [selectedTemplate]);

  const refreshPreview = useCallback(async () => {
    if (!selectedTemplate) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/forms/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          employee_id: selectedEmployeeId || undefined,
          fields,
          month: month || undefined,
          year: year || undefined,
        }),
      });
      if (!response.ok) {
        setPreview(null);
        return;
      }
      const data = await response.json();
      setPreview({ content: data.content ?? "", unresolved: data.unresolved ?? [] });
    } catch (error) {
      console.error("forms: failed to render preview", error);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedTemplate, selectedEmployeeId, fields, month, year]);

  useEffect(() => {
    const timer = window.setTimeout(refreshPreview, 250);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  // اختيار قالب يصفّر بيانات الحقول الخاصة، حتى لا تسرّب قيم قالب إلى آخر.
  const chooseTemplate = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setFields({});
    setPreview(null);
    setStatus(null);
  };

  // ------------------------------------------------------------------ التصفية

  const filteredTemplates = useMemo(() => {
    const term = search.trim();
    return templates.filter((template) => {
      if (category !== "all" && template.category !== category) return false;
      if (!term) return true;
      return (
        template.name_ar.includes(term) ||
        (template.name_en || "").toLowerCase().includes(term.toLowerCase())
      );
    });
  }, [templates, category, search]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, FormTemplate[]>();
    for (const template of filteredTemplates) {
      const list = groups.get(template.category) ?? [];
      list.push(template);
      groups.set(template.category, list);
    }
    return Array.from(groups.entries());
  }, [filteredTemplates]);

  const filteredDocuments = useMemo(() => {
    const term = archiveFilter.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter(
      (document) =>
        (document.title || "").toLowerCase().includes(term) ||
        (document.employee_name || "").toLowerCase().includes(term) ||
        (document.reference_number || "").toLowerCase().includes(term),
    );
  }, [documents, archiveFilter]);

  // ------------------------------------------------------------------ الإجراءات

  const handlePrint = async () => {
    await triggerPrint();
  };

  const handlePdf = async (element: HTMLElement | null, filename: string) => {
    if (!element) return;
    setStatus({ type: "ok", text: "جارٍ تجهيز ملف PDF…" });
    try {
      await exportPaperToPdf(element, { filename });
      setStatus({ type: "ok", text: "تم حفظ ملف PDF." });
    } catch (error) {
      console.error("forms: pdf export failed", error);
      setStatus({ type: "err", text: "تعذّر تجهيز ملف PDF." });
    }
  };

  const handleIssue = async () => {
    if (!selectedTemplate) return;
    if (!selectedEmployeeId) {
      setStatus({ type: "err", text: "اختر الموظف أولاً." });
      return;
    }
    try {
      const response = await fetch("/api/forms/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          employee_id: selectedEmployeeId,
          fields,
          month: month || undefined,
          year: year || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setStatus({ type: "err", text: error.error || "تعذّر إصدار المستند." });
        return;
      }
      const data = await response.json();
      setStatus({ type: "ok", text: `تم إصدار المستند — المرجع ${data.reference_number}` });
      loadDocuments();
    } catch (error) {
      console.error("forms: issue failed", error);
      setStatus({ type: "err", text: "تعذّر إصدار المستند." });
    }
  };

  const handleBatch = async () => {
    if (!selectedTemplate || selectedEmployeeIds.length === 0) {
      setStatus({ type: "err", text: "اختر موظفاً واحداً على الأقل." });
      return;
    }
    try {
      const response = await fetch("/api/forms/documents/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          employee_ids: selectedEmployeeIds,
          fields,
          month: month || undefined,
          year: year || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setStatus({ type: "err", text: error.error || "تعذّر إصدار المستندات." });
        return;
      }
      const data = await response.json();
      const refused = data.refused?.length ?? 0;
      setStatus({
        type: "ok",
        text: `تم إصدار ${data.issued?.length ?? 0} مستند${refused ? ` — وتُخطّي ${refused} خارج نطاق صلاحياتك` : ""}.`,
      });
      loadDocuments();
    } catch (error) {
      console.error("forms: batch issue failed", error);
      setStatus({ type: "err", text: "تعذّر إصدار المستندات." });
    }
  };

  const openDocument = async (document: IssuedDocument) => {
    try {
      const response = await fetch(`/api/forms/documents/${document.id}`);
      if (!response.ok) return;
      setViewing(await response.json());
    } catch (error) {
      console.error("forms: failed to load document", error);
    }
  };

  // ------------------------------------------------------- إدارة القوالب

  const startEditing = (template: FormTemplate) => {
    setEditing(template);
    setDraft({
      name_ar: template.name_ar,
      category: template.category,
      subject_label: template.subject_label || "",
      body_ar: template.body_ar,
    });
  };

  const saveTemplate = async () => {
    try {
      const response = await fetch(
        editing ? `/api/forms/templates/${editing.id}` : "/api/forms/templates",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setStatus({ type: "err", text: error.error || "تعذّر حفظ القالب." });
        return;
      }
      setEditing(null);
      setStatus({ type: "ok", text: "تم حفظ القالب." });
      loadTemplates();
    } catch (error) {
      console.error("forms: failed to save template", error);
      setStatus({ type: "err", text: "تعذّر حفظ القالب." });
    }
  };

  const deleteTemplate = async (template: FormTemplate) => {
    if (!window.confirm(`حذف القالب «${template.name_ar}»؟`)) return;
    try {
      const response = await fetch(`/api/forms/templates/${template.id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setStatus({ type: "err", text: error.error || "تعذّر حذف القالب." });
        return;
      }
      setStatus({ type: "ok", text: "تم حذف القالب." });
      loadTemplates();
    } catch (error) {
      console.error("forms: failed to delete template", error);
      setStatus({ type: "err", text: "تعذّر حذف القالب." });
    }
  };

  const toggleEmployee = (id: number) => {
    setSelectedEmployeeIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const previewParagraphs = (content: string) =>
    content
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block, index) => (
        <p key={index} className="print-line">
          {block}
        </p>
      ));

  // ------------------------------------------------------------------ العرض

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <div className="no-print bg-gradient-to-l from-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Printer className="w-6 h-6" />
              مركز النماذج والطباعة
            </h1>
            <p className="text-emerald-50 text-sm mt-1">
              قوالب رسمية موحّدة — ترويسة المنشأة، معاينة A4، طباعة وحفظ PDF، وأرشيف لكل مستند صادر.
            </p>
          </div>
          <div className="flex gap-3 text-center">
            <div className="bg-white/15 rounded-xl px-4 py-2">
              <div className="text-2xl font-black">{templates.length}</div>
              <div className="text-xs opacity-90">قالب</div>
            </div>
            <div className="bg-white/15 rounded-xl px-4 py-2">
              <div className="text-2xl font-black">{documents.length}</div>
              <div className="text-xs opacity-90">مستند صادر</div>
            </div>
          </div>
        </div>
      </div>

      {status ? (
        <div
          className={`no-print flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            status.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {status.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {status.text}
        </div>
      ) : null}

      {/* التبويبات */}
      <div className="no-print flex gap-2 border-b border-slate-200">
        {(
          [
            { id: "templates", label: "القوالب والإصدار", icon: Layers },
            { id: "documents", label: "الأرشيف", icon: FileText },
            { id: "manage", label: "إدارة القوالب", icon: Edit3 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-sm transition-colors ${
              tab === item.id
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- القوالب */}
      {tab === "templates" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-6">
          <div className="no-print space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث في القوالب…"
                  className="w-full pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <button
                onClick={() => setCategory("all")}
                className={`px-3 py-2 rounded-xl text-sm font-bold ${
                  category === "all" ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
                }`}
              >
                الكل
              </button>
              {Object.keys(CATEGORY_LABELS).map((key) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold ${
                    category === key
                      ? "bg-emerald-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600"
                  }`}
                >
                  {CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>

            {groupedTemplates.map(([group, items]) => (
              <div key={group} className="space-y-3">
                <h2 className="text-sm font-black text-slate-500">
                  {CATEGORY_LABELS[group] || group}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => chooseTemplate(template)}
                      className={`text-right rounded-2xl border p-4 transition-all ${
                        selectedTemplate?.id === template.id
                          ? "border-emerald-500 bg-emerald-50 shadow"
                          : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-slate-800">{template.name_ar}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{template.name_en}</div>
                        </div>
                        {template.is_system ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            مدمج
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-2">
                        {extractPlaceholders(template.body_ar).length} حقل قابل للتعبئة
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {filteredTemplates.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">لا توجد قوالب مطابقة.</div>
            ) : null}
          </div>

          {/* لوحة الإصدار */}
          <div className="no-print space-y-4">
            {selectedTemplate ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">إصدار مستند</div>
                    <div className="font-black text-slate-800">{selectedTemplate.name_ar}</div>
                  </div>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    إغلاق
                  </button>
                </div>

                <label className="block">
                  <span className="text-xs font-bold text-slate-600">الموظف</span>
                  <select
                    value={selectedEmployeeId}
                    onChange={(event) =>
                      setSelectedEmployeeId(event.target.value ? Number(event.target.value) : "")
                    }
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">— اختر الموظف —</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                        {employee.position ? ` — ${employee.position}` : ""}
                        {employee.branch_name ? ` (${employee.branch_name})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">الشهر (لأرقام الراتب)</span>
                    <select
                      value={month}
                      onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : "")}
                      className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    >
                      <option value="">—</option>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">السنة</span>
                    <input
                      type="number"
                      value={year}
                      onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                      className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                </div>

                {customFields.length > 0 ? (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <div className="text-xs font-bold text-slate-600">بيانات المستند</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {customFields.map((key) => (
                        <label key={key} className="block">
                          <span className="text-xs text-slate-500">{fieldLabel(key)}</span>
                          <input
                            type={fieldKind(key) === "date" ? "date" : fieldKind(key) === "number" ? "number" : "text"}
                            value={fields[key] ?? ""}
                            onChange={(event) =>
                              setFields((current) => ({ ...current, [key]: event.target.value }))
                            }
                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handlePrint}
                    disabled={!preview}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    <Printer className="w-4 h-4" />
                    طباعة
                  </button>
                  <button
                    onClick={() => handlePdf(paperRef.current, `${selectedTemplate.template_key}.pdf`)}
                    disabled={!preview}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold disabled:opacity-40"
                  >
                    <Save className="w-4 h-4" />
                    حفظ PDF
                  </button>
                  <button
                    onClick={handleIssue}
                    disabled={!selectedEmployeeId}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    <FileText className="w-4 h-4" />
                    إصدار وأرشفة
                  </button>
                </div>

                {/* الإصدار الجماعي */}
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setBatchMode((current) => !current)}
                    className="flex items-center gap-2 text-xs font-bold text-slate-600"
                  >
                    <Users className="w-4 h-4" />
                    إصدار جماعي لعدة موظفين
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${batchMode ? "rotate-180" : ""}`}
                    />
                  </button>
                  {batchMode ? (
                    <div className="mt-3 space-y-2">
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {employees.map((employee) => (
                          <label
                            key={employee.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedEmployeeIds.includes(employee.id)}
                              onChange={() => toggleEmployee(employee.id)}
                              className="accent-emerald-600"
                            />
                            <span className="text-slate-700">
                              {employee.name}
                              {employee.branch_name ? ` — ${employee.branch_name}` : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={handleBatch}
                        className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold"
                      >
                        إصدار {selectedEmployeeIds.length || ""} مستند
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
                اختر قالباً من القائمة لبدء الإصدار.
              </div>
            )}

            {preview && preview.unresolved.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs leading-relaxed">
                <div className="font-black mb-1">حقول لم تُملأ بعد</div>
                {preview.unresolved.join("، ")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- الأرشيف */}
      {tab === "documents" ? (
        <div className="no-print space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={archiveFilter}
              onChange={(event) => setArchiveFilter(event.target.value)}
              placeholder="ابحث بالرقم أو اسم الموظف…"
              className="w-full pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">المستند</th>
                  <th className="text-right px-4 py-3 font-bold">الموظف</th>
                  <th className="text-right px-4 py-3 font-bold">المرجع</th>
                  <th className="text-right px-4 py-3 font-bold">تاريخ الإصدار</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocuments.map((document) => (
                  <tr key={document.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-right text-slate-800 font-semibold">{document.title}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{document.employee_name || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                      {document.reference_number}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {document.issued_at ? String(document.issued_at).slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <button
                        onClick={() => openDocument(document)}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                      لا توجد مستندات صادرة بعد.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ إدارة القوالب */}
      {tab === "manage" ? (
        <div className="no-print space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditing(null);
                setDraft({ name_ar: "", category: "letters", subject_label: "", body_ar: "" });
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold"
            >
              <FileText className="w-4 h-4" />
              قالب جديد
            </button>
          </div>

          {editing !== null || draft.body_ar ? (
            <div className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-600">اسم القالب</span>
                  <input
                    value={draft.name_ar}
                    onChange={(event) => setDraft({ ...draft, name_ar: event.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">التصنيف</span>
                  <select
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">نص القالب</span>
                <textarea
                  value={draft.body_ar}
                  onChange={(event) => setDraft({ ...draft, body_ar: event.target.value })}
                  rows={12}
                  dir="rtl"
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-7 outline-none focus:border-emerald-500 font-mono"
                />
              </label>
              <div className="text-xs text-slate-500">
                الحقول المتاحة:{" "}
                {Array.from(
                  new Set([
                    "employee.name",
                    "employee.position",
                    "employee.department",
                    "employee.branch",
                    "employee.national_id",
                    "employee.join_date",
                    "company.name",
                    "company.cr_number",
                    "salary.total",
                    "date.today",
                    ...extractPlaceholders(draft.body_ar),
                  ]),
                ).join("، ")}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveTemplate}
                  disabled={!draft.name_ar || !draft.body_ar}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
                >
                  حفظ القالب
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setDraft({ name_ar: "", category: "letters", subject_label: "", body_ar: "" });
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-sm font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">القالب</th>
                  <th className="text-right px-4 py-3 font-bold">التصنيف</th>
                  <th className="text-right px-4 py-3 font-bold">النوع</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{template.name_ar}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {CATEGORY_LABELS[template.category] || template.category}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {template.is_system ? "مدمج" : "مخصص"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEditing(template)}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          تعديل
                        </button>
                        {!template.is_system ? (
                          <button
                            onClick={() => deleteTemplate(template)}
                            className="text-xs font-bold text-rose-600 hover:underline"
                          >
                            حذف
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------- معاينة الطباعة (A4) */}
      {/* الورقة الظاهرة هي نفسها التي تُطبع: كل عناصر الواجهة حولها تحمل
          الصنف no-print، وورقة الطباعة تُفتح من حاويتها في وضع الطباعة. */}
      {selectedTemplate && preview ? (
        // أثناء عرض مستند مؤرشف تُخفى معاينة الإصدار حتى لا تُطبع ورقةان.
        <div className={viewing ? "no-print" : undefined}>
          <div className="no-print flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">معاينة الطباعة (A4)</span>
            {previewLoading ? <span className="text-xs text-slate-400">جارٍ التحديث…</span> : null}
          </div>
          <div ref={paperRef} className="print-paper-wrap overflow-auto bg-slate-100 p-4 rounded-2xl">
            <DocumentPaper
              company={company}
              title={selectedTemplate.name_ar}
              signatory="المدير التنفيذي"
            >
              {previewParagraphs(preview.content)}
            </DocumentPaper>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ عرض مستند مؤرشف */}
      {viewing ? (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:bg-white print:static print:p-0">
          <div className="bg-slate-100 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden print:max-h-none print:overflow-visible print:bg-white print:rounded-none">
            <div className="no-print flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200">
              <div>
                <div className="font-black text-slate-800">{viewing.title}</div>
                <div className="text-xs text-slate-500">
                  {viewing.employee_name} — {viewing.reference_number}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePdf(archivePaperRef.current, `${viewing.reference_number || "document"}.pdf`)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold"
                >
                  <Save className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  onClick={async () => {
                    await triggerPrint();
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  طباعة
                </button>
                <button
                  onClick={() => setViewing(null)}
                  className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 print:overflow-visible print:p-0">
              <div ref={archivePaperRef}>
                <DocumentPaper
                  company={company}
                  title={viewing.title}
                  reference={viewing.reference_number}
                  signatory="المدير التنفيذي"
                >
                  {viewing.content ? previewParagraphs(viewing.content) : null}
                </DocumentPaper>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FormsCenterView;
