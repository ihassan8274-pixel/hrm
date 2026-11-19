// Browser QA for the bank-file surfaces.
//
// What this proves in the browser, not in a unit test:
//   1. The value date is a real, required field — the export button is dead
//      without it.
//   2. A refused export shows the server's coded reason to the operator, and
//      no file is downloaded.
//   3. No screen still claims the file format is bank-approved.
//
// Read-only: it clicks buttons but never writes business data.
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
const user = db.prepare("SELECT id, username, role, entity_id, employee_id FROM users WHERE role = 'admin' AND status = 'active' AND must_change_password = 0 LIMIT 1").get();
assert.ok(user, 'An active non-default admin is required for local QA');
const token = jwt.sign({ ...user, jti: randomUUID() }, process.env.JWT_SECRET.trim(), { expiresIn: '15m' });
const fingerprint = () => createHash('sha256').update(JSON.stringify([
  db.prepare('SELECT * FROM employees ORDER BY id').all(),
  db.prepare('SELECT * FROM payroll ORDER BY id').all(),
  db.prepare('SELECT * FROM settings ORDER BY key').all(),
])).digest('hex');
const before = fingerprint();
let checks = 0;
const passed = (name) => { checks++; console.log(`PASS ${name}`); };
let browser;

async function openNav(page, needle) {  const buttons = page.locator('aside button');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const label = ((await button.getAttribute('aria-label')) || (await button.textContent()) || '').trim();
    if (label.includes(needle)) {
      await button.click();
      return label;
    }
  }
  throw new Error(`nav button not found: ${needle}`);
}

// "غير معتمد من البنك" is the honest wording and must survive. An approval
// claim is only a failure when the word is not negated.
function assertNoApprovalClaim(text, where) {
  for (const claim of ['الجاهز للرفع للبنك', 'جاهز للرفع المباشر', 'صيغة الملف المعتمدة', 'متوافق مع معايير', 'معيار البنك المركزي السعودي']) {
    assert.ok(!text.includes(claim), `${where} must not claim "${claim}"`);
  }
  // "معتمد من" is the approval phrasing. It survives only when negated.
  let index = text.indexOf('معتمد من');
  while (index !== -1) {
    const before = text.slice(Math.max(0, index - 4), index);
    assert.ok(
      before.endsWith('غير '),
      `${where} claims bank approval without qualifying it: "${text.slice(Math.max(0, index - 12), index + 20)}"`
    );
    index = text.indexOf('معتمد من', index + 1);
  }
}

(async () => {
  db.prepare('INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)')
    .run(user.id, token, new Date(Date.now() + 900000).toISOString(), 'local-wps-browser-qa');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(({ token, user, base }) => {
    if (location.origin !== base) return;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, { token, user, base });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  const downloads = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${base}/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });

  // ---- WPS audit screen -------------------------------------------------
  await openNav(page, 'تدقيق حماية الأجور');
  await expect(page.locator('#wps-value-date')).toBeVisible();
  const valueDate = page.locator('#wps-value-date');
  assert.equal(await valueDate.getAttribute('type'), 'date');
  assert.ok(await valueDate.inputValue(), 'value date must be prefilled, not blank');

  const exportButton = page.getByRole('button', { name: 'توليد ملف الحوالات', exact: true });
  await expect(exportButton).toBeEnabled();
  await expect(page.locator('main')).toContainText('قالب داخلي غير معتمد من البنك');
  passed('WPS screen asks for a value date and states the format is an internal template');

  // The blockers panel must name the missing settings instead of exporting anyway.
  const blockers = page.locator('[role="status"]').first();
  await expect(blockers).toBeVisible();
  await expect(blockers).toContainText('إعداد ناقص');
  passed('missing bank profile is listed as a blocker');

  await exportButton.click();
  const alert = page.locator('[role="alert"]').last();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('رمز الخطأ: INCOMPLETE_BANK_PROFILE');
  await expect(alert).toContainText('الحقول الناقصة');
  await expect(alert).toContainText('cr_number');
  assert.equal(downloads.length, 0, `a refused export must not download a file (${downloads.join(', ')})`);
  passed('refused export shows the coded reason and downloads nothing');

  // Without a value date there is nothing to send.
  await valueDate.fill('');
  await expect(exportButton).toBeDisabled();
  await valueDate.fill('2026-11-11');
  await expect(exportButton).toBeEnabled();
  passed('export button is disabled without a value date');

  // No screen may still claim the format is bank-approved. "غير معتمد من البنك"
  // is the honest wording, so only an un-negated approval claim is a failure.
  const mainText = await page.locator('main').innerText();
  assertNoApprovalClaim(mainText, 'the WPS screen');
  passed('no bank-approval claim is left on the WPS screen');

  // ---- Payroll screen ---------------------------------------------------
  await openNav(page, 'مسير الرواتب');
  await expect(page.locator('#payroll-value-date')).toBeVisible();
  assert.ok(await page.locator('#payroll-value-date').inputValue(), 'payroll value date must be prefilled');
  await page.getByRole('button', { name: 'ملف الحوالات (SIF)', exact: true }).click();
  await expect.poll(() => dialogs.length).toBeGreaterThan(0);
  assert.ok(
    dialogs.some(message => message.includes('بيانات المنشأة/البنك غير مكتملة')),
    `the payroll screen must surface the refusal, got: ${dialogs.join(' | ')}`
  );
  assert.equal(downloads.length, 0, 'the payroll screen must not download a refused file');
  passed('payroll screen refuses the bank file with a readable reason');

  // ---- Saudi compliance screen -----------------------------------------
  await openNav(page, 'الامتثال والأنظمة السعودية');
  // The screen is lazy-loaded, so wait for its content instead of the shell.
  await expect(page.locator('main')).toContainText('SCR / EDR (قالب داخلي)', { timeout: 30000 });
  await expect(page.locator('main')).toContainText('غير مُعرَّف في الإعدادات', { timeout: 30000 });
  await expect(page.locator('main')).toContainText('محجوب', { timeout: 30000 });
  const saudiText = await page.locator('main').innerText();
  assertNoApprovalClaim(saudiText, 'the compliance screen');
  passed('compliance screen shows the format as internal and the profile as unset');

  assert.equal(pageErrors.length, 0, `no uncaught browser exceptions: ${pageErrors.join(' | ')}`);
  assert.equal(fingerprint(), before, 'QA must not modify employees, payroll or settings');
  passed('no uncaught browser errors and no business data changed');
})().finally(async () => {
  try {
    if (browser) await browser.close();
  } finally {
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } finally {
      db.close();
    }
  }
}).then(() => {
  console.log(`SUCCESS ${checks} browser checks`);
}, error => {
  console.error(error.message);
  process.exitCode = 1;
});
