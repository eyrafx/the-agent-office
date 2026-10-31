//! How the closed island rests, from the window under it (read-only).
//!
//! Three places, each with the user's own choice of rest look (hidden, thin line or small island):
//! the bare desktop, an application window and a browser window. A real full-screen window (a
//! video, a game, a browser in F11) has its own choice. Electron apps such as Claude share Chrome's
//! window class but are not browsers.

use crate::geometry::Bounds;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Dock {
    /// The small island, centred on this screen x (physical).
    Capsule(i32),
    /// The thin line, centred on this x (physical).
    Line(i32),
    /// Nothing at rest; it opens from the top edge, around this x.
    Hidden(i32),
}

impl Dock {
    pub fn name(self) -> &'static str { match self { Dock::Capsule(_) => "capsule", Dock::Line(_) => "line", Dock::Hidden(_) => "hidden" } }
}

/// What lies under the island.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place { Desktop, App, Browser, Fullscreen }

/// The rest look the user chose for that place ("capsule", "line" or "hidden").
pub fn rest(center: i32, place: Place, desktop: &str, apps: &str, browsers: &str, fullscreen: &str) -> Dock {
    let choice = match place { Place::Desktop => desktop, Place::App => apps, Place::Browser => browsers, Place::Fullscreen => fullscreen };
    match choice { "hidden" => Dock::Hidden(center), "capsule" => Dock::Capsule(center), _ => Dock::Line(center) }
}

/// A real full-screen window (a video or game, a browser in F11) covers the whole screen, the
/// taskbar's place included, and is not a maximized window: a maximized one (with or without its
/// own frame, as ChatGPT or Claude draw it) only fills the work area or reports itself zoomed.
pub fn is_fullscreen(window: Bounds, monitor: Bounds, zoomed: bool) -> bool {
    let (right, bottom) = (window.x + window.width as i32, window.y + window.height as i32);
    !zoomed && window.x <= monitor.x && window.y <= monitor.y && right >= monitor.x + monitor.width as i32 && bottom >= monitor.y + monitor.height as i32
}

#[cfg(windows)]
pub mod probe {
    use super::*;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::*;

    pub struct Probe;

    /// Suspended Store apps stay "visible" but are cloaked (not drawn).
    fn cloaked(hwnd: HWND) -> bool {
        use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
        let mut value = 0u32;
        unsafe { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut value as *mut u32 as *mut _, 4).is_ok() && value != 0 }
    }

    impl Probe {
        pub fn new() -> Option<Self> { Some(Self) }

        /// Topmost visible top-level window of another process under `point`.
        pub fn window_at(&self, point: (i32, i32), own_pid: u32) -> Option<(HWND, Bounds, String, u32, bool)> {
            unsafe {
                let mut hwnd = GetTopWindow(None).ok()?;
                loop {
                    let mut pid = 0u32; GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                    let mut r = RECT::default();
                    if pid != own_pid && IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() && ex & WS_EX_TOOLWINDOW.0 == 0 && !cloaked(hwnd)
                        && GetWindowRect(hwnd, &mut r).is_ok() && r.right > r.left
                        && point.0 >= r.left && point.0 < r.right && point.1 >= r.top && point.1 < r.bottom {
                        // Tests only: a copy started with AGENTOFFICE_TEST_WINDOWS sees only windows whose
                        // title holds one of those words (its own test windows); the rest count as desktop.
                        if let Some(only) = std::env::var_os("AGENTOFFICE_TEST_WINDOWS") {
                            let mut title = [0u16; 256]; let n = GetWindowTextW(hwnd, &mut title);
                            let title = String::from_utf16_lossy(&title[..n as usize]);
                            if !only.to_string_lossy().split(',').any(|w| !w.is_empty() && title.contains(w)) { hwnd = GetWindow(hwnd, GW_HWNDNEXT).ok()?; continue; }
                        }
                        let mut class = [0u16; 64]; let n = GetClassNameW(hwnd, &mut class);
                        let name = String::from_utf16_lossy(&class[..n as usize]);
                        // The desktop and taskbar are not application windows.
                        if matches!(name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") { return None; }
                        let bounds = Bounds { x: r.left, y: r.top, width: (r.right - r.left) as u32, height: (r.bottom - r.top) as u32 };
                        return Some((hwnd, bounds, name, pid, IsZoomed(hwnd).as_bool()));
                    }
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT).ok()?;
                }
            }
        }

        /// Whether the process is a web browser (Electron apps share Chrome's
        /// window class but have no browser tab strip).
        pub fn is_browser(&self, pid: u32) -> bool {
            use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
            unsafe {
                let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return false };
                let mut buffer = [0u16; 512]; let mut len = buffer.len() as u32;
                let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buffer.as_mut_ptr()), &mut len).is_ok();
                let _ = windows::Win32::Foundation::CloseHandle(process);
                if !ok { return false; }
                let path = String::from_utf16_lossy(&buffer[..len as usize]).to_lowercase();
                let exe = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_owned();
                matches!(exe.as_str(), "chrome.exe" | "msedge.exe" | "firefox.exe" | "brave.exe" | "opera.exe" | "vivaldi.exe" | "chromium.exe" | "arc.exe")
            }
        }

    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fullscreen_is_told_apart_from_maximized_and_borderless_windows() {
        let screen = Bounds { x: 0, y: 0, width: 3840, height: 2160 };
        assert!(is_fullscreen(Bounds { x: 0, y: 0, width: 3840, height: 2160 }, screen, false));
        // A maximized window with its frame, and a frameless app (ChatGPT) filling the work area.
        assert!(!is_fullscreen(Bounds { x: -16, y: -16, width: 3872, height: 2092 }, screen, true));
        assert!(!is_fullscreen(Bounds { x: 0, y: 0, width: 3840, height: 2060 }, screen, true));
        assert!(!is_fullscreen(Bounds { x: 0, y: 0, width: 3840, height: 2060 }, screen, false));
        // With the taskbar hidden a maximized window covers the screen too, but says it is zoomed.
        assert!(!is_fullscreen(Bounds { x: 0, y: 0, width: 3840, height: 2160 }, screen, true));
        assert!(!is_fullscreen(Bounds { x: 0, y: 0, width: 1920, height: 2160 }, screen, false));
    }
    #[test] fn each_place_rests_as_the_user_chose() {
        let r = |p| rest(1920, p, "capsule", "capsule", "line", "line");
        assert_eq!((r(Place::Desktop), r(Place::App), r(Place::Browser), r(Place::Fullscreen)), (Dock::Capsule(1920), Dock::Capsule(1920), Dock::Line(1920), Dock::Line(1920)));
        // A browser is not forced to the line: the user's choice wins.
        assert_eq!(rest(10, Place::Browser, "line", "line", "capsule", "hidden"), Dock::Capsule(10));
        assert_eq!(rest(10, Place::Fullscreen, "capsule", "capsule", "capsule", "hidden"), Dock::Hidden(10));
        assert_eq!(rest(10, Place::Desktop, "hidden", "line", "line", "line"), Dock::Hidden(10));
    }
}
