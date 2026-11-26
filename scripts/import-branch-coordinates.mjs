/**
 * معاينة/استيراد إحداثيات فروع «معصوبي».
 *
 * الافتراضي = معاينة فقط: لا اتصال بقاعدة بيانات، ولا أي تعديل.
 *   node scripts/import-branch-coordinates.mjs
 *   node scripts/import-branch-coordinates.mjs --check-db     (قراءة فقط)
 *   node scripts/import-branch-coordinates.mjs --sql          (طباعة SQL)
 *
 * التنفيذ يتطلب صراحةً: --apply --confirm و DATABASE_URL.
 * لا يُنفَّذ هذا السكربت تلقائياً، ولا يلمس الإنتاج قبل نسخة DB وأمر صريح.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const getValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const csvPath = resolve(getValue('--csv') || 'scripts/branch-coordinates.csv');
const checkDb = args.has('--check-db');
const showSql = args.has('--sql');
const apply = args.has('--apply');
const confirm = args.has('--confirm');

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const header = (lines.shift() || '').split(',').map((cell) => cell.trim());
  if (header.join(',') !== 'name,latitude,longitude') {
    throw new Error(`رأس CSV غير متوقع: ${header.join(',')} (المتوقع: name,latitude,longitude)`);
  }
  const rows = [];
  for (const [i, line] of lines.entries()) {
    const cells = line.split(',').map((cell) => cell.trim());
    if (cells.length !== 3) throw new Error(`السطر ${i + 2}: عدد أعمدة غير صحيح`);
    const [name, latText, lngText] = cells;
    const latitude = Number(latText);
    const longitude = Number(lngText);
    if (!name) throw new Error(`السطر ${i + 2}: اسم الفرع فارغ`);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`السطر ${i + 2}: latitude غير صالح (${latText})`);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`السطر ${i + 2}: longitude غير صالح (${lngText})`);
    }
    rows.push({ name, latitude, longitude });
  }
  if (!rows.length) throw new Error('ملف CSV لا يحتوي فروعاً');
  const names = new Set();
  for (const row of rows) {
    if (names.has(row.name)) throw new Error(`اسم فرع مكرر: ${row.name}`);
    names.add(row.name);
  }
  return rows;
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(resolve('.env'), 'utf8');
    const line = env.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (line) return line.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^['"]|['"]$/g, '');
  } catch {
    // no local .env — caller must export DATABASE_URL
  }
  return null;
}

const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
const insertSql = (row) => [
  `-- ${row.name}`,
  'INSERT INTO branches (name, latitude, longitude)',
  `SELECT ${sqlLiteral(row.name)}, ${row.latitude}, ${row.longitude}`,
  `WHERE NOT EXISTS (SELECT 1 FROM branches WHERE name = ${sqlLiteral(row.name)});`,
].join('\n');

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  console.log(`المصدر: ${csvPath}`);
  console.log(`عدد الفروع في الحصر النهائي: ${rows.length}`);
  rows.forEach((row, i) => {
    console.log(`${String(i + 1).padStart(2, '0')}. ${row.name}  ${row.latitude}, ${row.longitude}`);
  });

  if (checkDb || apply) {
    const connectionString = databaseUrl();
    if (!connectionString) throw new Error('DATABASE_URL غير متاح (صدّره أو ضعه في .env)');
    const { Client } = await import('pg');
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const existing = await client.query('SELECT id, name, latitude, longitude FROM branches ORDER BY id');
      const byName = new Map(existing.rows.map((r) => [r.name, r]));
      console.log('\nالمطابقة مع قاعدة البيانات (قراءة فقط):');
      rows.forEach((row) => {
        const found = byName.get(row.name);
        console.log(`  ${found ? `موجود id=${found.id}` : 'جديد'}: ${row.name}`);
      });
      console.log(`\nالفرع الافتراضي القائم: ${existing.rows.map((r) => `${r.id}:${r.name}`).join(' | ') || '(لا يوجد)'}`);
      console.log('ملاحظة: الفرع الافتراضي من الـ seed لا يُحذف ولا يُعدَّل بهذا السكربت.');

      if (apply) {
        if (!confirm) throw new Error('التنفيذ يحتاج --confirm صريحاً؛ المعاينة وحدها هي الافتراض');
        await client.query('BEGIN');
        let inserted = 0;
        try {
          for (const row of rows) {
            const res = await client.query(
              'INSERT INTO branches (name, latitude, longitude) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM branches WHERE name = $1)',
              [row.name, row.latitude, row.longitude],
            );
            inserted += res.rowCount || 0;
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        console.log(`\nتم إنشاء ${inserted} فرعاً داخل معاملة واحدة. لا يوجد خصم راتب ولا ربط موظفين.`);
      }
    } finally {
      await client.end();
    }
  }

  if (showSql && !apply) {
    console.log('\n--- SQL المقترح (لم يُنفَّذ) ---');
    console.log(rows.map(insertSql).join('\n\n'));
  }
  if (!checkDb && !apply) {
    console.log('\nهذه معاينة فقط: لا اتصال بقاعدة بيانات ولا أي تعديل.');
  }
}

main().catch((error) => {
  console.error(`فشل: ${error.message}`);
  process.exitCode = 1;
});
