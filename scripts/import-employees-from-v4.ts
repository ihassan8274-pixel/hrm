// استيراد آمن لأسماء ورواتب كشف v4 فقط.
// لا يُنشئ رقم هوية ولا آيبان ولا يلمس بيانات أخرى. الافتراضي معاينة فقط؛
// التنفيذ الفعلي يتطلب --commit. إعادة التشغيل لا تكرر الإدراج، ولا تغير
// راتباً أدخله المستخدم يدوياً إلا مع --sync-salaries.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = process.argv.find((a) => a.endsWith(".json")) || path.join(root, "data", "employees_names_salaries.json");
const commit = process.argv.includes("--commit");
const syncSalaries = process.argv.includes("--sync-salaries");
const previewPath = path.join(root, "data", "employees_import_preview.html");

interface ImportRow {
  name: string;
  basic_salary: number;
  sponsorship_type: "saudi" | "company_sponsored" | "leased";
  hire_month: number | null;
  hire_month_raw?: string | null;
}

const normalize = (value: unknown) =>
  String(value || "").replace(/[\u0640\u200c\u200d]/g, "").replace(/\s+/g, " ").trim();

const rows = (JSON.parse(fs.readFileSync(source, "utf8")) as ImportRow[])
  .map((r) => ({
    name: normalize(r.name),
    basic_salary: Number(r.basic_salary) || 0,
    sponsorship_type: (["saudi", "company_sponsored", "leased"] as const).includes(r.sponsorship_type)
      ? r.sponsorship_type
      : "company_sponsored",
    hire_month: Number.isInteger(Number(r.hire_month)) && Number(r.hire_month) >= 1 && Number(r.hire_month) <= 12
      ? Number(r.hire_month)
      : null,
  }))
  .filter((r) => r.name);

const categoryLabel: Record<string, string> = {
  saudi: "سعودي",
  company_sponsored: "كفالة شركة",
  leased: "مستأجر",
};
const monthLabel = (m: number | null) => (m ? String(m) : "—");
const money = (n: number) => n.toLocaleString("en-US");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

const totals = rows.reduce((acc, r) => {
  acc.total += r.basic_salary;
  acc[r.sponsorship_type] = (acc[r.sponsorship_type] || 0) + 1;
  return acc;
}, { total: 0 } as Record<string, number>);
const missingMonth = rows.filter((r) => !r.hire_month).length;
const zeroSalary = rows.filter((r) => !r.basic_salary);

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>معاينة استيراد الموظفين</title>
<style>
body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:#f6f8fb;color:#101828;margin:0;padding:28px}
.wrap{max-width:1100px;margin:auto;background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:24px;box-shadow:0 8px 30px #1018280d}
h1{margin:0 0 6px;font-size:22px}.note{color:#667085;font-size:13px;margin:0 0 18px}
.stat{display:inline-block;background:#ecfdf3;color:#067647;border-radius:10px;padding:8px 14px;margin:0 8px 8px 0;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px;border-bottom:1px solid #eaecf0;text-align:right}
th{background:#f9fafb;color:#475467}.warn{background:#fffaeb;color:#b54708;padding:10px 14px;border-radius:10px;margin:14px 0}
</style></head><body><div class="wrap">
<h1>معاينة استيراد الأسماء والرواتب — كشف v4</h1>
<p class="note">يُستورد الاسم والراتب الأساسي وفئة الكفالة وشهر التعيين فقط. لا تُستورد أرقام هوية أو آيبانات أو وظائف أو فروع. هذه معاينة قبل التنفيذ.</p>
<div><span class="stat">عدد الموظفين: ${rows.length}</span><span class="stat">إجمالي الرواتب الأساسية: ${money(totals.total)} ر.س</span>
${Object.entries(categoryLabel).map(([k, v]) => `<span class="stat">${v}: ${totals[k] || 0}</span>`).join("")}
<span class="stat">بلا شهر تعيين: ${missingMonth}</span></div>
${zeroSalary.length ? `<div class="warn">رواتب صفرية في الملف (تُستورد كما هي للمراجعة): ${zeroSalary.map((r) => esc(r.name)).join("، ")}</div>` : ""}
<table><thead><tr><th>#</th><th>الاسم</th><th>الفئة</th><th>شهر التعيين</th><th>الراتب الأساسي</th></tr></thead><tbody>
${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${categoryLabel[r.sponsorship_type]}</td><td>${monthLabel(r.hire_month)}</td><td>${money(r.basic_salary)}</td></tr>`).join("")}
</tbody></table></div></body></html>`;
fs.mkdirSync(path.dirname(previewPath), { recursive: true });
fs.writeFileSync(previewPath, html, "utf8");

console.log(`Preview: ${previewPath}`);
console.log(`Rows: ${rows.length} | salaries: ${money(totals.total)} | missing hire month: ${missingMonth} | zero salaries: ${zeroSalary.length}`);
for (const [key, label] of Object.entries(categoryLabel)) console.log(`  ${label}: ${totals[key] || 0}`);
if (zeroSalary.length) console.log(`  Zero salary names: ${zeroSalary.map((r) => r.name).join(" | ")}`);

if (!commit) {
  console.log("PREVIEW ONLY — أعد التشغيل مع --commit للتنفيذ.");
  process.exit(0);
}

const { default: db, transaction } = await import("../server/config/postgres.ts");

const result = await transaction(async () => {
  const entity = await db.prepare("SELECT id FROM entities ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  if (!entity) throw new Error("لا يوجد كيان في قاعدة البيانات — استورد الكيانات أولاً");

  const existing = await db.prepare("SELECT id, name, basic_salary FROM employees").all() as Array<{ id: number; name: string; basic_salary: number }>;
  const byName = new Map(existing.map((e) => [normalize(e.name), e]));
  let inserted = 0, updated = 0, skipped = 0;

  for (const row of rows) {
    const found = byName.get(row.name);
    const isSaudi = row.sponsorship_type === "saudi" ? 1 : 0;
    const nationality = isSaudi ? "سعودي" : null;
    if (!found) {
      await db.prepare(
        `INSERT INTO employees
          (name, basic_salary, sponsorship_type, hire_month, is_saudi, nationality, status, entity_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      ).run(row.name, row.basic_salary, row.sponsorship_type, row.hire_month, isSaudi, nationality, entity.id);
      inserted++;
    } else if (syncSalaries) {
      await db.prepare(
        `UPDATE employees
         SET basic_salary = ?, sponsorship_type = ?, hire_month = ?, is_saudi = ?, nationality = ?
         WHERE id = ?`,
      ).run(row.basic_salary, row.sponsorship_type, row.hire_month, isSaudi, nationality, found.id);
      updated++;
    } else {
      skipped++;
    }
  }
  return { inserted, updated, skipped };
})();

console.log(`Imported: inserted=${result.inserted} updated=${result.updated} skipped_existing=${result.skipped}`);
