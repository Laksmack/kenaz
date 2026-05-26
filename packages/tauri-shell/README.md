# @futhark/tauri-shell

Phase 1 Tauri shell PoC. Hosts the Laguz renderer in a native WebKit
window and spawns the compiled sidecar (`packages/sidecar/dist/futhark-laguz`)
as the backend.

See `admin/TAURI-MIGRATION.md` for the broader plan.

## Run

Prereqs: Rust (`rustup`) and Bun installed; sidecar binary compiled
(`cd packages/sidecar && npm run compile:laguz`).

```sh
cd packages/tauri-shell
cargo tauri dev
```

This starts:
- Vite dev server for Laguz's renderer on `:5177` (`beforeDevCommand`)
- The Rust shell, which spawns `futhark-laguz` sidecar on `:13144`
- A WebKit window pointing at `http://localhost:5177`

The renderer's `laguz-tauri-shim.ts` installs a `window.laguz`
fetch-backed shim when the Electron preload bridge is absent.

## Port choice

PoC uses `:13144` for the sidecar so it can run alongside Electron
Laguz (which holds `:3144`). Once Electron retires, the sidecar will
take `:3144`.

## What's NOT here yet

- Tauri's helper-app Dock pattern (Phase 3)
- Multi-window for other apps (Phase 2)
- Auto-updater wiring (Phase 4)
- A real bundle (`cargo tauri build`); only `dev` is wired
- Icons beyond the stock Laguz rune

## Where the sidecar binary lives

Tauri's externalBin convention requires a target-triple-suffixed name:

```
src-tauri/bin/futhark-laguz-aarch64-apple-darwin → ../../../sidecar/dist/futhark-laguz
```

The symlink is gitignored. Rebuild the sidecar to refresh the target.
