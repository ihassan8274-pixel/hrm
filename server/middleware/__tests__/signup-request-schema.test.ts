import { describe, expect, it } from 'vitest';
import { signupRequestSchema } from '../validation';

/**
 * The public signup form must never be a role-selection form. Whatever the
 * anonymous caller sends, only the five staged identity fields survive; the
 * administrator chooses the role later, at approval time.
 */
const validRequest = {
  full_name: 'عبدالله العتيبي',
  email: 'abdullah@example.com',
  phone: '0551234567',
  username: 'abdullah.ot',
  password: 'StrongPass123!',
};

describe('public signup request schema', () => {
  it('accepts a valid Saudi registration request', () => {
    expect(signupRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('ignores any role or permission field the caller tries to smuggle in', () => {
    const parsed = signupRequestSchema.parse({
      ...validRequest,
      role: 'admin',
      permissions: ['*'],
      status: 'approved',
    });
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('permissions');
    expect(parsed).not.toHaveProperty('status');
  });

  it('rejects a non-Saudi / malformed mobile number', () => {
    expect(signupRequestSchema.safeParse({ ...validRequest, phone: '12345' }).success).toBe(false);
  });

  it('rejects a short password', () => {
    expect(signupRequestSchema.safeParse({ ...validRequest, password: '123' }).success).toBe(false);
  });
});
