# Kenaz ᚲ

> *The torch that illuminates your inbox*

Personal Gmail client with HubSpot CRM integration, Google Calendar sidebar, and a local API for Claude.

**Kenaz** is the 6th rune of the Elder Futhark — it means "torch" and symbolizes illumination, knowledge, and transformation. That's what this does to your email workflow.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Gmail API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project, enable the **Gmail API** and **Google Calendar API**
3. Create OAuth2 credentials (Desktop app type)
4. Download the JSON and save it as:
   ```
   ~/Library/Application Support/kenaz/credentials.json
   ```

### 3. HubSpot (optional)

1. Create a [HubSpot Private App](https://developers.hubspot.com/docs/api/private-apps)
2. Add the token in Settings (⌥,)

### 4. Run

```bash
# Build and run
npm run build && npm start

# Or development mode with hot reload
npm run dev:renderer   # terminal 1
npm run dev:electron   # terminal 2
```

### 5. Build macOS app

```bash
npm run dist
# Creates release/Kenaz-0.1.0-arm64.dmg
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` / `D` | Archive |
| `P` | Mark Pending |
| `F` | Mark Follow Up |
| `C` | Compose |
| `R` | Reply |
| `J` / `K` | Navigate down/up |
| `/` | Search |
| `Esc` | Back / Close |
| `⌥ ,` | Settings |

## Local API

Runs on `http://localhost:3141` — usable by Claude Desktop (via MCP), scripts, etc. Full OpenAPI spec at `/openapi.json`.

### Gmail

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/inbox` | GET | List inbox threads (top 50) |
| `/api/unread` | GET | Unread inbox threads with count |
| `/api/email/:id` | GET | Get full thread by ID |
| `/api/thread/:id/summary` | GET | AI-ready thread summary (timeline, participants, latest message) |
| `/api/search?q=...` | GET | Search threads using Gmail query syntax |
| `/api/stats` | GET | Inbox statistics (inbox, unread, pending, todo, starred counts) |
| `/api/send` | POST | Send an email (body in `body_markdown`) |
| `/api/draft` | POST | Create a draft |
| `/api/drafts` | GET | List all drafts |
| `/api/draft/:id` | GET | Get a draft by ID |
| `/api/draft/:id` | DELETE | Delete a draft |
| `/api/labels` | GET | List all Gmail labels |
| `/api/label/:id` | POST | Add/remove labels on a thread (`{add, remove}`) |
| `/api/archive/:id` | POST | Archive a thread (remove from inbox) |
| `/api/thread/:id` | DELETE | Trash a thread |
| `/api/batch/archive` | POST | Archive multiple threads (`{threadIds: [...]}`) |

### Attachments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/thread/:threadId/attachments` | GET | List all attachments in a thread |
| `/api/attachment/:messageId/:attachmentId` | GET | Download an attachment (binary) |
| `/api/attachment/:messageId/:attachmentId/download` | POST | Save attachment to ~/Downloads |
| `/api/thread/:threadId/attachments/download-all` | GET | Download all thread attachments as zip |

### HubSpot

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/hubspot/contact/:email` | GET | Look up contact by email (+ deals, activities) |
| `/api/hubspot/deals` | GET | List active deals (`?stage=...&owner=...`) |
| `/api/hubspot/recent/:email` | GET | Recent activities for a contact (`?limit=10`) |
| `/api/hubspot/log` | POST | Log an email to HubSpot |
| `/api/context/:email` | GET | Combined context: HubSpot + recent email threads |

### Calendar

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calendar/events` | GET | Events in range (`?timeMin=...&timeMax=...`) |
| `/api/calendar/rsvp/:eventId` | POST | RSVP to an event (`{response, calendarId?}`) |

### Views & Rules

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/views` | GET | List custom email views |
| `/api/views` | POST | Create a view |
| `/api/views/:id` | PUT | Update a view |
| `/api/views/:id` | DELETE | Delete a view |
| `/api/rules` | GET | List automation rules |
| `/api/rules` | POST | Create a rule |
| `/api/rules/:id` | PUT | Update a rule |
| `/api/rules/:id` | DELETE | Delete a rule |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/config` | GET | Read-only config (e.g. `archiveOnReply`) |
| `/api/navigate` | POST | Cross-app deep link (`{action, threadId}`) |
| `/openapi.json` | GET | Full OpenAPI 3.0 spec |
| `/` | GET | Root discovery (links to docs and health) |
