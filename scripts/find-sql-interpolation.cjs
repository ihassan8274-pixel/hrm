/**
 * Finds SQL built by interpolating request data.
 *
 * Prepared statements already neutralise bound values. What they do NOT protect
 * is an identifier or a whole clause spliced into the SQL text — a column name,
 * a sort column, a table name, or a fragment like "AND x = 1". Those are the
 * injection points that survive parameterisation, and no amount of
 * z.coerce.number() on req.body fixes them.
 *
 * Only reports interpolations whose source is user-controllable (req.*, body
 * variables derived from it, or query params).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// ${...} inside a SQL-looking template literal.
const INTERP = /\$\{([^}]+)\}/g;

const findings = [];

for (const abs of walk(path.join(ROOT, 'server'))) {
  if (abs.includes('.test.ts')) continue;
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');

  // Find template literals that contain SQL keywords AND interpolation.
  const re = /`([^`]{20,})`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(body)) continue;
    if (!body.includes('${')) continue;

    const vars = [];
    INTERP.lastIndex = 0;
    let v;
    while ((v = INTERP.exec(body)) !== null) vars.push(v[1].trim());

    const line = src.slice(0, m.index).split('\n').length;
    findings.push({ rel, line, vars, sql: body.replace(/\s+/g, ' ').slice(0, 130) });
  }
}

fs.writeFileSync(
  path.join(ROOT, 'scripts', 'sql-interpolation-report.txt'),
  findings
    .map((f) => `${f.rel}:${f.line}\n  vars: ${f.vars.join(' | ')}\n  ${f.sql}`)
    .join('\n\n'),
  'utf8'
);

console.log(`SQL templates with interpolation: ${findings.length}`);
const files = [...new Set(findings.map((f) => f.rel))];
console.log(`files: ${files.length}`);
for (const f of files) console.log('  ' + f);

/**
 * Four interpolations are intentional and must stay, because a prepared
 * statement binds values, not identifiers. Each resolves to something the code
 * controls before the SQL text is built — never to a raw request value:
 *
 *   server/routes/payroll.ts   `field` → CORRECTABLE_PAYROLL_FIELDS (Set lookup,
 *                              then bound through the whitelist literal)
 *   server/routes/payroll.ts   `fields.join(', ')` → fixed column-name strings
 *                              appended in code, never taken from the request
 *   server/routes/employees.ts `whereClause` → one of two fixed literals chosen
 *                              by req.user.role; the values stay bound as ?
 *   server/routes/importer.ts  `m.table` / `m.uniqueness.dbColumn` → table and
 *                              column identifiers from the hard-coded
 *                              IMPORT_MODULES registry; the request's module
 *                              key only picks an entry via getModule() and is
 *                              never spliced into SQL. All row values stay
 *                              bound as ?.
 *   server/index.ts           `safeName` → a table name read from
 *                              information_schema (the database's own list),
 *                              quoted and with every double quote doubled
 *                              before it reaches the SQL text. The values in
 *                              the table are still bound as ?.
 *
 * Anything beyond these fails the build. When adding an interpolation on
 * purpose, allowlist the file here and record why.
 */
const ALLOWED = new Set([
  'server/routes/payroll.ts',
  'server/routes/employees.ts',
  'server/routes/importer.ts',
  'server/index.ts',
]);

const unexpected = files.filter((f) => !ALLOWED.has(f));
if (unexpected.length) {
  console.error('\nFAIL: unexpected SQL interpolation in:');
  for (const f of unexpected) console.error('  ' + f);
  process.exit(1);
}
console.log('OK: only allowlisted interpolations remain.');
