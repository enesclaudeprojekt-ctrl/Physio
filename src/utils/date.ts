import type { ISODate } from '../domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Anzahl Tage von a nach b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(date: ISODate | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
  if (!date) return '–';
  return parseISODate(date).toLocaleDateString('de-DE', opts);
}

export function formatShort(date: ISODate): string {
  return parseISODate(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function weekdayName(date: ISODate): string {
  return parseISODate(date).toLocaleDateString('de-DE', { weekday: 'long' });
}

export function uid(prefix = 'id'): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}
