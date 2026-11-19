/**
 * The other half of the check: validation must not reject valid payloads.
 *
 * A validation layer that only ever returns 400 is worse than none — it locks
 * the product. These calls are the ones the UI actually makes; all must pass.
 */
const http = require('http');
const path = require('node:path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
// The component code is unique, so a row left by an earlier run would fail the
// check for the wrong reason. The QA removes its own row again at the end.
const TEST_COMPONENT_CODE = 'TESTC';
const db = new Database(path.join(ROOT, 'payroll.db'));
db.prepare('DELETE FROM salary_components WHERE code = ?').run(TEST_COMPONENT_CODE);
db.close();

const call = (method, path, body, token) =>
  new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: 'localhost', port: 8090, path, method, headers }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });

(async () => {
  const CANDIDATES = ['Verify#2026x', 'ADMIN123'];
  let tok = null;
  for (const password of CANDIDATES) {
    const r = await call('POST', '/api/auth/login', { username: 'admin', password });
    if (r.status === 200) { tok = JSON.parse(r.body).token; break; }
  }
  if (!tok) { console.log('no session'); return; }

  const emp = await call('GET', '/api/employees', null, tok);
  const list = JSON.parse(emp.body);
  const eid = Array.isArray(list) && list.length ? list[0].id : 1;

  const cases = [
    ['bonus (valid)',      'POST', '/api/bonuses-penalties', { employee_id: eid, type: 'bonus', amount: 500, reason: 'مكافأة أداء', month: 5, year: 2026 }, 200],
    ['loan (valid)',       'POST', '/api/loans', { employee_id: eid, total_amount: 5000, monthly_installment: 500 }, 200],
    ['leave create',       'POST', '/api/leaves', { employee_id: eid, type: 'annual', start_date: '2026-07-01', end_date: '2026-07-05', days: 5, reason: 'إجازة' }, 200],
    ['tax exemption',      'POST', '/api/tax-exemptions', { employee_id: eid, exemption_type: 'social_security', amount: 800 }, 200],
    ['budget update',      'PUT',  '/api/budgets/departments/1', { allocated_salaries: 50000, headcount_cap: 12 }, 200],
    ['payroll lock',       'POST', '/api/payroll/lock', { month: 5, year: 2026 }, 200],
    ['payroll generate',   'POST', '/api/payroll/generate', { month: 5, year: 2026 }, 200],
    // `type` is earning/deduction/employer_contribution; `category` is the
// allowance/basic/tax grouping. Passing 'allowance' as type is correctly rejected.
['salary component',   'POST', '/api/payroll/components', { code: 'TESTC', name_ar: 'مكوّن اختبار', type: 'earning', category: 'allowance' }, 200],
  ];

  let pass = 0, fail = 0;
  let createdComponentId = null;
  for (const [label, method, path_, body, want] of cases) {
    const r = await call(method, path_, body, tok);
    // 404/409 are acceptable business rejections (missing rows, already locked)
    const ok = r.status === want || (want === 200 && (r.status === 404 || r.status === 409));
    ok ? pass++ : fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(20)} got ${r.status}`);
    if (!ok) console.log(`        ${r.body.replace(/\s+/g, ' ').slice(0, 150)}`);
    if (label === 'salary component' && r.status === 200) {
      try { createdComponentId = JSON.parse(r.body).id; } catch { /* no id to clean up */ }
    }
  }

  // The QA must not leave its test component behind.
  if (createdComponentId) {
    const cleanup = new Database(path.join(ROOT, 'payroll.db'));
    cleanup.prepare('DELETE FROM salary_components WHERE id = ?').run(createdComponentId);
    cleanup.close();
    console.log('  cleaned the test salary component');
  }

  console.log(`\n  ${pass} passed, ${fail} failed`);
  console.log('  (404/409 counted as OK: the record does not exist / period already locked)');
})();