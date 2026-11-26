/**
 * Fail-closed secret scan for source files.
 *
 * This is not a replacement for a full scanner (Semgrep/Gitleaks); it is a
 * cheap gate that catches the realistic accident in this repo: a real token or
 * a production DATABASE_URL pasted into a source file and committed.
 *
 * By default only tracked files are scanned. Use `--all` to include untracked
 * files (useful for a probe before committing). A line may be waived with
 * `check:secrets-allow <reason>` on the same line or the line above.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ALL = process.argv.includes('--all');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'android',
  'ios',
  'releases',
  'backups',
  'coverage',
  '.build',
  '__tests__',
  '.github',
  'docs',
]);

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.apk',
  '.dump',
  '.db',
  '.db-wal',
  '.db-shm',
  '.gz',
  '.map',
  '.woff',
  '.woff2',
  '.ttf',
  '.lock',
]);

const RULES = [
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'AWS access key ID', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'literal bearer token', re: /\bBearer\s+[A-Za-z0-9._-]{24,}/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

const PLACEHOLDERS = new Set([
  'password',
  'pass',
  'testpass123',
  'replace-this-password',
  'payroll',
  'user',
  'secret',
]);

function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, files);
    } else {
      files.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  }
  return files;
}

function shouldSkip(rel) {
  const parts = rel.split('/');
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  if (SKIP_EXTENSIONS.has(path.extname(rel).toLowerCase())) return true;
  if (rel.startsWith('.github/') || rel.startsWith('docs/')) return true;
  if (rel.includes('.test.') || rel.endsWith('.md') || rel.endsWith('.snap')) return true;
  if (rel.endsWith('package-lock.json') || rel.endsWith('pnpm-lock.yaml')) return true;
  if (rel.endsWith('.sql')) return true; // schema/migration files, never credentials
  return false;
}

function scanDatabaseUrl(line) {
  const match = /(?:postgres(?:ql)?):\/\/([^:\s/@]+):([^@\s/]+)@([^/\s]+)/i.exec(line);
  if (!match) return false;
  const [, , password, host] = match;
  return !isLocalHost(host) && !PLACEHOLDERS.has(password.toLowerCase());
}

function isWaived(lines, index) {
  const marker = 'check:secrets-allow';
  return (
    lines[index].includes(marker) || (index > 0 && lines[index - 1].includes(marker))
  );
}

const candidates = ALL ? walk(ROOT) : trackedFiles();
const findings = [];

for (const rel of candidates) {
  if (shouldSkip(rel)) continue;
  const full = path.join(ROOT, rel);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;

  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isWaived(lines, index)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push(`${rel}:${index + 1}  ${rule.name}`);
    }
    if (scanDatabaseUrl(line)) findings.push(`${rel}:${index + 1}  production database URL with password`);
  });
}

if (findings.length) {
  console.error(`check:secrets — ${findings.length} potential secret(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error('If this is a fixture, add `check:secrets-allow <reason>` on the line above.');
  process.exit(1);
}

console.log(`check:secrets — OK (${candidates.length} files scanned)`);
