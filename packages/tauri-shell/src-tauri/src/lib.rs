use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Spawn the bundled sidecar binary. Tauri resolves `futhark-laguz`
            // to the platform-suffixed binary in src-tauri/bin/ (or, in a
            // packaged build, the .app's resource dir).
            // PoC port: avoid colliding with the running Electron Laguz on
            // :3144. The renderer shim hits 13144 to match.
            let sidecar = app
                .shell()
                .sidecar("futhark-laguz")
                .expect("failed to construct futhark-laguz sidecar command")
                .env("LAGUZ_API_PORT", "13144");

            let (mut rx, _child) = sidecar
                .spawn()
                .expect("failed to spawn futhark-laguz sidecar process");

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
