#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    futhark_tauri_shell_lib::run()
}
