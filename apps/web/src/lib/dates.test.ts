import { describe, expect, it } from 'vitest';
import { formatDateTime } from './dates';

describe('formatDateTime', () => {
  const utc = '2026-03-01T21:30:00Z'; // 00:30 on 2 March in Riyadh (UTC+3)

  it('displays UTC instants in Asia/Riyadh', () => {
    expect(formatDateTime(utc, 'en')).toMatch(/2 Mar 2026/);
    expect(formatDateTime(utc, 'en')).toMatch(/00:30/);
  });

  it('uses the Gregorian calendar by default and Hijri when asked', () => {
    expect(formatDateTime(utc, 'ar')).toMatch(/2026/);
    expect(formatDateTime(utc, 'ar', { hijri: true })).toMatch(/1447/);
  });

  it('renders a dash for missing values', () => {
    expect(formatDateTime(null, 'ar')).toBe('—');
  });
});
