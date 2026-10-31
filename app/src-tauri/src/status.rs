//! What the small island's status strip can show beside the time, each item turned on by the user:
//! the battery (only on a computer that has one), the sound output (headphones or a headset, and
//! whether over Bluetooth) and the weather for the place the user picked (Open-Meteo: free, no key,
//! no account; asked every 15 minutes in one request; a failure shows nothing). Values, never words: the
//! page says them in the user's language. Read-only and light: a small thread looks every few
//! seconds, and only while an item is on.
use serde::Serialize;
use crate::settings::WeatherPlace;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status { pub battery: Option<Battery>, pub audio: Option<Audio>, pub weather: Option<Weather> }
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery { pub percent: u32, pub charging: bool }
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio { pub kind: &'static str, pub name: String, pub bluetooth: bool }
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Weather { pub temperature: f64, pub code: u32, pub place: String, pub at: u64 }

/// What the user turned on (read again on every look).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Wanted { pub battery: bool, pub audio: bool, pub weather: Option<WeatherPlace> }

/// The kind of the default sound output from its form factor (EndpointFormFactor): only
/// headphones and headsets are worth saying; speakers and the rest are the usual case.
pub fn audio_kind(form_factor: u32) -> &'static str {
    match form_factor { 3 => "headphones", 5 | 6 => "headset", 1 | 2 | 8 | 9 => "speakers", _ => "other" }
}
/// Whether the output's device sits on a Bluetooth bus (its enumerator, e.g. "BTHENUM", "BTHLE").
pub fn is_bluetooth(enumerator: &str) -> bool { let e = enumerator.to_ascii_uppercase(); e.starts_with("BTH") }

/// The battery from Windows' power status: flag 128 is "no system battery", 255 "unknown".
pub fn battery_of(flag: u8, percent: u8, ac_line: u8) -> Option<Battery> {
    (flag & 128 == 0 && flag != 255 && percent <= 100).then_some(Battery { percent: percent as u32, charging: ac_line == 1 })
}

/// The forecast models asked beside best_match, in the same single request: one model alone misses
/// light or local rain (İstanbul drizzle shown as overcast by best_match, ICON and GFS while ECMWF and
/// Météo-France had it), so they vote.
pub const WEATHER_MODELS: [&str; 4] = ["ecmwf_ifs025", "icon_seamless", "meteofrance_seamless", "gfs_seamless"];
/// The one request per refresh: best_match's current reading (`current` is not split per model, it
/// answers for the first model listed, best_match) and every model's 15-minute slots for the last
/// quarter hour, now and the next (fields suffixed `_<model>`).
pub fn weather_url(latitude: f64, longitude: f64) -> String {
    format!("https://api.open-meteo.com/v1/forecast?latitude={latitude:.3}&longitude={longitude:.3}&current=temperature_2m,weather_code,precipitation,rain,showers,snowfall&minutely_15=weather_code,precipitation,rain,showers,snowfall&past_minutely_15=1&forecast_minutely_15=2&models=best_match,{}", WEATHER_MODELS.join(","))
}

/// WMO codes that mean something falls (drizzle, rain, snow, showers, thunderstorm).
fn falls(code: u32) -> bool { matches!(code, 51..=67 | 71..=77 | 80..=86 | 95..=99) }
fn is_snow(code: u32) -> bool { matches!(code, 71..=77 | 85 | 86) }
/// What one model says over its few slots: the most that falls in a quarter hour (mm), whether it
/// snows, its strongest thunderstorm code, and whether it answered at all.
#[derive(Debug, Default, Clone, Copy)]
struct Vote { most: f64, snow: bool, storm: Option<u32>, wet: bool, answered: bool }
const WET_MM: f64 = 0.1;
fn vote(slots: &serde_json::Value, model: &str) -> Vote {
    let list = |field: &str| slots.get(format!("{field}_{model}")).and_then(|v| v.as_array()).map(|a| a.iter().map(|x| x.as_f64()).collect::<Vec<_>>()).unwrap_or_default();
    let (codes, precip, rain, showers, snow) = (list("weather_code"), list("precipitation"), list("rain"), list("showers"), list("snowfall"));
    let mut v = Vote::default();
    for i in 0..codes.len().max(precip.len()) {
        let at = |l: &Vec<Option<f64>>| l.get(i).copied().flatten();
        let code = at(&codes).map(|c| c as u32);
        let mm = at(&precip).unwrap_or(0.0).max(at(&rain).unwrap_or(0.0) + at(&showers).unwrap_or(0.0));
        if code.is_some() || at(&precip).is_some() { v.answered = true; }
        let wet = mm >= WET_MM || code.is_some_and(falls);
        if !wet { continue; }
        v.wet = true; v.most = v.most.max(mm);
        if at(&snow).unwrap_or(0.0) > 0.0 || code.is_some_and(is_snow) { v.snow = true; }
        if let Some(c) = code.filter(|c| (95..=99).contains(c)) { v.storm = Some(v.storm.map_or(c, |s| s.max(c))); }
    }
    v
}

/// The condition shown (island and office window alike), decided from one answer:
/// - best_match's current code when it already says something falls;
/// - otherwise rain or snow when at least two of the other models, and at least a third of those that
///   answered, have ≥ 0.1 mm (or a falling code) in the last, current or next quarter hour: snow when
///   they report snowfall or a snow code, or best_match's temperature is at or below 1 °C; drizzle
///   (51) under 0.25 mm a quarter hour, rain (61) under 1 mm, heavier rain (63) above; snow 71 / 73;
///   a thunderstorm (95–99) only when a model that votes wet reports one;
/// - otherwise best_match's own code (clear, cloudy, fog).
/// The temperature is always best_match's.
pub fn weather_of(answer: &serde_json::Value, place: &str, at: u64) -> Option<Weather> {
    let c = answer.get("current")?;
    let temperature = c.get("temperature_2m")?.as_f64()?;
    let best = c.get("weather_code")?.as_u64()? as u32;
    let num = |k: &str| c.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let best_mm = num("precipitation").max(num("rain") + num("showers"));
    let code = if falls(best) { best } else if best_mm >= WET_MM {
        if num("snowfall") > 0.0 || temperature <= 1.0 { 71 } else if best_mm < 0.25 { 51 } else { 61 }
    } else {
        let slots = answer.get("minutely_15").cloned().unwrap_or_default();
        let votes: Vec<Vote> = WEATHER_MODELS.iter().map(|m| vote(&slots, m)).filter(|v| v.answered).collect();
        let wet: Vec<&Vote> = votes.iter().filter(|v| v.wet).collect();
        if wet.len() >= 2 && wet.len() * 3 >= votes.len() {
            let most = wet.iter().map(|v| v.most).fold(0.0, f64::max);
            if let Some(storm) = wet.iter().filter_map(|v| v.storm).max() { storm }
            else if wet.iter().filter(|v| v.snow).count() * 2 >= wet.len() || temperature <= 1.0 { if most < 1.0 { 71 } else { 73 } }
            else if most < 0.25 { 51 } else if most < 1.0 { 61 } else { 63 }
        } else { best }
    };
    Some(Weather { temperature, code, place: place.to_owned(), at })
}
/// The places Open-Meteo's geocoder found for a name, best first, each with its population (0 when
/// not given); an answer without results (nothing found) is an empty list.
pub fn places_of(answer: &serde_json::Value) -> Vec<(WeatherPlace, u64)> {
    let text = |r: &serde_json::Value, k: &str| r.get(k).and_then(|v| v.as_str()).unwrap_or("").to_owned();
    answer.get("results").and_then(|v| v.as_array()).map(|list| list.iter().filter_map(|r| Some((WeatherPlace {
        name: text(r, "name"), admin1: text(r, "admin1"), country: text(r, "country"), country_code: text(r, "country_code").to_uppercase(),
        latitude: r.get("latitude")?.as_f64()?, longitude: r.get("longitude")?.as_f64()?, timezone: text(r, "timezone"),
    }, r.get("population").and_then(|v| v.as_u64()).unwrap_or(0)))).filter(|(p, _)| !p.name.is_empty()).collect()).unwrap_or_default()
}

/// A city typed before the picker, looked up once: one place when that is clear, else the user picks.
#[derive(Debug, Clone, PartialEq)]
pub enum Resolved { One(WeatherPlace), Choose, Nothing }
/// Clear means: the only result; or the one result named exactly as typed; or, of several named so,
/// one at least ten times as populous as the next (İstanbul, Paris in France). Otherwise (several
/// Springfields, or only near spellings of a typo) the choice is the user's.
pub fn resolve(typed: &str, found: &[(WeatherPlace, u64)]) -> Resolved {
    // Case and the Turkish dotted / dotless i do not matter ("istanbul" is İstanbul).
    let fold = |s: &str| s.trim().to_lowercase().replace('\u{307}', "").replace('ı', "i");
    if found.is_empty() { return Resolved::Nothing; }
    if found.len() == 1 { return Resolved::One(found[0].0.clone()); }
    let mut same: Vec<&(WeatherPlace, u64)> = found.iter().filter(|(p, _)| fold(&p.name) == fold(typed)).collect();
    same.sort_by(|a, b| b.1.cmp(&a.1));
    match same.as_slice() {
        [] => Resolved::Choose,
        [one] => Resolved::One(one.0.clone()),
        [top, next, ..] if top.1 >= next.1.saturating_mul(10) && top.1 > 0 => Resolved::One(top.0.clone()),
        _ => Resolved::Choose,
    }
}
/// The typed city's place: as `resolve` says in the user's language; when that leaves a choice (the
/// city is named otherwise there: "istanbul" is イスタンブール in Japanese), by its English names, the
/// place then taken from the user's-language list (same coordinates) so it keeps its name there.
pub fn resolve_typed(typed: &str, found: &[(WeatherPlace, u64)], english: impl FnOnce() -> Option<Vec<(WeatherPlace, u64)>>) -> Option<WeatherPlace> {
    match resolve(typed, found) {
        Resolved::One(p) => Some(p),
        Resolved::Nothing => None,
        Resolved::Choose => match resolve(typed, &english()?) {
            Resolved::One(en) => Some(found.iter().map(|(p, _)| p).find(|p| (p.latitude - en.latitude).abs() < 1e-4 && (p.longitude - en.longitude).abs() < 1e-4).cloned().unwrap_or(en)),
            _ => None,
        },
    }
}/// The geocoder's language: its two-letter code ("pt" for pt-BR, "zh" for zh-Hans).
pub fn geo_language(language: &str) -> String { language.split('-').next().unwrap_or("en").to_lowercase() }

/// Places for what the user is typing, named in their language; Err when the service could not be
/// reached (offline), an empty list when it found nothing.
#[cfg(windows)]
pub fn search(name: &str, language: &str) -> Result<Vec<(WeatherPlace, u64)>, ()> {
    let url = format!("https://geocoding-api.open-meteo.com/v1/search?name={}&count=8&language={}&format=json", crate::lyrics::encode(name.trim()), crate::lyrics::encode(&geo_language(language)));
    let (status, body) = crate::site::win::get_plain(&url, 256 * 1024).ok_or(())?;
    if status != 200 { return Err(()); }
    Ok(serde_json::from_slice::<serde_json::Value>(&body).map(|v| places_of(&v)).unwrap_or_default())
}
#[cfg(not(windows))]
pub fn search(_: &str, _: &str) -> Result<Vec<(WeatherPlace, u64)>, ()> { Err(()) }

/// Every 15 minutes: Open-Meteo's current and 15-minute values move on each quarter hour, so asking
/// more often only fetches the same answer again.
const WEATHER_EVERY_MS: u64 = 15 * 60 * 1000;
const WEATHER_RETRY_MS: u64 = 3 * 60 * 1000;

/// Tests only: a copy started with AGENTOFFICE_TEST_STATUS_FILE takes its battery and sound output
/// from that JSON file (`{"battery": {"percent": 76, "charging": true}, "audio": {"kind": "headphones", ...}}`),
/// so a computer without a battery or headphones can show those states.
pub fn test_state() -> Option<serde_json::Value> { std::env::var_os("AGENTOFFICE_TEST_STATUS_FILE").and_then(|f| std::fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()) }
pub fn test_battery(state: &serde_json::Value) -> Option<Battery> { let b = state.get("battery")?; Some(Battery { percent: b.get("percent")?.as_u64()? as u32, charging: b.get("charging")?.as_bool()? }) }
/// Tests only: {"weather": {"code": 61, "temperature": 12.5, "place": "İstanbul"}} stands for a fresh reading.
fn test_weather(state: &serde_json::Value) -> Option<Weather> { let w = state.get("weather")?; Some(Weather { temperature: w.get("temperature").and_then(|v| v.as_f64()).unwrap_or(12.0), code: w.get("code")?.as_u64()? as u32, place: w.get("place").and_then(|v| v.as_str()).unwrap_or("Test").to_owned(), at: crate::relay::now() }) }
fn test_audio(state: &serde_json::Value) -> Option<Audio> { let a = state.get("audio")?; Some(Audio { kind: audio_kind(a.get("formFactor")?.as_u64()? as u32), name: a.get("name")?.as_str()?.to_owned(), bluetooth: is_bluetooth(a.get("enumerator").and_then(|e| e.as_str()).unwrap_or("")) }) }

/// Looks every few seconds at what is wanted and hands on the status whenever it changed.
#[cfg(windows)]
pub fn watch(wanted: impl Fn() -> Wanted + Send + 'static, publish: impl Fn(Status) + Send + 'static) {
    std::thread::spawn(move || {
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
        use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        let enumerator: Option<IMMDeviceEnumerator> = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };
        let mut last = Status::default();
        // The weather: the place asked for and when it was last asked.
        let (mut asked_for, mut weather_at): (Option<WeatherPlace>, u64) = (None, 0);
        let mut weather: Option<Weather> = None;
        loop {
            let want = wanted();
            let mut now = Status::default();
            if want.battery {
                use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
                let mut s = SYSTEM_POWER_STATUS::default();
                if unsafe { GetSystemPowerStatus(&mut s) }.is_ok() { now.battery = battery_of(s.BatteryFlag, s.BatteryLifePercent, s.ACLineStatus); }
            }
            if want.audio {
                now.audio = enumerator.as_ref().and_then(|e| unsafe { e.GetDefaultAudioEndpoint(eRender, eConsole).ok() }).and_then(|device| unsafe {
                    let store = device.OpenPropertyStore(STGM_READ).ok()?;
                    let text = |key: &windows::Win32::Foundation::PROPERTYKEY| store.GetValue(key).ok().and_then(|v| windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc(&v).ok()).and_then(|p| { let s = p.to_string().ok(); windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as _)); s }).unwrap_or_default();
                    let form = store.GetValue(&windows::Win32::Media::Audio::PKEY_AudioEndpoint_FormFactor).ok().and_then(|v| windows::Win32::System::Com::StructuredStorage::PropVariantToUInt32(&v).ok()).unwrap_or(10);
                    Some(Audio { kind: audio_kind(form), name: text(&windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName), bluetooth: is_bluetooth(&text(&windows::Win32::Devices::FunctionDiscovery::PKEY_Device_EnumeratorName)) })
                });
            }
            match &want.weather {
                Some(place) => {
                    let at = crate::relay::now();
                    if asked_for.as_ref() != Some(place) { asked_for = Some(place.clone()); weather = None; weather_at = 0; }
                    if at.saturating_sub(weather_at) >= WEATHER_EVERY_MS {
                        weather_at = at;
                        // A failure keeps the last reading (the strip leaves it out once it is old) and is
                        // tried again in a few minutes rather than at the next quarter hour.
                        let url = weather_url(place.latitude, place.longitude);
                        let fresh = crate::site::win::get_plain(&url, 256 * 1024).filter(|(s, _)| *s == 200).and_then(|(_, b)| serde_json::from_slice(&b).ok()).and_then(|v: serde_json::Value| weather_of(&v, &place.name, at));
                        if fresh.is_none() { weather_at = at.saturating_sub(WEATHER_EVERY_MS - WEATHER_RETRY_MS); }
                        weather = fresh.or(weather.take());
                    }
                    now.weather = weather.clone();
                }
                None => { asked_for = None; weather = None; }
            }
            if let Some(state) = test_state() { if want.battery { now.battery = test_battery(&state); } if want.audio { now.audio = test_audio(&state); } if want.weather.is_some() { if let Some(w) = test_weather(&state) { now.weather = Some(w); } } }
            if now != last { last = now.clone(); publish(now); }
            std::thread::sleep(std::time::Duration::from_secs(if want.battery || want.audio || want.weather.is_some() { 3 } else { 5 }));
        }
    });
}
#[cfg(not(windows))]
pub fn watch(_: impl Fn() -> Wanted + Send + 'static, _: impl Fn(Status) + Send + 'static) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test] fn the_sound_output_is_told_by_its_form_factor_and_bus() {
        assert_eq!([3, 5, 6, 1, 2, 0, 10].map(audio_kind), ["headphones", "headset", "headset", "speakers", "speakers", "other", "other"]);
        assert!(is_bluetooth("BTHENUM")); assert!(is_bluetooth("bthle")); assert!(!is_bluetooth("HDAUDIO")); assert!(!is_bluetooth("USB"));
    }
    #[test] fn a_battery_is_only_where_windows_reports_one() {
        assert_eq!(battery_of(8, 76, 1), Some(Battery { percent: 76, charging: true }));
        assert_eq!(battery_of(0, 40, 0), Some(Battery { percent: 40, charging: false }));
        assert_eq!(battery_of(128, 255, 1), None, "no system battery");
        assert_eq!(battery_of(255, 50, 0), None, "unknown");
        assert_eq!(battery_of(1, 255, 0), None, "no percentage");
    }
    fn place(name: &str, country: &str) -> WeatherPlace { WeatherPlace { name: name.into(), country: country.into(), ..Default::default() } }
    #[test] fn open_meteo_answers_are_read_or_nothing() {
        let found = places_of(&json!({"results": [
            {"name": "İstanbul", "admin1": "İstanbul", "country": "Türkiye", "country_code": "tr", "latitude": 41.01, "longitude": 28.95, "timezone": "Europe/Istanbul", "population": 15701602},
            {"name": "Paris", "country_code": "US", "latitude": 33.66, "longitude": -95.55},
            {"name": "No place", "latitude": "x", "longitude": 1.0}]}));
        assert_eq!(found, vec![
            (WeatherPlace { name: "İstanbul".into(), admin1: "İstanbul".into(), country: "Türkiye".into(), country_code: "TR".into(), latitude: 41.01, longitude: 28.95, timezone: "Europe/Istanbul".into() }, 15701602),
            (WeatherPlace { name: "Paris".into(), country_code: "US".into(), latitude: 33.66, longitude: -95.55, ..Default::default() }, 0)]);
        assert!(places_of(&json!({"generationtime_ms": 1})).is_empty(), "nothing found");
        assert_eq!(weather_of(&json!({"current": {"temperature_2m": 17.4, "weather_code": 3}}), "İstanbul", 5), Some(Weather { temperature: 17.4, code: 3, place: "İstanbul".into(), at: 5 }));
        assert_eq!(weather_of(&json!({"error": true}), "x", 5), None);
        assert_eq!([geo_language("pt-BR"), geo_language("zh-Hans"), geo_language("tr")], ["pt", "zh", "tr"]);
    }
    /// One model's three quarter-hour slots, the same code and amount in each.
    fn slots(m: &mut serde_json::Map<String, serde_json::Value>, model: &str, code: u32, mm: f64, snow_cm: f64) {
        m.insert(format!("weather_code_{model}"), json!([code, code, code]));
        m.insert(format!("precipitation_{model}"), json!([mm, mm, mm]));
        m.insert(format!("snowfall_{model}"), json!([snow_cm, snow_cm, snow_cm]));
    }
    /// An answer: best_match's current code and temperature, and each model's (code, mm, snow cm).
    fn answer(code: u32, temperature: f64, models: &[(&str, u32, f64, f64)]) -> serde_json::Value {
        let mut m = serde_json::Map::new();
        m.insert("time".into(), json!(["2026-10-29T17:00", "2026-10-29T17:15", "2026-10-29T17:30"]));
        for (model, c, mm, snow) in models { slots(&mut m, model, *c, *mm, *snow); }
        json!({"current": {"temperature_2m": temperature, "weather_code": code, "precipitation": 0.0, "rain": 0.0, "showers": 0.0, "snowfall": 0.0}, "minutely_15": m})
    }
    fn shown(a: &serde_json::Value) -> u32 { weather_of(a, "İstanbul", 1).expect("read").code }
    #[test] fn light_rain_two_models_see_is_shown_as_rain() {
        // İstanbul, 29 October 2026, 17:15 UTC: best_match, ICON and GFS overcast with 0 mm; ECMWF and Météo-France drizzle, 0.1 mm.
        let istanbul = answer(3, 15.5, &[("ecmwf_ifs025", 51, 0.1, 0.0), ("icon_seamless", 3, 0.0, 0.0), ("meteofrance_seamless", 51, 0.1, 0.0), ("gfs_seamless", 3, 0.0, 0.0)]);
        let w = weather_of(&istanbul, "İstanbul", 1).expect("read");
        assert_eq!((w.code, w.temperature), (51, 15.5), "drizzle, best_match's temperature");
        // Only one model wet: a single model's guess, best_match stays.
        assert_eq!(shown(&answer(3, 15.5, &[("ecmwf_ifs025", 51, 0.1, 0.0), ("icon_seamless", 3, 0.0, 0.0), ("meteofrance_seamless", 3, 0.0, 0.0), ("gfs_seamless", 3, 0.0, 0.0)])), 3);
        // All dry: best_match's own code (partly cloudy, fog).
        assert_eq!(shown(&answer(2, 20.0, &[("ecmwf_ifs025", 1, 0.0, 0.0), ("icon_seamless", 3, 0.0, 0.0)])), 2);
        assert_eq!(shown(&answer(45, 9.0, &[])), 45, "no 15-minute slots at all");
        // Heavier amounts read as rain, a falling code with a trace amount still counts.
        assert_eq!(shown(&answer(3, 12.0, &[("ecmwf_ifs025", 61, 0.6, 0.0), ("icon_seamless", 80, 1.4, 0.0), ("gfs_seamless", 3, 0.0, 0.0)])), 63);
        assert_eq!(shown(&answer(3, 12.0, &[("ecmwf_ifs025", 61, 0.04, 0.0), ("icon_seamless", 2, 0.3, 0.0)])), 61);
        // Models that did not answer (nulls) do not vote: two of two wet.
        let mut a = answer(3, 12.0, &[("ecmwf_ifs025", 61, 0.3, 0.0), ("meteofrance_seamless", 61, 0.3, 0.0)]);
        a["minutely_15"]["weather_code_gfs_seamless"] = json!([null, null, null]);
        assert_eq!(shown(&a), 61);
    }
    #[test] fn snow_and_thunder_need_the_models_to_say_so() {
        assert_eq!(shown(&answer(3, -2.0, &[("ecmwf_ifs025", 71, 0.2, 0.3), ("icon_seamless", 73, 0.4, 0.5)])), 71, "snowfall reported");
        assert_eq!(shown(&answer(3, 0.5, &[("ecmwf_ifs025", 61, 0.2, 0.0), ("icon_seamless", 61, 0.3, 0.0)])), 71, "cold enough to snow");
        assert_eq!(shown(&answer(3, -1.0, &[("ecmwf_ifs025", 75, 1.5, 2.0), ("icon_seamless", 75, 1.2, 1.5)])), 73);
        assert_eq!(shown(&answer(3, 22.0, &[("ecmwf_ifs025", 95, 2.0, 0.0), ("icon_seamless", 61, 0.5, 0.0)])), 95, "one wet model reports thunder");
        assert_eq!(shown(&answer(3, 22.0, &[("ecmwf_ifs025", 96, 2.0, 0.0), ("icon_seamless", 3, 0.0, 0.0), ("gfs_seamless", 3, 0.0, 0.0), ("meteofrance_seamless", 3, 0.0, 0.0)])), 3, "a lone thunderstorm model is not enough");
        // best_match already says something falls: its own code wins.
        assert_eq!(shown(&answer(65, 10.0, &[("ecmwf_ifs025", 3, 0.0, 0.0), ("icon_seamless", 3, 0.0, 0.0)])), 65);
        let mut a = answer(3, 10.0, &[]); a["current"]["precipitation"] = json!(0.4);
        assert_eq!(shown(&a), 61, "best_match's own amount with a cloudy code");
    }
    #[test] fn a_city_typed_before_the_picker_is_kept_only_when_clear() {
        let ist = place("İstanbul", "Türkiye");
        assert_eq!(resolve("istanbul", &[(ist.clone(), 15_000_000), (place("İstanbul Köyü", "Türkiye"), 300)]), Resolved::One(ist.clone()), "dotted İ, one named so");
        assert_eq!(resolve("ISTANBUL", &[(ist.clone(), 0)]), Resolved::One(ist), "the only result");
        let paris = place("Paris", "France");
        assert_eq!(resolve("Paris", &[(paris.clone(), 2_138_551), (place("Paris", "United States"), 24_171)]), Resolved::One(paris), "far more populous");
        assert_eq!(resolve("Springfield", &[(place("Springfield", "US"), 169_176), (place("Springfield", "US"), 116_250), (place("Springfield", "US"), 61_000)]), Resolved::Choose, "same name, alike");
        assert_eq!(resolve("Istnbul", &[(place("Istanbul Sk", "x"), 10), (place("İstinye", "Türkiye"), 5)]), Resolved::Choose, "only near spellings");
        assert_eq!(resolve("Qwxz", &[]), Resolved::Nothing);
        // Named otherwise in the user's language: the English names decide, the Japanese name is kept.
        let ja = WeatherPlace { name: "イスタンブール".into(), latitude: 41.01384, longitude: 28.94966, ..Default::default() };
        let en = WeatherPlace { name: "Istanbul".into(), latitude: 41.01384, longitude: 28.94966, ..Default::default() };
        let found = [(ja.clone(), 15_000_000), (place("イスタンブール空港", "x"), 0)];
        assert_eq!(resolve_typed("istanbul", &found, || Some(vec![(en.clone(), 15_000_000), (place("Istanbul Airport", "x"), 0)])), Some(ja));
        assert_eq!(resolve_typed("Springfield", &[(place("Springfield", "US"), 1), (place("Springfield", "US"), 1)], || None), None, "a choice stays the user's");
    }
    /// Over the network (run by hand): a search and a forecast come through the app's own request.
    #[cfg(windows)] #[test] #[ignore] fn open_meteo_answers_through_the_apps_request() {
        let found = search("Istanbul", "tr").expect("reached");
        let p = &found.first().expect("a place").0;
        let url = weather_url(p.latitude, p.longitude);
        let w = crate::site::win::get_plain(&url, 256 * 1024).and_then(|(_, b)| serde_json::from_slice(&b).ok()).and_then(|v: serde_json::Value| weather_of(&v, &p.name, 1)).expect("the weather");
        eprintln!("{} ({}, {}) {} °C code {} · resolve: {:?}", w.place, p.admin1, p.country, w.temperature, w.code, resolve("istanbul", &found));
        eprintln!("springfield: {:?}", search("Springfield", "en").map(|f| resolve("Springfield", &f)));
        eprintln!("typo: {:?}", search("Istnbul", "tr").map(|f| (f.len(), resolve("Istnbul", &f))));
    }
}