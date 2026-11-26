// إنهاء الخدمة: نقطة واحدة تُوقف الموظف وتُخرجه من مسيرات الرواتب القادمة.
//
// قبل هذا الملف كان إخلاء الطرف وحاسبة نهاية الخدمة يكتبان في جداولهما فقط،
// بينما مولّد المسير يقرأ employees.status. النتيجة كانت موظفاً منتهية خدمته
// ما زال يُضاف لكل مسير. كل مسار إنهاء يستدعي هذه الدالة حتى لا يحدث انحراف.

import db, { logAction, createNotification } from "../config/postgres";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface EndServiceInput {
  employeeId: number;
  /** آخر يوم عمل فعلي. يُترك فارغاً فيُستخدم تاريخ اليوم. */
  lastWorkingDay?: string | null;
  /** سبب الإنهاء: resignation / employer_termination / art77_termination ... */
  reason?: string | null;
  /** من أين جاء القرار، للسجل فقط. */
  source: "employee_screen" | "exit_clearance";
}

export interface EndServiceResult {
  employee_id: number;
  employee_name: string;
  end_service_date: string;
  end_service_reason: string | null;
  already_ended: boolean;
  accounts_disabled: number;
}

/**
 * يُنهي خدمة الموظف ويُوقف حساباته المرتبطة به. العملية متكرّرة بلا أثر مضاعف:
 * إعادة استدعائها (مثلاً عند تحديث إخلاء طرف مكتمل) لا تضيف سجلاً ولا تغيّر
 * تاريخ الإنهاء الأول.
 */
export async function endEmployeeService(input: EndServiceInput): Promise<EndServiceResult> {
  const id = Number(input.employeeId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("معرّف الموظف غير صالح");

  const employee = (await db.prepare("SELECT id, name, status, end_service_date FROM employees WHERE id = ?").get(id)) as
    | { id: number; name: string; status: string | null; end_service_date: string | null }
    | undefined;
  if (!employee) throw new Error("الموظف غير موجود");

  const lastWorkingDay = input.lastWorkingDay && DATE_RE.test(String(input.lastWorkingDay))
    ? String(input.lastWorkingDay)
    : new Date().toISOString().split("T")[0];
  const reason = input.reason ? String(input.reason).slice(0, 120) : null;
  const alreadyEnded = Boolean(employee.status && employee.status !== "active");
  const effectiveDate = employee.end_service_date || lastWorkingDay;

  const result = await db.transaction(async () => {
    await db.prepare(
      "UPDATE employees SET status = 'terminated', end_service_date = ?, end_service_reason = COALESCE(?, end_service_reason) WHERE id = ?"
    ).run(effectiveDate, reason, id);
    // إنهاء الخدمة يعني انتهاء الصلاحية أيضاً؛ الدخول يشترط status='active'.
    const accounts = await db.prepare(
      "UPDATE users SET status = 'inactive' WHERE employee_id = ? AND status = 'active'"
    ).run(id);
    return Number((accounts as any)?.changes || 0);
  })();

  if (!alreadyEnded) {
    await logAction("terminate", "employee", id, `Ended service for ${employee.name} on ${effectiveDate} (${input.source})`);
    await createNotification(
      "إنهاء خدمة موظف",
      `تم إنهاء خدمة ${employee.name} اعتباراً من ${effectiveDate}، واستُبعد من مسيرات الرواتب القادمة`,
      "info",
      { employeeId: id }
    );
  }

  return {
    employee_id: id,
    employee_name: employee.name,
    end_service_date: effectiveDate,
    end_service_reason: reason,
    already_ended: alreadyEnded,
    accounts_disabled: result,
  };
}
