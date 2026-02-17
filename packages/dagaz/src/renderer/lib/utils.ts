// Global time format preference — set from App.tsx when config loads
let _use24Hour = false;
export function setUse24HourClock(v: boolean) { _use24Hour = v; }
export function getUse24HourClock() { return _use24Hour; }

// Re-export core utils — use relative path for bundler resolution
export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function formatFullDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Format a time string for display on the calendar timeline.
 */
export function formatTime(iso: string, use24Hour?: boolean): string {
  const h24 = use24Hour ?? _use24Hour;
  const date = new Date(iso);
  if (h24) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Format a time range for display.
 */
export function formatTimeRange(start: string, end: string, use24Hour?: boolean): string {
  return `${formatTime(start, use24Hour)} – ${formatTime(end, use24Hour)}`;
}

/**
 * Format a date for the header display.
 */
export function formatDayHeader(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Get the week dates starting from the given date.
 */
export function getWeekDates(date: Date, days: 5 | 7 = 5): Date[] {
  const d = new Date(date);
  const dayOfWeek = d.getDay();

  // Start on Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));

  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    dates.push(current);
  }
  return dates;
}

/**
 * Get month grid dates (6 rows of 7 days).
 */
export function getMonthDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
  const start = new Date(firstDay);
  start.setDate(start.getDate() - startDay);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * Check if two dates are the same day.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * Convert a time position (y-offset) to hours.
 */
export function yToHour(y: number, hourHeight: number): number {
  return y / hourHeight;
}

/**
 * Snap a time to a given increment in minutes.
 */
export function snapToMinutes(date: Date, minutes: number): Date {
  const ms = minutes * 60 * 1000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

/**
 * Get a date string for use as a key.
 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
