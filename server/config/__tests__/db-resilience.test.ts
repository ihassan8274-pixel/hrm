import { describe, it, expect } from "vitest";
import { isConnectionLevelFailure, isReadStatement } from "../db-resilience";

/**
 * A dead pooled client used to turn into a 500 for the user: the request that
 * was waiting on it failed even though the statement never ran. These tests
 * pin the rule that decides what may be tried again — and what must not be,
 * because repeating it would duplicate a row.
 */
describe("isConnectionLevelFailure", () => {
  it("treats a terminated connection as retryable", () => {
    const error = new Error("Connection terminated unexpectedly");
    expect(isConnectionLevelFailure(error)).toBe(true);
  });

  it("treats the pg-pool timeout wrapper as retryable", () => {
    const error = new Error(
      "Connection terminated due to connection timeout: Connection terminated unexpectedly",
    );
    expect(isConnectionLevelFailure(error)).toBe(true);
  });

  it("treats a socket-level error code as retryable", () => {
    expect(isConnectionLevelFailure(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toBe(true);
  });

  it("treats a shutdown SQLSTATE as retryable", () => {
    expect(isConnectionLevelFailure(Object.assign(new Error("shutdown"), { code: "57P01" }))).toBe(true);
  });

  it("does not retry a statement the server refused", () => {
    const error = Object.assign(new Error('relation "employees" does not exist'), { code: "42P01" });
    expect(isConnectionLevelFailure(error)).toBe(false);
  });

  it("does not retry a constraint violation", () => {
    const error = Object.assign(new Error("duplicate key value"), { code: "23505" });
    expect(isConnectionLevelFailure(error)).toBe(false);
  });

  it("does not retry an ordinary application error", () => {
    expect(isConnectionLevelFailure(new Error("bad request"))).toBe(false);
    expect(isConnectionLevelFailure(undefined)).toBe(false);
  });
});

describe("isReadStatement", () => {
  it("accepts the read shapes", () => {
    expect(isReadStatement("SELECT * FROM employees")).toBe(true);
    expect(isReadStatement("select 1")).toBe(true);
    expect(isReadStatement("WITH t AS (SELECT 1) SELECT * FROM t")).toBe(true);
    expect(isReadStatement("EXPLAIN SELECT 1")).toBe(true);
    expect(isReadStatement("SHOW search_path")).toBe(true);
  });

  it("skips a leading comment before deciding", () => {
    expect(isReadStatement("-- a note\nSELECT 1")).toBe(true);
    expect(isReadStatement("/* a note */ SELECT 1")).toBe(true);
  });

  it("refuses writes", () => {
    expect(isReadStatement("UPDATE employees SET name = 'x'")).toBe(false);
    expect(isReadStatement("INSERT INTO employees (name) VALUES ('x')")).toBe(false);
    expect(isReadStatement("DELETE FROM employees")).toBe(false);
    expect(isReadStatement("  update employees set name = 'x'")).toBe(false);
  });

  it("refuses a common table expression that ends in a write", () => {
    expect(isReadStatement("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x")).toBe(false);
    expect(isReadStatement("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
  });
});
