import db from "../../config/postgres";
import { scopeFilter, type OrganizationScope } from "../../lib/organization-scope";
import { isGosiExempt, isInsuranceCovered } from "../../lib/country-rules";

export interface PreflightIssue {
  severity: "block" | "warning";
  code: string;
  employee_id: number;
  employee_name: string;
  message: string;
}

export interface PreflightReport {
  month: number;
  year: number;
  checked: number;
  existing: number;
  ready: boolean;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
}

/**
 * Read-only readiness report for a payroll period.
 *
 * Blockers stop generation: without them the register would contain rows that
 * cannot be paid (zero salary, no bank details for a transfer, or an invalid
 * cash split). Warnings do not stop it, but they are recorded so an operator
 * can see what was excluded or left incomplete before approving the period.
 *
 * Only employees who would actually get a new row are checked; rows that
 * already exist are skipped by the generator and must be fixed through the
 * locked-period correction screen instead.
 */
export async function runPayrollPreflight(
  month: number,
  year: number,
  scope: OrganizationScope,
): Promise<PreflightReport> {
  const employees = (await db.prepare(`
    SELECT e.* FROM employees e
    WHERE (? IS NULL OR e.entity_id = ?)
      AND (? IS NULL OR e.branch_id = ?)
      AND (? IS NULL OR e.id = ?)
      -- نفس فلتر المولّد: الموظف المنتهية خدمته لا يعطل المسير ولا يُحتسب فيه
      AND (e.status IS NULL OR e.status = 'active')
  `).all(...scopeFilter(scope))) as any[];

  const blockers: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  let checked = 0;
  let existing = 0;

  for (const emp of employees) {
    const existingRow = await db.prepare(
      "SELECT id FROM payroll WHERE employee_id = ? AND month = ? AND year = ?"
    ).get(emp.id, month, year);
    if (existingRow) { existing++; continue; }
    checked++;

    const push = (severity: "block" | "warning", code: string, message: string) =>
      (severity === "block" ? blockers : warnings).push({
        severity, code, employee_id: emp.id, employee_name: emp.name, message,
      });

    const method = emp.payment_method || "bank";
    const basic = Number(emp.basic_salary || 0);
    const pct = Number(emp.cash_percentage || 0);

    if (basic <= 0) push("block", "BASIC_SALARY_ZERO", "الراتب الأساسي صفر — أدخل الراتب الصحيح قبل إنشاء المسير");
    if (method !== "cash" && !(emp.saudi_iban || emp.bank_account)) {
      push("block", "BANK_ACCOUNT_MISSING", "طريقة الدفع تحويل بنكي أو مختلط دون IBAN/رقم حساب");
    }
    if (method === "split" && (pct <= 0 || pct >= 100)) {
      push("block", "CASH_PERCENT_INVALID", "نسبة النقد في الدفع المختلط يجب أن تكون بين 1 و 99");
    }
    if (isInsuranceCovered(emp) && !isGosiExempt(emp) && !emp.gosi_number) {
      push("warning", "GOSI_NUMBER_MISSING", "رقم التأمينات مفقود لموظف مشمول بالتأمين");
    }
    if (!emp.hire_date && Number(emp.hire_month || 0) === 1) {
      push("warning", "HIRE_DATE_DEFAULT", "تاريخ التعيين غير مدخل — سيُستخدم شهر افتراضي في تنبيه الزيادة");
    }
    if (Number(emp.housing_allowance || 0) === 0 || Number(emp.transport_allowance || 0) === 0) {
      push("warning", "ALLOWANCES_ZERO", "بدل السكن أو النقل صفر — تحقق من عقد الموظف");
    }
    const attendance = await db.prepare(
      "SELECT id FROM attendance WHERE employee_id = ? AND month = ? AND year = ?"
    ).get(emp.id, month, year);
    if (!attendance) {
      push("warning", "ATTENDANCE_MISSING", "لا يوجد ملخص حضور لهذه الفترة — سيُحتسب صفر غياب");
    }
  }

  // Approved reimbursements are deliberately NOT added to salary (they are not
  // taxable income). Surface them here instead of silently dropping them.
  const periodKey = `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
  const claims = (await db.prepare(`
    SELECT ec.employee_id, COUNT(*) AS c, COALESCE(SUM(ec.amount), 0) AS total
    FROM expense_claims ec
    JOIN employees e ON ec.employee_id = e.id
    WHERE ec.status = 'approved' AND ec.payment_status = 'unpaid'
      AND substr(CAST(ec.claim_date AS TEXT), 1, 7) = ?
      AND (? IS NULL OR e.entity_id = ?)
      AND (? IS NULL OR e.branch_id = ?)
      AND (? IS NULL OR e.id = ?)
      AND (e.status IS NULL OR e.status = 'active')
    GROUP BY ec.employee_id
  `).all(periodKey, ...scopeFilter(scope))) as any[];
  for (const claim of claims) {
    const name = employees.find((e) => e.id === claim.employee_id)?.name || String(claim.employee_id);
    warnings.push({
      severity: "warning",
      code: "EXPENSE_CLAIMS_UNPAID",
      employee_id: claim.employee_id,
      employee_name: name,
      message: `${claim.c} مطالبة معتمدة غير مسددة بقيمة ${Number(claim.total).toLocaleString()} ر.س — تُسدَّد خارج المسير ولا تُضاف للراتب`,
    });
  }

  return { month, year, checked, existing, ready: blockers.length === 0, blockers, warnings };
}
