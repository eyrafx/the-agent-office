//! The user's settings, one record for the notch and the office: kept in the notch's settings
//! file, applied at once in both windows, and checked here (every number within its limits,
//! every choice one of its values) so a bad value is never saved or shown.
use serde::{Deserialize, Serialize};

/// Whether a kind of notification opens the notch, and whether it sounds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notify { pub open: bool, pub sound: bool }

/// One page of the island, in the user's order, and whether it is shown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PageChoice { pub id: String, pub on: bool }

/// The weather's place, as the user picked it from Open-Meteo's geocoder (its name in the user's
/// language then, where it is, its country and time zone): the forecast is asked by these coordinates.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherPlace { pub name: String, pub admin1: String, pub country: String, pub country_code: String, pub latitude: f64, pub longitude: f64, pub timezone: String }

/// The island's pages, in their default order. The agents page is always shown: questions
/// and permissions must stay reachable.
pub const PAGES: [&str; 7] = ["agents", "media", "notes", "focus", "alarms", "water", "shelf"];
/// The system signs the user may turn on (see indicators.rs).
pub const SIGNS: [&str; 6] = ["volume", "caps", "language", "battery", "wifi", "audio"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Before the three places had their own choice: one rest look for all. Kept only to carry
    /// a former choice over (see `from_file`); the places below decide.
    pub notch_mode: String,
    /// The rest look over the bare desktop, over an application and over a browser: "capsule"
    /// (the small island, with the clock and a short state), "line" (a thin line) or "hidden"
    /// (nothing; it opens when the pointer reaches the top edge there). The detail panel is
    /// never pinned by these; pinning it is a separate, passing act.
    pub rest_desktop: String,
    pub rest_apps: String,
    pub rest_browsers: String,
    /// Over a real full-screen window (a video, a game, F11): "line" or "hidden".
    pub fullscreen_rest: String,
    /// Where the island sits along the top edge, per screen (its system name): the centre as a
    /// share of the screen's width, 0-1. Absent: the middle.
    pub positions: std::collections::BTreeMap<String, f64>,
    /// Milliseconds the pointer rests on the notch before it opens (0–1500).
    pub hover_delay: u32,
    /// Milliseconds after the pointer leaves before it closes (0–3000).
    pub close_delay: u32,
    /// Opening and closing speed, percent of normal (50–200).
    pub animation_speed: u32,
    /// Seconds a new notification keeps the notch open (3–60).
    pub alert_hold: u32,
    /// The screen the notch is on, by its system name; empty: the main screen.
    pub monitor: String,
    /// Size of the notch, percent (90, 100 or 110).
    pub scale: u32,
    /// How dark the glass is, 0–100 (50 is the approved look).
    pub glass_darkness: u32,
    /// The orange breathing light of the resting line.
    pub rest_light: bool,
    /// Brightness of that light, percent (30–100).
    pub light_brightness: u32,
    /// Breathing speed of that light, percent of normal (50–200).
    pub breath_speed: u32,
    /// The notch shows in screenshots and recordings (then without live glass).
    pub capturable: bool,
    pub reduced_motion: bool,
    /// "system" (the system's language when the app has it, else English) or a language (`i18n::IDS`).
    pub language: String,
    pub muted: bool,
    /// Sound volume, 0–100.
    pub volume: u32,
    pub notify_request: Notify,
    pub notify_error: Notify,
    pub notify_reply: Notify,
    /// Stay quiet (nothing opens, no sound) while a full-screen app runs / with do-not-disturb on.
    pub quiet_fullscreen: bool,
    pub quiet_dnd: bool,
    /// Global shortcuts, as "Ctrl+Alt+Space".
    pub shortcut_open: String,
    pub shortcut_mute: String,
    /// The office's former browser-kept preferences (language, motion) were carried over.
    pub ui_migrated: bool,
    /// The first-run screen was answered (tools connected, or skipped). A file from before the screen
    /// existed counts as answered.
    pub setup_done: bool,
    /// The island's look: "glass" (live smoked glass) or "dark" (plain black, no desktop capture).
    pub island_theme: String,
    /// The island's pages in order, each shown or hidden (agents always shown).
    pub pages: Vec<PageChoice>,
    /// The page the island opens on: "last" (the last one used) or a page.
    pub start_page: String,
    /// What the closed island shows: "auto", "agents", "media" or "focus".
    pub collapsed: String,
    /// Focus timer lengths in minutes, and after how many focus rounds a long break comes.
    pub focus_minutes: u32,
    pub short_break: u32,
    pub long_break: u32,
    pub long_every: u32,
    pub notify_focus: Notify,
    pub notify_reminder: Notify,
    /// Seconds a Claude question waits in AgentOffice so it can be answered here, before it passes
    /// to Claude's own window (0: never held; answered in Claude).
    pub ask_hold: u32,
    /// A click on a notification or a waiting question: "office" (show the agent in its office)
    /// or "source" (open its chat in Claude or Codex).
    pub notify_click: String,
    /// The user allowed asking LRCLIB (lrclib.net) for a song's lyrics: its title, artist, album
    /// and length are sent then, nothing else.
    pub lyrics_online: bool,
    /// The system signs shown briefly on the closed island (none at first).
    pub indicators: Vec<String>,
    /// The mascot's idle moves (blinking, a wave now and then).
    pub idle_motion: bool,
    /// The island goes without the mascot (closed, open and in its header).
    pub hide_mascot: bool,
    /// The battery on the small island (a computer with one): in the left slot without the mascot,
    /// in the status strip and as a short note on plugging in, unplugging and at 20 % / 10 % with it.
    pub status_battery: bool,
    /// The status strip's other items beside the time: headphones / a headset in use, the weather
    /// (Open-Meteo, for the place the user picked: off until then) and the next alarm.
    pub status_audio: bool,
    pub status_weather: bool,
    pub weather_place: Option<WeatherPlace>,
    /// A city typed before the picker (free text): resolved once to a place, else the user picks.
    pub weather_city: String,
    pub status_alarm: bool,
    /// The small island's clock: "time" (14:05) or "date" (Sal 14:05).
    pub clock_style: String,
    /// The thin line's colour: "amber", "blue", "green", "pink" or "white".
    pub line_color: String,
    /// The colours of what waits: "warm" (amber question, red permission), "cool" (blue, violet)
    /// or "contrast" (yellow, white on red). Each also has its own words and mark.
    pub alert_colors: String,
    /// The notification sound: "soft", "bell", "pop" or "double".
    pub sound: String,
}

/// The factory settings: the user's own island as they set it up (28 Oct 2026), less what is theirs
/// alone or needs their consent (language, lyrics online, weather and its place, the screen) and the
/// internal or former keys (notch_mode only carries files from before the three places). Kept equal to
/// `tests/fixtures/factory-settings.json`, which the page's defaults are checked against too.
impl Default for Settings {
    fn default() -> Self {
        Self {
            notch_mode: "capsule".into(), rest_desktop: "capsule".into(), rest_apps: "capsule".into(), rest_browsers: "hidden".into(), fullscreen_rest: "line".into(), positions: Default::default(), hover_delay: 0, close_delay: 60, animation_speed: 100, alert_hold: 10,
            monitor: String::new(), scale: 90, glass_darkness: 0, rest_light: true, light_brightness: 100, breath_speed: 100,
            capturable: true, reduced_motion: false, language: "system".into(), muted: false, volume: 100,
            notify_request: Notify { open: true, sound: true }, notify_error: Notify { open: true, sound: true }, notify_reply: Notify { open: false, sound: false },
            quiet_fullscreen: true, quiet_dnd: true, shortcut_open: "Ctrl+Alt+Space".into(), shortcut_mute: "Ctrl+Alt+M".into(), ui_migrated: false, setup_done: false,
            island_theme: "glass".into(), pages: PAGES.iter().map(|id| PageChoice { id: (*id).into(), on: true }).collect(), start_page: "last".into(), collapsed: "auto".into(),
            focus_minutes: 25, short_break: 5, long_break: 15, long_every: 4,
            notify_focus: Notify { open: true, sound: true }, notify_reminder: Notify { open: true, sound: true },
            ask_hold: 120, notify_click: "source".into(), lyrics_online: false,
            indicators: ["wifi", "caps", "language", "volume", "audio"].map(String::from).to_vec(), idle_motion: true, hide_mascot: true, status_battery: true, status_audio: true, status_weather: false, weather_place: None, weather_city: String::new(), status_alarm: true, clock_style: "date".into(), line_color: "green".into(), alert_colors: "warm".into(), sound: "double".into(),
        }
    }
}

impl Settings {
    /// Every value within its limits; an unknown choice falls back to its default.
    pub fn clamped(mut self) -> Self {
        let d = Settings::default();
        if self.notch_mode == "open" { self.notch_mode = "capsule".into(); }
        if !matches!(self.notch_mode.as_str(), "capsule" | "line" | "hidden") { self.notch_mode = d.notch_mode; }
        for (value, fallback) in [(&mut self.rest_desktop, d.rest_desktop), (&mut self.rest_apps, d.rest_apps), (&mut self.rest_browsers, d.rest_browsers)] {
            if !matches!(value.as_str(), "capsule" | "line" | "hidden") { *value = fallback; }
        }
        if !matches!(self.fullscreen_rest.as_str(), "line" | "hidden") { self.fullscreen_rest = d.fullscreen_rest; }
        self.positions.retain(|name, at| !name.is_empty() && name.len() <= 120 && at.is_finite());
        for at in self.positions.values_mut() { *at = at.clamp(0.0, 1.0); }
        while self.positions.len() > 16 { let first = self.positions.keys().next().cloned().unwrap_or_default(); self.positions.remove(&first); }
        self.hover_delay = self.hover_delay.min(1500);
        self.close_delay = self.close_delay.min(3000);
        self.animation_speed = self.animation_speed.clamp(50, 200);
        self.alert_hold = self.alert_hold.clamp(3, 60);
        if !matches!(self.scale, 90 | 100 | 110) { self.scale = d.scale; }
        self.glass_darkness = self.glass_darkness.min(100);
        self.light_brightness = self.light_brightness.clamp(30, 100);
        self.breath_speed = self.breath_speed.clamp(50, 200);
        if self.language != "system" && !crate::i18n::IDS.contains(&self.language.as_str()) { self.language = d.language; }
        self.volume = self.volume.min(100);
        if parse_shortcut(&self.shortcut_open).is_none() { self.shortcut_open = d.shortcut_open; }
        if parse_shortcut(&self.shortcut_mute).is_none() { self.shortcut_mute = d.shortcut_mute; }
        self.monitor = self.monitor.chars().take(120).collect();
        if !matches!(self.island_theme.as_str(), "glass" | "dark") { self.island_theme = d.island_theme; }
        // Each known page once, in the user's order; a page this build adds comes at the end, shown.
        let mut pages: Vec<PageChoice> = vec![];
        for p in self.pages { if PAGES.contains(&p.id.as_str()) && !pages.iter().any(|q| q.id == p.id) { pages.push(p); } }
        for id in PAGES { if !pages.iter().any(|q| q.id == id) { pages.push(PageChoice { id: id.into(), on: true }); } }
        for p in &mut pages { if p.id == "agents" { p.on = true; } }
        self.pages = pages;
        if self.start_page != "last" && !PAGES.contains(&self.start_page.as_str()) { self.start_page = d.start_page; }
        if !matches!(self.collapsed.as_str(), "auto" | "agents" | "media" | "focus") { self.collapsed = d.collapsed; }
        self.focus_minutes = self.focus_minutes.clamp(1, 120);
        self.short_break = self.short_break.clamp(1, 60);
        self.long_break = self.long_break.clamp(1, 90);
        self.long_every = self.long_every.clamp(2, 8);
        self.ask_hold = self.ask_hold.min(600);
        if !matches!(self.notify_click.as_str(), "office" | "source") { self.notify_click = d.notify_click; }
        let mut signs: Vec<String> = vec![]; for s in self.indicators { if SIGNS.contains(&s.as_str()) && !signs.contains(&s) { signs.push(s); } } self.indicators = signs;
        if !matches!(self.clock_style.as_str(), "time" | "date") { self.clock_style = d.clock_style; }
        if !matches!(self.line_color.as_str(), "amber" | "blue" | "green" | "pink" | "white") { self.line_color = d.line_color; }
        if !matches!(self.alert_colors.as_str(), "warm" | "cool" | "contrast") { self.alert_colors = d.alert_colors; }
        if !matches!(self.sound.as_str(), "soft" | "bell" | "pop" | "double") { self.sound = d.sound; }
        self.weather_city = self.weather_city.trim().chars().take(80).collect();
        self.weather_place = self.weather_place.take().filter(|p| !p.name.trim().is_empty() && p.latitude.is_finite() && p.longitude.is_finite() && p.latitude.abs() <= 90.0 && p.longitude.abs() <= 180.0).map(|mut p| {
            for s in [&mut p.name, &mut p.admin1, &mut p.country, &mut p.country_code, &mut p.timezone] { *s = s.trim().chars().take(80).collect(); }
            p
        });
        self
    }
    /// These settings with a change applied (only known fields; the rest is kept).
    pub fn merged(&self, patch: &serde_json::Value) -> Settings {
        let mut value = serde_json::to_value(self).unwrap_or_default();
        if let (Some(target), Some(changes)) = (value.as_object_mut(), patch.as_object()) {
            for (k, v) in changes { if target.contains_key(k) { target.insert(k.clone(), v.clone()); } }
        }
        serde_json::from_value::<Settings>(value).map(Settings::clamped).unwrap_or_else(|_| self.clone())
    }
    /// From the settings file: its `settings` record, or the former separate keys.
    /// A file from before the three places keeps what its one choice did: "hidden" everywhere;
    /// "line": the small island on the desktop, the line over apps and browsers; "capsule": the
    /// small island on the desktop and over apps, the line over browsers.
    ///
    /// A file that exists keeps how the island was: a setting it does not have (saved before that
    /// setting was there) takes the default it was saved under, not today's factory setting. Only a
    /// first start (no file) begins with the factory settings.
    pub fn from_file(saved: &serde_json::Value) -> Settings {
        if let Some(s) = saved.get("settings").and_then(|v| serde_json::from_value::<Settings>(v.clone()).ok()) {
            let mut s = s.before_factory(&saved["settings"]).clamped();
            if saved["settings"].get("restDesktop").is_none() { s.carry_mode(); }
            return s;
        }
        let existing = saved.as_object().is_some_and(|o| !o.is_empty());
        let mut s = if existing { Settings::default().before_factory(&serde_json::Value::Null) } else { Settings::default() };
        if saved["notchAutoHide"].as_bool() == Some(true) { s.notch_mode = "hidden".into(); }
        if let Some(v) = saved["notchInScreenshots"].as_bool() { s.capturable = v; }
        if let Some(v) = saved["notchAlerts"].as_bool() { s.notify_request.open = v; }
        if let Some(v) = saved["muted"].as_bool() { s.muted = v; }
        if s.notch_mode == "hidden" { s.carry_mode(); }
        s.clamped()
    }
    /// The defaults before the factory settings became the user's island (28 Oct 2026), for the
    /// settings a saved file does not have.
    fn before_factory(self, had: &serde_json::Value) -> Settings {
        let before = serde_json::json!({
            "restBrowsers": "line", "scale": 100, "glassDarkness": 50, "capturable": false, "muted": true, "volume": 50,
            "notifyError": { "open": false, "sound": true }, "notifyReply": { "open": false, "sound": true }, "notifyClick": "office",
            "indicators": [], "hideMascot": false, "setupDone": true, "statusAudio": false, "statusAlarm": false, "clockStyle": "time", "lineColor": "amber", "sound": "soft",
        });
        let missing: serde_json::Map<String, serde_json::Value> = before.as_object().into_iter().flatten().filter(|(k, _)| had.get(k.as_str()).is_none()).map(|(k, v)| (k.clone(), v.clone())).collect();
        self.merged(&serde_json::Value::Object(missing))
    }
    fn carry_mode(&mut self) {
        let (desktop, apps, browsers) = match self.notch_mode.as_str() { "hidden" => ("hidden", "hidden", "hidden"), "line" => ("capsule", "line", "line"), _ => ("capsule", "capsule", "line") };
        (self.rest_desktop, self.rest_apps, self.rest_browsers) = (desktop.into(), apps.into(), browsers.into());
    }
}

/// "Ctrl+Alt+Space" → (modifiers, virtual key) for RegisterHotKey. A shortcut needs Ctrl, Alt
/// or Win and one key (a letter, a digit, Space or F1–F12).
pub fn parse_shortcut(text: &str) -> Option<(u32, u32)> {
    let (mut mods, mut key) = (0u32, None);
    for part in text.split('+').map(str::trim) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= 0x2,
            "alt" => mods |= 0x1,
            "shift" => mods |= 0x4,
            "win" => mods |= 0x8,
            "space" | "boşluk" => key = Some(0x20),
            k if k.len() == 1 && k.chars().all(|c| c.is_ascii_alphanumeric()) => key = Some(k.to_ascii_uppercase().as_bytes()[0] as u32),
            k if k.starts_with('f') && k[1..].parse::<u32>().is_ok_and(|n| (1..=12).contains(&n)) => key = Some(0x70 + k[1..].parse::<u32>().ok()? - 1),
            _ => return None,
        }
    }
    ((mods & 0xB) != 0).then_some(())?;
    key.map(|k| (mods, k))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test] fn the_factory_settings_are_the_users_island_less_what_is_theirs_alone() {
        let d = Settings::default();
        let factory: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/factory-settings.json")).unwrap();
        assert_eq!(serde_json::to_value(&d).unwrap(), factory);
        // Nothing that is the user's alone or needs their consent: the system's language, no lyrics
        // asked online, no weather and no place, no screen of theirs; the quiet protections stay.
        assert_eq!((d.language.as_str(), d.lyrics_online, d.status_weather, d.weather_place.is_none(), d.weather_city.as_str(), d.monitor.as_str()), ("system", false, false, true, "", ""));
        assert_eq!((d.quiet_fullscreen, d.quiet_dnd, d.ui_migrated, d.notch_mode.as_str()), (true, true, false, "capsule"));
        assert_eq!(d.clone().clamped(), d, "the factory settings are within every limit");
    }
    #[test] fn saved_settings_keep_their_values_and_only_missing_keys_take_the_new_defaults() {
        let saved = Settings::from_file(&json!({ "settings": { "restDesktop": "capsule", "restApps": "capsule", "restBrowsers": "line", "muted": true, "scale": 100, "glassDarkness": 50, "hideMascot": false, "clockStyle": "time" } }));
        assert_eq!((saved.rest_browsers.as_str(), saved.muted, saved.scale, saved.glass_darkness, saved.hide_mascot, saved.clock_style.as_str()), ("line", true, 100, 50, false, "time"));
        assert_eq!((saved.line_color.as_str(), saved.sound.as_str(), saved.volume, saved.status_alarm), ("amber", "soft", 50, false), "settings the file never had: as it was saved");
        // A first start (no file, or an empty one) begins with the factory settings.
        assert_eq!(Settings::from_file(&json!({})), Settings::default());
        assert_eq!(Settings::from_file(&serde_json::Value::Null), Settings::default());
        // A file of the former separate keys is an existing island too.
        let former = Settings::from_file(&json!({ "muted": false }));
        assert_eq!((former.muted, former.hide_mascot, former.scale), (false, false, 100));
        // A file from before the three places still gets its places from its own one choice.
        let old = Settings::from_file(&json!({ "settings": { "volume": 70 } }));
        assert_eq!((old.rest_desktop.as_str(), old.rest_apps.as_str(), old.rest_browsers.as_str(), old.volume), ("capsule", "capsule", "line", 70));
    }
    #[test] fn only_a_real_place_is_kept_for_the_weather() {
        let d = Settings::default();
        let ist = serde_json::json!({ "name": " İstanbul ", "admin1": "İstanbul", "country": "Türkiye", "countryCode": "TR", "latitude": 41.01, "longitude": 28.95, "timezone": "Europe/Istanbul" });
        let s = d.merged(&serde_json::json!({ "weatherPlace": ist, "weatherCity": "" }));
        assert_eq!(s.weather_place.as_ref().map(|p| (p.name.as_str(), p.latitude)), Some(("İstanbul", 41.01)));
        assert_eq!(s.merged(&serde_json::json!({ "weatherPlace": null })).weather_place, None, "cleared");
        assert_eq!(d.merged(&serde_json::json!({ "weatherPlace": { "name": "x", "latitude": 200.0, "longitude": 0.0 } })).weather_place, None, "not on Earth");
        assert_eq!(d.merged(&serde_json::json!({ "weatherPlace": { "name": " ", "latitude": 1.0, "longitude": 1.0 } })).weather_place, None, "no name");
        // A file from before the picker keeps its typed city (looked up once later), with no place.
        let old = Settings::from_file(&serde_json::json!({ "settings": { "statusWeather": true, "weatherCity": "istanbul", "restDesktop": "capsule" } }));
        assert_eq!((old.weather_city.as_str(), old.weather_place.is_none()), ("istanbul", true));
    }    #[test] fn a_change_is_kept_within_its_limits() {
        let s = Settings::default().merged(&json!({"hoverDelay": 99999, "animationSpeed": 10, "alertHold": 1, "scale": 137, "notchMode": "everywhere", "volume": 70, "unknown": 1}));
        assert_eq!((s.hover_delay, s.animation_speed, s.alert_hold, s.scale, s.notch_mode.as_str(), s.volume), (1500, 50, 3, 90, "capsule", 70));
        let s = Settings::default().merged(&json!({"restApps": "hidden", "restBrowsers": "big", "fullscreenRest": "capsule", "positions": {"DISPLAY1": 1.7, "": 0.2}}));
        assert_eq!((s.rest_apps.as_str(), s.rest_browsers.as_str(), s.fullscreen_rest.as_str()), ("hidden", "hidden", "line"));
        assert_eq!(s.positions.into_iter().collect::<Vec<_>>(), vec![("DISPLAY1".to_string(), 1.0)]);
        // A wrong type changes nothing.
        assert_eq!(Settings::default().merged(&json!({"volume": "loud"})), Settings::default());
    }
    #[test] fn the_former_keys_are_carried_over() {
        let s = Settings::from_file(&json!({"notchAutoHide": true, "notchInScreenshots": true, "notchAlerts": false, "muted": false}));
        assert_eq!((s.notch_mode.as_str(), s.capturable, s.notify_request.open, s.muted), ("hidden", true, false, false));
        let back = Settings::from_file(&json!({"settings": serde_json::to_value(&s).unwrap()}));
        assert_eq!(back, s);
    }
    #[test] fn a_saved_file_with_the_removed_video_preview_still_loads() {
        let s = Settings::from_file(&json!({"settings": {"mediaPreview": false, "lyricsOnline": true, "volume": 70}}));
        assert_eq!((s.lyrics_online, s.volume), (true, 70));
        assert!(serde_json::to_value(&s).unwrap().get("mediaPreview").is_none());
    }
    #[test] fn the_mascot_is_shown_unless_the_user_hides_it() {
        // A file from before the choice existed keeps the mascot.
        assert!(!Settings::from_file(&json!({"settings": {"idleMotion": false, "volume": 70}})).hide_mascot);
        assert!(Settings::default().merged(&json!({"hideMascot": true})).hide_mascot);
    }
    #[test] fn island_pages_keep_the_users_order_and_the_agents_page() {
        let s = Settings::default().merged(&json!({"pages": [{"id": "focus", "on": true}, {"id": "agents", "on": false}, {"id": "focus", "on": false}, {"id": "games", "on": true}, {"id": "media", "on": false}], "startPage": "games", "collapsed": "music", "islandTheme": "neon", "focusMinutes": 500}));
        let order: Vec<(&str, bool)> = s.pages.iter().map(|p| (p.id.as_str(), p.on)).collect();
        assert_eq!(order, vec![("focus", true), ("agents", true), ("media", false), ("notes", true), ("alarms", true), ("water", true), ("shelf", true)]);
        assert_eq!((s.start_page.as_str(), s.collapsed.as_str(), s.island_theme.as_str(), s.focus_minutes), ("last", "auto", "glass", 120));
        // A settings file from before the island keeps every former choice and gets the island's defaults.
        let old = json!({"settings": {"notchMode": "open", "volume": 70, "shortcutOpen": "Ctrl+Alt+K", "glassDarkness": 30}});
        let s = Settings::from_file(&old);
        assert_eq!((s.notch_mode.as_str(), s.volume, s.shortcut_open.as_str(), s.glass_darkness, s.pages.len(), s.island_theme.as_str()), ("capsule", 70, "Ctrl+Alt+K", 30, 7, "glass"));
    }
    #[test] fn the_former_single_rest_choice_becomes_the_three_places() {
        let places = |s: &Settings| (s.rest_desktop.clone(), s.rest_apps.clone(), s.rest_browsers.clone());
        let of = |mode: &str| places(&Settings::from_file(&json!({"settings": {"notchMode": mode, "volume": 70}})));
        assert_eq!(of("line"), ("capsule".into(), "line".into(), "line".into()));
        assert_eq!(of("capsule"), ("capsule".into(), "capsule".into(), "line".into()));
        assert_eq!(of("hidden"), ("hidden".into(), "hidden".into(), "hidden".into()));
        assert_eq!(places(&Settings::from_file(&json!({"notchAutoHide": true}))), ("hidden".into(), "hidden".into(), "hidden".into()));
        // Once the places are saved, they are kept as they are.
        let saved = Settings::from_file(&json!({"settings": {"notchMode": "hidden", "restDesktop": "line", "restApps": "capsule", "restBrowsers": "capsule"}}));
        assert_eq!(places(&saved), ("line".into(), "capsule".into(), "capsule".into()));
    }
    #[test] fn shortcuts_need_a_modifier_and_one_key() {
        assert_eq!(parse_shortcut("Ctrl+Alt+Space"), Some((0x3, 0x20)));
        assert_eq!(parse_shortcut("Ctrl+Shift+K"), Some((0x6, b'K' as u32)));
        assert_eq!(parse_shortcut("Win+F5"), Some((0x8, 0x74)));
        assert_eq!(parse_shortcut("Shift+K"), None);
        assert_eq!(parse_shortcut("Ctrl+Alt"), None);
        assert_eq!(parse_shortcut("Ctrl+Ç"), None);
    }
}
