//! What is playing on this computer, from Windows' own media sessions (the list the volume
//! flyout shows): each app's title, artist, album art or video picture, whether it plays, which
//! controls it really offers and, when it has one, its timeline. Read on a thread of its own
//! once a second and at once after a control; a control is only ever sent on the user's click.
//! A session without a sensible timeline (a live stream, an app that gives none) has no
//! timeline here, so no made-up remaining time is ever shown.
use serde::Serialize;
use std::sync::{mpsc, Arc, Mutex, OnceLock};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSession {
    /// The app's id (and a number when one app has several sessions).
    pub id: String,
    /// The app's name as people know it ("Spotify", "Google Chrome").
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// "playing", "paused", "stopped", "changing" or "closed".
    pub status: String,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
    /// The app offers "stop" (most browsers and players do not).
    pub can_stop: bool,
    /// When it last started playing (ms since 1970; 0: not seen starting), so the one that started
    /// last is the one shown when several play.
    pub playing_since: u64,
    /// When AgentOffice last saw it playing (ms; 0: not since AgentOffice started). A browser
    /// keeps a paused tab's session for days; one not played lately is not "what plays now".
    pub last_played: u64,
    /// Where it is and how long it is (ms), only when the app gives a real timeline.
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    /// When the position was read (ms since 1970) and the playback rate, so it can move on.
    pub read_at: u64,
    pub rate: f64,
    /// The picture as a data URL (album art, or the video's picture from a browser), if any. A
    /// browser's own logo, which it gives when the page has no picture, is not one.
    pub art: Option<String>,
    /// For a browser: the website it plays from, when that is certain (see `site`), and that
    /// site's own icon once fetched.
    pub site: Option<String>,
    pub site_icon: Option<String>,
    /// Windows' current session (the one its own media keys control).
    pub current: bool,
}

pub enum Control { Play, Pause, Toggle, Next, Prev, Stop, Seek(u64) }

static SEND: OnceLock<mpsc::Sender<(String, Control)>> = OnceLock::new();
static LAST: OnceLock<Arc<Mutex<Vec<MediaSession>>>> = OnceLock::new();

/// The sessions as last read.
pub fn sessions() -> Vec<MediaSession> { LAST.get().and_then(|l| l.lock().ok().map(|v| v.clone())).unwrap_or_default() }

/// Sends a control to a session (on the media thread). False when the reader is not running.
pub fn control(id: String, c: Control) -> bool { SEND.get().is_some_and(|s| s.send((id, c)).is_ok()) }

/// The name people know an app by, from its id.
pub fn app_name(aumid: &str) -> String {
    let lower = aumid.to_ascii_lowercase();
    let known: [(&str, &str); 17] = [
        ("spotify", "Spotify"), ("msedge", "Microsoft Edge"), ("microsoftedge", "Microsoft Edge"), ("chrome", "Google Chrome"), ("firefox", "Firefox"),
        ("brave", "Brave"), ("opera", "Opera"), ("vivaldi", "Vivaldi"), ("vlc", "VLC"), ("zunemusic", "Medya Oynatıcı"), ("zunevideo", "Film ve TV"),
        ("applemusic", "Apple Music"), ("itunes", "iTunes"), ("cinhimbnkkaeohfgghhklpknlkffjgod", "YouTube Music"), ("foobar2000", "foobar2000"), ("aimp", "AIMP"), ("discord", "Discord"),
    ];
    if let Some((_, name)) = known.iter().find(|(k, _)| lower.contains(k)) { return (*name).into(); }
    // Firefox's id is a 16-digit hex hash of where it is installed.
    if aumid.len() == 16 && aumid.chars().all(|c| c.is_ascii_hexdigit()) { return "Firefox".into(); }
    // "Publisher.AppName_8wekyb3d8bbwe!App", "C:\\…\\app.exe": the app's own part, words split.
    let base = aumid.rsplit(['\\', '/']).next().unwrap_or(aumid);
    let base = base.split('!').next().unwrap_or(base);
    let base = base.split('_').next().unwrap_or(base);
    let base = base.trim_end_matches(".exe").trim_end_matches(".EXE");
    let base = base.rsplit('.').next().unwrap_or(base);
    let mut out = String::new();
    for (i, c) in base.chars().enumerate() { if i > 0 && c.is_uppercase() && !out.ends_with(' ') { out.push(' '); } out.push(c); }
    if out.trim().is_empty() { "Bilinmeyen uygulama".into() } else { out }
}

/// A timeline worth showing: positive length between 1 s and a day (a live stream's is not).
pub fn timeline(start: i64, end: i64, position: i64, updated_ft: i64, now_ft: i64, rate: f64, playing: bool) -> (Option<u64>, Option<u64>) {
    let length = end - start;
    if !(10_000_000..=864_000_000_000).contains(&length) { return (None, None); }
    let mut at = position - start;
    let age = now_ft - updated_ft;
    if playing && (0..36_000_000_000).contains(&age) { at += (age as f64 * if rate > 0.0 { rate } else { 1.0 }) as i64; }
    let at = at.clamp(0, length);
    (Some((at / 10_000) as u64), Some((length / 10_000) as u64))
}

pub(crate) fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 { if i <= chunk.len() { out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char); } else { out.push('='); } }
    }
    out
}

/// Starts the reader; `changed` gets the sessions whenever something other than the moving
/// position changes (a seek counts).
#[cfg(windows)]
pub fn watch(changed: impl Fn(Vec<MediaSession>) + Send + 'static) {
    let (tx, rx) = mpsc::channel::<(String, Control)>();
    if SEND.set(tx).is_err() { return; }
    let last = LAST.get_or_init(|| Arc::new(Mutex::new(vec![]))).clone();
    std::thread::spawn(move || {
        use std::time::{Duration, Instant};
        use windows::Media::Control::*;
        use windows_future::AsyncStatus;
        unsafe { let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED); }
        // An async call that never answers (a hung app) is given up after a while, never waited on forever.
        macro_rules! wait { ($op:expr, $ms:expr) => {{
            let mut result = None;
            if let Ok(op) = $op {
                let end = Instant::now() + Duration::from_millis($ms);
                loop {
                    match op.Status() {
                        Ok(AsyncStatus::Completed) => { result = op.GetResults().ok(); break; }
                        Ok(AsyncStatus::Started) if Instant::now() < end => std::thread::sleep(Duration::from_millis(5)),
                        Ok(AsyncStatus::Started) => { let _ = op.Cancel(); break; }
                        _ => break,
                    }
                }
            }
            result
        }}; }
        let Some(manager) = wait!(GlobalSystemMediaTransportControlsSessionManager::RequestAsync(), 5000) else { return };
        let now_ft = || (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() / 100).unwrap_or(0) as i64) + 116_444_736_000_000_000;
        // Pictures by session and track: read once per track (again if the first read came empty).
        let mut art: std::collections::HashMap<String, (String, Option<String>, u8)> = std::collections::HashMap::new();
        // The picture's pixels (64x64 RGBA), decoded by Windows, to tell a browser's logo from a cover.
        let pixels = |bytes: &[u8]| -> Option<Vec<u8>> {
            use windows::Graphics::Imaging::*;
            use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
            let stream = InMemoryRandomAccessStream::new().ok()?;
            let writer = DataWriter::CreateDataWriter(&stream).ok()?;
            writer.WriteBytes(bytes).ok()?;
            wait!(writer.StoreAsync(), 2000)?;
            let _ = writer.DetachStream();
            stream.Seek(0).ok()?;
            let decoder = wait!(BitmapDecoder::CreateAsync(&stream), 2000)?;
            let transform = BitmapTransform::new().ok()?;
            transform.SetScaledWidth(64).ok()?; transform.SetScaledHeight(64).ok()?; transform.SetInterpolationMode(BitmapInterpolationMode::Fant).ok()?;
            let data = wait!(decoder.GetPixelDataTransformedAsync(BitmapPixelFormat::Rgba8, BitmapAlphaMode::Straight, &transform, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage), 2000)?;
            data.DetachPixelData().ok().map(|a| a.to_vec())
        };
        let mut sent: Vec<MediaSession> = vec![];
        let picture = |props: &GlobalSystemMediaTransportControlsSessionMediaProperties, browser: Option<&str>| -> Option<String> {
            let thumb = props.Thumbnail().ok()?;
            let stream = wait!(thumb.OpenReadAsync(), 2000)?;
            let size = stream.Size().ok()?.min(8 * 1024 * 1024) as u32;
            if size == 0 { return None; }
            let kind = stream.ContentType().map(|t| t.to_string()).ok().filter(|t| t.starts_with("image/")).unwrap_or_else(|| "image/png".into());
            let reader = windows::Storage::Streams::DataReader::CreateDataReader(&stream).ok()?;
            let got = wait!(reader.LoadAsync(size), 2000)?;
            let mut buf = vec![0u8; got as usize];
            reader.ReadBytes(&mut buf).ok()?;
            // A browser's own logo in place of a picture is no picture.
            if let Some(icon) = browser.and_then(crate::site::app_icon) {
                if pixels(&buf).is_some_and(|px| crate::site::same_picture((64, 64, &px), (icon.0, icon.1, &icon.2))) { return None; }
            }
            Some(format!("data:{kind};base64,{}", base64(&buf)))
        };
        let mut next_read = Instant::now();
        // When each session last started playing.
        let mut since: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        let mut played: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        loop {
            // A control from the user, or the next read.
            let wait_for = next_read.saturating_duration_since(Instant::now());
            let mut acted = false;
            if let Ok((id, c)) = rx.recv_timeout(wait_for) {
                let sessions = manager.GetSessions().ok();
                let n = sessions.as_ref().and_then(|s| s.Size().ok()).unwrap_or(0);
                let mut seen: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
                for i in 0..n {
                    let Some(s) = sessions.as_ref().and_then(|v| v.GetAt(i).ok()) else { continue };
                    let aumid = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
                    let k = seen.entry(aumid.clone()).or_insert(0); *k += 1;
                    let sid = if *k == 1 { aumid } else { format!("{aumid}#{k}") };
                    if sid != id { continue; }
                    let _ = match c {
                        Control::Play => wait!(s.TryPlayAsync(), 2000),
                        Control::Pause => wait!(s.TryPauseAsync(), 2000),
                        Control::Toggle => wait!(s.TryTogglePlayPauseAsync(), 2000),
                        Control::Next => wait!(s.TrySkipNextAsync(), 2000),
                        Control::Prev => wait!(s.TrySkipPreviousAsync(), 2000),
                        Control::Stop => wait!(s.TryStopAsync(), 2000),
                        Control::Seek(ms) => { let start = s.GetTimelineProperties().and_then(|t| t.StartTime()).map(|t| t.Duration).unwrap_or(0); wait!(s.TryChangePlaybackPositionAsync(start + ms as i64 * 10_000), 2000) }
                    };
                }
                acted = true;
                std::thread::sleep(Duration::from_millis(250));
            }
            if !acted && Instant::now() < next_read { continue; }
            next_read = Instant::now() + Duration::from_millis(1000);
            let current = manager.GetCurrentSession().ok().and_then(|s| s.SourceAppUserModelId().ok()).map(|h| h.to_string());
            let sessions = manager.GetSessions().ok();
            let n = sessions.as_ref().and_then(|s| s.Size().ok()).unwrap_or(0);
            let mut list = vec![];
            let mut seen: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            for i in 0..n {
                let Some(s) = sessions.as_ref().and_then(|v| v.GetAt(i).ok()) else { continue };
                let aumid = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
                let k = seen.entry(aumid.clone()).or_insert(0); *k += 1;
                let id = if *k == 1 { aumid.clone() } else { format!("{aumid}#{k}") };
                let Some(props) = wait!(s.TryGetMediaPropertiesAsync(), 1500) else { continue };
                let title = props.Title().map(|h| h.to_string()).unwrap_or_default();
                let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
                let album = props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();
                let info = s.GetPlaybackInfo().ok();
                let status = match info.as_ref().and_then(|i| i.PlaybackStatus().ok()) {
                    Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) => "playing",
                    Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused) => "paused",
                    Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped) => "stopped",
                    Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Changing) => "changing",
                    _ => "closed",
                };
                let controls = info.as_ref().and_then(|i| i.Controls().ok());
                let can = |f: &dyn Fn(&GlobalSystemMediaTransportControlsSessionPlaybackControls) -> windows::core::Result<bool>| controls.as_ref().and_then(|c| f(c).ok()).unwrap_or(false);
                let rate = info.as_ref().and_then(|i| i.PlaybackRate().ok()).and_then(|r| r.Value().ok()).unwrap_or(1.0);
                let t = s.GetTimelineProperties().ok();
                let span = |f: &dyn Fn(&GlobalSystemMediaTransportControlsSessionTimelineProperties) -> windows::core::Result<windows::Foundation::TimeSpan>| t.as_ref().and_then(|t| f(t).ok()).map(|v| v.Duration).unwrap_or(0);
                let updated = t.as_ref().and_then(|t| t.LastUpdatedTime().ok()).map(|d| d.UniversalTime).unwrap_or(0);
                let (position_ms, duration_ms) = timeline(span(&|t| t.StartTime()), span(&|t| t.EndTime()), span(&|t| t.Position()), updated, now_ft(), rate, status == "playing");
                // The picture, once per track (a late picture is read up to three times).
                let track = format!("{title}\u{1}{artist}\u{1}{album}");
                let entry = art.entry(id.clone()).or_insert_with(|| (String::new(), None, 0));
                if entry.0 != track || (entry.1.is_none() && entry.2 < 3) {
                    if entry.0 != track { *entry = (track, None, 0); }
                    entry.2 += 1; entry.1 = picture(&props, crate::site::browser_exe(&aumid));
                }
                // The website, only when certain, and its own icon (fetched once per site).
                let site = crate::site::browser_exe(&aumid).filter(|_| !title.is_empty()).and_then(|exe| crate::site::site_for(exe, &title));
                let site_icon = site.as_deref().and_then(crate::site::icon_for);
                let was = sent.iter().find(|x| x.id == id).map(|x| x.status == "playing").unwrap_or(false);
                if status == "playing" && !was { since.insert(id.clone(), crate::relay::now()); }
                let playing_since = if status == "playing" { since.get(&id).copied().unwrap_or(0) } else { 0 };
                // Only a real change of what plays counts (the same paused tab re-reported does not).
                if status == "playing" { played.insert(id.clone(), crate::relay::now()); }
                let last_played = played.get(&id).copied().unwrap_or(0);
                list.push(MediaSession {
                    app: app_name(&aumid), title, artist, album, status: status.into(),
                    can_play: can(&|c| c.IsPlayEnabled()), can_pause: can(&|c| c.IsPauseEnabled()), can_next: can(&|c| c.IsNextEnabled()), can_prev: can(&|c| c.IsPreviousEnabled()),
                    can_seek: can(&|c| c.IsPlaybackPositionEnabled()) && duration_ms.is_some(), can_stop: can(&|c| c.IsStopEnabled()), playing_since, last_played,
                    position_ms, duration_ms, read_at: crate::relay::now(), rate, art: entry.1.clone(), site, site_icon, current: current.as_deref() == Some(aumid.as_str()) && *k == 1, id,
                });
            }
            art.retain(|id, _| list.iter().any(|s| &s.id == id));
            since.retain(|id, _| list.iter().any(|s| &s.id == id));
            played.retain(|id, _| list.iter().any(|s| &s.id == id));
            // Sent when something but the moving position changed, or the position jumped (a seek).
            let same = list.len() == sent.len() && list.iter().zip(&sent).all(|(a, b)| {
                let moved = match (a.position_ms, b.position_ms) {
                    (Some(pa), Some(pb)) => { let expect = pb as f64 + if b.status == "playing" { (a.read_at.saturating_sub(b.read_at)) as f64 * b.rate } else { 0.0 }; (pa as f64 - expect).abs() > 2500.0 }
                    (x, y) => x.is_some() != y.is_some(),
                };
                !moved && MediaSession { position_ms: None, read_at: 0, last_played: 0, ..a.clone() } == MediaSession { position_ms: None, read_at: 0, last_played: 0, ..b.clone() }
            });
            if let Ok(mut l) = last.lock() { *l = list.clone(); }
            if !same || acted { sent = list.clone(); changed(list); }
        }
    });
}
#[cfg(not(windows))]
pub fn watch(_: impl Fn(Vec<MediaSession>) + Send + 'static) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn apps_are_named_as_people_know_them() {
        assert_eq!(app_name("Spotify.exe"), "Spotify");
        assert_eq!(app_name("SpotifyAB.SpotifyMusic_zpnnbk7mvt3dh!Spotify"), "Spotify");
        assert_eq!(app_name("MSEdge"), "Microsoft Edge");
        assert_eq!(app_name("Chrome"), "Google Chrome");
        assert_eq!(app_name("308046B0AF4A39CB"), "Firefox");
        assert_eq!(app_name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "Medya Oynatıcı");
        assert_eq!(app_name("C:\\Apps\\TidalPlayer.exe"), "Tidal Player");
    }
    #[test] fn a_live_stream_or_missing_timeline_has_no_remaining_time() {
        // Live (Chromium overflows the length), none at all, and an hour-long video.
        assert_eq!(timeline(0, -3_000_000_000, 5_000_000, 0, 0, 1.0, true), (None, None));
        assert_eq!(timeline(0, 0, 0, 0, 0, 1.0, true), (None, None));
        assert_eq!(timeline(0, 36_000_000_000, 6_000_000_000, 1_000, 1_000, 1.0, true), (Some(600_000), Some(3_600_000)));
        // Read 2 s after the app last said where it was: it has moved on (and never past the end).
        assert_eq!(timeline(0, 36_000_000_000, 6_000_000_000, 0, 20_000_000, 1.0, true).0, Some(602_000));
        assert_eq!(timeline(0, 36_000_000_000, 6_000_000_000, 0, 20_000_000, 1.0, false).0, Some(600_000));
        assert_eq!(timeline(0, 36_000_000_000, 35_999_000_000, 0, 50_000_000, 1.0, true).0, Some(3_600_000));
    }
    #[test] fn pictures_are_encoded_as_data() { assert_eq!(base64(b"Man"), "TWFu"); assert_eq!(base64(b"Ma"), "TWE="); assert_eq!(base64(b"M"), "TQ=="); }
}
