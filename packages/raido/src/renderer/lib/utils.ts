export { formatRelativeDate, formatFullDate } from '@futhark/core/lib/utils';

/**
 * Context-aware date display for task list (right-aligned column).
 *
 * Thermal scale tiers:
 *   Overdue  → "Xd"         (e.g. 19d, 3d, 1d)
 *   Today    → "Today"
 *   Tomorrow → "Tomorrow"
 *   2-3 days → day name     (e.g. Mon, Tue)
 *   4+ days  → "Feb 20"     (month + day)
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays < 0) return `${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 3) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns the CSS variable name for the thermal date color.
 * Used by TaskList for the right-aligned date label.
 */
export function getDateColor(dateStr: string | null): { color: string; bold: boolean } {
  if (!dateStr) return { color: 'rgb(var(--text-muted))', bold: false };
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays <= -5) return { color: 'var(--date-overdue-hot)',  bold: true };
  if (diffDays <= -2) return { color: 'var(--date-overdue-warm)', bold: false };
  if (diffDays === -1) return { color: 'var(--date-overdue-mild)', bold: false };
  if (diffDays === 0) return { color: 'var(--date-today)',        bold: false };
  if (diffDays === 1) return { color: 'var(--date-tomorrow)',     bold: false };
  if (diffDays <= 3) return { color: 'var(--date-soon)',          bold: false };
  return { color: 'var(--date-future)',                           bold: false };
}

/**
 * Human-readable label for the detail pane (next to date picker).
 *   Overdue  → "X days overdue"
 *   Today    → "Due today"
 *   ≤5 days  → "Due in X days"
 *   Later    → null (no label)
 */
export function formatDateLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return `${abs} day${abs === 1 ? '' : 's'} overdue`;
  }
  if (diffDays === 0) return 'Due today';
  if (diffDays <= 5) return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  return null;
}

export function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return dateStr < today;
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export function isDueSoon(dateStr: string | null, leadDays: number = 5): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86400000);
  return diffDays > 0 && diffDays <= leadDays;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
