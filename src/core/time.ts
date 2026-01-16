/**
 * Time utilities for consistent date handling
 */

import { format, parseISO, isWeekend, subDays, isBefore, startOfDay } from 'date-fns';

export function getCurrentDate(): Date {
  return new Date();
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

export function getRunId(date: Date, hash: string): string {
  return `${formatDate(date)}__${hash.substring(0, 8)}`;
}

export function getLastTradingDay(date: Date = new Date()): Date {
  let tradingDay = startOfDay(date);

  // If weekend, go back to Friday
  while (isWeekend(tradingDay)) {
    tradingDay = subDays(tradingDay, 1);
  }

  // If current date and market not closed yet (before 4pm ET), use previous day
  const now = new Date();
  const marketCloseHour = 16; // 4 PM ET (simplified)
  if (
    formatDate(tradingDay) === formatDate(now) &&
    now.getHours() < marketCloseHour
  ) {
    tradingDay = subDays(tradingDay, 1);
    while (isWeekend(tradingDay)) {
      tradingDay = subDays(tradingDay, 1);
    }
  }

  return tradingDay;
}

export function isCacheExpired(
  cachedAt: Date,
  ttlSeconds: number,
  now: Date = new Date()
): boolean {
  const expiresAt = new Date(cachedAt.getTime() + ttlSeconds * 1000);
  return isBefore(expiresAt, now);
}

export function hoursToSeconds(hours: number): number {
  return hours * 60 * 60;
}

export function daysToSeconds(days: number): number {
  return days * 24 * 60 * 60;
}

export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}
