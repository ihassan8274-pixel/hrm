/**
 * Merges duplicate table keys inside ADDITIONAL_COLUMNS.
 *
 * The write-drift fix was applied in two passes, so a few tables ended up with
 * two entries (and TypeScript rejects duplicate keys in an object literal).
 * This merges them, keeping every distinct column.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'server', 'db', 'column-reconciliation.ts');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

const out = [];
const seen = new Set();   // tables already emitted
let merges = 0;
let pending = null;       // { table, startIdx } of the entry being read

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const open = line.match(/^ {2}(\w+): \{$/);

  if (!open) {
    if (pending && /^ {2}\},?$/.test(line)) pending = null;   // closed
    out.push(line);
    continue;
  }

  const table = open[1];
  if (!seen.has(table)) {
    seen.add(table);
    out.push(line);
    pending = null;
    continue;
  }

  // Duplicate table: fold its columns into the entry already emitted.
  merges++;
  // Collect the columns from this block.
  const cols = [];
  let j = i + 1;
  while (j < lines.length && !/^ {2}\},?$/.test(lines[j])) {
    cols.push(lines[j]);
    j++;
  }
  // Which of those columns are already present in the first occurrence?
  const firstIdx = out.findIndex((l) => l === `  ${table}: {`);
  let k = firstIdx + 1;
  const existing = new Set();
  while (k < out.length && !/^ {2}\},?$/.test(out[k])) {
    const m = out[k].match(/^ {4}(\w+):/);
    if (m) existing.add(m[1]);
    k++;
  }

  const additions = cols.filter((l) => {
    const m = l.match(/^ {4}(\w+):/);
    return m && !existing.has(m[1]);
  });

  // Insert the new columns just before the first block's closing brace.
  let closeIdx = firstIdx + 1;
  while (closeIdx < out.length && !/^ {2}\},?$/.test(out[closeIdx])) closeIdx++;

  if (additions.length) {
    out.splice(closeIdx, 0, ...additions);
  }
  i = j; // skip the duplicate block
}

console.log(`duplicate table keys merged: ${merges}`);
fs.writeFileSync(FILE, out.join('\n'), 'utf8');