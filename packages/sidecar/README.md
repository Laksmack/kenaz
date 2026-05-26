# @futhark/sidecar

Headless Node entry points for the Futhark service layer.

Today this package is consumed by per-app sidecar boot scripts (`dev:laguz`,
later `dev:raido`, `dev:dagaz`, `dev:kenaz`) that start each app's Express
server without Electron. It is the future target the Tauri shell will spawn.

The Electron apps continue to run unchanged — they own their own `main.ts`
and call into the same service classes directly.

See `admin/TAURI-MIGRATION.md` for the broader plan.
