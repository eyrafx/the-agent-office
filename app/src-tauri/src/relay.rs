//! Live source: Claude Code hooks.
//!
//! Claude Code runs `agentoffice.exe --hook claude` for each hook event. That
//! process forwards the event JSON over a per-user named pipe and exits within
//! a few hundred milliseconds whether or not the app is running, so Claude Code
//! is never blocked. The app maps each event onto the canonical store.
//! Answering permission prompts from AgentOffice is not offered: permissions are
//! shown with `can_answer = false` and are replied to in the source app, and
//! nothing here ever approves one.
//!
//! A question (AskUserQuestion) can be answered here, as Claude Code documents it
//! for tools that need the user: a second hook entry, only for that tool, runs
//! `--ask claude`, which hands the question to the app over its own pipe and waits.
//! The app holds it for the time the user chose, shows it with its options, and
//! answers only with what the user picked or wrote here: the hook then returns
//! "allow" with the original questions and the user's `answers`. If the user does
//! not answer here in time, answers in Claude instead ("Claude'da yanıtla"), or the
//! app is not running, the hook returns nothing and Claude shows its own question.

use std::collections::HashMap;
use std::sync::Mutex;
use serde_json::Value;
use crate::domain::{EventKind, FileChange, NormalizedEvent, PendingRequest, Question, QuestionOption, RequestKey, RequestStatus, SessionKey, LimitWindow, ProviderLimits};

const MAX_PAYLOAD: usize = 1 << 20;

pub fn pipe_name() -> String { pipe_named("hook") }
/// The pipe on which a question waits for its answer (see the module notes).
pub fn ask_pipe_name() -> String { pipe_named("ask") }
/// Per user; a test copy and its test chat add AGENTOFFICE_PIPE_SUFFIX, so they never reach
/// the user's own running app (the hook program reads the same variable).
fn pipe_named(kind: &str) -> String {
    let user: String = std::env::var("USERNAME").unwrap_or_else(|_| "user".into()).chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let suffix: String = std::env::var("AGENTOFFICE_PIPE_SUFFIX").unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect();
    format!(r"\\.\pipe\agentoffice-{kind}-{}{}", if user.is_empty() { "user" } else { &user }, if suffix.is_empty() { String::new() } else { format!("-{suffix}") })
}

/// The questions of an AskUserQuestion (Claude) or request_user_input (Codex) call, as asked:
/// each with its text, short header, options (label and description) and whether several
/// may be chosen. At most four, each option list at most eight.
pub fn questions_of(input: Option<&Value>) -> Vec<Question> {
    let Some(list) = input.and_then(|i| i.get("questions")).and_then(Value::as_array) else { return vec![] };
    list.iter().take(4).filter_map(|q| {
        let question: String = text(q, "question").or_else(|| text(q, "title"))?.chars().take(600).collect();
        let options = q.get("options").and_then(Value::as_array).map(|o| o.iter().take(8).filter_map(|x| {
            let label = x.as_str().map(str::to_owned).or_else(|| text(x, "label"))?;
            Some(QuestionOption { label: label.chars().take(120).collect(), description: text(x, "description").unwrap_or_default().chars().take(300).collect() })
        }).collect()).unwrap_or_default();
        Some(Question { question, header: text(q, "header").unwrap_or_default().chars().take(40).collect(), options, multi_select: q.get("multiSelect").and_then(Value::as_bool).unwrap_or(false) })
    }).collect()
}

/// Which tool really sent a hook event that came through Claude Code's settings file. Grok Build,
/// GitHub Copilot (CLI and VS Code) and Cursor can run those hooks too, so the helper's "claude"
/// stamp is not proof. Claude only on positive evidence: Claude Code's own environment (passed on by
/// the helper as variable names) or its transcript in a `.claude\projects` folder. Another tool's
/// mark wins; with neither, the source is "unknown", never Claude.
pub fn source_of(event: &Value) -> &'static str {
    let env = |name: &str| event.get("agentoffice_env").and_then(Value::as_array).is_some_and(|l| l.iter().any(|v| v.as_str() == Some(name)));
    let transcript = text(event, "transcript_path").unwrap_or_default().replace('/', "\\").to_lowercase();
    if env("GROK_HOOK_EVENT") || event.get("hookEventName").is_some() { return "grok"; }
    if event.get("cursor_version").is_some() || event.get("conversation_id").is_some() && event.get("workspace_roots").is_some() { return "cursor"; }
    if transcript.contains("\\.copilot\\") { return "copilot"; }
    if transcript.contains("\\code\\user\\") || transcript.contains("\\code - insiders\\user\\") { return "vscode"; }
    let claude_transcript = transcript.contains("\\projects\\") && (transcript.contains("\\.claude\\") || crate::setup::claude_dir().is_some_and(|d| transcript.starts_with(&d.to_string_lossy().replace('/', "\\").to_lowercase())));
    if env("CLAUDECODE") || env("CLAUDE_PROJECT_DIR") || claude_transcript { return "claude"; }
    "unknown"
}

pub fn host_id() -> String {
    std::env::var("COMPUTERNAME").map(|h| h.to_lowercase()).unwrap_or_else(|_| "local".into())
}

/// Hook client: read stdin, hand it to the running app, always exit 0.
#[cfg(windows)]
pub fn run_hook(provider: &str) {
    use std::io::{Read, Write};
    let mut input = Vec::new();
    let _ = std::io::stdin().take(MAX_PAYLOAD as u64).read_to_end(&mut input);
    let Ok(mut event) = serde_json::from_slice::<Value>(&input) else { return };
    event["agentoffice_provider"] = Value::String(provider.into());
    event["agentoffice_at"] = Value::from(now());
    // As the helper does: the names of the variables that tell which tool ran the hook (see `source_of`).
    event["agentoffice_env"] = Value::from(["CLAUDECODE", "CLAUDE_PROJECT_DIR", "GROK_HOOK_EVENT", "GROK_SESSION_ID"].iter().filter(|n| std::env::var_os(n).is_some_and(|v| !v.is_empty())).map(|n| Value::from(*n)).collect::<Vec<_>>());
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(300);
    loop {
        match std::fs::OpenOptions::new().write(true).open(pipe_name()) {
            Ok(mut pipe) => { let _ = pipe.write_all(format!("{event}\n").as_bytes()); return; }
            // 231 = ERROR_PIPE_BUSY: another hook is being read; retry briefly.
            Err(err) if err.raw_os_error() == Some(231) && std::time::Instant::now() < deadline => std::thread::sleep(std::time::Duration::from_millis(15)),
            Err(_) => return,
        }
    }
}

pub fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Default)]
struct Track { turn: u64, open_request: Option<String>, seq: u64, pending_tool: Option<(String, Option<Value>)>, replied: bool, stopped_at: u64 }

/// Per-session turn bookkeeping. Claude Code hooks carry no turn id, so a turn
/// is the span from UserPromptSubmit to Stop in the order events arrive.
/// Events from inside a subagent carry `agent_id`/`agent_type`: they belong to
/// a session of their own (`<session>~<agent>`) linked to the main chat, so
/// the helper's tools neither mix into the chat nor close its requests.
#[derive(Default)]
pub struct ClaudeMapper(Mutex<HashMap<String, Track>>);

pub(crate) fn text(v: &Value, key: &str) -> Option<String> { v.get(key).and_then(Value::as_str).map(str::to_owned).filter(|s| !s.is_empty()) }

fn line_count(v: Option<&Value>) -> u64 { v.and_then(Value::as_str).map(|s| s.lines().count() as u64).unwrap_or(0) }

/// What a permission prompt asks for, in plain words: Claude's message names the
/// tool ("…permission to use Bash"); the tool that was about to run (its
/// PreToolUse came just before) gives the command, file or address.
pub(crate) fn permission_ask(message: &str, pending: Option<&(String, Option<Value>)>) -> (String, String) {
    let named = message.split("to use ").nth(1).map(|t| t.trim().trim_end_matches('.').to_owned());
    let (tool, input) = match pending {
        Some((t, i)) if named.as_deref().is_none_or(|n| n == t) => (t.clone(), i.clone()),
        _ => (named.unwrap_or_default(), None),
    };
    let input = input.as_ref();
    let field = |k: &str| input.and_then(|i| text(i, k)).map(|v| v.chars().take(160).collect::<String>()).unwrap_or_default();
    let file = input.and_then(|i| text(i, "file_path")).map(|p| p.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(&p).to_owned()).unwrap_or_default();
    match tool.as_str() {
        "Bash" | "PowerShell" => ("Komut çalıştırmak için izin istiyor".into(), if input.is_some() { let c = field("command"); if c.is_empty() { field("description") } else { c } } else { String::new() }),
        "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => ("Dosya değiştirmek için izin istiyor".into(), file),
        "Read" => ("Dosya okumak için izin istiyor".into(), file),
        "WebFetch" => ("Bir web sayfasını açmak için izin istiyor".into(), field("url")),
        "WebSearch" => ("Web'de aramak için izin istiyor".into(), field("query")),
        t if t.starts_with("mcp__") => ("Bir araç kullanmak için izin istiyor".into(), t.trim_start_matches("mcp__").replace("__", " · ")),
        "" => ("İzin istiyor".into(), message.chars().take(160).collect()),
        t => (format!("{t} kullanmak için izin istiyor"), String::new()),
    }
}

/// A short, natural phrase for what a tool is doing ("okuyor: main.rs"), in
/// Turkish. Claude writes a tool's own description in English, so commands are
/// told by what they run, not by that description.
pub(crate) fn tool_phrase(tool: &str, input: Option<&Value>) -> String {
    let file = input.and_then(|i| text(i, "file_path")).map(|p| p.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(&p).to_owned());
    match tool {
        "Read" => file.map_or("dosya okuyor".into(), |f| format!("okuyor: {f}")),
        "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => file.map_or("dosya düzenliyor".into(), |f| format!("düzenliyor: {f}")),
        "Bash" | "PowerShell" => command_phrase(&input.and_then(|i| text(i, "command")).unwrap_or_default()).into(),
        "Grep" | "Glob" => "kodda arıyor".into(),
        "WebSearch" | "WebFetch" => "web'de araştırıyor".into(),
        "Task" | "Agent" => "yardımcı ajan başlattı".into(),
        "TodoWrite" => "iş listesini güncelliyor".into(),
        "Skill" => "bir beceri kullanıyor".into(),
        "ToolSearch" => "araç arıyor".into(),
        "BashOutput" | "Monitor" | "TaskOutput" => "arka plandaki işi izliyor".into(),
        "KillShell" | "KillBash" | "TaskStop" => "bir işi durduruyor".into(),
        "AskUserQuestion" => "sana soru hazırlıyor".into(),
        "ExitPlanMode" | "EnterPlanMode" => "plan hazırlıyor".into(),
        _ => "bir araç kullanıyor".into(),
    }
}

/// What a shell command is doing, from the command itself.
fn command_phrase(command: &str) -> &'static str {
    let c = command.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| c.contains(w));
    if has(&["test", "vitest", "pytest", "jest"]) { "test çalıştırıyor" }
    else if has(&["build", "bundle", "tsc ", "compile", "cargo check", "export"]) { "derliyor" }
    else if c.trim_start().starts_with("git ") || has(&["&& git ", "; git "]) { "git ile çalışıyor" }
    else if has(&["install", "pip ", "npm i ", "winget", "choco "]) { "paket kuruyor" }
    else if has(&["python", "node ", "pwsh", "powershell", ".ps1", ".py", ".cjs", ".js"]) { "betik çalıştırıyor" }
    else if has(&["ls ", "dir ", "cat ", "type ", "get-content", "get-childitem", "find ", "grep ", "rg ", "head ", "tail "]) { "dosyalara bakıyor" }
    else { "komut çalıştırıyor" }
}

impl ClaudeMapper {
    pub fn map(&self, hook: &Value, host: &str) -> Vec<NormalizedEvent> {
        let (Some(session), Some(name)) = (text(hook, "session_id"), text(hook, "hook_event_name")) else { return vec![] };
        let at = hook.get("agentoffice_at").and_then(Value::as_u64).unwrap_or_else(now);
        let main = SessionKey { provider: "claude".into(), host_id: host.into(), session_id: session.clone() };
        let agent = text(hook, "agent_id");
        let agent_type = text(hook, "agent_type");
        let (key, parent) = match &agent {
            Some(id) => (SessionKey { session_id: format!("{session}~{id}"), ..main.clone() }, Some(main.clone())),
            None => (main.clone(), None),
        };
        let cwd = text(hook, "cwd");
        let folder = cwd.as_deref().map(|c| c.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(c).to_owned());
        let mut tracks = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let track = tracks.entry(key.session_id.clone()).or_default();
        track.seq += 1;
        // A turn already under way when AgentOffice first hears of the chat is turn 1; the next
        // prompt is turn 2 (never turn 1 again, which is already over).
        if track.seq == 1 && !matches!(name.as_str(), "UserPromptSubmit" | "SubagentStart") { track.turn = 1; }
        // Each hook runs in its own process, so one can arrive after the reply's Stop although it
        // started before it: such a late event belongs to the finished turn. Only a tool that
        // starts after the reply ended means the chat goes on by itself.
        let late = track.replied && at < track.stopped_at && matches!(name.as_str(), "PreToolUse" | "PostToolUse" | "Notification");
        let resumed = name == "PreToolUse" && track.replied && !late;
        if name == "UserPromptSubmit" || name == "SubagentStart" || resumed { track.turn += 1; }
        if matches!(name.as_str(), "UserPromptSubmit" | "SubagentStart" | "PreToolUse") && !late { track.replied = false; }
        if name == "Stop" || name == "SubagentStop" { track.replied = true; track.stopped_at = track.stopped_at.max(at); }
        let turn = track.turn.max(1);
        let event_id = format!("{name}:{}:{at}", track.seq);
        let tool = text(hook, "tool_name");
        let tool_id = text(hook, "tool_use_id").or_else(|| tool.as_ref().map(|t| format!("{t}#{turn}")));
        let transcript = if agent.is_none() { text(hook, "transcript_path") } else { None };
        let base = |kind: EventKind, summary: Option<String>| NormalizedEvent {
            key: key.clone(), event_id: event_id.clone(), kind, at, turn_id: Some(format!("t{turn}")), tool_id: tool_id.clone(),
            name: folder.clone(), project: cwd.clone(), summary, parent_key: parent.clone(), agent_type: agent_type.clone(), transcript: transcript.clone(), ..Default::default()
        };
        let mut out = Vec::new();
        // Progress in this same session after a permission prompt means it was handled in the source app.
        if matches!(name.as_str(), "PreToolUse" | "PostToolUse" | "Stop" | "UserPromptSubmit" | "SessionEnd" | "SubagentStop") {
            if let Some(request_id) = track.open_request.take() {
                let mut closed = base(EventKind::RequestClosed, None);
                closed.event_id = format!("{event_id}:close");
                closed.request = Some(request(&key, request_id, None, String::new(), String::new(), at));
                out.push(closed);
            }
        }
        match name.as_str() {
            "SessionStart" => out.push(base(EventKind::SessionStarted, Some("Oturum açıldı".into()))),
            "SubagentStart" => {
                out.push(base(EventKind::SessionStarted, Some("Yardımcı başladı".into())));
                out.push(base(EventKind::TurnStarted, Some("Çalışıyor".into())));
            }
            "UserPromptSubmit" => out.push(base(EventKind::TurnStarted, Some("İsteği işliyor".into()))),
            "PreToolUse" => {
                if resumed { out.push(base(EventKind::TurnStarted, Some("Kendi kendine devam ediyor".into()))); }
                track.pending_tool = tool.clone().map(|t| (t, hook.get("tool_input").cloned()));
                out.push(base(EventKind::ToolStarted, tool.as_deref().map(|t| tool_phrase(t, hook.get("tool_input")))));
                // A question to the user waits for their answer until the tool ends.
                if tool.as_deref() == Some("AskUserQuestion") {
                    // With its time: the count starts again after a restart, while saved requests keep their ids.
                    let request_id = format!("q{}-{at}", track.seq);
                    track.open_request = Some(request_id.clone());
                    let first = hook.get("tool_input").and_then(|i| i.get("questions")).and_then(Value::as_array).and_then(|q| q.first());
                    let title = first.and_then(|q| text(q, "question")).map(|t| t.chars().take(160).collect()).unwrap_or_else(|| "Bir soru soruyor".into());
                    let detail = first.and_then(|q| q.get("options")).and_then(Value::as_array).map(|o| o.iter().filter_map(|x| text(x, "label")).take(4).collect::<Vec<_>>().join(" · ")).unwrap_or_default();
                    let mut e = base(EventKind::RequestOpened, Some("Soru soruyor".into()));
                    e.event_id = format!("{event_id}:ask");
                    let mut r = request(&key, request_id, Some(format!("t{turn}")), title, detail, at);
                    r.kind = "question".into();
                    r.tool_id = text(hook, "tool_use_id");
                    r.questions = questions_of(hook.get("tool_input"));
                    e.request = Some(r);
                    out.push(e);
                }
            }
            "PostToolUse" => {
                track.pending_tool = None;
                out.push(base(EventKind::ToolEnded, None));
                let input = hook.get("tool_input");
                if let (Some(t), Some(path)) = (tool.as_deref(), input.and_then(|i| text(i, "file_path"))) {
                    let change = match t {
                        "Write" => Some((line_count(input.and_then(|i| i.get("content"))), 0)),
                        "Edit" => Some((line_count(input.and_then(|i| i.get("new_string"))), line_count(input.and_then(|i| i.get("old_string"))))),
                        "MultiEdit" => Some(input.and_then(|i| i.get("edits")).and_then(Value::as_array).map(|edits| edits.iter().fold((0, 0), |(a, d), e| (a + line_count(e.get("new_string")), d + line_count(e.get("old_string"))))).unwrap_or((0, 0))),
                        _ => None,
                    };
                    if let Some((additions, deletions)) = change {
                        let mut e = base(EventKind::FileChanged, None);
                        e.event_id = format!("{event_id}:file");
                        e.file_change = Some(FileChange { path, additions, deletions, before: None, after: None });
                        out.push(e);
                    }
                }
            }
            "Notification" => {
                let message = text(hook, "message").unwrap_or_default();
                let kind = text(hook, "notification_type").unwrap_or_default();
                // A question already open covers its own prompt.
                let asking = track.open_request.as_deref().is_some_and(|r| r.starts_with('q'));
                if asking {}
                else if kind == "permission_prompt" || message.to_lowercase().contains("permission") {
                    let request_id = format!("n{}-{at}", track.seq);
                    track.open_request = Some(request_id.clone());
                    let mut e = base(EventKind::RequestOpened, Some("İzin bekliyor".into()));
                    let (title, detail) = permission_ask(&message, track.pending_tool.as_ref());
                    e.request = Some(request(&key, request_id, Some(format!("t{turn}")), title, detail, at));
                    out.push(e);
                } else if kind == "idle_prompt" {
                    out.push(base(EventKind::Idle, Some("Seni bekliyor".into())));
                }
            }
            // The reply is over; the task itself may go on with the next message.
            "Stop" => out.push(base(EventKind::TurnEnded, Some("Yanıt verdi".into()))),
            "SubagentStop" => out.push(base(EventKind::TurnEnded, Some("İşini bitirdi".into()))),
            "SessionEnd" => out.push(base(EventKind::SessionEnded, Some("Oturum kapandı".into()))),
            _ => {}
        }
        out
    }
}

pub(crate) fn request(key: &SessionKey, request_id: String, turn_id: Option<String>, title: String, detail: String, at: u64) -> PendingRequest {
    PendingRequest {
        key: RequestKey { session_key: key.clone(), request_id }, version: 1, turn_id, kind: "permission".into(), title, detail,
        options: vec![], expires_at: at + 7 * 24 * 3600 * 1000, status: RequestStatus::Pending, can_answer: false, tool_id: None, questions: vec![], hold_until: None, outcome: None
    }
}

/// Pipe server: one JSON line per connection, handed to `deliver`.
#[cfg(windows)]
pub fn serve(deliver: impl Fn(Value) + Send + Sync + 'static) {
    use tokio::io::AsyncReadExt;
    use tokio::net::windows::named_pipe::ServerOptions;
    let deliver = std::sync::Arc::new(deliver);
    tauri::async_runtime::spawn(async move {
        let name = pipe_name();
        let Ok(mut server) = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&name) else { return };
        loop {
            if server.connect().await.is_err() { continue; }
            let mut connected = server;
            server = match ServerOptions::new().reject_remote_clients(true).create(&name) { Ok(s) => s, Err(_) => return };
            let deliver = deliver.clone();
            tauri::async_runtime::spawn(async move {
                let mut buffer = Vec::new();
                let read = tokio::time::timeout(std::time::Duration::from_secs(2), (&mut connected).take(MAX_PAYLOAD as u64).read_to_end(&mut buffer)).await;
                if matches!(read, Ok(Ok(_))) { if let Ok(value) = serde_json::from_slice::<Value>(&buffer) { deliver(value); } }
            });
        }
    });
}

/// Question pipe server: each connection is one waiting question (the `--ask` hook). `deliver`
/// gets the event and a one-shot reply: the text the hook prints (an answer), or an empty one
/// (nothing: Claude asks in its own window). `gone` is told when the hook ended before any
/// reply (Claude stopped it).
#[cfg(windows)]
pub fn serve_asks(deliver: impl Fn(Value, tokio::sync::oneshot::Sender<String>) + Send + Sync + 'static, gone: impl Fn(Value) + Send + Sync + 'static) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::windows::named_pipe::ServerOptions;
    let (deliver, gone) = (std::sync::Arc::new(deliver), std::sync::Arc::new(gone));
    tauri::async_runtime::spawn(async move {
        let name = ask_pipe_name();
        let Ok(mut server) = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&name) else { return };
        loop {
            if server.connect().await.is_err() { continue; }
            let mut connected = server;
            server = match ServerOptions::new().reject_remote_clients(true).create(&name) { Ok(s) => s, Err(_) => return };
            let (deliver, gone) = (deliver.clone(), gone.clone());
            tauri::async_runtime::spawn(async move {
                // One line: the hook's event.
                let mut buffer = Vec::new(); let mut byte = [0u8; 4096];
                let read = tokio::time::timeout(std::time::Duration::from_secs(2), async {
                    loop { let n = connected.read(&mut byte).await.ok()?; if n == 0 { return Some(()); } buffer.extend_from_slice(&byte[..n]); if buffer.contains(&b'\n') || buffer.len() > MAX_PAYLOAD { return Some(()); } }
                }).await;
                let Ok(Some(())) = read else { return };
                let Ok(event) = serde_json::from_slice::<Value>(buffer.split(|b| *b == b'\n').next().unwrap_or(&[])) else { return };
                let (tx, rx) = tokio::sync::oneshot::channel::<String>();
                deliver(event.clone(), tx);
                // The answer, or the hook going away (its read ends) before one comes.
                let mut probe = [0u8; 1];
                tokio::select! {
                    reply = rx => {
                        // One line, then left for the hook to read and close: cutting the pipe at once
                        // (DisconnectNamedPipe) would throw away what it has not read yet.
                        if let Ok(text) = reply { let _ = connected.write_all(format!("{}\n", text.replace('\n', " ")).as_bytes()).await; let _ = connected.flush().await; }
                        let mut rest = [0u8; 64];
                        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), connected.read(&mut rest)).await;
                    }
                    _ = connected.read(&mut probe) => { gone(event); }
                }
            });
        }
    });
}

/// What the hook prints to answer a question here, as Claude Code documents it: "allow" with the
/// original questions and the user's answers (question text → chosen label(s), or their words).
pub fn ask_answer_output(tool_input: &Value, answers: &serde_json::Map<String, Value>) -> String {
    let mut input = tool_input.clone();
    if !input.is_object() { input = Value::Object(Default::default()); }
    input["answers"] = Value::Object(answers.clone());
    serde_json::json!({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "updatedInput": input}}).to_string()
}

/// Usage limits from Claude Code's status line input (`rate_limits`, sent for
/// Pro/Max plans after the first response): the 5-hour and weekly windows and
/// any model-specific ones (`seven_day_<model>`), each with a used percentage
/// and a reset time (epoch seconds or an ISO time, by Claude Code version).
pub fn claude_limits(status: &Value, at: u64) -> Option<ProviderLimits> {
    let rl = status.get("rate_limits")?.as_object()?;
    let mut windows: Vec<LimitWindow> = rl.iter().filter_map(|(key, w)| {
        let used = ["used_percentage", "utilization", "used_percent"].iter().find_map(|k| w.get(*k)?.as_f64())?;
        let (minutes, rest) = if let Some(rest) = key.strip_prefix("five_hour") { (300, rest) } else if let Some(rest) = key.strip_prefix("seven_day") { (10080, rest) } else { return None };
        // Model windows only (the usage service also lists e.g. oauth_apps).
        if rest.contains("oauth") { return None; }
        let model = rest.strip_prefix('_').filter(|m| !m.is_empty()).map(|m| { let m = m.replace('_', " "); let mut c = m.chars(); c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default() });
        let resets_at = w.get("resets_at").or_else(|| w.get("reset_at"))
            .and_then(|r| r.as_u64().map(|n| if n > 100_000_000_000 { n } else { n * 1000 }).or_else(|| r.as_str().and_then(crate::codex::parse_time)));
        Some(LimitWindow { window_minutes: minutes, used_percent: used, resets_at, model })
    }).collect();
    if windows.is_empty() { return None; }
    windows.sort_by(|a, b| (a.window_minutes, a.model.is_some()).cmp(&(b.window_minutes, b.model.is_some())));
    Some(ProviderLimits { provider: "claude".into(), plan: None, windows, updated_at: at, source: "Claude Code durum satırı".into(), note: None, credits: None, resets_available: None })
}

const CLAUDE_EVENTS: [&str; 9] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"];
fn is_ours(entry: &Value) -> bool {
    entry.get("hooks").and_then(Value::as_array).is_some_and(|hooks| hooks.iter().any(|h| h.get("command").and_then(Value::as_str).is_some_and(|c| (c.contains("--hook claude") || c.contains("--ask claude")) && c.to_lowercase().contains("agentoffice"))))
}
fn is_ask(entry: &Value) -> bool {
    entry.get("hooks").and_then(Value::as_array).is_some_and(|hooks| hooks.iter().any(|h| h.get("command").and_then(Value::as_str).is_some_and(|c| c.contains("--ask claude"))))
}
/// How long Claude Code lets the question hook wait (seconds); the app hands the question back
/// sooner, when the time the user chose has passed.
pub const ASK_TIMEOUT_S: u64 = 660;

/// Adds or removes AgentOffice's entries in a Claude Code settings document,
/// leaving every other setting and hook untouched.
pub fn apply_claude_hooks(mut settings: Value, command: &str, enable: bool) -> Value {
    if !settings.is_object() { settings = Value::Object(Default::default()); }
    if !settings.get("hooks").is_some_and(Value::is_object) { settings["hooks"] = Value::Object(Default::default()); }
    let hooks = settings["hooks"].as_object_mut().unwrap();
    for event in CLAUDE_EVENTS {
        let list = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
        if !list.is_array() { *list = Value::Array(vec![]); }
        let list = list.as_array_mut().unwrap();
        list.retain(|entry| !is_ours(entry));
        if enable {
            let mut entry = serde_json::json!({"hooks": [{"type": "command", "command": command, "timeout": 5}]});
            if matches!(event, "PreToolUse" | "PostToolUse") { entry["matcher"] = Value::String("*".into()); }
            list.push(entry);
            if event == "PreToolUse" {
                list.push(serde_json::json!({"matcher": "AskUserQuestion", "hooks": [{"type": "command", "command": command.replace("--hook claude", "--ask claude"), "timeout": ASK_TIMEOUT_S}]}));
            }
        }
    }
    hooks.retain(|_, list| list.as_array().is_none_or(|l| !l.is_empty()));
    if hooks.is_empty() { settings.as_object_mut().unwrap().remove("hooks"); }
    // Status line: the only Claude Code feed that carries usage limits. Added
    // only when the user has none of their own; removed only if it is ours.
    let ours = |v: &Value| v.get("command").and_then(Value::as_str).is_some_and(|c| c.contains("--statusline") && c.to_lowercase().contains("agentoffice"));
    let object = settings.as_object_mut().unwrap();
    match (enable, object.get("statusLine")) {
        (true, None) => { object.insert("statusLine".into(), serde_json::json!({"type": "command", "command": command.replace("--hook claude", "--statusline"), "padding": 0})); }
        // Ours (also from an older path) is written again pointing at today's helper.
        (true, Some(line)) if ours(line) => { object.insert("statusLine".into(), serde_json::json!({"type": "command", "command": command.replace("--hook claude", "--statusline"), "padding": 0})); }
        (false, Some(line)) if ours(line) => { object.remove("statusLine"); }
        _ => {}
    }
    settings
}

pub fn claude_hooks_installed(settings: &Value) -> bool {
    settings.get("hooks").and_then(Value::as_object).is_some_and(|h| CLAUDE_EVENTS.iter().all(|e| h.get(*e).and_then(Value::as_array).is_some_and(|l| l.iter().any(|x| is_ours(x) && !is_ask(x)))))
}
/// Whether the question entry is there too (an install from before it lacks it).
pub fn claude_ask_installed(settings: &Value) -> bool {
    settings.get("hooks").and_then(|h| h.get("PreToolUse")).and_then(Value::as_array).is_some_and(|l| l.iter().any(is_ask))
}

/// The commands of AgentOffice's own hook entries in a Claude Code settings document.
pub fn claude_entries(settings: &Value) -> Vec<String> {
    settings.get("hooks").and_then(Value::as_object).into_iter().flat_map(|h| h.values()).filter_map(Value::as_array).flatten()
        .filter(|e| is_ours(e)).flat_map(|e| e.get("hooks").and_then(Value::as_array).cloned().unwrap_or_default())
        .filter_map(|h| h.get("command").and_then(Value::as_str).map(str::to_owned)).collect()
}

#[cfg(not(windows))] pub fn run_hook(_: &str) {}
#[cfg(not(windows))] pub fn serve(_: impl Fn(Value) + Send + Sync + 'static) {}
#[cfg(not(windows))] pub fn serve_asks(_: impl Fn(Value, tokio::sync::oneshot::Sender<String>) + Send + Sync + 'static, _: impl Fn(Value) + Send + Sync + 'static) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn hook(session: &str, name: &str, extra: Value) -> Value {
        let mut v = json!({"session_id": session, "hook_event_name": name, "cwd": "C:\\work\\demo-app", "agentoffice_at": 1000});
        for (k, val) in extra.as_object().unwrap() { v[k] = val.clone(); }
        v
    }
    #[test] fn maps_a_turn_and_keeps_sessions_apart() {
        let m = ClaudeMapper::default();
        let a = m.map(&hook("A", "UserPromptSubmit", json!({})), "pc");
        let b = m.map(&hook("B", "UserPromptSubmit", json!({})), "pc");
        assert_eq!(a[0].kind, EventKind::TurnStarted);
        assert_eq!(a[0].key.session_id, "A"); assert_eq!(b[0].key.session_id, "B");
        assert_eq!(a[0].name.as_deref(), Some("demo-app"));
        let stop = m.map(&hook("A", "Stop", json!({})), "pc");
        assert_eq!(stop[0].kind, EventKind::TurnEnded);
        assert_eq!(stop[0].turn_id, a[0].turn_id);
        assert_ne!(stop[0].event_id, a[0].event_id);
    }
    #[test] fn permission_prompt_opens_and_progress_closes_it() {
        let m = ClaudeMapper::default();
        m.map(&hook("A", "UserPromptSubmit", json!({})), "pc");
        let open = m.map(&hook("A", "Notification", json!({"message": "Claude needs your permission to use Bash", "notification_type": "permission_prompt"})), "pc");
        assert_eq!(open[0].kind, EventKind::RequestOpened);
        assert!(!open[0].request.as_ref().unwrap().can_answer);
        let next = m.map(&hook("A", "PreToolUse", json!({"tool_name": "Bash", "tool_use_id": "tu1"})), "pc");
        assert_eq!(next[0].kind, EventKind::RequestClosed);
        assert_eq!(next[1].kind, EventKind::ToolStarted);
        assert_eq!(next[1].tool_id.as_deref(), Some("tu1"));
    }
    #[test] fn a_permission_says_what_it_is_for() {
        let m = ClaudeMapper::default();
        m.map(&hook("A", "UserPromptSubmit", json!({})), "pc");
        m.map(&hook("A", "PreToolUse", json!({"tool_name": "Bash", "tool_use_id": "b1", "tool_input": {"command": "npm test", "description": "Run tests"}})), "pc");
        let open = m.map(&hook("A", "Notification", json!({"message": "Claude needs your permission to use Bash", "notification_type": "permission_prompt"})), "pc");
        let r = open[0].request.as_ref().unwrap();
        assert_eq!((r.title.as_str(), r.detail.as_str()), ("Komut çalıştırmak için izin istiyor", "npm test"));
        m.map(&hook("A", "PostToolUse", json!({"tool_name": "Bash", "tool_use_id": "b1"})), "pc");
        m.map(&hook("A", "PreToolUse", json!({"tool_name": "Edit", "tool_use_id": "e1", "tool_input": {"file_path": "C:\\work\\cart.ts"}})), "pc");
        let open = m.map(&hook("A", "Notification", json!({"message": "Claude needs your permission to use Edit", "notification_type": "permission_prompt"})), "pc");
        let r = open[0].request.as_ref().unwrap();
        assert_eq!((r.title.as_str(), r.detail.as_str()), ("Dosya değiştirmek için izin istiyor", "cart.ts"));
    }
    #[test] fn work_that_resumes_after_a_reply_counts_as_working_again() {
        let m = ClaudeMapper::default();
        let mut s = crate::domain::Store::new();
        for e in m.map(&hook("A", "UserPromptSubmit", json!({})), "pc") { s.ingest(e); }
        for e in m.map(&hook("A", "Stop", json!({})), "pc") { s.ingest(e); }
        // A background task finishes and Claude carries on without a new message.
        for e in m.map(&hook("A", "PreToolUse", json!({"tool_name": "Bash", "tool_use_id": "b9"})), "pc") { s.ingest(e); }
        let snap = s.snapshot();
        assert_eq!(snap.sessions[0].status, crate::domain::SessionStatus::Working);
        for e in m.map(&hook("A", "PostToolUse", json!({"tool_name": "Bash", "tool_use_id": "b9"})), "pc") { s.ingest(e); }
        for e in m.map(&hook("A", "Stop", json!({})), "pc") { s.ingest(e); }
        assert_eq!(s.snapshot().sessions[0].status, crate::domain::SessionStatus::ReplyEnded);
    }
    #[test] fn work_is_told_in_turkish_not_in_the_tools_english_description() {
        assert_eq!(tool_phrase("Bash", Some(&json!({"command": "npm test", "description": "Run the tests"}))), "test çalıştırıyor");
        assert_eq!(tool_phrase("Bash", Some(&json!({"command": "git status --short", "description": "Show working tree status"}))), "git ile çalışıyor");
        assert_eq!(tool_phrase("Bash", Some(&json!({"command": "ffmpeg -i a.mp4 b.gif", "description": "Make a gif"}))), "komut çalıştırıyor");
        assert_eq!(tool_phrase("Agent", Some(&json!({"description": "Find the bug"}))), "yardımcı ajan başlattı");
        assert_eq!(tool_phrase("TodoWrite", None), "iş listesini güncelliyor");
        assert_eq!(tool_phrase("SomethingNew", None), "bir araç kullanıyor");
    }
    #[test] fn edit_reports_file_change_without_contents() {
        let m = ClaudeMapper::default();
        let out = m.map(&hook("A", "PostToolUse", json!({"tool_name": "Edit", "tool_input": {"file_path": "C:\\work\\a.ts", "old_string": "a\nb", "new_string": "c"}})), "pc");
        let change = out.iter().find_map(|e| e.file_change.clone()).unwrap();
        assert_eq!((change.additions, change.deletions), (1, 2));
        assert!(change.before.is_none() && change.after.is_none());
    }
    #[test] fn hook_install_merges_and_removes_only_ours() {
        let user = json!({"model": "x", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}});
        let cmd = r#""C:\Apps\AgentOffice\agentoffice.exe" --hook claude"#;
        let on = apply_claude_hooks(user.clone(), cmd, true);
        assert!(claude_hooks_installed(&on));
        assert_eq!(on["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(apply_claude_hooks(on.clone(), cmd, true), on);
        let off = apply_claude_hooks(on, cmd, false);
        assert_eq!(off, user);
    }
    #[test] fn reads_claude_limits_from_the_status_line() {
        let status = json!({"rate_limits": {
            "five_hour": {"used_percentage": 12.5, "resets_at": 1792700000},
            "seven_day": {"used_percentage": 3.0, "resets_at": "2026-10-24T20:00:00Z"},
            "seven_day_fable": {"used_percentage": 41.0, "resets_at": 1793100000}}});
        let limits = claude_limits(&status, 5).unwrap();
        assert_eq!(limits.provider, "claude");
        assert_eq!(limits.windows.iter().map(|w| (w.window_minutes, w.model.clone())).collect::<Vec<_>>(), vec![(300, None), (10080, None), (10080, Some("Fable".into()))]);
        assert_eq!(limits.windows[0].resets_at, Some(1792700000000));
        assert_eq!(limits.windows[1].resets_at, crate::codex::parse_time("2026-10-24T20:00:00Z"));
        assert!(claude_limits(&json!({"model": {"id": "x"}}), 5).is_none());
    }
    #[test] fn status_line_is_added_only_when_free_and_removed_only_if_ours() {
        let command = r#""C:\\AgentOffice\\agentoffice-hook.exe" --hook claude"#;
        let on = apply_claude_hooks(json!({}), command, true);
        assert!(on["statusLine"]["command"].as_str().unwrap().ends_with("--statusline"));
        assert!(apply_claude_hooks(on, command, false).get("statusLine").is_none());
        let theirs = json!({"statusLine": {"type": "command", "command": "my-line"}});
        assert_eq!(apply_claude_hooks(theirs.clone(), command, true)["statusLine"], theirs["statusLine"]);
        assert_eq!(apply_claude_hooks(theirs.clone(), command, false)["statusLine"], theirs["statusLine"]);
    }
    #[test] fn two_chats_in_one_folder_and_a_helper_stay_apart() {
        let m = ClaudeMapper::default();
        let a = m.map(&hook("chat-a", "UserPromptSubmit", json!({})), "pc");
        let b = m.map(&hook("chat-b", "UserPromptSubmit", json!({})), "pc");
        assert_ne!(a[0].key, b[0].key);
        let helper = m.map(&hook("chat-a", "PreToolUse", json!({"agent_id": "ag1", "agent_type": "Explore", "tool_name": "Read", "tool_use_id": "u1", "tool_input": {"file_path": "C:\\w\\main.rs"}})), "pc");
        assert_eq!(helper[0].key.session_id, "chat-a~ag1");
        assert_eq!(helper[0].parent_key.as_ref().map(|k| k.session_id.as_str()), Some("chat-a"));
        assert_eq!(helper[0].agent_type.as_deref(), Some("Explore"));
        assert_eq!(helper[0].summary.as_deref(), Some("okuyor: main.rs"));
        // A permission prompt in the chat is not closed by the helper's tools.
        let asked = m.map(&hook("chat-a", "Notification", json!({"notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash"})), "pc");
        assert_eq!(asked[0].kind, EventKind::RequestOpened);
        let helper_tool = m.map(&hook("chat-a", "PostToolUse", json!({"agent_id": "ag1", "tool_name": "Read", "tool_use_id": "u1"})), "pc");
        assert!(helper_tool.iter().all(|e| e.kind != EventKind::RequestClosed));
        let idle = m.map(&hook("chat-b", "Notification", json!({"notification_type": "idle_prompt", "message": "Claude is waiting for your input"})), "pc");
        assert_eq!(idle[0].kind, EventKind::Idle);
        assert_eq!(m.map(&hook("chat-b", "SessionEnd", json!({})), "pc")[0].kind, EventKind::SessionEnded);
    }
    #[test] fn a_question_answered_here_goes_once_with_the_users_answers_and_only_while_its_hook_waits() {
        use crate::domain::{AnswerResult, RequestStatus, Store};
        let m = ClaudeMapper::default(); let mut store = Store::new();
        let input = json!({"questions": [{"question": "Hangi renk olsun?", "header": "Renk", "options": [{"label": "Mavi", "description": "Sakin"}, {"label": "Yeşil"}], "multiSelect": false}, {"question": "Neler eklensin?", "header": "Ek", "options": [{"label": "Gölge"}, {"label": "Kenar"}], "multiSelect": true}]});
        for e in m.map(&hook("A", "UserPromptSubmit", json!({"agentoffice_at": now()})), "pc") { store.ingest(e); }
        for e in m.map(&hook("A", "PreToolUse", json!({"agentoffice_at": now(), "tool_name": "AskUserQuestion", "tool_use_id": "q1", "tool_input": input})), "pc") { store.ingest(e); }
        let open = |s: &mut Store| s.snapshot().requests.into_iter().find(|r| r.tool_id.as_deref() == Some("q1")).unwrap();
        let r = open(&mut store);
        // The whole question is known, but it is not answerable here until its hook waits.
        assert_eq!((r.questions.len(), r.questions[0].options[0].description.as_str(), r.questions[1].multi_select, r.can_answer), (2, "Sakin", true, false));
        assert_eq!(store.begin_live_answer(&r.key, r.version, now()).unwrap_err(), AnswerResult::Unsupported);
        let key = r.key.session_key.clone();
        store.set_live_ask(&key, "q1", Some(9_000_000));
        let r = open(&mut store);
        assert!(r.can_answer && r.hold_until == Some(9_000_000));
        // A card older than the last change is stale; the current one starts the hand-over once.
        assert_eq!(store.begin_live_answer(&r.key, r.version - 1, now()).unwrap_err(), AnswerResult::Stale);
        let (tool, ticket) = store.begin_live_answer(&r.key, r.version, now()).unwrap();
        assert_eq!(tool, "q1");
        assert_eq!(store.begin_live_answer(&r.key, r.version, now()).unwrap_err(), AnswerResult::Stale);
        assert_eq!(store.finish_answer_at(&r.key, ticket, true, now()), AnswerResult::Delivered);
        store.set_live_ask(&key, "q1", None);
        // Claude's own end of the tool keeps "answered here".
        for e in m.map(&hook("A", "PostToolUse", json!({"agentoffice_at": now(), "tool_name": "AskUserQuestion", "tool_use_id": "q1"})), "pc") { store.ingest(e); }
        let done = open(&mut store);
        assert_eq!((done.status, done.outcome.as_deref(), done.can_answer), (RequestStatus::Resolved, Some("delivered"), false));
        // What the hook prints: allow, the questions as asked, and the user's answers.
        let mut answers = serde_json::Map::new();
        answers.insert("Hangi renk olsun?".into(), json!("Mavi")); answers.insert("Neler eklensin?".into(), json!("Gölge, Kenar"));
        let out: Value = serde_json::from_str(&ask_answer_output(&input, &answers)).unwrap();
        assert_eq!(out["hookSpecificOutput"]["permissionDecision"], "allow");
        assert_eq!(out["hookSpecificOutput"]["updatedInput"]["questions"], input["questions"]);
        assert_eq!(out["hookSpecificOutput"]["updatedInput"]["answers"]["Neler eklensin?"], "Gölge, Kenar");
    }
    #[test] fn a_question_handed_back_to_claude_is_no_longer_answerable_here() {
        use crate::domain::{AnswerResult, RequestStatus, Store};
        let m = ClaudeMapper::default(); let mut store = Store::new();
        for e in m.map(&hook("A", "PreToolUse", json!({"agentoffice_at": now(), "tool_name": "AskUserQuestion", "tool_use_id": "q2", "tool_input": {"questions": [{"question": "Devam?", "header": "D", "options": [{"label": "Evet"}, {"label": "Hayır"}]}]}})), "pc") { store.ingest(e); }
        let key = store.snapshot().requests[0].key.clone();
        store.set_live_ask(&key.session_key, "q2", Some(5000));
        store.set_live_ask(&key.session_key, "q2", None);
        let r = store.snapshot().requests[0].clone();
        assert_eq!((r.can_answer, r.outcome.as_deref(), r.status.clone()), (false, Some("released"), RequestStatus::Pending));
        assert_eq!(store.begin_live_answer(&r.key, r.version, now()).unwrap_err(), AnswerResult::Stale);
        // Answered in Claude afterwards.
        for e in m.map(&hook("A", "PostToolUse", json!({"agentoffice_at": now(), "tool_name": "AskUserQuestion", "tool_use_id": "q2"})), "pc") { store.ingest(e); }
        assert_eq!(store.snapshot().requests[0].status, RequestStatus::Resolved);
    }
    #[test] fn an_event_is_claude_only_on_claude_code_s_own_evidence() {
        let claude_path = r"C:\Users\u\.claude\projects\C--work\abc.jsonl";
        // Claude Code: its transcript, or its environment (helper-passed names).
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": claude_path})), "claude");
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": "C:/Users/u/.claude/projects/x/a.jsonl"})), "claude");
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "agentoffice_env": ["CLAUDECODE"]})), "claude");
        // Grok Build runs Claude's hooks with its own environment and camelCase fields.
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": claude_path, "agentoffice_env": ["GROK_HOOK_EVENT", "CLAUDECODE"]})), "grok");
        assert_eq!(source_of(&json!({"hookEventName": "Stop", "sessionId": "g1"})), "grok");
        // Cursor's payload says so.
        assert_eq!(source_of(&json!({"hook_event_name": "stop", "cursor_version": "2.1.0", "conversation_id": "c1"})), "cursor");
        // GitHub Copilot: CLI and VS Code transcripts.
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": r"C:\Users\u\.copilot\session-state\s1\events.jsonl"})), "copilot");
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": r"C:\Users\u\AppData\Roaming\Code\User\workspaceStorage\h\chatSessions\s.json"})), "vscode");
        // Nothing that says who: unknown, never Claude.
        assert_eq!(source_of(&json!({"hook_event_name": "UserPromptSubmit", "session_id": "s", "cwd": "C:\\w"})), "unknown");
        assert_eq!(source_of(&json!({"hook_event_name": "Stop", "transcript_path": r"C:\tmp\other\t.jsonl"})), "unknown");
    }
    #[test] fn a_question_after_a_restart_is_shown_even_where_an_old_one_was_saved() {
        use crate::domain::{RequestStatus, Store};
        let ask = |id: &str, at: u64| hook("A", "PreToolUse", json!({"agentoffice_at": at, "tool_name": "AskUserQuestion", "tool_use_id": id, "tool_input": {"questions": [{"question": "Devam?", "header": "D", "options": [{"label": "Evet"}, {"label": "Hayır"}]}]}}));
        let (m, mut store) = (ClaudeMapper::default(), Store::new());
        for e in m.map(&hook("A", "UserPromptSubmit", json!({"agentoffice_at": now() - 9000})), "pc") { store.ingest(e); }
        for e in m.map(&ask("t1", now() - 8000), "pc") { store.ingest(e); }
        // AgentOffice restarts: the saved question is over, the chat's events are counted afresh.
        let mut store = Store::restore(store.snapshot());
        let m = ClaudeMapper::default();
        for e in m.map(&hook("A", "UserPromptSubmit", json!({"agentoffice_at": now() - 1000})), "pc") { store.ingest(e); }
        for e in m.map(&ask("t2", now()), "pc") { store.ingest(e); }
        let open: Vec<_> = store.snapshot().requests.into_iter().filter(|r| r.status == RequestStatus::Pending).collect();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].tool_id.as_deref(), Some("t2"));
    }
    #[test] fn the_question_hook_is_installed_only_for_questions_with_room_to_wait() {
        let s = apply_claude_hooks(json!({}), "\"C:\\x\\agentoffice-hook.exe\" --hook claude", true);
        let pre = s["hooks"]["PreToolUse"].as_array().unwrap();
        let ask: Vec<&Value> = pre.iter().filter(|e| e["matcher"] == "AskUserQuestion").collect();
        assert_eq!(ask.len(), 1);
        assert!(ask[0]["hooks"][0]["command"].as_str().unwrap().contains("--ask claude"));
        assert_eq!(ask[0]["hooks"][0]["timeout"], ASK_TIMEOUT_S);
        assert!(claude_hooks_installed(&s) && claude_ask_installed(&s));
        // Removing takes both away; an older install without the question entry asks to be renewed.
        let off = apply_claude_hooks(s.clone(), "x --hook claude", false);
        assert!(off.get("hooks").is_none());
        let mut old = s.clone(); old["hooks"]["PreToolUse"].as_array_mut().unwrap().retain(|e| e["matcher"] != "AskUserQuestion");
        assert!(claude_hooks_installed(&old) && !claude_ask_installed(&old));
    }
    #[test] fn a_question_waits_for_the_answer_and_says_what_it_asks() {
        let m = ClaudeMapper::default();
        m.map(&hook("A", "UserPromptSubmit", json!({})), "pc");
        let ask = m.map(&hook("A", "PreToolUse", json!({"tool_name": "AskUserQuestion", "tool_use_id": "q1", "tool_input": {"questions": [{"question": "Hangi renk olsun?", "header": "Renk", "options": [{"label": "Mavi"}, {"label": "Yeşil"}], "multiSelect": false}]}})), "pc");
        let r = ask.iter().find(|e| e.kind == EventKind::RequestOpened).and_then(|e| e.request.clone()).unwrap();
        assert_eq!((r.kind.as_str(), r.title.as_str(), r.detail.as_str(), r.can_answer), ("question", "Hangi renk olsun?", "Mavi · Yeşil", false));
        assert_ne!(ask[0].event_id, ask[1].event_id);
        // Its prompt does not open a second request; the answer closes it.
        assert!(m.map(&hook("A", "Notification", json!({"notification_type": "permission_prompt", "message": "Claude needs your permission to use AskUserQuestion"})), "pc").is_empty());
        let answered = m.map(&hook("A", "PostToolUse", json!({"tool_name": "AskUserQuestion", "tool_use_id": "q1"})), "pc");
        assert_eq!(answered[0].kind, EventKind::RequestClosed);
    }
    #[test] fn ignores_malformed_events() {
        assert!(ClaudeMapper::default().map(&json!({"hook_event_name": "Stop"}), "pc").is_empty());
    }
}
