import { describe, expect, it } from 'vitest';
import { buildClientErrorPayload, buildErrorReport, redact, safeClientUrl } from '../errorReporting';

describe('runtime error reporting', () => {
  it('redacts bearer tokens and credential query parameters', () => {
    expect(redact('GET /api/x failed: Bearer abc.def-123')).toBe(
      'GET /api/x failed: Bearer [redacted]',
    );
    expect(redact('/api/x?token=secret123&page=2')).toBe('/api/x?token=[redacted]&page=2');
    expect(redact('password=hunter2 secret=abc api_key=xyz')).toBe(
      'password=[redacted] secret=[redacted] api_key=[redacted]',
    );
  });

  it('builds a redacted report with route and timestamp', () => {
    const report = buildErrorReport(
      'react',
      new Error('Bearer abc.def failed at /api/x?token=12345'),
      'Stack of component',
      () => '2026-11-26T12:00:00.000Z',
      () => '/m',
    );

    expect(report.kind).toBe('react');
    expect(report.message).not.toContain('abc.def');
    expect(report.message).not.toContain('12345');
    expect(report.path).toBe('/m');
    expect(report.at).toBe('2026-11-26T12:00:00.000Z');
    expect(report.componentStack).toBe('Stack of component');
  });

  it('caps long stacks so a beacon cannot carry an unbounded payload', () => {
    const error = new Error('boom');
    error.stack = 'x'.repeat(6000);
    const report = buildErrorReport('window', error, 'y'.repeat(6000));
    expect(report.stack?.length).toBe(2000);
    expect(report.componentStack?.length).toBe(2000);
  });

  it('handles non-Error rejection reasons without throwing', () => {
    const report = buildErrorReport('rejection', { code: 403 }, undefined, () => 't', () => '/');
    expect(report.kind).toBe('rejection');
    expect(report.message).toBe('{"code":403}');
  });

  it('sends only the four anonymous payload fields', () => {
    const report = buildErrorReport(
      'react',
      new Error('Bearer abc failed password=hunter2'),
      'Component stack',
      () => '2026-11-28T12:00:00.000Z',
      () => '/m/kiosk/secret-token?token=xyz#frag',
    );
    const payload = buildClientErrorPayload(report);
    expect(Object.keys(payload).sort()).toEqual(['level', 'message', 'stack', 'url']);
    expect(payload.level).toBe('error');
    expect(payload.message).not.toMatch(/abc|hunter2/);
    expect(payload.url).toBe('/m/kiosk/[redacted]');
    expect(JSON.stringify(payload)).not.toContain('2026-11-28T12:00:00.000Z');
    expect(JSON.stringify(payload)).not.toContain('react');
  });

  it('caps outbound text and strips identifiers from paths', () => {
    const error = new Error('boom');
    error.stack = 'x'.repeat(6000);
    const payload = buildClientErrorPayload(buildErrorReport('window', error, undefined, () => 't', () => '/m/123'));
    expect(payload.message.length).toBeLessThanOrEqual(500);
    expect(payload.stack?.length).toBeLessThanOrEqual(4000);
    expect(payload.url).toBe('/m/:id');
    expect(safeClientUrl('/m/550e8400-e29b-41d4-a716-446655440000/payslips?token=abc'))
      .toBe('/m/:id/payslips');
  });
});
