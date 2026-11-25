/**
 * Overtime has two possible sources: hours summarised from attendance logs, and
 * an explicitly approved overtime record which already books a bonus line.
 *
 * Paying both is a real accounting error, so the approved record always wins.
 * One shared resolver is used by the period builder and the slip calculator to
 * keep generation and preview on the same side of that rule.
 */
export async function resolveOvertimeHours(
  db: any,
  employeeId: number,
  month: number,
  year: number,
  attendanceHours: unknown,
): Promise<{
  hours: number;
  suppressedByApprovedRecord: boolean;
  approvedRecordCount: number;
  approvedPay: number;
}> {
  const approved = (await db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total_overtime_pay), 0) AS t
    FROM overtime_records
    WHERE employee_id = ? AND month = ? AND year = ? AND status = 'approved'
  `).get(employeeId, Number(month), Number(year))) as any;

  const count = Number(approved?.c) || 0;
  const rawHours = Number(attendanceHours) || 0;
  return {
    hours: count > 0 ? 0 : rawHours,
    suppressedByApprovedRecord: count > 0,
    approvedRecordCount: count,
    approvedPay: Number(approved?.t) || 0,
  };
}
