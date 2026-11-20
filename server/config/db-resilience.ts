/**
 * Classifying database failures.
 *
 * A pooled client can die between two requests: the database was restarted, the
 * network blipped, the container behind the port was replaced. When that
 * happens the request that was waiting on the dead client fails even though the
 * statement never ran, and the user sees a 500 for what is really a blip.
 *
 * The distinction that matters here is "the server never answered" versus "the
 * server answered and refused". A PostgreSQL error always carries a SQLSTATE
 * code, so an error without a recognisable connection code never reached the
 * statement engine — which makes it safe to run again.
 *
 * This module is deliberately free of side effects so it can be unit-tested
 * without a database.
 */

/** SQLSTATE codes that mean the session itself is gone, not the statement. */
export const CONNECTION_STATE_CODES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
  "08P01", // protocol_violation
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

/** Node-level socket errors that never reach PostgreSQL. */
export const NODE_CONNECTION_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
]);

/** Fragments of the messages the pg driver uses when the socket dies. */
export const CONNECTION_MESSAGE_HINTS = [
  "connection terminated",
  "terminated unexpectedly",
  "timeout exceeded when trying to connect",
  "connection reset",
  "connection refused",
  "socket hang up",
  "server closed the connection",
  "client has encountered a connection error",
  "the database system is starting up",
  "the database system is shutting down",
];

/**
 * True when the failure is a broken connection rather than a rejected
 * statement. Only these are safe to retry.
 */
export function isConnectionLevelFailure(error: unknown): boolean {
  if (!error) return false;
  const code = String((error as { code?: unknown }).code ?? "").trim();
  if (code) {
    if (CONNECTION_STATE_CODES.has(code)) return true;
    if (NODE_CONNECTION_CODES.has(code)) return true;
    // Any other code is a SQLSTATE: the server answered and refused.
    return false;
  }
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();
  return CONNECTION_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

/**
 * True for statements that only read. A read can be repeated without changing
 * anything, so it may be retried after a broken connection. A write may not:
 * the server might have applied it before the connection dropped, and running
 * it twice would duplicate the row.
 */
export function isReadStatement(sql: string): boolean {
  const withoutComments = sql
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, "")
    .trimStart()
    .toUpperCase();
  if (withoutComments.startsWith("SELECT")) return true;
  if (withoutComments.startsWith("EXPLAIN")) return true;
  if (withoutComments.startsWith("SHOW")) return true;
  if (withoutComments.startsWith("TABLE")) return true;
  if (withoutComments.startsWith("WITH")) {
    // A common table expression can still end in a write: "WITH x AS (...)
    // INSERT INTO ...". Any write keyword anywhere in the statement makes it a
    // write — the safe answer, because repeating a write duplicates rows.
    return !/\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(withoutComments);
  }
  return false;
}
