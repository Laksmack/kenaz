import * as chrono from 'chrono-node';

export interface ParsedEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
}

export function parseNaturalLanguage(text: string): ParsedEvent | null {
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (results.length === 0) return null;

  const parsed = results[0];
  const start = parsed.start.date();
  const end = parsed.end ? parsed.end.date() : new Date(start.getTime() + 60 * 60 * 1000);

  // Extract location: "at <place>" pattern
  let location: string | undefined;
  const atMatch = text.match(/\bat\s+([A-Z][^,]*?)(?:\s+(?:on|from|at|for)\s|$)/i);
  if (atMatch) {
    const potentialLocation = atMatch[1].trim();
    // Only treat as location if it's not a time expression
    if (!chrono.parse(potentialLocation).length) {
      location = potentialLocation;
    }
  }

  // Extract emails for attendees
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const attendees = text.match(emailRegex) || undefined;

  // Build summary: remove date/time text and emails
  let summary = text;
  if (parsed.text) summary = summary.replace(parsed.text, '').trim();
  if (attendees) attendees.forEach(e => { summary = summary.replace(e, '').trim(); });
  if (location) summary = summary.replace(new RegExp(`\\bat\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').trim();
  summary = summary.replace(/\s*(with|for)\s*$/i, '').trim();
  summary = summary.replace(/^\s*(with|for)\s*/i, '').trim();
  if (!summary) summary = 'New Event';

  return { summary, start: start.toISOString(), end: end.toISOString(), location, attendees };
}
