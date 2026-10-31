//! Codex limits from Codex's own app server (`codex app-server`, the interface
//! its IDE extensions use): the 5-hour and weekly windows, the plan, extra
//! credits and the rate-limit resets the account can still use ("1 yenileme
//! hakkı"). Read-only: only `account/rateLimits/read` is called, never the
//! method that spends a reset. Codex uses its own sign-in; AgentOffice never
//! sees it.

use crate::domain::{Credits, LimitWindow, ProviderLimits};
use serde_json::Value;

/// The Codex binary: on PATH, inside the npm package (whose `codex.cmd` shim
/// would leave a child process behind if we had to kill it), or the one the
/// Codex/ChatGPT desktop app keeps for itself (newest version folder).
#[cfg(windows)]
fn codex_exe() -> Option<std::path::PathBuf> {
    let on_path = std::env::var_os("PATH").into_iter().flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>()).map(|d| d.join("codex.exe")).find(|p| p.is_file());
    let npm = || {
        let npm = std::path::PathBuf::from(std::env::var_os("APPDATA")?).join("npm").join("node_modules").join("@openai").join("codex").join("node_modules").join("@openai").join("codex-win32-x64").join("vendor").join("x86_64-pc-windows-msvc").join("bin").join("codex.exe");
        npm.is_file().then_some(npm)
    };
    let desktop = || {
        let bin = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("OpenAI").join("Codex").join("bin");
        std::fs::read_dir(bin).ok()?.flatten().map(|e| e.path().join("codex.exe")).filter(|p| p.is_file())
            .max_by_key(|p| p.metadata().and_then(|m| m.modified()).ok())
    };
    on_path.or_else(npm).or_else(desktop)
}

/// One `account/rateLimits/read` round trip over the app server's stdio.
#[cfg(windows)]
fn rate_limits() -> Option<Value> {
    use std::io::{BufRead, Write};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    let mut child = Command::new(codex_exe()?).arg("app-server")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .spawn().ok()?;
    let mut stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || { for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) { if tx.send(line).is_err() { break; } } });
    let mut send = |v: Value| writeln!(stdin, "{v}").and_then(|_| stdin.flush()).is_ok();
    let answer = |id: u64| {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
            let Ok(line) = rx.recv_timeout(left) else { break };
            if let Ok(v) = serde_json::from_str::<Value>(&line) { if v.get("id").and_then(Value::as_u64) == Some(id) { return Some(v); } }
        }
        None
    };
    let result = (|| {
        send(serde_json::json!({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "agentoffice", "title": "AgentOffice", "version": env!("CARGO_PKG_VERSION")}}})).then_some(())?;
        answer(1)?.get("result")?;
        send(serde_json::json!({"method": "initialized"})).then_some(())?;
        send(serde_json::json!({"id": 2, "method": "account/rateLimits/read", "params": {"excludeResetCreditDetails": true}})).then_some(())?;
        answer(2)?.get("result").cloned()
    })();
    drop(send); drop(stdin);
    let _ = child.kill(); let _ = child.wait();
    result
}
#[cfg(not(windows))]
fn rate_limits() -> Option<Value> { None }

/// Limits from an `account/rateLimits/read` result.
pub fn parse(result: &Value, at: u64) -> Option<ProviderLimits> {
    let snap = result.get("rateLimits")?;
    let window = |w: &Value| Some(LimitWindow {
        window_minutes: w.get("windowDurationMins")?.as_u64()?, used_percent: w.get("usedPercent")?.as_f64()?,
        resets_at: w.get("resetsAt").and_then(Value::as_u64).map(|s| s * 1000), model: None,
    });
    let windows: Vec<LimitWindow> = ["primary", "secondary"].iter().filter_map(|k| snap.get(*k).filter(|w| w.is_object()).and_then(window)).collect();
    if windows.is_empty() { return None; }
    let credits = snap.get("credits").filter(|c| c.is_object()).map(|c| Credits {
        unlimited: c.get("unlimited").and_then(Value::as_bool).unwrap_or(false),
        balance: c.get("balance").and_then(|b| b.as_f64().or_else(|| b.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0.0),
    });
    let plan = snap.get("planType").and_then(Value::as_str).filter(|p| *p != "unknown").map(str::to_owned);
    let resets = result.get("rateLimitResetCredits").and_then(|r| r.get("availableCount")).and_then(Value::as_u64);
    Some(ProviderLimits { provider: "codex".into(), plan, windows, updated_at: at, source: "Codex hesabı · anlık".into(), note: None, credits, resets_available: resets })
}

pub fn read(at: u64) -> Option<ProviderLimits> { parse(&rate_limits()?, at) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn reads_limits_plan_credits_and_resets() {
        let result: Value = serde_json::from_str(r#"{"ordinaryUsageAllowed":true,"rateLimits":{"limitId":"codex","primary":{"usedPercent":20,"windowDurationMins":300,"resetsAt":1792707688},"secondary":{"usedPercent":3,"windowDurationMins":10080,"resetsAt":1793294488},"credits":{"hasCredits":false,"unlimited":false,"balance":"0"},"planType":"plus"},"rateLimitResetCredits":{"availableCount":1,"credits":null}}"#).unwrap();
        let l = parse(&result, 9).unwrap();
        assert_eq!(l.plan.as_deref(), Some("plus"));
        assert_eq!(l.resets_available, Some(1));
        assert_eq!(l.windows.iter().map(|w| (w.window_minutes, w.used_percent, w.resets_at)).collect::<Vec<_>>(), vec![(300, 20.0, Some(1792707688000)), (10080, 3.0, Some(1793294488000))]);
        assert_eq!(l.credits, Some(Credits { unlimited: false, balance: 0.0 }));
    }
}
