// Live QA for branch/entity isolation on the remaining payroll writes.
//
// The rules under test:
//   1. Department budgets are read and written inside the caller's entity.
//   2. The period lock is one flag for the whole company, so a scoped account
//      may not set it.
//   3. The batch calculation only covers the employees the caller may see.
//   4. A salary component update cannot shape its own SQL.
//
// Read-only: every refusal is asserted, and the few successful calls only
// compute or read. The fingerprint proves no business row changed.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const base = 'http://127.0.0.1:8090';
const db = new Database(path.join(root, 'payroll.db'));
const user = db.prepare("SELECT id, username, role, entity_id, employee_id FROM users WHERE role = 'admin' AND status = 'active' AND must_change_password = 0 LIMIT 1").get();
assert.ok(user, 'An active non-default admin is required for local QA');
const token = jwt.sign({ ...user, jti: randomUUID() }, process.env.JWT_SECRET.trim(), { expiresIn: '15m' });
const fingerprint = () => createHash('sha256').update(JSON.stringify([
  db.prepare('SELECT * FROM employees ORDER BY id').all(),
  db.prepare('SELECT * FROM payroll ORDER BY id').all(),
  db.prepare('SELECT * FROM department_budgets ORDER BY id').all(),
  db.prepare('SELECT * FROM salary_components ORDER BY id').all(),
  db.prepare('SELECT * FROM settings ORDER BY key').all(),
])).digest('hex');
const before = fingerprint();
let checks = 0;
const passed = (name) => { checks++; console.log(`PASS ${name}`); };

async function api(url, { expectedStatus, method = 'GET', body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `HTTP status for ${method} ${url}`);
  }
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: response.status, body: parsed, text };
}

(async () => {
  db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)')
    .run(user.id, token, new Date(Date.now() + 900000).toISOString(), 'local-isolation-qa');

  // ---- Department budgets follow the entity scope -----------------------
  const scoped = await api('/api/budgets/departments?entity_id=1', { expectedStatus: 200 });
  assert.ok(Array.isArray(scoped.body));
  const otherEntity = await api('/api/budgets/departments?entity_id=2', { expectedStatus: 200 });
  assert.deepEqual(otherEntity.body, [], 'an entity without departments must see none');
  assert.ok(scoped.body.length >= otherEntity.body.length);
  passed('department budgets are filtered by the requested entity');

  const missingBudget = await api('/api/budgets/departments/999999?entity_id=1', {
    expectedStatus: 404, method: 'PUT', body: { allocated_salaries: 1 },
  });
  assert.match(missingBudget.body?.error || '', /ميزانية الإدارة غير موجودة/);
  passed('a budget outside the caller scope is refused before it is written');

  // ---- The period lock stays company-wide -------------------------------
  const scopedLock = await api('/api/payroll/lock?entity_id=1', {
    expectedStatus: 403, method: 'POST', body: { month: 10, year: 2026, locked: true },
  });
  assert.match(scopedLock.body?.error || '', /إقفال المسير متاح على مستوى المنشأة كاملة فقط/);
  const lockKeys = db.prepare("SELECT key FROM settings WHERE key LIKE 'payroll_lock%'").all();
  assert.equal(lockKeys.length, 0, 'a refused lock must not write the lock setting');
  passed('an entity-scoped account cannot lock the company payroll');

  // ---- The batch calculation only covers the caller's employees ---------
  const noEntity = await api('/api/payroll/batch', {
    expectedStatus: 400, method: 'POST', body: { month: 10, year: 2026 },
  });
  assert.match(noEntity.body?.error || '', /حدّد الكيان/);
  passed('the batch calculation refuses to run without an entity scope');

  const batch = await api('/api/payroll/batch?entity_id=1', {
    expectedStatus: 200, method: 'POST', body: { month: 10, year: 2026 },
  });
  assert.ok(Array.isArray(batch.body?.employees));
  const employees = db.prepare('SELECT id, entity_id FROM employees').all();
  const outside = batch.body.employees.filter(row => {
    const employee = employees.find(e => e.id === row.employeeId);
    return !employee || employee.entity_id !== 1;
  });
  assert.equal(outside.length, 0, 'the batch must not cover employees outside the scope');
  passed('the batch calculation only covers the employees in scope');

  // ---- A component update cannot choose its own columns -----------------
  const component = db.prepare('SELECT id, name_ar FROM salary_components ORDER BY id LIMIT 1').get();
  const injection = await api(`/api/payroll/components/${component.id}`, {
    expectedStatus: 400, method: 'PUT',
    body: { "name_ar = 'مُعدَّل', is_active": "0" },
  });
  assert.match(injection.body?.error || '', /لا توجد حقول قابلة للتحديث/);
  const after = db.prepare('SELECT name_ar FROM salary_components WHERE id = ?').get(component.id);
  assert.equal(after.name_ar, component.name_ar, 'a rejected update must not change the row');
  passed('a component update with a forged column name is rejected');

  assert.equal(fingerprint(), before, 'QA must not modify employees, payroll, budgets, components or settings');
  passed('no business data changed');
})().finally(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch (error) {
    console.error('cleanup failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}).then(() => {
  console.log(`SUCCESS ${checks} live isolation checks`);
}, error => {
  console.error(error.message);
  process.exitCode = 1;
});
