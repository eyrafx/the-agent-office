// Derived from Coucou platform/windows.rs at 1e5180921c1326fc72e41d313e3e2855e9c10162.
// Copyright (c) 2026 Louis Raillé. MIT; see licenses/Coucou-MIT.txt.
use crate::geometry::Bounds;
use tauri::WebviewWindow;

#[cfg(windows)]
pub fn non_activating(win: &WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    // Preserve all existing styles; only the notch becomes a non-activating tool window.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        // tao re-adds WS_EX_APPWINDOW when it recomputes styles, which puts the
        // notch in the taskbar and Alt+Tab. Strip it explicitly on every call.
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (style & !(WS_EX_APPWINDOW as isize)) | WS_EX_NOACTIVATE as isize | WS_EX_TOOLWINDOW as isize);
    }
    strip_frame(win);
    Ok(())
}

/// The window frame styles a borderless webview window keeps (caption, sizing border, system
/// menu): Windows still paints that caption at times (on activation changes, region changes),
/// and inside the island's region it showed as the window's own title bar ("AgentOffice Notch")
/// and pale bands beside the island. A plain popup has no caption to paint. Returns whether it
/// had to change anything (tao can add them back when it recomputes styles).
#[cfg(windows)]
pub fn strip_frame(win: &WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let Ok(h) = win.hwnd() else { return false };
    let hwnd = h.0 as _;
    let frame = (WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX) as isize;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        if style & frame == 0 && style & WS_POPUP as isize != 0 { return false; }
        SetWindowLongPtrW(hwnd, GWL_STYLE, (style & !frame) | WS_POPUP as isize);
        SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
    }
    clear_surface(win);
    true
}

/// Clears the window's own surface (under the web view) to transparent. Windows painted the
/// window's caption into that surface when it was created (title "AgentOffice Notch", its icon,
/// a pale bar), and the web view's transparent pixels showed it wherever the region reached past
/// the island: the bar along the top edge and the pale marks at the shoulders. With the window's
/// blur-behind transparency, black painted by GDI is fully transparent.
#[cfg(windows)]
pub fn clear_surface(win: &WebviewWindow) {
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let Ok(h) = win.hwnd() else { return };
    let hwnd = h.0 as _;
    unsafe {
        let mut r: windows_sys::Win32::Foundation::RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut r) == 0 { return; }
        let dc = GetWindowDC(hwnd);
        if dc.is_null() { return; }
        let full = windows_sys::Win32::Foundation::RECT { left: 0, top: 0, right: r.right - r.left, bottom: r.bottom - r.top };
        FillRect(dc, &full, GetStockObject(BLACK_BRUSH) as _);
        ReleaseDC(hwnd, dc);
    }
}
#[cfg(not(windows))] pub fn clear_surface(_: &WebviewWindow) {}
#[cfg(not(windows))] pub fn strip_frame(_: &WebviewWindow) -> bool { false }

/// Shows above other windows without activating it or taking keyboard focus.
#[cfg(windows)]
pub fn show_passive(win: &WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    non_activating(win)?;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    clear_surface(win);
    unsafe {
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        // Kept out of screen captures again, now it is on screen: after it had been hidden and
        // shown, Windows kept the mark (0x11) but captures saw the notch itself, black (measured:
        // the backdrop read behind the island went to 0), so the glass drew it black.
        let mut affinity = 0u32;
        if GetWindowDisplayAffinity(hwnd, &mut affinity) != 0 && affinity != WDA_NONE {
            SetWindowDisplayAffinity(hwnd, WDA_NONE);
            SetWindowDisplayAffinity(hwnd, affinity);
        }
    }
    Ok(())
}

/// Puts the notch back above other windows when a normal window has come over it. Its
/// topmost mark can stay set while Windows has put it among the normal windows (seen live: an
/// app brought to the front covered it), so this looks at the real order, not the mark: any
/// visible normal window above it means it is covered. Returns whether it raised it. Never
/// activates it or takes focus.
#[cfg(windows)]
pub fn keep_on_top(win: &WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let Ok(h) = win.hwnd() else { return false };
    let hwnd = h.0 as _;
    unsafe {
        if IsWindowVisible(hwnd) == 0 { return false; }
        let mut w = GetWindow(hwnd, GW_HWNDPREV);
        let mut covered = false;
        while !w.is_null() {
            if IsWindowVisible(w) != 0 && (GetWindowLongW(w, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST) == 0 { covered = true; break; }
            w = GetWindow(w, GW_HWNDPREV);
        }
        if !covered { return false; }
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        true
    }
}
#[cfg(not(windows))] pub fn keep_on_top(_: &WebviewWindow) -> bool { false }

/// Counterpart of `show_passive`. tao did not see that show, so its own
/// `hide()` would be a no-op.
#[cfg(windows)]
pub fn hide(win: &WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    unsafe { ShowWindow(hwnd, SW_HIDE); }
    Ok(())
}

/// Physical cursor position; the process is per-monitor DPI aware.
#[cfg(windows)]
pub fn cursor() -> Option<(i32, i32)> {
    // Tests only: a copy started with AGENTOFFICE_TEST_CURSOR_FILE reads its pointer from that
    // file ("x,y"), so behaviour under a still pointer is checked without touching the real mouse.
    if let Some(file) = std::env::var_os("AGENTOFFICE_TEST_CURSOR_FILE") {
        let text = std::fs::read_to_string(file).ok()?;
        let (x, y) = text.trim().split_once(',')?;
        return Some((x.trim().parse().ok()?, y.trim().parse().ok()?));
    }
    use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut point = POINT { x: 0, y: 0 };
    (unsafe { GetCursorPos(&mut point) } != 0).then_some((point.x, point.y))
}

#[cfg(windows)]
pub fn work_area(win: &WebviewWindow) -> Option<Bounds> {
    use windows_sys::Win32::Graphics::Gdi::*;
    let hwnd = win.hwnd().ok()?.0 as _;
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) == 0 { return None; }
        let r = info.rcWork;
        Some(Bounds { x:r.left,y:r.top,width:(r.right-r.left).max(1) as u32,height:(r.bottom-r.top).max(1) as u32 })
    }
}

/// Window region = union of the visible shapes (physical px, relative to the
/// window). `flush` shapes keep a square top edge against the screen edge, and their
/// shoulders (radius `s`) curve out along it: a square beside each top corner less a
/// circle, so the island flows out of the screen's edge. The page sends each shape one
/// screen pixel outside what it draws; the shoulders' curve moves that pixel inwards.
/// Everything outside is neither drawn (including the system blur) nor clickable, so the
/// apps underneath keep receiving clicks.
#[cfg(windows)]
pub fn shape_region(win: &WebviewWindow, shapes: &[(i32, i32, i32, i32, i32, bool, i32)], margin: i32) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Gdi::*;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    let m = margin.max(0);
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.is_null() { return Err("Could not create notch region".into()); }
        for &(x, y, w, h, r, flush, s) in shapes {
            // The drawn shape grown by `m` on every side (its corners' radius too).
            let (x0, x1, y1, rr) = (x - m, x + w + m, y + h + m, r + m);
            let top = if flush { y - rr * 2 } else { y - m };
            let part = CreateRoundRectRgn(x0, top, x1 + 1, y1 + 1, rr * 2, rr * 2);
            if !part.is_null() { CombineRgn(region, region, part, RGN_OR); DeleteObject(part); }
            if flush && s > m + 1 {
                // A shoulder: the square beside a top corner less a circle of the shoulder's
                // radius around the same centre, shrunk by `m` so the arc's soft edge stays in.
                let (left, right) = (x, x + w);
                let c = s - m;
                for (sq_l, sq_r, cx) in [(left - s - m, left + 1, left - s), (right - 1, right + s + m, right + s)] {
                    let square = CreateRectRgn(sq_l, y.min(0) - 2, sq_r, y + s);
                    let cut = CreateEllipticRgn(cx - c, y + s - c, cx + c + 1, y + s + c + 1);
                    if !square.is_null() && !cut.is_null() { CombineRgn(square, square, cut, RGN_DIFF); CombineRgn(region, region, square, RGN_OR); }
                    if !square.is_null() { DeleteObject(square); }
                    if !cut.is_null() { DeleteObject(cut); }
                }
            }
        }
        if SetWindowRgn(hwnd, region, 1) == 0 { DeleteObject(region); return Err("Could not apply notch region".into()); }
    }
    Ok(())
}

/// The island's own area as the region while it animates (set once for the move): room for
/// every frame of the move, never the rest of the window. Set without a forced repaint: a forced
/// repaint of that area was the 100-150 ms hitch measured at the start of an opening.
#[cfg(windows)]
pub fn window_region(win: &WebviewWindow, area: Option<(i32, i32, i32, i32)>) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Gdi::*;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as _;
    let size = win.inner_size().map_err(|e| e.to_string())?;
    let (x, y, w, h) = area.unwrap_or((0, 0, size.width as i32, size.height as i32));
    unsafe {
        let region = CreateRectRgn(x, y.min(0) - 200, x + w, y + h);
        if region.is_null() || SetWindowRgn(hwnd, region, 0) == 0 { if !region.is_null() { DeleteObject(region); } return Err("Could not apply notch region".into()); }
    }
    Ok(())
}
#[cfg(not(windows))] pub fn window_region(_: &WebviewWindow, _: Option<(i32, i32, i32, i32)>) -> Result<(), String> { Ok(()) }

/// Primary mouse button currently held down (used to close on outside clicks).
#[cfg(windows)]
pub fn primary_button_down() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0 }
}

/// Shortcuts that work anywhere: opening the notch (id 1) and muting (id 2), as the user set
/// them. A combination another program already owns is not held; `SHORTCUTS` says which ones
/// this app holds (bit 0: id 1, bit 1: id 2). `rebind` changes one while the app runs.
pub static SHORTCUTS: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
static HOTKEY_THREAD: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
struct Rebind { id: i32, mods: u32, key: u32, reply: std::sync::mpsc::Sender<bool> }
static REBINDS: std::sync::Mutex<Vec<Rebind>> = std::sync::Mutex::new(Vec::new());
#[cfg(windows)]
const WM_REBIND: u32 = windows_sys::Win32::UI::WindowsAndMessaging::WM_APP + 7;
#[cfg(windows)]
pub fn shortcuts(bindings: [(u32, u32); 2], pressed: impl Fn(i32) + Send + 'static) {
    std::thread::spawn(move || unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_NOREPEAT};
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, PeekMessageW, MSG, PM_NOREMOVE, WM_HOTKEY};
        let mut msg: MSG = std::mem::zeroed();
        PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE); // the queue exists before anyone posts to it
        HOTKEY_THREAD.store(windows::Win32::System::Threading::GetCurrentThreadId(), std::sync::atomic::Ordering::Relaxed);
        let mut current = bindings; let mut held = 0u8;
        for (i, (mods, key)) in current.iter().enumerate() { if RegisterHotKey(std::ptr::null_mut(), i as i32 + 1, mods | MOD_NOREPEAT, *key) != 0 { held |= 1 << i; } }
        SHORTCUTS.store(held, std::sync::atomic::Ordering::Relaxed);
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if msg.message == WM_HOTKEY { pressed(msg.wParam as i32); }
            else if msg.message == WM_REBIND {
                let pending: Vec<Rebind> = REBINDS.lock().map(|mut r| r.drain(..).collect()).unwrap_or_default();
                for r in pending {
                    let i = (r.id - 1) as usize; if i > 1 { let _ = r.reply.send(false); continue; }
                    UnregisterHotKey(std::ptr::null_mut(), r.id);
                    let ok = RegisterHotKey(std::ptr::null_mut(), r.id, r.mods | MOD_NOREPEAT, r.key) != 0;
                    // Taken by another program: the previous combination is held again, nothing changes.
                    let holds = ok || RegisterHotKey(std::ptr::null_mut(), r.id, current[i].0 | MOD_NOREPEAT, current[i].1) != 0;
                    if ok { current[i] = (r.mods, r.key); }
                    if holds { held |= 1 << i; } else { held &= !(1 << i); }
                    SHORTCUTS.store(held, std::sync::atomic::Ordering::Relaxed);
                    let _ = r.reply.send(ok);
                }
            }
        }
    });
}
/// Moves shortcut `id` to another combination; false (and nothing changed) when another
/// program already owns it.
#[cfg(windows)]
pub fn rebind(id: i32, mods: u32, key: u32) -> bool {
    let thread = HOTKEY_THREAD.load(std::sync::atomic::Ordering::Relaxed);
    if thread == 0 { return false; }
    let (reply, answer) = std::sync::mpsc::channel();
    if let Ok(mut r) = REBINDS.lock() { r.push(Rebind { id, mods, key, reply }); } else { return false; }
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::PostThreadMessageW(thread, WM_REBIND, 0, 0); }
    answer.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or(false)
}
#[cfg(not(windows))] pub fn rebind(_: i32, _: u32, _: u32) -> bool { false }

/// A sound's tones: (frequency Hz, start s, length s, loudness) for each of its notes.
pub fn tone(kind: &str) -> Vec<(f32, f32, f32, f32)> {
    match kind {
        "bell" => vec![(880.0, 0.0, 0.7, 1.0), (1320.0, 0.0, 0.5, 0.35), (1760.0, 0.0, 0.3, 0.15)],
        "pop" => vec![(990.0, 0.0, 0.09, 1.0)],
        "double" => vec![(660.0, 0.0, 0.16, 1.0), (880.0, 0.17, 0.2, 1.0)],
        _ => vec![(660.0, 0.0, 0.22, 1.0)],
    }
}
/// The notification sound: short tones at `volume` (0–100), played by Windows itself so
/// it needs no window to have been clicked first. Never for a test; only for a real event or
/// the user's own "Örnek ses".
/// The sound as a WAV file in memory (16-bit mono, 22.05 kHz) at `volume` (0–100).
pub fn chime_wav(volume: u32, kind: &str) -> Vec<u8> {
    let notes = tone(kind);
    let rate = 22_050u32; let n = (rate as f32 * notes.iter().map(|(_, s, l, _)| s + l).fold(0.0f32, f32::max)) as usize;
    let amp = volume.min(100) as f32 / 100.0 * 0.35 * 32_767.0;
    let mut wav: Vec<u8> = Vec::with_capacity(44 + n * 2);
    wav.extend_from_slice(b"RIFF"); wav.extend_from_slice(&((36 + n * 2) as u32).to_le_bytes()); wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); wav.extend_from_slice(&1u16.to_le_bytes()); wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&rate.to_le_bytes()); wav.extend_from_slice(&(rate * 2).to_le_bytes()); wav.extend_from_slice(&2u16.to_le_bytes()); wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data"); wav.extend_from_slice(&((n * 2) as u32).to_le_bytes());
    for i in 0..n {
        let t = i as f32 / rate as f32;
        let mut sample = 0.0f32;
        for (freq, start, len, gain) in &notes {
            let k = t - start; if k < 0.0 || k > *len { continue; }
            let envelope = (1.0 - k / len).powi(2) * (k * 200.0).min(1.0);
            sample += (std::f32::consts::TAU * freq * k).sin() * amp * envelope * gain;
        }
        wav.extend_from_slice(&(sample.clamp(-32_767.0, 32_767.0) as i16).to_le_bytes());
    }
    wav
}
#[cfg(windows)]
pub fn chime_kind(volume: u32, kind: &str) {
    if volume == 0 { return; }
    // A test copy writes down what it would play (time, sound, volume) and stays silent.
    if let Some(log) = std::env::var_os("AGENTOFFICE_TEST_SOUND_LOG") {
        use std::io::Write;
        let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log) { let _ = writeln!(f, "{at} {kind} {volume}"); }
        return;
    }
    let wav = chime_wav(volume, kind);
    std::thread::spawn(move || {
        use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_MEMORY, SND_NODEFAULT};
        unsafe { PlaySoundW(wav.as_ptr() as *const u16, std::ptr::null_mut(), SND_MEMORY | SND_NODEFAULT); }
    });
}
#[cfg(not(windows))] pub fn chime_kind(_: u32, _: &str) {}
/// Why notifications should stay quiet now: a full-screen app, game or presentation
/// ("fullscreen"), or Windows' do-not-disturb (Focus Assist / quiet time: "dnd").
/// Focus Assist has no public API on Windows 10; its state is read (read-only) from
/// the shell's notification state, and an unreadable state counts as not quiet.
#[cfg(windows)]
pub fn quiet() -> Option<&'static str> {
    use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
    let mut state = 0;
    if unsafe { SHQueryUserNotificationState(&mut state) } == 0 {
        // QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE; QUNS_QUIET_TIME.
        if matches!(state, 2..=4) { return Some("fullscreen"); }
        if state == 6 { return Some("dnd"); }
    }
    #[link(name = "ntdll")]
    extern "system" { fn NtQueryWnfStateData(name: *const u64, kind: *const core::ffi::c_void, scope: *const core::ffi::c_void, stamp: *mut u32, buffer: *mut core::ffi::c_void, size: *mut u32) -> i32; }
    // WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: 0 off, 1 priority only, 2 alarms only.
    const QUIET_HOURS: u64 = 0x0D83_063E_A3BF_5075;
    let (mut stamp, mut value, mut size) = (0u32, 0u32, 4u32);
    let status = unsafe { NtQueryWnfStateData(&QUIET_HOURS, std::ptr::null(), std::ptr::null(), &mut stamp, &mut value as *mut u32 as *mut _, &mut size) };
    (status >= 0 && size == 4 && value != 0).then_some("dnd")
}
#[cfg(not(windows))] pub fn quiet() -> Option<&'static str> { None }

/// The running processes (id, executable name in lower case).
#[cfg(windows)]
pub fn processes() -> Option<Vec<(u32, String)>> {
    use windows_sys::Win32::{Foundation::{CloseHandle, INVALID_HANDLE_VALUE}, System::Diagnostics::ToolHelp::*};
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE { return None; }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut list = Vec::new();
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                list.push((entry.th32ProcessID, String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase()));
                if Process32NextW(snap, &mut entry) == 0 { break; }
            }
        }
        CloseHandle(snap);
        (!list.is_empty()).then_some(list)
    }
}
/// The executable names of the running processes, in lower case (to tell whether a
/// source app is running at all).
#[cfg(windows)]
pub fn process_names() -> Option<std::collections::HashSet<String>> { processes().map(|l| l.into_iter().map(|(_, n)| n).collect()) }

/// The main window of a running app: its largest visible, unowned, titled top-level window.
#[cfg(windows)]
fn main_window_of(pids: &std::collections::HashSet<u32>) -> Option<windows_sys::Win32::Foundation::HWND> {
    use windows_sys::Win32::{Foundation::{HWND, LPARAM, RECT}, UI::WindowsAndMessaging::*};
    struct Search<'a> { pids: &'a std::collections::HashSet<u32>, best: Option<(HWND, i64)> }
    unsafe extern "system" fn each(h: HWND, l: LPARAM) -> i32 {
        let s = &mut *(l as *mut Search);
        let mut pid = 0u32; GetWindowThreadProcessId(h, &mut pid);
        if !s.pids.contains(&pid) || IsWindowVisible(h) == 0 || !GetWindow(h, GW_OWNER).is_null() || GetWindowTextLengthW(h) == 0 { return 1; }
        if GetWindowLongPtrW(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW as isize != 0 { return 1; }
        let mut r: RECT = std::mem::zeroed(); GetWindowRect(h, &mut r);
        let area = (r.right - r.left) as i64 * (r.bottom - r.top) as i64;
        if s.best.is_none_or(|(_, a)| area > a) { s.best = Some((h, area)); }
        1
    }
    let mut search = Search { pids, best: None };
    unsafe { EnumWindows(Some(each), &mut search as *mut Search as LPARAM); }
    search.best.map(|(h, _)| h)
}

/// A window to the front (restored if minimized); whether it got there.
#[cfg(windows)]
unsafe fn raise(h: windows_sys::Win32::Foundation::HWND) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    if IsIconic(h) != 0 { ShowWindow(h, SW_RESTORE); }
    if SetForegroundWindow(h) != 0 && GetForegroundWindow() == h { return true; }
    // A click on the notch goes to its web view's process, not to this one, so
    // Windows may refuse; joining the front window's input for a moment allows it.
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    let fg = GetWindowThreadProcessId(GetForegroundWindow(), std::ptr::null_mut());
    let me = GetCurrentThreadId();
    let joined = fg != 0 && fg != me && AttachThreadInput(me, fg, true).as_bool();
    BringWindowToTop(h); SetForegroundWindow(h);
    if joined { let _ = AttachThreadInput(me, fg, false); }
    GetForegroundWindow() == h
}
/// A tool with no way to a chat: its main window (any of its programs `exes`, lower case) to the
/// front, only on the user's click. False when none of them runs.
#[cfg(windows)]
pub fn bring_to_front(exes: &[&str]) -> bool {
    let pids: std::collections::HashSet<u32> = processes().unwrap_or_default().into_iter().filter(|(_, n)| exes.contains(&n.as_str())).map(|(p, _)| p).collect();
    main_window_of(&pids).is_some_and(|h| unsafe { raise(h) })
}
#[cfg(not(windows))] pub fn bring_to_front(_: &[&str]) -> bool { false }
/// Opens a chat's link in its app, only on the user's click, as fast as Windows allows: the
/// app's window (if it already runs) comes to the front at once, then the link goes straight
/// to the shell (no explorer.exe in between) and the app switches to the chat once it hands
/// the link on. Each phase's time is noted in `timing` (no link or content), to measure delays.
#[cfg(windows)]
pub fn open_link(link: &str, exe: &str, timing: Option<std::path::PathBuf>) {
    let (link, exe) = (link.to_owned(), exe.to_owned());
    std::thread::spawn(move || unsafe {
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::*};
        let t0 = std::time::Instant::now();
        let ms = || t0.elapsed().as_millis();
        let ids = |list: &[(u32, String)]| list.iter().filter(|(_, n)| *n == exe).map(|(p, _)| *p).collect::<std::collections::HashSet<u32>>();
        let before = ids(&processes().unwrap_or_default());
        let mut notes = vec![];
        // The window first: the user sees the app right away, whatever the link then takes.
        if let Some(h) = main_window_of(&before) {
            let front = raise(h);
            notes.push(format!("pencere {} ({} ms)", if front { "öne geldi" } else { "öne gelemedi" }, ms()));
        } else { notes.push("uygulama açık değildi".into()); }
        AllowSetForegroundWindow(ASFW_ANY);
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED | windows::Win32::System::Com::COINIT_DISABLE_OLE1DDE);
        let wide: Vec<u16> = link.encode_utf16().chain([0]).collect();
        let verb: Vec<u16> = "open".encode_utf16().chain([0]).collect();
        let r = ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) as isize;
        notes.push(format!("bağlantı Windows'a verildi ({} ms{})", ms(), if r <= 32 { format!(", hata {r}") } else { String::new() }));
        // Windows starts a new copy of the app for the link, which hands it to the running one
        // and exits: when that copy appears and leaves is when the chat switches.
        let (mut seen, deadline) = (None::<u32>, std::time::Instant::now() + std::time::Duration::from_secs(30));
        while std::time::Instant::now() < deadline {
            let now = ids(&processes().unwrap_or_default());
            match seen {
                None => if let Some(p) = now.difference(&before).next() { seen = Some(*p); notes.push(format!("yeni kopya başladı ({} ms)", ms())); },
                Some(p) => if !now.contains(&p) { notes.push(format!("bağlantıyı devretti ({} ms)", ms())); break; },
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        if let Some(path) = timing {
            use std::io::Write;
            let old = std::fs::read_to_string(&path).unwrap_or_default();
            let mut lines: Vec<&str> = old.lines().collect(); let keep = lines.len().saturating_sub(199); lines.drain(..keep);
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            if let Ok(mut f) = std::fs::File::create(&path) { for l in lines { let _ = writeln!(f, "{l}"); } let _ = writeln!(f, "{stamp} {exe}: {}", notes.join(" · ")); }
        }
    });
}
#[cfg(not(windows))] pub fn process_names() -> Option<std::collections::HashSet<String>> { None }
#[cfg(not(windows))] pub fn open_link(link: &str, _: &str, _: Option<std::path::PathBuf>) { let _ = std::process::Command::new("xdg-open").arg(link).spawn(); }
#[cfg(not(windows))] pub fn shortcuts(_: [(u32, u32); 2], _: impl Fn(i32) + Send + 'static) {}
#[cfg(not(windows))] pub fn shape_region(_: &WebviewWindow,_:&[(i32,i32,i32,i32,i32,bool)])->Result<(),String>{Ok(())}
#[cfg(not(windows))] pub fn primary_button_down() -> bool { false }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn every_sound_is_a_short_wav_that_follows_the_volume() {
        for kind in ["soft", "bell", "pop", "double"] {
            let (loud, half) = (chime_wav(100, kind), chime_wav(50, kind));
            assert_eq!(&loud[..4], b"RIFF"); assert!(loud.len() > 44 && loud.len() < 44 + 22_050 * 2);
            let peak = |w: &[u8]| w[44..].chunks(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0) as f32;
            assert!((peak(&half) / peak(&loud) - 0.5).abs() < 0.02, "{kind}");
        }
    }
    /// Writes each sound, as the app plays it at full volume, to the folder in AGENTOFFICE_RENDER_SOUNDS.
    #[test] #[ignore] fn render_sounds() {
        let dir = std::path::PathBuf::from(std::env::var("AGENTOFFICE_RENDER_SOUNDS").expect("AGENTOFFICE_RENDER_SOUNDS"));
        std::fs::create_dir_all(&dir).unwrap();
        for kind in ["soft", "bell", "pop", "double"] { for v in [100, 50] { std::fs::write(dir.join(format!("{kind}-{v}.wav")), chime_wav(v, kind)).unwrap(); } }
    }
}
