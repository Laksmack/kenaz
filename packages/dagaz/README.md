# Dagaz ᛞ

> *Dawn breaks — see your day clearly*

Personal calendar with Google Calendar sync, offline support, natural language event creation, and a local API for Claude.

**Dagaz** is the 23rd rune of the Elder Futhark — it means "day" and symbolizes dawn, clarity, and new beginnings.

## Local API

Runs on `http://localhost:3143`.

### Calendars

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calendars` | GET | List all calendars |
| `/api/calendars/:id` | PUT | Update calendar visibility/color (`{visible, color_override}`) |

### Events CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/events?start=...&end=...` | GET | Events in a time range (required: `start`, `end` ISO strings) |
| `/api/events/:id` | GET | Get a single event |
| `/api/events` | POST | Create an event (validated with zod schema) |
| `/api/events/:id` | PUT | Update an event |
| `/api/events/:id` | DELETE | Delete an event |
| `/api/events/:id/rsvp` | POST | RSVP to an event (`{response: 'accepted'\|'declined'\|'tentative'}`) |

### Views

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/today` | GET | Today's events |
| `/api/agenda?date=...&days=7` | GET | Agenda for a date range |
| `/api/freebusy?calendars=...&start=...&end=...` | GET | Free/busy times for calendars |
| `/api/find-meeting-time` | GET | Suggest meeting times (`?attendees=...&duration_minutes=60&start=...&end=...`) |

### Intelligence

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parse-event` | POST | Parse natural language into event (`{text: "Lunch with Alice tomorrow at noon"}`) |
| `/api/analytics?start=...&end=...&group_by=category` | GET | Time analytics (group by `category`, `calendar`, `attendee`, `day`) |

### Cross-App Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/day-plan?date=...` | GET | Combined events + Raidō tasks for a day |
| `/api/events/:id/context` | GET | Event context: attendee emails from Kenaz + HubSpot contacts |

### Sync & System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/status` | GET | Sync status, last sync time, pending count |
| `/api/sync/trigger` | POST | Trigger an incremental sync |
| `/api/settings` | GET | Settings info |
| `/api/health` | GET | Health check |
