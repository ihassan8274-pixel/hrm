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
      // The batch's own absence figure is not part of its response, so it is
      // recomputed here the way the route computes it: the days in the month
      // minus the distinct days the employee signed in.
      const daysInMonth = new Date(PERIOD.year, PERIOD.month, 0).getDate();
      const sample = body.employees.slice(0, 20);
      for (const employee of sample) {
        const present = (await db.prepare(
          `SELECT COUNT(DISTINCT check_in_time::date) as d FROM attendance_logs
            WHERE employee_id = ? AND EXTRACT(MONTH FROM check_in_time)::int = ?
              AND EXTRACT(YEAR FROM check_in_time)::int = ?`,
        ).get(employee.employeeId, PERIOD.month, PERIOD.year)) as any;
        const absentDays = Math.max(0, daysInMonth - Number(present.d));

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

    it.fails("charges the weekend days as unpaid absence", async () => {
      // Known defect, found by this suite on 20 November 2026.
      //
      // The batch counts absence as "the days in the month minus the days the
      // employee signed in". The days in the month are calendar days, so every
      // weekend day the employee did not sign in — because it was a weekend —
      // is charged as unpaid absence.
      //
      // October 2026 has 31 calendar days and 21 working days (the country
      // rules put the weekend on Friday and Saturday). An employee who signed
      // in on all 21 working days is charged 10 days of absence, which at this
      // salary is 4,647.23 — about a third of the net.
      //
      // The expected figure is zero. The test is marked as a known failure so
      // that it keeps failing until the route counts working days instead of
      // calendar days; when it is fixed, this marker turns into a failure and
      // has to be removed.
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const fullAttendance = body.employees.filter((employee: Json) => employee.absentDeduction === 0);
      expect(fullAttendance.length, "no employee was charged for days they did not work").toBeGreaterThan(0);
    });

    it("keeps every net salary inside the range the data allows", async () => {
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const nets = body.employees.map((e: Json) => e.netSalary);
      const min = Math.min(...nets);
      const max = Math.max(...nets);
      const average = nets.reduce((s: number, n: number) => s + n, 0) / nets.length;
      expect(min).toBeLessThan(average);
      expect(average).toBeLessThan(max);
      // The seeded basic salaries run from 6000 to 30000, and the net is
      // below the gross, so nothing may fall outside that band.
      const highestBasic = (await db.prepare("SELECT MAX(basic_salary) as m FROM employees").get()) as any;
      expect(max).toBeLessThanOrEqual(Number(highestBasic.m));
    });

    it.fails("never pays a negative salary", async () => {
      // Known defect, found by this suite on 20 November 2026, and the same
      // root cause as the weekend one: the absence is counted in calendar
      // days, so an employee on the lowest salary in the dataset ends up with
      // a negative net — the application would have to pay them.
      const { body } = await request("POST", `/api/payroll/batch?entity_id=${entityId}`, PERIOD);
      const negatives = body.employees.filter((e: Json) => e.netSalary < 0);
      expect(negatives.length, "an employee was paid a negative salary").toBe(0);
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
      // and to the net amounts that were paid for that period.
      const fileTotal = records.reduce((sum, line) => sum + Number(line.split(",")[4]), 0);
      expect(fileTotal).toBeCloseTo(body.totalAmount, 2);
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
