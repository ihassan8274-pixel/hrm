// Read-only live QA for the SIF/bank-file endpoints.
//
// The point of this script is the refusal path: a bank file must never be
// emitted with invented data. Every case below asks for a file the system is
// not allowed to produce and asserts a coded refusal instead.
//
// It never writes to the business tables. The only row it touches is the QA
// session row, which it removes again.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const base = 'http://127.0.0.1:8090';
const db = new Database(path.join(root, 'payroll.db'));
const user = db.prepare("SELECT id, username, role, entity_id, employee_id, must_change_password FROM users WHERE role = 'admin' AND status = 'active' AND must_change_password = 0 LIMIT 1").get();
assert.ok(user, 'An active non-default admin is required for local QA');
assert.ok(process.env.JWT_SECRET?.trim(), 'JWT_SECRET must already be configured');
const token = jwt.sign({ ...user, jti: randomUUID() }, process.env.JWT_SECRET.trim(), { expiresIn: '15m' });
const fingerprint = () => createHash('sha256').update(JSON.stringify([
  db.prepare('SELECT * FROM employees ORDER BY id').all(),
  db.prepare('SELECT * FROM payroll ORDER BY id').all(),
  db.prepare('SELECT * FROM attendance ORDER BY id').all(),
  db.prepare('SELECT * FROM settings ORDER BY key').all(),
])).digest('hex');
const before = fingerprint();
let checks = 0;
const passed = (name) => { checks++; console.log(`PASS ${name}`); };

async function api(url, { expectedStatus, authenticated = true } = {}) {
  const response = await fetch(base + url, {
    headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `HTTP status for ${url}`);
  }
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, body, text, contentType: response.headers.get('content-type') || '' };
}

(async () => {
  // The auth middleware rejects a token whose jti has no session row.
  db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)')
    .run(user.id, token, new Date(Date.now() + 900000).toISOString(), 'local-sif-qa');
  const month = 10;
  const year = 2026;

  await api('/api/wps/export-sif', { expectedStatus: 401, authenticated: false });
  await api('/api/saudi/wps-export', { expectedStatus: 401, authenticated: false });
  passed('both export endpoints refuse anonymous callers');

  // A missing value date must be refused before anything is assembled.
  for (const path of ['/api/wps/export-sif', '/api/saudi/wps-export']) {
    const res = await api(`${path}?month=${month}&year=${year}`);
    assert.equal(res.status, 400, `${path} without value_date must be refused`);
    assert.equal(res.body?.code, 'MISSING_VALUE_DATE');
    assert.ok(res.body?.error, `${path} must explain the refusal`);
    assert.ok(!/SCR,/.test(res.text), `${path} must not emit a file header`);
  }
  passed('missing value date refused with MISSING_VALUE_DATE on both endpoints');

  const invalid = await api(`/api/wps/export-sif?month=${month}&year=${year}&value_date=2026-02-31`);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body?.code, 'INVALID_VALUE_DATE');
  passed('impossible calendar value date refused with INVALID_VALUE_DATE');

  const badPeriod = await api(`/api/wps/export-sif?month=13&year=${year}&value_date=2026-11-11`);
  assert.equal(badPeriod.status, 400);
  assert.equal(badPeriod.body?.code, 'INVALID_PERIOD');
  passed('impossible payroll period refused with INVALID_PERIOD');

  // The remaining refusals depend on the organisation's own settings, so the
  // script asserts the reason rather than a specific profile state: the file
  // must not come out either way.
  const withProfile = await api(`/api/wps/export-sif?month=${month}&year=${year}&value_date=2026-11-11`);
  assert.ok([400, 404].includes(withProfile.status), `expected a refusal, got ${withProfile.status}`);
  assert.ok(!/SCR,/.test(withProfile.text), 'no bank file may be emitted');
  assert.ok(withProfile.body?.code, 'a refusal must carry a machine-readable code');
  console.log(`  refused with ${withProfile.body.code}`);

  const attachment = await api(`/api/saudi/wps-export?month=${month}&year=${year}&value_date=2026-11-11`);
  assert.equal(attachment.status, withProfile.status, 'both endpoints must refuse identically');
  assert.ok(!/SCR,/.test(attachment.text), 'no bank file may be emitted as an attachment');
  assert.equal(attachment.body?.code, withProfile.body?.code);
  passed('both endpoints refuse identically and emit no bank file');

  const invalidFilter = await api(`/api/wps/export-sif?month=${month}&year=${year}&value_date=2026-11-11&branch_id=abc`);
  assert.equal(invalidFilter.status, 400);
  assert.ok(!/SCR,/.test(invalidFilter.text));
  passed('malformed scope filter refused on the export path');

  const scope = await api(`/api/wps/export-sif?month=${month}&year=${year}&value_date=2026-11-11&branch_id=999999`);
  assert.ok(scope.status >= 400, 'an out-of-scope branch must not produce a file');
  assert.ok(!/SCR,/.test(scope.text));
  passed('out-of-scope branch produces no bank file');

  assert.equal(fingerprint(), before, 'QA must not modify employees, payroll, attendance or settings');
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
  console.log(`SUCCESS ${checks} live export refusal checks`);
}, error => {
  console.error(error.message);
  process.exitCode = 1;
});
