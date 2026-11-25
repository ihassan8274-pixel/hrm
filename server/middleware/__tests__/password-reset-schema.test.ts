import { describe, expect, it } from 'vitest';
import { passwordResetRequestSchema } from '../validation';

describe('public password reset request schema', () => {
  it('accepts only the two identifiers and drops injected privilege fields', () => {
    const parsed = passwordResetRequestSchema.parse({
      username: 'hr_user',
      email: 'User@Example.com',
      role: 'admin',
      status: 'active',
      user_id: 1,
      newPassword: 'anything',
    });
    expect(parsed).toEqual({ username: 'hr_user', email: 'User@Example.com' });
  });

  it('rejects an invalid email', () => {
    expect(() => passwordResetRequestSchema.parse({ username: 'hr_user', email: 'not-an-email' })).toThrow();
  });

  it('rejects usernames outside the safe character set', () => {
    expect(() => passwordResetRequestSchema.parse({ username: 'hr user', email: 'user@example.com' })).toThrow();
  });
});
