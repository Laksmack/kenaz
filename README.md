# Futhark

**A personal productivity suite forged in Norse runes - built from the ground up to be driven by AI.**

---

Futhark is a collection of native macOS desktop apps that share a common design system, all named for Elder Futhark runes. Each app owns its domain completely - your data lives on your machine, in plain SQLite databases and markdown files. No subscriptions, no cloud lock-in, no "we're pivoting to enterprise" surprises.

**Kenaz** ᚲ (torch/fire) is a Gmail client with HubSpot CRM and Google Calendar baked into the sidebar. Every email thread has instant context - deal stage, contact history, upcoming meetings - without switching apps. It composes in markdown, runs a local API on localhost:3141, and has a full MCP server so Claude can search, read, draft, and send emails on your behalf.

**Raidō** ᚱ (journey/ride) is a task manager with a dead-simple philosophy: every task has a due date or it lives in Inbox until you commit to one. No "someday" purgatory. SQLite-backed, Express API on localhost:3142, and its own MCP server with 17 tools that mirror the Things workflow you already know. Tasks can link directly to Kenaz email threads, HubSpot deals, Laguz notes, and calendar events.

**Dagaz** ᛞ (day/dawn) is a calendar app that layers your Google Calendar events alongside your tasks and email context. Unified day view, meeting prep from a single click, and an MCP server that lets Claude find free time, schedule meetings, and surface what matters today.

**Laguz** ᛚ (water/flow) is a native markdown notes app - a full replacement for Obsidian that was built for the suite from the ground up. It has a proper UI with a configurable sidebar, vault search, scratch pad, accounts view, and folder browser. Notes are plain markdown with YAML frontmatter on disk, indexed into SQLite with FTS5 full-text search so queries are instant. It watches your vault for changes and re-indexes automatically. The Express API runs on localhost:3144 and the MCP server lets Claude search notes by content, filter by company, type, date, or tags, retrieve full note content, surface account history, and write new notes back to disk. It looks and feels like a notes app. It just happens to be fully AI-operable from the outside.

---

## The real magic: AI-native from day one

Most productivity tools bolt on AI as an afterthought - a chatbot in a sidebar, a "summarize" button, maybe some auto-complete. Futhark was designed the other way around. Every app exposes a complete API and MCP server, which means Claude doesn't just read your data - it operates your tools.

What this looks like in practice:

**"Prep me for today"** - Claude pulls your calendar from Dagaz, your open deals from HubSpot via Kenaz, your tasks from Raidō, your unread threads from Kenaz, and recent account notes from Laguz. You get a single briefing that connects the dots across all of them.

**"What's the status on Tesla?"** - Claude searches Raidō for open Tesla tasks, pulls recent email threads from Kenaz, checks the HubSpot deal stage, and retrieves the latest meeting notes from Laguz. One question, four apps, one coherent answer.

**"Create follow-up tasks from that meeting"** - Claude reads the meeting note in Laguz, creates tasks in Raidō with the right due dates, links them to the relevant email threads in Kenaz and deals in HubSpot. One sentence from you, five minutes of admin work automated.

**"Draft a reply to the Conagra thread and schedule a follow-up task for next week"** - Claude finds the thread in Kenaz, pulls account context from Laguz, drafts the email in markdown, creates the task in Raidō with the due date and a link back to the thread. Three apps orchestrated from a single request.

**"What did we discuss with Conagra last quarter?"** - Claude searches Laguz for meeting notes filtered by company and date range, retrieves the full content, and gives you a summary with the relevant context surfaced.

The apps talk to each other through localhost HTTP at runtime but never import each other's code. They're independent processes that happen to share a design system and a philosophy. Kill one, the others keep running. This architecture means Claude can compose workflows across all of them without any of them needing to know about each other.

---

## What makes it different

**You own everything.** Your email cache, your tasks, your notes, your config - it's all SQLite files, markdown, and JSON on your local disk. Back them up however you want. Read them with any tool that speaks SQL or plain text.

**It's fast.** No Electron-in-a-browser-in-a-container nonsense. Native SQLite queries return in microseconds. Laguz's in-memory index means vault search is instant. The UI responds instantly because there's no round-trip to someone else's server.

**It's yours to extend.** The MCP servers mean any AI tool that speaks Model Context Protocol can drive your apps. Today it's Claude. Tomorrow it could be anything. The Express APIs mean any script or automation tool can integrate too.

**It looks like it belongs together.** Shared design system built on CSS custom properties and a Tailwind preset. Same typography (Outfit), same layout patterns, same dark/light theming. Each app has its own color family - fire orange for Kenaz, earth brown for Raidō, water blue for Laguz - but they're unmistakably siblings in the dock.

---

## The suite today

| App | Rune | Purpose | Port | Status |
|-----|------|---------|------|--------|
| Kenaz | ᚲ | Email + CRM | 3141 | Live (v0.11) |
| Raidō | ᚱ | Tasks | 3142 | Live (v0.1) |
| Dagaz | ᛞ | Calendar | 3143 | In progress |
| Laguz | ᛚ | Notes + Vault | 3144 | Live |

---

## Architecture

```
futhark/
├── packages/
│   ├── core/          # @futhark/core - shared design system, types, components
│   ├── kenaz/         # @futhark/kenaz - email (port 3141)
│   ├── raido/         # @futhark/raido - tasks (port 3142)
│   ├── dagaz/         # @futhark/dagaz - calendar (port 3143)
│   └── laguz/         # @futhark/laguz - notes/vault (port 3144)
├── turbo.json         # Turborepo workspace config
└── package.json       # Workspace root
```

Each app is an independent Electron process with:
- React 18 + TypeScript renderer
- Express API server on a dedicated port
- SQLite database or in-memory index (Laguz watches markdown, others use better-sqlite3)
- MCP server (stdio, for Claude Desktop)
- Shared design system via @futhark/core Tailwind preset

---

*Futhark. Tools for the journey.*
