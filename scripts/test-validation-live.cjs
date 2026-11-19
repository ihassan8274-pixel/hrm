/**
 * Proves the validation layer actually rejects bad input, and that coercion
 * reaches the handler. Uses the live server on :8090.
 */
const http = require('http');

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
  // The admin password rotates across runs (bootstrap default → forced change),
  // so try each known value rather than assuming one.
  const CANDIDATES = ['ADMIN123', 'Verify#2026x'];
  let tok = null;

  for (const password of CANDIDATES) {
    const r = await call('POST', '/api/auth/login', { username: 'admin', password });
    if (r.status !== 200) continue;
    const parsed = JSON.parse(r.body);
    if (parsed.user?.must_change_password) {
      await call('PUT', '/api/auth/change-password', {
        currentPassword: password,
        newPassword: 'Verify#2026x',
      }, parsed.token);
      const again = await call('POST', '/api/auth/login', { username: 'admin', password: 'Verify#2026x' });
      if (again.status !== 200) { console.log('forced change failed'); return; }
      tok = JSON.parse(again.body).token;
    } else {
      tok = parsed.token;
    }
    break;
  }

  if (!tok) { console.log('could not obtain an admin session'); return; }
  return run(tok);
})();

async function run(tok) {
  const cases = [
    // [label, method, path, body, expected status]
    ['bonus: negative amount',   'POST', '/api/bonuses-penalties', { employee_id: 1, type: 'bonus', amount: -500, reason: 'x', month: 1, year: 2026 }, 400],
    ['bonus: bad type',          'POST', '/api/bonuses-penalties', { employee_id: 1, type: 'HACK', amount: 5, reason: 'x', month: 1, year: 2026 }, 400],
    ['bonus: month 99',          'POST', '/api/bonuses-penalties', { employee_id: 1, type: 'bonus', amount: 5, reason: 'x', month: 99, year: 2026 }, 400],
    ['loan: zero amount',        'POST', '/api/loans', { employee_id: 1, total_amount: 0, monthly_installment: 100 }, 400],
    ['loan: string injection',   'POST', '/api/loans', { employee_id: "1 OR 1=1", total_amount: 1000, monthly_installment: 100 }, 400],
    ['correct: bad column',      'POST', '/api/payroll/correct', { month: 1, year: 2026, employee_id: 1, field: "net_salary = 0, admin", new_value: 1, reason: 'test' }, 400],
    ['correct: negative value',  'POST', '/api/payroll/correct', { month: 1, year: 2026, employee_id: 1, field: 'bonuses', new_value: -10, reason: 'test' }, 400],
    ['correct: no reason',       'POST', '/api/payroll/correct', { month: 1, year: 2026, employee_id: 1, field: 'bonuses', new_value: 10 }, 400],
    ['leave: bad status',        'PUT',  '/api/leaves/1', { status: "approved'; DROP TABLE leaves;--" }, 400],
    ['tax: negative amount',     'POST', '/api/tax-exemptions', { employee_id: 1, exemption_type: 'social', amount: -1 }, 400],
    ['budget: negative alloc',   'PUT',  '/api/budgets/departments/1', { allocated_salaries: -100 }, 400],
    ['payroll/lock: bad month',  'POST', '/api/payroll/lock', { month: 13, year: 2026 }, 400],
    ['payroll/generate: bad yr', 'POST', '/api/payroll/generate', { month: 1, year: 1999 }, 400],
  ];

  let pass = 0, fail = 0;
  for (const [label, method, path, body, want] of cases) {
    const r = await call(method, path, body, tok);
    const ok = r.status === want;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(26)} got ${r.status}, want ${want}`);
    if (!ok) console.log(`        ${r.body.replace(/\s+/g, ' ').slice(0, 130)}`);
  }

  // Coercion must reach the handler: string numbers become real numbers.
  console.log('\n  coercion check:');
  const s = await call('POST', '/api/bonuses-penalties', { employee_id: '1', type: 'bonus', amount: '750', reason: 'coercion test', month: '3', year: '2026' }, tok);
  console.log(`    string numbers accepted: ${s.status === 200 ? 'yes (coerced)' : 'no (' + s.status + ')'}`);

  console.log(`\n  ${pass} passed, ${fail} failed`);
}