import type { CalendlyUser, CalendlyEventType, CalendlyAvailableTime } from '../shared/types';

const CALENDLY_API = 'https://api.calendly.com';

export class CalendlyService {
  private apiKey: string | null = null;
  private cachedUser: CalendlyUser | null = null;

  configure(apiKey: string | null) {
    this.apiKey = apiKey;
    this.cachedUser = null;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request(path: string, params?: Record<string, string>): Promise<any> {
    if (!this.apiKey) throw new Error('Calendly API key not configured');

    const url = new URL(path, CALENDLY_API);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Calendly API ${res.status}: ${body || res.statusText}`);
    }

    return res.json();
  }

  async getCurrentUser(): Promise<CalendlyUser> {
    if (this.cachedUser) return this.cachedUser;
    const data = await this.request('/users/me');
    this.cachedUser = {
      uri: data.resource.uri,
      name: data.resource.name,
      email: data.resource.email,
      scheduling_url: data.resource.scheduling_url,
      timezone: data.resource.timezone,
    };
    return this.cachedUser;
  }

  async getEventTypes(): Promise<CalendlyEventType[]> {
    const user = await this.getCurrentUser();
    const data = await this.request('/event_types', {
      user: user.uri,
      active: 'true',
    });

    return (data.collection || []).map((et: any) => ({
      uri: et.uri,
      name: et.name,
      slug: et.slug,
      duration: et.duration,
      scheduling_url: et.scheduling_url,
      active: et.active,
      kind: et.kind,
      color: et.color,
    }));
  }

  /**
   * Fetches available times for an event type. The Calendly API limits
   * each request to a 7-day window, so we chunk longer ranges automatically.
   */
  async getAvailableTimes(
    eventTypeUri: string,
    startTime: string,
    endTime: string,
  ): Promise<CalendlyAvailableTime[]> {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const maxChunkMs = 7 * 24 * 60 * 60 * 1000;
    const slots: CalendlyAvailableTime[] = [];

    let chunkStart = start;
    while (chunkStart < end) {
      const chunkEnd = new Date(Math.min(chunkStart.getTime() + maxChunkMs, end.getTime()));
      const data = await this.request('/event_type_available_times', {
        event_type: eventTypeUri,
        start_time: chunkStart.toISOString(),
        end_time: chunkEnd.toISOString(),
      });

      for (const slot of data.collection || []) {
        if (slot.status === 'available') {
          slots.push({
            status: slot.status,
            start_time: slot.start_time,
            scheduling_url: slot.scheduling_url,
            invitees_remaining: slot.invitees_remaining,
          });
        }
      }

      chunkStart = chunkEnd;
    }

    return slots;
  }

  /**
   * Generates an email-safe HTML table of available time slots grouped by day,
   * matching the Calendly email style with clickable booking buttons.
   */
  generateAvailabilityHtml(
    slots: CalendlyAvailableTime[],
    options: {
      title?: string;
      timezone?: string;
      use24Hour?: boolean;
    } = {},
  ): string {
    const tz = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const title = options.title || 'Meeting';

    // Group slots by date in the target timezone
    const grouped = new Map<string, CalendlyAvailableTime[]>();
    for (const slot of slots) {
      const date = new Date(slot.start_time);
      const dateKey = date.toLocaleDateString('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey)!.push(slot);
    }

    const formatTime = (iso: string) => {
      const d = new Date(iso);
      if (options.use24Hour) {
        return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();
    };

    const formatDate = (iso: string) => {
      return new Date(iso).toLocaleDateString('en-US', {
        timeZone: tz,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    };

    const tzLabel = tz.replace(/_/g, ' ').replace(/\//g, ' - ');

    const buttonStyle = [
      'display:inline-block',
      'padding:8px 16px',
      'margin:4px',
      'border:1.5px solid #006BFF',
      'border-radius:20px',
      'color:#006BFF',
      'text-decoration:none',
      'font-size:13px',
      'font-weight:500',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    ].join(';');

    let html = `<table cellpadding="0" cellspacing="0" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;">`;
    html += `<tr><td style="padding:0 0 4px;font-size:16px;font-weight:700;color:#1a1a1a;">${title}</td></tr>`;
    html += `<tr><td style="padding:0 0 16px;font-size:12px;color:#666;">Time zone: ${tzLabel}</td></tr>`;

    for (const [, daySlots] of grouped) {
      const dateLabel = formatDate(daySlots[0].start_time);
      html += `<tr><td style="padding:12px 0 8px;font-size:14px;font-weight:600;color:#1a1a1a;">${dateLabel}</td></tr>`;
      html += `<tr><td>`;
      for (const slot of daySlots) {
        const time = formatTime(slot.start_time);
        html += `<a href="${slot.scheduling_url}" style="${buttonStyle}" target="_blank">${time}</a>`;
      }
      html += `</td></tr>`;
    }

    html += `</table>`;
    return html;
  }
}
