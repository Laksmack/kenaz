# Futhark → Tauri Migration Architecture

**Status:** Proposal  
**Author:** Martin Stenkilde  
**Date:** April 2026

---

## Why

Four Electron apps = four bundled Chromium instances ≈ 2–4 GB of baseline RAM.
Tauri uses the system's native webview (WebKit on macOS) — one shared engine,
no bundled browser. Expected savings: **~75% reduction in memory overhead**.

| Metric | Today (4× Electron) | Target (Tauri) |
|--------|---------------------|----------------|
| Browser engines in RAM | 4 (Chromium) | 1 (WebKit) |
| App binary size (total) | ~800 MB | ~30 MB |
| Idle RAM (estimated) | 2–4 GB | 400–600 MB |
| Native feel on macOS | Good | Better (WebKit + native APIs) |
| Build time | 4× electron-builder | 1× cargo + 4 stubs |

## What Stays The Same

The current architecture already separates concerns cleanly:

```
┌─────────────────────────────────────────────────────────┐
│  Current Architecture (per app)                         │
│                                                         │
│  ┌──────────────┐   IPC    ┌───────────────────────┐   │
│  │  React UI    │ ◄──────► │  Electron Main Process│   │
│  │  (Vite)      │          │  ┌─────────────────┐  │   │
│  │              │          │  │ Express API      │  │   │
│  │  renderer/   │          │  │ :3141–3144       │  │   │
│  └──────────────┘          │  └─────────────────┘  │   │
│                            │  ┌─────────────────┐  │   │
│                            │  │ Services         │  │   │
│                            │  │ (Gmail, SQLite,  │  │   │
│                            │  │  HubSpot, etc.)  │  │   │
│                            │  └─────────────────┘  │   │
│                            └───────────────────────┘   │
│  × 4 apps = 4 Chromium instances                       │
└─────────────────────────────────────────────────────────┘
```

**These layers are untouched by the migration:**

1. **React renderers** — Pure Vite/React apps. No Electron imports. They talk to
   the main process via `window.kenaz.*` / `window.raido.*` etc. (the preload bridge).
   In Tauri, they talk to the backend via `@tauri-apps/api` invoke instead.

2. **Express API servers** — Already standalone HTTP servers on localhost ports
   3141–3144. The MCP server already proxies to them. These don't import Electron
   at all. **Zero changes needed.**

3. **Business logic / services** — Gmail, HubSpot, Calendar, SQLite stores, vault
   watcher, sync engines. All pure Node/TypeScript. **Zero changes needed.**

4. **MCP server** — `packages/core/mcp/futhark-mcp.ts`. Already a standalone
   stdio process that proxies to the Express APIs. **Zero changes needed.**

5. **Shared design system** — `@futhark/core` styles, components, tailwind preset.
   **Zero changes needed.**

## What Changes

Only the **Electron main process layer** is replaced:

```
┌─────────────────────────────────────────────────────────┐
│  Target Architecture                                    │
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   4 WebKit       │
│  │Kenaz │ │Raidō │ │Dagaz │ │Laguz │   webviews       │
│  │ UI   │ │ UI   │ │ UI   │ │ UI   │   (native,       │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘    shared)       │
│     │        │        │        │                        │
│     ▼        ▼        ▼        ▼                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Tauri Core (Rust)                               │   │
│  │  - Window management (4 windows)                 │   │
│  │  - Dock badge relay                              │   │
│  │  - Notifications                                 │   │
│  │  - Auto-updater                                  │   │
│  │  - Module enable/disable                         │   │
│  │  - Sidecar: Node process for Express servers     │   │
│  └──────────────────────────────────────────────────┘   │
│     │                                                   │
│     ▼                                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Node Sidecar (existing code, almost unchanged)  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│   │
│  │  │ Kenaz   │ │ Raidō   │ │ Dagaz   │ │ Laguz  ││   │
│  │  │ :3141   │ │ :3142   │ │ :3143   │ │ :3144  ││   │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘│   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  1 process, 1 WebKit engine, 4 windows                  │
└─────────────────────────────────────────────────────────┘
```

### Electron → Tauri mapping

| Electron concept | Tauri equivalent |
|------------------|-----------------|
| `BrowserWindow` | `tauri::WebviewWindow` |
| `ipcMain.handle` / `ipcRenderer.invoke` | `#[tauri::command]` + `invoke()` from JS |
| `contextBridge.exposeInMainWorld` | Tauri's invoke system (no preload needed) |
| `app.dock.setBadge()` | Rust → `NSApplication` via objc2 crate |
| `Notification` | `tauri-plugin-notification` |
| `electron-updater` | `tauri-plugin-updater` |
| `shell.openExternal` | `tauri-plugin-opener` |
| `session.defaultSession.setSpellCheckerLanguages` | WebKit native spellcheck (automatic) |
| `electron-builder` | `tauri build` (universal binary) |
| `app.setAsDefaultProtocolClient('mailto')` | `tauri-plugin-deep-link` |

### The Sidecar Pattern

Tauri's backend is Rust, but all business logic (Gmail OAuth, SQLite, HubSpot,
sync engines) is Node/TypeScript. Rewriting that in Rust would be a massive,
pointless effort.

Instead, use **Tauri's sidecar feature**: the Rust shell spawns a single Node
process that runs all four Express API servers. The Rust layer handles only:

- Window lifecycle (create, show, hide, focus)
- Native APIs (dock badges, notifications, deep links)
- Relaying IPC between webviews and the Node sidecar

The Node sidecar is essentially today's four `main.ts` files merged into one,
minus the Electron-specific parts (BrowserWindow, ipcMain, etc.). The Express
servers and all services run exactly as they do today.

## The Four-Icon Dock Problem

macOS ties Dock icons to application bundles (CFBundleIdentifier). A single
process gets one Dock icon. To get four icons from one Tauri core, we use
**helper app bundles**.

### How It Works

```
/Applications/Futhark.app/                    ← main Tauri binary (hidden from Dock)
/Applications/Futhark.app/Contents/Helpers/
    Kenaz.app/                                ← stub: icon + Info.plist + tiny binary
    Raido.app/                                ← stub: icon + Info.plist + tiny binary
    Dagaz.app/                                ← stub: icon + Info.plist + tiny binary
    Laguz.app/                                ← stub: icon + Info.plist + tiny binary
```

Each helper app is ~1 MB:
- **Info.plist** with its own `CFBundleIdentifier` (`com.futhark.kenaz`, etc.)
- **Icon.icns** — the existing rune icons
- **Stub binary** — a tiny Swift/Rust executable that:
  1. Registers itself in the Dock
  2. Connects to the main Tauri process via local socket
  3. Forwards "open window" / "set badge" messages
  4. Exits when the main process exits

The main Tauri process runs as an `LSUIElement` (no Dock icon of its own) and
manages all four webview windows. When it needs to update a badge, it sends a
message to the relevant helper stub.

### User Experience

- Drag `Kenaz.app`, `Raido.app`, etc. into the Dock (or they auto-register on first launch)
- Each icon shows its own badge count
- Clicking a Dock icon activates/focuses that specific window
- Cmd+Tab shows all active helper apps individually
- Closing a window hides it (standard macOS behavior); clicking the Dock icon re-shows it
- Right-click Dock icon → Quit only quits that module's window, not the suite

### Module Enable/Disable

```toml
# ~/.futhark/config.toml
[modules]
kenaz = true
raido = true
dagaz = true
laguz = false    # disabled — no window, no Dock icon, no Express server
```

When a module is disabled:
- Its helper app doesn't launch
- Its Express server doesn't start
- Its MCP tools still appear but return "Laguz is not running"
- Enabling it is a config change + restart (or hot-reload if we want to be fancy)

## Migration Phases

### Phase 0: Preparation (no user-facing changes)

**Goal:** Extract Electron-specific code into an isolated layer so the same
business logic can be driven by either Electron or Tauri.

1. **Create `packages/sidecar/`** — a new package that imports each app's
   services and Express servers, but NOT Electron. This is the future Node
   sidecar. Structure:

   ```
   packages/sidecar/
   ├── package.json
   ├── src/
   │   ├── index.ts          ← entry point: starts all enabled Express servers
   │   ├── kenaz-services.ts ← imports from kenaz/src/main/* (minus Electron)
   │   ├── raido-services.ts
   │   ├── dagaz-services.ts
   │   └── laguz-services.ts
   └── tsconfig.json
   ```

2. **Refactor each app's main.ts** to separate:
   - **Service initialization** (OAuth, SQLite, sync) → pure functions, no Electron
   - **Window/IPC glue** → Electron-specific, stays in main.ts for now
   - **Express API server** → already clean, no changes

   The test: `packages/sidecar/src/index.ts` can start all four Express
   servers without importing anything from Electron. MCP server still works.
   Apps still work via Electron as before — this phase is purely additive.

3. **Audit preload bridges** — Each app exposes `window.kenaz.*` etc. via
   `contextBridge`. Catalog every IPC channel and classify:
   - **API-backed** (most): Already available via Express. Webview can call
     `fetch('http://localhost:3141/api/inbox')` directly. No IPC needed.
   - **Native-only** (few): Badge count, notifications, file dialogs, open
     external URL, clipboard. These need Tauri commands.

   Current IPC channel count per app (from preload.ts analysis):
   - Kenaz: ~45 channels — most are Gmail/HubSpot/Calendar (API-backed)
   - Raidō: ~20 channels — most are task CRUD (API-backed)
   - Dagaz: ~25 channels — most are calendar CRUD (API-backed)
   - Laguz: ~30 channels — most are vault/note operations (API-backed)

   **Native-only channels across all apps** (the ones that need Tauri commands):
   - `app:set-badge` → Tauri dock badge via helper app
   - `app:notify` → `tauri-plugin-notification`
   - `print:email` / `print:save-pdf` → Tauri print/PDF API
   - `file:read-base64` → `tauri-plugin-fs`
   - `connectivity:status` → Tauri or just navigator.onLine
   - `update:check` / `update:install` → `tauri-plugin-updater`

### Phase 0.5: Sidecar bundling (May 2026 — DONE)

**Goal:** Produce a single-executable sidecar binary that Tauri can spawn.

**Outcome:** `packages/sidecar/dist/futhark-laguz` — 60 MB Mach-O arm64
binary, fully self-contained. Boots Laguz services, indexes the vault
(1,223 notes in ~4 s), serves the Express API on :3144 (or
`LAGUZ_API_PORT` override). Verified end-to-end against the live vault
from a sterile `/tmp/` directory — same 97 companies as Electron Laguz.

**How to rebuild:**

```sh
cd packages/sidecar
npm run compile:laguz
# → dist/futhark-laguz
```

The compile uses `bun build --compile --target=bun-darwin-arm64` and
marks four deps external (`pdfjs-dist`, `mammoth`, `tesseract.js`,
`better-sqlite3`) — those either fail static analysis or are runtime-
switched. better-sqlite3 in particular is intentionally external since
the Bun side uses `bun:sqlite` via the adapter (see Risk Assessment).

**Open issue for production packaging:** the binary expects external
modules at runtime if any of (PDF parsing, OCR, DOCX) are needed. For
the Tauri shell we'll either:
- Bundle those alongside the binary inside the .app's Resources/, or
- Make them lazy-loaded-from-CDN, or
- Accept the graceful-degradation path (the code already wraps them in
  try/catch and reports "feature disabled").

### Phase 1: Tauri Shell — Single App Proof of Concept

**Goal:** Get one app (Laguz — simplest, no OAuth, no badge) running in Tauri.

1. **Create `packages/tauri-shell/`** with `cargo init` + Tauri config
2. Configure Tauri to:
   - Spawn the bundled sidecar binary (`packages/sidecar/dist/futhark-laguz`) on startup
   - Wait for Express server on :3144 to be ready
   - Open a webview window loading the Laguz Vite build
3. **Adapt Laguz renderer** to call Express API directly via fetch instead of
   `window.laguz.*` IPC bridge. Since most calls are already just thin wrappers
   around `ipcRenderer.invoke` → Express, this is mostly search-and-replace:

   ```typescript
   // Before (Electron preload bridge)
   const notes = await window.laguz.searchNotes(query);

   // After (direct fetch to Express API)
   const res = await fetch('http://localhost:3144/api/search', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ query })
   });
   const notes = await res.json();
   ```

   Create a thin `laguz-api.ts` client module so the components don't
   hardcode URLs.

4. For the ~5 native-only calls, implement `#[tauri::command]` handlers in Rust
5. Build and test: `cargo tauri dev` should show Laguz in a native WebKit window

**Success criteria:** Laguz runs identically in Tauri. Side-by-side RAM
comparison with the Electron version.

### Phase 2: Multi-Window + All Four Apps

**Goal:** Single Tauri process, four webview windows, Node sidecar running
all Express servers.

1. Extend `tauri-shell` to create four `WebviewWindow` instances, each loading
   its app's frontend from the appropriate Vite build output
2. Node sidecar starts all enabled Express servers
3. Each window gets its own label (`kenaz`, `raido`, `dagaz`, `laguz`) for
   targeted Tauri commands
4. Implement window show/hide/focus logic — closing a window hides it,
   re-opening from Dock shows it

### Phase 3: Helper Apps + Dock Integration

**Goal:** Four rune icons in the Dock with independent badges.

1. Create helper app bundles in `packages/tauri-shell/helpers/`:
   ```
   helpers/
   ├── kenaz-helper/
   │   ├── Info.plist       (CFBundleIdentifier: com.futhark.kenaz)
   │   ├── icon.icns        (existing Kenaz rune icon)
   │   └── main.swift       (~50 lines: register Dock, listen for messages)
   ├── raido-helper/
   ├── dagaz-helper/
   └── laguz-helper/
   ```

2. Main Tauri process → `LSUIElement = true` (hidden from Dock)
3. Communication: Unix domain socket at `~/.futhark/dock.sock`
   - Helper sends: `{ "app": "kenaz", "action": "focus" }`
   - Core sends: `{ "app": "kenaz", "badge": 9 }`
4. Badge counts flow: Express server → Tauri core → helper app → NSApp.dockTile

### Phase 4: Polish + Retire Electron

1. Auto-updater via `tauri-plugin-updater` (replace electron-updater)
2. Code signing + notarization (reuse existing DDZS7WM362 identity)
3. Deep link handling (mailto: for Kenaz)
4. DMG/installer packaging
5. Remove Electron dependencies from all packages
6. Archive Electron main.ts files (keep for reference, remove from build)

## Risk Assessment

### Low Risk
- **React frontends** — zero Electron dependencies, pure web code
- **Express API servers** — zero Electron dependencies, already tested via MCP
- **MCP server** — completely independent, proxies to Express
- **Design system** — CSS/Tailwind, framework-agnostic

### Medium Risk
- **Preload bridge refactor** — Each app has 20–45 IPC channels. Most map
  directly to Express endpoints. The ~6 native-only channels need Tauri
  commands. Effort is mechanical but tedious.
- **WebKit rendering differences** — The apps are currently tested against
  Chromium. WebKit may have minor CSS/JS differences. The Tailwind-heavy
  styling should be fine, but edge cases in TipTap (rich text editor used in
  Kenaz and Raidō) may need attention.
- **Sidecar lifecycle** — Node process needs to start before webviews load
  and shut down cleanly. Tauri's sidecar API handles this, but error states
  (port conflicts, crash recovery) need thought.

### Higher Risk
- **Helper app Dock integration** — This is macOS-specific and uses private-ish
  APIs (NSRunningApplication, distributed notifications). It works — apps like
  Docker Desktop use this pattern — but it's the least well-trodden path.
  **Mitigation:** Phase 3 is independent. Ship Phases 1–2 with a single Dock
  icon first (still a massive RAM win). Add multi-icon later.
- **OAuth flows** — Kenaz and Dagaz open OAuth consent screens. In Electron,
  these happen in a BrowserWindow. In Tauri, use `tauri-plugin-opener` to open
  the system browser, then catch the redirect via deep link. This is actually
  more standard and arguably more secure than the Electron approach.
- **better-sqlite3 native module** — Currently compiled against Electron's
  Node. In the sidecar, it compiles against standard Node, which is simpler.
  No issue expected.

  **Update (May 2026, phase 0.5):** Issue was real and harder than expected.
  The shared monorepo `node_modules/better-sqlite3/build/Release/*.node` can
  only carry one ABI; Electron 39 wants NODE_MODULE_VERSION 140, plain Node
  22 wants 127, Bun 1.3 wants 137. Can't satisfy two of those at once with
  one physical binary.

  **Resolution:** Replaced the direct `better-sqlite3` import in
  `packages/laguz/src/main/vault-store.ts` with a thin adapter at
  `packages/laguz/src/main/db.ts` that runtime-switches:
  - Under Electron / Node → loads `better-sqlite3` (NAPI module, current ABI)
  - Under Bun → loads `bun:sqlite` (built into the Bun runtime, no native
    module needed)

  API surface vault-store uses is small (`new Database`, `exec`, `pragma`,
  `prepare`, `transaction`, `close`, plus `Statement.run/get/all`), and
  bun:sqlite is 90% drop-in. Only `pragma()` had to be polyfilled (bun:sqlite
  doesn't have `.pragma()`; emulate via `run('PRAGMA ...')`).

  This unblocked `bun build --compile` for the sidecar (see Phase 1).

## Effort Estimate

| Phase | Effort | Notes |
|-------|--------|-------|
| Phase 0: Prep | 2–3 days | Refactor main.ts files, create sidecar package |
| Phase 1: Laguz PoC | 2–3 days | Tauri setup, single window, basic commands |
| Phase 2: Multi-window | 3–4 days | All four apps, sidecar lifecycle |
| Phase 3: Dock helpers | 3–5 days | Swift stubs, IPC, badge relay |
| Phase 4: Polish | 2–3 days | Updater, signing, deep links, cleanup |
| **Total** | **~2–3 weeks** | Can ship Phase 1 for validation in <1 week |

## Dependencies

```
cargo install create-tauri-app
cargo install tauri-cli
```

Tauri v2 requires:
- Rust 1.77.2+
- Xcode Command Line Tools (already installed)
- Node 18+ (already on system)

No new system dependencies beyond Rust itself.

## File Structure (Final State)

```
packages/
├── core/              ← shared design system, MCP server (unchanged)
├── kenaz/
│   ├── src/main/      ← services only (Gmail, HubSpot, etc.)
│   └── src/renderer/  ← React UI (unchanged)
├── raido/             ← same pattern
├── dagaz/             ← same pattern
├── laguz/             ← same pattern
├── sidecar/           ← NEW: Node entry point for all Express servers
└── tauri-shell/       ← NEW: Rust binary + helper app stubs
    ├── src/
    │   └── main.rs    ← window management, native APIs, sidecar spawn
    ├── helpers/
    │   ├── kenaz-helper/
    │   ├── raido-helper/
    │   ├── dagaz-helper/
    │   └── laguz-helper/
    ├── Cargo.toml
    └── tauri.conf.json
```

## Dock Mode: Stacked vs Individual

User-configurable via `~/.futhark/config.toml`:

```toml
[appearance]
dock_mode = "stacked"      # default — single Futhark icon
# dock_mode = "individual" # four rune icons with independent badges
```

### Stacked Mode (default, ships with Phase 2)

- Single `Futhark.app` icon in Dock
- Right-click Dock icon shows submenu: ᚲ Kenaz · ᚱ Raidō · ᛞ Dagaz · ᛚ Laguz
- Cmd+` cycles between open futhark windows
- Badge shows aggregate count (e.g. unread emails + overdue tasks)
- Zero helper app complexity — just a standard multi-window Tauri app
- **This is a fully functional product on its own**

### Individual Mode (ships with Phase 3)

- Four separate rune icons in Dock, each with its own badge
- Dedicated Cmd+Tab entries per app
- Requires helper app stubs (see Phase 3)
- Power-user option for those who want per-app badge visibility

### Why This Matters

This makes Phase 3 (helper apps) a **nice-to-have enhancement**, not a
blocker. Stacked mode delivers the full RAM savings and multi-window
experience without any macOS Dock trickery. Individual mode is additive
polish for users who want it.

## Open Questions

1. **Hot reload in dev** — Currently each app has its own `vite dev` on separate
   ports. Tauri dev mode can proxy to these. Need to confirm multi-window
   hot-reload works smoothly.

2. **Distribution** — Single DMG with the suite? Or individual DMGs per app?
   Leaning toward single DMG since it's one binary anyway.

3. **Tray icon** — Worth adding a menu bar icon for the futhark core process?
   Could show a quick-glance status of all four apps. Not required for MVP.

4. **Windows/Linux** — Tauri supports all platforms. The helper-app Dock pattern
   is macOS-only, but the core architecture works everywhere. Cross-platform
   support is a future option, not a current goal.

---

*This document lives at `admin/TAURI-MIGRATION.md` and should be updated as
decisions are made during implementation.*
