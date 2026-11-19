import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { validate, payrollCorrectSchema } from '../validation';

/**
 * Regression cover for the two validation defects found during the security pass.
 *
 * 1. validate() parsed the input and then threw the result away. Handlers kept
 *    reading raw req.body, so every z.coerce.number() was decorative: "42"
 *    reached numeric columns as a string. Coercion now writes back.
 *
 * 2. 21 of 31 schemas wrapped themselves in `body:`, while validateBody()
 *    already wraps. Those demanded { body: { body: {...} } } and would have
 *    rejected 100% of real traffic â€” which is why none were ever wired up.
 */

function fakeRes() {
  // statusCode starts null, not 0: middleware that accepts the request never
  // touches it, and asserting "still 0" would pass even if something wrote 0.
  const r: any = { statusCode: null, payload: null, headersSent: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.payload = b; return r; };
  return r;
}

describe('validate()', () => {
  it('coerces string numbers onto req.body', async () => {
    // payrollCorrectSchema is a *body* schema: validateBody wraps it as
    // z.object({ body: schema }) before validate() sees it. Passing the bare
    // schema here would ask for { body: { body: {...} } } and 400 every time.
    const wrapped = z.object({ body: payrollCorrectSchema });
    const req: any = {
      body: {
        month: '1', year: '2026', employee_id: '7',
        field: 'bonuses', new_value: '750', reason: 'test correction',
      },
      query: {}, params: {},
    };
    const res = fakeRes();
    const next = () => {};

    await validate(wrapped)(req, res, next);

    expect(res.statusCode).toBeNull();          // not rejected
    expect(typeof req.body.employee_id).toBe('number');
    expect(req.body.employee_id).toBe(7);
    expect(typeof req.body.new_value).toBe('number');
    expect(req.body.new_value).toBe(750);
  });

  it('leaves the body untouched when validation fails', async () => {
    const req: any = {
      body: { month: 99, year: '2026', employee_id: '7', field: 'bonuses', new_value: '750', reason: 'x' },
      query: {}, params: {},
    };
    const res = fakeRes();
    await validate(z.object({ body: payrollCorrectSchema }))(req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(typeof req.body.employee_id).toBe('string');   // still the raw input
  });

  it('applies .default() to missing fields', async () => {
    const schema = payrollCorrectSchema.extend({ reason: payrollCorrectSchema.shape.reason });
    const req: any = {
      body: { month: 1, year: 2026, employee_id: 1, field: 'bonuses', new_value: 10, reason: 'ok' },
      query: {}, params: {},
    };
    await validate(schema)(req, fakeRes(), () => {});
    expect(req.body.field).toBe('bonuses');
  });

  it('rejects with 400 and lists the offending field', async () => {
    const req: any = {
      body: { month: 99, year: 2026, employee_id: 1, field: 'bonuses', new_value: 10, reason: 'x' },
      query: {}, params: {},
    };
    const res = fakeRes();
    await validate(payrollCorrectSchema)(req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.payload.details[0].field).toContain('month');
  });

  it('never calls next() when validation fails', async () => {
    const req: any = { body: {}, query: {}, params: {} };
    const res = fakeRes();
    let called = false;
    await validate(payrollCorrectSchema)(req, res, () => { called = true; });
    expect(called).toBe(false);
  });
});

describe('schemas are not double-wrapped', () => {
  // validateBody(schema) wraps as z.object({ body: schema }). A schema that
  // declares its own `body:` therefore needs a nested object that no real
  // request ever sends, and every call 400s.
  const FILE = path.resolve(__dirname, '..', 'validation.ts');
  const src = readFileSync(FILE, 'utf8');

  const schemaBlocks = src
    .split(/^export const /m)
    .slice(1)
    .map((chunk) => {
      const name = chunk.slice(0, chunk.indexOf(' ='));
      const end = chunk.indexOf('\n});');
      return { name, body: end > 0 ? chunk.slice(0, end) : chunk };
    });

  it('finds the exported schemas', () => {
    expect(schemaBlocks.length).toBeGreaterThan(20);
  });

  it('none of them declare their own top-level body key', () => {
    const wrapped = schemaBlocks
      .filter((s) => /^ {2}body: z\.object\(\{$/m.test(s.body))
      .map((s) => s.name);
    expect(
      wrapped,
      `these schemas re-wrap body and would reject every request: ${wrapped.join(', ')}`
    ).toEqual([]);
  });
});

describe('payrollCorrectSchema constrains the spliced column', () => {
  // The route interpolates `field` into SQL text, so it must be an enum and not
  // a free string.
  it.each(['net_salary', 'id', "bonuses = 0, admin--", ''])(
    'rejects %j',
    (bad) => {
      const r = payrollCorrectSchema.safeParse({
        month: 1, year: 2026, employee_id: 1, field: bad, new_value: 1, reason: 'test',
      });
      expect(r.success).toBe(false);
    }
  );

  it.each(['allowances', 'deductions', 'bonuses', 'penalties'])('accepts %s', (good) => {
    const r = payrollCorrectSchema.safeParse({
      month: 1, year: 2026, employee_id: 1, field: good, new_value: 1, reason: 'test',
    });
    expect(r.success).toBe(true);
  });
});

// Guards the write-path drift class the SELECT-based test cannot see.
describe('write statements match the schema', () => {
  // Vitest runs with cwd = project root, and __dirname is not the file's own
  // directory here, so resolve from cwd and fall back to walking up from it.
  const ROOT = process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  const dbPath = path.join(ROOT, 'payroll.db');
  const dbExists = existsSync(dbPath);
  // Resolved with a dynamic describe so the file still loads where payroll.db
  // is absent (CI, a fresh clone) instead of throwing during collection.
  const runIf = dbExists ? describe : describe.skip;

  runIf('with a database present', () => {
    it('every INSERT column resolves against the database', () => {
    const db = new Database(dbPath, { readonly: true });
    const problems: string[] = [];

    for (const abs of walk(path.join(ROOT, 'server'))) {
      if (abs.includes('.test.ts')) continue;
      const src = readFileSync(abs, 'utf8');
      const re = /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const table = m[1];
        for (const raw of m[2].split(',')) {
          const col = raw.trim();
          if (!col || !/^\w+$/.test(col)) continue;
          try {
            db.prepare(`SELECT ${col} FROM ${table} LIMIT 0`);
          } catch {
            const line = src.slice(0, m.index).split('\n').length;
            problems.push(`${path.relative(ROOT, abs)}:${line} ${table}.${col}`);
          }
        }
      }
    }
    db.close();

    expect(
      problems,
      `INSERT names columns the schema does not have (each one 500s):\n${problems.join('\n')}`
    ).toEqual([]);
    });
  });
});
