/**
 * One-time identity migration for the Massoabi payroll system.
 *
 * indigo-* → brand-*  (the institutional green).
 *
 * Why indigo and not emerald: emerald-600 is used 47 times as a primary action
 * colour *and* 288 times as a success/compliance tint. Collapsing the two would
 * make "compliant" and "Save" the same colour, which is wrong for a system
 * where green carries regulatory meaning (GOSI, WPS, Saudization status).
 * indigo is purely decorative/secondary, so it is the safe thing to convert.
 *
 * Run with --dry to preview counts.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DRY = process.argv.includes('--dry');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
let changedFiles = 0;
let replacements = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\bindigo-/.test(src)) continue;

  let n = 0;
  const out = src.replace(/\bindigo-(50|100|200|300|400|500|600|700|800|900|950)\b/g, (_, shade) => {
    n++;
    return `brand-${shade}`;
  });

  if (out !== src) {
    changedFiles++;
    replacements += n;
    if (!DRY) fs.writeFileSync(file, out, 'utf8');
  }
}

console.log(`${DRY ? '[dry] ' : ''}scanned : ${files.length} files`);
console.log(`${DRY ? '[dry] ' : ''}changed : ${changedFiles} files`);
console.log(`${DRY ? '[dry] ' : ''}swapped : ${replacements} indigo-* -> brand-*`);
