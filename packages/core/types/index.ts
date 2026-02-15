// ── HubSpot Types ────────────────────────────────────────────

export interface HubSpotContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  lastActivity: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  pipeline: string;
}

export interface HubSpotActivity {
  id: string;
  type: 'note' | 'email' | 'meeting' | 'call';
  subject: string;
  body: string;
  timestamp: string;
}

export interface HubSpotContext {
  contact: HubSpotContact | null;
  deals: HubSpotDeal[];
  activities: HubSpotActivity[];
  loading: boolean;
  error: string | null;
}

// ── Calendar Types ───────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string; // ISO string
  end: string; // ISO string
  allDay: boolean;
  hangoutLink: string;
  meetLink: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: { email: string; name: string; self: boolean; responseStatus: string }[];
  calendarColor: string;
}
