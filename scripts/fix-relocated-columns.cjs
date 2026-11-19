/**
 * Moves the write-path columns into ADDITIONAL_COLUMNS.
 *
 * Background: the merge of duplicate table keys folded entries into whichever
 * copy appeared first. For tables that only existed in CREATED_TABLE_COLUMNS,
 * that silently made their columns unreachable — the migration reported
 * success while the endpoints kept returning 500, because
 * CREATE TABLE IF NOT EXISTS is a no-op on an already-existing table.
 *
 * ADDITIONAL_COLUMNS is applied to every table that exists, which is what these
 * tables need. Block bounds are located by line so no brace-tracking is needed.
 *
 * Run with --dry to preview.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'server', 'db', 'column-reconciliation.ts');
const GENERATED = path.join(__dirname, 'generated-additional-columns.txt');
const DRY = process.argv.includes('--dry');

const lines = fs.readFileSync(FILE, 'utf8').split('\n');

const decl = (name) => lines.findIndex((l) => l.startsWith(`export const ${name}`));
const closeAfter = (from) => {
  for (let i = from + 1; i < lines.length; i++) if (lines[i] === '};') return i;
  return -1;
};

const addStart = decl('ADDITIONAL_COLUMNS');
const addEnd = closeAfter(addStart);
const creStart = decl('CREATED_TABLE_COLUMNS');
const creEnd = closeAfter(creStart);

if (addStart < 0 || addEnd < 0 || creStart < 0 || creEnd < 0) {
  console.log('could not locate block bounds');
  process.exit(1);
}

const RELOCATE = [
  'employee_clearances', 'government_renewals', 'eos_calculations',
  'salary_slips', 'flight_tickets', 'disciplinary_violations',
  'medical_dependents', 'medical_policies', 'fleet_vehicles',
  'additional_salaries', 'payroll_corrections', 'checklists', 'tasks',
];

// Strip the relocate-list entries from CREATED_TABLE_COLUMNS (801..850).
const creBody = lines.slice(creStart + 1, creEnd);
const keptCre = [];
let removed = 0;
for (let i = 0; i < creBody.length; i++) {
  const m = creBody[i].match(/^ {2}(\w+): \{$/);
  if (m && RELOCATE.includes(m[1])) {
    removed++;
    while (i < creBody.length && !/^ {2}\},?$/.test(creBody[i])) i++;
    continue;
  }
  keptCre.push(creBody[i]);
}

// Append the generated block to ADDITIONAL_COLUMNS (725..790).
const generated = fs.readFileSync(GENERATED, 'utf8').trimEnd().split('\n');
const addBody = lines.slice(addStart + 1, addEnd);
const newAddBody = [
  ...addBody,
  '',
  '  // --- Write-path columns missing from the schema ---',
  '  //',
  '  // Each one makes a POST/PUT that previously returned 500 succeed.',
  '  // Found by scripts/find-write-column-drift.cjs, which rewrites every INSERT',
  '  // column list into a SELECT and lets SQLite resolve the names. The SELECT',
  '  // drift test cannot catch this class: `SELECT *` resolves no columns.',
  ...generated,
];

const out = [
  ...lines.slice(0, addStart + 1),
  ...newAddBody,
  ...lines.slice(addEnd, creStart + 1),
  ...keptCre,
  ...lines.slice(creEnd),
];

console.log(`${DRY ? '[dry] ' : ''}removed from CREATED_TABLE_COLUMNS : ${removed}`);
console.log(`${DRY ? '[dry] ' : ''}generated rows added to ADDITIONAL_COLUMNS : ${generated.length}`);
if (!DRY) fs.writeFileSync(FILE, out.join('\n'), 'utf8');