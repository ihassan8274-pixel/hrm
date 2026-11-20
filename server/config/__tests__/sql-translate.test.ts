import { describe, it, expect } from "vitest";
import { parameterize, toPostgresStatement, NO_ID_PRIMARY_KEY_TABLES } from "../sql-translate";

/**
 * The translation layer is the one place where a SQLite statement silently
 * changes meaning on the way to PostgreSQL. These tests pin that behaviour,
 * because nothing else in the suite can observe it: the drift gates compare
 * SQL text, not what the server finally sends.
 */
describe("parameterize", () => {
  it("turns positional placeholders into $n", () => {
    const { sql } = parameterize("SELECT * FROM employees WHERE id = ? AND branch_id = ?", [1, 2]);
    expect(sql).toBe("SELECT * FROM employees WHERE id = $1 AND branch_id = $2");
  });

  it("casts a placeholder that is only used in an IS NULL test", () => {
    // PostgreSQL cannot infer the type of such a parameter and rejects it
    // with 42P18, so the facade casts it to text.
    const { sql } = parameterize("SELECT 1 FROM t WHERE (? IS NULL OR id = ?)", [null, 1]);
    expect(sql).toContain("$1::text");
    expect(sql).toContain("id = $2");
  });

  it("turns named placeholders into $n and keeps their order", () => {
    const { sql, params } = parameterize(
      "SELECT * FROM payroll WHERE month = @month AND year = @year AND employee_id = @employee_id",
      [{ month: 10, year: 2026, employee_id: 7 }],
    );
    expect(sql).toContain("month = $1");
    expect(sql).toContain("year = $2");
    expect(sql).toContain("employee_id = $3");
    expect(params).toEqual([10, 2026, 7]);
  });

  it("reuses one placeholder for a repeated named parameter", () => {
    const { sql, params } = parameterize("SELECT 1 FROM t WHERE a = @x OR b = @x", [{ x: 5 }]);
    expect(sql).toContain("$1");
    expect(sql).not.toContain("$2");
    expect(params).toEqual([5]);
  });

  it("reports a named parameter that was not supplied", () => {
    expect(() => parameterize("SELECT 1 FROM t WHERE a = @missing", [{ other: 1 }])).toThrow(
      /Missing SQL parameter/,
    );
  });

  it("leaves a question mark inside a string literal alone", () => {
    const { sql } = parameterize("SELECT * FROM t WHERE note = 'why?' AND id = ?", [1]);
    expect(sql).toContain("'why?'");
    expect(sql).toContain("id = $1");
  });

  it("keeps a dollar sign inside a string literal alone", () => {
    const { sql } = parameterize("SELECT * FROM t WHERE note = '$100' AND id = ?", [1]);
    expect(sql).toContain("'$100'");
  });
});

describe("toPostgresStatement", () => {
  it("rewrites INSERT OR IGNORE into a conflict-tolerant insert", () => {
    const sql = toPostgresStatement("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    expect(sql).toContain("INSERT INTO settings");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("rewrites INSERT OR REPLACE on settings into an upsert", () => {
    const sql = toPostgresStatement("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  });

  it("degrades INSERT OR REPLACE on any other table to a plain insert", () => {
    // The replacement is only expressible where the table has a unique key to
    // conflict on. Everywhere else it appends a row instead of replacing one,
    // which is why the statement form has to be checked explicitly.
    const sql = toPostgresStatement("INSERT OR REPLACE INTO talent_assessments (id) VALUES (?)");
    expect(sql).toContain("INSERT INTO talent_assessments");
    expect(sql).not.toContain("ON CONFLICT");
  });

  it("adds RETURNING id to an insert so the caller gets the new identifier", () => {
    const sql = toPostgresStatement("INSERT INTO employees (name) VALUES (?)", true);
    expect(sql).toContain("RETURNING id");
  });

  it("does not add RETURNING id to the tables without a generated id", () => {
    for (const table of NO_ID_PRIMARY_KEY_TABLES) {
      const sql = toPostgresStatement(`INSERT INTO ${table} (key) VALUES (?)`, true);
      expect(sql, table).not.toContain("RETURNING id");
    }
  });

  it("leaves a statement that already returns the id alone", () => {
    const sql = toPostgresStatement("INSERT INTO employees (name) VALUES (?) RETURNING id", true);
    expect(sql.match(/RETURNING id/g)).toHaveLength(1);
  });

  it("strips the trailing semicolon", () => {
    expect(toPostgresStatement("SELECT 1;")).toBe("SELECT 1");
  });
});
