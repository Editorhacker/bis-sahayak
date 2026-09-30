import { format, parseISO, addDays, subDays, startOfDay, endOfDay, isBefore, isAfter, differenceInDays } from 'date-fns';

export function formatDate(date: Date | string, pattern: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern);
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm:ss');
}

export function getDateRange(days: number): { start: Date; end: Date } {
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(new Date(), days));
  return { start, end };
}

export function isOverdue(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isBefore(d, startOfDay(new Date()));
}

export function daysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return differenceInDays(d, new Date());
}

export function addBusinessDays(date: Date, days: number): Date {
  let result = new Date(date);
  let added = 0;
  
  while (added < days) {
    result = addDays(result, 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }
  
  return result;
}

export const DATE_FORMATS = {
  API: 'yyyy-MM-dd',
  API_DATETIME: 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx',
  DISPLAY: 'MMM d, yyyy',
  DISPLAY_SHORT: 'MM/dd/yyyy',
} as const;