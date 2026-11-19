/**
 * Third identity pass: emerald primary-action buttons → brand.
 *
 * emerald has two jobs in this codebase and they must be separated:
 *
 *   KEEP emerald  — the button *is* a pass/approval result. "اعتماد" leave
 *                   turning green is meaningful and matches every emerald
 *                   badge beside it. Recolouring it to blue makes an approval
 *                   look like a neutral command and breaks the visual contract
 *                   between the button and the status chip it produces.
 *
 *   CHANGE       — a plain command: add employee, save, export PDF, open kiosk,
 *                   record attendance. These are actions, and they should wear
 *                   the single brand hue so the whole product reads as one system.
 *
 * The allowlist below is an explicit file:line list, verified by reading each
 * site. Guessing from a verb heuristic is not safe here — "تسجيل حضور"
 * (record attendance) contains a compliance-ish verb but is an action, while
 * "اعتماد" (approve) is a result.
 *
 * Emerald is otherwise untouched: 965 status/badge references stay green.
 *
 * Run with --dry to preview.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DRY = process.argv.includes('--dry');

/**
 * file -> 1-based line numbers that MUST keep emerald.
 *
 * Only genuine approval *results* stay green, so the button matches the status
 * badge it produces. Verified by reading each site:
 *   ManagerInboxView:45  اعتماد   — approves a leave request
 *   ManagerInboxView:59  اعتماد   — approves a leave request
 *
 * Deliberately NOT kept (they contain compliance-ish verbs but are commands):
 *   OvertimeRamadanView:198  تسجيل عمل إضافي — opens the add-overtime modal
 *   SaudiComplianceView:850  تجديد فوري   — opens the renewal modal
 *   AttendanceView:591       تسجيل حضور   — picks a punch type
 */
const KEEP_EMERALD = {
  'src/components/ManagerInboxView.tsx': [45, 59],
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// Only these shades are the "solid green button" pattern.
// 50/100/200 are pale tints used for status backgrounds — never touch them.
const BUTTON_SHADES = /\bemerald-(500|600|700|800|900|950)\b/g;

let changedFiles = 0;
let changed = 0;
let kept = 0;

for (const abs of walk(SRC)) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const keepLines = new Set(KEEP_EMERALD[rel] || []);
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  let touched = 0;

  const out = lines
    .map((line, idx) => {
      const lineNo = idx + 1;
      // A button is on the line, or within the two lines above it (className
      // frequently wraps onto the next line after the opening tag).
      const inButton = lineNo <= 0 ? false : hasButtonContext(lines, lineNo);
      if (!inButton) return line;
      if (keepLines.has(lineNo)) {
        kept += 1;
        return line;
      }
      if (!BUTTON_SHADES.test(line)) {
        BUTTON_SHADES.lastIndex = 0;
        return line;
      }
      BUTTON_SHADES.lastIndex = 0;
      const next = line.replace(BUTTON_SHADES, (m) => m.replace('emerald', 'brand'));
      if (next !== line) touched += 1;
      return next;
    })
    .join('\n');

  if (touched) {
    changedFiles += 1;
    changed += touched;
    if (!DRY) fs.writeFileSync(abs, out, 'utf8');
  }
}

function hasButtonContext(lines, lineNo) {
  // scan a small window around the line for an opening <button or <Btn
  for (let i = Math.max(0, lineNo - 3); i < Math.min(lines.length, lineNo + 1); i++) {
    if (/<(button|Btn)\b/.test(lines[i])) return true;
  }
  return false;
}

console.log(`${DRY ? '[dry] ' : ''}files changed : ${changedFiles}`);
console.log(`${DRY ? '[dry] ' : ''}lines changed : ${changed}`);
console.log(`${DRY ? '[dry] ' : ''}kept emerald  : ${kept} (approval results)`);