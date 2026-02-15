# Futhark

**A personal productivity suite forged in Norse runes - built from the ground up to be driven by AI.**

---

Futhark is a collection of native macOS desktop apps that share a common design system, all named for Elder Futhark runes. Each app owns its domain completely - your data lives on your machine, in plain SQLite databases and markdown files. No subscriptions, no cloud lock-in, no "we're pivoting to enterprise" surprises.

**Kenaz** ᚲ (torch/fire) is a Gmail client with HubSpot CRM and Google Calendar baked into the sidebar. Every email thread has instant context - deal stage, contact history, upcoming meetings - without switching apps. It composes in markdown, runs a local API on localhost:3141, and has a full MCP server so Claude can search, read, draft, and send emails on your behalf.

**Raidō** ᚱ (journey/ride) is a task manager with a dead-simple philosophy: every task has a due date or it lives in Inbox until you commit to one. No "someday" purgatory. SQLite-backed, Express API on localhost:3142, and its own MCP server with 17 tools that mirror the Things workflow you already know. Tasks can link directly to Kenaz email threads, HubSpot deals, Obsidian vault notes, and calendar events.

---

## The real magic: AI-native from day one

Most productivity tools bolt on AI as an afterthought - a chatbot in a sidebar, a "summarize" button, maybe some auto-complete. Futhark was designed the other way around. Every app exposes a complete API and MCP server, which means Claude doesn't just read your data - it operates your tools.

What this looks like in practice:

**"Prep me for today"** - Claude pulls your calendar from Google, your open deals from HubSpot, your tasks from Raidō, and your unread threads from Kenaz. You get a single briefing that connects the dots across all of them.

**"Create follow-up tasks from that meeting"** - Claude reads the meeting notes, creates tasks in Raidō with the right due dates, links them to the relevant email threads in Kenaz and deals in HubSpot. One sentence from you, five minutes of admin work automated.

**"Draft a reply to the Conagra thread and schedule a follow-up task for next week"** - Claude finds the thread in Kenaz, drafts the email in markdown, creates the task in Raidō with the due date and a link back to the thread. Two apps orchestrated from a single request.

**"What's the status on Tesla?"** - Claude searches Raidō for open Tesla tasks, pulls recent email threads from Kenaz, checks the HubSpot deal stage, and gives you a unified picture. No clicking through four different apps.

The apps talk to each other through localhost HTTP at runtime but never import each other's code. They're independent processes that happen to share a design system and a philosophy. Kill one, the others keep running. This architecture means Claude can compose workflows across all of them without any of them needing to know about each other.

---

## What makes it different

**You own everything.** Your email cache, your tasks, your config - it's all SQLite files and JSON on your local disk. Back them up however you want. Read them with any tool that speaks SQL.

**It's fast.** No Electron-in-a-browser-in-a-container nonsense. Native SQLite queries return in microseconds. The UI responds instantly because there's no round-trip to someone else's server.

**It's yours to extend.** The MCP servers mean any AI tool that speaks Model Context Protocol can drive your apps. Today it's Claude. Tomorrow it could be anything. The Express APIs mean any script or automation tool can integrate too.

**It looks like it belongs together.** Shared design system built on CSS custom properties and a Tailwind preset. Same typography (Outfit), same layout patterns, same dark/light theming. Each app has its own color family - fire orange for email, earth brown for tasks - but they're unmistakably siblings in the dock.

---

## The suite today

| App | Rune | Purpose | Status |
|-----|------|---------|--------|
| Kenaz | ᚲ | Email + CRM | Live (v0.11) |
| Raidō | ᚱ | Tasks | Live (v0.1) |
| Dagaz | ᛞ | Calendar | Concept |
| Laguz | ᛚ | Notes | Concept |

---

## Architecture

```
futhark/
├── packages/
│   ├── core/          # @futhark/core - shared design system, types, components
│   ├── kenaz/         # @futhark/kenaz - email (port 3141)
│   └── raido/         # @futhark/raido - tasks (port 3142)
├── turbo.json         # Turborepo workspace config
└── package.json       # Workspace root
```

Each app is an independent Electron process with:
- React 18 + TypeScript renderer
- Express API server on a dedicated port
- SQLite database (better-sqlite3)
- MCP server (stdio, for Claude Desktop)
- Shared design system via @futhark/core Tailwind preset

---

*Futhark. Tools for the journey.*
