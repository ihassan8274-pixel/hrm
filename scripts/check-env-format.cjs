/**
 * Validates the shape of the environment files.
 *
 * `dotenv` parses a multi-line quoted value into one clean string, so the
 * application itself never sees the problem — but `docker run --env-file .env`
 * takes the first physical line only and keeps the quote characters, and the
 * connection then fails with a misleading "password authentication failed".
 * Compose reads the file the same way.
 *
 * The check covers:
 *   - DATABASE_URL present, on one line, unquoted, and a parseable PostgreSQL URL
 *   - CORS_ORIGINS present in .env.example (the app refuses to start in
 *     production without it)
 *   - no duplicated keys, which silently take the last value
 *
 * Usage:
 *   node scripts/check-env-format.cjs            # check .env and .env.example
 *   node scripts/check-env-format.cjs --fix     # collapse a multi-line value
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX = process.argv.includes('--fix');

const problems = [];

/** Reads a KEY=VALUE file into an ordered list of { key, value, line }. */
function readEntries(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const entries = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) entries.push({ key: match[1], value: match[2], line: index + 1 });
  });
  return { file, raw, entries };
}

function checkDatabaseUrl(parsed) {
  const entry = parsed.entries.find((e) => e.key === 'DATABASE_URL');
  if (!entry) {
    problems.push(`${path.basename(parsed.file)}: DATABASE_URL is missing`);
    return;
  }
  const value = entry.value.trim();
  const quoted = value.startsWith('"') || value.startsWith("'");
  const closesOnSameLine = !quoted || (value.length > 1 && value.endsWith(value[0]));

  if (quoted && !closesOnSameLine) {
    problems.push(
      `${path.basename(parsed.file)}:${entry.line}  DATABASE_URL spans several lines — ` +
        'put it on one line (`docker run --env-file` reads the first line only)',
    );
    return;
  }
  const bare = quoted ? value.slice(1, -1) : value;
  if (quoted) {
    problems.push(
      `${path.basename(parsed.file)}:${entry.line}  DATABASE_URL is quoted — ` +
        'remove the quotes (`--env-file` keeps them as part of the value)',
    );
    return;
  }
  try {
    const url = new URL(bare);
    if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error('unexpected protocol');
  } catch {
    problems.push(
      `${path.basename(parsed.file)}:${entry.line}  DATABASE_URL is not a valid PostgreSQL URL ` +
        '(expected postgresql://user:password@host:5432/database)',
    );
  }
}

function checkDuplicateKeys(parsed) {
  const seen = new Map();
  for (const entry of parsed.entries) {
    if (seen.has(entry.key)) {
      problems.push(
        `${path.basename(parsed.file)}:${entry.line}  duplicate key ${entry.key} ` +
          `(first defined on line ${seen.get(entry.key)}) — the last value silently wins`,
      );
    }
    seen.set(entry.key, entry.line);
  }
}

function checkCorsExample(parsed) {
  if (!parsed.entries.some((e) => e.key === 'CORS_ORIGINS')) {
    problems.push(
      `${path.basename(parsed.file)}: CORS_ORIGINS is missing — the app refuses to start ` +
        'in production without it',
    );
  }
}

// .env holds real secrets, so it is never printed. Only the key names and the
// problem text are reported.
const envFile = readEntries(path.join(ROOT, '.env'));
if (envFile) {
  checkDatabaseUrl(envFile);
  checkDuplicateKeys(envFile);

  if (FIX) {
    const match = /^DATABASE_URL\s*=\s*"([\s\S]*?)"\s*$/m.exec(envFile.raw);
    if (match) {
      const collapsed = match[1].replace(/\s+/g, '');
      const fixed = envFile.raw.replace(
        /^DATABASE_URL\s*=\s*"[\s\S]*?"\s*$/m,
        `DATABASE_URL=${collapsed}`,
      );
      fs.writeFileSync(path.join(ROOT, '.env'), fixed, 'utf8');
      console.log('DATABASE_URL collapsed to a single unquoted line.');
    }
  }
} else {
  console.log('.env not found — skipped (it is git-ignored; CI uses its own variables).');
}

const exampleFile = readEntries(path.join(ROOT, '.env.example'));
if (exampleFile) {
  checkDatabaseUrl(exampleFile);
  checkDuplicateKeys(exampleFile);
  checkCorsExample(exampleFile);
}

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} environment problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('OK: the environment files are well formed.');
