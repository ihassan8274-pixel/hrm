/**
 * Second pass of the identity rollout: blue-* → brand-*.
 *
 * Why this pass: the first pass removed indigo, but 217 blue-* references
 * survived across 36 files — including ui.tsx, which every screen's primary
 * button flows through. That left two different blues on screen at once (the
 * sidebar hue and blue-600) and the palette never read as one system.
 *
 * blue-500 ≈ brand-500 and blue-600 ≈ brand-600, so this is a near-identity
 * mapping: the hue barely shifts, but there is now exactly one name for it.
 *
 * Skipped: nothing. emerald stays untouched — it means compliance/success.
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
const byShade = {};

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\bblue-/.test(src)) continue;

  let n = 0;
  const out = src.replace(/\bblue-(50|100|200|300|400|500|600|700|800|900|950)\b/g, (_, shade) => {
    n++;
    byShade[shade] = (byShade[shade] || 0) + 1;
    return `brand-${shade}`;
  });

  if (out !== src) {
    changedFiles++;
    replacements += n;
    if (!DRY) fs.writeFileSync(file, out, 'utf8');
  }
}

console.log(`${DRY ? '[dry] ' : ''}scanned : ${files.length}`);
console.log(`${DRY ? '[dry] ' : ''}changed : ${changedFiles} files`);
console.log(`${DRY ? '[dry] ' : ''}swapped : ${replacements} blue-* -> brand-*`);
const shades = Object.entries(byShade).sort((a, b) => a[0].localeCompare(b[0]));
for (const [shade, count] of shades) console.log(`   blue-${shade} -> brand-${shade}: ${count}`);
