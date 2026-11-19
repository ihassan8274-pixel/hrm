import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  applyColumnReconciliation,
  COLUMN_RECONCILIATION,
} from '../column-reconciliation';

// The exact shape migration 004 creates — the schema that shipped without the
// columns the Work Injuries routes write, causing every insert to throw.
const LEGACY_SCHEMA = `
  CREATE TABLE work_injuries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    injury_date DATE,
    injury_time TIME,
    location TEXT,
    description TEXT,
    severity TEXT DEFAULT 'minor',
    body_part TEXT,
    cause TEXT,
    status TEXT DEFAULT 'reported',
    compensation_amount REAL DEFAULT 0,
    reported_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

let db: any;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(LEGACY_SCHEMA);
});

const columns = (t: string) =>
  new Set((db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c: any) => c.name));

describe('applyColumnReconciliation — adding columns', () => {
  it('adds every column the application writes', () => {
    const { added } = applyColumnReconciliation(db);
    const have = columns('work_injuries');
    for (const col of Object.keys(COLUMN_RECONCILIATION.work_injuries)) {
      expect(have, `missing ${col}`).toContain(col);
    }
    // Every requested column for an existing table is reported as added.
    const expected = Object.keys(COLUMN_RECONCILIATION.work_injuries).length;
    expect(added.filter((a) => a.startsWith('work_injuries.'))).toHaveLength(expected);
  });

  // The original defect: these columns did not exist, so the POST route threw.
  it('enables the insert that previously threw', () => {
    applyColumnReconciliation(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO work_injuries (
             employee_id, incident_date, incident_time, location_type,
             injury_type, severity, description, hospital_name,
             sick_leave_days, gosi_reported, gosi_report_date, gosi_claim_number,
             daily_allowance_rate, total_compensation_amount, status, preventive_actions
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?)`
        )
        .run(1, '2026-02-01', '10:00', 'workplace', 'ق?', 'minor', 'test', 'H', 5, 1,
             '2026-02-01', 'G-1', 200, 2000, 'none')
    ).not.toThrow();
  });

  it('skips a table that does not exist yet', () => {
    const fresh = new Database(':memory:');
    const result = applyColumnReconciliation(fresh);
    // work_injuries is created by the .sql migrations, so it is skipped rather
    // than invented here.
    expect(result.skippedTables).toContain('work_injuries');
    fresh.close();
  });

  it('creates the supporting indexes', () => {
    applyColumnReconciliation(db);
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_work_injuries%'")
      .all()
      .map((r: any) => r.name);
    expect(names).toContain('idx_work_injuries_status');
    expect(names).toContain('idx_work_injuries_date');
  });
});

describe('applyColumnReconciliation — idempotency', () => {
  it('adds nothing on a second run', () => {
    applyColumnReconciliation(db);
    const second = applyColumnReconciliation(db);
    expect(second.added).toHaveLength(0);
  });

  it('survives repeated runs without throwing', () => {
    applyColumnReconciliation(db);
    expect(() => {
      applyColumnReconciliation(db);
      applyColumnReconciliation(db);
    }).not.toThrow();
  });

  it('preserves data across repeated runs', () => {
    applyColumnReconciliation(db);
    db.prepare(
      `INSERT INTO work_injuries (employee_id, incident_date, injury_type, total_compensation_amount)
       VALUES (1, '2026-03-01', 'حرق', 1234)`
    ).run();
    applyColumnReconciliation(db);
    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.total_compensation_amount).toBe(1234);
    expect(row.incident_date).toBe('2026-03-01');
  });
});

describe('applyColumnReconciliation — missing tables', () => {
  let fresh: any;
  beforeEach(() => {
    fresh = new Database(':memory:');
    fresh.exec('PRAGMA foreign_keys = ON');
    // employees/departments must exist for the FK targets, and hold the row
    // the grievance/warning fixtures reference.
    fresh.exec('CREATE TABLE employees (id INTEGER PRIMARY KEY)');
    fresh.exec('CREATE TABLE departments (id INTEGER PRIMARY KEY)');
    fresh.exec('INSERT INTO employees (id) VALUES (1)');
  });

  // Regression: /api/grievances, /api/hearings and /api/warnings all failed
  // with "no such table" because no migration ever created them.
  it('creates the tables the compliance routes query', () => {
    const { createdTables } = applyColumnReconciliation(fresh);
    expect(createdTables).toEqual(
      expect.arrayContaining(['employee_grievances', 'hearing_sessions', 'official_warnings'])
    );
    for (const t of ['employee_grievances', 'hearing_sessions', 'official_warnings']) {
      const found = fresh
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(t);
      expect(found, `${t} should exist`).toBeTruthy();
    }
  });

  it('gives employee_grievances the columns the insert uses', () => {
    applyColumnReconciliation(fresh);
    const cols = new Set(
      fresh.prepare('PRAGMA table_info(employee_grievances)').all().map((c: any) => c.name)
    );
    for (const c of [
      'ticket_number', 'employee_id', 'category', 'subject', 'details',
      'is_confidential', 'against_person', 'status', 'committee_notes',
      'resolution_summary', 'resolved_at',
    ]) {
      expect(cols, `missing ${c}`).toContain(c);
    }
  });

  it('gives hearing_sessions the columns the insert uses', () => {
    applyColumnReconciliation(fresh);
    const cols = new Set(
      fresh.prepare('PRAGMA table_info(hearing_sessions)').all().map((c: any) => c.name)
    );
    for (const c of [
      'grievance_id', 'session_title', 'session_date', 'location', 'committee_chair',
      'hr_representative', 'legal_counsel', 'employee_name', 'witnesses',
      'statements_minutes', 'committee_verdict', 'recommended_sanction',
      'deduction_days', 'status',
    ]) {
      expect(cols, `missing ${c}`).toContain(c);
    }
  });

  it('gives official_warnings the columns the insert uses', () => {
    applyColumnReconciliation(fresh);
    const cols = new Set(
      fresh.prepare('PRAGMA table_info(official_warnings)').all().map((c: any) => c.name)
    );
    for (const c of [
      'notice_number', 'employee_id', 'warning_type', 'violation_clause',
      'violation_date', 'investigation_ref', 'penalty_details',
      'deduction_amount', 'issued_by', 'issue_date', 'acknowledgement_status',
    ]) {
      expect(cols, `missing ${c}`).toContain(c);
    }
  });

  it('enables the grievance insert that previously threw', () => {
    applyColumnReconciliation(fresh);
    expect(() =>
      fresh
        .prepare(
          `INSERT INTO employee_grievances
             (ticket_number, employee_id, category, subject, details, is_confidential, against_person, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`
        )
        .run('GRV-2026-001', 1, 'work_environment', 's', 'd', 0, null)
    ).not.toThrow();
  });

  it('defaults a new grievance to submitted', () => {
    applyColumnReconciliation(fresh);
    fresh
      .prepare(
        `INSERT INTO employee_grievances (ticket_number, employee_id, subject, details)
         VALUES ('GRV-1', 1, 's', 'd')`
      )
      .run();
    const row = fresh.prepare('SELECT * FROM employee_grievances').get();
    expect(row.status).toBe('submitted');
    expect(row.is_confidential).toBe(0);
  });

  it('is idempotent — creates nothing on a second run', () => {
    applyColumnReconciliation(fresh);
    const second = applyColumnReconciliation(fresh);
    expect(second.createdTables).toHaveLength(0);
  });

  it('creates indexes for the new tables', () => {
    applyColumnReconciliation(fresh);
    const idx = fresh
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name);
    expect(idx).toContain('idx_employee_grievances_status');
    expect(idx).toContain('idx_hearing_sessions_grievance');
    expect(idx).toContain('idx_official_warnings_employee');
  });

  // Regression: qiwa_contracts was first created with a short column set, then
  // the route gained clauses_json. CREATE TABLE IF NOT EXISTS is a no-op on an
  // existing table, so without CREATED_TABLE_COLUMNS the later column silently
  // never appeared and the endpoint 500'd.
  it('adds later columns to a table it already created in an earlier shape', () => {
    fresh.exec(`
      CREATE TABLE qiwa_contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        contract_number TEXT,
        contract_type TEXT
      )`);
    expect(
      fresh.prepare('PRAGMA table_info(qiwa_contracts)').all().map((c: any) => c.name)
    ).not.toContain('clauses_json');

    applyColumnReconciliation(fresh);

    const cols = fresh.prepare('PRAGMA table_info(qiwa_contracts)').all().map((c: any) => c.name);
    expect(cols).toContain('clauses_json');
    expect(cols).toContain('qiwa_reference');
  });

  it('gives overtime_records the day-type split the payroll route writes', () => {
    applyColumnReconciliation(fresh);
    const cols = new Set(
      fresh.prepare('PRAGMA table_info(overtime_records)').all().map((c: any) => c.name)
    );
    for (const c of ['normal_hours', 'weekend_hours', 'holiday_hours', 'hourly_rate', 'total_overtime_pay']) {
      expect(cols, `missing ${c}`).toContain(c);
    }
  });

  it('gives departments a location column used by branch/geo features', () => {
    applyColumnReconciliation(fresh);
    expect(
      fresh.prepare('PRAGMA table_info(departments)').all().map((c: any) => c.name)
    ).toContain('location');
  });

  it('leaves the legacy grievances table untouched', () => {
    fresh.exec(`CREATE TABLE grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL,
      subject TEXT, description TEXT, type TEXT, status TEXT, priority TEXT,
      assigned_to INTEGER, resolution TEXT, resolved_at DATETIME, created_at DATETIME
    )`);
    applyColumnReconciliation(fresh);
    const cols = fresh.prepare('PRAGMA table_info(grievances)').all().map((c: any) => c.name);
    expect(cols).toContain('description');
    expect(cols).toContain('priority');
    // The newer table must exist alongside, not replace it.
    expect(
      fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_grievances'").get()
    ).toBeTruthy();
  });
});

describe('applyColumnReconciliation — legacy backfill', () => {
  it('carries legacy values into the new columns', () => {
    db
      .prepare(
        `INSERT INTO work_injuries (employee_id, injury_date, injury_time, body_part, cause, compensation_amount)
         VALUES (1, '2026-01-15', '08:30', 'يد', 'سقوط', 5000)`
      )
      .run();

    applyColumnReconciliation(db);

    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.incident_date).toBe('2026-01-15');
    expect(row.incident_time).toBe('08:30');
    expect(row.injury_type).toBe('يد');
    expect(row.location_type).toBe('workplace');
  });

  // Regression: the new column is DEFAULT 0, not NULL, so a plain COALESCE
  // kept the default and threw away the legacy amount.
  it('preserves a non-zero legacy compensation amount', () => {
    db
      .prepare(
        `INSERT INTO work_injuries (employee_id, injury_date, compensation_amount)
         VALUES (1, '2026-01-15', 5000)`
      )
      .run();

    applyColumnReconciliation(db);

    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.total_compensation_amount).toBe(5000);
  });

  it('defaults compensation to 0 when there is no legacy value', () => {
    db.prepare("INSERT INTO work_injuries (employee_id, injury_date) VALUES (1, '2026-01-15')").run();
    applyColumnReconciliation(db);
    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.total_compensation_amount).toBe(0);
  });

  it('does not overwrite an already-populated new column', () => {
    applyColumnReconciliation(db);
    db
      .prepare(
        `INSERT INTO work_injuries (employee_id, incident_date, injury_type, total_compensation_amount)
         VALUES (1, '2026-05-05', 'كسر', 999)`
      )
      .run();
    applyColumnReconciliation(db);
    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.total_compensation_amount).toBe(999);
    expect(row.injury_type).toBe('كسر');
  });

  it('leaves an empty legacy field empty rather than inventing a value', () => {
    db
      .prepare("INSERT INTO work_injuries (employee_id, injury_date) VALUES (1, '2026-01-15')")
      .run();
    applyColumnReconciliation(db);
    const row = db.prepare('SELECT * FROM work_injuries WHERE id = 1').get();
    expect(row.injury_type).toBeNull();
  });
});