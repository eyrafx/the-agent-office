//! Live Claude usage limits for the account Claude Code is signed in with.
//!
//! Claude shares its limits only with Claude Code itself, so this does what
//! usage monitors do: it reads Claude Code's own sign-in
//! (`~/.claude/.credentials.json`) and asks Anthropic's usage service with it.
//! The token is never refreshed (that stays Claude Code's job), never stored,
//! logged or sent anywhere else, and reaches curl through stdin rather than
//! the command line. The service is not a documented API and may change.
//!
//! Claude desktop app users have no such sign-in on disk; there a Claude agent
//! can read the limits with the app's own usage tool and write them to a
//! usage file (as the user's Agent Office does every 15 minutes). `from_file`
//! reads that file: the usage tool's own shape or the Agent Office's.

use crate::domain::{LimitWindow, ProviderLimits};
use serde_json::Value;

pub enum Reading { Limits(ProviderLimits), NeedsLogin, Failed }

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// Access token and plan from Claude Code's sign-in, if it is still valid.
fn sign_in(now: u64) -> Option<(String, Option<String>)> {
    let path = crate::setup::claude_dir()?.join(".credentials.json");
    let file: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let oauth = file.get("claudeAiOauth")?;
    let token = oauth.get("accessToken")?.as_str()?.to_owned();
    // Seconds or milliseconds, depending on the Claude Code version.
    let expires = oauth.get("expiresAt").and_then(Value::as_u64).map(|e| if e < 100_000_000_000 { e * 1000 } else { e });
    if expires.is_some_and(|e| e <= now) || token.is_empty() { return None; }
    Some((token, oauth.get("subscriptionType").and_then(Value::as_str).map(str::to_owned)))
}

#[cfg(windows)]
fn fetch(token: &str) -> Option<(u16, String)> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    let curl = std::path::PathBuf::from(std::env::var_os("SystemRoot")?).join("System32").join("curl.exe");
    let mut child = Command::new(curl).args(["-s", "-m", "12", "-K", "-", "-w", "\n%{http_code}"])
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .spawn().ok()?;
    let config = format!("url = \"{USAGE_URL}\"\nheader = \"Authorization: Bearer {token}\"\nheader = \"anthropic-beta: oauth-2025-04-20\"\nheader = \"Accept: application/json\"\n");
    child.stdin.take()?.write_all(config.as_bytes()).ok()?;
    let out = child.wait_with_output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let (body, code) = text.rsplit_once('\n')?;
    Some((code.trim().parse().ok()?, body.to_owned()))
}
#[cfg(not(windows))]
fn fetch(_: &str) -> Option<(u16, String)> { None }

/// The usage service's answer as limits (same windows as the status line:
/// five_hour, seven_day and per-model weekly ones, with reset times).
pub fn parse(body: &str, plan: Option<String>, at: u64) -> Option<ProviderLimits> {
    let usage: Value = serde_json::from_str(body).ok()?;
    let mut limits = crate::relay::claude_limits(&serde_json::json!({ "rate_limits": usage }), at)?;
    limits.plan = plan; limits.source = "Claude hesabı · anlık".into();
    Some(limits)
}

/// Window length and model from a label such as "5-hour limit", "5 saatlik
/// limit", "Weekly · Fable" or "Haftalık · Fable".
fn window_of(label: &str) -> Option<(u64, Option<String>)> {
    let lower = label.to_lowercase();
    let minutes = if lower.contains("5") && (lower.contains("hour") || lower.contains("saat")) { 300 }
        else if lower.contains("week") || lower.contains("hafta") { 10080 } else { return None };
    let model = label.split_once('·').map(|(_, m)| m.trim().to_owned()).filter(|m| !m.is_empty());
    Some((minutes, model))
}

/// Limits from a usage file. Accepts the usage tool's shape
/// `{plan?, windows: [{label, percentUsed, resetsAt}], updatedAt?}` (also
/// wrapped as `{plan: {...}}`) and the Agent Office's
/// `{guncelleme, pencereler: [{ad, yuzde, sifirlanma}]}`. Without a time in
/// the file, its modification time counts.
pub fn from_file(path: &std::path::Path) -> Option<ProviderLimits> {
    let text = std::fs::read_to_string(path).ok()?;
    let doc: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let body = if doc.get("plan").is_some_and(Value::is_object) { &doc["plan"] } else { &doc };
    let (list, label, percent, reset) = if let Some(w) = body.get("windows").and_then(Value::as_array) { (w, "label", "percentUsed", "resetsAt") }
        else { (body.get("pencereler")?.as_array()?, "ad", "yuzde", "sifirlanma") };
    let windows: Vec<LimitWindow> = list.iter().filter_map(|w| {
        let (window_minutes, model) = window_of(w.get(label)?.as_str()?)?;
        Some(LimitWindow { window_minutes, used_percent: w.get(percent)?.as_f64()?, resets_at: w.get(reset).and_then(Value::as_str).and_then(crate::codex::parse_time), model })
    }).collect();
    if windows.is_empty() { return None; }
    let stamped = ["updatedAt", "guncelleme"].iter().find_map(|k| doc.get(*k).or_else(|| body.get(*k))).and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(crate::codex::parse_time)));
    let modified = std::fs::metadata(path).ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
    let plan = body.get("plan").and_then(Value::as_str).map(str::to_owned);
    Some(ProviderLimits { provider: "claude".into(), plan, windows, updated_at: stamped.unwrap_or(modified), source: "Claude kullanım kaydı".into(), note: None, credits: None, resets_available: None })
}

pub fn read(now: u64) -> Reading {
    let Some((token, plan)) = sign_in(now) else { return Reading::NeedsLogin };
    match fetch(&token) {
        Some((200, body)) => parse(&body, plan, now).map_or(Reading::Failed, Reading::Limits),
        Some((401 | 403, _)) => Reading::NeedsLogin,
        _ => Reading::Failed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn reads_the_usage_answer() {
        let body = r#"{"five_hour":{"utilization":34.0,"resets_at":"2026-10-23T03:00:00.000Z"},"seven_day":{"utilization":12.0,"resets_at":"2026-10-29T18:00:00Z"},"seven_day_opus":null,"seven_day_fable":{"utilization":41.0,"resets_at":"2026-10-29T18:00:00Z"},"seven_day_oauth_apps":null}"#;
        let limits = parse(body, Some("pro".into()), 7).unwrap();
        assert_eq!(limits.plan.as_deref(), Some("pro"));
        assert_eq!(limits.windows.iter().map(|w| (w.window_minutes, w.used_percent, w.model.clone())).collect::<Vec<_>>(),
            vec![(300, 34.0, None), (10080, 12.0, None), (10080, 41.0, Some("Fable".into()))]);
        assert!(limits.windows.iter().all(|w| w.resets_at.is_some()));
    }
    #[test] fn reads_usage_files_in_both_shapes() {
        let dir = std::env::temp_dir().join(format!("agentoffice-usage-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("tool.json");
        std::fs::write(&tool, r#"{"plan":{"status":"ok","plan":"Team","windows":[{"label":"5-hour limit","percentUsed":52,"resetsAt":"2026-10-22T21:50:00.454Z"},{"label":"Weekly · Fable","percentUsed":36,"resetsAt":"2026-10-28T04:00:00.454Z"}]},"updatedAt":"2026-10-22T21:15:00Z"}"#).unwrap();
        let a = from_file(&tool).unwrap();
        assert_eq!(a.plan.as_deref(), Some("Team"));
        assert_eq!(a.windows.iter().map(|w| (w.window_minutes, w.used_percent, w.model.clone())).collect::<Vec<_>>(), vec![(300, 52.0, None), (10080, 36.0, Some("Fable".into()))]);
        assert_eq!(a.updated_at, crate::codex::parse_time("2026-10-22T21:15:00Z").unwrap());
        let office = dir.join("office.json");
        std::fs::write(&office, "\u{feff}{\"guncelleme\": \"2026-10-22T21:08:58Z\", \"pencereler\": [{\"ad\": \"5 saatlik limit\", \"yuzde\": 50, \"sifirlanma\": \"2026-10-22T21:49:59.789Z\"}, {\"ad\": \"Haftalık · Fable\", \"yuzde\": 36, \"sifirlanma\": \"2026-10-28T03:59:59.789Z\"}]}").unwrap();
        let b = from_file(&office).unwrap();
        assert_eq!(b.windows.iter().map(|w| (w.window_minutes, w.model.clone())).collect::<Vec<_>>(), vec![(300, None), (10080, Some("Fable".into()))]);
        assert!(b.windows.iter().all(|w| w.resets_at.is_some()));
        std::fs::remove_dir_all(&dir).ok();
    }
}
