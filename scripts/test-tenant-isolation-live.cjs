// Live QA for the write-side tenant guard (entity + branch + self-service).
//
// The rules under test:
//   1. An account bound to one entity cannot write a record in another entity.
//   2. A branch manager cannot write a record outside their own branch.
//   3. A self-service account cannot touch another employee's record.
//   4. An account that was never linked to an entity cannot write anything that
//      names a record.
//   5. A write inside the caller's scope still succeeds.
//   6. The CSV exports are filtered by the caller's entity and branch.
//
// The QA owns a private server instance and a temporary copy of the database,
// so the live data is never modified and no fixture row can leak into it.
// Iqamas, IBANs and bank accounts are never printed — the assertions look at
// fixture names only.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
assert.ok(JWT_SECRET, 'JWT_SECRET is required for the live QA');

const ENTITY_OTHER = 9902;
const BRANCH_SAME_ENTITY = 9902;
const BRANCH_OTHER_ENTITY = 9903;
const DEPT_SAME_ENTITY = 9902;
const EMP = { sameBranch: 9901, sameBranchColleague: 9904, otherBranch: 9902, otherEntity: 9903 };
const NAME = {
  sameBranch: 'موظف الاختبار أ',
  sameBranchColleague: 'موظف الاختبار د',
  otherBranch: 'موظف الاختبار ب',
  otherEntity: 'موظف الاختبار ج',
};
const USR = { admin: 9901, hr: 9902, branchManager: 9903, ess: 9904, unbound: 9905 };
const VISA = { sameEntity: 9901, otherEntity: 9902 };

let checks = 0;
const passed = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

function seed(db) {
  const hash = bcrypt.hashSync('qa-' + randomUUID(), 10);
  db.prepare(
    "INSERT INTO entities (id, name_ar, name_en, country_code, currency) VALUES (?, ?, ?, 'SA', 'SAR')"
  ).run(ENTITY_OTHER, 'شركة اختبار العزل', 'Isolation QA');
  db.prepare("INSERT INTO branches (id, name, entity_id) VALUES (?, ?, ?)").run(
    BRANCH_SAME_ENTITY,
    'فرع الرياض',
    1
  );
  db.prepare("INSERT INTO branches (id, name, entity_id) VALUES (?, ?, ?)").run(
    BRANCH_OTHER_ENTITY,
    'فرع جدة',
    ENTITY_OTHER
  );
  db.prepare("INSERT INTO departments (id, name, entity_id) VALUES (?, ?, ?)").run(
    DEPT_SAME_ENTITY,
    'إدارة الاختبار',
    1
  );

  const addEmployee = (id, name, branchId, entityId) =>
    db
      .prepare(
        "INSERT INTO employees (id, branch_id, entity_id, name, position, basic_salary) VALUES (?, ?, ?, ?, 'اختبار', 1000)"
      )
      .run(id, branchId, entityId, name);
  addEmployee(EMP.sameBranch, NAME.sameBranch, 1, 1);
  addEmployee(EMP.sameBranchColleague, NAME.sameBranchColleague, 1, 1);
  addEmployee(EMP.otherBranch, NAME.otherBranch, BRANCH_SAME_ENTITY, 1);
  addEmployee(EMP.otherEntity, NAME.otherEntity, BRANCH_OTHER_ENTITY, ENTITY_OTHER);

  const addUser = (id, username, role, entityId, employeeId) =>
    db
      .prepare(
        "INSERT INTO users (id, username, password_hash, role, entity_id, employee_id, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 'active', 0)"
      )
      .run(id, username, hash, role, entityId, employeeId);
  addUser(USR.admin, 'qa_admin', 'admin', 1, null);
  addUser(USR.hr, 'qa_hr', 'hr_manager', 1, null);
  addUser(USR.branchManager, 'qa_branch_manager', 'branch_manager', 1, EMP.sameBranch);
  addUser(USR.ess, 'qa_employee_ess', 'employee_ess', null, EMP.sameBranch);
  // An operational role that was never linked to an entity: it may pass RBAC
  // but it must not be able to write against a record it cannot place.
  addUser(USR.unbound, 'qa_unbound', 'hr_manager', null, null);

  db.prepare(
    "INSERT INTO visas (id, employee_id, visa_type, visa_number, status) VALUES (?, ?, 'عمل', 'QA-VISA', 'active')"
  ).run(VISA.sameEntity, EMP.sameBranch);
  db.prepare(
    "INSERT INTO visas (id, employee_id, visa_type, visa_number, status) VALUES (?, ?, 'عمل', 'QA-VISA-2', 'active')"
  ).run(VISA.otherEntity, EMP.otherEntity);
}

async function startServer(dbPath, port, workDir) {
  const child = spawn(process.execPath, [path.join(root, 'dist', 'server.cjs')], {
    cwd: workDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      NODE_ENV: 'production',
      SSL_KEY_PATH: '',
      SSL_CERT_PATH: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('the QA server exited early:\n' + log);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('the QA server did not become ready:\n' + log);
}

(async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-tenant-qa-'));
  const dbPath = path.join(workDir, 'payroll.db');
  let server = null;
  let db = null;
  const tokens = [];

  try {
    // A private copy of the database: the fixture and the QA writes stay in it.
    const source = new Database(path.join(root, 'payroll.db'));
    await source.backup(dbPath);
    source.close();

    db = new Database(dbPath);
    seed(db);

    const port = await freePort();
    server = await startServer(dbPath, port, workDir);
    const base = `http://127.0.0.1:${port}`;

    const mint = (userId) => {
      const user = db
        .prepare('SELECT id, username, role, entity_id, employee_id FROM users WHERE id = ?')
        .get(userId);
      const token = jwt.sign({ ...user, jti: randomUUID() }, JWT_SECRET, { expiresIn: '15m' });
      db.prepare(
        "INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, 'local-tenant-qa')"
      ).run(user.id, token, new Date(Date.now() + 900000).toISOString());
      tokens.push(token);
      return token;
    };

    const tokenOf = {
      admin: mint(USR.admin),
      hr: mint(USR.hr),
      branchManager: mint(USR.branchManager),
      ess: mint(USR.ess),
      unbound: mint(USR.unbound),
    };

    const api = async (url, { token, method = 'GET', body, expectedStatus } = {}) => {
      const response = await fetch(base + url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (expectedStatus !== undefined) {
        assert.equal(
          response.status,
          expectedStatus,
          `HTTP status for ${method} ${url} — got ${response.status}: ${text.slice(0, 200)}`
        );
      }
      return { status: response.status, body: parsed, text };
    };

    const nameOf = (employeeId) =>
      db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId).name;

    // ---- 1. An entity-scoped account cannot reach another entity ----------
    const crossEntity = await api(`/api/employees/${EMP.otherEntity}`, {
      token: tokenOf.hr,
      method: 'PUT',
      body: { name: NAME.otherEntity },
      expectedStatus: 403,
    });
    assert.match(crossEntity.body?.error || '', /الموظف خارج نطاق حسابك/);
    assert.equal(nameOf(EMP.otherEntity), NAME.otherEntity, 'a refused write must not change the row');
    passed('an entity-scoped account cannot write a record in another entity');

    // ---- 2. A branch manager stays inside their branch -------------------
    const crossBranch = await api(`/api/employees/${EMP.otherBranch}`, {
      token: tokenOf.branchManager,
      method: 'PUT',
      body: { name: NAME.otherBranch },
      expectedStatus: 403,
    });
    assert.match(crossBranch.body?.error || '', /الموظف خارج نطاق فرعك/);
    passed('a branch manager cannot write a record in another branch of the same entity');

    // ---- 3. A self-service account cannot touch another employee --------
    const crossEmployee = await api(`/api/employees/${EMP.sameBranchColleague}`, {
      token: tokenOf.ess,
      method: 'PUT',
      body: { name: NAME.sameBranchColleague },
      expectedStatus: 403,
    });
    assert.match(crossEmployee.body?.error || '', /Insufficient permissions|خارج نطاق حسابك/);
    // The colleague sits in the same branch, so only the employee rule can
    // refuse this write.
    const crossEmployeeCertificate = await api('/api/salary-certificates', {
      token: tokenOf.ess,
      method: 'POST',
      body: { employee_id: EMP.sameBranchColleague, purpose: 'QA' },
      expectedStatus: 403,
    });
    assert.match(crossEmployeeCertificate.body?.error || '', /الموظف خارج نطاق حسابك/);
    const certificates = db
      .prepare('SELECT COUNT(*) AS c FROM salary_certificates WHERE employee_id = ?')
      .get(EMP.sameBranchColleague).c;
    assert.equal(certificates, 0, 'a refused certificate must not be written');
    passed('a self-service account cannot write a record for another employee');

    // ---- 4. A row addressed by the URL is checked too --------------------
    const crossVisa = await api(`/api/visas/${VISA.otherEntity}`, {
      token: tokenOf.hr,
      method: 'PUT',
      body: { status: 'expired' },
      expectedStatus: 403,
    });
    assert.match(crossVisa.body?.error || '', /التأشيرة خارج نطاق حسابك/);
    const visaStatus = db.prepare('SELECT status FROM visas WHERE id = ?').get(VISA.otherEntity).status;
    assert.equal(visaStatus, 'active', 'a refused visa update must not change the row');
    passed('a write addressed by a row id in the URL is checked against the scope');

    // ---- 5. An account with no entity binding writes nothing ------------
    const unbound = await api('/api/grievances', {
      token: tokenOf.unbound,
      method: 'POST',
      body: { employee_id: EMP.sameBranch, subject: 'QA', details: 'QA' },
      expectedStatus: 403,
    });
    assert.match(unbound.body?.error || '', /الحساب غير مرتبط بكيان/);
    const grievances = db.prepare('SELECT COUNT(*) AS c FROM employee_grievances').get().c;
    assert.equal(grievances, 0, 'a refused grievance must not be written');
    passed('an account without an entity binding cannot write against a record');

    // ---- 6. A write inside the scope still succeeds ----------------------
    const inside = await api(`/api/employees/${EMP.sameBranch}`, {
      token: tokenOf.hr,
      method: 'PUT',
      body: {
        name: NAME.sameBranch,
        position: 'اختبار',
        job_title: 'اختبار',
        basic_salary: 1000,
        deductions: 0,
        insurance_number: '',
        bank_account: '',
      },
      expectedStatus: 200,
    });
    assert.equal(inside.body?.success, true);
    passed('a write inside the caller scope still succeeds');

    // ---- 7. The exports are filtered by entity and branch ---------------
    const entityExport = await api('/api/excel/employees', { token: tokenOf.hr });
    assert.ok(entityExport.text.includes(NAME.sameBranch), 'the export must contain the caller entity');
    // An entity-wide account sees every branch inside its own entity.
    assert.ok(entityExport.text.includes(NAME.otherBranch), 'the entity export spans the whole entity');
    assert.ok(!entityExport.text.includes(NAME.otherEntity), 'the export must not leak the other entity');

    const otherEntityExport = await api('/api/excel/employees?entity_id=' + ENTITY_OTHER, {
      token: tokenOf.hr,
      expectedStatus: 403,
    });
    assert.match(otherEntityExport.body?.error || '', /الكيان خارج نطاق حسابك/);

    const branchExport = await api('/api/excel/employees', {
      token: tokenOf.branchManager,
      expectedStatus: 403,
    });
    assert.match(branchExport.body?.error || '', /Insufficient permissions/);

    // The branch filter itself is visible on the read path: a branch manager
    // only sees the employees of their own branch.
    const branchEmployees = await api('/api/employees', { token: tokenOf.branchManager });
    const branchNames = branchEmployees.body.map((row) => row.name);
    assert.ok(branchNames.includes(NAME.sameBranch), 'the branch read must contain the caller branch');
    assert.ok(branchNames.includes(NAME.sameBranchColleague), 'the branch read must contain the whole branch');
    assert.ok(!branchNames.includes(NAME.otherBranch), 'the branch read must not leak another branch');
    assert.ok(!branchNames.includes(NAME.otherEntity), 'the branch read must not leak another entity');
    passed('the exports are filtered by the caller entity and branch');

    // ---- 8. An admin without a filter still sees everything -------------
    const adminExport = await api('/api/excel/employees', { token: tokenOf.admin });
    assert.ok(adminExport.text.includes(NAME.sameBranch));
    assert.ok(adminExport.text.includes(NAME.otherBranch));
    assert.ok(adminExport.text.includes(NAME.otherEntity));
    passed('an unfiltered admin export still covers every entity');
  } finally {
    for (const token of tokens) {
      try {
        db?.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch {
        /* the copy is thrown away anyway */
      }
    }
    try {
      db?.close();
    } catch {
      /* already closed */
    }
    // The server keeps the database file open on Windows, so it has to be gone
    // before the directory can be removed. Cleanup must never hide the real
    // failure either, so its errors are swallowed on purpose.
    try {
      if (server) {
        const exited = new Promise((resolve) => server.once('exit', resolve));
        server.kill();
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10000))]);
      }
    } catch {
      /* the process is disposable */
    }
    try {
      fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      /* a leftover temp directory is not a test failure */
    }
  }
})().then(
  () => console.log(`SUCCESS ${checks} live tenant isolation checks`),
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  }
);
