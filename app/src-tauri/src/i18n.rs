//! The native side's own words (the tray menu, the office window's title, a start-up failure) in
//! the user's language, from the page's catalogs (src/i18n/locales), English for a key a catalog
//! lacks. "system" follows the Windows display languages in order, as the page follows
//! navigator.languages, falling back to English.

use std::collections::HashMap;
use std::sync::OnceLock;

/// The languages, as the settings name them.
pub const IDS: [&str; 11] = ["tr", "en", "es", "de", "fr", "pt-BR", "it", "ru", "ja", "ko", "zh-Hans"];

const SOURCES: [(&str, &str); 11] = [
    ("tr", include_str!("../../src/i18n/locales/tr.json")), ("en", include_str!("../../src/i18n/locales/en.json")),
    ("es", include_str!("../../src/i18n/locales/es.json")), ("de", include_str!("../../src/i18n/locales/de.json")),
    ("fr", include_str!("../../src/i18n/locales/fr.json")), ("pt-BR", include_str!("../../src/i18n/locales/pt-BR.json")),
    ("it", include_str!("../../src/i18n/locales/it.json")), ("ru", include_str!("../../src/i18n/locales/ru.json")),
    ("ja", include_str!("../../src/i18n/locales/ja.json")), ("ko", include_str!("../../src/i18n/locales/ko.json")),
    ("zh-Hans", include_str!("../../src/i18n/locales/zh-Hans.json")),
];

fn catalogs() -> &'static HashMap<&'static str, HashMap<String, String>> {
    static ALL: OnceLock<HashMap<&'static str, HashMap<String, String>>> = OnceLock::new();
    ALL.get_or_init(|| SOURCES.iter().map(|(id, text)| (*id, serde_json::from_str(text).unwrap_or_default())).collect())
}

/// The language for a choice: a known one as it is; "system" (or anything else) by the system's languages.
pub fn resolve(choice: &str) -> &'static str {
    if let Some(id) = IDS.iter().find(|id| **id == choice) { return id; }
    from_tags(&system_languages())
}

/// The first of these language tags the app has ("pt-PT" finds Portuguese, "zh-TW" Chinese), else English.
pub fn from_tags(tags: &[String]) -> &'static str {
    for tag in tags {
        let lower = tag.to_lowercase();
        if lower.starts_with("pt") { return "pt-BR"; }
        if lower.starts_with("zh") { return "zh-Hans"; }
        let base = lower.split(['-', '_']).next().unwrap_or_default();
        if let Some(id) = IDS.iter().find(|id| **id == base) { return id; }
    }
    "en"
}

/// The text of `key` in `language`, `{name}` values put in (English when the catalog lacks it).
pub fn text(language: &str, key: &str, values: &[(&str, &str)]) -> String {
    let all = catalogs();
    let found = all.get(language).and_then(|c| c.get(key)).filter(|t| !t.is_empty()).or_else(|| all.get("en").and_then(|c| c.get(key)));
    let mut out = found.cloned().unwrap_or_else(|| key.to_owned());
    for (name, value) in values { out = out.replace(&format!("{{{name}}}"), value); }
    out
}

/// The Windows display languages, the user's first ("tr-TR", "en-US").
#[cfg(windows)]
fn system_languages() -> Vec<String> {
    use windows::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
    let (mut count, mut len) = (0u32, 0u32);
    unsafe {
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, None, &mut len).is_err() || len == 0 { return vec![]; }
        let mut buf = vec![0u16; len as usize];
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, Some(windows::core::PWSTR(buf.as_mut_ptr())), &mut len).is_err() { return vec![]; }
        String::from_utf16_lossy(&buf).split('\0').filter(|s| !s.is_empty()).map(str::to_owned).collect()
    }
}
#[cfg(not(windows))]
fn system_languages() -> Vec<String> { std::env::var("LANG").map(|l| vec![l.replace('_', "-")]).unwrap_or_default() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn every_catalog_reads_and_has_the_native_sides_words() {
        for (id, _) in SOURCES { for key in ["tray.open_office", "tray.settings", "tray.pin_panel", "tray.mute", "tray.in_screenshots", "tray.exit", "app.office_window_title"] {
            assert!(catalogs()[id].get(key).is_some_and(|t| !t.is_empty()), "{id} {key}");
        } }
    }
    #[test] fn a_choice_or_the_systems_language_decides() {
        assert_eq!(resolve("de"), "de");
        assert_eq!(from_tags(&["tr-TR".into(), "en-US".into()]), "tr");
        assert_eq!(from_tags(&["pt-PT".into()]), "pt-BR");
        assert_eq!(from_tags(&["zh-Hant-TW".into()]), "zh-Hans");
        assert_eq!(from_tags(&["fi-FI".into()]), "en");
        assert_eq!(text("tr", "tray.exit", &[]), "Çıkış");
        assert_eq!(text("xx", "tray.exit", &[]), "Quit");
        assert_eq!(text("en", "main.could_not_open", &[("error", "x")]), "AgentOffice could not open: x");
    }
}
