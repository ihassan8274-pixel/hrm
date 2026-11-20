/**
 * In-process request metrics.
 *
 * The server had no metrics endpoint at all — only /api/health and /api/ready,
 * which answer "is the process up" and "is the database reachable". Nothing
 * said how many requests a screen receives, which routes fail, or how slow
 * they are.
 *
 * The counters live in memory: they are per-process and reset on a restart,
 * which is enough to spot a slow or failing route. A multi-instance
 * deployment would need a shared store, but the value of having the numbers
 * at all is worth more than the aggregation.
 */

export interface RouteMetric {
  route: string;
  requests: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

const metrics = new Map<string, RouteMetric>();

/** Records one finished request. */
export function recordRequest(route: string, durationMs: number, failed: boolean): void {
  const existing = metrics.get(route);
  if (existing) {
    existing.requests += 1;
    existing.totalMs += durationMs;
    existing.maxMs = Math.max(existing.maxMs, durationMs);
    if (failed) existing.errors += 1;
    return;
  }
  metrics.set(route, {
    route,
    requests: 1,
    errors: failed ? 1 : 0,
    totalMs: durationMs,
    maxMs: durationMs,
  });
}

/** The counters, slowest route first. */
export function snapshotMetrics() {
  const routes = [...metrics.values()]
    .map((metric) => ({
      ...metric,
      avgMs: metric.requests ? Math.round((metric.totalMs / metric.requests) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
  const requests = routes.reduce((sum, metric) => sum + metric.requests, 0);
  const errors = routes.reduce((sum, metric) => sum + metric.errors, 0);
  return {
    routes: routes.length,
    requests,
    errors,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
    routeMetrics: routes,
  };
}
