/**
 * Google Calendar event colorId → hex (Calendar API palette).
 * @see https://developers.google.com/calendar/api/v3/reference/events
 */
export const GOOGLE_EVENT_COLOR_BY_ID: Record<string, string> = {
  '1': '#7986CB',
  '2': '#33B679',
  '3': '#8E24AA',
  '4': '#E67C73',
  '5': '#F6BF26',
  '6': '#F4511E',
  '7': '#039BE5',
  '8': '#616161',
  '9': '#3F51B5',
  '10': '#0B8043',
  '11': '#D50000',
};

/** Swatches for the quick-create color row (id '' = calendar default). */
export const GOOGLE_EVENT_COLOR_SWATCHES: Array<{ id: string; hex: string }> = [
  { id: '', hex: '' },
  ...Object.entries(GOOGLE_EVENT_COLOR_BY_ID).map(([id, hex]) => ({ id, hex })),
];

export function eventDisplayColor(event: { color_id?: string | null; calendar_color?: string | null }): string {
  const id = event.color_id;
  if (id && GOOGLE_EVENT_COLOR_BY_ID[id]) return GOOGLE_EVENT_COLOR_BY_ID[id];
  return event.calendar_color || '#4A9AC2';
}
