process.env.DATABASE_URL ||= "postgres://payroll:payroll@localhost:5432/payroll";

import fs from "fs";
import path from "path";
import { describe, expect, it } from 'vitest';
import { clean, clientErrorSchema, safeUrl } from '../clientErrors';
import { openApi } from '../../middleware/auth';

describe('self-hosted client error collector', () => {
  it('accepts only the four allowed anonymous fields', () => {
    expect(clientErrorSchema.safeParse({ message: 'boom' }).success).toBe(true);
    expect(clientErrorSchema.parse({ message: 'boom' }).level).toBe('error');
    for (const body of [
      { message: 'boom', token: 'x' },
      { message: 'boom', headers: { authorization: 'Bearer abc' } },
      { message: 'boom', user_id: 1 },
      { message: '', stack: 'x'.repeat(4001), url: 'y'.repeat(301), level: 'debug' },
    ]) {
      expect(clientErrorSchema.safeParse(body).success).toBe(false);
    }
  });

  it('redacts credentials and strips identifiers from every field', () => {
    expect(clean('Bearer abc failed password=hunter2 api_key=xyz'))
      .not.toMatch(/abc|hunter2|xyz/);
    expect(safeUrl('https://x/kiosk/secret-token?token=abc#frag')).toBe('/kiosk/[redacted]');
    expect(safeUrl('/m/123/payslips')).toBe('/m/:id/payslips');
    expect(safeUrl('/m/550e8400-e29b-41d4-a716-446655440000/payslips'))
      .toBe('/m/:id/payslips');
  });

  it('is anonymous, rate-limited and never echoes content', () => {
    expect(openApi).toContain('/api/client-errors');
    const src = fs.readFileSync(path.join(process.cwd(), 'server/routes/clientErrors.ts'), 'utf8');
    expect(src).toContain('rateLimit(');
    expect(src).toContain('res.status(204).end()');
    expect(src).not.toMatch(/logAction|req\.user|res\.json\(body\)/);
  });
});
