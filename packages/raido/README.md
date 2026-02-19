# Raidō ᚱ

> *The journey of a thousand tasks begins with a single todo*

Personal task manager with bracket-based grouping, tagging, email attachment pulling, and a local API for Claude.

**Raidō** is the 5th rune of the Elder Futhark — it means "journey" and symbolizes movement, progress, and the path forward.

## Local API

Runs on `http://localhost:3142`.

### Smart Views

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/today` | GET | Tasks due today (includes overdue) |
| `/api/inbox` | GET | Unprocessed tasks (no group, no date) |
| `/api/upcoming` | GET | Tasks with future due dates |

### Groups & Tags

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups` | GET | List all bracket groups with counts |
| `/api/group/:name` | GET | Tasks in a specific group |
| `/api/tags` | GET | List all tags |
| `/api/tagged/:tag` | GET | Tasks with a specific tag |

### Tasks CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/task/:id` | GET | Get a single task |
| `/api/task` | POST | Create a task |
| `/api/task/:id` | PUT | Update a task |
| `/api/task/:id` | DELETE | Delete a task |
| `/api/task/:id/complete` | POST | Mark a task as complete |

### Search & History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search?q=...` | GET | Full-text search across tasks |
| `/api/logbook?days=7` | GET | Recently completed tasks |
| `/api/stats` | GET | Task statistics |

### Attachments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/task/:id/attachments` | GET | List attachments for a task |
| `/api/task/:id/attachment/:attachmentId` | GET | Download an attachment |
| `/api/task/:id/attachment/:attachmentId` | DELETE | Delete an attachment |
| `/api/task/:id/attachments/pull-email` | POST | Pull attachments from Kenaz email thread (`{threadId}`) |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
