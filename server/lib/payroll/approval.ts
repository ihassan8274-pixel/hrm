/**
 * NULL is a legacy payroll row: it was generated before the explicit decision
 * column existed and stays exportable. A new row is written as 'draft' and must
 * be approved before it can reach a WPS bank file.
 */
export function isPayrollApproved(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const status = (row as { approval_status?: unknown }).approval_status;
  return status == null || String(status) === "approved";
}
