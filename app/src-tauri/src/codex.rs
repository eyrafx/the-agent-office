//! Live source: Codex (GPT) session rollouts.
//!
//! Codex writes every session to `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
//! This adapter only reads those files: it changes no Codex setting and reads no
//! message text into the office, only session identity, turn boundaries,
//! approval prompts and the rate-limit readings Codex records itself. Thread
//! names come from `~/.codex/session_index.jsonl`; the app's own list of
//! projects and threads (which are archived, where each is filed) from its
//! state database, opened read only.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use serde_json::Value;
use crate::domain::{EventKind, LimitWindow, NormalizedEvent, PendingRequest, ProviderLimits, RequestKey, RequestStatus, SessionKey};

/// Parses `2026-10-21T19:54:51.237Z` to Unix milliseconds (UTC only, as Codex writes).
pub fn parse_time(text: &str) -> Option<u64> {
    let b = text.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[10] != b'T' { return None; }
    let n = |r: std::ops::Range<usize>| text.get(r)?.parse::<i64>().ok();
    let (y, m, d, hh, mm, ss) = (n(0..4)?, n(5..7)?, n(8..10)?, n(11..13)?, n(14..16)?, n(17..19)?);
    let millis = text.get(19..).and_then(|rest| rest.strip_prefix('.')).map(|f| f.chars().take_while(char::is_ascii_digit).collect::<String>())
        .map(|f| format!("{f:0<3}")[..3].parse::<i64>().unwrap_or(0)).unwrap_or(0);
    // Days from civil (Howard Hinnant).
    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = y.div_euclid(400); let yoe = y - era * 400;
    let doy = (153 * m + 2) / 5 + d - 1; let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    u64::try_from(((days * 86400 + hh * 3600 + mm * 60 + ss) * 1000) + millis).ok()
}

#[derive(Default)]
struct Rollout { key: Option<SessionKey>, name: Option<String>, project: Option<String>, turn: Option<String>, open_request: Option<String>,
    /// Questions Codex asked the user (request_user_input) with no answer yet, and whether the
    /// question's own output is the answer (asked and waited for). One asked without waiting
    /// stays open past the end of its turn, until the user's reply names it or the user writes
    /// to the chat again.
    questions: Vec<(String, bool)>,
    /// A helper thread's main thread and nickname; `hidden`: Codex's own reviewer, not a thread of the user's.
    parent: Option<SessionKey>, agent: Option<String>, hidden: bool }

#[derive(Default)]
pub struct CodexMapper { files: HashMap<PathBuf, Rollout>, titles: HashMap<String, String> }

fn text(v: &Value, key: &str) -> Option<String> { v.get(key).and_then(Value::as_str).map(str::to_owned).filter(|s| !s.is_empty()) }

impl CodexMapper {
    /// Maps one rollout line. `event_id` must be unique per line (file + offset).
    pub fn map_line(&mut self, file: &Path, line: &str, event_id: String, replay: bool, host: &str) -> (Vec<NormalizedEvent>, Option<ProviderLimits>) {
        let Ok(v) = serde_json::from_str::<Value>(line) else { return (vec![], None) };
        let at = v.get("timestamp").and_then(Value::as_str).and_then(parse_time).unwrap_or_else(crate::relay::now);
        let payload = v.get("payload").cloned().unwrap_or(Value::Null);
        let state = self.files.entry(file.to_path_buf()).or_default();
        if v.get("type").and_then(Value::as_str) == Some("session_meta") {
            let Some(id) = text(&payload, "id").or_else(|| text(&payload, "session_id")) else { return (vec![], None) };
            state.key = Some(SessionKey { provider: "codex".into(), host_id: host.into(), session_id: id });
            state.project = text(&payload, "cwd");
            let source = payload.get("source").and_then(|s| s.get("subagent"));
            state.hidden = source.and_then(|s| s.get("other")).is_some();
            state.parent = source.and_then(|s| s.get("thread_spawn")).and_then(|t| text(t, "parent_thread_id"))
                .map(|id| SessionKey { provider: "codex".into(), host_id: host.into(), session_id: id });
            state.agent = text(&payload, "agent_nickname").or_else(|| text(&payload, "agent_role"));
            state.name = name_of(&self.titles, state);
        }
        let Some(key) = state.key.clone() else { return (vec![], None) };
        let kind = payload.get("type").and_then(Value::as_str).unwrap_or_default().to_owned();
        let turn_of = |p: &Value| text(p, "turn_id").or_else(|| p.get("turn_attribution").and_then(|t| text(t, "turn_id")));
        let base = |kind: EventKind, turn: Option<String>, summary: Option<&str>| NormalizedEvent {
            key: key.clone(), event_id: event_id.clone(), kind, at, turn_id: turn, name: state.name.clone(), project: state.project.clone(),
            summary: summary.map(str::to_owned), replay, parent_key: state.parent.clone(), agent_type: state.agent.clone(), ..Default::default()
        };
        let mut out = Vec::new();
        let mut limits = None;
        match (v.get("type").and_then(Value::as_str).unwrap_or_default(), kind.as_str()) {
            ("session_meta", _) => out.push(base(EventKind::SessionStarted, None, Some("Oturum açık"))),
            ("event_msg", "task_started") => {
                // A turn the user started themself: they are back in the chat, so a question they
                // passed over is not waiting for them any more (a reply to it starts its own turn).
                let trigger = payload.get("turn_attribution").and_then(|t| text(t, "turn_trigger")).or_else(|| text(&payload, "turn_trigger"));
                if matches!(trigger.as_deref(), Some("composer" | "queue" | "edit_user_message" | "remote_android")) {
                    for (i, (request_id, _)) in state.questions.drain(..).enumerate() { out.push(question_closed(base(EventKind::RequestClosed, None, None), &key, request_id, format!("{event_id}:moved{i}"))); }
                }
                state.turn = turn_of(&payload); out.push(base(EventKind::TurnStarted, state.turn.clone(), Some("Görev çalışıyor")));
            }
            ("event_msg", "task_complete") => { let mut e = base(EventKind::TurnEnded, turn_of(&payload).or(state.turn.clone()), Some("Yanıt tamamlandı")); e.reply = text(&payload, "last_agent_message").and_then(|m| crate::claude_meta::first_sentence(&m)); out.push(e); }
            ("event_msg", "turn_aborted") => out.push(base(EventKind::Interrupted, turn_of(&payload).or(state.turn.clone()), Some("Tur durduruldu"))),
            ("event_msg", approval) if approval.ends_with("_approval_request") => {
                let request_id = text(&payload, "call_id").unwrap_or_else(|| event_id.clone());
                state.open_request = Some(request_id.clone());
                let mut e = base(EventKind::RequestOpened, state.turn.clone(), Some("Onay bekliyor"));
                e.request = Some(PendingRequest {
                    key: RequestKey { session_key: key.clone(), request_id }, version: 1, turn_id: state.turn.clone(), kind: "permission".into(),
                    title: if approval.starts_with("exec") { "Komut onayı isteniyor".into() } else { "Değişiklik onayı isteniyor".into() },
                    detail: String::new(), options: vec![], expires_at: at + 30 * 60 * 1000, status: RequestStatus::Pending, can_answer: false, tool_id: None, questions: vec![], hold_until: None, outcome: None
                });
                out.push(e);
            }
            // A question to the user (Codex's "Soru" card): asked without waiting, so it stays
            // open after the turn ends, until the user answers (or skips) it in Codex.
            ("response_item", "function_call") if text(&payload, "name").is_some_and(|n| n.starts_with("request_user_input")) => {
                let request_id = text(&payload, "call_id").unwrap_or_else(|| event_id.clone());
                let args: Value = payload.get("arguments").and_then(Value::as_str).and_then(|a| serde_json::from_str(a).ok()).unwrap_or_default();
                let first = args.get("questions").and_then(Value::as_array).and_then(|q| q.first());
                let title = first.and_then(|q| text(q, "title").or_else(|| text(q, "question"))).map(|t| t.chars().take(160).collect()).unwrap_or_else(|| "Bir soru soruyor".to_owned());
                let detail = first.and_then(|q| q.get("options")).and_then(Value::as_array).map(|o| o.iter().filter_map(|x| x.as_str().map(str::to_owned).or_else(|| text(x, "label"))).take(4).collect::<Vec<_>>().join(" · ")).unwrap_or_default();
                if !state.questions.iter().any(|(id, _)| id == &request_id) { state.questions.push((request_id.clone(), text(&payload, "name").as_deref() == Some("request_user_input"))); }
                let mut e = base(EventKind::RequestOpened, None, Some("Soru soruyor"));
                e.request = Some(PendingRequest {
                    key: RequestKey { session_key: key.clone(), request_id }, version: 1, turn_id: None, kind: "question".into(), title, detail,
                    options: vec![], expires_at: at + 7 * 24 * 3600 * 1000, status: RequestStatus::Pending, can_answer: false, tool_id: None, questions: crate::relay::questions_of(Some(&args)), hold_until: None, outcome: None
                });
                out.push(e);
            }
            // A question that was waited for is answered by its own output.
            ("response_item", "function_call_output") if state.questions.iter().any(|(id, waited)| *waited && text(&payload, "call_id").as_ref() == Some(id)) => {
                let request_id = text(&payload, "call_id").unwrap_or_default();
                state.questions.retain(|(id, _)| id != &request_id);
                out.push(question_closed(base(EventKind::RequestClosed, None, None), &key, request_id, format!("{event_id}:answered")));
            }
            // The user's reply to one asked without waiting arrives as their message, naming it.
            ("response_item", "message") if !state.questions.is_empty() && payload.get("role").and_then(Value::as_str) == Some("user") => {
                let said: String = payload.get("content").and_then(Value::as_array).into_iter().flatten().filter_map(|c| c.get("text").and_then(Value::as_str)).collect();
                if said.contains("question_reply") {
                    let (answered, open): (Vec<_>, Vec<_>) = state.questions.drain(..).partition(|(id, _)| said.contains(id.as_str()));
                    state.questions = open;
                    for (i, (request_id, _)) in answered.into_iter().enumerate() { out.push(question_closed(base(EventKind::RequestClosed, None, None), &key, request_id, format!("{event_id}:reply{i}"))); }
                }
            }
            ("event_msg", "token_count") => {
                if let Some(rl) = payload.get("rate_limits").filter(|r| r.is_object()) {
                    let window = |w: Option<&Value>| w.filter(|w| w.is_object()).and_then(|w| Some(LimitWindow {
                        window_minutes: w.get("window_minutes")?.as_u64()?, used_percent: w.get("used_percent")?.as_f64()?,
                        resets_at: w.get("resets_at").and_then(Value::as_u64).map(|s| s * 1000), model: None,
                    }));
                    let windows: Vec<LimitWindow> = [window(rl.get("primary")), window(rl.get("secondary"))].into_iter().flatten().collect();
                    if !windows.is_empty() { limits = Some(ProviderLimits { provider: "codex".into(), plan: text(rl, "plan_type"), windows, updated_at: at, source: "Codex oturum kaydı".into(), note: None, credits: credits_of(rl), resets_available: None }); }
                }
            }
            _ => {}
        }
        // Work continuing after an approval prompt means it was answered in Codex.
        if !matches!(out.first().map(|e| &e.kind), Some(EventKind::RequestOpened)) && kind != "token_count" && v.get("type").and_then(Value::as_str) == Some("event_msg") {
            if let Some(request_id) = state.open_request.take() {
                let mut e = base(EventKind::RequestClosed, None, None); e.event_id = format!("{event_id}:close");
                e.request = Some(PendingRequest { key: RequestKey { session_key: key.clone(), request_id }, version: 1, turn_id: None, kind: "permission".into(), title: String::new(), detail: String::new(), options: vec![], expires_at: 0, status: RequestStatus::Resolved, can_answer: false, tool_id: None, questions: vec![], hold_until: None, outcome: None});
                out.insert(0, e);
            }
        }
        if state.hidden { out.clear(); }
        (out, limits)
    }

    /// The rollout was written at `at` (just now): the thread is live, as its record says. Codex
    /// writes no event while a turn goes on, so without this a turn first read from the file's
    /// tail (a new thread, or AgentOffice started mid-turn) stayed unverified until it ended.
    pub fn live(&self, file: &Path, at: u64, event_id: String) -> Option<NormalizedEvent> {
        let state = self.files.get(file).filter(|s| !s.hidden)?;
        Some(NormalizedEvent { key: state.key.clone()?, event_id, kind: EventKind::Active, at, name: state.name.clone(), project: state.project.clone(),
            parent_key: state.parent.clone(), agent_type: state.agent.clone(), ..Default::default() })
    }

    /// Thread names as the Codex app shows them; the next event of each thread carries its new name.
    pub fn set_titles(&mut self, titles: HashMap<String, String>) {
        self.titles = titles;
        for state in self.files.values_mut() { state.name = name_of(&self.titles, state); }
    }
}

/// The event that ends a question to the user.
fn question_closed(mut e: NormalizedEvent, key: &SessionKey, request_id: String, event_id: String) -> NormalizedEvent {
    e.event_id = event_id;
    e.request = Some(PendingRequest { key: RequestKey { session_key: key.clone(), request_id }, version: 1, turn_id: None, kind: "question".into(), title: String::new(), detail: String::new(), options: vec![], expires_at: 0, status: RequestStatus::Resolved, can_answer: false, tool_id: None, questions: vec![], hold_until: None, outcome: None});
    e
}

/// The thread's name in the Codex app, else its folder.
fn name_of(titles: &HashMap<String, String>, state: &Rollout) -> Option<String> {
    state.key.as_ref().and_then(|k| titles.get(&k.session_id)).cloned()
        .or_else(|| state.project.as_deref().map(|c| c.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(c).to_owned()))
}

/// `session_index.jsonl`: one line per naming, the last one wins. Codex's own
/// reviewer threads ("Guardian review") are not the user's.
fn read_titles(index: &Path) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in std::fs::read_to_string(index).unwrap_or_default().lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if let (Some(id), Some(name)) = (text(&v, "id"), text(&v, "thread_name")) { if name != "Guardian review" { out.insert(id, name); } }
    }
    out
}

/// `credits: {has_credits, unlimited, balance}` (balance is a decimal string).
fn credits_of(rl: &Value) -> Option<crate::domain::Credits> {
    let c = rl.get("credits").filter(|c| c.is_object())?;
    let balance = c.get("balance").and_then(|b| b.as_f64().or_else(|| b.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0.0);
    Some(crate::domain::Credits { unlimited: c.get("unlimited").and_then(Value::as_bool).unwrap_or(false), balance })
}

/// Day folders newest first, at most `days` of them.
fn recent_day_dirs(root: &Path, days: usize) -> Vec<PathBuf> {
    let sorted = |dir: &Path| { let mut v: Vec<PathBuf> = std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect(); v.sort(); v.reverse(); v };
    let mut out = Vec::new();
    for year in sorted(root) { for month in sorted(&year) { for day in sorted(&month) { out.push(day); if out.len() == days { return out; } } } }
    out
}

const TAIL_ON_FIRST_SIGHT: u64 = 256 * 1024;

/// The newest limit reading in the rollouts of the last `days` days. Limits
/// stay valid until their windows reset, so this also looks at rollouts older
/// than the session tracking window (only their tail is read).
fn newest_limits(root: &Path, days: usize, host: &str) -> Option<ProviderLimits> {
    let mut files: Vec<(u64, PathBuf)> = recent_day_dirs(root, days).iter()
        .flat_map(|day| std::fs::read_dir(day).into_iter().flatten().flatten())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .filter_map(|e| { let m = e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64; Some((m, e.path())) })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files {
        let Ok(mut file) = std::fs::File::open(&path) else { continue };
        let len = file.metadata().map(|m| m.len()).unwrap_or(0);
        let mut head = String::new();
        let _ = (&mut file).take(64 * 1024).read_to_string(&mut head);
        let Some(first) = head.lines().next() else { continue };
        if file.seek(SeekFrom::Start(len.saturating_sub(512 * 1024))).is_err() { continue; }
        let mut tail = Vec::new();
        let _ = (&mut file).take(512 * 1024).read_to_end(&mut tail);
        let tail = String::from_utf8_lossy(&tail);
        let Some(line) = tail.lines().rev().find(|l| l.contains("\"rate_limits\"")) else { continue };
        let mut mapper = CodexMapper::default();
        mapper.map_line(&path, first, "seed:0".into(), true, host);
        if let (_, Some(limits)) = mapper.map_line(&path, line, "seed:1".into(), true, host) { return Some(limits); }
    }
    None
}
/// One of the user's threads as the Codex app lists it, with the project it is filed under.
#[derive(Debug, Clone, PartialEq)]
pub struct AppThread { pub id: String, pub name: String, pub cwd: String, pub project: Option<(String, String)>, pub archived: bool, pub updated_at: u64 }

/// The project a folder belongs to: the one whose folder is the nearest above it
/// (`roots`: folder, project name). Codex writes folders as `\\?\C:\…`.
pub fn project_of(cwd: &str, roots: &[(String, String)]) -> Option<(String, String)> {
    let norm = |p: &str| p.trim_start_matches(r"\\?\").trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase();
    let here = norm(cwd);
    roots.iter().filter(|(root, _)| { let r = norm(root); here == r || here.starts_with(&format!("{r}\\")) })
        .max_by_key(|(root, _)| norm(root).len()).cloned()
}

/// The Codex app's own list (`~/.codex/state_N.sqlite`, opened read only): its
/// projects and the user's threads (not its helpers or reviewers). None when it
/// cannot be read.
pub fn app_threads() -> Option<Vec<AppThread>> {
    let home = crate::setup::codex_dir()?;
    let db = std::fs::read_dir(&home).ok()?.flatten().map(|e| e.path())
        .filter_map(|p| { let n = p.file_name()?.to_str()?.strip_prefix("state_")?.strip_suffix(".sqlite")?.parse::<u32>().ok()?; Some((n, p)) })
        .max_by_key(|(n, _)| *n)?.1;
    let conn = rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX).ok()?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(1));
    let roots: Vec<(String, String)> = conn.prepare("SELECT r.path, p.name FROM project_roots r JOIN projects p ON p.id = r.project_id ORDER BY p.position, r.position").ok()?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).ok()?.flatten().collect();
    let mut stmt = conn.prepare("SELECT id, name, title, cwd, archived, COALESCE(recency_at_ms, updated_at_ms, updated_at * 1000) FROM threads WHERE source NOT LIKE '{%'").ok()?;
    let threads = stmt.query_map([], |r| {
        let (name, title): (Option<String>, String) = (r.get(1)?, r.get(2)?);
        let name = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| title.lines().next().unwrap_or_default().chars().take(60).collect());
        let cwd: String = r.get(3)?;
        Ok(AppThread { id: r.get(0)?, name, project: project_of(&cwd, &roots), cwd, archived: r.get::<_, i64>(4)? != 0, updated_at: r.get::<_, Option<i64>>(5)?.unwrap_or(0).max(0) as u64 })
    }).ok()?.flatten().collect();
    Some(threads)
}

/// A thread that has spoken within the office's window is in the office, whichever day it began.
const TRACK_WINDOW_MS: u64 = crate::domain::OFFICE_DAYS * 24 * 60 * 60 * 1000;

/// Rollouts worth reading: those in the newest day folders, those already
/// followed and, on a `full` pass, any modified within the window (a thread
/// begun days ago and resumed writes into its old day folder). Oldest first, so
/// a thread spread over several files ends on its newest.
fn candidates(root: &Path, known: &HashMap<PathBuf, u64>, full: bool, now: u64) -> Vec<(u64, u64, PathBuf)> {
    let mut paths: Vec<PathBuf> = recent_day_dirs(root, if full { usize::MAX } else { 3 }).iter()
        .flat_map(|day| std::fs::read_dir(day).into_iter().flatten().flatten().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl")).collect();
    paths.extend(known.keys().cloned());
    paths.sort(); paths.dedup();
    let mut out: Vec<(u64, u64, PathBuf)> = paths.into_iter().filter_map(|path| {
        let meta = std::fs::metadata(&path).ok()?;
        let modified = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
        (known.contains_key(&path) || now.saturating_sub(modified) <= TRACK_WINDOW_MS).then_some((modified, meta.len(), path))
    }).collect();
    out.sort();
    out
}

const READ_LIMIT: u64 = 8 * 1024 * 1024;
const STALE_MS: u64 = 2 * 60 * 1000;

/// One read of a rollout from `from`: its complete lines (with their offsets),
/// where the next read starts, and whether that is inside a line. A line longer
/// than a whole read (Codex's compacted history, a tool's large output; tens of
/// MB) holds nothing the office uses: it is stepped over rather than waited for,
/// which used to stop a thread's file being read at all. `inside`: the read
/// starts in the middle of a line, whose rest is skipped.
fn read_lines(file: &mut std::fs::File, from: u64, inside: bool, limit: u64) -> Option<(Vec<(u64, String)>, u64, bool)> {
    file.seek(SeekFrom::Start(from)).ok()?;
    let mut chunk = Vec::new();
    file.take(limit).read_to_end(&mut chunk).ok()?;
    let Some(last) = chunk.iter().rposition(|&b| b == b'\n') else {
        // No line ends here: a full read is the middle of an over-long line; a short
        // one is a line still being written, read again next time.
        return Some(if chunk.len() as u64 == limit { (vec![], from + limit, true) } else { (vec![], from, inside) });
    };
    let (mut lines, mut offset, mut skip) = (Vec::new(), from, inside);
    for line in chunk[..=last].split_inclusive(|&b| b == b'\n') {
        let text = String::from_utf8_lossy(line);
        if !skip && !text.trim().is_empty() { lines.push((offset, text.trim_end().to_owned())); }
        skip = false; offset += line.len() as u64;
    }
    Some((lines, from + last as u64 + 1, false))
}

/// The lines that open or end a turn.
const TURN_MARKS: [&str; 3] = ["\"type\":\"task_started\"", "\"type\":\"task_complete\"", "\"type\":\"turn_aborted\""];
fn is_turn_line(line: &str) -> bool { TURN_MARKS.iter().any(|m| line.contains(m)) }

/// The last line before `before` that opens or ends a turn, searched backwards (at most
/// `limit` bytes): a turn whose output since its start is longer than the tail read on first
/// sight is still known to be open.
fn last_turn_line(file: &mut std::fs::File, before: u64, limit: u64) -> Option<String> {
    const CHUNK: u64 = 1024 * 1024; const OVERLAP: u64 = 16 * 1024;
    let stop = before.saturating_sub(limit);
    let mut end = before;
    while end > stop {
        let start = end.saturating_sub(CHUNK).max(stop);
        file.seek(SeekFrom::Start(start)).ok()?;
        let mut chunk = Vec::new();
        (&mut *file).take(end - start).read_to_end(&mut chunk).ok()?;
        let text = String::from_utf8_lossy(&chunk);
        // Whole lines only: the first piece may end a line begun earlier, the last one is cut.
        let mut lines: Vec<&str> = text.split('\n').collect();
        lines.pop();
        if start > 0 && !lines.is_empty() { lines.remove(0); }
        if let Some(line) = lines.iter().rev().find(|l| is_turn_line(l)) { return Some(line.trim_end().to_owned()); }
        if start == stop { break; }
        // The next read ends a little inside this one, so a line cut at `start` is read whole.
        end = start + OVERLAP;
    }
    None
}

/// How often a rollout being written says again that its thread is live.
const MARK_MS: u64 = 30 * 1000;

/// One read of a rollout from `from`: the events of its new lines and where the next read
/// starts. `first_sight`: identity from its first line, state from its recent tail (all of it
/// read again, not announced). A rollout written in the last couple of minutes is live
/// evidence for its thread (`marked`: when that was last said, at most every 30 s).
#[allow(clippy::too_many_arguments)]
fn read_rollout(mapper: &mut CodexMapper, path: &Path, file: &mut std::fs::File, len: u64, mut from: u64, mut inside: bool, first_sight: bool,
    modified: u64, now: u64, marked: &mut HashMap<PathBuf, u64>, host: &str) -> Option<(Vec<NormalizedEvent>, Option<ProviderLimits>, u64, bool)> {
    let mut events = Vec::new(); let mut limits = None;
    let mut feed = |mapper: &mut CodexMapper, line: &str, offset: String, replay: bool, events: &mut Vec<NormalizedEvent>| {
        // A line this reader cannot take (a newer Codex's, damaged) is passed over; it never stops the reading.
        let Ok((mut e, l)) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| mapper.map_line(path, line, format!("{}:{offset}", path.display()), replay, host))) else { return };
        for x in &mut e { if now.saturating_sub(x.at) > STALE_MS { x.replay = true; } }
        events.append(&mut e); if l.is_some() { limits = l; }
    };
    if first_sight {
        // Identity is on the first line; state comes from the recent tail.
        let mut head = String::new();
        let _ = (&mut *file).take(4 * 1024 * 1024).read_to_string(&mut head);
        if let Some(first) = head.lines().next() { feed(mapper, first, "0".into(), true, &mut events); }
        let after_first = head.find('\n').map_or(len, |i| i as u64 + 1);
        let tail = len.saturating_sub(TAIL_ON_FIRST_SIGHT);
        inside = tail > after_first;
        from = tail.max(after_first).min(len);
    }
    let (lines, next, still_inside) = read_lines(file, from, inside, READ_LIMIT)?;
    if first_sight && from > 0 && !lines.iter().any(|(_, l)| is_turn_line(l)) {
        if let Some(line) = last_turn_line(file, from, 64 * 1024 * 1024) { feed(mapper, &line, format!("{from}:turn"), true, &mut events); }
    }
    let read = !lines.is_empty();
    for (offset, line) in lines { feed(mapper, &line, offset.to_string(), first_sight, &mut events); }
    if read && now.saturating_sub(modified) <= STALE_MS && now.saturating_sub(*marked.get(path).unwrap_or(&0)) >= MARK_MS {
        if let Some(e) = mapper.live(path, modified.min(now), format!("{}:{next}:live", path.display())) { events.push(e); marked.insert(path.to_path_buf(), now); }
    }
    Some((events, limits, next, still_inside))
}

/// Polls recent rollouts every 1.5 s and feeds new lines to `deliver`.
pub fn watch(deliver: impl Fn(Vec<NormalizedEvent>, Option<ProviderLimits>) + Send + 'static) {
    let Some(root) = crate::setup::codex_dir().map(|d| d.join("sessions")) else { return };
    std::thread::spawn(move || {
        let host = crate::relay::host_id();
        let mut mapper = CodexMapper::default();
        let mut offsets: HashMap<PathBuf, u64> = HashMap::new();
        if let Some(limits) = newest_limits(&root, 8, &host) { deliver(vec![], Some(limits)); }
        let index = root.with_file_name("session_index.jsonl");
        let mut index_stamp = None;
        // Files whose reading stands inside a line longer than a whole read.
        let mut long: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
        let mut marked: HashMap<PathBuf, u64> = HashMap::new();
        for pass in 0u64.. {
            let now = crate::relay::now();
            let stamp = std::fs::metadata(&index).ok().map(|m| (m.len(), m.modified().ok()));
            if stamp != index_stamp { index_stamp = stamp; mapper.set_titles(read_titles(&index)); }
            for (modified, len, path) in candidates(&root, &offsets, pass % 20 == 0, now) {
                let first_sight = !offsets.contains_key(&path);
                let mut from = *offsets.get(&path).unwrap_or(&0);
                if len < from { from = 0; }
                if len == from { continue; }
                let Ok(mut file) = std::fs::File::open(&path) else { continue };
                let inside = long.remove(&path);
                let Some((events, limits, next, still_inside)) = read_rollout(&mut mapper, &path, &mut file, len, from, inside, first_sight, modified, now, &mut marked, &host) else { continue };
                offsets.insert(path.clone(), next);
                if still_inside { long.insert(path.clone()); }
                if !events.is_empty() || limits.is_some() { deliver(events, limits); }
            }
            std::thread::sleep(std::time::Duration::from_millis(1500));
        }
    });
}

#[cfg(test)]
mod question_tests {
    use super::*;
    use crate::domain::{SessionStatus, Store};
    fn lines() -> Vec<serde_json::Value> { vec![
        serde_json::json!({"timestamp": "2026-10-25T16:50:00Z", "type": "session_meta", "payload": {"id": "T1", "cwd": "C:/w"}}),
        serde_json::json!({"timestamp": "2026-10-25T16:50:01Z", "type": "event_msg", "payload": {"type": "task_started", "turn_id": "u1"}}),
        serde_json::json!({"timestamp": "2026-10-25T16:52:28Z", "type": "response_item", "payload": {"type": "function_call", "name": "request_user_input_async", "call_id": "call_dc5d", "arguments": "{\"questions\":[{\"title\":\"İlk müşterileri hangi pazarda arayalım?\",\"options\":[\"Yurt dışı\",\"Türkiye\",\"İkisi de\"]}]}"}}),
        serde_json::json!({"timestamp": "2026-10-25T16:52:29Z", "type": "response_item", "payload": {"type": "function_call_output", "call_id": "call_dc5d", "output": "{\"accepted\":true}"}}),
        serde_json::json!({"timestamp": "2026-10-25T16:52:30Z", "type": "event_msg", "payload": {"type": "item_completed", "turn_id": "u1"}}),
        serde_json::json!({"timestamp": "2026-10-25T16:55:46Z", "type": "event_msg", "payload": {"type": "task_complete", "turn_id": "u1", "last_agent_message": "Araştırdım."}}),
    ] }
    fn reply() -> serde_json::Value {
        serde_json::json!({"timestamp": "2026-10-25T17:07:55Z", "type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "<send_user_message_question_reply>\n[{\"questionItemId\":\"[\\\"request_user_input_async\\\",\\\"call_dc5d\\\",0]\"}]"}]}})
    }
    fn read(m: &mut CodexMapper, from: usize, values: &[serde_json::Value], replay: bool) -> Vec<NormalizedEvent> {
        values.iter().enumerate().flat_map(|(i, v)| m.map_line(Path::new("C:/x/rollout-q.jsonl"), &v.to_string(), format!("q:{}", from + i), replay, "pc").0).collect()
    }
    fn waiting(store: &mut Store) -> bool {
        store.snapshot_at(parse_time("2026-10-25T17:00:00Z").unwrap()).requests.iter().any(|r| r.key.request_id == "call_dc5d" && r.status == RequestStatus::Pending)
    }
    #[test] fn a_codex_question_waits_past_the_end_of_its_turn_until_the_reply() {
        let mut m = CodexMapper::default();
        let events = read(&mut m, 0, &lines(), false);
        let asked: Vec<_> = events.iter().filter(|e| e.kind == EventKind::RequestOpened).collect();
        let r = asked[0].request.clone().unwrap();
        assert_eq!((asked.len(), r.kind.as_str(), r.title.as_str(), r.detail.as_str(), r.turn_id.clone()), (1, "question", "İlk müşterileri hangi pazarda arayalım?", "Yurt dışı · Türkiye · İkisi de", None));
        // Its own "accepted" output, the work after it and the end of the turn close nothing.
        assert!(events.iter().all(|e| e.kind != EventKind::RequestClosed));
        let mut store = Store::new();
        for e in events { store.ingest(e); }
        assert!(waiting(&mut store), "still waiting after the turn ended");
        assert_eq!(store.snapshot_at(parse_time("2026-10-25T17:00:00Z").unwrap()).sessions[0].status, SessionStatus::Waiting);
        assert!(store.drain_notifications().iter().any(|n| n.kind == "question"), "a live question is a notification");
        // The user's reply names the question: it is over.
        let closed = read(&mut m, 9, &[reply()], false);
        assert_eq!(closed.len(), 1);
        for e in closed { store.ingest(e); }
        assert!(!waiting(&mut store));
    }
    #[test] fn an_unanswered_codex_question_is_waiting_again_after_a_restart_and_silent() {
        let mut m = CodexMapper::default();
        let mut store = Store::new();
        for e in read(&mut m, 0, &lines(), false) { store.ingest(e); }
        store.drain_notifications();
        // Shutdown and start: the saved office calls the request off, the chat's record is read again.
        let mut again = Store::restore(store.live_snapshot());
        assert!(!waiting(&mut again));
        let mut fresh = CodexMapper::default();
        for e in read(&mut fresh, 0, &lines(), true) { again.ingest(e); }
        assert!(waiting(&mut again));
        assert!(again.drain_notifications().is_empty(), "read again, not asked again");
        // Answered while the app was closed: the reply read after it closes it again.
        let mut later = Store::restore(store.live_snapshot());
        let mut fresh = CodexMapper::default();
        let mut all = lines(); all.push(reply());
        for e in read(&mut fresh, 0, &all, true) { later.ingest(e); }
        assert!(!waiting(&mut later));
    }
    #[test] fn a_question_the_user_passed_over_ends_when_they_write_to_the_chat_again() {
        let mut m = CodexMapper::default();
        let mut store = Store::new();
        for e in read(&mut m, 0, &lines(), false) { store.ingest(e); }
        // The reply to the question starts a turn of its own: that does not pass it over.
        let own = read(&mut m, 6, &[serde_json::json!({"timestamp": "2026-10-25T16:58:00Z", "type": "event_msg", "payload": {"type": "task_started", "turn_attribution": {"turn_id": "u2", "turn_trigger": "send_user_message_async_question"}}})], false);
        assert!(own.iter().all(|e| e.kind != EventKind::RequestClosed));
        let next = read(&mut m, 7, &[serde_json::json!({"timestamp": "2026-10-25T16:59:00Z", "type": "event_msg", "payload": {"type": "task_started", "turn_attribution": {"turn_id": "u3", "turn_trigger": "composer"}}})], false);
        assert_eq!(next.iter().map(|e| e.kind.clone()).collect::<Vec<_>>(), vec![EventKind::RequestClosed, EventKind::TurnStarted]);
        for e in next { store.ingest(e); }
        assert!(!waiting(&mut store));
    }
    #[test] fn a_question_that_was_waited_for_ends_with_its_answer() {
        let mut m = CodexMapper::default();
        let mut values = lines();
        values[2]["payload"]["name"] = "request_user_input".into();
        values.truncate(3);
        let mut store = Store::new();
        for e in read(&mut m, 0, &values, false) { store.ingest(e); }
        assert!(waiting(&mut store));
        let answer = read(&mut m, 3, &[serde_json::json!({"timestamp": "2026-10-25T16:53:00Z", "type": "response_item", "payload": {"type": "function_call_output", "call_id": "call_dc5d", "output": "{\"answers\":{}}"}})], false);
        assert_eq!(answer.len(), 1);
        for e in answer { store.ingest(e); }
        assert!(!waiting(&mut store));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn parses_rollout_timestamps() {
        assert_eq!(parse_time("1970-01-01T00:00:01.5Z"), Some(1500));
        assert_eq!(parse_time("2026-10-21T19:54:51.237Z"), Some(1_792_612_491_237));
        assert_eq!(parse_time("garbage"), None);
    }
    #[test] fn maps_turns_limits_and_keeps_files_apart() {
        let mut m = CodexMapper::default();
        let (a, b) = (Path::new("a.jsonl"), Path::new("b.jsonl"));
        let meta = |id: &str, cwd: &str| format!(r#"{{"timestamp":"2026-10-21T19:54:51.000Z","type":"session_meta","payload":{{"id":"{id}","cwd":"{cwd}"}}}}"#);
        m.map_line(a, &meta("S1", r"C:\\work\\one"), "a0".into(), false, "pc");
        m.map_line(b, &meta("S2", r"C:\\work\\two"), "b0".into(), false, "pc");
        let (start, _) = m.map_line(a, r#"{"timestamp":"2026-10-21T19:55:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_attribution":{"turn_id":"T1"}}}"#, "a1".into(), false, "pc");
        assert_eq!(start[0].kind, EventKind::TurnStarted);
        assert_eq!(start[0].key.session_id, "S1");
        assert_eq!(start[0].name.as_deref(), Some("one"));
        let (done, _) = m.map_line(b, r#"{"timestamp":"2026-10-21T19:56:00.000Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"T9"}}"#, "b1".into(), false, "pc");
        assert_eq!((done[0].kind.clone(), done[0].key.session_id.as_str()), (EventKind::TurnEnded, "S2"));
        let (_, limits) = m.map_line(a, r#"{"timestamp":"2026-10-21T19:57:00.000Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":28.0,"window_minutes":300,"resets_at":1792635880},"secondary":{"used_percent":4.0,"window_minutes":10080,"resets_at":1793222680}}}}"#, "a2".into(), false, "pc");
        let limits = limits.unwrap();
        assert_eq!(limits.windows.len(), 2);
        assert_eq!(limits.windows[0].window_minutes, 300);
        assert_eq!(limits.windows[0].resets_at, Some(1_792_635_880_000));
    }
    #[test] fn threads_are_named_as_in_codex_helpers_join_their_thread_and_reviews_stay_out() {
        let mut m = CodexMapper::default();
        m.set_titles(HashMap::from([("T1".to_string(), "Sekmeyi incele".to_string())]));
        let mut meta = |file: &str, id: &str, source: &str| m.map_line(Path::new(file), &format!(r#"{{"timestamp":"2026-10-21T19:54:51.000Z","type":"session_meta","payload":{{"id":"{id}","cwd":"C:\\puzzle","source":{source}}}}}"#), format!("{file}0"), false, "pc").0;
        let main = meta("a", "T1", r#""vscode""#);
        assert_eq!(main[0].name.as_deref(), Some("Sekmeyi incele"));
        assert!(main[0].parent_key.is_none());
        let helper = meta("b", "H1", r#"{"subagent":{"thread_spawn":{"parent_thread_id":"T1"}}}"#);
        assert_eq!(helper[0].parent_key.as_ref().map(|k| k.session_id.as_str()), Some("T1"));
        assert!(meta("c", "G1", r#"{"subagent":{"other":"guardian"}}"#).is_empty());
        let (review, limits) = m.map_line(Path::new("c"), r#"{"timestamp":"2026-10-21T19:57:00.000Z","type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":28.0,"window_minutes":300}}}}"#, "c1".into(), false, "pc");
        assert!(review.is_empty() && limits.is_some(), "a review's limit reading still counts");
        m.set_titles(HashMap::from([("T1".to_string(), "Yeni ad".to_string())]));
        let (next, _) = m.map_line(Path::new("a"), r#"{"timestamp":"2026-10-21T19:58:00.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"U1"}}"#, "a1".into(), false, "pc");
        assert_eq!(next[0].name.as_deref(), Some("Yeni ad"));
    }
    #[test] fn a_thread_belongs_to_the_nearest_project_above_its_folder() {
        let roots = vec![(r"C:\Users\demo\Desktop\work".to_string(), "work".to_string()), (r"C:\Users\demo\Desktop\work\Site\public_html".to_string(), "public_html".to_string()), (r"C:\Users\demo\Desktop\puzzle".to_string(), "puzzle".to_string())];
        let name = |cwd: &str| project_of(cwd, &roots).map(|(_, n)| n);
        assert_eq!(name(r"\\?\C:\Users\demo\Desktop\puzzle").as_deref(), Some("puzzle"));
        assert_eq!(name(r"\\?\C:\Users\demo\Desktop\work\Site\public_html\catalog").as_deref(), Some("public_html"));
        assert_eq!(name(r"C:/Users/demo/Desktop/work/").as_deref(), Some("work"));
        assert_eq!(name(r"\\?\C:\Users\demo\Desktop\puzzleplay"), None, "a folder that only starts with the same letters is not inside");
        assert_eq!(name(r"\\?\C:\Users\demo\Desktop\AgentOffice"), None);
    }
    #[test] fn a_line_longer_than_a_read_is_stepped_over_not_waited_for() {
        let path = std::env::temp_dir().join(format!("agentoffice-codex-long-{}.jsonl", std::process::id()));
        let long = "x".repeat(50);
        std::fs::write(&path, format!("{{\"a\":1}}\n{long}\n{{\"b\":2}}\npartial")).unwrap();
        let mut file = std::fs::File::open(&path).unwrap();
        let (mut from, mut inside, mut seen) = (0u64, false, Vec::new());
        for _ in 0..10 { let (lines, next, still) = read_lines(&mut file, from, inside, 16).unwrap(); seen.extend(lines.into_iter().map(|(_, l)| l)); from = next; inside = still; }
        assert_eq!(seen, vec![r#"{"a":1}"#.to_string(), r#"{"b":2}"#.to_string()], "the long line is skipped, the next one read");
        assert_eq!(from, std::fs::metadata(&path).unwrap().len() - "partial".len() as u64, "a line still being written waits");
        let _ = std::fs::remove_file(&path);
    }
    /// A rollout on disk: its thread's first line, a turn that began, then `filler` bytes of the turn's steps.
    fn rollout(name: &str, filler: usize) -> PathBuf {
        let path = std::env::temp_dir().join(format!("agentoffice-codex-rollout-{name}-{}.jsonl", std::process::id()));
        let mut text = String::from("{\"timestamp\":\"2026-10-28T12:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"T1\",\"cwd\":\"C:\\\\puzzle\",\"source\":\"vscode\"}}\n");
        text.push_str("{\"timestamp\":\"2026-10-28T12:54:07.241Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"u1\"}}\n");
        let step = format!("{{\"timestamp\":\"2026-10-28T12:55:00.000Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"function_call_output\",\"call_id\":\"c\",\"output\":\"{}\"}}}}\n", "x".repeat(2000));
        while text.len() < filler { text.push_str(&step); }
        text.push_str("{\"timestamp\":\"2026-10-28T12:55:30.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":null}}\n");
        std::fs::write(&path, text).unwrap();
        path
    }
    /// The thread as the office shows it after AgentOffice (re)started and read this rollout once.
    fn first_read(path: &Path, modified: u64, now: u64) -> (crate::domain::SessionStatus, bool, Vec<EventKind>) {
        let mut mapper = CodexMapper::default();
        let mut file = std::fs::File::open(path).unwrap();
        let len = file.metadata().unwrap().len();
        let (events, ..) = read_rollout(&mut mapper, path, &mut file, len, 0, false, true, modified, now, &mut HashMap::new(), "pc").unwrap();
        let kinds = events.iter().map(|e| e.kind.clone()).collect();
        let mut store = crate::domain::Store::new();
        for e in events { store.ingest(e); }
        let s = store.snapshot_at(now).sessions.into_iter().find(|s| s.key.session_id == "T1").unwrap();
        (s.status, s.verified, kinds)
    }
    #[test] fn a_turn_first_read_mid_way_is_working_while_its_rollout_is_being_written() {
        // Seen live on 28.10: AgentOffice restarted during a Codex turn; the thread showed as
        // "unknown" until the turn ended, then as idle, never as working.
        let now = parse_time("2026-10-28T12:55:40.000Z").unwrap();
        let path = rollout("live", 10_000);
        let (status, verified, kinds) = first_read(&path, now - 5_000, now);
        assert_eq!((status, verified), (crate::domain::SessionStatus::Working, true), "{kinds:?}");
        // The same record, untouched for ten minutes: what it says is not live evidence.
        let (status, verified, _) = first_read(&path, now - 10 * 60_000, now);
        assert_eq!((status, verified), (crate::domain::SessionStatus::Working, false));
        let _ = std::fs::remove_file(&path);
    }
    #[test] fn after_a_restart_mid_turn_the_thread_works_and_says_what_it_does() {
        let now = parse_time("2026-10-28T12:55:40.000Z").unwrap();
        let path = rollout("restart", 10_000);
        let read = |modified: u64, now: u64, store: &mut crate::domain::Store| {
            let mut mapper = CodexMapper::default();
            let mut file = std::fs::File::open(&path).unwrap();
            let len = file.metadata().unwrap().len();
            for e in read_rollout(&mut mapper, &path, &mut file, len, 0, false, true, modified, now, &mut HashMap::new(), "pc").unwrap().0 { store.ingest(e); }
        };
        let mut before = crate::domain::Store::new();
        read(now - 30_000, now - 30_000, &mut before);
        // Shut down while it worked, started again: the saved office calls it unverified until it is seen.
        let mut store = crate::domain::Store::restore(before.live_snapshot());
        assert!(store.snapshot_at(now).sessions[0].summary.contains("doğrulanmadı"));
        read(now - 3_000, now, &mut store);
        let s = &store.snapshot_at(now).sessions[0];
        assert_eq!((s.status.clone(), s.verified, s.summary.as_str()), (crate::domain::SessionStatus::Working, true, "Görev çalışıyor"));
        let _ = std::fs::remove_file(&path);
    }
    #[test] fn a_turn_whose_start_is_further_back_than_the_tail_is_still_open() {
        let now = parse_time("2026-10-28T12:55:40.000Z").unwrap();
        let path = rollout("long", (TAIL_ON_FIRST_SIGHT as usize) * 5);
        let (status, verified, kinds) = first_read(&path, now - 5_000, now);
        assert_eq!((status, verified), (crate::domain::SessionStatus::Working, true), "{kinds:?}");
        let _ = std::fs::remove_file(&path);
    }
    #[test] fn a_live_rollout_says_so_at_most_every_half_minute() {
        let now = parse_time("2026-10-28T12:55:40.000Z").unwrap();
        let path = rollout("mark", 10_000);
        let mut mapper = CodexMapper::default();
        let mut marked = HashMap::new();
        let mut file = std::fs::File::open(&path).unwrap();
        let len = file.metadata().unwrap().len();
        let (events, _, next, _) = read_rollout(&mut mapper, &path, &mut file, len, 0, false, true, now, now, &mut marked, "pc").unwrap();
        assert_eq!(events.iter().filter(|e| e.kind == EventKind::Active && !e.replay).count(), 1);
        let mut line = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        std::io::Write::write_all(&mut line, b"{\"timestamp\":\"2026-10-28T12:55:45.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":null}}\n").unwrap();
        let len = std::fs::metadata(&path).unwrap().len();
        let (again, ..) = read_rollout(&mut mapper, &path, &mut file, len, next, false, false, now + 5_000, now + 5_000, &mut marked, "pc").unwrap();
        assert!(again.is_empty(), "nothing new to say 5 s later");
        let (later, ..) = read_rollout(&mut mapper, &path, &mut file, len, next, false, false, now + 31_000, now + 31_000, &mut marked, "pc").unwrap();
        assert_eq!(later.iter().map(|e| e.kind.clone()).collect::<Vec<_>>(), vec![EventKind::Active]);
        let _ = std::fs::remove_file(&path);
    }
    /// Real data, read only: AGENTOFFICE_ROLLOUT (a real rollout) cut just before the first line
    /// at or after AGENTOFFICE_ROLLOUT_AT (a moment inside a turn), read as on a (re)start then.
    #[test] #[ignore] fn real_rollout_read_mid_turn() {
        let (Some(src), Some(at)) = (std::env::var_os("AGENTOFFICE_ROLLOUT"), std::env::var("AGENTOFFICE_ROLLOUT_AT").ok().and_then(|t| parse_time(&t))) else { return };
        let text = std::fs::read_to_string(&src).unwrap();
        let cut = text.split_inclusive('\n').take_while(|l| serde_json::from_str::<Value>(l).ok().and_then(|v| v.get("timestamp").and_then(Value::as_str).and_then(parse_time)).is_none_or(|t| t < at)).map(str::len).sum::<usize>();
        let path = std::env::temp_dir().join(format!("agentoffice-codex-real-{}.jsonl", std::process::id()));
        std::fs::write(&path, &text[..cut]).unwrap();
        let mut file = std::fs::File::open(&path).unwrap();
        let len = file.metadata().unwrap().len();
        let mut store = crate::domain::Store::new();
        let mut mapper = CodexMapper::default();
        // As before this change: what the tail says, and nothing live until a turn's own event.
        let (events, ..) = read_rollout(&mut mapper, &path, &mut file, len, 0, false, true, at, at, &mut HashMap::from([(path.clone(), at)]), "pc").unwrap();
        for e in events { store.ingest(e); }
        let s = store.snapshot_at(at).sessions.into_iter().find(|s| s.parent_key.is_none()).unwrap();
        println!("önce: {} bayt, {:?}, doğrulandı={}, {}", len, s.status, s.verified, s.name);
        let mut store = crate::domain::Store::new();
        let mut mapper = CodexMapper::default();
        let mut file = std::fs::File::open(&path).unwrap();
        let (events, ..) = read_rollout(&mut mapper, &path, &mut file, len, 0, false, true, at, at, &mut HashMap::new(), "pc").unwrap();
        for e in events { store.ingest(e); }
        let s = store.snapshot_at(at).sessions.into_iter().find(|s| s.parent_key.is_none()).unwrap();
        println!("sonra: {:?}, doğrulandı={}", s.status, s.verified);
        let _ = std::fs::remove_file(&path);
    }
    #[test] fn reads_thread_names_last_one_wins() {
        let dir = std::env::temp_dir().join(format!("agentoffice-codex-index-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let index = dir.join("session_index.jsonl");
        std::fs::write(&index, "{\"id\":\"T1\",\"thread_name\":\"Eski\"}\n{\"id\":\"G1\",\"thread_name\":\"Guardian review\"}\nbozuk\n{\"id\":\"T1\",\"thread_name\":\"Yeni\"}\n").unwrap();
        let titles = read_titles(&index);
        assert_eq!(titles.get("T1").map(String::as_str), Some("Yeni"));
        assert!(!titles.contains_key("G1"));
        let _ = std::fs::remove_file(&index); let _ = std::fs::remove_dir(&dir);
    }
    #[test] fn approval_is_read_only_and_closes_on_progress() {
        let mut m = CodexMapper::default();
        let a = Path::new("a.jsonl");
        m.map_line(a, r#"{"timestamp":"2026-10-21T19:54:51.000Z","type":"session_meta","payload":{"id":"S1","cwd":"C:\\w"}}"#, "0".into(), false, "pc");
        let (open, _) = m.map_line(a, r#"{"timestamp":"2026-10-21T19:55:00.000Z","type":"event_msg","payload":{"type":"exec_approval_request","call_id":"c1"}}"#, "1".into(), false, "pc");
        assert!(!open[0].request.as_ref().unwrap().can_answer);
        let (next, _) = m.map_line(a, r#"{"timestamp":"2026-10-21T19:55:05.000Z","type":"event_msg","payload":{"type":"item_completed"}}"#, "2".into(), false, "pc");
        assert_eq!(next[0].kind, EventKind::RequestClosed);
    }
}
