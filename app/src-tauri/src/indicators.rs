//! Optional system signs on the island (each turned on by the user; all are off at first): the
//! volume, Caps Lock, the keyboard language, the battery (plugged in, unplugged, low), Wi-Fi
//! (connected, lost) and the sound output (headphones and the like). Only what this computer
//! can tell is offered (a desktop without a battery has no battery sign; screen brightness is not
//! readable here and is not offered). Read-only and light: a small thread looks a few times a
//! second, and only while at least one sign is on. A sign is shown briefly on the closed island;
//! it never opens the island, takes the focus or hides what waits for the user.
use serde::Serialize;

/// One change to show.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sign { pub kind: String, pub text: String, pub value: Option<u32>, pub on: Option<bool> }

/// What this computer can tell (the settings offer only these).
pub fn supported() -> Vec<&'static str> {
    let mut list = vec!["volume", "caps", "language", "wifi", "audio"];
    if battery().is_some() { list.push("battery"); }
    list
}

/// The battery: percent and whether it charges; None without one.
#[cfg(windows)]
pub fn battery() -> Option<(u32, bool)> {
    if let Some(state) = crate::status::test_state() { return crate::status::test_battery(&state).map(|b| (b.percent, b.charging)); }
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()?; }
    (s.BatteryFlag & 128 == 0 && s.BatteryFlag != 255 && s.BatteryLifePercent <= 100).then_some((s.BatteryLifePercent as u32, s.ACLineStatus == 1))
}
#[cfg(not(windows))] pub fn battery() -> Option<(u32, bool)> { None }

/// What changed between two readings, as signs (the first reading shows nothing).
pub fn changes(before: &Reading, now: &Reading, wanted: &[String]) -> Vec<Sign> {
    let on = |k: &str| wanted.iter().any(|w| w == k);
    let mut out = vec![];
    if on("volume") && (before.volume != now.volume || before.muted != now.muted) && now.volume.is_some() {
        out.push(Sign { kind: "volume".into(), text: if now.muted { "Ses kapalı".into() } else { format!("Ses %{}", now.volume.unwrap_or(0)) }, value: if now.muted { Some(0) } else { now.volume }, on: Some(!now.muted) });
    }
    if on("caps") && before.caps != now.caps { out.push(Sign { kind: "caps".into(), text: if now.caps { "Caps Lock açık".into() } else { "Caps Lock kapalı".into() }, value: None, on: Some(now.caps) }); }
    if on("language") && before.language != now.language && !now.language.is_empty() { out.push(Sign { kind: "language".into(), text: format!("Klavye: {}", now.language), value: None, on: None }); }
    if on("battery") {
        match (before.battery, now.battery) {
            (Some((_, false)), Some((p, true))) => out.push(Sign { kind: "battery".into(), text: format!("Şarja takıldı · %{p}"), value: Some(p), on: Some(true) }),
            (Some((_, true)), Some((p, false))) => out.push(Sign { kind: "battery".into(), text: format!("Şarj kablosu çıkarıldı · %{p}"), value: Some(p), on: Some(false) }),
            // Low: said once on the way down past 20 % and again past 10 %.
            (Some((a, false)), Some((p, false))) if (a > 20 && p <= 20) || (a > 10 && p <= 10) => out.push(Sign { kind: "battery".into(), text: format!("Pil azaldı · %{p}"), value: Some(p), on: Some(false) }),
            _ => {}
        }
    }
    if on("wifi") && before.wifi != now.wifi {
        let text = match &now.wifi { Some(name) => format!("Wi-Fi bağlandı · {name}"), None => "Wi-Fi bağlantısı yok".into() };
        out.push(Sign { kind: "wifi".into(), text, value: None, on: Some(now.wifi.is_some()) });
    }
    if on("audio") && before.audio != now.audio && !now.audio.is_empty() && !before.audio.is_empty() { out.push(Sign { kind: "audio".into(), text: format!("Ses çıkışı: {}", now.audio), value: None, on: None }); }
    out
}

/// One look at everything (what is not wanted is not read).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Reading { pub volume: Option<u32>, pub muted: bool, pub caps: bool, pub language: String, pub battery: Option<(u32, bool)>, pub wifi: Option<String>, pub audio: String }

/// Watches the signs the user turned on (`wanted`, read again each time) and hands each change on.
#[cfg(windows)]
pub fn watch(wanted: impl Fn() -> Vec<String> + Send + 'static, show: impl Fn(Sign) + Send + 'static) {
    std::thread::spawn(move || {
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
        use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        let enumerator: Option<IMMDeviceEnumerator> = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };
        let (mut last, mut started, mut tick) = (Reading::default(), false, 0u64);
        let mut wifi_cache: Option<String> = None; let mut audio_cache = String::new(); let mut device_id = String::new();
        let mut volume: Option<IAudioEndpointVolume> = None;
        loop {
            let want = wanted();
            if want.is_empty() { started = false; volume = None; std::thread::sleep(std::time::Duration::from_millis(1000)); continue; }
            std::thread::sleep(std::time::Duration::from_millis(250));
            tick += 1;
            let has = |k: &str| want.iter().any(|w| w == k);
            let mut now = Reading::default();
            // The default output: its name, and its volume control (found again when it changes).
            if (has("volume") || has("audio")) && (tick % 8 == 1 || volume.is_none()) {
                if let Some(device) = enumerator.as_ref().and_then(|e| unsafe { e.GetDefaultAudioEndpoint(eRender, eConsole).ok() }) {
                    let id = unsafe { device.GetId().ok().and_then(|p| p.to_string().ok()) }.unwrap_or_default();
                    if id != device_id || volume.is_none() {
                        device_id = id;
                        volume = unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok() };
                        audio_cache = unsafe { device.OpenPropertyStore(STGM_READ).ok().and_then(|store| store.GetValue(&windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName).ok()).and_then(|v| windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc(&v).ok()).and_then(|p| { let s = p.to_string().ok(); windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as _)); s }) }.unwrap_or_default();
                    }
                }
            }
            now.audio = audio_cache.clone();
            if let (true, Some(v)) = (has("volume"), volume.as_ref()) {
                now.volume = unsafe { v.GetMasterVolumeLevelScalar().ok() }.map(|x| (x * 100.0).round() as u32);
                now.muted = unsafe { v.GetMute().map(|b| b.as_bool()).unwrap_or(false) };
            }
            if has("caps") { now.caps = unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(0x14) } & 1 != 0; }
            if has("language") {
                use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
                let layout = unsafe { let thread = GetWindowThreadProcessId(GetForegroundWindow(), None); windows::Win32::UI::Input::KeyboardAndMouse::GetKeyboardLayout(thread) };
                let lang = (layout.0 as usize & 0xFFFF) as u32;
                let mut name = [0u16; 85];
                let n = unsafe { windows::Win32::Globalization::LCIDToLocaleName(lang, Some(&mut name), 0) };
                now.language = if n > 1 { String::from_utf16_lossy(&name[..(n - 1) as usize]).split('-').next().unwrap_or("").to_uppercase() } else { String::new() };
                if lang == 0 { now.language = last.language.clone(); }
            }
            if has("battery") { now.battery = if tick % 8 == 1 { battery() } else { last.battery }; }
            if has("wifi") {
                if tick % 12 == 1 {
                    use windows::Networking::Connectivity::NetworkInformation;
                    wifi_cache = NetworkInformation::GetInternetConnectionProfile().ok().filter(|p| p.IsWlanConnectionProfile().unwrap_or(false)).and_then(|p| p.ProfileName().ok()).map(|n| n.to_string());
                    // Wired or no internet: no Wi-Fi sign unless Wi-Fi was in use before.
                    if wifi_cache.is_none() && last.wifi.is_none() { wifi_cache = None; }
                }
                now.wifi = wifi_cache.clone();
            }
            if started { for sign in changes(&last, &now, &want) { show(sign); } }
            started = true; last = now;
        }
    });
}
#[cfg(not(windows))]
pub fn watch(_: impl Fn() -> Vec<String> + Send + 'static, _: impl Fn(Sign) + Send + 'static) {}

#[cfg(test)]
mod tests {
    use super::*;
    fn want(list: &[&str]) -> Vec<String> { list.iter().map(|s| s.to_string()).collect() }
    #[test] fn only_what_changed_and_was_wanted_is_shown() {
        let a = Reading { volume: Some(40), caps: false, language: "TR".into(), battery: Some((50, false)), wifi: Some("Ev".into()), audio: "Hoparlör".into(), ..Default::default() };
        let mut b = a.clone(); b.volume = Some(45); b.caps = true; b.language = "EN".into(); b.battery = Some((50, true)); b.wifi = None; b.audio = "AirPods".into();
        let all = changes(&a, &b, &want(&["volume", "caps", "language", "battery", "wifi", "audio"]));
        assert_eq!(all.iter().map(|s| s.text.as_str()).collect::<Vec<_>>(), vec!["Ses %45", "Caps Lock açık", "Klavye: EN", "Şarja takıldı · %50", "Wi-Fi bağlantısı yok", "Ses çıkışı: AirPods"]);
        assert_eq!(changes(&a, &b, &want(&["caps"])).len(), 1);
        assert!(changes(&a, &a, &want(&["volume", "caps"])).is_empty());
    }
    #[test] fn a_low_battery_is_said_at_20_and_at_10_percent_once_each() {
        let at = |p: u32| Reading { battery: Some((p, false)), ..Default::default() };
        let said = |a: u32, b: u32| changes(&at(a), &at(b), &want(&["battery"])).into_iter().map(|s| s.text).collect::<Vec<_>>();
        assert_eq!(said(21, 20), vec!["Pil azaldı · %20"]);
        assert!(said(20, 19).is_empty() && said(15, 14).is_empty());
        assert_eq!(said(11, 10), vec!["Pil azaldı · %10"]);
        assert!(said(10, 9).is_empty());
        let plugged = changes(&at(40), &Reading { battery: Some((40, true)), ..Default::default() }, &want(&["battery"]));
        assert_eq!(plugged[0].text, "Şarja takıldı · %40");
    }
}
