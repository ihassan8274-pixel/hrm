// extracts the v4 payroll snapshot embedded in RBAC_PROTOTYPE.html and writes
// the minimal import payload: name + basic salary + classification + hire month.
// no identity numbers, bank details or job/branch fields are exported.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const htmlPath = process.argv[2] || path.join(root, "RBAC_PROTOTYPE.html");
const outPath = process.argv[3] || path.join(root, "data", "employees_names_salaries.json");

const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(/const V4E\s*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error(`V4E snapshot not found in ${htmlPath}`);
const rows = JSON.parse(match[1]);

const monthNames = {
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, "أبريل": 4, مايو: 5, يونيو: 6,
  يوليو: 7, اغسطس: 8, "أغسطس": 8, سبتمبر: 9, اكتوبر: 10, "أكتوبر": 10,
  نوفمبر: 11, ديسمبر: 12,
};

const normalize = (value) => String(value || "").replace(/[\u0640\u200c\u200d]/g, "").replace(/\s+/g, " ").trim();

const employees = rows.map((row) => {
  const rawMonth = normalize(row[10]);
  return {
    name: normalize(row[0]),
    basic_salary: Number(row[4]) || 0,
    sponsorship_type: ["saudi", "company_sponsored", "leased"].includes(row[1]) ? row[1] : "company_sponsored",
    hire_month: monthNames[rawMonth] || null,
    hire_month_raw: rawMonth || null,
  };
});

const problems = [];
const seen = new Map();
for (const emp of employees) {
  if (!emp.name) problems.push("row without name");
  if (!emp.basic_salary) problems.push(`zero salary: ${emp.name}`);
  const key = emp.name;
  if (seen.has(key)) problems.push(`duplicate name: ${emp.name}`);
  seen.set(key, true);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(employees, null, 2) + "\n", "utf8");
console.log(`Exported ${employees.length} employees to ${outPath}`);
console.log(`Missing hire month: ${employees.filter((e) => !e.hire_month).length}`);
if (problems.length) {
  console.log("Warnings:");
  for (const p of problems) console.log(` - ${p}`);
}
