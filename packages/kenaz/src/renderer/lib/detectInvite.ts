import type { Email } from '@shared/types';

/**
 * Detect if an email is a calendar invite and extract event metadata.
 *
 * Gmail calendar invites typically:
 * - Have an .ics attachment
 * - Come from calendar-notification@google.com
 * - Contain "VCALENDAR" or "invitation" references
 *
 * Returns the iCalUID if detectable, plus a best-effort time extraction
 * from the email body for sidebar conflict previews.
 */
export function detectCalendarInvite(message: Email): {
  isInvite: boolean;
  iCalUID: string | null;
  parsedTime: { start: Date; end: Date } | null;
  parsedSummary: string | null;
} {
  const hasIcs = message.attachments.some((a) =>
    a.filename.endsWith('.ics') || a.mimeType === 'text/calendar' || a.mimeType === 'application/ics'
  );

  const isCalendarNotification = message.from.email.includes('calendar-notification@google.com') ||
    message.from.email.includes('calendar@google.com');

  let iCalUID: string | null = null;
  const bodyContent = message.body + ' ' + message.bodyText;

  const eidMatch = bodyContent.match(/calendar\.google\.com\/calendar\/event\?.*?eid=([A-Za-z0-9_-]+)/);
  if (eidMatch) {
    try {
      const decoded = atob(eidMatch[1].replace(/-/g, '+').replace(/_/g, '/'));
      const eventId = decoded.split(' ')[0];
      if (eventId) iCalUID = eventId;
    } catch {
      // ignore decode errors
    }
  }

  const hasInviteKeywords = message.subject.toLowerCase().includes('invitation:') ||
    message.subject.toLowerCase().includes('updated invitation:') ||
    bodyContent.includes('VCALENDAR') ||
    bodyContent.includes('BEGIN:VEVENT');

  const isInvite = hasIcs || isCalendarNotification || hasInviteKeywords;

  // Try to extract event time from the email body for conflict preview
  let parsedTime: { start: Date; end: Date } | null = null;
  let parsedSummary: string | null = null;

  if (isInvite) {
    parsedTime = extractTimeFromInvite(bodyContent);

    // Extract summary from "Invitation: <summary>" subject pattern
    const subjectMatch = message.subject.match(/(?:Updated )?Invitation:\s*(.+?)(?:\s*@\s*|$)/i);
    if (subjectMatch) {
      parsedSummary = subjectMatch[1].trim();
    }
  }

  return { isInvite, iCalUID, parsedTime, parsedSummary };
}

/**
 * Best-effort extraction of event times from a Google Calendar invite email.
 * Tries multiple patterns found in Google's invite HTML.
 */
function extractTimeFromInvite(bodyContent: string): { start: Date; end: Date } | null {
  // Pattern 1: Google Calendar HTML invites often contain structured time info
  // e.g., "When: Tuesday, Feb 25, 2025 9:00am – 10:00am (Eastern Time)"
  // or "When  Tue Feb 25, 2025 9am – 10am Eastern Time"
  const whenMatch = bodyContent.match(
    /When[:\s]+\w+[.,]?\s+(\w+\s+\d{1,2}[,.]?\s+\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
  );
  if (whenMatch) {
    const dateStr = whenMatch[1];
    const startTime = whenMatch[2];
    const endTime = whenMatch[3];
    const start = new Date(`${dateStr} ${startTime}`);
    const end = new Date(`${dateStr} ${endTime}`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { start, end };
    }
  }

  // Pattern 2: ISO-style dates in VEVENT data
  // DTSTART:20250225T140000Z or DTSTART;TZID=...:20250225T090000
  const dtStartMatch = bodyContent.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
  const dtEndMatch = bodyContent.match(/DTEND[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
  if (dtStartMatch && dtEndMatch) {
    const start = new Date(
      `${dtStartMatch[1]}-${dtStartMatch[2]}-${dtStartMatch[3]}T${dtStartMatch[4]}:${dtStartMatch[5]}:${dtStartMatch[6]}Z`
    );
    const end = new Date(
      `${dtEndMatch[1]}-${dtEndMatch[2]}-${dtEndMatch[3]}T${dtEndMatch[4]}:${dtEndMatch[5]}:${dtEndMatch[6]}Z`
    );
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { start, end };
    }
  }

  // Pattern 3: Date in Google Calendar link title attributes or aria-labels
  // "title="Tuesday, February 25, 2025, 9:00 AM to 10:00 AM""
  const titleMatch = bodyContent.match(
    /(\w+day,?\s+\w+\s+\d{1,2},?\s+\d{4}),?\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  );
  if (titleMatch) {
    const start = new Date(`${titleMatch[1]} ${titleMatch[2]}`);
    const end = new Date(`${titleMatch[1]} ${titleMatch[3]}`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { start, end };
    }
  }

  return null;
}
