/**
 * Generates a realistic dataset for the integration tests.
 *
 * Why this exists
 * ---------------
 * The financial code behaves differently at scale than it does on a handful of
 * rows: sums, groupings, window functions and "the table has exactly one row"
 * assumptions all pass on five employees and fail on five hundred. Every test
 * in this repository so far ran against pure functions with no data at all.
 *
 * Determinism
 * -----------
 * The generator is seeded, so the same seed produces byte-identical data. That
 * is what lets a test assert on exact totals instead of on "roughly right":
 * a failing number means the calculation changed, not that the fixture moved.
 *
 * It writes through the application's own database layer, so the parameter
 * rewriting and the SQLite-to-PostgreSQL translation are exercised on the way
 * in as well.
 *
 * Usage
 * -----
 *   PAYROLL_ENV_FILE=scripts/.build/test.env npx tsx scripts/generate-test-data.ts --reset
 */
// Must come first: it chooses the environment file the application loads.
import "./test-env";
import { writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import db, { closePostgresPool } from "../server/config/postgres";

/* ------------------------------------------------------------------ options */

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const SEED = Number(arg("seed", "20260101"));
const EMPLOYEE_COUNT = Number(arg("employees", "500"));
const BRANCH_COUNT = Number(arg("branches", "5"));
const DEPARTMENT_COUNT = Number(arg("departments", "10"));
const PAYROLL_MONTHS = Number(arg("months", "24"));
const ATTENDANCE_MONTHS = Number(arg("attendance-months", "3"));
const RESET = has("reset");

/**
 * The account the integration tests sign in with.
 *
 * It lives here rather than in the test file so that the generator and the
 * test cannot disagree about it, and it is only ever created inside the
 * throwaway test schema.
 */
export const TEST_ADMIN = {
  username: "integration_admin",
  password: "integration-test-password",
};

/* ------------------------------------------------------- deterministic random */

/** mulberry32 — small, fast, and identical on every platform. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
/** Rounded to two decimals, so the numbers in the assertions are exact. */
const money = (min: number, max: number) => Math.round((min + random() * (max - min)) * 100) / 100;

/* ------------------------------------------------------------------ helpers */

async function insertMany(table: string, columns: string[], rows: unknown[][], chunk = 500): Promise<void> {
  if (rows.length === 0) return;
  // A row with the wrong number of values produces a protocol error deep
  // inside the driver ("bind message supplies N parameters"), which says
  // nothing about the cause. Checking here names the table and the row.
  rows.forEach((row, index) => {
    if (row.length !== columns.length) {
      throw new Error(
        `${table}: row ${index} has ${row.length} values but the table has ${columns.length} columns`,
      );
    }
  });
  const placeholder = `(${columns.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${slice.map(() => placeholder).join(", ")}`;
    const params = slice.flat();
    await db.prepare(sql).run(...params);
  }
}

/** A fixed month in the past, so the dataset does not move with the calendar. */
const ANCHOR_YEAR = 2026;
const ANCHOR_MONTH = 10; // October 2026

function monthsBack(count: number): { month: number; year: number }[] {
  const out: { month: number; year: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = ANCHOR_YEAR * 12 + (ANCHOR_MONTH - 1) - i;
    out.push({ month: (total % 12) + 1, year: Math.floor(total / 12) });
  }
  return out;
}

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const FIRST = ["أحمد", "محمد", "فاطمة", "نورة", "خالد", "سارة", "عبدالله", "مريم", "يوسف", "هند"];
const SECOND = ["العتيبي", "القحطاني", "الحربي", "الشهري", "الدوسري", "المطيري", "الزهراني", "الغامدي"];
const ROLES = ["محاسب", "مهندس", "مشرف", "محلل", "أخصائي", "منسق", "مدير", "مستشار"];
const BANKS = ["Al Rajhi Bank", "SNB", "Riyad Bank", "SABB"];
const COMPANIES = ["Company A", "Company B", "Company C"];

/* --------------------------------------------------------------------- main */

async function main() {
  console.log(`generating: seed=${SEED} employees=${EMPLOYEE_COUNT} branches=${BRANCH_COUNT} departments=${DEPARTMENT_COUNT} payroll-months=${PAYROLL_MONTHS}`);

  if (RESET) {
    // TRUNCATE ... RESTART IDENTITY, not DELETE: the sequences have to start
    // from one again, otherwise the identifiers drift between runs and a test
    // that asserts on a specific row cannot rely on it.
    //
    // The tables that hold configuration — countries, entities, settings,
    // positions, tax brackets, salary components, users — are left alone: they
    // are policy, not data, and the entity row in particular is what the
    // country rules are resolved through.
    const dataTables = [
      "salary_slip_items", "salary_slips", "payroll", "attendance_logs", "attendance",
      "loans", "leaves", "qiwa_contracts", "government_renewals",
      "employees", "departments", "branches", "salary_structure_components", "salary_structures",
    ];
    const existing = new Set(
      ((await db.prepare(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
      ).all()) as any[]).map((row) => row.table_name),
    );
    const present = dataTables.filter((table) => existing.has(table));
    const missing = dataTables.filter((table) => !existing.has(table));
    if (missing.length) console.log(`reset: skipping tables that do not exist: ${missing.join(", ")}`);
    if (present.length) {
      await db.exec(`TRUNCATE TABLE ${present.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
    console.log(`reset: cleared ${present.length} tables`);
  }

  /* --- entity, branches, departments ------------------------------------- */

  const entity = (await db.prepare("SELECT id FROM entities ORDER BY id LIMIT 1").get()) as any;
  if (!entity) throw new Error("No entity found — run the schema build first (seedExtendedModules creates one).");
  const entityId = Number(entity.id);

  /* --- an account the integration test can sign in with -------------------- */

  // The bootstrap admin is created with must_change_password = 1, which puts
  // the sign-in behind a forced password change. The test needs an account
  // that can actually use the API, so it gets one of its own.
  const existingAdmin = (await db.prepare("SELECT id FROM users WHERE username = ?").get(TEST_ADMIN.username)) as any;
  if (existingAdmin) {
    await db.prepare("DELETE FROM users WHERE id = ?").run(existingAdmin.id);
  }
  await db.prepare(
    "INSERT INTO users (username, password_hash, role, entity_id, status, must_change_password) VALUES (?, ?, ?, ?, ?, 0)",
  ).run(TEST_ADMIN.username, bcrypt.hashSync(TEST_ADMIN.password, 10), "admin", entityId, "active");
  console.log(`admin: ${TEST_ADMIN.username} (must_change_password = 0)`);

  /* --- the bank profile the SIF export needs -------------------------------- */

  // The bank file export refuses to run when the institution and bank codes
  // are missing, so the fixture provides them. The values have to match the
  // export's own rule: letters and digits only.
  const settings: [string, string][] = [
    ["cr_number", "1010101010"],
    ["sif_settlement_bank_code", "SABBSARI"],
    ["sif_bank_codes", JSON.stringify({ "Al Rajhi Bank": "RAJHSARI", SNB: "NCBKSAJE", "Riyad Bank": "RIBLSARI", SABB: "SABBSARI" })],
  ];
  for (const [key, value] of settings) {
    // The settings table is keyed by its key column; there is no id.
    const existing = (await db.prepare("SELECT key FROM settings WHERE key = ?").get(key)) as any;
    if (existing) {
      await db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(value, key);
    } else {
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
    }
  }
  console.log(`settings: ${settings.length} bank profile values`);

  const branchRows: unknown[][] = [];
  for (let i = 0; i < BRANCH_COUNT; i++) {
    branchRows.push([
      `فرع ${i + 1}`, `Branch ${i + 1}`,
      24.6 + i * 0.05, 46.6 + i * 0.05, 200,
      "08:00", "17:00", entityId, 1,
    ]);
  }
  await insertMany(
    "branches",
    ["name", "name_en", "latitude", "longitude", "geofence_radius_m", "work_start_time", "work_end_time", "entity_id", "is_active"],
    branchRows,
  );
  const branches = (await db.prepare("SELECT id FROM branches WHERE entity_id = ? ORDER BY id").all(entityId)) as any[];
  console.log(`branches: ${branches.length}`);

  const departmentRows: unknown[][] = [];
  for (let i = 0; i < DEPARTMENT_COUNT; i++) {
    departmentRows.push([`قسم ${i + 1}`, `Department ${i + 1}`, entityId]);
  }
  await insertMany("departments", ["name", "name_en", "entity_id"], departmentRows);
  const departments = (await db.prepare("SELECT id FROM departments WHERE entity_id = ? ORDER BY id").all(entityId)) as any[];
  console.log(`departments: ${departments.length}`);

  /* --- employees ---------------------------------------------------------- */

  const employeeRows: unknown[][] = [];
  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const branch = branches[i % branches.length];
    const department = departments[i % departments.length];
    const isSaudi = i % 3 === 0 ? 1 : 0;
    const basic = money(6000, 30000);
    const housing = isSaudi ? money(0, 0.25 * basic) : money(0, 0.1 * basic);
    const transport = money(0, 0.1 * basic);
    const other = money(0, 0.05 * basic);
    // The identities have to satisfy the rules the bank file export enforces:
    // an Iqama number is ten digits starting with 1 or 2, and an IBAN is "SA"
    // followed by twenty-two letters or digits.
    const iqama = `${isSaudi ? 1 : 2}${String(isSaudi ? 100000000 + i : 200000000 + i).padStart(9, "0")}`;
    const iban = `SA${String(1000000000 + i).padStart(22, "0")}`;
    employeeRows.push([
      branch.id, department.id,
      `${pick(FIRST)} ${pick(SECOND)} ${i}`,
      pick(ROLES), pick(ROLES),
      basic, 0, 0,
      `INS-${100000 + i}`,
      `SA${String(1000000000 + i).padStart(10, "0")}`,
      isSaudi ? "Saudi" : "Egyptian",
      isSaudi,
      iqama,
      isSaudi ? `10${String(100000000 + i).padStart(8, "0")}` : null,
      isSaudi ? `2027-0${(i % 9) + 1}-15` : null,
      isSaudi ? `2027-0${(i % 9) + 1}-15` : null,
      isSaudi ? "Software Engineer" : null,
      isSaudi ? `WP-${200000 + i}` : null,
      isSaudi ? `2027-0${(i % 9) + 1}-15` : null,
      isSaudi ? 0 : null,
      isSaudi ? `GOSI-${300000 + i}` : null,
      isSaudi ? basic : null,
      housing, transport, other,
      pick(COMPANIES), "individual", `POL-${400000 + i}`, "2027-12-31", 0,
      iban,
      pick(BANKS), "permanent", "2024-01-01", "2027-12-31",
      isSaudi ? null : `P${String(500000 + i)}`,
      isSaudi ? null : "2027-12-31",
      `HC-${600000 + i}`, "2027-12-31",
      i % 7 === 0 ? "split" : "bank",
      i % 7 === 0 ? 20 : 0,
      null, "SA", entityId, "active",
    ]);
  }
  await insertMany(
    "employees",
    [
      "branch_id", "department_id", "name", "position", "job_title",
      "basic_salary", "deductions", "allowances", "insurance_number", "bank_account",
      "nationality", "is_saudi", "national_id_iqama", "border_number",
      "iqama_expiry_gregorian", "iqama_expiry_hijri", "iqama_profession",
      "work_permit_number", "work_permit_expiry", "work_permit_fee",
      "gosi_number", "gosi_registered_salary", "housing_allowance", "transport_allowance", "other_allowances",
      "insurance_company", "medical_insurance_category", "medical_insurance_policy", "medical_insurance_expiry",
      "medical_dependents_count", "saudi_iban", "bank_name", "contract_type",
      "contract_start_date", "contract_end_date", "passport_number", "passport_expiry",
      "health_cert_number", "health_cert_expiry", "payment_method", "cash_percentage",
      "face_template", "country_code", "entity_id", "status",
    ],
    employeeRows,
  );
  const employees = (await db.prepare(
    "SELECT id, basic_salary, housing_allowance, transport_allowance, other_allowances, is_saudi, branch_id FROM employees ORDER BY id",
  ).all()) as any[];
  console.log(`employees: ${employees.length}`);

  /* --- salary components and structures ----------------------------------- */

  const componentRows: unknown[][] = [
    ["BASIC", "الراتب الأساسي", "Basic Salary", "earning", "fixed", "fixed", "0", 1, 1, 1, 1],
    ["HOUSING", "بدل سكن", "Housing Allowance", "earning", "fixed", "percentage_of_basic", "25", 2, 1, 0, 1],
    ["TRANSPORT", "بدل نقل", "Transport Allowance", "earning", "fixed", "percentage_of_basic", "10", 3, 1, 0, 1],
    ["OTHER", "بدلات أخرى", "Other Allowances", "earning", "fixed", "fixed", "0", 4, 1, 0, 1],
  ];
  // The components are configuration and are not truncated, so the ones this
  // generator owns are removed first — otherwise a second run collides with
  // the unique code of the first.
  await db.prepare("DELETE FROM salary_components WHERE code IN (?, ?, ?, ?)").run("BASIC", "HOUSING", "TRANSPORT", "OTHER");
  await insertMany(
    "salary_components",
    ["code", "name_ar", "name_en", "type", "category", "calculation_type", "calculation_value", "display_order", "is_active", "is_taxable", "is_gosi_applicable"],
    componentRows,
  );
  const components = (await db.prepare("SELECT id, code FROM salary_components ORDER BY id").all()) as any[];
  const componentByCode = new Map(components.map((c) => [c.code, c.id]));

  await insertMany(
    "salary_structures",
    ["code", "name_ar", "name_en", "entity_id", "payroll_frequency", "currency", "country_code", "is_default", "is_active"],
    [["STD", "الهيكل القياسي", "Standard Structure", entityId, "monthly", "SAR", "SA", 1, 1]],
  );
  const structure = (await db.prepare("SELECT id FROM salary_structures ORDER BY id LIMIT 1").get()) as any;
  await insertMany(
    "salary_structure_components",
    ["structure_id", "component_id", "sequence", "is_mandatory"],
    ["BASIC", "HOUSING", "TRANSPORT", "OTHER"].map((code, i) => [structure.id, componentByCode.get(code), i + 1, 1]),
  );

  /* --- attendance --------------------------------------------------------- */

  const attendanceMonths = monthsBack(ATTENDANCE_MONTHS);
  const logRows: unknown[][] = [];
  const summaryRows: unknown[][] = [];
  for (const { month, year } of attendanceMonths) {
    const daysInMonth = new Date(year, month, 0).getDate();
    // The working days of the month. The fixture models a Saudi week, so the
    // weekend is Friday and Saturday — the same list the country rules carry.
    const workingDays: number[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = new Date(year, month - 1, day).getDay();
      if (weekday === 5 || weekday === 6) continue;
      workingDays.push(day);
    }
    for (const emp of employees) {
      // Attendance is not perfect on purpose: a quarter of the employees miss
      // a few working days, so the absence deduction and the present-day count
      // have something to bite on. The days are taken off the working days,
      // not off the calendar, so the weekend is never counted as absence.
      //
      // A few employees have no device records at all — a device that was not
      // working, or a month before the devices were installed. Their monthly
      // summary stands on its own, which is the case the application has to
      // get right.
      const noDevice = random() < 0.05;
      const missingDays = noDevice || random() >= 0.25 ? 0 : between(1, 3);
      const skipped = new Set<number>();
      while (skipped.size < missingDays && workingDays.length > 0) {
        skipped.add(workingDays[Math.floor(random() * workingDays.length)]);
      }
      if (!noDevice) {
        for (const day of workingDays) {
          if (skipped.has(day)) continue;
          const checkIn = new Date(Date.UTC(year, month - 1, day, 6, 0));
          const checkOut = new Date(Date.UTC(year, month - 1, day, 14, 0));
          const late = random() < 0.1;
          logRows.push([
            emp.id, emp.branch_id, 1,
            checkIn.toISOString(), checkOut.toISOString(),
            24.6, 46.6, 24.6, 46.6,
            "device", late ? "late" : "present",
          ]);
        }
      }
      summaryRows.push([emp.id, month, year, missingDays, between(0, 12)]);
    }
  }
  await insertMany(
    "attendance_logs",
    ["employee_id", "branch_id", "device_id", "check_in_time", "check_out_time", "check_in_lat", "check_in_lng", "check_out_lat", "check_out_lng", "method", "status"],
    logRows,
  );
  await insertMany("attendance", ["employee_id", "month", "year", "absence_days", "overtime_hours"], summaryRows);
  console.log(`attendance: ${logRows.length} logs, ${summaryRows.length} monthly rows`);

  /* --- loans -------------------------------------------------------------- */

  const loanRows: unknown[][] = [];
  for (const emp of employees) {
    if (random() < 0.2) {
      // A loan that a salary can actually carry: at most six months of it, so
      // the monthly instalment never exceeds half the wage. A loan bigger than
      // the pay would make the net negative for a reason that has nothing to
      // do with attendance.
      const months = between(1, 6);
      const total = Math.round(emp.basic_salary * months * 100) / 100;
      const installment = Math.round((total / 12) * 100) / 100;
      loanRows.push([emp.id, total, Math.round(total * 0.5 * 100) / 100, installment, "active"]);
    }
  }
  await insertMany("loans", ["employee_id", "total_amount", "remaining_amount", "monthly_installment", "status"], loanRows);
  console.log(`loans: ${loanRows.length}`);

  /* --- leaves -------------------------------------------------------------- */

  const leaveRows: unknown[][] = [];
  for (const emp of employees) {
    if (random() < 0.15) {
      const { month, year } = attendanceMonths[0];
      const start = between(1, 20);
      const days = between(1, 10);
      leaveRows.push([
        emp.id, pick(["annual", "sick", "unpaid"]),
        isoDate(year, month, start), isoDate(year, month, start + days),
        days, pick(["approved", "approved", "pending"]),
        pick(["إجازة سنوية", "مرضية", "شخصية"]),
        null, new Date(Date.UTC(year, month - 1, start)).toISOString(),
      ]);
    }
  }
  await insertMany(
    "leaves",
    ["employee_id", "type", "start_date", "end_date", "days", "status", "reason", "approver_id", "approved_at"],
    leaveRows,
  );
  console.log(`leaves: ${leaveRows.length}`);

  /* --- qiwa contracts for the Saudi employees ------------------------------ */

  const qiwaRows: unknown[][] = employees
    .filter((e) => e.is_saudi === 1)
    .map((emp, i) => [
      emp.id, `QWA-${700000 + i}`, "individual", pick(ROLES), "Riyadh",
      "2024-01-01", "2027-12-31", 90, 30,
      emp.basic_salary, emp.housing_allowance, emp.transport_allowance, emp.other_allowances,
      48, 21, 1, "active", `QREF-${800000 + i}`, null,
    ]);
  await insertMany(
    "qiwa_contracts",
    ["employee_id", "contract_number", "contract_type", "job_title", "work_location", "start_date", "end_date", "probation_days", "notice_period_days", "basic_salary", "housing_allowance", "transport_allowance", "other_allowances", "weekly_working_hours", "annual_leave_days", "auto_renew", "qiwa_status", "qiwa_reference", "digital_signature"],
    qiwaRows,
  );
  console.log(`qiwa_contracts: ${qiwaRows.length}`);

  /* --- payroll history ---------------------------------------------------- */

  const payrollMonths = monthsBack(PAYROLL_MONTHS);
  const payrollRows: unknown[][] = [];
  for (const { month, year } of payrollMonths) {
    for (const emp of employees) {
      const gross = Math.round((emp.basic_salary + emp.housing_allowance + emp.transport_allowance + emp.other_allowances) * 100) / 100;
      const net = Math.round(gross * 0.87 * 100) / 100;
      payrollRows.push([
        emp.id, month, year,
        emp.basic_salary,
        Math.round((emp.housing_allowance + emp.transport_allowance + emp.other_allowances) * 100) / 100,
        Math.round((gross - net) * 100) / 100,
        Math.round(gross * 0.05 * 100) / 100,
        net,
        Math.round(gross * 0.0975 * 100) / 100,
        Math.round(gross * 0.1175 * 100) / 100,
        0, 0,
        new Date(Date.UTC(year, month - 1, 28)).toISOString(),
        null, emp.is_saudi,
        emp.housing_allowance, emp.transport_allowance,
        null, null, null, null, "bank", "SA", 0, net, 1,
      ]);
    }
  }
  await insertMany(
    "payroll",
    [
      "employee_id", "month", "year", "basic_salary", "allowances", "deductions", "tax_amount", "net_salary",
      "insurance_emp_share", "insurance_comp_share", "bonuses", "penalties", "processed_at",
      "national_id_iqama", "is_saudi", "housing_allowance", "transport_allowance",
      "gosi_number", "gosi_salary", "saudi_iban", "bank_name", "payment_method", "country_code",
      "cash_amount", "bank_amount", "payroll_applied",
    ],
    payrollRows,
  );
  console.log(`payroll: ${payrollRows.length} rows over ${payrollMonths.length} months`);

  /* --- the facts a test can assert on ------------------------------------- */

  const totals = (await db.prepare(`
    SELECT COUNT(*)::int AS employees,
           COALESCE(SUM(basic_salary), 0) AS total_basic,
           COALESCE(SUM(housing_allowance), 0) AS total_housing,
           COALESCE(SUM(transport_allowance), 0) AS total_transport,
           COALESCE(SUM(other_allowances), 0) AS total_other,
           COUNT(*) FILTER (WHERE is_saudi = 1)::int AS saudi
      FROM employees
  `).get()) as any;

  const summary = {
    seed: SEED,
    entityId,
    branches: branches.length,
    departments: departments.length,
    employees: employees.length,
    saudiEmployees: totals.saudi,
    totalBasicSalary: Math.round(totals.total_basic * 100) / 100,
    totalHousing: Math.round(totals.total_housing * 100) / 100,
    totalTransport: Math.round(totals.total_transport * 100) / 100,
    totalOther: Math.round(totals.total_other * 100) / 100,
    attendanceLogs: logRows.length,
    loans: loanRows.length,
    leaves: leaveRows.length,
    qiwaContracts: qiwaRows.length,
    payrollRows: payrollRows.length,
    payrollMonths,
    attendanceMonths,
    admin: TEST_ADMIN.username,
  };
  const outFile = path.join(process.cwd(), "scripts", ".build", "test-data-summary.json");
  writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf8");
  console.log(`summary: ${outFile}`);
  console.log(`  employees ${summary.employees} (${summary.saudiEmployees} Saudi) | total basic ${summary.totalBasicSalary}`);
}

main()
  .catch(async (error) => {
    console.error("generation failed:", error);
    await closePostgresPool();
    process.exit(1);
  })
  .finally(async () => {
    await closePostgresPool();
  });
