# @futhark/core Design System

## Philosophy

Four apps, one family. Each app has its own identity rooted in its rune and element, but they share typography, spacing, interaction patterns, and a semantic color language that lets each app's personality bleed into its siblings where it makes sense.

## Elements & Colors

| App | Rune | Element | Accent | Role |
|-----|------|---------|--------|------|
| Kenaz | ᚲ | Fire | #E8834A (orange) | Urgency, attention, illumination |
| Raidō | ᚱ | Earth | #C2885A (brown) | Current, active, grounded |
| Dagaz | ᛞ | Sky | #4A9AC2 (blue) | Scheduled, time-bound, future |
| Laguz | ᛚ | Water | #4AA89A (teal) | Reference, context, depth |

## Semantic Color Usage

Each app's accent is its own primary interactive color. But the accents are also available across the suite as semantic signals:

- **Kenaz orange** = urgency/overdue (used in Raidō for overdue dates, in Dagaz for conflicts)
- **Raidō brown** = current/active/today (used in Kenaz for "todo" tagged emails, in Dagaz for today)
- **Dagaz blue** = scheduled/future (used in Raidō for upcoming dates, in Kenaz for calendar sidebar)
- **Laguz teal** = reference/linked (used when showing vault links, cross-references between apps)

This means: seeing orange in Raidō reminds you of Kenaz. Seeing brown in Kenaz reminds you of Raidō. The apps reference each other through color.

## Dark Theme Palette

Each app controls its own background darkness:

- **Kenaz**: pitch black (#0a0a0a) - fire against darkness
- **Raidō**: warm dark brown (#12100e) - earth, leather, wood
- **Dagaz**: TBD (likely dark blue-gray)
- **Laguz**: TBD (likely dark blue-green)

### Shared neutrals (warm)

```
--text-primary:    #e8e0d8
--text-secondary:  #a89888
--text-muted:      #6b6058
--border:          #2a2420
```

## Typography

- **Font family**: Outfit (all apps)
- **Weights**: 300 (light, muted text), 400 (body), 500 (emphasis), 700 (headings)
- **Monospace**: JetBrains Mono (code, IDs, technical content)

## Shared Patterns

### App rune as primary action
Top-right corner of each app: the app's rune icon in its accent color. Clicking it triggers the primary create action (compose, create task, create event, new note). No text label.

### Keyboard shortcuts
Shared across all apps:
- `c` - create (compose / new task / new event / new note)
- `j/k` - navigate down/up in list
- `/` - focus search
- `?` - show shortcut help
- `x` - complete/archive (mark done / archive email)
- `Esc` - close detail / cancel

### Sidebar structure
```
[Smart views with badges]
─────────────
[DYNAMIC GROUPS]
  Group name    count
```

### Three-pane layout
All apps follow: Sidebar (200px) | List (flexible) | Detail (flexible). Detail pane optional - can collapse to two-pane.

### Dock badge
Native macOS red badge with count. Each app defines its own count:
- Kenaz: unread inbox count
- Raidō: due today + overdue count
- Dagaz: events in next 30 min (someday)
- Laguz: none (passive app)

## Date Display Convention

Consistent across all apps:
- **Overdue**: `Xd` in Kenaz orange
- **Due today / happening now**: `Today` in app's own accent
- **Due within 5 days**: date in --text-primary
- **Due later**: date in --text-muted

## Tag Pills

Consistent styling:
- Background: --border color
- Text: --text-secondary
- Font size: 0.7rem
- Padding: 2px 8px
- Border radius: 10px

## MCP Server

A single unified Futhark MCP server (`~/.futhark/mcp-server.js`) exposes tools from all apps via stdio. Tool names use underscore namespacing: `kenaz_search_emails`, `raido_add_todo`, `dagaz_create_event`, `laguz_search`. Plus `futhark_status` as a meta tool.

The server proxies to each app's Express API on dedicated localhost ports:
- Kenaz: 3141
- Raidō: 3142
- Dagaz: 3143
- Laguz: 3144

Source: `packages/core/mcp/futhark-mcp.ts`. Built with `npm run build:mcp` in `@futhark/core`. Auto-installed to `~/.futhark/` and registered with Claude Desktop on any app's first launch.

### MCP Tools (68 total)

| Prefix | Count | Key tools |
|--------|-------|-----------|
| `futhark_` | 1 | `status` |
| `kenaz_` | 28 | `get_inbox`, `search_emails`, `get_thread`, `get_thread_summary`, `send_email`, `draft_email`, `archive_thread`, `modify_labels`, `batch_archive`, `list_labels`, `list_drafts`, `get_stats`, `hubspot_lookup`, `hubspot_deals`, `get_contact_context`, `calendar_events`, `calendar_rsvp`, `list_views`, `list_rules`, ... |
| `dagaz_` | 19 | `get_events`, `get_event`, `create_event`, `update_event`, `delete_event`, `rsvp_event`, `get_today`, `get_agenda`, `get_day_plan`, `get_event_context`, `find_meeting_time`, `parse_event_text`, `get_time_analytics`, `get_sync_status`, ... |
| `raido_` | 13 | `get_today`, `get_inbox`, `get_upcoming`, `add_todo`, `update_todo`, `search_todos`, `get_logbook`, `get_stats`, `get_groups`, `get_tags`, ... |
| `laguz_` | 6 | `search`, `get_note`, `get_meetings`, `get_account`, `get_unprocessed`, `write_note` |

## Cross-App Links

Tasks, emails, notes, and events can reference each other via ID fields:
- `kenaz_thread_id` - link to an email thread
- `hubspot_deal_id` - link to a CRM deal
- `vault_path` - link to an Obsidian/Laguz note
- `calendar_event_id` - link to a calendar event

These are string pointers, not foreign keys. Apps don't import each other's databases.
