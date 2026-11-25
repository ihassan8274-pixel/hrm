import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, idleRemainingMs } from '../sessionIdle';

describe('idle session countdown', () => {
  it('allows the full fifteen minutes after an interaction', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(idleRemainingMs(1000, 1000)).toBe(IDLE_TIMEOUT_MS);
  });

  it('counts down in real time', () => {
    expect(idleRemainingMs(1000, 1000 + 14 * 60 * 1000)).toBe(60 * 1000);
    expect(idleRemainingMs(1000, 1000 + IDLE_TIMEOUT_MS - IDLE_WARNING_MS)).toBe(IDLE_WARNING_MS);
  });

  it('never returns a negative value after the deadline', () => {
    expect(idleRemainingMs(1000, 1000 + IDLE_TIMEOUT_MS)).toBe(0);
    expect(idleRemainingMs(1000, 1000 + IDLE_TIMEOUT_MS + 5000)).toBe(0);
  });

  it('ignores a clock that moved backwards', () => {
    expect(idleRemainingMs(1000, 500)).toBe(IDLE_TIMEOUT_MS);
  });
});
