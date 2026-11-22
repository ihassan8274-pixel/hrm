/**
 * Opens every screen of the application in a real browser and reports what
 * went wrong.
 *
 * The point is the failures that nothing else catches. Type-checking does not
 * know that a screen reads a field the API stopped sending; a unit test does
 * not render the component. This drives the built application the way a user
 * does — sign in, then walk the navigation — and for each screen records:
 *
 *   - the JavaScript errors the page raised
 *   - the console errors it printed
 *   - the requests that failed
 *   - whether the error boundary caught a render error
 *   - whether anything was rendered at all
 *
 * It reads the navigation out of src/App.tsx, so a screen that is added and
 * not listed cannot be missed.
 *
 * With no base URL it starts the application itself against the test
 * database and stops it afterwards:
 *
 *   node scripts/ui-smoke.mjs
 *   node scripts/ui-smoke.mjs <baseUrl> <username> <password> [outFile]
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("file:///E:/MASSOBI APP/payroll/package.json");
const { chromium } = require("playwright");

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const positional = argv.filter((a) => !a.startsWith("--"));
const started = positional.length === 0;
const base = started ? "http://127.0.0.1:3011" : positional[0];
const username = started ? "integration_admin" : positional[1];
const password = started ? "integration-test-password" : positional[2];
const outFile = started ? path.join("scripts", ".build", "ui-smoke-report.json") : positional[3];

if (!base || !username || !password) {
  console.error("usage: node ui-smoke.mjs [baseUrl username password [outFile]]");
  process.exit(1);
}

/** Starts the built application against the test database. */
let server = null;
if (started) {
  const envFile = process.env.PAYROLL_ENV_FILE || path.join("scripts", ".build", "test.env");
  server = spawn("node", ["dist/server.cjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PAYROLL_ENV_FILE: path.resolve(envFile), PORT: "3011", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  // Wait for the application to answer.
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const response = await fetch(base + "/api/health");
      up = response.ok;
    } catch {
      /* not up yet */
    }
  }
  if (!up) {
    console.error("the application did not start");
    server.kill();
    process.exit(1);
  }
  console.log(`the application is running on ${base} (environment: ${envFile})`);
}

/** The navigation, read from the application source. */
function readNav() {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  const start = src.indexOf("const navSections");
  const end = src.indexOf("\n  ];", start);
  const block = src.slice(start, end);
  const items = [];
  for (const m of block.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*key:\s*'([^']+)'\s*,\s*defaultLabel:\s*'([^']*)'/g)) {
    items.push({ id: m[1], label: m[3] });
  }
  return items;
}

/** --only=id,id walks only the named screens. */
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null;

let nav = readNav();
if (only) {
  nav = nav.filter((item) => only.includes(item.id));
  console.log(`walking only: ${nav.map((n) => n.id).join(", ")}`);
}
console.log(`screens in the navigation: ${nav.length}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let current = null;
let errors = [];
let consoleErrors = [];
let failedRequests = [];

page.on("pageerror", (e) => errors.push(String(e.message || e).split("\n")[0].slice(0, 300)));
page.on("console", async (m) => {
  if (m.type() !== "error") return;
  // React passes the component stack as an extra argument, so the whole
  // argument list is read, not only the first string.
  const parts = [];
  for (const arg of m.args()) {
    try {
      parts.push(await arg.jsonValue());
    } catch {
      parts.push(arg.toString());
    }
  }
  const text = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  // The hot-reload socket belongs to the development server; when it is
  // missing it says nothing about the screen.
  if (/WebSocket connection to 'ws:\/\/127\.0\.0\.1:24678/.test(text)) return;
  consoleErrors.push(text.slice(0, 900));
});
page.on("response", (r) => {
  const url = r.url();
  if (!url.startsWith(base)) return;
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${new URL(url).pathname}`);
});

// Sign in.
await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
const passwordField = page.locator('input[type=password]').first();
await passwordField.waitFor({ timeout: 30000 });
await passwordField.fill(password);
const textInputs = page.locator('input[type=text]');
for (let i = 0; i < (await textInputs.count()); i++) await textInputs.nth(i).fill(username);
await page.keyboard.press("Enter");
await page.waitForTimeout(4000);
console.log("signed in");

const results = [];

for (const item of nav) {
  errors = [];
  consoleErrors = [];
  failedRequests = [];

  // The navigation is a long scrollable list, and an item deep in it is not
  // always brought into view by the click itself. The click is therefore made
  // twice, and if the browser still refuses, the button is pressed from
  // inside the page — the same handler the user triggers.
  let opened = true;
  let openError = "";
  let byScript = false;
  for (let attempt = 0; attempt < 2 && opened; attempt++) {
    try {
      const button = page.locator(`[data-view="${item.id}"]`);
      await button.waitFor({ state: "attached", timeout: 6000 });
      await button.scrollIntoViewIfNeeded({ timeout: 4000 });
      await button.click({ timeout: 6000 });
      openError = "";
      break;
    } catch (error) {
      openError = String(error.message || error).split("\n").slice(0, 6).join(" | ").slice(0, 600);
      // A build without the data-view attribute: fall back to the label the
      // navigation carries, so the harness also works against the running
      // application.
      try {
        const byLabel = page.locator(`nav button[aria-label="${item.label}"]`);
        await byLabel.waitFor({ state: "attached", timeout: 4000 });
        await byLabel.click({ timeout: 5000 });
        openError = "";
        break;
      } catch {
        if (attempt === 1) {
          // The last resort: press the button from inside the page.
          byScript = await page.evaluate((id) => {
            const el = document.querySelector(`[data-view="${id}"]`);
            if (!el) return false;
            el.scrollIntoView({ block: "center" });
            el.click();
            return true;
          }, item.id);
          if (byScript) {
            openError = "";
            opened = true;
            break;
          }
          opened = false;
        } else {
          await page.waitForTimeout(600);
        }
      }
    }
  }

  // The screen is only open when the application says so: the content area
  // carries the name of the screen it is showing. Waiting for that is
  // better than waiting a fixed moment, because a heavy screen takes longer
  // to arrive than a light one.
  let switched = true;
  try {
    await page.locator(`[data-screen][data-screen="${item.id}"]`).waitFor({ state: "attached", timeout: 10000 });
  } catch {
    switched = false;
  }

  // Let the screen settle: the chunks are lazy, so the first visit of a
  // screen downloads and evaluates it. The application shows a placeholder
  // while the chunk is on its way, and a screen that is measured during the
  // placeholder proves nothing — so the wait is for the screen itself, not
  // for a fixed moment.
  await page.waitForTimeout(1200);
  let stillLoading = false;
  try {
    await page.waitForFunction(
      () => {
        const region = document.querySelector("[data-screen]");
        return Boolean(region) && !/جارٍ تحميل الشاشة/.test(region.innerText);
      },
      undefined,
      { timeout: 8000 },
    );
  } catch {
    stillLoading = true;
  }

  // The content of the screen itself, not the application chrome around it.
  let full = "";
  try {
    full = (await page.evaluate(() => {
      const region = document.querySelector("[data-screen]");
      return (region ? region.innerText : document.body.innerText).replace(/\s+/g, " ").trim();
    }));
  } catch {
    full = "(the page could not be read)";
  }
  const content = full.slice(0, 600);

  // Two screens are only the same screen when the whole of their text is
  // the same: the first six hundred characters are the header of every
  // screen.
  const previousContent = results.length ? results[results.length - 1].full : "";
  const unchanged = Boolean(previousContent) && full === previousContent;

  // The error boundary catches a render error and shows a message instead of
  // letting it reach the page. A crash therefore does not raise a page
  // error: the boundary's own message is the signal that the screen failed.
  const boundary = /حدث خطأ في هذه الشاشة/.test(content);

  // The form is where the shared components live. A screen can open cleanly
  // and still fail the moment its dialog is shown, so the dialog is opened
  // too and is checked the same way.
  let dialog = null;
  try {
    // The button has to be the one of the screen, not one of the navigation:
    // the navigation carries the same words as the screens.
    const opener = page.locator("[data-screen] button", { hasText: /إضافة|جديد|تسجيل|تقديم|طلب/ }).first();
    if ((await opener.count()) > 0 && (await opener.isVisible())) {
      await opener.click({ timeout: 5000 });
      await page.waitForTimeout(900);
      const card = page.locator('[role=dialog]').first();
      const open = (await card.count()) > 0;
      const fields = open ? await card.locator("input,select,textarea").count() : 0;
      const text = open ? (await card.innerText()).replace(/\s+/g, " ").trim() : "";
      dialog = { open, fields, chars: text.length };
      if (open) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    }
  } catch (error) {
    dialog = { open: false, fields: 0, chars: 0, error: String(error.message || error).slice(0, 200) };
  }

  // The error boundary wraps the whole application, so one crash takes the
  // navigation with it and every screen after it would be reported as
  // missing. Reloading puts the application back and the walk continues.
  if (!opened || content.length < 5) {
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2500);
    } catch {
      /* the application is beyond recovery; the screen is reported as failed */
    }
  }

  results.push({
    id: item.id,
    label: item.label,
    opened,
    openError,
    byScript,
    switched,
    errors: [...errors],
    consoleErrors: [...consoleErrors],
    failedRequests: [...failedRequests],
    content,
    full,
    empty: content.length < 5,
    unchanged,
    boundary,
    stillLoading,
    dialog,
  });

  const bad = errors.length + consoleErrors.length + failedRequests.length;
  const mark = !opened ? "MISSING"
    : !switched ? "NOT-SHOWN"
    : boundary ? "CRASH"
    : bad ? "FAIL"
    : stillLoading ? "LOADING"
    : content.length < 5 ? "EMPTY"
    : unchanged ? "SAME"
    : "ok  ";
  const dialogMark = dialog && dialog.open ? ` dialog(${dialog.fields} fields)` : dialog ? "" : "";
  console.log(`${mark} ${item.id.padEnd(26)} ${item.label.slice(0, 30)}  ${content.length} chars${dialogMark}`);
  for (const e of errors) console.log(`        js    ${e}`);
  for (const e of consoleErrors) console.log(`        log   ${e}`);
  for (const e of failedRequests) console.log(`        http  ${e}`);
}

await browser.close();
if (server) server.kill();

const failed = results.filter((r) => !r.opened || !r.switched || r.stillLoading || r.errors.length || r.consoleErrors.length || r.failedRequests.length || r.boundary);
const crashed = results.filter((r) => r.boundary);
const empty = results.filter((r) => r.empty);
const unchanged = results.filter((r) => r.unchanged);
const report = {
  base,
  screens: results.length,
  failed: failed.length,
  crashed: crashed.length,
  clean: results.length - failed.length,
  empty: empty.length,
  unchanged: unchanged.length,
  details: results,
};
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
console.log("");
console.log(`screens: ${results.length} | clean: ${report.clean} | with problems: ${report.failed} | crashed: ${report.crashed} | empty: ${report.empty} | unchanged: ${report.unchanged}`);
if (crashed.length) console.log(`  crashed: ${crashed.map((r) => r.id).join(', ')}`);
if (empty.length) console.log(`  empty: ${empty.map((r) => r.id).join(', ')}`);
if (unchanged.length) console.log(`  unchanged: ${unchanged.map((r) => r.id).join(', ')}`);
if (outFile) console.log(`report: ${outFile}`);
