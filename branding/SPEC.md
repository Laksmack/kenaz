# Kenaz ᚲ - Personal Email Client

## One-Line Summary

A lightweight Electron mail client for Gmail with HubSpot CRM integration, markdown compose, and a Claude-ready API.

## Name & Branding

- **Name:** Kenaz (from the Elder Futhark rune ᚲ meaning "torch/fire")
- **Logo:** The Kenaz rune (ᚲ) in a macOS-style rounded square with an orange gradient (deep burnt #C43E0C to warm amber #F7A94B). Logo assets are in the `/branding` folder.
- **Wordmark font:** Outfit (Google Fonts), weight 600
- **Color palette:**
  - `--color-deep`: #C43E0C (deep burnt orange)
  - `--color-primary`: #E8571F (primary orange)
  - `--color-warm`: #F7A94B (warm amber)
  - `--color-light`: #FFF8F0 (cream/light)
  - `--color-bg-dark`: #0a0a0a (dark background)
  - `--color-surface`: #111111 (dark surface)
  - `--color-pending`: #F2C94C (yellow - pending label)
  - `--color-followup`: #F28C38 (orange - follow up label)

## Why

Every mail client (Superhuman, Shortwave) charges $15-30/mo to wrap Gmail labels in a pretty UI with bolted-on AI. None of them integrate well with HubSpot. This is a personal tool - built for one user - that does less but does it right.

## Architecture

- **Electron** desktop app (macOS primary)
- **React** frontend
- **Gmail API** for all email operations
- **HubSpot API** for CRM context
- **Local Express server** (inside Electron) exposing an API that external tools (Claude Desktop, Claude Code, scripts) can call

## Layout - Three Panel View

```
+------------------+----------------------------------+------------------+
|                  |                                  |                  |
|   EMAIL LIST     |          EMAIL BODY              |    SIDEBAR       |
|     (25%)        |           (50%)                  |     (25%)        |
|                  |                                  |                  |
|  - Sender        |   Rendered HTML email            |  HubSpot Context |
|  - Subject       |   in sandboxed webview           |  - Contact name  |
|  - Snippet       |                                  |  - Company       |
|  - Date          |                                  |  - Deals + stage |
|  - Labels/status |                                  |  - Last activity |
|                  |                                  |  - Deal value    |
|  Color-coded:    |                                  |                  |
|  - Default       |                                  |  Loading state   |
|  - PENDING       |                                  |  when no match   |
|  - FOLLOWUP      |                                  |                  |
|                  |                                  |                  |
+------------------+----------------------------------+------------------+
|                     COMPOSE BAR (collapsible)                         |
|  Markdown editor  |  Preview  |  To/CC/BCC  |  Send  |  Save Draft   |
+----------------------------------------------------------------------+
```

## Email Workflow (Gmail Labels)

Keep it dead simple:

| State | Gmail Action | Visual |
|-------|-------------|--------|
| Inbox | Default - unarchived messages | Normal list item |
| Done | Archive (remove from inbox) | Disappears from inbox view |
| Pending | Apply `PENDING` label | Yellow indicator |
| Follow Up | Apply `FOLLOWUP` label | Orange indicator |

Keyboard shortcuts:
- `E` or `D` - Done (archive)
- `P` - Mark Pending
- `F` - Mark Follow Up
- `C` - Compose new
- `R` - Reply
- `J/K` - Navigate list up/down
- `Enter` - Open email
- `Escape` - Back to list
- `/` - Search

## Views / Filters

- **Inbox** (default) - unarchived, non-trash
- **Pending** - emails with PENDING label
- **Follow Up** - emails with FOLLOWUP label
- **Sent** - sent mail
- **All Mail** - everything
- **Search** - uses Gmail API search (same syntax as Gmail)

## Email Display

- Render HTML emails in a **sandboxed iframe/webview** - don't try to reformat
- For plain text emails, render with basic styling
- Thread view - show full conversation, newest at bottom
- Attachments shown as download links below email body

## Compose

- **Markdown editor** (use TipTap or similar with markdown mode)
- Write in markdown, converts to clean HTML on send
- Support basic formatting: bold, italic, links, lists, code blocks
- **Signature** - configurable HTML signature appended on send
- Reply includes quoted thread below compose area
- Send via Gmail API

## Email Signature

Default signature (configurable in settings):

```
Martin Stenkilde
Director of Product & Business Development
CompScience
```

## HubSpot Sidebar

When an email is selected, auto-lookup the sender's email in HubSpot:

- **Contact card** - name, company, title, phone
- **Associated deals** - deal name, stage, amount, close date
- **Recent activities** - last 5 notes/emails/meetings
- **Quick actions** - "Log this email to HubSpot" button

Auto-log: every sent email gets logged to HubSpot contact + associated deal (no more BCC hack).

## Local API (Claude Integration)

Express server running on localhost (e.g., port 3141). This is the real power feature.

### Endpoints

```
GET  /api/inbox                    - List inbox emails
GET  /api/email/:id                - Get full email thread
GET  /api/search?q=...             - Search emails
POST /api/send                     - Send email
POST /api/draft                    - Create draft
POST /api/label/:id                - Add/remove labels
GET  /api/hubspot/contact/:email   - Get HubSpot contact + deals
POST /api/hubspot/log              - Log activity to HubSpot
```

### Send/Draft Payload

```json
{
  "to": "brett@mortenson.com",
  "cc": "",
  "bcc": "",
  "subject": "Following up on the pilot",
  "body_markdown": "Hi Brett,\n\nWanted to check in on...",
  "reply_to_thread_id": "thread_abc123",
  "hubspot_deal_id": "12345",
  "signature": true
}
```

### Example Claude Usage

Claude Desktop (or any tool) can:
1. `GET /api/hubspot/contact/brett@mortenson.com` - pull context
2. `GET /api/search?q=from:brett@mortenson.com` - get recent threads
3. `POST /api/draft` - create a draft with full context
4. Or `POST /api/send` - send directly if Martin trusts the workflow

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Shell | Electron | Native Mac feel, webview for emails |
| Frontend | React + Tailwind | Fast to build, Claude Code friendly |
| Email rendering | Sandboxed iframe | Don't fight HTML email, just display it |
| Compose editor | TipTap (markdown mode) | Good markdown support, extensible |
| API layer | Express.js (inside Electron) | Simple, also serves as external API |
| Gmail | Gmail API (OAuth2) | Full access, no IMAP headaches |
| HubSpot | HubSpot API v3 | Contacts, deals, engagements |
| State | Local SQLite or just in-memory | Cache emails for speed |

## OAuth / Auth Setup (Manual, One-Time)

1. Create Google Cloud project
2. Enable Gmail API
3. Create OAuth2 credentials (desktop app type)
4. First launch - browser auth flow, store refresh token locally
5. HubSpot - private app token (simpler than OAuth for single user)

## What This Is NOT

- Not a product for other people
- Not trying to handle every email edge case
- Not replacing Gmail - Gmail is the backend, this is the view
- Not building IMAP sync, offline mode, or calendar integration
- No mobile version (use Gmail app for mobile)

## Nice-to-Haves (Later)

- Snooze (remove from inbox, re-add at scheduled time)
- Email templates (stored markdown snippets)
- Notification badges in dock
- Dark mode
- Quick reply templates
- Thread summarization via Claude API
- Auto-categorization of incoming mail

## Build Order (Suggested)

1. **Electron shell + Gmail OAuth** - get auth working, fetch inbox
2. **Three-panel layout** - list view + email webview + empty sidebar
3. **Email actions** - archive, label, keyboard shortcuts
4. **Compose** - markdown editor, send via Gmail API
5. **HubSpot sidebar** - contact lookup, deal display
6. **Local API** - expose endpoints for Claude
7. **HubSpot auto-logging** - log sent emails automatically
8. **Polish** - search, views/filters, signature config
