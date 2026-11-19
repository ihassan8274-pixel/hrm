/**
 * How many active admins the system would still have after a proposed change.
 *
 * Zero means the change locks everybody out of the only screen that could undo
 * it, so the caller must refuse. Kept separate from the route so the invariant
 * can be tested against an in-memory database.
 */
export function countActiveAdminsAfter(
  currentCount: number,
  currentRole: string,
  currentStatus: string,
  nextRole: string,
  nextStatus: string
): number {
  const wasActiveAdmin = currentRole === "admin" && currentStatus === "active";
  const willBeActiveAdmin = nextRole === "admin" && nextStatus === "active";
  return Math.max(0, currentCount - (wasActiveAdmin ? 1 : 0) + (willBeActiveAdmin ? 1 : 0));
}
