use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the sidecar process so we can reap it when the app exits — otherwise
/// a restart (or cargo-tauri hot reload) orphans it and it keeps holding the
/// API port.
struct SidecarChild(Mutex<Option<CommandChild>>);

/// Per-app wiring, derived from the bundle identifier so one crate builds
/// every Futhark app. demo_badge is a placeholder dock badge proving each app
/// controls its own badge independently; real counts will be set from each
/// renderer via the Tauri JS badge API (they already compute these numbers).
struct AppSpec {
    sidecar: &'static str,
    port_env: &'static str,
    port: &'static str,
    demo_badge: i64,
}

fn app_spec(identifier: &str) -> AppSpec {
    // identifiers look like com.futhark.<app>.tauri
    if identifier.contains("raido") {
        AppSpec { sidecar: "futhark-raido", port_env: "RAIDO_API_PORT", port: "13142", demo_badge: 7 }
    } else if identifier.contains("dagaz") {
        AppSpec { sidecar: "futhark-dagaz", port_env: "DAGAZ_API_PORT", port: "13143", demo_badge: 3 }
    } else if identifier.contains("kenaz") {
        AppSpec { sidecar: "futhark-kenaz", port_env: "KENAZ_API_PORT", port: "13141", demo_badge: 49 }
    } else {
        AppSpec { sidecar: "futhark-laguz", port_env: "LAGUZ_API_PORT", port: "13144", demo_badge: 5 }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let identifier = app.config().identifier.clone();
            let spec = app_spec(&identifier);
            println!("[shell] app={} sidecar={} port={}", identifier, spec.sidecar, spec.port);

            let sidecar = app
                .shell()
                .sidecar(spec.sidecar)
                .expect("failed to construct sidecar command")
                .env(spec.port_env, spec.port);

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn sidecar process");

            app.manage(SidecarChild(Mutex::new(Some(child))));

            // Placeholder dock badge — proves each app bundle owns its own
            // dock tile + badge independently.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_badge_count(Some(spec.demo_badge));
            }

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[sidecar] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar:err] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[sidecar] terminated: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarChild>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
