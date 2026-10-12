import { describe, it, expect } from 'vitest';
import { RecurrenceCalculator } from '../src/core/detectors/recurrence-calculator';

describe('RecurrenceCalculator', () => {
  it('correctly calculates next monthly due date for normal days', () => {
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2026-05-15',
      { frequency: 'monthly', isConfirmedByUser: true },
      '2026-05-15'
    );
    expect(nextDate).toBe('2026-06-15');
  });

  it('correctly handles month boundaries (January 31 -> February 28)', () => {
    // 2026 is not a leap year, Feb has 28 days
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2026-01-31',
      { frequency: 'monthly', dayOfMonth: 31, isConfirmedByUser: true },
      '2026-01-31'
    );
    expect(nextDate).toBe('2026-02-28');
  });

  it('correctly handles leap year February (February 29)', () => {
    // 2028 is a leap year
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2028-01-31',
      { frequency: 'monthly', dayOfMonth: 31, isConfirmedByUser: true },
      '2028-01-31'
    );
    expect(nextDate).toBe('2028-02-29');
  });

  it('correctly calculates quarterly recurrence', () => {
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2026-01-10',
      { frequency: 'quarterly', isConfirmedByUser: true },
      '2026-01-10'
    );
    expect(nextDate).toBe('2026-04-10');
  });

  it('correctly calculates annual recurrence', () => {
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2026-10-12',
      { frequency: 'annual', isConfirmedByUser: true },
      '2026-10-12'
    );
    expect(nextDate).toBe('2027-10-12');
  });

  it('advances past overdue dates until a future cycle is found', () => {
    // Reference date is 2026-10-12, but anchor was in January
    const nextDate = RecurrenceCalculator.calculateNextDueDate(
      '2026-01-10',
      { frequency: 'monthly', dayOfMonth: 10, isConfirmedByUser: true },
      '2026-10-12'
    );
    expect(nextDate).toBe('2026-11-10');
  });

  it('correctly calculates lead time reminder date', () => {
    const reminderDate = RecurrenceCalculator.calculateReminderDate('2026-10-15', 3);
    expect(reminderDate).toBe('2026-10-12');

    const sameDay = RecurrenceCalculator.calculateReminderDate('2026-10-15', 0);
    expect(sameDay).toBe('2026-10-15');
  });

  it('calculates calendar days difference accurately', () => {
    expect(RecurrenceCalculator.getDaysDifference('2026-10-15', '2026-10-12')).toBe(3);
    expect(RecurrenceCalculator.getDaysDifference('2026-10-12', '2026-10-12')).toBe(0);
    expect(RecurrenceCalculator.getDaysDifference('2026-10-10', '2026-10-12')).toBe(-2);
  });
});
