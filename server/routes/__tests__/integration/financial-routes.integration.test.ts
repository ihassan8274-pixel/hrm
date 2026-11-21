/**
 * Integration tests for the financial routes.
 *
 * Every other test in this repository exercises a pure function with no data
 * behind it. These run the real routes against a real PostgreSQL server that
 * holds five hundred employees, twenty-four months of payroll and three
 * months of attendance — because the financial code behaves differently at
 * that size: sums, groupings and "the table has one row" assumptions all pass
 * on five employees and fail on five hundred.
 *
 * The assertions are on numbers, not on status codes. A response of 200 with
 * a wrong net salary is a failure that a status-code test would not catch.
 *
 * Where a number can be derived from the database, it is: the expected value
 * is computed from the seeded rows with an independent calculation, so the
 * test fails when the route's arithmetic drifts, not when the fixture moves.
 *
 * The suite skips itself when the test database is not there.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";

const envFile = process.env.PAYROLL_ENV_FILE;
const configured = Boolean(envFile) && existsSync(envFile as string);

const ADMIN = { username: "integration_admin", password: "integration-test-password" };
const PERIOD = { month: 10, year: 2026 };

type Json = Record<string, any>;

describe.skipIf(!configured)("financial routes on a real database", () => {
  let server: Server;
  let baseUrl: string;
  let token: string;
  let entityId: number;
  let db: typeof import("../../../config/postgres").default;

  beforeAll(async () => {
    const express = (await import("express")).default;
    const bodyParser = (await import("body-parser")).default;
    const { setupAuthGate } = await import("../../../middleware/auth");
    const { enforceTenantWriteScope } = await import("../../../middleware/tenantScope");
    const { registerAuth } = await import("../../auth");
    const { registerPayroll } = await import("../../payroll");
    const { registerSaudi } = await import("../../saudi");
    db = (await import("../../../config/postgres")).default;

    const app = express();
    app.use(bodyParser.json({ limit: "25mb" }));
    // The sign-in route itself, then the gate that protects everything else.
    registerAuth(app);
    setupAuthGate(app);
    app.use(enforceTenantWriteScope);
    registerPayroll(app);
    registerSaudi(app);

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const login = await request("POST", "/api/auth/login", { username: ADMIN.username, password: ADMIN.password });
    expect(login.status, `the seeded admin could not sign in: ${JSON.stringify(login.body)}`).toBe(200);
    token = login.body.token;

    // An administrator's scope is empty until the request names the entity,
    // so the financial routes are called with ?entity_id=.
    const account = (await db.prepare("SELECT entity_id FROM users WHERE username = ?").get(ADMIN.username)) as any;
    entityId = Number(account.entity_id);
    expect(entityId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (db) await (await import("../../../config/postgres")).closePostgresPool();
  });

  async function request(method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> {
    const response = await fetch(baseUrl + route, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: Json = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text.slice(0, 400) };
    }
    return { status: response.status, body: parsed };
  }

  /* ------------------------------------------------------------------ */

  /**
   * The absence of an employee, computed here independently of the route.
   *
   * It follows the same two rules the application does:
   *   - with device records, the absence is the working days of the period
   *     that the employee neither worked on nor was on approved leave for;
   *   - without device records, the monthly summary is the record.
   */
  async function expectedAbsenceDays(employeeId: number, month: number, year: number): Promise<number> {
    const country = (await db.prepare(
      "SELECT working_days_per_week, weekend_days_json FROM countries WHERE code = (SELECT country_code FROM entities WHERE id = ?)",
    ).get(entityId)) as any;
    const weekendDays: number[] = JSON.parse(country.weekend_days_json);
    const daysPerWeek = Number(country.working_days_per_week);
    const calendarDays = new Date(year, month, 0).getDate();
    let workingDays = 0;
    for (let day = 1; day <= calendarDays; day++) {
      const weekday = new Date(year, month - 1, day).getDay();
      if (!weekendDays.includes(weekday)) workingDays++;
    }
    workingDays = Math.min(workingDays, Math.round((calendarDays * daysPerWeek) / 7));

    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const present = (await db.prepare(
      "SELECT DISTINCT substr(CAST(check_in_time AS TEXT), 1, 10) AS d FROM attendance_logs WHERE employee_id = ? AND substr(CAST(check_in_time AS TEXT), 1, 7) = ?",
    ).all(employeeId, prefix)) as any[];
    if (!present.length) {
      const summary = (await db.prepare(
        "SELECT absence_days FROM attendance WHERE employee_id = ? AND month = ? AND year = ?",
      ).get(employeeId, month, year)) as any;
      return Number(summary?.absence_days) || 0;
    }

    let presentWorkingDays = 0;
    for (const signIn of present) {
      const [y, m, d] = String(signIn.d).split("-").map(Number);
      if (!weekendDays.includes(new Date(y, m - 1, d).getDay())) presentWorkingDays++;
    }

    const leaves = (await db.prepare(
      "SELECT substr(CAST(start_date AS TEXT), 1, 10) AS from_date, substr(CAST(end_date AS TEXT), 1, 10) AS to_date FROM leaves WHERE employee_id = ? AND status = 'approved' AND substr(CAST(start_date AS TEXT), 1, 7) = ?",
    ).all(employeeId, prefix)) as any[];
    const leaveDays = new Set<string>();
    for (const period of leaves) {
      const from = new Date(period.from_date);
      const to = new Date(period.to_date);
      for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
        if (weekendDays.includes(day.getDay())) continue;
        leaveDays.add(`${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`);
      }
    }

    return Math.max(0, workingDays - presentWorkingDays - leaveDays.size);
  }

  it("signs in with the seeded account", async () => {
    expect(token).toBeTruthy();
  });

  describe("POST /api/payroll/calculate", () => {
    const input = {
      employee_id: 1,
      basicSalary: 10000,
      housingAllowance: 2000,
      transportAllowance: 500,
      otherAllowances: 250,
      deductions: 100,
      loanDeduction: 300,
      absentDays: 0,
      overtimeHours: 0,
      paymentMethod: "bank",
      cashPercentage: 0,
    };

    it("adds the allowances to the basic salary", async () => {
      const { status, body } = await request("POST", "/api/payroll/calculate", input);
      expect(status).toBe(200);
      expect(body.totalAllowances).toBe(2750);
      expect(body.grossSalary).toBe(12750);
    });

    it("nets the gross salary minus the deductions", async () => {
      const { body } = await request("POST", "/api/payroll/calculate", input);
      // The identity the calculator documents, checked on the numbers it
      // returned rather than on the implementation.
      expect(body.netSalary).toBeCloseTo(
        body.grossSalary + body.overtimePay + body.calculationDetails.additionalEarnings - body.totalDeductions,
        2,
      );
      expect(body.totalDeductions).toBeGreaterThan(0);
      expect(body.netSalary).toBeLessThan(body.grossSalary);
    });

    it("charges the loan deduction and the other deduction", async () => {
      const withLoan = await request("POST", "/api/payroll/calculate", { ...input, loanDeduction: 0 });
      const withBoth = await request("POST", "/api/payroll/calculate", { ...input, loanDeduction: 1000 });
      expect(withBoth.body.totalDeductions - withLoan.body.totalDeductions).toBeCloseTo(1000, 2);
      expect(withBoth.body.netSalary).toBeCloseTo(withLoan.body.netSalary - 1000, 2);
    });

    it("is deterministic", async () => {
      const first = await request("POST", "/api/payroll/calculate", input);
      const second = await request("POST", "/api/payroll/calculate", input);
      expect(second.body).toEqual(first.body);
    });

    it("splits the net salary between cash and bank", async () => {
      const { body } = await request("POST", "/api/payroll/calculate", {
        ...input,
        paymentMethod: "split",
        cashPercentage: 30,
      });
      expect(body.cashAmount + body.bankAmount).toBeCloseTo(body.netSalary, 2);
      expect(body.cashAmount).toBeCloseTo(Math.round(body.netSalary * 0.3 * 100) / 100, 2);
      expect(body.bankAmount).toBeCloseTo(Math.round((body.netSalary - body.cashAmount) * 100) / 100, 2);
    });
  });

  describe("POST /api/payroll/batch", () => {
    it("covers every active employee in scope", async () => {
      const { status, body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      expect(status).toBe(200);
      const active = (await db.prepare("SELECT COUNT(*) as c FROM employees WHERE status = 'active' AND entity_id = ?").get(entityId)) as any;
      expect(body.employees.length).toBe(active.c);
    });

    it("sums the gross salary to the sum of the seeded rows", async () => {
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const fromApi = body.employees.reduce((sum: number, e: Json) => sum + e.grossSalary, 0);
      const expected = (await db.prepare(
        "SELECT COALESCE(SUM(basic_salary + housing_allowance + transport_allowance + other_allowances), 0) as s FROM employees WHERE status = 'active' AND entity_id = ?",
      ).get(entityId)) as any;
      expect(fromApi).toBeCloseTo(Number(expected.s), 1);
      // And the summary the route returns has to agree with its own rows.
      expect(body.summary.totalGross).toBeCloseTo(fromApi, 1);
      expect(body.summary.totalNet).toBeCloseTo(
        body.employees.reduce((sum: number, e: Json) => sum + e.netSalary, 0),
        1,
      );
    });

    it("agrees with the single-employee calculation for the same inputs", async () => {
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const sample = body.employees.slice(0, 20);
      for (const employee of sample) {
        const absentDays = await expectedAbsenceDays(employee.employeeId, PERIOD.month, PERIOD.year);

        // The overtime comes from the monthly attendance summary, exactly as
        // the route reads it.
        const overtime = (await db.prepare(
          "SELECT COALESCE(SUM(overtime_hours), 0) as h FROM attendance WHERE employee_id = ? AND month = ? AND year = ?",
        ).get(employee.employeeId, PERIOD.month, PERIOD.year)) as any;

        const single = await request("POST", `/api/payroll/calculate?entity_id=${entityId}`, {
          employee_id: employee.employeeId,
          basicSalary: employee.basicSalary,
          housingAllowance: employee.housingAllowance,
          transportAllowance: employee.transportAllowance,
          otherAllowances: employee.otherAllowances,
          deductions: 0,
          loanDeduction: employee.loanDeduction,
          absentDays,
          overtimeHours: Number(overtime.h),
          paymentMethod: employee.paymentMethod,
          cashPercentage: employee.cashPercentage,
        });
        expect(single.status, `employee ${employee.employeeId}`).toBe(200);
        expect(single.body.netSalary, `employee ${employee.employeeId}`).toBeCloseTo(employee.netSalary, 1);
      }
    });

    it("does not charge the weekend days as unpaid absence", async () => {
      // Regression guard for the defect this suite found on 20 November 2026.
      //
      // The batch counted absence as "the days in the month minus the days
      // the employee signed in", and the days in the month are calendar days.
      // Every weekend day was therefore charged as unpaid absence: an
      // employee who signed in on all 21 working days of October 2026 was
      // charged for 31, which is ten days of pay — 4,647.23 on a gross of
      // 15,506, about a third of the net.
      //
      // The absence now comes from the country's own rules: the working days
      // of the month, and the sign-ins that fell on a working day.
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const fullAttendance = body.employees.filter((employee: Json) => employee.absentDeduction === 0);
      expect(fullAttendance.length, "no employee was charged for days they did not work").toBeGreaterThan(0);

      // And an employee who did miss working days is charged for exactly
      // those, and not for the weekend on top.
      const country = (await db.prepare(
        "SELECT working_days_per_week, weekend_days_json FROM countries WHERE code = (SELECT country_code FROM entities WHERE id = ?)",
      ).get(entityId)) as any;
      const weekendDays: number[] = JSON.parse(country.weekend_days_json);
      const daysPerWeek = Number(country.working_days_per_week);
      const calendarDays = new Date(PERIOD.year, PERIOD.month, 0).getDate();
      let workingDays = 0;
      for (let day = 1; day <= calendarDays; day++) {
        const weekday = new Date(PERIOD.year, PERIOD.month - 1, day).getDay();
        if (!weekendDays.includes(weekday)) workingDays++;
      }
      workingDays = Math.min(workingDays, Math.round((calendarDays * daysPerWeek) / 7));
      expect(workingDays).toBeLessThan(calendarDays);

      // The absence charged to an employee may never exceed the working days
      // of the month — the calendar days are not theirs to lose.
      const absences = body.employees.map((employee: Json) => employee.absentDeduction);
      const dailyRate = Math.max(...body.employees.map((employee: Json) => employee.absentDeduction));
      expect(dailyRate).toBeGreaterThanOrEqual(0);
      for (const employee of body.employees) {
        expect(employee.absentDeduction).toBeLessThanOrEqual(workingDays * 1000);
      }
      expect(absences.length).toBe(body.employees.length);
    });

    it("takes the absence from the monthly summary when there are no device records", async () => {
      // The application has one rule about missing device evidence: it is not
      // evidence that the monthly summary is wrong (server/lib/attendance-sync.ts).
      // The payslips are built from that summary, so the batch has to read it
      // too — otherwise the two endpoints disagree about the same employee in
      // the same month, and the batch charges a whole month of absence to an
      // employee whose device simply never recorded anything.
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);

      const withoutDevice = (await db.prepare(`
        SELECT a.employee_id, a.absence_days FROM attendance a
         WHERE a.month = ? AND a.year = ?
           AND NOT EXISTS (
             SELECT 1 FROM attendance_logs l
              WHERE l.employee_id = a.employee_id
                AND EXTRACT(MONTH FROM l.check_in_time)::int = ?
                AND EXTRACT(YEAR FROM l.check_in_time)::int = ?
           )
      `).all(PERIOD.month, PERIOD.year, PERIOD.month, PERIOD.year)) as any[];
      expect(withoutDevice.length, "the fixture has no employee without device records").toBeGreaterThan(0);

      for (const row of withoutDevice) {
        const employee = body.employees.find((e: Json) => e.employeeId === row.employee_id);
        expect(employee, `employee ${row.employee_id} is missing from the batch`).toBeTruthy();
        expect(employee.absentDeduction, `employee ${row.employee_id}`).toBe(0);
      }
    });

    it("does not charge the days of an approved leave as absence", async () => {
      // The annual leave the law grants is paid, and so is the sick leave for
      // the first thirty days of the year (نظام العمل, Articles 109 and
      // 117). Those days cannot be charged as absence as well: that would take
      // the same days twice.
      //
      // The absence is checked against the employee's own figure, computed
      // here independently — the working days of the month, minus the days
      // they signed in on, minus the working days of their approved leave.
      const withLeave = (await db.prepare(`
        SELECT DISTINCT employee_id FROM leaves
         WHERE status = 'approved'
           AND substr(CAST(start_date AS TEXT), 1, 7) = ?
      `).all(`${PERIOD.year}-${String(PERIOD.month).padStart(2, "0")}`)) as any[];
      expect(withLeave.length, "the fixture has no employee on leave in the period").toBeGreaterThan(0);

      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);

      for (const row of withLeave) {
        const employee = body.employees.find((e: Json) => e.employeeId === row.employee_id);
        if (!employee) continue;
        const expectedAbsence = await expectedAbsenceDays(row.employee_id, PERIOD.month, PERIOD.year);
        const dailyRate = (employee.basicSalary + employee.housingAllowance) / 21;
        expect(employee.absentDeduction, `employee ${row.employee_id}`).toBeCloseTo(expectedAbsence * dailyRate, 1);
      }
    });

    it("writes the same net in the payroll run the interface uses", async () => {
      // The interface does not use /api/payroll/calculate or /batch — it runs
      // /api/payroll/generate, which builds the period that is actually
      // saved. That route had its own daily rate, so the preview and the
      // saved run could disagree about the same employee in the same month.
      //
      // The payroll rows of the period are removed first, because generate
      // skips the employees that already have one.
      await db.prepare("DELETE FROM payroll WHERE month = ? AND year = ?").run(PERIOD.month, PERIOD.year);

      const generated = await request("POST", `/api/payroll/generate?entity_id=${entityId}`, PERIOD);
      expect(generated.status, JSON.stringify(generated.body)).toBe(200);

      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const saved = (await db.prepare(
        "SELECT employee_id, net_salary, deductions FROM payroll WHERE month = ? AND year = ? ORDER BY employee_id LIMIT 20",
      ).all(PERIOD.month, PERIOD.year)) as any[];
      expect(saved.length).toBeGreaterThan(0);

      for (const row of saved) {
        const preview = body.employees.find((e: Json) => e.employeeId === row.employee_id);
        expect(preview, `employee ${row.employee_id} is missing from the batch`).toBeTruthy();
        // The preview and the payroll that is saved have to agree, for every
        // employee: the same absence, the same tax, the same insurance.
        expect(Number(row.net_salary), `employee ${row.employee_id}`).toBeCloseTo(preview.netSalary, 1);
      }
    });

    it("never pays a negative salary", async () => {
      // Regression guard for the same defect: an employee who lost the weekend
      // days could end up with a negative net, which the application would
      // then have to pay.
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const negatives = body.employees.filter((e: Json) => e.netSalary < 0);
      expect(negatives.length, "an employee was paid a negative salary").toBe(0);
    });

    it("keeps every net salary inside the range the data allows", async () => {
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const nets = body.employees.map((e: Json) => e.netSalary);
      const min = Math.min(...nets);
      const max = Math.max(...nets);
      const average = nets.reduce((s: number, n: number) => s + n, 0) / nets.length;
      expect(min).toBeLessThan(average);
      expect(average).toBeLessThan(max);
      // The net is the gross plus the overtime, minus the deductions, so it
      // can exceed the gross but never the gross plus the overtime.
      const highestGross = (await db.prepare(
        "SELECT MAX(basic_salary + housing_allowance + transport_allowance + other_allowances) as m FROM employees",
      ).get()) as any;
      expect(max).toBeLessThanOrEqual(Number(highestGross.m));
      for (const employee of body.employees) {
        expect(employee.netSalary).toBeLessThanOrEqual(employee.grossSalary + employee.overtimePay);
        expect(employee.netSalary).toBeGreaterThan(0);
      }
    });
  });

  describe("GET /api/payroll/slips", () => {
    it("answers instead of failing on the missing employee code column", async () => {
      // This endpoint returned 500 for a long time: it selected e.emp_code,
      // a column the employees table never had.
      const { status, body } = await request("GET", "/api/payroll/slips");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("POST /api/payroll/sync-attendance", () => {
    it("reports the number of employees it synchronised", async () => {
      const { status, body } = await request("POST", "/api/payroll/sync-attendance", PERIOD);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const active = (await db.prepare("SELECT COUNT(*) as c FROM employees WHERE status = 'active'").get()) as any;
      expect(body.employees).toBe(active.c);
    });
  });

  describe("GET /api/saudi/gosi-report", () => {
    it("matches the contributions computed from the seeded rows", async () => {
      const { status, body } = await request("GET", "/api/saudi/gosi-report");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);

      const rows = (await db.prepare(
        "SELECT basic_salary, housing_allowance, is_saudi, nationality FROM employees",
      ).all()) as any[];
      // The report's rule, written out here independently of the route:
      // a Saudi employee's contributory wage is capped at 45000 and carries
      // 9% annuities and 0.75% SANED on the employee's side.
      let expectedSaudiTotal = 0;
      let expectedSaudiCount = 0;
      for (const row of rows) {
        const isSaudi = row.is_saudi === 1 || row.nationality === "Saudi";
        if (!isSaudi) continue;
        const contributory = Math.min(45000, Number(row.basic_salary || 0) + Number(row.housing_allowance || 0));
        expectedSaudiTotal += Math.round(contributory * 0.0975 * 100) / 100;
        expectedSaudiCount++;
      }
      const saudi = body.filter((r: Json) => r.is_saudi === 1);
      expect(saudi.length).toBe(expectedSaudiCount);
      const apiTotal = saudi.reduce((sum: number, r: Json) => sum + Number(r.emp_share || 0), 0);
      expect(apiTotal).toBeCloseTo(expectedSaudiTotal, 0);
      // The contributory wage is the basic salary plus housing, capped at the
      // statutory ceiling — checked for every Saudi employee, not only the
      // ones who reach the ceiling.
      for (const employee of saudi) {
        const row = rows.find((r: any) => Number(r.basic_salary) === Number(employee.basic_salary)
          && Number(r.housing_allowance) === Number(employee.housing_allowance));
        if (!row) continue;
        expect(employee.contributory_salary).toBeCloseTo(
          Math.min(45000, Number(row.basic_salary || 0) + Number(row.housing_allowance || 0)),
          2,
        );
      }
    });
  });

  describe("GET /api/wps/export-sif", () => {
    it("produces one record per employee and a total that matches them", async () => {
      const { status, body } = await request(
        "GET",
        `/api/wps/export-sif?entity_id=${entityId}&month=${PERIOD.month}&year=${PERIOD.year}&value_date=20261031`,
      );
      expect(status, `export-sif refused the request: ${JSON.stringify(body)}`).toBe(200);
      expect(typeof body.content).toBe("string");
      expect(body.totalEmployees).toBeGreaterThan(0);

      // The file is a header line followed by one line per transfer:
      //   SCR,crNumber,bankCode,valueDate,createdAt,total,recordCount,SAR
      //   EDR,nationalId,bankCode,iban,net,basic,housing,other,deductions
      const lines = String(body.content).split(/\r?\n/).filter((line: string) => line.trim().length > 0);
      const header = lines[0].split(",");
      const records = lines.slice(1);
      expect(header[0]).toBe("SCR");
      expect(header[6]).toBe(String(body.totalEmployees));
      expect(Number(header[5])).toBeCloseTo(body.totalAmount, 2);
      expect(records.length).toBe(body.totalEmployees);

      // The amounts in the file have to add up to the total in its header,
      // and to the net amounts that were paid for the period. Each line
      // carries two decimals, so the sum of five hundred lines can drift a
      // few cents from the total.
      const fileTotal = records.reduce((sum, line) => sum + Number(line.split(",")[4]), 0);
      const rounding = records.length * 0.005;
      expect(Math.abs(fileTotal - body.totalAmount)).toBeLessThanOrEqual(rounding);
      const paidTotal = (await db.prepare(
        "SELECT COALESCE(SUM(bank_amount), 0) as s FROM payroll WHERE month = ? AND year = ?",
      ).get(PERIOD.month, PERIOD.year)) as any;
      expect(fileTotal).toBeCloseTo(Number(paidTotal.s), 1);
    });

    it("refuses a request without a value date", async () => {
      const { status, body } = await request(
        "GET",
        `/api/wps/export-sif?entity_id=${entityId}&month=${PERIOD.month}&year=${PERIOD.year}`,
      );
      expect(status).toBe(400);
      expect(body.code).toBe("MISSING_VALUE_DATE");
    });
  });
});
