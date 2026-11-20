import pino, { type Logger } from "pino";

/**
 * The server's logger.
 *
 * `console.log` in a container writes a bare line to stdout: no timestamp, no
 * level, no way to trace one request across the lines it produced. Pino writes
 * one JSON object per line, which is what a log collector can index.
 *
 * The level comes from LOG_LEVEL (default "info"); "debug" turns the request
 * log on.
 */
const base: Logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "massobi-payroll" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Keeps the console-like call shape — `log.error("message", err)` — while
 * still writing a structured line.
 *
 * pino wants the extra values inside an object, and the call sites read
 * better in the shape the console.* calls had. The adapter moves an Error
 * into the `err` field pino knows how to serialise (stack included) and any
 * other extra value into `details`, so nothing is lost on the way out.
 */
function adapt(fn: (...args: any[]) => void) {
  return (message: string, ...args: unknown[]): void => {
    if (args.length === 0) {
      fn(message);
      return;
    }
    const [first, ...rest] = args;
    if (first instanceof Error) {
      fn({ err: first, ...(rest.length ? { details: rest } : {}) }, message);
      return;
    }
    fn({ details: args }, message);
  };
}

export const log = {
  info: adapt(base.info.bind(base)),
  warn: adapt(base.warn.bind(base)),
  error: adapt(base.error.bind(base)),
  debug: adapt(base.debug.bind(base)),
  /** A pino logger, for the call sites that pass a structured payload. */
  child: base.child.bind(base),
};

/**
 * A logger bound to one request, so every line carries the request id.
 *
 * The id is the value of the `X-Request-Id` header: the server accepts one
 * from the caller (so a report can be traced across a proxy) and generates
 * one otherwise. It comes back in the response header as well, which is what
 * makes a user complaint actionable.
 */
export function requestLogger(requestId: string) {
  return base.child({ requestId });
}
