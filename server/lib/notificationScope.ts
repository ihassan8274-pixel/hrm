/**
 * Row-level visibility for notifications.
 *
 * A notification is private by default. Only admin/hr_manager may read the
 * unscoped legacy feed; every other role sees rows explicitly addressed to
 * its own user or employee record, plus its own branch/entity when the role
 * is allowed to operate at that level. The same predicate is used for reads
 * and for "mark as read" writes, so a crafted id cannot touch another user's
 * notification.
 */

export const NOTIFICATION_VIEW_ALL_ROLES = new Set(['admin', 'hr_manager']);

export type NotificationViewer = {
  id?: number | string | null;
  role?: string | null;
  employeeId?: number | null;
  branchId?: number | null;
  entityId?: number | null;
};

export type NotificationScope = { sql: string; params: unknown[] };

function asId(value: number | string | null | undefined): number {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : -1;
}

export function notificationScope(viewer: NotificationViewer): NotificationScope {
  if (!viewer.id || asId(viewer.id) < 0) return { sql: '1 = 0', params: [] };
  if (NOTIFICATION_VIEW_ALL_ROLES.has(String(viewer.role || '').toLowerCase())) {
    return { sql: '1 = 1', params: [] };
  }

  const clauses = ['user_id = ?', 'employee_id = ?'];
  const params: unknown[] = [asId(viewer.id), asId(viewer.employeeId)];

  if (viewer.role === 'branch_manager' && asId(viewer.branchId) > 0) {
    clauses.push('branch_id = ?');
    params.push(asId(viewer.branchId));
  }
  if (viewer.role === 'finance' && asId(viewer.entityId) > 0) {
    clauses.push('entity_id = ?');
    params.push(asId(viewer.entityId));
  }
  return { sql: `(${clauses.join(' OR ')})`, params };
}

export function notificationViewerFromRequest(req: { user?: any }): NotificationViewer {
  const user = req.user || {};
  return {
    id: user.id,
    role: user.role,
    employeeId: user.employee_id ?? null,
    entityId: user.entity_id ?? null,
    branchId: user.branch_id ?? null,
  };
}
