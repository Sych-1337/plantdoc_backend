import { DateTime } from 'luxon';

/**
 * Free-tier limits reset on a weekly schedule: each Monday at a fixed local time
 * (default 08:00 Europe/Kiev). No cron job is required — period id is derived from
 * wall-clock time, so counters reset on the next API call after the boundary.
 */
export function getFreeUsageResetConfig(): {
  timeZone: string;
  hour: number;
  minute: number;
} {
  return {
    timeZone: process.env.USAGE_RESET_TZ || 'Europe/Kyiv',
    hour: Number(process.env.USAGE_RESET_HOUR ?? '8'),
    minute: Number(process.env.USAGE_RESET_MINUTE ?? '0'),
  };
}

/**
 * UTC ISO instant when the current free-usage week started (inclusive).
 * Used as `freeUsagePeriodId` in stored usage.
 */
export function currentFreeUsagePeriodStartIso(now: Date = new Date()): string {
  const { timeZone, hour, minute } = getFreeUsageResetConfig();
  const t = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timeZone);
  const monday = t.startOf('week');
  let periodStart = monday.set({ hour, minute, second: 0, millisecond: 0 });
  if (t < periodStart) {
    periodStart = periodStart.minus({ weeks: 1 });
  }
  const iso = periodStart.toUTC().toISO();
  if (!iso) throw new Error('free usage period ISO unavailable');
  return iso;
}

/** When the current free-usage week ends (exclusive), UTC ISO. */
export function currentFreeUsagePeriodEndIso(now: Date = new Date()): string {
  const start = DateTime.fromISO(currentFreeUsagePeriodStartIso(now), { zone: 'utc' });
  const end = start.plus({ weeks: 1 });
  const iso = end.toISO();
  if (!iso) throw new Error('free usage period end ISO unavailable');
  return iso;
}
