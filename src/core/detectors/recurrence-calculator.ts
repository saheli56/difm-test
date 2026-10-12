import { RecurrenceFrequency, RecurrenceRule } from '../records/types';

export class RecurrenceCalculator {
  /**
   * Calculates the next due date based on an anchor date and recurrence rule.
   * Handles month-end boundaries (e.g. Jan 31 -> Feb 28/29 -> Mar 31).
   * Formatted as ISO YYYY-MM-DD.
   */
  public static calculateNextDueDate(
    anchorDateIso: string,
    rule: RecurrenceRule,
    referenceDateIso?: string
  ): string {
    const anchor = this.parseIsoDate(anchorDateIso);
    const ref = referenceDateIso ? this.parseIsoDate(referenceDateIso) : new Date();

    if (rule.frequency === 'one_off') {
      return anchorDateIso;
    }

    if (rule.frequency === 'custom_days' && rule.intervalDays && rule.intervalDays > 0) {
      let nextDate = new Date(anchor.getTime());
      while (nextDate <= ref) {
        nextDate.setDate(nextDate.getDate() + rule.intervalDays);
      }
      return this.formatIsoDate(nextDate);
    }

    const anchorDay = rule.dayOfMonth || anchor.getDate();
    let monthsToAdd = 1;

    switch (rule.frequency) {
      case 'monthly':
        monthsToAdd = 1;
        break;
      case 'bi_monthly':
        monthsToAdd = 2;
        break;
      case 'quarterly':
        monthsToAdd = 3;
        break;
      case 'annual':
        monthsToAdd = 12;
        break;
      default:
        monthsToAdd = 1;
    }

    let year = anchor.getFullYear();
    let month = anchor.getMonth(); // 0-indexed

    let candidateDate: Date;
    do {
      month += monthsToAdd;
      while (month >= 12) {
        month -= 12;
        year += 1;
      }
      const daysInTargetMonth = this.getDaysInMonth(year, month);
      const clampedDay = Math.min(anchorDay, daysInTargetMonth);
      candidateDate = new Date(Date.UTC(year, month, clampedDay));
    } while (candidateDate <= ref);

    return this.formatIsoDate(candidateDate);
  }

  /**
   * Calculates lead-time reminder date(s).
   * E.g. If dueDate is 2026-10-15 and leadDays is 3, reminder date is 2026-10-12.
   */
  public static calculateReminderDate(targetDateIso: string, leadDays: number): string {
    const target = this.parseIsoDate(targetDateIso);
    const reminder = new Date(target.getTime());
    reminder.setDate(reminder.getDate() - leadDays);
    return this.formatIsoDate(reminder);
  }

  /**
   * Returns difference in calendar days between two dates.
   * Positive means targetDate is in future relative to fromDate.
   * 0 means same day.
   * Negative means targetDate has passed (overdue).
   */
  public static getDaysDifference(targetDateIso: string, fromDateIso?: string): number {
    const target = this.parseIsoDate(targetDateIso);
    const from = fromDateIso ? this.parseIsoDate(fromDateIso) : this.getTodayUtc();

    const targetMidnight = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    const fromMidnight = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());

    const diffMs = targetMidnight - fromMidnight;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper to parse YYYY-MM-DD or full ISO strings into a normalized UTC date.
   */
  public static parseIsoDate(isoString: string): Date {
    if (!isoString) {
      return this.getTodayUtc();
    }
    const parts = isoString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(Date.UTC(year, month, day));
      }
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return this.getTodayUtc();
    }
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  /**
   * Helper to parse any date string (ISO or human text like "October 6, 2026") into YYYY-MM-DD safely without timezone shift.
   */
  public static parseAnyDateToIso(dateStr: string): string {
    if (!dateStr) return this.getTodayIso();
    const trimmed = dateStr.trim();
    const isoParts = trimmed.split('T')[0].split('-');
    if (isoParts.length === 3 && isoParts[0].length === 4) {
      return trimmed.split('T')[0];
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return this.getTodayIso();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Formats a date into YYYY-MM-DD in UTC.
   */
  public static formatIsoDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  public static getTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  public static getTodayIso(): string {
    return this.formatIsoDate(this.getTodayUtc());
  }

  public static getDaysInMonth(year: number, monthZeroIndexed: number): number {
    // Setting day to 0 of the next month gets last day of target month
    return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
  }
}
