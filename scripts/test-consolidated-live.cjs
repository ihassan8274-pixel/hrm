const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { chromium, expect } = require('@playwright/test');

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
])).digest('hex');
const before = fingerprint();
let checks = 0;
const passed = (name) => { checks++; console.log(`PASS ${name}`); };
let browser;

async function api(url, expectedStatus = 200, authenticated = true) {
  const response = await fetch(base + url, {
    headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, expectedStatus, `HTTP status for ${url}`);
  return response.json();
}

(async () => {
  db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)')
    .run(user.id, token, new Date(Date.now() + 900000).toISOString(), 'local-consolidated-qa');
  await api('/api/health', 200, false);
  await api('/api/reports/consolidated', 401, false);
  passed('health and anonymous report denial');
  const employees = await api('/api/employees');
  assert.equal(employees.length, 55);
  assert.equal((await api('/api/employees?entity_id=1&branch_id=1')).length, 55);
  assert.equal((await api('/api/employees?branch_id=999999')).length, 0);
  passed('employee entity and branch filters');
  const payroll = await api('/api/payroll?month=10&year=2026&branch_id=1');
  assert.equal(payroll.length, 55);
  assert.equal((await api('/api/payroll?month=10&year=2026&branch_id=999999')).length, 0);
  passed('payroll branch filters');
  const report = await api('/api/reports/consolidated');
  assert.equal(report.month, 10);
  assert.equal(report.year, 2026);
  assert.equal(report.grand.employee_count, 55);
  assert.equal(report.grand.payroll_count, 55);
  assert.equal(report.grand.gross, 133350);
  assert.equal(report.grand.deductions, 5460);
  assert.equal(report.grand.net, 127890);
  assert.equal(report.grand.attendance_log_count, 0);
  const gosi = db.prepare('SELECT ROUND(SUM(insurance_comp_share), 2) AS total FROM payroll WHERE month=10 AND year=2026').get().total;
  assert.equal(report.grand.gosi_comp, gosi);
  passed('live report totals and GOSI cents agree with saved payroll');
  const empty = await api('/api/reports/consolidated?month=1&year=2026');
  assert.equal(empty.grand.payroll_count, 0);
  assert.equal(empty.grand.employee_count, 55);
  const missing = await api('/api/reports/consolidated?month=10&year=2026&branch_id=999999');
  assert.equal(missing.grand.employee_count, 0);
  passed('empty period retains headcount; unknown branch has no employees');
  for (const query of ['month=13&year=2026', 'month=10', 'branch_id=0', 'entity_id[]=1', 'year=2026&month=10&branch_id=-1']) {
    await api(`/api/reports/consolidated?${query}`, 400);
  }
  passed('invalid filters rejected by HTTP API');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(({ token, user, base }) => {
    if (location.origin !== base) return;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, { token, user, base });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const unexpectedApiFailures = [];
  page.on('response', response => {
    if (response.url().startsWith(base + '/api/') && response.status() >= 400 && !response.url().includes('/api/reports/consolidated')) {
      unexpectedApiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  page.setDefaultTimeout(15000);
  await page.goto(`${base}/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  const reportsNav = page.getByRole('button', { name: 'التقارير المجمعة بين الفروع', exact: true });
  await reportsNav.click();
  const results = page.getByRole('region', { name: 'نتائج التقرير', exact: true });
  await expect(results).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^الشهر/ })).toHaveValue('10');
  await expect(page.getByLabel('السنة', { exact: true })).toHaveValue('2026');
  await expect(results).toContainText('127,890.00 SAR');
  await expect(results).toContainText('لا توجد سجلات دخول للفترة المختارة');
  await page.getByRole('combobox', { name: /^الكيان/ }).selectOption('1');
  await expect(results).toBeVisible();
  await page.getByRole('combobox', { name: /^الفرع/ }).selectOption('1');
  await expect(results).toContainText('133,350.00 SAR');
  passed('browser report navigation, selectors, cents and missing-log warning');

  await page.getByRole('combobox', { name: /^الشهر/ }).selectOption('1');
  await expect(results).toContainText('لا يوجد مسير رواتب محفوظ للفترة');
  await expect(results).not.toContainText('127,890.00');
  passed('browser no-payroll month clears old money');
  await page.getByLabel('السنة', { exact: true }).fill('20');
  await expect(results).toHaveCount(0);
  await expect(page.getByText('اختر شهرًا وسنة صحيحة من 1900 إلى 9999 لعرض التقرير.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'تحديث التقرير', exact: true })).toBeDisabled();
  await page.getByLabel('السنة', { exact: true }).fill('2026');
  await expect(results).toBeVisible();
  passed('incomplete year clears stale report and disables refresh');

  const reportUrl = '**/api/reports/consolidated*';
  await page.route(reportUrl, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA service unavailable' }) }));
  await page.getByRole('button', { name: 'تحديث التقرير', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('QA service unavailable');
  await expect(results).toHaveCount(0);
  await page.unroute(reportUrl);
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(results).toBeVisible();
  passed('HTTP error hides old values and retry recovers');

  let releaseOld;
  let oldComplete = false;
  const held = new Promise(resolve => { releaseOld = resolve; });
  const intercepted = page.waitForRequest(request => request.url().includes('/api/reports/consolidated') && new URL(request.url()).searchParams.get('month') === '2');
  await page.route(reportUrl, async route => {
    if (new URL(route.request().url()).searchParams.get('month') === '2') {
      await held;
      await route.fulfill({ json: { ...report, month: 2 } }).catch(() => {});
      oldComplete = true;
    } else await route.continue();
  });
  await page.getByRole('combobox', { name: /^الشهر/ }).selectOption('2');
  await intercepted;
  await page.getByRole('combobox', { name: /^الشهر/ }).selectOption('10');
  await expect(results).toContainText('127,890.00 SAR');
  releaseOld();
  await expect.poll(() => oldComplete).toBe(true);
  await page.unroute(reportUrl);
  await expect(page.getByRole('combobox', { name: /^الشهر/ })).toHaveValue('10');
  await expect(results).toContainText('مطابقة مبالغ مسير الرواتب — أكتوبر 2026');
  passed('late older request cannot replace newest period');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'توسيع القائمة', exact: true })).toBeVisible();
  const layout = await page.evaluate(() => {
    const region = document.querySelector('section[aria-label="نتائج التقرير"]');
    const main = document.querySelector('main');
    const scrollers = [...region.querySelectorAll('[role="region"]')].map(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    return { width: innerWidth, document: document.documentElement.scrollWidth, mainWidth: main.clientWidth, mainScroll: main.scrollWidth, regionWidth: region.getBoundingClientRect().width, scrollers };
  });
  console.log('LAYOUT', JSON.stringify(layout));
  assert.ok(layout.regionWidth >= 260, 'report must have usable mobile content width');
  assert.ok(layout.scrollers.every(el => el.client >= 200), 'table and chart must have usable widths');
  assert.ok(layout.document <= layout.width + 2, 'document should not overflow at mobile width');
  assert.ok(layout.mainScroll <= layout.mainWidth + 2, 'main content should not overflow outside table/chart scrollers');
  await expect.poll(() => page.locator('aside').first().evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(82);
  await page.screenshot({ path: path.join(root, 'scripts', '.qa-report-mobile.png') });
  await page.getByRole('button', { name: 'توسيع القائمة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'طي القائمة', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(10, 30);
  await expect(page.getByRole('button', { name: 'توسيع القائمة', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'توسيع القائمة', exact: true }).click();
  await page.evaluate(() => { document.activeElement?.blur(); });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'توسيع القائمة', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'توسيع القائمة', exact: true }).click();
  await page.getByRole('button', { name: 'بوابة أنظمة معصوب حليب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'توسيع القائمة', exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'توسيع القائمة', exact: true })).toBeVisible();
  await reportsNav.click();
  await expect(results).toBeVisible();
  passed('mobile readable width, contained scrolling, menu Escape and fresh load');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'بوابة أنظمة معصوب حليب', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'حدود الربط الحالي', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('ليست مزامنة بيانات أو تسجيل دخول موحد');
  const receiving = page.getByRole('link', { name: /افتح نظام الاستلام/ });
  await expect(receiving).toHaveAttribute('href', 'https://reciveing.restocost.shop/');
  await expect(receiving).toHaveAttribute('target', '_blank');
  await expect(receiving).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(receiving).toHaveAttribute('referrerpolicy', 'no-referrer');
  const opened = context.waitForEvent('page');
  await receiving.click();
  const receivingPage = await opened;
  await receivingPage.waitForLoadState('domcontentloaded');
  assert.equal(new URL(receivingPage.url()).hostname, 'reciveing.restocost.shop');
  const externalState = await receivingPage.evaluate(() => ({ opener: window.opener === null, payrollToken: localStorage.getItem('auth_token') }));
  assert.equal(externalState.opener, true);
  assert.equal(externalState.payrollToken, null, 'no payroll token should cross into receiving');
  await receivingPage.close();
  await expect(page.getByRole('link', { name: /افتح نظام الجودة/ })).toHaveAttribute('href', 'http://127.0.0.1:8780/');
  await page.getByRole('button', { name: 'افتح تقارير الفروع', exact: true }).click();
  await expect(results).toContainText('127,890.00 SAR');
  passed('systems hub has safe separate-login links and working reports action');

  await page.getByRole('button', { name: 'الموظفين والإقامات', exact: true }).click();
  await expect(page.locator('main table tbody tr').first()).toBeVisible();
  await page.getByRole('button', { name: 'مسير الرواتب (WPS)', exact: true }).click();
  await expect(page.locator('main')).toContainText('مسير الرواتب');
  assert.equal(errors.length, 0, 'no uncaught browser exceptions');
  assert.equal(unexpectedApiFailures.length, 0, `unexpected API failures: ${unexpectedApiFailures.join(', ')}`);
  passed('employees/payroll navigation and browser error regression');
})().finally(async () => {
  try {
    if (browser) await browser.close();
  } finally {
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      assert.equal(fingerprint(), before, 'QA must not modify employees, payroll or attendance');
      console.log('CLEANUP test session removed; employee/payroll/attendance data unchanged');
    } finally {
      db.close();
    }
  }
}).then(() => {
  console.log(`SUCCESS ${checks} live API/browser checks`);
}, error => {
  console.error(error.message);
  process.exitCode = 1;
});
