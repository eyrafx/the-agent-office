pub mod domain;
mod geometry;
mod platform;
pub mod relay;
mod claude_usage;
mod codex_usage;
mod claude_meta;
mod codex;
mod dock;
mod backdrop;
mod settings;
mod docs;
mod media;
mod site;
mod reminders;
mod lyrics;
mod shelf;
mod indicators;
mod i18n;
mod status;
pub mod setup;
pub mod package;
mod providers;
mod hookfiles;
mod codex_hooks;
mod cursor_hooks;

pub fn run_hook(provider: &str) { if provider == "claude" { relay::run_hook(provider); } }
/// The uninstaller's step (not on update): AgentOffice's entries out of Claude Code's settings and
/// its helper folder removed; what was done goes to the uninstaller's log through stdout.
pub fn uninstall_cleanup() { println!("{}", setup::uninstall_cleanup()); }

use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use tauri::{AppHandle, Manager, Emitter, State, WebviewWindowBuilder, WebviewUrl, PhysicalPosition, PhysicalSize};
use domain::{Store, Snapshot, RequestKey, SessionKey, AnswerResult, WorkEntry};

/// Notch: a window of fixed size (island plus limits-panel area) that is always
/// shown. What is visible and clickable is only the island's current shape (and
/// the panel when open), which the page reports every animation frame; the rest
/// of the window is outside its region, so it neither draws nor takes clicks.
/// Optional auto-hide removes the window while collapsed and brings it back from
/// a thin top-edge strip.
struct PinItem(tauri::menu::CheckMenuItem<tauri::Wry>);
/// The tray menu's plain items, relabelled when the language changes.
struct TrayWords { office: tauri::menu::MenuItem<tauri::Wry>, settings: tauri::menu::MenuItem<tauri::Wry>, exit: tauri::menu::MenuItem<tauri::Wry> }
/// The tray menu and the office window's title in the language of these settings.
fn relabel(app: &AppHandle, prefs: &settings::Settings) {
    let lang = i18n::resolve(&prefs.language);
    let say = |key: &str| i18n::text(lang, key, &[]);
    if let Some(w) = app.try_state::<TrayWords>() { let _ = w.office.set_text(say("tray.open_office")); let _ = w.settings.set_text(say("tray.settings")); let _ = w.exit.set_text(say("tray.exit")); }
    if let Some(i) = app.try_state::<PinItem>() { let _ = i.0.set_text(say("tray.pin_panel")); }
    if let Some(i) = app.try_state::<CaptureItem>() { let _ = i.0.set_text(say("tray.in_screenshots")); }
    if let Some(i) = app.try_state::<MuteItem>() { let _ = i.0.set_text(say("tray.mute")); }
    if let Some(w) = app.get_webview_window("office") { let _ = w.set_title(&say("app.office_window_title")); }
}
struct CaptureItem(tauri::menu::CheckMenuItem<tauri::Wry>);
/// Claude questions whose hook waits for an answer from here: (chat, tool call) → the tool's
/// original input (echoed back with the answers) and the one-shot reply to the hook.
#[derive(Default)]
struct Asks(Mutex<std::collections::HashMap<(domain::SessionKey,String),(serde_json::Value,tokio::sync::oneshot::Sender<String>)>>);
struct MuteItem(tauri::menu::CheckMenuItem<tauri::Wry>);
#[derive(Clone, Copy, Debug, serde::Deserialize)]
struct ShapeRect { x: f64, y: f64, w: f64, h: f64, r: f64, #[serde(default)] flush: bool, #[serde(default)] s: f64 }
/// How far outside the drawn edge the window region runs (physical px): the page's soft,
/// anti-aliased edge lies inside it, so the binary region never cuts it into steps.
const REGION_MARGIN: i32 = 2;
struct Shell {
    expanded: AtomicBool, pinned: AtomicBool, limits: AtomicBool, shown: AtomicBool, muted: AtomicBool, autohide: AtomicBool,
    /// User choice: the notch shows in screenshots and recordings (no live glass then).
    capturable: AtomicBool,
    /// Ask the Claude usage service now (set when the Limits panel opens).
    usage_refresh: AtomicBool,
    /// Where the office state and the user's session names are kept.
    office_paths: Mutex<Option<(std::path::PathBuf,std::path::PathBuf)>>,
    /// Window bounds (physical) and scale.
    bounds: Mutex<Option<(geometry::Bounds,f64)>>,
    /// The island's own bounds (physical), centred on the screen.
    island: Mutex<Option<geometry::Bounds>>,
    /// Visible shapes in physical pixels relative to the window.
    /// (x, y, w, h, bottom radius, flush with the screen top, shoulder radius).
    shapes: Mutex<Vec<(i32,i32,i32,i32,i32,bool,i32)>>,
    /// The island is live glass (the desktop behind it is sampled); "dark" draws plain black.
    glass: AtomicBool,
    /// The island is animating: the region is its whole area until it settles (cut once, not per frame).
    moving: AtomicBool,
    /// That area (physical px in the window), as the page last gave it.
    area: Mutex<Option<(i32,i32,i32,i32)>>,
    /// The island has just settled: the pointer loop tells the page again where the pointer is.
    recheck: AtomicBool,
    settings: Mutex<Option<std::path::PathBuf>>,
    /// How the closed island rests now (from the window under it and the user's choice there).
    dock: Mutex<Option<dock::Dock>>,
    /// The rest choices changed: the dock loop judges again at once.
    redock: AtomicBool,
    /// While the island is moved along the top edge: its centre (physical x) and the pointer's
    /// distance from that centre when the move began.
    drag: Mutex<Option<(i32,i32)>>,
    /// User choice: a new question or permission opens the notch (never in full screen or do-not-disturb).
    alerts: AtomicBool,
    /// The user's settings (one record for the notch and the office), as saved.
    prefs: Mutex<settings::Settings>,
    /// The office window's last normal bounds (physical) and whether it was maximized; saved when changed.
    office_window: Mutex<Option<serde_json::Value>>, office_dirty: AtomicBool,
    /// The saved work board (one JSON line per entry) and how many lines were appended since it was last rewritten.
    log_path: Mutex<Option<std::path::PathBuf>>, log_appended: std::sync::atomic::AtomicUsize,
}

/// What follows new events, once per batch: the board's new lines are saved and sent to the
/// office; a new question or permission opens the notch for about 10 s (without focus) unless
/// the user turned that off or a full-screen app or do-not-disturb is on; and the office plays
/// its sound for new events unless muted or quiet. Each event comes here only once.
fn after_events(app: &AppHandle, store: &mut Store) {
    let fresh = store.take_fresh_log();
    if !fresh.is_empty() { append_log(app, store, &fresh); let _ = app.emit("work-log", &fresh); }
    let notes = store.drain_notifications();
    if notes.is_empty() { return; }
    let prefs = app.state::<Shell>().prefs.lock().map(|p| p.clone()).unwrap_or_default();
    let choice = |kind: &str| match kind { "permission" | "question" => prefs.notify_request, "error" => prefs.notify_error, _ => prefs.notify_reply };
    if quiet_now(&prefs).is_some() { return; }
    if notes.iter().any(|n| choice(&n.kind).open) {
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || { let _ = alert_notch(&app2); });
    }
    if !prefs.muted && notes.iter().any(|n| choice(&n.kind).sound) { platform::chime_kind(prefs.volume, &prefs.sound); }
}
/// Why notifications stay quiet now, if the user keeps them quiet then: a full-screen app, or do-not-disturb.
fn quiet_now(prefs: &settings::Settings) -> Option<&'static str> {
    platform::quiet().filter(|q| (*q == "fullscreen" && prefs.quiet_fullscreen) || (*q == "dnd" && prefs.quiet_dnd))
}

/// The work board is kept as one JSON line per entry; new lines are appended at once (so a
/// restart keeps them), and the file is rewritten from the board now and then to drop old lines.
fn append_log(app: &AppHandle, store: &Store, fresh: &[WorkEntry]) {
    use std::io::Write;
    let shell = app.state::<Shell>();
    let Some(path) = shell.log_path.lock().ok().and_then(|p| p.clone()) else { return };
    if shell.log_appended.fetch_add(fresh.len(), Ordering::Relaxed) + fresh.len() > domain::LOG_MAX / 5 { shell.log_appended.store(0, Ordering::Relaxed); rewrite_log(&path, &store.log_entries()); return; }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        for e in fresh { if let Ok(line) = serde_json::to_string(e) { let _ = writeln!(file, "{line}"); } }
    }
}
fn rewrite_log(path: &std::path::Path, entries: &[WorkEntry]) {
    let text: String = entries.iter().filter_map(|e| serde_json::to_string(e).ok()).map(|l| l + "\n").collect();
    let next = path.with_extension("jsonl.new");
    if std::fs::write(&next, text).is_ok() { let _ = std::fs::rename(&next, path); }
}
fn read_log(path: &std::path::Path) -> Vec<WorkEntry> {
    std::fs::read_to_string(path).map(|t| t.lines().filter_map(|l| serde_json::from_str::<WorkEntry>(l).ok()).collect()).unwrap_or_default()
}

/// The work board's lines (the last 30 days, oldest first) for the office's wall.
#[tauri::command]
fn get_work_log(store: State<'_,Mutex<Store>>) -> Result<Vec<WorkEntry>,String> {
    Ok(store.lock().map_err(|_| "Session store unavailable")?.log_entries())
}

/// Notification preferences: whether a new request opens the notch, whether sound is muted,
/// and why notifications are quiet right now (full screen or do-not-disturb), if they are.
#[tauri::command]
fn notify_prefs(app: AppHandle) -> serde_json::Value {
    let prefs = app.state::<Shell>().prefs.lock().map(|p| p.clone()).unwrap_or_default();
    serde_json::json!({"alerts": prefs.notify_request.open, "muted": prefs.muted, "quiet": quiet_now(&prefs)})
}
#[tauri::command]
fn set_notch_alerts(app: AppHandle, enabled: bool) -> Result<(),String> {
    let request = app.state::<Shell>().prefs.lock().map(|p| p.notify_request).unwrap_or(settings::Notify { open: true, sound: true });
    apply_settings(&app, &serde_json::json!({"notifyRequest": {"open": enabled, "sound": request.sound}})).map(|_| ())
}

/// The settings record, as saved.
#[tauri::command]
fn get_settings(app: AppHandle) -> settings::Settings { app.state::<Shell>().prefs.lock().map(|p| p.clone()).unwrap_or_default() }
/// Changes settings: checked and limited, saved, applied at once (both windows hear of it). A
/// shortcut another program owns, or a file that cannot be written, saves nothing and says why.
#[tauri::command]
fn set_settings(app: AppHandle, patch: serde_json::Value) -> Result<settings::Settings,String> { apply_settings(&app, &patch) }
fn apply_settings(app: &AppHandle, patch: &serde_json::Value) -> Result<settings::Settings,String> {
    let shell = app.state::<Shell>();
    let old = shell.prefs.lock().map_err(|_| "Ayarlar kullanılamıyor")?.clone();
    let new = old.merged(patch);
    if new == old { return Ok(new); }
    let mut moved: Vec<(i32, String)> = vec![];
    for (id, before, after) in [(1, &old.shortcut_open, &new.shortcut_open), (2, &old.shortcut_mute, &new.shortcut_mute)] {
        if before == after { continue; }
        let (mods, key) = settings::parse_shortcut(after).ok_or("Bu kısayol kullanılamaz")?;
        if !platform::rebind(id, mods, key) {
            for (id, back) in &moved { if let Some((m, k)) = settings::parse_shortcut(back) { platform::rebind(*id, m, k); } }
            return Err(format!("{after} başka bir uygulamada kullanılıyor; kısayol değiştirilmedi."));
        }
        moved.push((id, before.clone()));
    }
    *shell.prefs.lock().map_err(|_| "Ayarlar kullanılamıyor")? = new.clone();
    if let Err(e) = save_settings(&shell) {
        *shell.prefs.lock().map_err(|_| "Ayarlar kullanılamıyor")? = old.clone();
        for (id, back) in &moved { if let Some((m, k)) = settings::parse_shortcut(back) { platform::rebind(*id, m, k); } }
        return Err(format!("Ayar kaydedilemedi: {e}"));
    }
    shell.capturable.store(new.capturable, Ordering::Relaxed);
    shell.glass.store(new.island_theme == "glass", Ordering::Relaxed);
    shell.alerts.store(new.notify_request.open, Ordering::Relaxed);
    shell.muted.store(new.muted, Ordering::Relaxed);
    if let Some(item) = app.try_state::<MuteItem>() { let _ = item.0.set_checked(new.muted); }
    if new.language != old.language { relabel(app, &new); }
    if let Some(item) = app.try_state::<CaptureItem>() { let _ = item.0.set_checked(new.capturable); }
    if let Some(win) = app.get_webview_window("notch") {
        if new.capturable != old.capturable { let _ = backdrop::exclude_from_capture(&win, !new.capturable); }
        if (&new.rest_desktop, &new.rest_apps, &new.rest_browsers, &new.fullscreen_rest) != (&old.rest_desktop, &old.rest_apps, &old.rest_browsers, &old.fullscreen_rest) { shell.redock.store(true, Ordering::Relaxed); }
        if new.monitor != old.monitor || new.scale != old.scale || new.positions != old.positions { let _ = place_notch(app); }
    }
    let _ = app.emit("settings", &new);
    Ok(new)
}
/// The notification sound at the chosen volume, only when the user asks to hear it.
#[tauri::command]
fn play_chime(app: AppHandle, volume: Option<u32>, sound: Option<String>) {
    let prefs = app.state::<Shell>().prefs.lock().map(|p| (p.volume, p.sound.clone())).unwrap_or((50, "soft".into()));
    platform::chime_kind(volume.unwrap_or(prefs.0), &sound.unwrap_or(prefs.1));
}
/// The screens the notch can be on: system name, a label and whether it is the main one.
#[tauri::command]
fn list_monitors(app: AppHandle) -> Vec<serde_json::Value> {
    let primary = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    app.available_monitors().unwrap_or_default().iter().enumerate().map(|(i, m)| serde_json::json!({
        "name": m.name().cloned().unwrap_or_default(), "label": format!("Ekran {} ({}×{})", i + 1, m.size().width, m.size().height), "primary": m.name().cloned() == primary,
    })).collect()
}
/// Opens the office on its settings (from the notch's gear).
#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(),String> {
    open_office(app.clone(), None)?;
    app.emit_to("office", "open-settings", ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_snapshot(store: State<'_,Mutex<Store>>) -> Result<Snapshot,String> {
    Ok(store.lock().map_err(|_| "Session store unavailable")?.snapshot())
}

#[tauri::command]
fn set_demo(app: AppHandle, store: State<'_,Mutex<Store>>, enabled: bool) -> Result<(),String> {
    let snapshot = store.lock().map_err(|_| "Session store unavailable")?.set_demo(enabled);
    app.emit("snapshot", snapshot).map_err(|e| e.to_string())
}

/// An answer the user gave here: question text → the chosen label(s) (several joined with ", ")
/// or their own words. Only a Claude question whose hook waits can take it; it is handed over
/// once (a second click finds the question already being sent), and only these answers.
#[tauri::command]
fn answer_request(app: AppHandle, store: State<'_,Mutex<Store>>, key: RequestKey, version: u64, answers: serde_json::Map<String,serde_json::Value>) -> Result<AnswerResult,String> {
    let mut store = store.lock().map_err(|_| "Session store unavailable")?;
    if store.snapshot().mode == "demo" {
        let first = answers.values().next().and_then(|v| v.as_str()).unwrap_or_default().to_owned();
        let result = store.answer_request(key,version,first);
        app.emit("snapshot",store.snapshot()).map_err(|e|e.to_string())?;
        return Ok(result);
    }
    let Some(request) = store.live_question(&key) else {
        let known = store.live_snapshot().requests.into_iter().find(|r| r.key == key);
        return Ok(match known { Some(r) if r.version == version && r.status == domain::RequestStatus::Pending && r.outcome.is_none() => AnswerResult::Unsupported, _ => AnswerResult::Stale });
    };
    // Every question answered, each with a short text; nothing else is passed on.
    let clean: serde_json::Map<String,serde_json::Value> = request.questions.iter().filter_map(|q| answers.get(&q.question).and_then(|v| v.as_str()).map(|v| (q.question.clone(), serde_json::Value::String(v.trim().chars().take(2000).collect())))).filter(|(_, v)| v.as_str().is_some_and(|t| !t.is_empty())).collect();
    if request.questions.is_empty() || clean.len() != request.questions.len() { return Ok(AnswerResult::Failed); }
    let at = relay::now();
    let (tool, ticket) = match store.begin_live_answer(&key, version, at) { Ok(t) => t, Err(e) => { let _ = app.emit("snapshot",store.snapshot()); return Ok(e); } };
    let waiting = app.state::<Asks>().0.lock().ok().and_then(|mut m| m.remove(&(key.session_key.clone(), tool.clone())));
    let delivered = match waiting { Some((input, reply)) => reply.send(relay::ask_answer_output(&input, &clean)).is_ok(), None => false };
    let result = store.finish_answer_at(&key, ticket, delivered, relay::now());
    store.set_live_ask(&key.session_key, &tool, None);
    app.emit("snapshot",store.snapshot()).map_err(|e|e.to_string())?;
    Ok(result)
}

/// "Claude'da yanıtla": the question goes to Claude's own window now (the hook returns nothing).
#[tauri::command]
fn release_request(app: AppHandle, store: State<'_,Mutex<Store>>, key: RequestKey) -> Result<bool,String> {
    let mut store = store.lock().map_err(|_| "Session store unavailable")?;
    let Some(tool) = store.live_snapshot().requests.into_iter().find(|r| r.key == key).and_then(|r| r.tool_id) else { return Ok(false) };
    let waiting = app.state::<Asks>().0.lock().ok().and_then(|mut m| m.remove(&(key.session_key.clone(), tool.clone())));
    if let Some((_, reply)) = waiting { let _ = reply.send(String::new()); }
    let changed = store.set_live_ask(&key.session_key, &tool, None);
    app.emit("snapshot",store.snapshot()).map_err(|e|e.to_string())?;
    Ok(changed)
}

/// Whether Claude Code's settings hold AgentOffice's hooks, the question entry included (an
/// install from before it says no, so "Bağla" adds it).
#[tauri::command]
fn claude_hooks_status() -> bool { setup::claude_link() == setup::Link::On }

#[tauri::command]
async fn set_claude_hooks(enable: bool) -> Result<bool,String> {
    let link = tauri::async_runtime::spawn_blocking(move || if enable { setup::connect_claude() } else { setup::disconnect_claude() }).await.map_err(|e| e.to_string())??;
    Ok(link == setup::Link::On)
}

/// The supported tools found on this computer and the Claude Code connection's state (first-run
/// screen, Settings). Read only.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolsState { tools: setup::Tools, claude: setup::Link, packaged: bool, providers: Vec<providers::ProviderState> }
#[tauri::command]
async fn tools_state() -> Result<ToolsState,String> {
    tauri::async_runtime::spawn_blocking(|| ToolsState { tools: setup::find_tools(), claude: setup::claude_link(), packaged: package::packaged(), providers: providers::states() }).await.map_err(|e| e.to_string())
}
/// Connects (or repairs) a tool's own hooks (Codex, Cursor), only on the user's click: our entries
/// in its hooks file, after a backup; nothing of the user's changes. Codex then asks once to trust them.
#[tauri::command]
async fn connect_hooks(tool: String) -> Result<ToolsState,String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ToolsState,String> {
        let t = setup::hook_tool(&tool).ok_or("unknown_tool")?;
        setup::connect_tool(t)?;
        Ok(ToolsState { tools: setup::find_tools(), claude: setup::claude_link(), packaged: package::packaged(), providers: providers::states() })
    }).await.map_err(|e| e.to_string())?
}
/// Takes only our entries out of a tool's hooks file.
#[tauri::command]
async fn disconnect_hooks(tool: String) -> Result<ToolsState,String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ToolsState,String> {
        let t = setup::hook_tool(&tool).ok_or("unknown_tool")?;
        setup::disconnect_tool(t)?;
        Ok(ToolsState { tools: setup::find_tools(), claude: setup::claude_link(), packaged: package::packaged(), providers: providers::states() })
    }).await.map_err(|e| e.to_string())?
}/// Start with Windows (the per-user Run entry; it is the setting itself).
#[tauri::command]
fn get_autostart() -> bool { setup::autostart() }
#[tauri::command]
fn set_autostart(on: bool) -> Result<bool,String> { setup::set_autostart(on) }

/// The first-run screen's one step (also "Repair the connection"): Claude Code connected when it
/// is on this computer (Codex needs nothing: it is read), and the first run marked done.
#[tauri::command]
async fn connect_tools(app: AppHandle) -> Result<ToolsState,String> {
    let state = tauri::async_runtime::spawn_blocking(|| -> Result<ToolsState,String> {
        let tools = setup::find_tools();
        let claude = if tools.claude { setup::connect_claude()? } else { setup::Link::Absent };
        Ok(ToolsState { tools, claude, packaged: package::packaged(), providers: providers::states() })
    }).await.map_err(|e| e.to_string())??;
    apply_settings(&app, &serde_json::json!({ "setupDone": true }))?;
    Ok(state)
}

/// Tells the office's web view whether it is seen: hidden, it stops drawing and its timers and
/// animations slow down (a hidden window alone did not tell it; it went on at full frame rate).
fn office_seen(win: &tauri::WebviewWindow, seen: bool) {
    #[cfg(windows)]
    let _ = win.with_webview(move |w| unsafe { let _ = w.controller().SetIsVisible(seen); });
    let _ = win.emit("office-visible", seen);
}

/// Whether the office window is on screen (a hidden one draws nothing).
#[tauri::command]
fn office_visible(app: AppHandle) -> bool { app.get_webview_window("office").and_then(|w| w.is_visible().ok()).unwrap_or(true) }

#[tauri::command]
fn open_office(app: AppHandle, key: Option<SessionKey>) -> Result<(),String> {
    let office = app.get_webview_window("office").ok_or("Office window unavailable")?;
    office.show().map_err(|e|e.to_string())?;
    office.unminimize().map_err(|e|e.to_string())?;
    office.set_focus().map_err(|e|e.to_string())?;
    office_seen(&office, true);
    office.emit("select-session",key).map_err(|e|e.to_string())?;
    Ok(())
}

fn place_notch(app: &AppHandle) -> Result<(),String> {
    let win = app.get_webview_window("notch").ok_or("Notch window unavailable")?;
    let (wanted, size) = app.state::<Shell>().prefs.lock().map(|p| (p.monitor.clone(), p.scale as f64 / 100.0)).unwrap_or((String::new(), 1.0));
    // The screen the user chose (while it is connected), else the one the notch is on.
    let chosen = (!wanted.is_empty()).then(|| app.available_monitors().ok()).flatten().and_then(|list| list.into_iter().find(|m| m.name().is_some_and(|n| *n == wanted)));
    let monitor = match chosen { Some(m) => m, None => win.current_monitor().map_err(|e|e.to_string())?.or(app.primary_monitor().map_err(|e|e.to_string())?).ok_or("No display available")? };
    let area = monitor.work_area();
    let monitor_work = geometry::Bounds { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height };
    let work = if wanted.is_empty() { platform::work_area(&win).unwrap_or(monitor_work) } else { monitor_work };
    let scale = monitor.scale_factor();
    let center = island_center(app, monitor.name().map(String::as_str).unwrap_or(""), work);
    // The notch's size choice scales the window; the page draws at the same size (CSS zoom),
    // and the shapes it reports stay in the screen's own scale.
    let island = geometry::notch_bounds_at(work,scale * size,center);
    let (b,_,left) = geometry::with_panel(island,work,scale * size);
    let moved = app.state::<Shell>().bounds.lock().map_err(|_| "Notch state unavailable")?.replace((b,scale)) != Some((b,scale));
    *app.state::<Shell>().island.lock().map_err(|_| "Notch state unavailable")? = Some(island);
    // Only when something changed: re-applying size/position makes the window
    // manager redraw the frame, which can flash a 1px border.
    if moved {
        win.set_size(PhysicalSize::new(b.width,b.height)).map_err(|e|e.to_string())?;
        win.set_position(PhysicalPosition::new(b.x,b.y)).map_err(|e|e.to_string())?;
        // Re-assert after crossing a monitor's DPI boundary, as in upstream island.rs.
        win.set_size(PhysicalSize::new(b.width,b.height)).map_err(|e|e.to_string())?;
        platform::clear_surface(&win);
    }
    apply_shapes(app)?;
    win.emit("notch-layout",serde_json::json!({"side":if left {"left"} else {"right"}})).map_err(|e|e.to_string())
}

/// Where the island's centre goes on a screen: while it is moved, where it is moved to; else the
/// user's saved place on that screen; else the middle. Always inside the work area.
fn island_center(app: &AppHandle, monitor: &str, work: geometry::Bounds) -> Option<i32> {
    let shell = app.state::<Shell>();
    let dragged = shell.drag.lock().ok().and_then(|d| *d).map(|(x, _)| x);
    let saved = shell.prefs.lock().ok().and_then(|p| p.positions.get(monitor).copied()).map(|share| work.x + (share * work.width as f64).round() as i32);
    dragged.or(saved).map(|x| x.clamp(work.x, work.x + work.width as i32 - 1))
}

/// Moving the island along the top edge: the page starts it from its handle and ends it on
/// release. Meanwhile the pointer is followed here (about 60 times a second) and the island kept
/// within the screen; at the end its place is saved for this screen. `center`: back to the middle.
#[tauri::command]
fn notch_move(app: AppHandle, action: String) -> Result<(),String> {
    let shell = app.state::<Shell>();
    let win = app.get_webview_window("notch").ok_or("Notch window unavailable")?;
    let monitor = win.current_monitor().map_err(|e| e.to_string())?.and_then(|m| m.name().cloned()).unwrap_or_default();
    match action.as_str() {
        "start" => {
            let island = shell.island.lock().map_err(|_| "Notch state unavailable")?.ok_or("Notch not placed")?;
            let (x, _) = platform::cursor().ok_or("No pointer")?;
            let center = island.x + island.width as i32 / 2;
            if shell.drag.lock().map_err(|_| "Notch state unavailable")?.replace((center, x - center)).is_some() { return Ok(()); }
            let follow = app.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(16));
                let shell = follow.state::<Shell>();
                let Ok(mut drag) = shell.drag.lock() else { return };
                let Some((center, grab)) = *drag else { return };
                let Some((x, _)) = platform::cursor() else { continue };
                if x - grab == center { continue; }
                *drag = Some((x - grab, grab));
                drop(drag);
                let app = follow.clone();
                let _ = follow.run_on_main_thread(move || { let _ = place_notch(&app); });
            });
            Ok(())
        }
        "end" => {
            let Some(island) = *shell.island.lock().map_err(|_| "Notch state unavailable")? else { return Ok(()) };
            let work = platform::work_area(&win).ok_or("No work area")?;
            if shell.drag.lock().map_err(|_| "Notch state unavailable")?.take().is_none() { return Ok(()); }
            let share = (island.x + island.width as i32 / 2 - work.x) as f64 / work.width.max(1) as f64;
            let mut positions = shell.prefs.lock().map_err(|_| "Ayarlar kullanılamıyor")?.positions.clone();
            // Within a few pixels of the middle it is the middle.
            if (share - 0.5).abs() * work.width as f64 <= 6.0 { positions.remove(&monitor); } else { positions.insert(monitor, share); }
            apply_settings(&app, &serde_json::json!({ "positions": positions })).map(|_| ())?;
            place_notch(&app)
        }
        "center" => {
            let mut positions = shell.prefs.lock().map_err(|_| "Ayarlar kullanılamıyor")?.positions.clone();
            positions.remove(&monitor);
            apply_settings(&app, &serde_json::json!({ "positions": positions })).map(|_| ())
        }
        _ => Err("Bilinmeyen işlem".into()),
    }
}

fn apply_shapes(app: &AppHandle) -> Result<(),String> {
    let win = app.get_webview_window("notch").ok_or("Notch window unavailable")?;
    let shell = app.state::<Shell>();
    if shell.moving.load(Ordering::Relaxed) { let area = shell.area.lock().ok().and_then(|a| *a); return platform::window_region(&win, area); }
    let shapes = shell.shapes.lock().map_err(|_| "Notch state unavailable")?.clone();
    platform::shape_region(&win,&shapes,REGION_MARGIN)
}

fn pointer_inside(shell: &Shell, (x,y): (i32,i32)) -> bool {
    let Ok(Some((b,_))) = shell.bounds.lock().map(|b| *b) else { return false };
    let Ok(shapes) = shell.shapes.lock() else { return false };
    let (px,py) = (x-b.x, y-b.y);
    // The shoulders widen the island along the screen's top edge.
    shapes.iter().any(|&(sx,sy,w,h,_,_,s)| { let k = if py < sy.max(0) + s { s } else { 0 }; px>=sx-k && px<sx+w+k && py>=sy.max(0) && py<sy+h })
}

/// The pointer over the island's whole area (where it grows), while it changes shape.
fn pointer_over_area(shell: &Shell, (x,y): (i32,i32)) -> bool {
    let Ok(Some((b,_))) = shell.bounds.lock().map(|b| *b) else { return false };
    let Ok(Some((ax,ay,aw,ah))) = shell.area.lock().map(|a| *a) else { return false };
    let (px,py) = (x-b.x, y-b.y);
    px>=ax && px<ax+aw && py>=ay && py<ay+ah
}

/// Whether the pointer counts as over the island. Leaving needs the pointer to move out: the
/// island shrinking under a pointer that has not moved since it was last over it (a page change)
/// is not leaving it, and while the island grows or shrinks a pointer over its area waits for the
/// settled shape to decide.
fn pointer_verdict(was: Option<bool>, inside: bool, unmoved: bool, moving_over_area: bool) -> bool {
    inside || (was==Some(true) && (unmoved || moving_over_area))
}

/// The page reports the island (and panel) outline in CSS pixels, exactly as drawn. While it
/// animates (`moving`) the outline only serves the pointer test and the window region is the
/// whole window, set once: cutting the region on every frame made opening stutter and could
/// show a stale strip at the edges. When it settles the region is cut once, just outside the
/// drawn edge.
#[tauri::command]
fn notch_shape(app: AppHandle, rects: Vec<ShapeRect>, moving: Option<bool>, area: Option<ShapeRect>) -> Result<(),String> {
    let shell = app.state::<Shell>();
    let scale = shell.bounds.lock().map_err(|_| "Notch state unavailable")?.map_or(1.0,|(_,s)|s);
    let px = |v: f64| (v*scale).round() as i32;
    let shapes = rects.iter().map(|r| (px(r.x),px(r.y),px(r.w).max(1),px(r.h).max(1),px(r.r),r.flush,px(r.s).max(0))).collect();
    *shell.shapes.lock().map_err(|_| "Notch state unavailable")? = shapes;
    if let Some(a) = area { *shell.area.lock().map_err(|_| "Notch state unavailable")? = Some((px(a.x), px(a.y), px(a.w), px(a.h))); }
    let moving = moving.unwrap_or(false);
    let was = shell.moving.swap(moving, Ordering::Relaxed);
    // Only a change of state cuts the region: entering a move, or settling.
    if moving && was { return Ok(()); }
    if was && !moving { shell.recheck.store(true, Ordering::Relaxed); }
    apply_shapes(&app)
}

/// Click-opened limits panel: stays while read, closes on toggle, its close
/// button or a click outside. Never closed by the hover timeout.
#[tauri::command]
fn set_limits_panel(app: AppHandle, open: bool) -> Result<(),String> {
    app.state::<Shell>().limits.store(open,Ordering::Relaxed);
    if open { app.state::<Shell>().usage_refresh.store(true,Ordering::Relaxed); }
    if !open && !app.state::<Shell>().expanded.load(Ordering::Relaxed) { conceal_notch(&app); }
    Ok(())
}

fn reveal_notch(app: &AppHandle, hold_ms: u32) -> Result<(),String> { reveal(app, hold_ms, false, None) }
/// A new question or permission: the notch opens on it for about 10 s, without focus.
fn alert_notch(app: &AppHandle) -> Result<(),String> { let hold = app.state::<Shell>().prefs.lock().map(|p| p.alert_hold).unwrap_or(10); reveal(app, hold * 1000, true, None) }
/// `page`: the island page to open on (a focus period ending, a reminder); only taken while
/// the island is closed, so a page in use is never taken away.
fn reveal(app: &AppHandle, hold_ms: u32, alert: bool, page: Option<&str>) -> Result<(),String> {
    let win = app.get_webview_window("notch").ok_or("Notch window unavailable")?;
    let shell = app.state::<Shell>();
    if !shell.shown.swap(true,Ordering::Relaxed) { platform::show_passive(&win)?; }
    let inside = platform::cursor().is_some_and(|p| pointer_inside(&shell,p));
    win.emit("notch-reveal",serde_json::json!({"holdMs":hold_ms,"inside":inside,"alert":alert,"page":page})).map_err(|e|e.to_string())
}

/// Only in auto-hide mode does the collapsed notch leave the screen; otherwise
/// it stays as the small capsule.
fn conceal_notch(app: &AppHandle) {
    let shell = app.state::<Shell>();
    if !shell.autohide.load(Ordering::Relaxed) || shell.pinned.load(Ordering::Relaxed) || shell.expanded.load(Ordering::Relaxed) || shell.limits.load(Ordering::Relaxed) { return; }
    if let Some(win) = app.get_webview_window("notch") { let _ = platform::hide(&win); }
    shell.shown.store(false,Ordering::Relaxed);
}

/// The island reports its open state; in auto-hide mode the window leaves the
/// screen once the close animation has run.
#[tauri::command]
fn resize_notch(app: AppHandle, expanded: bool) -> Result<(),String> {
    app.state::<Shell>().expanded.store(expanded,Ordering::Relaxed);
    if !expanded {
        let later = app.clone();
        std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(320)); let app = later.clone(); let _ = later.run_on_main_thread(move || conceal_notch(&app)); });
    }
    Ok(())
}

#[tauri::command]
fn show_notch(app: AppHandle) -> Result<(),String> { reveal_notch(&app,2500) }

/// The island's own records (notes and tasks, the focus timer), kept in the data folder.
#[tauri::command]
fn load_doc(app: AppHandle, name: String) -> Result<serde_json::Value,String> {
    let dir = data_directory(&app).map_err(|e| e.to_string())?;
    docs::load(&dir, &name)
}
/// Saves one of them whole and tells both windows. Reminders are kept by the app itself.
#[tauri::command]
fn save_doc(app: AppHandle, name: String, doc: serde_json::Value) -> Result<(),String> {
    if !matches!(name.as_str(), "notes" | "focus" | "water" | "shelf") { return Err(format!("Bu kayıt buradan yazılmaz: {name}")); }
    let dir = data_directory(&app).map_err(|e| e.to_string())?;
    docs::save(&dir, &name, &doc)?;
    let _ = app.emit("doc", serde_json::json!({"name": name, "doc": doc}));
    Ok(())
}
/// A moment of the island's own (a focus period ending, a reminder due): the notch opens on its
/// page and/or it sounds, as the user chose for that kind; quiet modes and mute are kept.
fn notify_user(app: &AppHandle, kind: &str) -> serde_json::Value {
    let prefs = app.state::<Shell>().prefs.lock().map(|p| p.clone()).unwrap_or_default();
    let (choice, page) = match kind { "focus" => (prefs.notify_focus, "focus"), "reminder" | "reminder-again" => (prefs.notify_reminder, "alarms"), "water" => (prefs.notify_reminder, "water"), _ => return serde_json::json!({"opened": false, "sounded": false, "quiet": null}) };
    let quiet = quiet_now(&prefs);
    // An alarm still ringing only sounds again; the notch was opened when it began.
    let opened = quiet.is_none() && choice.open && kind != "reminder-again";
    if opened { let hold = prefs.alert_hold; let app2 = app.clone(); let _ = app.run_on_main_thread(move || { let _ = reveal(&app2, hold * 1000, false, Some(page)); }); }
    let sounded = quiet.is_none() && choice.sound && !prefs.muted;
    if sounded { platform::chime_kind(prefs.volume, &prefs.sound); }
    serde_json::json!({"opened": opened, "sounded": sounded, "quiet": quiet})
}
#[tauri::command]
fn notify(app: AppHandle, kind: String) -> serde_json::Value { notify_user(&app, &kind) }

/// The reminders, kept by the app (the clock thread rings them).
struct Reminders(Mutex<Vec<reminders::Reminder>>);
/// The status strip's latest values (battery, sound output, weather), as last handed to the notch.
#[derive(Default)]
struct StatusNow(Mutex<status::Status>);
fn save_reminders(app: &AppHandle, list: &[reminders::Reminder]) -> Result<(), String> {
    let dir = data_directory(app).map_err(|e| e.to_string())?;
    docs::save(&dir, "reminders", &serde_json::json!({ "items": list }))?;
    let _ = app.emit("reminders", list);
    Ok(())
}
/// Applies a change to one reminder (or the list) and saves it; a failed save changes nothing.
fn change_reminders(app: &AppHandle, f: impl FnOnce(&mut Vec<reminders::Reminder>) -> Result<(), String>) -> Result<Vec<reminders::Reminder>, String> {
    let state = app.state::<Reminders>();
    let mut list = state.0.lock().map_err(|_| "Hatırlatıcılar kullanılamıyor")?;
    let mut next = list.clone();
    f(&mut next)?;
    save_reminders(app, &next)?;
    *list = next.clone();
    Ok(next)
}
#[tauri::command]
fn reminders(app: AppHandle) -> Vec<reminders::Reminder> { app.state::<Reminders>().0.lock().map(|l| l.clone()).unwrap_or_default() }
#[derive(serde::Deserialize)]
struct ReminderInput { id: Option<String>, title: String, at: String, repeat: String, enabled: bool, #[serde(default)] kind: Option<String>, #[serde(default)] ends: Option<u64>, #[serde(default)] left: Option<u64>, #[serde(default)] total: Option<u64> }
/// A new reminder or a change to one (title, time, repeat, on/off): checked, its next time worked out.
#[tauri::command]
fn save_reminder(app: AppHandle, reminder: ReminderInput) -> Result<Vec<reminders::Reminder>, String> {
    change_reminders(&app, |list| {
        let now = relay::now();
        let r = reminders::Reminder { id: reminder.id.clone().unwrap_or_default(), title: reminder.title, at: reminder.at, repeat: reminder.repeat, enabled: reminder.enabled, kind: reminder.kind.clone().unwrap_or_else(|| "reminder".into()), ends: reminder.ends, left: reminder.left, total: reminder.total, ..Default::default() };
        let r = if r.enabled { reminders::checked(r, now, &reminders::local_to_ms)? } else {
            // Turned off: kept as set, nothing due.
            if reminders::parse(&r.at).is_none() { return Err("Tarih ve saat geçerli değil.".into()); }
            reminders::Reminder { id: if r.id.is_empty() { format!("r{now}") } else { r.id.clone() }, due: 0, snoozed: None, ringing: false, missed: false, ends: None, kind: if matches!(r.kind.as_str(), "reminder" | "alarm" | "countdown" | "todo") { r.kind.clone() } else { "reminder".into() }, ..r }
        };
        match list.iter_mut().find(|x| x.id == r.id) { Some(old) => *old = r, None => { if list.len() >= reminders::MAX_REMINDERS { return Err("En çok 200 hatırlatıcı tutulur.".into()); } list.push(r) } }
        Ok(())
    })
}
#[tauri::command]
fn delete_reminder(app: AppHandle, id: String) -> Result<Vec<reminders::Reminder>, String> { change_reminders(&app, |list| { list.retain(|r| r.id != id); Ok(()) }) }
#[tauri::command]
fn snooze_reminder(app: AppHandle, id: String, minutes: u32) -> Result<Vec<reminders::Reminder>, String> { change_reminders(&app, |list| { if let Some(r) = list.iter_mut().find(|r| r.id == id) { reminders::snooze(r, relay::now(), minutes); } Ok(()) }) }
#[tauri::command]
fn dismiss_reminder(app: AppHandle, id: String) -> Result<Vec<reminders::Reminder>, String> { change_reminders(&app, |list| { if let Some(r) = list.iter_mut().find(|r| r.id == id) { reminders::dismiss(r); } Ok(()) }) }

/// The file shelf (shelf.rs): what each kept path is now; open, show in its folder, drag out.
#[tauri::command]
fn shelf_info(paths: Vec<String>) -> Vec<shelf::FileInfo> { paths.iter().take(200).map(|p| shelf::info(p)).collect() }
#[tauri::command]
fn shelf_open(path: String) -> Result<(), String> { shelf::open(&path) }
#[tauri::command]
fn shelf_reveal(path: String) -> Result<(), String> { shelf::reveal(&path) }
/// Runs on the main (OLE) thread: a command without async does.
#[tauri::command]
fn shelf_drag(paths: Vec<String>) -> Result<bool, String> { shelf::drag_out(&paths) }
/// Windows' "open with" window for a shelved file (when its default app cannot open it).
#[tauri::command]
async fn shelf_open_with(app: AppHandle, path: String) -> Result<(), String> {
    let owner = app.get_webview_window("notch").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    tauri::async_runtime::spawn_blocking(move || shelf::open_with(owner.map(|h| windows::Win32::Foundation::HWND(h as *mut _)), &path)).await.map_err(|e| e.to_string())?
}
/// Files picked in Windows' own dialog to put on the shelf (the island's "Dosya seç").
#[tauri::command]
async fn shelf_pick(app: AppHandle) -> Result<Vec<String>, String> {
    let owner = app.get_webview_window("notch").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    let title = if app.state::<Shell>().prefs.lock().map(|p| p.language == "en").unwrap_or(false) { "Add files to the shelf" } else { "Rafa dosya ekle" };
    tauri::async_runtime::spawn_blocking(move || shelf::pick(owner.map(|h| windows::Win32::Foundation::HWND(h as *mut _)), title)).await.map_err(|e| e.to_string())?
}
/// The system signs this computer can tell (indicators.rs).
#[tauri::command]
fn indicators_supported() -> Vec<&'static str> { indicators::supported() }
/// The status strip's values now (the notch asks once when it starts; changes come as "notch-status").
#[tauri::command]
fn get_status(app: AppHandle) -> status::Status { app.state::<StatusNow>().0.lock().map(|s| s.clone()).unwrap_or_default() }
/// The settings' city picker: places for what the user typed, named in the app's language. Only
/// asked while the user types there (two letters or more); "offline" when the service is not reached.
#[tauri::command]
async fn search_places(app: AppHandle, query: String) -> Result<Vec<settings::WeatherPlace>, String> {
    let language = app.state::<Shell>().prefs.lock().map(|p| i18n::resolve(&p.language).to_owned()).unwrap_or_else(|_| "en".into());
    if query.trim().chars().count() < 2 { return Ok(vec![]); }
    let query: String = query.trim().chars().take(80).collect();
    tauri::async_runtime::spawn_blocking(move || status::search(&query, &language)).await.map_err(|e| e.to_string())?.map(|found| found.into_iter().map(|(p, _)| p).collect()).map_err(|_| "offline".into())
}

/// What plays on the computer now (Windows' media sessions).
#[tauri::command]
fn media_sessions() -> Vec<media::MediaSession> { media::sessions() }
/// A control the user clicked, sent to that session; only the ones the app offers are offered.
#[tauri::command]
fn media_control(id: String, action: String) -> bool {
    let c = match action.as_str() { "play" => media::Control::Play, "pause" => media::Control::Pause, "toggle" => media::Control::Toggle, "next" => media::Control::Next, "prev" => media::Control::Prev, "stop" => media::Control::Stop, _ => return false };
    media::control(id, c)
}
#[tauri::command]
fn media_seek(id: String, position_ms: u64) -> bool { media::control(id, media::Control::Seek(position_ms)) }

/// A song's lyrics: from what is kept on this computer, else (only if the user allowed it) from
/// LRCLIB, then kept. "off": not allowed; "error": the service could not be reached now.
#[tauri::command]
async fn lyrics(app: AppHandle, title: String, artist: String, album: String, duration_ms: u64) -> Result<lyrics::Lyrics, String> {
    let allowed = app.state::<Shell>().prefs.lock().map(|p| p.lyrics_online).unwrap_or(false);
    let file = data_directory(&app).map_err(|e| e.to_string())?.join("lyrics.json");
    let duration_s = (duration_ms + 500) / 1000;
    let key = lyrics::key(&title, &artist, &album, duration_s);
    let now = relay::now();
    let mut kept: std::collections::BTreeMap<String, lyrics::Lyrics> = std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    if let Some(found) = kept.get(&key) { if found.status != "none" || now.saturating_sub(found.at) < 24 * 3600 * 1000 { return Ok(found.clone()); } }
    if !allowed { return Ok(lyrics::Lyrics { status: "off".into(), lines: vec![], plain: String::new(), at: now }); }
    if title.trim().is_empty() || artist.trim().is_empty() { return Ok(lyrics::Lyrics { status: "none".into(), lines: vec![], plain: String::new(), at: now }); }
    let fetched = tauri::async_runtime::spawn_blocking(move || lyrics::fetch(&title, &artist, &album, duration_s, now)).await.map_err(|e| e.to_string())?;
    let Some(found) = fetched else { return Ok(lyrics::Lyrics { status: "error".into(), lines: vec![], plain: String::new(), at: now }) };
    kept.insert(key, found.clone());
    // At most 400 songs kept, the oldest asked go first.
    while kept.len() > 400 { if let Some(oldest) = kept.iter().min_by_key(|(_, v)| v.at).map(|(k, _)| k.clone()) { kept.remove(&oldest); } else { break; } }
    let _ = std::fs::write(&file, serde_json::to_string(&kept).unwrap_or_default());
    Ok(found)
}

#[tauri::command]
fn set_notch_pinned(app: AppHandle, pinned: bool) -> Result<(),String> {
    app.state::<Shell>().pinned.store(pinned,Ordering::Relaxed);
    if let Some(item) = app.try_state::<PinItem>() { let _ = item.0.set_checked(pinned); }
    app.emit_to("notch","notch-pinned",pinned).map_err(|e|e.to_string())?;
    if pinned { reveal_notch(&app,0) } else { Ok(()) }
}

/// Writes the notch settings, keeping keys this build does not manage (such
/// as `claudeUsageFiles`).
fn save_settings(shell: &Shell) -> Result<(),String> {
    if let Some(path) = shell.settings.lock().map_err(|_| "Settings unavailable")?.clone() {
        let mut value = std::fs::read_to_string(&path).ok().and_then(|t|serde_json::from_str::<serde_json::Value>(&t).ok()).filter(|v|v.is_object()).unwrap_or_else(||serde_json::json!({}));
        value["notchAutoHide"] = shell.autohide.load(Ordering::Relaxed).into();
        value["notchInScreenshots"] = shell.capturable.load(Ordering::Relaxed).into();
        value["notchAlerts"] = shell.alerts.load(Ordering::Relaxed).into();
        value["muted"] = shell.muted.load(Ordering::Relaxed).into();
        if let Ok(prefs) = shell.prefs.lock() { value["settings"] = serde_json::to_value(&*prefs).map_err(|e| e.to_string())?; }
        if let Some(bounds) = shell.office_window.lock().ok().and_then(|b| b.clone()) { value["officeWindow"] = bounds; }
        std::fs::write(path, value.to_string()).map_err(|e|e.to_string())?;
    }
    Ok(())
}

/// Usage files a Claude agent keeps up to date: AgentOffice's own
/// (%LOCALAPPDATA%\AgentOffice\claude-usage.json) plus any listed in the
/// notch settings under `claudeUsageFiles`.
fn usage_files(shell: &Shell) -> Vec<std::path::PathBuf> {
    let mut files: Vec<std::path::PathBuf> = std::env::var_os("LOCALAPPDATA").map(|d|std::path::PathBuf::from(d).join("AgentOffice").join("claude-usage.json")).into_iter().collect();
    if let Some(path) = shell.settings.lock().ok().and_then(|s|s.clone()) {
        let saved = std::fs::read_to_string(path).ok().and_then(|t|serde_json::from_str::<serde_json::Value>(&t).ok());
        files.extend(saved.as_ref().and_then(|v|v["claudeUsageFiles"].as_array()).into_iter().flatten().filter_map(|p|p.as_str()).map(std::path::PathBuf::from));
    }
    files
}

/// The user's own name for a session (empty clears it); kept across restarts.
/// The offices' managers as the user chose them (office key → chat; an office left out has none).
#[tauri::command]
fn set_office_managers(app: AppHandle, managers: std::collections::BTreeMap<String,String>) -> Result<(),String> {
    let store=app.state::<Mutex<Store>>(); let mut store=store.lock().map_err(|_|"Store unavailable")?;
    // The demo office's people are not the user's: choosing among them never reaches real offices.
    if store.demo_on() { return Err("demo".into()); }
    if store.set_managers(managers) { save_office_state(&app,&store); let _=app.emit("snapshot",store.snapshot()); }
    Ok(())
}

/// The user's own choices (an office's name, its manager) are kept at once, not at the next
/// periodic save: the app may be closed right after (through a temporary file, never half written).
fn save_office_state(app: &AppHandle, store: &Store) {
    let Some((state_path,_))=app.state::<Shell>().office_paths.lock().ok().and_then(|p|p.clone()) else { return };
    let Ok(text)=serde_json::to_string(&store.live_snapshot()) else { return };
    let tmp=state_path.with_extension("json.tmp");
    if std::fs::write(&tmp,text).is_ok() { let _=std::fs::rename(&tmp,&state_path); }
}

/// The name the user gives an office (None: its folder's name again).
#[tauri::command]
fn set_office_name(app: AppHandle, office: String, name: Option<String>) -> Result<(),String> {
    let store=app.state::<Mutex<Store>>(); let mut store=store.lock().map_err(|_|"Store unavailable")?;
    if store.demo_on() { return Err("demo".into()); }
    if store.set_office_name(office,name) { save_office_state(&app,&store); let _=app.emit("snapshot",store.snapshot()); }
    Ok(())
}

#[tauri::command]
fn rename_session(app: AppHandle, session_id: String, name: Option<String>) -> Result<(),String> {
    let store=app.state::<Mutex<Store>>(); let mut store=store.lock().map_err(|_|"Store unavailable")?;
    if store.demo_on() { return Err("demo".into()); }
    store.rename(&session_id,name);
    if let Some((_,names_path))=app.state::<Shell>().office_paths.lock().ok().and_then(|p|p.clone()) {
        std::fs::write(names_path,serde_json::to_string(store.names()).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    }
    let _=app.emit("snapshot",store.snapshot()); Ok(())
}

/// Opens the chat in its own tool, only when the user clicks, as its provider says: the chat
/// itself by its link (a Claude desktop chat, a Codex thread; a helper opens the chat it works
/// for), else the tool's window to the front. A chat no longer in the office is found by its line
/// on the work board. Returns false when there is no way to it.
fn source_open(store: &Store, session_id: &str) -> Option<providers::Open> {
    let snap = store.live_snapshot();
    let s = snap.sessions.iter().find(|s| s.key.session_id == session_id);
    let owner = s.and_then(|s| s.parent_key.as_ref()).and_then(|p| snap.sessions.iter().find(|m| &m.key == p)).or(s).cloned()
        .or_else(|| store.log_entries().into_iter().rev().find(|e| e.session_id == session_id).map(|e| domain::Session { key: domain::SessionKey { provider: e.provider.clone(), host_id: String::new(), session_id: e.session_id.clone() }, link: e.link.clone(), ..Default::default() }))?;
    providers::get(&owner.key.provider)?.opener(&owner)
}
#[tauri::command]
fn open_in_source(app: AppHandle, session_id: String) -> Result<bool,String> {
    let open = { let store = app.state::<Mutex<Store>>(); let store = store.lock().map_err(|_|"Store unavailable")?; source_open(&store, &session_id) };
    match open {
        Some(providers::Open::Exact { link, exe }) => {
            let timing=app.state::<Shell>().settings.lock().ok().and_then(|p|p.clone()).map(|p|p.with_file_name("open-timing.log"));
            platform::open_link(&link,exe,timing);
            Ok(true)
        }
        Some(providers::Open::App { exes }) => Ok(platform::bring_to_front(exes)),
        None => Ok(false),
    }
}

#[tauri::command]
fn notch_in_screenshots(app: AppHandle) -> bool { app.state::<Shell>().capturable.load(Ordering::Relaxed) }

/// User choice: let screenshots and recordings see the notch. Captures cannot
/// then leave the notch out, so the live glass stops (the backdrop sampler
/// idles and the body falls back to its dark gloss).
/// The office's sound setting, mirrored here so the tray and the shortcut
/// toggle the same value.
#[tauri::command]
fn set_muted(app: AppHandle, muted: bool) { let _ = apply_settings(&app, &serde_json::json!({"muted": muted})); }
fn toggle_mute(app: &AppHandle) {
    let value = !app.state::<Shell>().muted.load(Ordering::Relaxed);
    set_muted(app.clone(), value);
    let _ = app.emit("sound-muted",value);
}
/// Which global shortcuts this app holds: [open the notch, mute].
#[tauri::command]
fn shortcuts() -> Vec<bool> { let held = platform::SHORTCUTS.load(Ordering::Relaxed); vec![held & 1 != 0, held & 2 != 0] }

#[tauri::command]
fn set_notch_in_screenshots(app: AppHandle, enabled: bool) -> Result<(),String> { apply_settings(&app, &serde_json::json!({"capturable": enabled})).map(|_| ()) }

#[tauri::command]
fn notch_autohide(app: AppHandle) -> bool { app.state::<Shell>().autohide.load(Ordering::Relaxed) }

/// User choice: hide the collapsed notch completely (revealed from the top edge).
#[tauri::command]
fn set_notch_autohide(app: AppHandle, enabled: bool) -> Result<(),String> {
    let d = settings::Settings::default();
    let (desktop, apps, browsers) = if enabled { ("hidden", "hidden", "hidden") } else { (d.rest_desktop.as_str(), d.rest_apps.as_str(), d.rest_browsers.as_str()) };
    apply_settings(&app, &serde_json::json!({"restDesktop": desktop, "restApps": apps, "restBrowsers": browsers})).map(|_| ())
}

/// Saved office bounds `{x,y,w,h,maximized}` (physical) if at least a good part of the window
/// would be on one of these screens (x, y, width, height).
fn office_bounds(saved: &serde_json::Value, monitors: &[(i32,i32,i32,i32)]) -> Option<(i32,i32,u32,u32,bool)> {
    let n = |k: &str| saved.get(k).and_then(|v| v.as_i64());
    let (x, y, w, h) = (n("x")? as i32, n("y")? as i32, n("w")?, n("h")?);
    if !(400..=20000).contains(&w) || !(300..=20000).contains(&h) { return None; }
    let (w, h) = (w as i32, h as i32);
    let visible = monitors.iter().any(|&(mx, my, mw, mh)| (x + w).min(mx + mw) - x.max(mx) >= 200.min(w) && (y + h).min(my + mh) - y.max(my) >= 120.min(h) && y >= my - 8 && y < my + mh - 40);
    visible.then_some((x, y, w as u32, h as u32, saved.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false)))
}
/// Remembers where the office window is (its normal bounds, and whether it is maximized).
fn remember_office(app: &AppHandle, win: &tauri::WebviewWindow) {
    if win.is_minimized().unwrap_or(false) || !win.is_visible().unwrap_or(false) { return; }
    let shell = app.state::<Shell>();
    let Ok(mut saved) = shell.office_window.lock() else { return };
    let maximized = win.is_maximized().unwrap_or(false);
    let mut value = saved.clone().unwrap_or_else(|| serde_json::json!({}));
    if !maximized {
        let (Ok(p), Ok(s)) = (win.outer_position(), win.inner_size()) else { return };
        if s.width < 100 || s.height < 100 { return; }
        value = serde_json::json!({"x": p.x, "y": p.y, "w": s.width, "h": s.height});
    }
    value["maximized"] = maximized.into();
    if saved.as_ref() != Some(&value) { *saved = Some(value); shell.office_dirty.store(true, Ordering::Relaxed); }
}

fn data_directory(app: &AppHandle) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    if let Some(root)=std::env::var_os("AGENTOFFICE_DATA_DIR") {
        let path=std::path::PathBuf::from(root).join("webview");
        std::fs::create_dir_all(&path)?;
        return Ok(path);
    }
    #[cfg(debug_assertions)]
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local-data/webview");
    // The Store package keeps its own (in its private copy of AppData): the classic install's data,
    // if both are installed, is neither read nor changed by it.
    #[cfg(not(debug_assertions))]
    let path = app.path().app_local_data_dir()?.join(if package::packaged() { "store" } else { "webview" });
    let _ = app;
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// WebView2 draws the app's windows. The classic installer puts it in place; from the Store (or
/// when it was removed since) it may be missing: then the user is told, in Turkish and English, and
/// Microsoft's own download opens if they agree. Nothing is downloaded or run by the app itself.
#[cfg(windows)]
fn webview2_ready() -> bool {
    use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
    let mut version = windows::core::PWSTR::null();
    let ok = unsafe { GetAvailableCoreWebView2BrowserVersionString(windows::core::PCWSTR::null(), &mut version) }.is_ok() && !version.is_null();
    if !version.is_null() { unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(version.0 as _)); } }
    ok
}
#[cfg(windows)]
fn tell_webview2_missing() {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONINFORMATION, MB_YESNO}};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let text = wide("AgentOffice, Microsoft Edge WebView2 Çalışma Zamanı'na ihtiyaç duyuyor ve bu bilgisayarda bulunamadı.\nMicrosoft'un indirme sayfası açılsın mı? Kurduktan sonra AgentOffice'i yeniden aç.\n\nAgentOffice needs the Microsoft Edge WebView2 Runtime, which is not on this computer.\nOpen Microsoft's download? After installing it, open AgentOffice again.");
    let title = wide("AgentOffice");
    if unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_YESNO | MB_ICONINFORMATION) } == IDYES {
        let (open, url) = (wide("open"), wide("https://go.microsoft.com/fwlink/p/?LinkId=2124703"));
        unsafe { ShellExecuteW(std::ptr::null_mut(), open.as_ptr(), url.as_ptr(), std::ptr::null(), std::ptr::null(), 1); }
    }
}

pub fn run() {
    #[cfg(windows)]
    if !webview2_ready() { tell_webview2_missing(); return; }
    // One AgentOffice per user; a test copy with its own pipe name (AGENTOFFICE_PIPE_SUFFIX) runs beside it.
    let builder = tauri::Builder::default();
    let builder = if std::env::var_os("AGENTOFFICE_PIPE_SUFFIX").is_some_and(|s| !s.is_empty()) { builder } else { builder.plugin(tauri_plugin_single_instance::init(|app,_args,_cwd| { let _=open_office(app.clone(),None); })) };
    builder
        .manage(Mutex::new(Store::new()))
        .manage(Arc::new(backdrop::Backdrop::default()))
        // backdrop://frame?after=N -> the next desktop frame behind the notch (BMP),
        // or 204 when none is newer within the wait. Served off the UI thread.
        .register_asynchronous_uri_scheme_protocol("backdrop", |ctx, request, responder| {
            let after: u64 = request.uri().query().and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("after="))).and_then(|v| v.parse().ok()).unwrap_or(0);
            let frames = ctx.app_handle().state::<Arc<backdrop::Backdrop>>().inner().clone();
            std::thread::spawn(move || {
                let cors = |b: tauri::http::response::Builder| b.header("Access-Control-Allow-Origin", "*").header("Access-Control-Expose-Headers", "X-Seq, X-Rect, X-Idle").header("Cache-Control", "no-store");
                match frames.wait_after(after, std::time::Duration::from_millis(250)) {
                    Some((seq, (x, y, w, h), bmp)) => responder.respond(cors(tauri::http::Response::builder().status(200)).header("Content-Type", "image/bmp").header("X-Seq", seq.to_string()).header("X-Rect", format!("{x},{y},{w},{h}")).body(bmp).unwrap()),
                    // X-Idle: 1 = no backdrop at all (thin line / hidden), 0 = nothing newer yet.
                    None => { let idle = frames.is_idle(); responder.respond(cors(tauri::http::Response::builder().status(204)).header("X-Idle", if idle { "1" } else { "0" }).body(Vec::new()).unwrap()) }
                }
            });
        })
        .manage(Asks::default())
        .manage(StatusNow::default())
        .manage(Shell{expanded:AtomicBool::new(false),pinned:AtomicBool::new(false),limits:AtomicBool::new(false),shown:AtomicBool::new(false),muted:AtomicBool::new(true),autohide:AtomicBool::new(false),capturable:AtomicBool::new(false),usage_refresh:AtomicBool::new(true),office_paths:Mutex::new(None),bounds:Mutex::new(None),island:Mutex::new(None),shapes:Mutex::new(vec![]),glass:AtomicBool::new(true),moving:AtomicBool::new(false),area:Mutex::new(None),recheck:AtomicBool::new(false),settings:Mutex::new(None),dock:Mutex::new(None),redock:AtomicBool::new(true),drag:Mutex::new(None),alerts:AtomicBool::new(true),prefs:Mutex::new(settings::Settings::default()),office_window:Mutex::new(None),office_dirty:AtomicBool::new(false),log_path:Mutex::new(None),log_appended:std::sync::atomic::AtomicUsize::new(0)})
        .invoke_handler(tauri::generate_handler![get_snapshot,set_demo,answer_request,release_request,open_office,office_visible,resize_notch,show_notch,set_notch_pinned,set_limits_panel,notch_shape,notch_autohide,set_notch_autohide,notch_in_screenshots,set_notch_in_screenshots,notch_move,rename_session,open_in_source,claude_hooks_status,set_claude_hooks,tools_state,connect_hooks,disconnect_hooks,connect_tools,get_autostart,set_autostart,set_muted,shortcuts,set_office_managers,set_office_name,get_work_log,notify_prefs,set_notch_alerts,get_settings,set_settings,play_chime,list_monitors,open_settings,load_doc,save_doc,notify,media_sessions,media_control,media_seek,lyrics,shelf_info,shelf_open,shelf_reveal,shelf_drag,shelf_pick,shelf_open_with,indicators_supported,get_status,search_places,reminders,save_reminder,delete_reminder,snooze_reminder,dismiss_reminder])
        .setup(|app| {
            let handle=app.handle();
            let data=data_directory(handle)?;
            // The office survives restarts: sessions come back unverified until live
            // evidence arrives; names the user gave are kept in their own file.
            let (state_path,names_path)=(data.join("office-state.json"),data.join("session-names.json"));
            {
                let store=handle.state::<Mutex<Store>>(); let mut store=store.lock().unwrap();
                if let Some(snap)=std::fs::read_to_string(&state_path).ok().and_then(|t|serde_json::from_str::<domain::Snapshot>(&t).ok()) { *store=Store::restore(snap); }
                // How each provider's chats open from the office (exactly, their app, or no button).
                for p in providers::all() { store.set_open_rule(p.id(),p.open_rule()); }
                if let Some(names)=std::fs::read_to_string(&names_path).ok().and_then(|t|serde_json::from_str::<std::collections::HashMap<String,String>>(&t).ok()) { store.set_names(names); }
                if std::env::args().any(|s|s=="--demo") { store.set_demo(true); }
            }
            *handle.state::<Shell>().office_paths.lock().unwrap()=Some((state_path.clone(),names_path));
            // The work board survives restarts; old lines (past 30 days or 5000) are dropped here.
            { let log_path=data.join("work-log.jsonl"); let store=handle.state::<Mutex<Store>>(); let mut store=store.lock().unwrap();
              store.load_log(read_log(&log_path),relay::now()); rewrite_log(&log_path,&store.log_entries());
              *handle.state::<Shell>().log_path.lock().unwrap()=Some(log_path); }
            let settings_path=data.join("notch.json");
            let saved=std::fs::read_to_string(&settings_path).ok().and_then(|t|serde_json::from_str::<serde_json::Value>(&t).ok()).unwrap_or_default();
            let prefs=settings::Settings::from_file(&saved);
            // An updated app puts its helper in the lasting place (only when connected there already).
            std::thread::spawn(setup::refresh_helper_if_connected);
            // An entry left by a moved install starts this program again (none is made here).
            std::thread::spawn(setup::repoint_autostart);
            let autohide=[&prefs.rest_desktop,&prefs.rest_apps,&prefs.rest_browsers].iter().all(|v|v.as_str()=="hidden");
            let capturable=prefs.capturable;
            { let shell=handle.state::<Shell>(); shell.autohide.store(autohide,Ordering::Relaxed); shell.capturable.store(capturable,Ordering::Relaxed); shell.glass.store(prefs.island_theme=="glass",Ordering::Relaxed); *shell.settings.lock().unwrap()=Some(settings_path);
              shell.alerts.store(prefs.notify_request.open,Ordering::Relaxed); shell.muted.store(prefs.muted,Ordering::Relaxed); shell.pinned.store(false,Ordering::Relaxed);
              *shell.prefs.lock().unwrap()=prefs.clone();
              *shell.office_window.lock().unwrap()=Some(saved["officeWindow"].clone()).filter(|v|v.is_object()); }
            { let media_live=handle.clone(); media::watch(move|sessions| { let _=media_live.emit("media",sessions); }); }
            // The system signs the user turned on, shown briefly on the closed island.
            { let wanted=handle.clone(); let shown=handle.clone();
              indicators::watch(move|| wanted.state::<Shell>().prefs.lock().map(|p|{ let mut list=p.indicators.clone(); if p.status_battery&&!p.hide_mascot&&!list.iter().any(|k|k=="battery") { list.push("battery".into()); } list }).unwrap_or_default(), move|sign| { let _=shown.emit_to("notch","notch-indicator",sign); }); }
            { let wanted=handle.clone(); let shown=handle.clone();
              status::watch(move|| wanted.state::<Shell>().prefs.lock().map(|p| status::Wanted { battery: p.status_battery, audio: p.status_audio, weather: if p.status_weather { p.weather_place.clone() } else { None } }).unwrap_or_default(),
                move|now| { if let Ok(mut s)=shown.state::<StatusNow>().0.lock() { *s=now.clone(); } let _=shown.emit("notch-status",now); }); }
            // A city typed before the picker (weather on): looked up once, quietly; kept as a place when
            // that is clear, else left for the user to pick in the settings. Offline: tried again later.
            { let app=handle.clone(); std::thread::spawn(move|| for _ in 0..48 {
                let Some((city, language)) = app.state::<Shell>().prefs.lock().ok().filter(|p| p.status_weather && p.weather_place.is_none() && !p.weather_city.is_empty()).map(|p| (p.weather_city.clone(), i18n::resolve(&p.language).to_owned())) else { return };
                match status::search(&city, &language) {
                    Ok(found) => { if let Some(place) = status::resolve_typed(&city, &found, || status::search(&city, "en").ok()) { let _ = apply_settings(&app, &serde_json::json!({ "weatherPlace": place, "weatherCity": "" })); } return; }
                    Err(()) => std::thread::sleep(std::time::Duration::from_secs(300)),
                }
            }); }
            // Reminders: read once, then the clock looks every second at the wall clock. What came
            // due is saved before it rings, so an occurrence never rings twice.
            { let saved=docs::load(&data,"reminders").ok().and_then(|v| serde_json::from_value::<Vec<reminders::Reminder>>(v["items"].clone()).ok()).unwrap_or_default();
              app.manage(Reminders(Mutex::new(saved)));
              let clock=handle.clone(); let (mut ringing_since,mut last_sound)=(None::<u64>,0u64); std::thread::spawn(move|| loop {
                std::thread::sleep(std::time::Duration::from_millis(1000));
                let now=relay::now();
                let mut rings=0;
                let changed=change_reminders(&clock,|list| {
                    let before=list.clone();
                    for r in list.iter_mut() { if reminders::advance(r,now,&reminders::local_to_ms)==reminders::Due::Ring { rings+=1; } }
                    if *list==before { Err(String::new()) } else { Ok(()) }
                });
                if changed.is_ok() && rings>0 { notify_user(&clock,"reminder"); ringing_since=Some(now); last_sound=now; }
                // An alarm or a finished countdown keeps sounding until snoozed or dismissed, for a while.
                let loud=clock.state::<Reminders>().0.lock().map(|l| l.iter().any(|r| r.ringing && matches!(r.kind.as_str(),"alarm"|"countdown"))).unwrap_or(false);
                if !loud { ringing_since=None; }
                else if let Some(since)=ringing_since { if now-since<reminders::RING_FOR_MS && now-last_sound>=reminders::RING_EVERY_MS { last_sound=now; notify_user(&clock,"reminder-again"); } }
              }); }
            let codex_live=handle.clone();
            codex::watch(move|events,limits|{
                let store=codex_live.state::<Mutex<Store>>();let Ok(mut store)=store.lock() else {return};
                if !events.is_empty(){store.mark_connected("codex","Codex oturum kayıtları okunuyor");}
                for event in events {store.ingest(event);}
                if let Some(limits)=limits {store.set_limits(limits);}
                after_events(&codex_live,&mut store);
                let _=codex_live.emit("snapshot",store.snapshot());
            });
            // Live Claude limits: every 3 minutes, and at once when the Limits panel
            // opens. A failed read keeps the last reading (still valid until its
            // windows reset); without any reading the card says why.
            { let usage=handle.clone(); let mut codex_at=0u64; std::thread::spawn(move|| loop {
                let shell=usage.state::<Shell>();
                if shell.usage_refresh.swap(false,Ordering::Relaxed) {
                    let at=relay::now();
                    let mut reading=claude_usage::read(at);
                    // A usage file kept by a Claude agent (the desktop app's own
                    // usage tool), when it is newer than what the service gave.
                    let from_files=usage_files(&shell).iter().filter_map(|f|claude_usage::from_file(f)).max_by_key(|l|l.updated_at);
                    if let Some(file_limits)=from_files {
                        let newer=match &reading { claude_usage::Reading::Limits(l)=>file_limits.updated_at>l.updated_at, _=>true };
                        if newer { reading=claude_usage::Reading::Limits(file_limits); }
                    }
                    let store=usage.state::<Mutex<Store>>();
                    if let Ok(mut store)=store.lock() {
                        let has=store.snapshot().limits.iter().any(|l|l.provider=="claude"&&!l.windows.is_empty());
                        let changed=match reading {
                            claude_usage::Reading::Limits(limits)=>store.set_limits(limits),
                            claude_usage::Reading::NeedsLogin if !has=>store.set_limits(domain::ProviderLimits{provider:"claude".into(),plan:None,windows:vec![],updated_at:at,source:String::new(),credits:None,resets_available:None,note:Some("Claude limitleri için bir kaynak bulunamadı: terminaldeki Claude Code girişi ya da bir Claude ajanının yazdığı kullanım kaydı.".into())}),
                            _=>false,
                        };
                        if changed {let _=usage.emit("snapshot",store.snapshot());}
                    }
                    // Codex: every 3 minutes, or when the panel is open and the
                    // last read is older than 20 s (its app server takes a moment).
                    if at.saturating_sub(codex_at)>170_000 || (shell.limits.load(Ordering::Relaxed) && at.saturating_sub(codex_at)>20_000) {
                        codex_at=at;
                        if let Some(limits)=codex_usage::read(at) {
                            let store=usage.state::<Mutex<Store>>();
                            if let Ok(mut store)=store.lock() { if store.set_limits(limits) {let _=usage.emit("snapshot",store.snapshot());} };
                        }
                    }
                    for _ in 0..60 { if shell.usage_refresh.load(Ordering::Relaxed) {break;} std::thread::sleep(std::time::Duration::from_secs(1)); }
                    shell.usage_refresh.store(true,Ordering::Relaxed);
                } else { std::thread::sleep(std::time::Duration::from_secs(1)); }
            }); }
            // Claude chats: those already open at start come from their transcripts;
            // every 15 s the desktop app's chat files give real titles, the link to
            // each chat and archive state; stale sessions are pruned and the office
            // state is saved when it changed.
            let transcripts=std::sync::Arc::new(Mutex::new(claude_meta::Transcripts::default()));
            { let meta=handle.clone(); let transcripts=transcripts.clone(); let state_path=state_path.clone(); std::thread::spawn(move|| {
                let host=relay::host_id(); let mut first=true; let mut saved=0u64;
                loop {
                    let at=relay::now();
                    if first {
                        // Recent chats, and every chat restored from the saved office however old:
                        // an answered one is idle, not of unknown state.
                        let mut paths=claude_meta::recent_transcripts(domain::OFFICE_DAYS*24);
                        let chats=claude_meta::desktop_chats();
                        let restored:Vec<String>=meta.state::<Mutex<Store>>().lock().map(|s|s.live_snapshot().sessions.iter().filter(|s|s.key.provider=="claude"&&s.parent_key.is_none()&&!s.verified).map(|s|s.key.session_id.clone()).collect()).unwrap_or_default();
                        for id in restored { if let Some(p)=claude_meta::transcript_of(&id) { if !paths.contains(&p) { paths.push(p); } } }
                        for path in paths {
                            let Some(info)=transcripts.lock().ok().and_then(|mut t|t.read(&path).cloned()) else {continue};
                            if info.ending==claude_meta::Ending::Unknown||info.session_id.is_empty() {continue;}
                            // Untitled runs that are not chats in the Claude app (tool or test runs) stay out.
                            if info.title.is_none()&&!chats.contains_key(&info.session_id) {continue;}
                            let key=domain::SessionKey{provider:"claude".into(),host_id:host.clone(),session_id:info.session_id.clone()};
                            if let Ok(mut store)=meta.state::<Mutex<Store>>().lock() { store.seed(key,info.cwd.clone(),info.title.clone(),info.reply.clone(),info.ending==claude_meta::Ending::Answered,info.last_at,at); store.set_root(&info.session_id,claude_meta::root_of(&path,info.cwd.as_deref()),false); }
                        }
                    }
                    // Every chat the apps list is in the office, however quiet: Claude's desktop
                    // chats (one not seen yet starts from its transcript, else from the app's own
                    // record) and the threads filed under a Codex project (idle until their
                    // rollout says otherwise). A Codex thread outside any project sits in
                    // "Sohbetler" while it is recent.
                    let chats=claude_meta::desktop_chats();
                    let listed:std::collections::HashSet<String>=chats.iter().filter(|(_,c)|!c.archived).map(|(id,_)|id.clone()).collect();
                    let claude_key=|id:&str|domain::SessionKey{provider:"claude".into(),host_id:host.clone(),session_id:id.to_owned()};
                    let unseen:Vec<String>=meta.state::<Mutex<Store>>().lock().map(|s|listed.iter().filter(|id|!s.knows(&claude_key(id))).cloned().collect()).unwrap_or_default();
                    let seeds:Vec<(String,Option<claude_meta::Transcript>)>=unseen.into_iter().map(|id|{let info=claude_meta::transcript_of(&id).and_then(|p|transcripts.lock().ok().and_then(|mut t|t.read(&p).cloned())).filter(|i|i.ending!=claude_meta::Ending::Unknown);(id,info)}).collect();
                    let codex_threads=codex::app_threads();
                    // A Claude chat counted as working whose own transcript says its reply ended, with
                    // nothing after it for 20 s, is not working (as the user's own office reads it): a
                    // reply event lost or delivered out of order cannot keep it working. A tool still
                    // running or a prompt waiting leaves the transcript open, so those stay.
                    let working:Vec<(String,u64)>=meta.state::<Mutex<Store>>().lock().map(|s|s.live_snapshot().sessions.iter().filter(|s|s.key.provider=="claude"&&s.parent_key.is_none()&&s.status==domain::SessionStatus::Working).map(|s|(s.key.session_id.clone(),s.last_activity)).collect()).unwrap_or_default();
                    let settled:Vec<(String,u64)>=working.into_iter().filter_map(|(id,last)|{
                        let info=claude_meta::transcript_of(&id).and_then(|p|transcripts.lock().ok().and_then(|mut t|t.read(&p).cloned()))?;
                        (info.ending==claude_meta::Ending::Answered&&at.saturating_sub(info.last_at)>=20_000&&last<=info.last_at+20_000).then_some((id,info.last_at))
                    }).collect();
                    // A question still waiting in a chat's own transcript (a restart called off the one its
                    // hook opened; the hook speaks again only after the answer), and when it is answered.
                    let asking_ids:Vec<String>=meta.state::<Mutex<Store>>().lock().map(|s|{let snap=s.live_snapshot();snap.sessions.iter().filter(|x|x.key.provider=="claude"&&x.parent_key.is_none()&&(matches!(x.status,domain::SessionStatus::Working|domain::SessionStatus::Waiting|domain::SessionStatus::Unknown)||snap.requests.iter().any(|r|r.key.session_key==x.key&&r.key.request_id.starts_with("ask:")&&matches!(r.status,domain::RequestStatus::Pending|domain::RequestStatus::Answering)))).map(|x|x.key.session_id.clone()).collect()}).unwrap_or_default();
                    let asks:Vec<(String,Option<claude_meta::Ask>)>=asking_ids.into_iter().filter_map(|id|{let info=claude_meta::transcript_of(&id).and_then(|p|transcripts.lock().ok().and_then(|mut t|t.read(&p).cloned()))?;Some((id,info.asking))}).collect();
                    if let Ok(mut store)=meta.state::<Mutex<Store>>().lock() {
                        let mut changed=first;
                        for (id,ended) in &settled { changed|=store.settle_reply(id,*ended); }
                        for (id,info) in seeds { let c=&chats[&id]; match info {
                            Some(info)=>store.seed(claude_key(&id),info.cwd.clone(),c.title.clone().or(info.title),info.reply,info.ending==claude_meta::Ending::Answered,info.last_at,at),
                            None=>store.seed(claude_key(&id),c.root.clone(),c.title.clone(),None,true,c.last_at,at),
                        } changed=true; }
                        for (id,ask) in &asks { changed|=store.transcript_question(&claude_key(id),ask.as_ref().map(|a|(a.tool_id.as_str(),a.title.as_str(),a.detail.as_str(),a.at))); }
                        changed|=store.set_listed("claude",listed);
                        if let Some(threads)=&codex_threads {
                            for t in threads.iter().filter(|t|!t.archived) {
                                let key=domain::SessionKey{provider:"codex".into(),host_id:host.clone(),session_id:t.id.clone()};
                                if t.project.is_some()&&!store.knows(&key) { store.seed(key.clone(),Some(t.cwd.trim_start_matches(r"\\?\").to_owned()),Some(t.name.clone()),None,true,t.updated_at,at); changed=true; }
                                let (root,office)=t.project.clone().map_or((None,"Sohbetler".to_owned()),|(r,n)|(Some(r),n));
                                changed|=store.apply_app(&key,Some(t.name.clone()),root,Some(office));
                            }
                            changed|=store.set_listed("codex",threads.iter().filter(|t|!t.archived&&t.project.is_some()).map(|t|t.id.clone()).collect());
                        }
                        let ids:Vec<String>=store.live_snapshot().sessions.iter().filter(|s|s.key.provider=="claude"&&s.parent_key.is_none()).map(|s|s.key.session_id.clone()).collect();
                        for id in ids { if let Some(c)=chats.get(&id) { changed|=store.apply_meta(&id,c.title.clone(),Some(c.link.clone()),c.archived,None); changed|=store.set_root(&id,c.root.clone(),true); } }
                        // A source app that is not running has no chat at work: Codex's own process, and for
                        // the Claude app's chats the app itself (chats from a terminal are not judged by it).
                        if let Some(running)=platform::process_names() {
                            if !running.contains("codex.exe") { changed|=store.source_lost("codex",None); }
                            if !running.contains("claude.exe") { changed|=store.source_lost("claude",Some(&|s:&domain::Session|s.link.is_some())); }
                        }
                        changed|=store.prune(at);
                        if changed {let _=meta.emit("snapshot",store.snapshot());}
                        if store.revision()!=saved { saved=store.revision(); if let Ok(text)=serde_json::to_string(&store.live_snapshot()) { let tmp=state_path.with_extension("json.tmp"); if std::fs::write(&tmp,text).is_ok() { let _=std::fs::rename(&tmp,&state_path); } } }
                    }
                    first=false;
                    std::thread::sleep(std::time::Duration::from_secs(15));
                }
            }); }
            // Questions that wait for an answer from here (see relay.rs). Held for the time the user
            // chose, then handed back to Claude's own window; never answered without the user.
            { let asked=handle.clone(); let lost=handle.clone(); let host=relay::host_id(); let host2=host.clone();
              let key_of=|event:&serde_json::Value,host:&str|{ let session=event.get("session_id").and_then(|v|v.as_str())?.to_owned(); let tool=event.get("tool_use_id").and_then(|v|v.as_str())?.to_owned();
                  let id=match event.get("agent_id").and_then(|v|v.as_str()){ Some(a)=>format!("{session}~{a}"), None=>session };
                  Some((domain::SessionKey{provider:"claude".into(),host_id:host.to_owned(),session_id:id},tool)) };
              relay::serve_asks(move|event,reply|{
                  let hold=asked.state::<Shell>().prefs.lock().map(|p|p.ask_hold).unwrap_or(0);
                  let Some((key,tool))=key_of(&event,&host).filter(|_|hold>0&&relay::source_of(&event)=="claude"&&event.get("tool_name").and_then(|v|v.as_str())==Some("AskUserQuestion")) else { let _=reply.send(String::new()); return };
                  let input=event.get("tool_input").cloned().unwrap_or_default();
                  if let Ok(mut m)=asked.state::<Asks>().0.lock(){ m.insert((key.clone(),tool.clone()),(input,reply)); }
                  let until=relay::now()+hold as u64*1000;
                  { let store=asked.state::<Mutex<Store>>(); if let Ok(mut store)=store.lock(){ store.set_live_ask(&key,&tool,Some(until)); let _=asked.emit("snapshot",store.snapshot()); }; }
                  // Its time is up: back to Claude's own window.
                  let later=asked.clone();
                  std::thread::spawn(move||{ std::thread::sleep(std::time::Duration::from_millis(hold as u64*1000));
                      let waiting=later.state::<Asks>().0.lock().ok().and_then(|mut m|m.remove(&(key.clone(),tool.clone())));
                      if let Some((_,reply))=waiting { let _=reply.send(String::new()); let store=later.state::<Mutex<Store>>(); if let Ok(mut store)=store.lock(){ store.set_live_ask(&key,&tool,None); let _=later.emit("snapshot",store.snapshot()); }; } });
              },move|event|{
                  // The hook ended first (Claude stopped it): the question is no longer answerable here.
                  let Some((key,tool))=key_of(&event,&host2) else { return };
                  if let Ok(mut m)=lost.state::<Asks>().0.lock(){ m.remove(&(key.clone(),tool.clone())); }
                  let store=lost.state::<Mutex<Store>>(); if let Ok(mut store)=store.lock(){ if store.set_live_ask(&key,&tool,None){ let _=lost.emit("snapshot",store.snapshot()); } };
              }); }
            let mapper=relay::ClaudeMapper::default();let host=relay::host_id();let live=handle.clone();let hook_transcripts=transcripts.clone();let (codex_hooks,cursor_hooks)=(codex_hooks::CodexHookMapper::default(),cursor_hooks::CursorHookMapper::default());
            relay::serve(move|hook|{
                // Codex's and Cursor's own hooks (their own files): their events, as each tool's mapper reads them.
                let provider=hook.get("agentoffice_provider").and_then(|v|v.as_str()).unwrap_or_default().to_owned();
                if provider=="codex"||(provider=="cursor"&&relay::source_of(&hook)=="cursor") {
                    let events=if provider=="codex" {codex_hooks.map(&hook,&host)} else {cursor_hooks.map(&hook,&host)};
                    if events.is_empty(){return;}
                    let store=live.state::<Mutex<Store>>();let Ok(mut store)=store.lock() else {return};
                    store.mark_connected(&provider,if provider=="codex" {"Codex hook olayları alınıyor"} else {"Cursor hook olayları alınıyor"});
                    providers::hook_seen(&provider);
                    for event in events {store.ingest(event);}
                    after_events(&live,&mut store);
                    let _=live.emit("snapshot",store.snapshot());
                    return;
                }
                // Only what Claude Code itself sent is Claude's: another tool running these hooks is not counted as Claude.
                if provider!="claude"||relay::source_of(&hook)!="claude"{return;}
                if hook.get("agentoffice_kind").and_then(|v|v.as_str())==Some("statusline"){
                    let at=hook.get("agentoffice_at").and_then(|v|v.as_u64()).unwrap_or_else(relay::now);
                    let Some(limits)=relay::claude_limits(&hook,at) else {return};
                    let store=live.state::<Mutex<Store>>();let Ok(mut store)=store.lock() else {return};
                    if store.set_limits(limits){let _=live.emit("snapshot",store.snapshot());}
                    return;
                }
                let events=mapper.map(&hook,&host);if events.is_empty(){return;}
                // The chat's title and, when its reply ends, the reply's first sentence.
                let replied=events.iter().any(|e|e.kind==domain::EventKind::TurnEnded&&e.parent_key.is_none());
                let cwd=hook.get("cwd").and_then(|v|v.as_str()).map(str::to_owned);
                let meta=events.iter().find_map(|e|e.transcript.clone().map(|t|(e.key.session_id.clone(),t)))
                    .and_then(|(sid,path)|hook_transcripts.lock().ok().and_then(|mut t|t.read(std::path::Path::new(&path)).cloned()).map(|info|(sid,info,path)));
                let store=live.state::<Mutex<Store>>();let Ok(mut store)=store.lock() else {return};
                store.mark_connected("claude","Claude Code hook olayları alınıyor");
                for event in events {store.ingest(event);}
                if let Some((sid,info,path))=meta {
                    let key=domain::SessionKey{provider:"claude".into(),host_id:host.clone(),session_id:sid.clone()};
                    store.transcript_question(&key,info.asking.as_ref().map(|a|(a.tool_id.as_str(),a.title.as_str(),a.detail.as_str(),a.at)));
                    store.set_root(&sid,claude_meta::root_of(std::path::Path::new(&path),cwd.as_deref().or(info.cwd.as_deref())),false);
                    // A desktop chat's own title wins over the transcript's.
                    let has_link=store.live_snapshot().sessions.iter().any(|s|s.key.session_id==sid&&s.link.is_some());
                    if replied { if let Some(reply)=info.reply.as_deref() { store.describe_reply(&sid,reply); } }
                    store.apply_meta(&sid,if has_link{None}else{info.title},None,false,if replied{info.reply}else{None});
                }
                after_events(&live,&mut store);
                let _=live.emit("snapshot",store.snapshot());
            });
            // `--background` starts with only the notch and the tray (no window takes
            // focus); the office opens from either. The Store package's startup task starts it so too.
            let background=std::env::args().any(|a|a=="--background")||package::startup_activated();
            let office=WebviewWindowBuilder::new(app,"office",WebviewUrl::App("index.html?view=office".into()))
                .title(i18n::text(i18n::resolve(&prefs.language),"app.office_window_title",&[])).theme(Some(tauri::Theme::Dark)).inner_size(1280.,820.).min_inner_size(860.,600.).center().visible(!background).focused(!background)
                // No taskbar button: the tray icon and the island bring it forward (Alt+Tab still lists it).
                .skip_taskbar(true)
                .data_directory(data.join("office")).build()?;
            // Where the user left the window, if that place is still on a screen; otherwise centred.
            let saved_window=handle.state::<Shell>().office_window.lock().ok().and_then(|b|b.clone());
            let monitors:Vec<(i32,i32,i32,i32)>=office.available_monitors().unwrap_or_default().iter().map(|m|(m.position().x,m.position().y,m.size().width as i32,m.size().height as i32)).collect();
            let restored=saved_window.as_ref().and_then(|b|office_bounds(b,&monitors));
            if let Some((x,y,w,h,maximized))=restored {
                office.set_size(PhysicalSize::new(w,h))?; office.set_position(PhysicalPosition::new(x,y))?;
                if maximized { office.maximize()?; }
            } else if let Some(work)=platform::work_area(&office) {
                let scale=office.scale_factor().unwrap_or(1.0);
                let width=((1280.0*scale) as u32).min(work.width);
                let height=((820.0*scale) as u32).min(work.height);
                office.set_min_size(Some(PhysicalSize::new(((860.0*scale) as u32).min(work.width),((600.0*scale) as u32).min(work.height))))?;
                office.set_size(PhysicalSize::new(width,height))?;
                office.set_position(PhysicalPosition::new(work.x+((work.width-width)/2) as i32,work.y+((work.height-height)/2) as i32))?;
            }
            if let Some(work)=platform::work_area(&office) { let scale=office.scale_factor().unwrap_or(1.0); office.set_min_size(Some(PhysicalSize::new(((860.0*scale) as u32).min(work.width),((600.0*scale) as u32).min(work.height))))?; }
            if background { office_seen(&office,false); }
            office.on_window_event({let win=office.clone(); let app=handle.clone(); move|event| match event {
                tauri::WindowEvent::CloseRequested{api,..}=>{api.prevent_close();let _=win.hide();office_seen(&win,false);}
                tauri::WindowEvent::Moved(_)|tauri::WindowEvent::Resized(_)=>remember_office(&app,&win),
                _=>{}
            }});
            let notch=WebviewWindowBuilder::new(app,"notch",WebviewUrl::App("index.html?view=notch".into()))
                .title("AgentOffice Notch").inner_size(224.,40.).decorations(false).transparent(true)
                // No surface of the window's own (WS_EX_NOREDIRECTIONBITMAP): Windows had painted the
                // window's caption into it, and the first frame of every opening showed it beside the
                // island ("…Office Notch" and a dark block) before the page's next frame covered it.
                .no_redirection_bitmap(true).shadow(false)
                // No system blur: on Windows 10 both the Blur and Acrylic accents
                // ignore the window region and cover the whole window rectangle
                // (measured: a dark or blurred box around the island). The glass is
                // drawn by the page inside the region only.
                .always_on_top(true).skip_taskbar(true).resizable(false).focused(false).focusable(false).visible(false)
                .data_directory(data.join("notch")).build()?;
            platform::non_activating(&notch)?;
            let _=backdrop::exclude_from_capture(&notch,!capturable);
            place_notch(handle)?;
            // Backdrop sampling: the whole notch window, whenever the notch is on
            // screen. ~35 Hz while the capsule or island is up; ~7 Hz behind the
            // resting line, so an opening starts on a current frame (no black or
            // unblurred moment while the first frame is fetched).
            { let sampler=handle.clone(); std::thread::spawn(move|| {
                let frames=sampler.state::<Arc<backdrop::Backdrop>>().inner().clone();
                let mut idle=false;
                loop {
                    let shell=sampler.state::<Shell>();
                    let (Ok(Some((bounds,_))),Ok(shapes))=(shell.bounds.lock().map(|b|*b),shell.shapes.lock().map(|s|s.clone())) else { std::thread::sleep(std::time::Duration::from_millis(100)); continue };
                    if !shell.shown.load(Ordering::Relaxed) || shell.capturable.load(Ordering::Relaxed) || !shell.glass.load(Ordering::Relaxed) {
                        if !idle { frames.clear(); idle=true; }
                        std::thread::sleep(std::time::Duration::from_millis(100)); continue;
                    }
                    idle=false;
                    let active=shapes.iter().any(|&(_,_,_,h,_,_,_)|h>=24);
                    let (w,h)=(bounds.width as i32,bounds.height as i32);
                    // Quarter resolution: the glass only shows it frosted.
                    if let Some(bmp)=backdrop::capture(bounds.x,bounds.y,w,h,4) { frames.publish((0,0,w,h),bmp); }
                    std::thread::sleep(std::time::Duration::from_millis(if active {28} else {140}));
                }
            }); }
            if !autohide { handle.state::<Shell>().shown.store(true,Ordering::Relaxed); platform::show_passive(&notch)?; }
            // The notch stays above other windows: twice a second, if a normal window has come
            // over it, it is raised again (not while a full-screen app runs: that one stays on
            // top). Each raise is noted in zorder.log (time only), to learn when Windows does it.
            { let keeper=handle.clone(); let log=data.join("zorder.log"); std::thread::spawn(move|| { let mut noted=0u32; loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let Some(win)=keeper.get_webview_window("notch") else { continue };
                // The frame styles never come back (see platform::strip_frame).
                if platform::strip_frame(&win) && noted<200 { noted+=1; use std::io::Write; if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(&log) { let _=writeln!(f,"{} frame styles removed again",relay::now()); } }
                if platform::quiet()==Some("fullscreen") { continue; }
                if platform::keep_on_top(&win) && noted<200 {
                    noted+=1;
                    use std::io::Write;
                    if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(&log) { let _=writeln!(f,"{} raised again",relay::now()); }
                }
            } }); }
            use tauri::{menu::{Menu,MenuItem,CheckMenuItem},tray::{TrayIconBuilder,TrayIconEvent,MouseButton,MouseButtonState}};
            let words=|key:&str|i18n::text(i18n::resolve(&prefs.language),key,&[]);
            let office_item=MenuItem::with_id(app,"office",words("tray.open_office"),true,None::<&str>)?;
            let settings_item=MenuItem::with_id(app,"settings",words("tray.settings"),true,None::<&str>)?;
            let notch_item=CheckMenuItem::with_id(app,"notch",words("tray.pin_panel"),true,false,None::<&str>)?;
            let mute_item=CheckMenuItem::with_id(app,"mute",words("tray.mute"),true,prefs.muted,None::<&str>)?;
            let capture_item=CheckMenuItem::with_id(app,"capture",words("tray.in_screenshots"),true,capturable,None::<&str>)?;
            let exit_item=MenuItem::with_id(app,"exit",words("tray.exit"),true,None::<&str>)?;
            app.manage(TrayWords{office:office_item.clone(),settings:settings_item.clone(),exit:exit_item.clone()});
            app.manage(PinItem(notch_item.clone())); app.manage(CaptureItem(capture_item.clone())); app.manage(MuteItem(mute_item.clone()));
            let menu=Menu::with_items(app,&[&office_item,&settings_item,&notch_item,&capture_item,&mute_item,&exit_item])?;
            TrayIconBuilder::new().icon(app.default_window_icon().cloned().ok_or("App icon unavailable")?)
                .tooltip("AgentOffice").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app,event|match event.id.as_ref(){
                    "office"=>{let _=open_office(app.clone(),None);},
                    "settings"=>{let _=open_settings(app.clone());},
                    "notch"=>{let pinned=!app.state::<Shell>().pinned.load(Ordering::Relaxed);let _=set_notch_pinned(app.clone(),pinned);},
                    "capture"=>{let value=!app.state::<Shell>().capturable.load(Ordering::Relaxed);let _=set_notch_in_screenshots(app.clone(),value);},
                    "mute"=>toggle_mute(app),
                    "exit"=>app.exit(0),_=>{}
                })
                .on_tray_icon_event(|tray,event|if matches!(event,TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}){let _=open_office(tray.app_handle().clone(),None);})
                .build(app)?;
            // Ctrl+Alt+Space opens the notch on what waits for the user (it closes
            // again after a while if the pointer is elsewhere); Ctrl+Alt+M mutes.
            { let keys=handle.clone(); let d=settings::Settings::default();
              let bind=|s:&str,f:&str|settings::parse_shortcut(s).or(settings::parse_shortcut(f)).unwrap_or((0x3,0x20));
              platform::shortcuts([bind(&prefs.shortcut_open,&d.shortcut_open),bind(&prefs.shortcut_mute,&d.shortcut_mute)],move|id|match id { 1=>{let _=reveal_notch(&keys,8000);}, 2=>toggle_mute(&keys), _=>{} }); }
            // One light 40 ms loop: auto-hide reveal from the top edge, pointer
            // inside/outside of the visible shapes (a non-activated WebView may not
            // report hover until the pointer moves), outside clicks closing the
            // limits panel, and monitor/DPI layout changes. Cursor reads never take
            // focus.
            // The rest state: every 0.3 s look at the window under the top centre (read-only) and
            // choose the small island or the line (dock::rest).
            #[cfg(windows)]
            { let docker=handle.clone(); std::thread::spawn(move|| {
                let Some(probe)=dock::probe::Probe::new() else { return };
                let (mut seen,mut last_window,mut tick_count)=(None::<dock::Dock>,0isize,0u32);
                loop {
                    // A changed window is judged at once, the same one again every 2.4 s.
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    tick_count=tick_count.wrapping_add(1);
                    let shell=docker.state::<Shell>();
                    if shell.expanded.load(Ordering::Relaxed)||shell.limits.load(Ordering::Relaxed)||shell.drag.lock().map(|d|d.is_some()).unwrap_or(false) { continue; }
                    let Some(win)=docker.get_webview_window("notch") else { continue };
                    let (Some(work),Ok(scale),Ok(Some(monitor)))=(platform::work_area(&win),win.scale_factor(),win.current_monitor()) else { continue };
                    let screen=geometry::Bounds{x:monitor.position().x,y:monitor.position().y,width:monitor.size().width,height:monitor.size().height};
                    // Under the island, wherever the user put it along the top edge.
                    let center=shell.island.lock().ok().and_then(|i|*i).map(|i|i.x+i.width as i32/2).filter(|x|*x>=work.x&&*x<work.x+work.width as i32).unwrap_or(work.x+work.width as i32/2);
                    let px=|v:f64|(v*scale).round() as i32;
                    // Any application window under the island counts, including our own office
                    // (the notch itself is a tool window and is skipped).
                    let found=probe.window_at((center,work.y+px(4.0)),0);
                    let window_id=found.as_ref().map_or(0,|(h,..)|h.0 as isize);
                    let switched=window_id!=last_window||shell.redock.swap(false,Ordering::Relaxed); last_window=window_id;
                    if !switched && tick_count%8!=0 { continue; }
                    // A real full screen (not a maximized or frameless window that fills the work area).
                    let fullscreen=found.as_ref().is_some_and(|(_,bounds,_,_,zoomed)|dock::is_fullscreen(*bounds,screen,*zoomed));
                    let browser=found.as_ref().is_some_and(|(_,_,class,pid,_)| matches!(class.as_str(),"Chrome_WidgetWin_1"|"MozillaWindowClass") && probe.is_browser(*pid));
                    let place=if fullscreen { dock::Place::Fullscreen } else if browser { dock::Place::Browser } else if found.is_some() { dock::Place::App } else { dock::Place::Desktop };
                    let candidate={ let Ok(p)=shell.prefs.lock() else { continue }; dock::rest(center,place,&p.rest_desktop,&p.rest_apps,&p.rest_browsers,&p.fullscreen_rest) };
                    // A new window is applied at once; on the same window a change needs
                    // two identical readings in a row, so a transient read cannot flicker it.
                    if !switched && seen!=Some(candidate) { seen=Some(candidate); continue; }
                    seen=Some(candidate);
                    let next=candidate;
                    if let Ok(mut d)=shell.dock.lock() { *d=Some(next); }
                    // The look is re-sent on every check (the page ignores repeats), so a page that
                    // started listening late still gets it. "Hidden": the window leaves the screen at
                    // rest (it comes back from the top edge over the island); otherwise it is shown.
                    let app=docker.clone();
                    let _=docker.run_on_main_thread(move||{
                        let shell=app.state::<Shell>();
                        let hidden=matches!(next,dock::Dock::Hidden(_));
                        shell.autohide.store(hidden,Ordering::Relaxed);
                        if hidden { conceal_notch(&app); }
                        else if !shell.shown.swap(true,Ordering::Relaxed) { if let Some(win)=app.get_webview_window("notch") { let _=platform::show_passive(&win); } }
                        let _=app.emit_to("notch","notch-dock",next.name());
                    });
                }
            }); }
            let tick=handle.clone();
            std::thread::spawn(move|| {
                let (mut previous,mut counter,mut dwell,mut was_inside,mut over_at)=(String::new(),0u32,0u32,None::<bool>,None::<(i32,i32)>);
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(40));
                    counter=counter.wrapping_add(1);
                    if counter%25==0 { let shell=tick.state::<Shell>(); if shell.office_dirty.swap(false,Ordering::Relaxed) { let _=save_settings(&shell); } }
                    if counter%50==0 {
                        let work=tick.get_webview_window("notch").and_then(|win|platform::work_area(&win));
                        let signature=format!("{:?} {work:?}",tick.available_monitors());
                        if signature!=previous {previous=signature;let app=tick.clone();let _=tick.run_on_main_thread(move||{let _=place_notch(&app);});}
                    }
                    let shell=tick.state::<Shell>();
                    let (Some((x,y)),Ok(Some((bounds,scale))))=(platform::cursor(),shell.bounds.lock().map(|b|*b)) else {continue};
                    if !shell.shown.load(Ordering::Relaxed) {
                        was_inside=None;
                        let island=shell.island.lock().map(|i|*i).ok().flatten().unwrap_or(bounds);
                        dwell=if geometry::reveals(island,scale,x,y){dwell+1}else{0};
                        if dwell==3 {let app=tick.clone();let _=tick.run_on_main_thread(move||{let _=reveal_notch(&app,0);});}
                        continue;
                    }
                    dwell=0;
                    let inside=pointer_inside(&shell,(x,y));
                    // Where the pointer last really was over the island: one that left it while it
                    // moved and then stopped elsewhere has moved, though it is still now.
                    let unmoved=over_at==Some((x,y)); if inside { over_at=Some((x,y)); }
                    let over_area=shell.moving.load(Ordering::Relaxed) && pointer_over_area(&shell,(x,y));
                    let now=pointer_verdict(was_inside,inside,unmoved,over_area);
                    // Once the island settles the page hears it again, so a leave it set aside while
                    // the island moved (or an entry and exit between two looks) is not lost.
                    let recheck=shell.recheck.swap(false,Ordering::Relaxed);
                    if recheck || was_inside.is_some_and(|w|w!=now) {let _=tick.emit_to("notch","notch-pointer",now);}
                    was_inside=Some(now);
                    if !now && shell.limits.load(Ordering::Relaxed) && platform::primary_button_down() {
                        shell.limits.store(false,Ordering::Relaxed);let _=tick.emit_to("notch","limits-panel",serde_json::json!({"open":false}));
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("AgentOffice could not start");
}

#[cfg(test)]
mod tests {
    use super::{office_bounds,pointer_verdict};
    use serde_json::json;
    #[test] fn the_pointer_leaves_the_island_only_by_moving_out_of_its_settled_shape() {
        assert!(pointer_verdict(Some(false),true,false,false));
        assert!(!pointer_verdict(Some(true),false,false,false), "moved out of the settled island");
        assert!(pointer_verdict(Some(true),false,true,false), "the island shrank under a pointer that has not moved");
        assert!(pointer_verdict(Some(true),false,false,true), "moved while the island still grows under it");
        assert!(!pointer_verdict(Some(false),false,false,true), "never over it: not held by the area");
        assert!(!pointer_verdict(None,false,true,true));
    }
    #[test] fn the_office_window_comes_back_where_it_was_only_if_that_is_on_a_screen() {
        let one = [(0, 0, 1920, 1080)];
        assert_eq!(office_bounds(&json!({"x": 100, "y": 80, "w": 1280, "h": 820, "maximized": false}), &one), Some((100, 80, 1280, 820, false)));
        assert_eq!(office_bounds(&json!({"x": 2500, "y": 80, "w": 1280, "h": 820}), &one), None, "its screen is gone");
        assert_eq!(office_bounds(&json!({"x": 100, "y": -500, "w": 1280, "h": 820}), &one), None, "its title bar would be off screen");
        assert_eq!(office_bounds(&json!({"x": 10, "y": 10, "w": 50, "h": 50}), &one), None);
        assert_eq!(office_bounds(&json!({"x": -1800, "y": 10, "w": 1280, "h": 820, "maximized": true}), &[(0, 0, 1920, 1080), (-1920, 0, 1920, 1080)]), Some((-1800, 10, 1280, 820, true)));
    }
}
