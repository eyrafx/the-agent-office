//! Where the tools AgentOffice reads live on this user's computer, whether they are there, and the
//! one connection AgentOffice makes: its entries in Claude Code's settings, pointing at the helper
//! program in a folder of its own that updates do not move (%LOCALAPPDATA%\AgentOffice\bin; from
//! the Store package ~\.agentoffice\bin, see package.rs).
//!
//! Nothing here runs by itself. Connecting, repairing and disconnecting happen only when the user
//! asks (the first-run screen, Settings), and on uninstall. Before any change Claude Code's file is
//! backed up next to itself; the change is written to a temporary file and moved into place, so a
//! cut-off write never leaves a half file. Only AgentOffice's own entries are added or removed;
//! every other setting and hook of the user's stays as it was, and no old backup is ever restored
//! over the user's file. No entry approves anything: questions and permissions stay the user's.
//! Codex is only read (its session records); nothing of Codex's is written.
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub const HELPER: &str = "agentoffice-hook.exe";

fn env_dir(name: &str) -> Option<PathBuf> { std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from) }
/// The user's home folder. Tests only: AGENTOFFICE_TEST_HOME stands in for it (a test copy cannot
/// change USERPROFILE itself: WebView2 then opens no debugging port to drive it).
pub fn home() -> Option<PathBuf> { env_dir("AGENTOFFICE_TEST_HOME").or_else(|| env_dir("USERPROFILE")) }
/// Claude Code's own folder: CLAUDE_CONFIG_DIR when set (as Claude Code does), else ~/.claude.
pub fn claude_dir() -> Option<PathBuf> { env_dir("CLAUDE_CONFIG_DIR").or_else(|| home().map(|h| h.join(".claude"))) }
/// Codex's folder: CODEX_HOME when set (as Codex does), else ~/.codex.
pub fn codex_dir() -> Option<PathBuf> { env_dir("CODEX_HOME").or_else(|| home().map(|h| h.join(".codex"))) }
pub fn claude_settings_path() -> Option<PathBuf> { claude_dir().map(|d| d.join("settings.json")) }
/// The helper's lasting place: per user, outside the install folder's files, so an update (which
/// replaces those) never leaves Claude Code's entries pointing at nothing.
/// From the Store package it is ~\.agentoffice\bin: the package's writes under AppData go to its
/// private copy, which Claude Code (outside the package) would not find.
pub fn helper_dir() -> Option<PathBuf> {
    if crate::package::packaged() { return home().map(|h| h.join(".agentoffice").join("bin")); }
    env_dir("LOCALAPPDATA").map(|d| d.join("AgentOffice").join("bin"))
}
pub fn helper_path() -> Option<PathBuf> { helper_dir().map(|d| d.join(HELPER)) }
/// The command Claude Code runs for each event.
pub fn hook_command(helper: &Path) -> String { format!("\"{}\" --hook claude", helper.display()) }

/// A program on PATH (as `where` would find it), by its base name with the usual Windows endings.
fn on_path(name: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|d| ["exe", "cmd", "bat", "ps1"].iter().any(|e| d.join(format!("{name}.{e}")).is_file())))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tools { pub claude: bool, pub codex: bool }
/// Which supported tools are on this computer: their own folder (made on first use), or their
/// program where their installers put it. Nothing is guessed: a tool not found is said so.
pub fn find_tools() -> Tools {
    let local = env_dir("LOCALAPPDATA");
    let claude = claude_dir().is_some_and(|d| d.is_dir()) || on_path("claude")
        || home().is_some_and(|h| h.join(".local").join("bin").join("claude.exe").is_file());
    let codex = codex_dir().is_some_and(|d| d.is_dir()) || on_path("codex")
        || local.is_some_and(|l| l.join("OpenAI").join("Codex").join("bin").is_dir());
    Tools { claude, codex }
}

/// The state of the Claude Code connection, as the app shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum Link {
    /// Claude Code is not on this computer.
    Absent,
    /// Found, not connected (no AgentOffice entries).
    Off,
    /// Every entry there, pointing at the helper, which is in its place.
    On,
    /// Something of ours is there but not whole: what is wrong, for "Repair the connection".
    Broken { reason: &'static str },
    /// Claude Code's settings file cannot be read (not valid JSON): never written over.
    Unreadable,
}

/// The connection's state from Claude Code's settings document and the helper's place.
pub fn link_of(settings: Option<&Value>, helper: Option<&Path>, helper_there: bool) -> Link {
    let Some(settings) = settings else { return Link::Off };
    let ours = crate::relay::claude_entries(settings);
    if ours.is_empty() { return Link::Off; }
    let Some(helper) = helper else { return Link::Broken { reason: "no_helper_place" } };
    let want = hook_command(helper).to_lowercase();
    if !crate::relay::claude_hooks_installed(settings) || !crate::relay::claude_ask_installed(settings) { return Link::Broken { reason: "partial" }; }
    if ours.iter().any(|c| !c.to_lowercase().starts_with(want.trim_end_matches("--hook claude").trim_end())) { return Link::Broken { reason: "old_path" }; }
    if !helper_there { return Link::Broken { reason: "helper_missing" }; }
    Link::On
}

fn read_settings(path: &Path) -> Result<Option<Value>, ()> {
    match std::fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(Some(Value::Object(Default::default()))),
        Ok(text) => serde_json::from_str::<Value>(&text).map(Some).map_err(|_| ()),
        Err(_) => Ok(None),
    }
}

pub fn claude_link() -> Link {
    if !find_tools().claude { return Link::Absent; }
    let Some(path) = claude_settings_path() else { return Link::Off };
    match read_settings(&path) {
        Err(()) => Link::Unreadable,
        Ok(settings) => { let helper = helper_path(); let there = helper.as_ref().is_some_and(|h| h.is_file()); link_of(settings.as_ref(), helper.as_deref(), there) }
    }
}

/// The helper bundled with this install, next to the app (the installer also copies it).
fn bundled_helper() -> Option<PathBuf> { std::env::current_exe().ok().map(|e| e.with_file_name(HELPER)).filter(|p| p.is_file()) }

/// Puts this install's helper in its lasting place when it is missing or differs (an update),
/// through a temporary file; a helper that is running for a moment is retried.
pub fn ensure_helper() -> Result<PathBuf, String> {
    let dest = helper_path().ok_or("no_local_folder")?;
    let source = bundled_helper().ok_or("helper_not_bundled")?;
    let new = std::fs::read(&source).map_err(|e| e.to_string())?;
    if std::fs::read(&dest).is_ok_and(|old| old == new) { return Ok(dest); }
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("exe.new");
    std::fs::write(&tmp, &new).map_err(|e| e.to_string())?;
    let mut last = String::new();
    for _ in 0..20 {
        match std::fs::rename(&tmp, &dest) { Ok(()) => return Ok(dest), Err(e) => { last = e.to_string(); std::thread::sleep(std::time::Duration::from_millis(100)); } }
    }
    let _ = std::fs::remove_file(&tmp);
    Err(last)
}

/// Writes a document in place of `path` safely: a backup of the old one beside it (only the few
/// newest of AgentOffice's backups are kept), the new text to a temporary file, then a move.
fn write_safely(path: &Path, value: &Value) -> Result<(), String> {
    let dir = path.parent().ok_or("no_folder")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    if path.is_file() {
        std::fs::copy(path, path.with_extension(format!("json.agentoffice-{}.bak", crate::relay::now()))).map_err(|e| e.to_string())?;
        prune_backups(path, 5);
    }
    let tmp = path.with_extension("json.agentoffice.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| { let _ = std::fs::remove_file(&tmp); e.to_string() })
}
fn prune_backups(path: &Path, keep: usize) {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else { return };
    let prefix = format!("{name}.agentoffice-");
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".bak"))).collect();
    found.sort();
    let extra = found.len().saturating_sub(keep);
    for old in found.into_iter().take(extra) { let _ = std::fs::remove_file(old); }
}

/// Connects Claude Code, or repairs the connection (the same step: the helper put in its place,
/// AgentOffice's entries written again pointing at it, duplicates and old paths removed).
pub fn connect_claude() -> Result<Link, String> {
    let helper = ensure_helper()?;
    let path = claude_settings_path().ok_or("no_user_folder")?;
    let current = read_settings(&path).map_err(|_| "unreadable".to_string())?.unwrap_or_else(|| Value::Object(Default::default()));
    let next = crate::relay::apply_claude_hooks(current, &hook_command(&helper), true);
    write_safely(&path, &next)?;
    Ok(claude_link())
}

/// Removes only AgentOffice's entries from Claude Code's settings (the rest stays as it is now).
pub fn disconnect_claude() -> Result<Link, String> {
    let path = claude_settings_path().ok_or("no_user_folder")?;
    match read_settings(&path) {
        Err(()) => Err("unreadable".into()),
        Ok(None) => Ok(claude_link()),
        Ok(Some(current)) => {
            if crate::relay::claude_entries(&current).is_empty() && current.get("statusLine").is_none() { return Ok(claude_link()); }
            let next = crate::relay::apply_claude_hooks(current.clone(), "", false);
            if next != current { write_safely(&path, &next)?; }
            Ok(claude_link())
        }
    }
}

/// A tool connected through its own hooks file (see `hookfiles`): where the file is, how it is
/// written, and the events AgentOffice listens to (with each one's time limit in seconds).
pub struct HookTool { pub id: &'static str, pub file: fn() -> Option<PathBuf>, pub style: crate::hookfiles::Style, pub events: &'static [(&'static str, u64)], pub present: fn() -> bool }
/// Codex: its own hooks (`~/.codex/hooks.json`, or `CODEX_HOME`). Codex asks the user once to
/// trust new hooks (`/hooks`); until then they do not run.
pub const CODEX_HOOKS: HookTool = HookTool {
    id: "codex", file: || codex_dir().map(|d| d.join("hooks.json")), style: crate::hookfiles::Style::Grouped, present: || find_tools().codex,
    events: &[("SessionStart", 5), ("UserPromptSubmit", 5), ("PreToolUse", 5), ("PermissionRequest", 5), ("PostToolUse", 5), ("Stop", 5), ("Interrupt", 3), ("SessionEnd", 3)],
};
/// Cursor: its user hooks (`~/.cursor/hooks.json`).
pub const CURSOR_HOOKS: HookTool = HookTool {
    id: "cursor", file: || home().map(|h| h.join(".cursor").join("hooks.json")), style: crate::hookfiles::Style::Flat, present: cursor_present,
    events: &[("sessionStart", 5), ("beforeSubmitPrompt", 5), ("beforeShellExecution", 5), ("afterShellExecution", 5), ("beforeMCPExecution", 5), ("afterMCPExecution", 5), ("afterFileEdit", 5), ("stop", 5), ("sessionEnd", 5)],
};
/// Cursor is on this computer: its folders, or its program where its installer puts it.
pub fn cursor_present() -> bool {
    home().is_some_and(|h| h.join(".cursor").is_dir()) || env_dir("APPDATA").is_some_and(|a| a.join("Cursor").is_dir())
        || env_dir("LOCALAPPDATA").is_some_and(|l| l.join("Programs").join("cursor").join("Cursor.exe").is_file()) || on_path("cursor")
}
/// The command a tool runs: Cursor runs hook commands through PowerShell on Windows, where a quoted
/// program is called with `&`; Codex takes it as it is.
pub fn tool_command(helper: &Path, t: &HookTool) -> String {
    let call = format!("\"{}\" --hook {}", helper.display(), t.id);
    if t.style == crate::hookfiles::Style::Flat { format!("& {call}") } else { call }
}
pub fn tool_link(t: &HookTool) -> Link {
    if !(t.present)() { return Link::Absent; }
    let Some(path) = (t.file)() else { return Link::Off };
    let doc = match read_settings(&path) { Err(()) => return Link::Unreadable, Ok(d) => d.unwrap_or_else(crate::hookfiles::empty) };
    let ours = crate::hookfiles::ours(&doc, t.id);
    if ours.is_empty() { return Link::Off; }
    let Some(helper) = helper_path() else { return Link::Broken { reason: "no_helper_place" } };
    let want = tool_command(&helper, t);
    if ours.iter().any(|c| !c.eq_ignore_ascii_case(&want)) { return Link::Broken { reason: "old_path" }; }
    if !crate::hookfiles::complete(&doc, t.style, t.id, t.events, &want) { return Link::Broken { reason: "partial" }; }
    if !helper.is_file() { return Link::Broken { reason: "helper_missing" }; }
    Link::On
}
/// Connects (or repairs) a tool's hooks: the helper in its place, our entries written again.
pub fn connect_tool(t: &HookTool) -> Result<Link, String> {
    if !(t.present)() { return Err("absent".into()); }
    let helper = ensure_helper()?;
    let path = (t.file)().ok_or("no_user_folder")?;
    let current = read_settings(&path).map_err(|_| "unreadable".to_string())?.unwrap_or_else(crate::hookfiles::empty);
    let next = crate::hookfiles::apply(current, t.style, t.id, t.events, &tool_command(&helper, t), true);
    write_safely(&path, &next)?;
    Ok(tool_link(t))
}
/// Takes only our entries out of a tool's hooks file.
pub fn disconnect_tool(t: &HookTool) -> Result<Link, String> {
    let path = (t.file)().ok_or("no_user_folder")?;
    match read_settings(&path) {
        Err(()) => Err("unreadable".into()),
        Ok(None) => Ok(tool_link(t)),
        Ok(Some(current)) => {
            if crate::hookfiles::ours(&current, t.id).is_empty() { return Ok(tool_link(t)); }
            let next = crate::hookfiles::apply(current.clone(), t.style, t.id, t.events, "", false);
            if next != current { write_safely(&path, &next)?; }
            Ok(tool_link(t))
        }
    }
}
pub fn hook_tool(id: &str) -> Option<&'static HookTool> { [&CODEX_HOOKS, &CURSOR_HOOKS].into_iter().find(|t| t.id == id) }

/// When AgentOffice is connected already, an updated app puts its new helper in the lasting place
/// (the entries keep pointing there). Nothing is connected that was not.
pub fn refresh_helper_if_connected() {
    let connected = claude_settings_path().and_then(|p| read_settings(&p).ok().flatten()).is_some_and(|s| {
        let want = helper_path().map(|h| hook_command(&h).to_lowercase());
        want.is_some_and(|w| crate::relay::claude_entries(&s).iter().any(|c| c.to_lowercase() == w))
    }) || [&CODEX_HOOKS, &CURSOR_HOOKS].into_iter().any(|t| (t.file)().and_then(|p| read_settings(&p).ok().flatten()).is_some_and(|d| !crate::hookfiles::ours(&d, t.id).is_empty()));
    if connected { let _ = ensure_helper(); }
}

/// Uninstall (run by the uninstaller, not on update): AgentOffice's entries out of Claude Code's
/// settings, and its helper folder gone. Returns what was done, for the uninstaller's log.
pub fn uninstall_cleanup() -> String {
    let mut hooks = match disconnect_claude() { Ok(_) => "claude: entries removed".to_string(), Err(e) => format!("claude: {e}") };
    for t in [&CODEX_HOOKS, &CURSOR_HOOKS] { hooks += &match disconnect_tool(t) { Ok(_) => format!("; {}: entries removed", t.id), Err(e) => format!("; {}: {e}", t.id) }; }
    let helper = match helper_dir() {
        Some(dir) if dir.is_dir() => match std::fs::remove_dir_all(&dir) { Ok(()) => "helper folder removed".to_string(), Err(e) => format!("helper folder: {e}") },
        _ => "no helper folder".into(),
    };
    if let Some(parent) = helper_dir().and_then(|d| d.parent().map(Path::to_path_buf)) { let _ = std::fs::remove_dir(parent); }
    format!("{hooks}; {helper}")
}

/// Start with Windows: one per-user entry in Windows' Run list, starting the app quietly (the island
/// and the tray icon; the office window stays closed). The entry itself is the setting: the
/// installer writes it when its box is ticked, Settings turn it on and off, an uninstall removes it.
/// Tests only: AGENTOFFICE_TEST_RUN_KEY names another key under HKCU instead of the real Run list.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "AgentOffice";
fn run_key() -> String { std::env::var("AGENTOFFICE_TEST_RUN_KEY").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| RUN_KEY.into()) }
/// What the entry starts: this program, quietly.
pub fn start_command() -> Option<String> { std::env::current_exe().ok().map(|e| format!("\"{}\" --background", e.display())) }
/// The program an entry starts (its quoted path).
pub fn command_program(command: &str) -> Option<PathBuf> { command.trim().strip_prefix('"').and_then(|r| r.split('"').next()).map(PathBuf::from) }

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }
#[cfg(windows)]
fn read_run() -> Option<String> {
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let (key, value) = (wide(&run_key()), wide(RUN_VALUE));
    let mut buf = vec![0u16; 2048]; let mut len = (buf.len() * 2) as u32;
    let ok = unsafe { RegGetValueW(HKEY_CURRENT_USER, windows::core::PCWSTR(key.as_ptr()), windows::core::PCWSTR(value.as_ptr()), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len)) };
    if ok.is_err() { return None; }
    let n = (len as usize / 2).saturating_sub(1); Some(String::from_utf16_lossy(&buf[..n.min(buf.len())]))
}
#[cfg(windows)]
fn write_run(command: &str) -> Result<(), String> {
    use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
    let (key, value, data) = (wide(&run_key()), wide(RUN_VALUE), wide(command));
    unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, windows::core::PCWSTR(key.as_ptr()), windows::core::PCWSTR(value.as_ptr()), REG_SZ.0, Some(data.as_ptr().cast()), (data.len() * 2) as u32) }.ok().map_err(|e| e.to_string())
}
#[cfg(windows)]
fn delete_run() -> Result<(), String> {
    use windows::Win32::System::Registry::{RegDeleteKeyValueW, HKEY_CURRENT_USER};
    let (key, value) = (wide(&run_key()), wide(RUN_VALUE));
    let r = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, windows::core::PCWSTR(key.as_ptr()), windows::core::PCWSTR(value.as_ptr())) };
    // Not there (2: file not found) is already what was asked.
    if r.is_ok() || r.0 == 2 { Ok(()) } else { Err(r.to_hresult().message()) }
}
#[cfg(not(windows))] fn read_run() -> Option<String> { None }
#[cfg(not(windows))] fn write_run(_: &str) -> Result<(), String> { Err("windows_only".into()) }
#[cfg(not(windows))] fn delete_run() -> Result<(), String> { Ok(()) }

/// From the Store package: its startup task instead of the Run list.
pub fn autostart() -> bool { if crate::package::packaged() { crate::package::startup_task_on() } else { read_run().is_some() } }
/// On: the entry written for this program (one entry, under one name: never a second); off: removed.
pub fn set_autostart(on: bool) -> Result<bool, String> {
    if crate::package::packaged() { return crate::package::set_startup_task(on); }
    if on { write_run(&start_command().ok_or("no_program")?)?; } else { delete_run()?; }
    Ok(autostart())
}
/// An entry left pointing at a program that is not there any more (the app was moved) points at
/// this one again. An entry for a program that is there is left as it is (a development copy never
/// takes over an installed app's entry), and none is made. The Store package has no entry.
pub fn repoint_autostart() {
    if crate::package::packaged() { return; }
    if let Some(command) = read_run() {
        if command_program(&command).is_some_and(|p| !p.is_file()) { if let Some(now) = start_command() { let _ = write_run(&now); } }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn helper() -> PathBuf { PathBuf::from(r"C:\Users\u\AppData\Local\AgentOffice\bin\agentoffice-hook.exe") }
    #[test] fn the_connection_state_is_told_from_the_entries_and_the_helper() {
        let h = helper();
        assert_eq!(link_of(None, Some(&h), true), Link::Off);
        assert_eq!(link_of(Some(&json!({"theme": "dark"})), Some(&h), true), Link::Off);
        let on = crate::relay::apply_claude_hooks(json!({"theme": "dark"}), &hook_command(&h), true);
        assert_eq!(link_of(Some(&on), Some(&h), true), Link::On);
        assert_eq!(link_of(Some(&on), Some(&h), false), Link::Broken { reason: "helper_missing" });
        let old = crate::relay::apply_claude_hooks(json!({}), r#""C:\Users\u\Desktop\AgentOffice\.artifacts\cargo-target\release\agentoffice-hook.exe" --hook claude"#, true);
        assert_eq!(link_of(Some(&old), Some(&h), true), Link::Broken { reason: "old_path" });
        let mut partial = on.clone(); partial["hooks"].as_object_mut().unwrap().remove("Stop");
        assert_eq!(link_of(Some(&partial), Some(&h), true), Link::Broken { reason: "partial" });
    }
    #[test] fn the_start_entry_names_its_program() {
        assert_eq!(command_program(r#""C:\Users\u\AppData\Local\AgentOffice\agentoffice.exe" --background"#), Some(PathBuf::from(r"C:\Users\u\AppData\Local\AgentOffice\agentoffice.exe")));
        assert_eq!(command_program("agentoffice.exe"), None, "an entry not written by AgentOffice is not read as one");
        assert!(start_command().is_some_and(|c| c.starts_with('"') && c.ends_with("\" --background")));
    }
    #[test] fn writing_keeps_a_few_backups_and_never_leaves_a_half_file() {
        let dir = std::env::temp_dir().join(format!("ao-setup-{}", crate::relay::now()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"theme":"dark"}"#).unwrap();
        for i in 0..8 { write_safely(&path, &json!({"theme": "dark", "n": i})).unwrap(); std::thread::sleep(std::time::Duration::from_millis(2)); }
        let names: Vec<String> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names.iter().filter(|n| n.ends_with(".bak")).count(), 5);
        assert!(!names.iter().any(|n| n.ends_with(".tmp")));
        assert_eq!(serde_json::from_str::<Value>(&std::fs::read_to_string(&path).unwrap()).unwrap(), json!({"theme": "dark", "n": 7}));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
