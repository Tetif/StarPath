export interface MissionTime {
  start: Date;
  stop: Date;
  current: Date;
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function secondsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 1000;
}

export function lerpTime(start: Date, stop: Date, t: number): Date {
  const ms = start.getTime() + (stop.getTime() - start.getTime()) * t;
  return new Date(ms);
}

export function clampTime(time: Date, start: Date, stop: Date): Date {
  const ms = Math.min(Math.max(time.getTime(), start.getTime()), stop.getTime());
  return new Date(ms);
}

export function parseIso(iso: string): Date {
  return new Date(iso);
}

export const J2000 = new Date("2000-01-01T12:00:00Z");

const MS_PER_DAY = 86400000;
const MS_PER_YEAR = 365 * MS_PER_DAY;

export function getDefaultSimulationRange(now = new Date()): {
  start: Date;
  stop: Date;
  current: Date;
} {
  return {
    start: new Date(now.getTime() - MS_PER_YEAR),
    stop: new Date(now.getTime() + MS_PER_YEAR),
    current: now,
  };
}

export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDatetimeLocal(value: string): Date {
  return new Date(value);
}

export function ensureClockRange(start: Date, stop: Date): { start: Date; stop: Date } {
  if (start.getTime() < stop.getTime()) {
    return { start, stop };
  }
  return {
    start,
    stop: new Date(start.getTime() + MS_PER_DAY),
  };
}

export function daysSinceJ2000(time: Date): number {
  return (time.getTime() - J2000.getTime()) / 86400000;
}
