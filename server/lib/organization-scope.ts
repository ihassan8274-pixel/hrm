export interface OrganizationScope {
  entityId: number | null;
  branchId: number | null;
  employeeId: number | null;
}

export class ScopeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function optionalId(value: unknown, label: string): number | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new ScopeError(400, `${label}: اختر رقمًا صحيحًا موجبًا`);
  }
  return Number(value);
}

export async function resolveOrganizationScope(db: any, userId: number, query: Record<string, unknown>): Promise<OrganizationScope> {
  const entityId = optionalId(query.entity_id, 'الكيان');
  const branchId = optionalId(query.branch_id, 'الفرع');
  const user = await db.prepare('SELECT role, entity_id, employee_id, status FROM users WHERE id = ?').get(userId) as {
    role: string; entity_id: number | null; employee_id: number | null; status: string;
  } | undefined;
  if (!user || user.status !== 'active') throw new ScopeError(403, 'الحساب غير مفعّل');
  if (user.role === 'admin') return { entityId, branchId, employeeId: null };

  const linkedEmployee = user.role === 'employee_ess' || user.role === 'branch_manager'
    ? (user.employee_id
        ? await db.prepare('SELECT id, entity_id, branch_id FROM employees WHERE id = ?').get(user.employee_id) as {
            id: number; entity_id: number | null; branch_id: number | null;
          } | undefined
        : undefined)
    : undefined;

  // A self-service account is linked to an employee row, not to an entity on the
  // user table — the entity comes from that employee, otherwise every ESS read
  // would be refused with "must be linked to an entity".
  if (user.role === 'employee_ess') {
    if (!linkedEmployee) throw new ScopeError(403, 'الحساب غير مرتبط بموظف');
    const ownEntity = linkedEmployee.entity_id;
    if (!ownEntity) throw new ScopeError(403, 'بيانات الموظف غير مرتبطة بكيان');
    if (entityId !== null && entityId !== ownEntity) throw new ScopeError(403, 'الكيان خارج نطاق حسابك');
    // The employee restriction is what keeps the account self-service, so an
    // explicit branch filter only narrows the result set further.
    return { entityId: ownEntity, branchId: branchId ?? linkedEmployee.branch_id, employeeId: linkedEmployee.id };
  }

  if (!user.entity_id) throw new ScopeError(403, 'يجب ربط الحساب بكيان قبل عرض البيانات');
  if (entityId !== null && entityId !== user.entity_id) throw new ScopeError(403, 'الكيان خارج نطاق حسابك');
  const scoped = { entityId: user.entity_id, branchId, employeeId: null as number | null };
  if (user.role === 'branch_manager') {
    if (!linkedEmployee || linkedEmployee.entity_id !== user.entity_id) {
      throw new ScopeError(403, 'الحساب غير مرتبط بموظف في كيانه');
    }
    const branch = linkedEmployee.branch_id ? await db.prepare('SELECT entity_id FROM branches WHERE id = ?').get(linkedEmployee.branch_id) as { entity_id: number } | undefined : undefined;
    if (!branch || branch.entity_id !== user.entity_id) throw new ScopeError(403, 'مدير الفرع غير مرتبط بفرع في كيانه');
    if (branchId !== null && branchId !== linkedEmployee.branch_id) throw new ScopeError(403, 'الفرع خارج نطاق حسابك');
    scoped.branchId = linkedEmployee.branch_id;
  }
  return scoped;
}

/**
 * Write-side scope resolution.
 *
 * Unlike the read path this never throws for a missing binding: a write has to
 * be refused because it reaches *outside* the caller's entity, not because the
 * account forgot to be linked. An account that carries no binding at all
 * returns null — nothing can be proven about where its records live, so the
 * caller must refuse any write that names a record.
 */
export async function resolveWriteScope(
  db: any,
  userId: number,
  query: Record<string, unknown>
): Promise<OrganizationScope | null> {
  const user = await db.prepare('SELECT role, entity_id, employee_id, status FROM users WHERE id = ?').get(userId) as {
    role: string; entity_id: number | null; employee_id: number | null; status: string;
  } | undefined;
  if (!user || user.status !== 'active') throw new ScopeError(403, 'الحساب غير مفعّل');

  const entityId = optionalId(query.entity_id, 'الكيان');
  const branchId = optionalId(query.branch_id, 'الفرع');
  if (user.role === 'admin') return { entityId, branchId, employeeId: null };

  const linkedEmployee = user.employee_id
    ? await db.prepare('SELECT id, entity_id, branch_id FROM employees WHERE id = ?').get(user.employee_id) as {
        id: number; entity_id: number | null; branch_id: number | null;
      } | undefined
    : undefined;

  if (user.role === 'employee_ess') {
    if (!linkedEmployee || !linkedEmployee.entity_id) return null;
    return {
      entityId: linkedEmployee.entity_id,
      branchId: linkedEmployee.branch_id,
      employeeId: linkedEmployee.id,
    };
  }

  if (!user.entity_id) return null;
  if (entityId !== null && entityId !== user.entity_id) {
    throw new ScopeError(403, 'الكيان خارج نطاق حسابك');
  }
  const scoped: OrganizationScope = { entityId: user.entity_id, branchId, employeeId: null };
  if (user.role === 'branch_manager') {
    if (!linkedEmployee || linkedEmployee.entity_id !== user.entity_id || !linkedEmployee.branch_id) {
      return null;
    }
    const branch = await db.prepare('SELECT entity_id FROM branches WHERE id = ?')
      .get(linkedEmployee.branch_id) as { entity_id: number } | undefined;
    if (!branch || branch.entity_id !== user.entity_id) return null;
    scoped.branchId = linkedEmployee.branch_id;
  }
  return scoped;
}

export interface ScopeTarget {
  entityId: number | null;
  branchId: number | null;
  // The employee the record belongs to. It is optional because most callers
  // only know the entity/branch of a row; when it is supplied, a self-service
  // account may only touch its own records.
  employeeId?: number | null;
}

/**
 * The employee rows the caller may act on. An admin (no entity filter) sees
 * everyone; a branch manager sees their branch; a self-service account sees
 * only its own record.
 */
export async function listScopedEmployees(
  db: any,
  scope: OrganizationScope
): Promise<{ id: number; entity_id: number | null; branch_id: number | null }[]> {
  return await db
    .prepare(
      `SELECT id, entity_id, branch_id FROM employees
       WHERE (? IS NULL OR entity_id = ?) AND (? IS NULL OR branch_id = ?) AND (? IS NULL OR id = ?)`
    )
    .all(
      scope.entityId, scope.entityId,
      scope.branchId, scope.branchId,
      scope.employeeId, scope.employeeId
    ) as { id: number; entity_id: number | null; branch_id: number | null }[];
}

/**
 * Write-side counterpart of the read scope: a record may only be touched when it
 * belongs to the caller's entity, and a branch manager may only touch their branch.
 */
export function assertWritableScope(scope: OrganizationScope, target: ScopeTarget, label = 'السجل'): void {
  if (scope.entityId === null) return; // admin without an explicit entity filter
  if (target.entityId === null || target.entityId !== scope.entityId) {
    throw new ScopeError(403, `${label} خارج نطاق حسابك`);
  }
  if (scope.branchId !== null && target.branchId !== scope.branchId) {
    throw new ScopeError(403, `${label} خارج نطاق فرعك`);
  }
  // A self-service account is tied to one employee record, so it must not reach
  // another employee's row even inside its own branch.
  if (scope.employeeId !== null && target.employeeId !== undefined && target.employeeId !== scope.employeeId) {
    throw new ScopeError(403, `${label} خارج نطاق حسابك`);
  }
}

/**
 * The entity a new record must carry. A caller bound to one entity cannot create
 * records in another one; an admin has to name the entity explicitly.
 */
export async function resolveWritableEntity(
  db: any,
  scope: OrganizationScope,
  requested: unknown,
  label = 'الكيان'
): Promise<number> {
  const requestedId = optionalId(
    requested === undefined || requested === null || requested === '' ? undefined : String(requested),
    label
  );
  if (scope.entityId !== null) {
    if (requestedId !== null && requestedId !== scope.entityId) {
      throw new ScopeError(403, `${label} خارج نطاق حسابك`);
    }
    return scope.entityId;
  }
  if (requestedId !== null) return requestedId;
  const entities = await db.prepare('SELECT id FROM entities ORDER BY id').all() as { id: number }[];
  if (entities.length === 1) return entities[0].id;
  throw new ScopeError(400, `${label}: حدّد الكيان الذي ينتمي إليه السجل`);
}

/**
 * Write-side check for a record that hangs off an employee (bonus, loan, leave,
 * overtime, correction, …). The employee itself must exist and must sit inside
 * the caller's entity — and inside their branch when they are a branch manager.
 */
export async function assertEmployeeWritableScope(
  db: any,
  scope: OrganizationScope,
  employeeId: number,
  label = 'الموظف'
): Promise<{ id: number; entity_id: number | null; branch_id: number | null }> {
  const employee = await db
    .prepare('SELECT id, entity_id, branch_id FROM employees WHERE id = ?')
    .get(employeeId) as { id: number; entity_id: number | null; branch_id: number | null } | undefined;
  if (!employee) throw new ScopeError(404, `${label} غير موجود`);
  assertWritableScope(scope, { entityId: employee.entity_id, branchId: employee.branch_id, employeeId: employee.id }, label);
  return employee;
}
