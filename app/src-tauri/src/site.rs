//! Which website a browser's media session plays from, and that site's own icon.
//!
//! A browser gives Windows its own logo as the picture when the page offers none; that logo is
//! no cover, so it is told apart (by comparing it with the browser program's own icon) and set
//! aside. Windows does not say which tab plays. The site is taken only when that is certain: the
//! media title matches the active tab of exactly one window of that browser, whose address bar
//! is then read through UI Automation (read only: nothing is focused, clicked or changed). The
//! icon comes from the site itself (its page's link rel=icon, else /favicon.ico), never from a
//! third party, and is kept per site.

/// The executable names of browsers whose window title and address bar are read (Chromium).
const BROWSERS: [&str; 6] = ["chrome.exe", "msedge.exe", "brave.exe", "opera.exe", "vivaldi.exe", "chromium.exe"];

/// The browser executable of a media session's app id ("chrome.exe", "MSEdge", …), if it is one.
pub fn browser_exe(aumid: &str) -> Option<&'static str> {
    let lower = aumid.to_ascii_lowercase();
    let base = lower.rsplit(['\\', '/']).next().unwrap_or(&lower);
    BROWSERS.iter().copied().find(|exe| { let name = exe.trim_end_matches(".exe"); base == *exe || base == name || base.starts_with(&format!("{name}.")) })
}

/// The tab's title in a browser window's title ("Maç - TOD - Google Chrome" → "Maç - TOD").
pub fn tab_title(window_title: &str) -> &str { window_title.rsplit_once(" - ").map_or(window_title, |(tab, _)| tab).trim() }

fn plain(s: &str) -> String { s.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase() }

/// Whether a media title is the tab's: the same, or one begins with the other (a site adds its
/// name after the video's: "Şarkı - YouTube"). Short or empty titles never match.
pub fn titles_match(media: &str, tab: &str) -> bool {
    let (m, t) = (plain(media), plain(tab));
    if m.chars().count() < 3 || t.chars().count() < 3 { return false; }
    m == t || t.starts_with(&m) || m.starts_with(&t)
}

/// The host in an address bar's text ("todtv.com.tr/mac-basliyor/", "https://www.x.com/a").
/// Only web addresses: no browser pages, files or searches.
pub fn host_of(address: &str) -> Option<String> {
    let a = address.trim();
    let rest = a.strip_prefix("https://").or_else(|| a.strip_prefix("http://")).unwrap_or(a);
    if a.contains(' ') || rest.contains("://") || a.starts_with("chrome") || a.starts_with("edge") || a.starts_with("about:") || a.starts_with("file:") { return None; }
    let host = rest.split(['/', '?', '#']).next()?.split('@').next_back()?.split(':').next()?.to_lowercase();
    let ok = host.contains('.') && host.len() <= 253 && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') && !host.starts_with('.') && !host.ends_with('.');
    ok.then_some(host)
}

/// The site a host belongs to ("www.todtv.com.tr" → "todtv.com.tr", "cdn.x.com" → "x.com").
pub fn site_of(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    let n = parts.len();
    // A country's second level ("com.tr", "co.uk") belongs to the name before it.
    let keep = if n >= 3 && parts[n - 1].len() == 2 && matches!(parts[n - 2], "com" | "net" | "org" | "gov" | "edu" | "co" | "ac" | "gen" | "web" | "bel" | "k12") { 3 } else { 2 };
    parts[n.saturating_sub(keep)..].join(".")
}

/// The icon addresses a page names (link rel=icon / shortcut icon / apple-touch-icon), best
/// first, made absolute against `https://host/`, followed by `/favicon.ico`.
pub fn icon_candidates(html: &str, host: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    let mut found: Vec<(u8, String)> = vec![];
    let mut at = 0;
    while let Some(i) = lower[at..].find("<link") {
        let start = at + i; let end = lower[start..].find('>').map_or(lower.len(), |e| start + e); at = end;
        let tag = &html[start..end]; let tag_l = &lower[start..end];
        let attr = |name: &str| -> Option<String> {
            let p = tag_l.find(&format!("{name}="))? + name.len() + 1;
            let q = tag_l[p..].chars().next()?;
            if q == '"' || q == '\'' { let s = p + 1; let e = tag_l[s..].find(q)? + s; Some(tag[s..e].trim().to_owned()) }
            else { let e = tag_l[p..].find([' ', '/', '\t', '\n']).map_or(tag_l.len(), |e| p + e); Some(tag[p..e].trim().to_owned()) }
        };
        let (Some(rel), Some(href)) = (attr("rel"), attr("href")) else { continue };
        let rel = rel.to_lowercase();
        if rel.contains("mask-icon") || href.is_empty() || href.starts_with("data:") { continue; }
        let rank = if rel.split_whitespace().any(|r| r == "icon") { 0 } else if rel.contains("apple-touch-icon") { 1 } else { continue };
        let url = if href.starts_with("https://") || href.starts_with("http://") { href }
            else if let Some(r) = href.strip_prefix("//") { format!("https://{r}") }
            else if href.starts_with('/') { format!("https://{host}{href}") }
            else { format!("https://{host}/{href}") };
        found.push((rank, url));
    }
    found.sort_by_key(|(r, _)| *r);
    let mut out: Vec<String> = found.into_iter().map(|(_, u)| u).collect();
    out.push(format!("https://{host}/favicon.ico"));
    out.dedup();
    out
}

/// The picture type of the bytes (ICO, PNG, GIF, JPEG, WebP or SVG), or nothing.
pub fn image_kind(b: &[u8]) -> Option<&'static str> {
    if b.len() < 16 { return None; }
    if b.starts_with(&[0, 0, 1, 0]) { return Some("image/x-icon"); }
    if b.starts_with(&[0x89, b'P', b'N', b'G']) { return Some("image/png"); }
    if b.starts_with(b"GIF8") { return Some("image/gif"); }
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) { return Some("image/jpeg"); }
    if b.starts_with(b"RIFF") && &b[8..12] == b"WEBP" { return Some("image/webp"); }
    let head = String::from_utf8_lossy(&b[..b.len().min(512)]).to_ascii_lowercase();
    (head.trim_start().starts_with("<svg") || (head.trim_start().starts_with("<?xml") && head.contains("<svg"))).then_some("image/svg+xml")
}

/// Whether an icon address is the site's own (its host or another host of the same site).
pub fn own_icon(url: &str, host: &str) -> bool { host_of(url).is_some_and(|h| site_of(&h) == site_of(host)) }

/// Whether a picture (RGBA) is the app's own icon (RGBA): both cut to what is not transparent,
/// laid on black and shrunk to 16×16, they differ little. A photo, a video frame or another
/// logo differs a lot.
pub fn same_picture(a: (usize, usize, &[u8]), b: (usize, usize, &[u8])) -> bool {
    let (Some(x), Some(y)) = (thumb16(a), thumb16(b)) else { return false };
    let diff: u32 = x.iter().zip(&y).map(|(p, q)| (*p as i32 - *q as i32).unsigned_abs()).sum();
    (diff as f64 / x.len() as f64) < 40.0
}

/// 16×16 RGB (composited on black) of what is not transparent in the picture.
fn thumb16((w, h, px): (usize, usize, &[u8])) -> Option<Vec<u8>> {
    if w == 0 || h == 0 || px.len() < w * h * 4 { return None; }
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0, 0);
    for y in 0..h { for x in 0..w { if px[(y * w + x) * 4 + 3] > 40 { x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x + 1); y1 = y1.max(y + 1); } } }
    if x1 <= x0 || y1 <= y0 { return None; }
    let mut out = Vec::with_capacity(16 * 16 * 3);
    for ty in 0..16 { for tx in 0..16 {
        let (sx0, sx1) = (x0 + (x1 - x0) * tx / 16, (x0 + (x1 - x0) * (tx + 1) / 16).max(x0 + (x1 - x0) * tx / 16 + 1));
        let (sy0, sy1) = (y0 + (y1 - y0) * ty / 16, (y0 + (y1 - y0) * (ty + 1) / 16).max(y0 + (y1 - y0) * ty / 16 + 1));
        let mut sum = [0u32; 3]; let mut n = 0u32;
        for y in sy0..sy1.min(h) { for x in sx0..sx1.min(w) { let i = (y * w + x) * 4; let a = px[i + 3] as u32; for c in 0..3 { sum[c] += px[i + c] as u32 * a / 255; } n += 1; } }
        for s in sum { out.push((s / n.max(1)) as u8); }
    } }
    Some(out)
}

#[cfg(windows)]
pub use win::{app_icon, site_for, icon_for};

#[cfg(windows)]
pub(crate) mod win {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::sync::{Mutex, OnceLock};

    /// The browser program's own icon (RGBA, 256 px), by executable name, read once.
    pub fn app_icon(exe: &str) -> Option<(usize, usize, Vec<u8>)> {
        static ICONS: OnceLock<Mutex<HashMap<String, Option<(usize, usize, Vec<u8>)>>>> = OnceLock::new();
        let icons = ICONS.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(v) = icons.lock().ok()?.get(exe) { return v.clone(); }
        let icon = exe_path(exe).and_then(|p| icon_pixels(&p));
        // Not found (the browser is not running yet) is asked again next time.
        if icon.is_some() { icons.lock().ok()?.insert(exe.to_owned(), icon.clone()); }
        icon
    }

    fn running(exe: &str) -> Vec<u32> {
        crate::platform::processes().unwrap_or_default().into_iter().filter(|(_, n)| n == exe).map(|(pid, _)| pid).collect()
    }

    fn exe_path(exe: &str) -> Option<String> {
        use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
        for pid in running(exe) {
            unsafe {
                let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { continue };
                let mut buffer = [0u16; 512]; let mut len = buffer.len() as u32;
                let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, windows::core::PWSTR(buffer.as_mut_ptr()), &mut len).is_ok();
                let _ = windows::Win32::Foundation::CloseHandle(process);
                if ok { return Some(String::from_utf16_lossy(&buffer[..len as usize])); }
            }
        }
        None
    }

    fn icon_pixels(path: &str) -> Option<(usize, usize, Vec<u8>)> {
        use windows_sys::Win32::Graphics::Gdi::*;
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
        let mut wide_fixed = [0u16; 260];
        for (i, c) in wide.iter().take(259).enumerate() { wide_fixed[i] = *c; }
        unsafe {
            let mut icon: HICON = std::ptr::null_mut();
            if PrivateExtractIconsW(wide_fixed.as_ptr(), 0, 256, 256, &mut icon, std::ptr::null_mut(), 1, 0) != 1 || icon.is_null() { return None; }
            let mut info: ICONINFO = std::mem::zeroed();
            let got = GetIconInfo(icon, &mut info) != 0;
            let mut result = None;
            if got && !info.hbmColor.is_null() {
                let mut bm: BITMAP = std::mem::zeroed();
                if GetObjectW(info.hbmColor, std::mem::size_of::<BITMAP>() as i32, &mut bm as *mut _ as *mut _) != 0 {
                    let (w, h) = (bm.bmWidth as usize, bm.bmHeight as usize);
                    let mut bi: BITMAPINFO = std::mem::zeroed();
                    bi.bmiHeader = BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: w as i32, biHeight: -(h as i32), biPlanes: 1, biBitCount: 32, biCompression: BI_RGB, ..std::mem::zeroed() };
                    let mut px = vec![0u8; w * h * 4];
                    let dc = GetDC(std::ptr::null_mut());
                    if GetDIBits(dc, info.hbmColor, 0, h as u32, px.as_mut_ptr() as *mut _, &mut bi, DIB_RGB_COLORS) != 0 {
                        for p in px.chunks_mut(4) { p.swap(0, 2); }
                        result = Some((w, h, px));
                    }
                    ReleaseDC(std::ptr::null_mut(), dc);
                }
            }
            if !info.hbmColor.is_null() { DeleteObject(info.hbmColor); }
            if !info.hbmMask.is_null() { DeleteObject(info.hbmMask); }
            DestroyIcon(icon);
            result
        }
    }

    /// The host the media plays from, when certain (see the module): `None` otherwise. Read
    /// again only when the media title or the browser's window titles change.
    pub fn site_for(exe: &str, media_title: &str) -> Option<String> {
        static LAST: OnceLock<Mutex<HashMap<String, (String, Option<String>)>>> = OnceLock::new();
        let windows = browser_windows(exe);
        let session = format!("{exe}\u{1}{media_title}");
        let titles = windows.iter().map(|(_, t)| t.as_str()).collect::<Vec<_>>().join("\u{2}");
        let last = LAST.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some((seen, host)) = last.lock().ok()?.get(&session) { if *seen == titles { return host.clone(); } }
        let matching: Vec<_> = windows.iter().filter(|(_, t)| titles_match(media_title, tab_title(t))).collect();
        let host = if matching.len() == 1 { address_bar(matching[0].0).and_then(|a| host_of(&a)) } else { None };
        if let Ok(mut l) = last.lock() { if l.len() > 64 { l.clear(); } l.insert(session, (titles, host.clone())); }
        host
    }

    /// The visible top-level windows of the browser, with their titles.
    fn browser_windows(exe: &str) -> Vec<(isize, String)> {
        use windows::Win32::Foundation::{HWND, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::*;
        let pids: HashSet<u32> = running(exe).into_iter().collect();
        if pids.is_empty() { return vec![]; }
        struct Ctx { pids: HashSet<u32>, out: Vec<(isize, String)> }
        unsafe extern "system" fn each(hwnd: HWND, l: LPARAM) -> windows::core::BOOL {
            let ctx = unsafe { &mut *(l.0 as *mut Ctx) };
            let mut pid = 0u32; unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)); }
            if ctx.pids.contains(&pid) && unsafe { IsWindowVisible(hwnd) }.as_bool() {
                let mut class = [0u16; 64]; let n = unsafe { GetClassNameW(hwnd, &mut class) };
                let mut title = [0u16; 512]; let m = unsafe { GetWindowTextW(hwnd, &mut title) };
                if String::from_utf16_lossy(&class[..n as usize]) == "Chrome_WidgetWin_1" && m > 0 { ctx.out.push((hwnd.0 as isize, String::from_utf16_lossy(&title[..m as usize]))); }
            }
            true.into()
        }
        let mut ctx = Ctx { pids, out: vec![] };
        unsafe { let _ = EnumWindows(Some(each), LPARAM(&mut ctx as *mut Ctx as isize)); }
        ctx.out
    }

    /// The text in a browser window's own address bar (Chromium's omnibox), read only.
    fn address_bar(hwnd: isize) -> Option<String> {
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
        use windows::Win32::System::Variant::VARIANT;
        use windows::Win32::UI::Accessibility::*;
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let uia: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let window = uia.ElementFromHandle(windows::Win32::Foundation::HWND(hwnd as *mut _)).ok()?;
            let cond = uia.CreatePropertyCondition(UIA_ClassNamePropertyId, &VARIANT::from(windows::core::BSTR::from("OmniboxViewViews"))).ok()?;
            let bar = window.FindFirst(TreeScope_Descendants, &cond).ok()?;
            let value: IUIAutomationValuePattern = bar.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
            value.CurrentValue().ok().map(|v| v.to_string())
        }
    }

    /// The site's icon as a data URL, once it has been fetched (in the background, once per
    /// site; a site without one is not asked again in this run).
    pub fn icon_for(host: &str) -> Option<String> {
        static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
        let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut c = cache.lock().ok()?;
        if let Some(v) = c.get(host) { return v.clone(); }
        c.insert(host.to_owned(), None);
        let host = host.to_owned();
        std::thread::spawn(move || {
            let icon = fetch_icon(&host);
            if let Ok(mut c) = cache.lock() { c.insert(host, icon); }
        });
        None
    }

    fn fetch_icon(host: &str) -> Option<String> {
        unsafe { let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED); }
        let page = get(&format!("https://{host}/"), 1024 * 1024).filter(|(kind, _)| kind.contains("html"));
        let html = page.map(|(_, b)| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        for url in icon_candidates(&html, host).into_iter().filter(|u| own_icon(u, host)).take(4) {
            let Some((_, bytes)) = get(&url, 512 * 1024) else { continue };
            // What the bytes are, not what the server says (an error page is no icon).
            let Some(kind) = image_kind(&bytes) else { continue };
            return Some(format!("data:{kind};base64,{}", crate::media::base64(&bytes)));
        }
        None
    }

    /// On this computer, by hand (`--ignored`): real sites' icons from the sites themselves, and
    /// the address bar of a running browser read for its active tab's title (read only).
    #[cfg(test)]
    mod live {
        #[test] #[ignore] fn real_sites_give_their_own_icon() {
            for host in ["todtv.com.tr", "www.chess.com"] {
                let icon = super::fetch_icon(host);
                println!("{host}: {}", icon.as_deref().map_or("yok".into(), |i| format!("{} ({} karakter)", &i[..i.find(';').unwrap_or(20)], i.len())));
                for url in super::icon_candidates(&super::get(&format!("https://{host}/"), 1 << 20).map(|(_, b)| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default(), host) {
                    let got = super::get(&url, 512 * 1024);
                    println!("  {url}: {:?}", got.map(|(k, b)| (k, b.len(), b.iter().take(8).copied().collect::<Vec<u8>>())));
                }
                assert!(icon.is_some(), "{host}");
            }
        }
        /// The two pictures Chrome gave Windows today: its own logo (no cover) and a channel's cover.
        #[test] #[ignore] fn chromes_own_logo_is_no_cover_but_a_channels_picture_is() {
            use windows::Graphics::Imaging::*;
            use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
            let decode = |path: &str| -> Vec<u8> {
                let bytes = std::fs::read(path).unwrap();
                let stream = InMemoryRandomAccessStream::new().unwrap();
                let writer = DataWriter::CreateDataWriter(&stream).unwrap(); writer.WriteBytes(&bytes).unwrap(); writer.StoreAsync().unwrap().join().unwrap(); let _ = writer.DetachStream(); stream.Seek(0).unwrap();
                let decoder = BitmapDecoder::CreateAsync(&stream).unwrap().join().unwrap();
                let t = BitmapTransform::new().unwrap(); t.SetScaledWidth(64).unwrap(); t.SetScaledHeight(64).unwrap();
                decoder.GetPixelDataTransformedAsync(BitmapPixelFormat::Rgba8, BitmapAlphaMode::Straight, &t, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage).unwrap().join().unwrap().DetachPixelData().unwrap().to_vec()
            };
            let dir = std::env::var("AO_ART_DIR").unwrap();
            let icon = super::app_icon("chrome.exe").expect("Chrome is running");
            let logo = decode(&format!("{dir}/live-media/art-0.png"));
            let cover = decode(&format!("{dir}/live-media2/art-0.png"));
            assert!(crate::site::same_picture((64, 64, &logo), (icon.0, icon.1, &icon.2)), "Chrome's logo");
            assert!(!crate::site::same_picture((64, 64, &cover), (icon.0, icon.1, &icon.2)), "A Spor's cover");
        }
        #[test] #[ignore] fn the_active_tab_of_a_running_browser_gives_its_site() {
            for (_, title) in super::browser_windows("chrome.exe") {
                let tab = super::tab_title(&title).to_owned();
                println!("sekme '{tab}' -> {:?}", super::site_for("chrome.exe", &tab));
                println!("başka bir başlık -> {:?}", super::site_for("chrome.exe", "Bu başlıkta bir sekme yok"));
            }
        }
    }

    /// A GET with Windows' own HTTP client: (content type, body up to `limit`), or nothing.
    fn get(url: &str, limit: usize) -> Option<(String, Vec<u8>)> {
        fetch(url, limit, false).filter(|(status, ..)| (200..300).contains(status)).map(|(_, kind, bytes)| (kind, bytes))
    }
    /// A GET with its status code and body (a 404 is an answer too), for the lyrics service.
    pub(crate) fn get_status(url: &str, limit: usize) -> Option<(u16, Vec<u8>)> {
        fetch(url, limit, false).map(|(status, _, bytes)| (status, bytes))
    }
    /// The same, asked uncompressed: Open-Meteo's compressed answers fail Windows' own decoding (12175).
    pub(crate) fn get_plain(url: &str, limit: usize) -> Option<(u16, Vec<u8>)> {
        fetch(url, limit, true).map(|(status, _, bytes)| (status, bytes))
    }
    /// The request as this app (it names itself, as the services ask), within a few seconds.
    fn fetch(url: &str, limit: usize, plain: bool) -> Option<(u16, String, Vec<u8>)> {
        use std::time::{Duration, Instant};
        use windows::Web::Http::{HttpClient, HttpCompletionOption};
        use windows_future::AsyncStatus;
        unsafe { let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED); }
        let client = if plain { let filter = windows::Web::Http::Filters::HttpBaseProtocolFilter::new().ok()?; filter.SetAutomaticDecompression(false).ok()?; HttpClient::Create(&filter).ok()? } else { HttpClient::new().ok()? };
        if let Ok(headers) = client.DefaultRequestHeaders() { if let Ok(agent) = headers.UserAgent() { let _ = agent.TryParseAdd(&windows::core::HSTRING::from("AgentOffice/0.1 (masaustu centik uygulamasi)")); } }
        let uri = windows::Foundation::Uri::CreateUri(&windows::core::HSTRING::from(url)).ok()?;
        let op = client.GetWithOptionAsync(&uri, HttpCompletionOption::ResponseContentRead).ok()?;
        let end = Instant::now() + Duration::from_secs(8);
        loop {
            match op.Status().ok()? {
                AsyncStatus::Completed => break,
                AsyncStatus::Started if Instant::now() < end => std::thread::sleep(Duration::from_millis(20)),
                _ => { let _ = op.Cancel(); return None; }
            }
        }
        let response = op.GetResults().ok()?;
        let status = response.StatusCode().ok()?.0 as u16;
        let content = response.Content().ok()?;
        let kind = content.Headers().ok().and_then(|h| h.ContentType().ok()).and_then(|t| t.MediaType().ok()).map(|t| t.to_string().to_lowercase()).unwrap_or_default();
        let read = content.ReadAsBufferAsync().ok()?;
        let end = Instant::now() + Duration::from_secs(8);
        loop {
            match read.Status().ok()? {
                AsyncStatus::Completed => break,
                AsyncStatus::Started if Instant::now() < end => std::thread::sleep(Duration::from_millis(20)),
                _ => { let _ = read.Cancel(); return None; }
            }
        }
        let buffer = read.GetResults().ok()?;
        let len = (buffer.Length().ok()? as usize).min(limit);
        let reader = windows::Storage::Streams::DataReader::FromBuffer(&buffer).ok()?;
        let mut bytes = vec![0u8; len];
        reader.ReadBytes(&mut bytes).ok()?;
        Some((status, kind, bytes))
    }
}

#[cfg(not(windows))]
pub fn app_icon(_: &str) -> Option<(usize, usize, Vec<u8>)> { None }
#[cfg(not(windows))]
pub fn site_for(_: &str, _: &str) -> Option<String> { None }
#[cfg(not(windows))]
pub fn icon_for(_: &str) -> Option<String> { None }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn browsers_are_known_by_their_media_id() {
        assert_eq!(browser_exe("chrome.exe"), Some("chrome.exe"));
        assert_eq!(browser_exe("Chrome"), Some("chrome.exe"));
        assert_eq!(browser_exe("MSEdge"), Some("msedge.exe"));
        assert_eq!(browser_exe("Spotify.exe"), None);
        assert_eq!(browser_exe("308046B0AF4A39CB"), None, "Firefox's address bar is not read");
    }
    #[test] fn the_media_must_be_the_active_tab() {
        assert_eq!(tab_title("TOD - Google Chrome"), "TOD");
        assert_eq!(tab_title("Şarkı adı - YouTube - Google Chrome"), "Şarkı adı - YouTube");
        assert!(titles_match("TOD", "TOD"));
        assert!(titles_match("Şarkı adı", "Şarkı adı - YouTube"));
        assert!(titles_match("A Spor Canlı Yayın 🔴", "A Spor Canlı Yayın"));
        assert!(!titles_match("A Spor Canlı Yayın 🔴", "TOD"), "another tab plays: no site");
        assert!(!titles_match("", "TOD"));
    }
    #[test] fn only_web_addresses_give_a_site() {
        assert_eq!(host_of("todtv.com.tr/mac-basliyor/").as_deref(), Some("todtv.com.tr"));
        assert_eq!(host_of("https://www.YouTube.com/watch?v=1").as_deref(), Some("www.youtube.com"));
        assert_eq!(host_of("chrome://settings"), None);
        assert_eq!(host_of("hava durumu"), None);
        assert_eq!(host_of("localhost:3000/x"), None);
        assert_eq!(site_of("www.todtv.com.tr"), "todtv.com.tr");
        assert_eq!(site_of("i.ytimg.com"), "ytimg.com");
    }
    #[test] fn icons_come_from_the_page_or_the_site_root() {
        let html = r#"<head><link rel="stylesheet" href="/a.css"><link rel="apple-touch-icon" href="/touch.png"><link href="https://static.todtv.com.tr/fav.png" rel="shortcut icon"><link rel="mask-icon" href="/m.svg"></head>"#;
        assert_eq!(icon_candidates(html, "todtv.com.tr"), vec!["https://static.todtv.com.tr/fav.png", "https://todtv.com.tr/touch.png", "https://todtv.com.tr/favicon.ico"]);
        assert_eq!(icon_candidates("", "x.com"), vec!["https://x.com/favicon.ico"]);
        assert!(own_icon("https://static.todtv.com.tr/fav.png", "todtv.com.tr"));
        assert!(!own_icon("https://www.google.com/s2/favicons?domain=todtv.com.tr", "todtv.com.tr"), "never a third party");
    }
    #[test] fn only_pictures_are_taken_as_icons() {
        assert_eq!(image_kind(&[0, 0, 1, 0, 3, 0, 16, 16, 0, 0, 0, 0, 0, 0, 0, 0]), Some("image/x-icon"));
        assert_eq!(image_kind(b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>"), Some("image/svg+xml"));
        assert_eq!(image_kind(b"<!doctype html><html><title>404</title></html>"), None, "an error page at /favicon.ico");
    }
    #[test] fn the_browsers_own_logo_is_told_from_a_cover() {
        // A round logo on transparency, the same logo smaller with a margin, and a photo.
        let logo = |size: usize, margin: usize| { let mut px = vec![0u8; size * size * 4]; let c = size as f64 / 2.0; let r = c - margin as f64;
            for y in 0..size { for x in 0..size { let (dx, dy) = (x as f64 + 0.5 - c, y as f64 + 0.5 - c); if dx * dx + dy * dy <= r * r { let i = (y * size + x) * 4; let red = dy < 0.0; px[i..i + 4].copy_from_slice(&if red { [219, 68, 55, 255] } else { [15, 157, 88, 255] }); } } } px };
        let big = logo(256, 0); let small = logo(32, 3);
        assert!(same_picture((256, 256, &big), (32, 32, &small)));
        let photo: Vec<u8> = (0..64 * 36).flat_map(|i| [(i % 64 * 4) as u8, 120, (i / 64 * 7) as u8, 255]).collect();
        assert!(!same_picture((64, 36, &photo), (32, 32, &small)));
    }
}
