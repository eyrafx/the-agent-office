#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    // Hook relay mode must exit before the single-instance plugin sees it.
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--hook") { agentoffice_lib::run_hook(args.get(i + 1).map_or("claude", String::as_str)); return; }
    // The uninstaller's clean-up runs without a window, before the single-instance plugin too.
    if args.iter().any(|a| a == "--uninstall-cleanup") { agentoffice_lib::uninstall_cleanup(); return; }
    agentoffice_lib::run()
}
