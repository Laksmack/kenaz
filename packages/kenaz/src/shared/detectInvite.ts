import type { Email } from './types';

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

  let parsedTime: { start: Date; end: Date } | null = null;
  let parsedSummary: string | null = null;

  if (isInvite) {
    parsedTime = extractTimeFromInvite(bodyContent, message.subject);

    const subjectMatch = message.subject.match(/(?:Updated )?Invitation:\s*(.+?)(?:\s*@\s*|$)/i);
    if (subjectMatch) {
      parsedSummary = subjectMatch[1].trim();
    }
  }

  return { isInvite, iCalUID, parsedTime, parsedSummary };
}

/**
 * Best-effort extraction of event times from a Google Calendar invite email.
 * Tries multiple patterns found in Google's invite HTML and subject lines.
 */
function extractTimeFromInvite(bodyContent: string, subject?: string): { start: Date; end: Date } | null {
  const whenMatch = bodyContent.match(
    /When[:\s]+\w+[.,]?\s+(\w+\s+\d{1,2}[,.]?\s+\d{4})\s*[·•,]?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[–—\-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
  );
  if (whenMatch) {
    const result = parseDateTimeParts(whenMatch[1], whenMatch[2], whenMatch[3]);
    if (result) return result;
  }

  if (subject) {
    const subjectMatch = subject.match(
      /@\s*\w+\s+(\w+\s+\d{1,2},?\s+\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[–—\-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
    );
    if (subjectMatch) {
      const result = parseDateTimeParts(subjectMatch[1], subjectMatch[2], subjectMatch[3]);
      if (result) return result;
    }
  }

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

  const titleMatch = bodyContent.match(
    /(\w+day,?\s+\w+\s+\d{1,2},?\s+\d{4}),?\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  );
  if (titleMatch) {
    const result = parseDateTimeParts(titleMatch[1], titleMatch[2], titleMatch[3]);
    if (result) return result;
  }

  return null;
}

function parseDateTimeParts(dateStr: string, startTime: string, endTime: string): { start: Date; end: Date } | null {
  const start = new Date(`${dateStr} ${startTime}`);
  const end = new Date(`${dateStr} ${endTime}`);
  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
    return { start, end };
  }
  return null;
}
