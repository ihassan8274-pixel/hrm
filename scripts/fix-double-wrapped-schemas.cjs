/**
 * Removes the redundant inner `body:` wrapper from Zod schemas.
 *
 * `validateBody(schema)` already wraps the schema as z.object({ body: schema }).
 * A schema that itself declares `body:` therefore demands
 * { body: { body: {...} } }, so every real request 400s with
 *   "body.body: expected object, received undefined".
 *
 * 21 of 31 schemas had exactly this shape — which is why none of them were
 * wired to a route: they would have rejected 100% of traffic.
 *
 * The pattern is regular, so a line-based transform is used instead of brace
 * tracking: delete the `  body: z.object({` opener and its matching `  }),`
 * closer, and de-indent everything between them by two spaces.
 *
 * Run with --dry to preview.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'server', 'middleware', 'validation.ts');
const DRY = process.argv.includes('--dry');

const lines = fs.readFileSync(FILE, 'utf8').split('\n');
const out = [];
const fixed = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Opening of the inner wrapper: exactly "  body: z.object({"
  if (!/^ {2}body: z\.object\(\{$/.test(line)) {
    out.push(line);
    continue;
  }

  // Find the schema name by walking back to the "export const X = z.object({" line
  let name = '(unknown)';
  for (let k = out.length - 1; k >= 0; k--) {
    const m = out[k].match(/^export const (\w+Schema) = z\.object\(\{$/);
    if (m) { name = m[1]; break; }
    if (/^export const \w+ =/.test(out[k])) break;
  }

  // Collect until the matching closer "  }),"
  const inner = [];
  let j = i + 1;
  let closed = false;
  while (j < lines.length) {
    if (/^ {2}\}\),$/.test(lines[j])) { closed = true; break; }
    inner.push(lines[j].replace(/^ {2}/, ''));   // de-indent one level
    j++;
  }

  if (!closed) {
    // No matching closer: leave the file untouched from here on.
    out.push(line);
    continue;
  }

  out.push(...inner);
  i = j;               // skip the closer
  fixed.push(name);
}

console.log(`${DRY ? '[dry] ' : ''}schemas fixed : ${fixed.length}`);
for (const n of fixed) console.log(`   ${n}`);
if (!DRY) fs.writeFileSync(FILE, out.join('\n'), 'utf8');
