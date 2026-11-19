import { describe, it, expect } from 'vitest';
import { formatCaptureDate } from '../../src/ui/format.js';

describe('formatCaptureDate', () => {
  it('formats a 14-digit timestamp as a plain absolute date', () => {
    expect(formatCaptureDate('20080303120000')).toBe('3 March 2008');
    expect(formatCaptureDate('20120101000000')).toBe('1 January 2012');
    expect(formatCaptureDate('19991231235959')).toBe('31 December 1999');
  });

  it('drops the leading zero on single-digit days', () => {
    expect(formatCaptureDate('20080303120000')).not.toContain('03 March');
  });

  it('returns a malformed timestamp unchanged rather than guessing', () => {
    expect(formatCaptureDate('2008')).toBe('2008');
    expect(formatCaptureDate('20081399120000')).toBe('20081399120000');
  });
});
