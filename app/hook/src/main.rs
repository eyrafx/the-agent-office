// Claude Code hook relay. Deliberately std-only so it starts in milliseconds:
// the full app binary takes over a second to load, which Claude Code would wait
// for on every tool call. Reads the hook JSON from stdin, stamps provider and
// time, writes one line to the app's pipe, and always exits 0 quickly.
// With --statusline it serves as Claude Code's status line: the same relay
// (marked as a status line, which carries the usage limits) plus a short line
// of text for Claude Code to show.
// Console subsystem on purpose: Git Bash (which Claude Code uses for hooks on
// Windows) does not connect stdin to GUI-subsystem programs. Claude Code
// starts hooks without a visible console.
use std::io::{Read, Write};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_PAYLOAD: u64 = 1 << 20;
/// Environment variables that tell which tool ran this hook (see the app's `relay::source_of`).
/// Only variables a tool sets for its own hooks or children: an editor's terminal variables
/// (VSCODE_PID, CURSOR_TRACE_ID) are also there when Claude Code runs inside that terminal.
const ENV_MARKERS: [&str; 4] = ["CLAUDECODE", "CLAUDE_PROJECT_DIR", "GROK_HOOK_EVENT", "GROK_SESSION_ID"];

/// Must match `relay::pipe_named` in the app ("hook": events, "ask": a question waiting).
fn pipe_name(kind: &str) -> String {
    let user: String = std::env::var("USERNAME").unwrap_or_else(|_| "user".into()).chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let suffix: String = std::env::var("AGENTOFFICE_PIPE_SUFFIX").unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect();
    format!(r"\\.\pipe\agentoffice-{kind}-{}{}", if user.is_empty() { "user" } else { &user }, if suffix.is_empty() { String::new() } else { format!("-{suffix}") })
}

/// `--ask claude` (PreToolUse, AskUserQuestion only): the question goes to the app, which may
/// let the user answer it there. Whatever the app replies is printed for Claude Code (an
/// "allow" with the user's answers); no reply, or no app, prints nothing and Claude asks the
/// question in its own window. Nothing is ever approved here without the user's answer.
fn ask(line: &str) {
    let Ok(mut pipe) = std::fs::OpenOptions::new().read(true).write(true).open(pipe_name("ask")) else { return };
    if pipe.write_all(line.as_bytes()).is_err() { return; }
    // The app's reply is one line.
    let (mut reply, mut chunk) = (Vec::new(), [0u8; 4096]);
    while !reply.contains(&b'\n') && reply.len() < 1 << 20 { match pipe.read(&mut chunk) { Ok(0) | Err(_) => break, Ok(n) => reply.extend_from_slice(&chunk[..n]) } }
    let text = String::from_utf8_lossy(&reply);
    if text.trim_start().starts_with('{') { print!("{}", text.trim()); }
}

/// Used percentage that follows `key` in the status line JSON (no JSON parser
/// here, on purpose: this binary stays std-only and starts instantly).
fn percent_after(body: &str, key: &str) -> Option<f64> {
    let rest = &body[body.find(&format!("\"{key}\""))?..];
    let rest = &rest[rest.find("\"used_percentage\"").or_else(|| rest.find("\"utilization\""))?..];
    let rest = rest[rest.find(':')? + 1..].trim_start();
    let end = rest.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(rest.len());
    rest[..end].parse().ok()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let status_line = args.iter().any(|a| a == "--statusline");
    let asking = args.iter().any(|a| a == "--ask");
    let provider = args.iter().position(|a| a == "--hook" || a == "--ask").and_then(|i| args.get(i + 1)).map_or("claude", String::as_str);
    // Claude Code (its settings file), Codex and Cursor (their own hooks files); anything else: nothing.
    if !matches!(provider, "claude" | "codex" | "cursor") { return; }
    let mut input = Vec::new();
    let _ = std::io::stdin().take(MAX_PAYLOAD).read_to_end(&mut input);
    let text = String::from_utf8_lossy(&input);
    // A byte-order mark before the JSON (some Windows writers put one) is not part of it.
    let body = text.trim().trim_start_matches('\u{feff}').trim_start();
    // The app parses and validates; here we only need a JSON object to extend.
    let Some(inner) = body.strip_prefix('{').and_then(|b| b.strip_suffix('}')) else { return };
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let separator = if inner.trim().is_empty() { "" } else { "," };
    let kind = if status_line { ",\"agentoffice_kind\":\"statusline\"" } else { "" };
    // Other tools can run the hooks in Claude Code's settings file too (Grok Build, GitHub Copilot,
    // VS Code): which tool started this hook is told by its environment. Only the names of these
    // variables are passed on (never their values); the app decides the source from them and the event.
    let markers: Vec<String> = ENV_MARKERS.iter().filter(|n| std::env::var_os(n).is_some_and(|v| !v.is_empty())).map(|n| format!("\"{n}\"")).collect();
    let env = format!(",\"agentoffice_env\":[{}]", markers.join(","));
    let line = format!("{{{inner}{separator}\"agentoffice_provider\":\"{provider}\",\"agentoffice_at\":{at}{kind}{env}}}\n");
    if asking && provider == "claude" { ask(&line); return; }
    if status_line {
        // Trace for diagnosis: when Claude Code last called the status line and
        // whether its input carried usage limits (no contents are kept).
        let trace = format!("{at} rate_limits={} bytes={}
", body.contains("\"rate_limits\""), body.len());
        let _ = std::fs::write(std::env::temp_dir().join("agentoffice-statusline.txt"), trace);
        let parts: Vec<String> = [("five_hour", "5 saat"), ("seven_day", "Hafta")].iter()
            .filter_map(|(key, name)| percent_after(body, key).map(|p| format!("{name} %{}", p.round())))
            .collect();
        println!("{}", parts.join(" · "));
    }
    let deadline = Instant::now() + Duration::from_millis(300);
    loop {
        match std::fs::OpenOptions::new().write(true).open(pipe_name("hook")) {
            Ok(mut pipe) => { let _ = pipe.write_all(line.as_bytes()); return; }
            // 231 = ERROR_PIPE_BUSY: another hook is being read; retry briefly.
            Err(err) if err.raw_os_error() == Some(231) && Instant::now() < deadline => std::thread::sleep(Duration::from_millis(15)),
            Err(_) => return,
        }
    }
}
