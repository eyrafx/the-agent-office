//! What Claude keeps about its chats, read only:
//! - the Claude desktop app's per-chat files
//!   (`claude-code-sessions\*\*\local_*.json` under the app's data folder): the real chat
//!   title, whether it is archived, and the desktop id behind the
//!   `claude://claude.ai/epitaxy/local_…` link that opens that chat;
//! - Claude Code transcripts (`~/.claude/projects/*/<session>.jsonl`): the
//!   chat's custom or automatic title, the working folder, the last reply's
//!   first sentence and how the transcript ends (still working or answered).
//! Transcripts are read incrementally (only new bytes after the first read).

use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DesktopChat { pub link: String, pub title: Option<String>, pub archived: bool, pub root: Option<String>, pub last_at: u64 }

/// Where the desktop app keeps its chat files: `%APPDATA%\Claude`, or, for the
/// Store (MSIX) install, the package's private copy of it
/// (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`), which other
/// programs do not see under `%APPDATA%`.
fn desktop_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Claude")).into_iter().collect();
    if let Some(packages) = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Packages")) {
        roots.extend(std::fs::read_dir(packages).into_iter().flatten().flatten().map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("Claude_")))
            .map(|p| p.join("LocalCache").join("Roaming").join("Claude")));
    }
    // Since late October 2026 the app keeps its data in `%LOCALAPPDATA%\Claude-Data\claude_<package id>`;
    // chats begun since then are only there (without it they had no link: no "Claude'da aç").
    if let Some(data) = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Claude-Data")) {
        roots.extend(std::fs::read_dir(data).into_iter().flatten().flatten().map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.to_ascii_lowercase().starts_with("claude"))));
    }
    roots.into_iter().map(|r| r.join("claude-code-sessions")).filter(|r| r.is_dir()).collect()
}

/// The chats of the account the desktop app is signed in to (the one with the
/// latest activity; an earlier account's chats stay in its own folder and are
/// not in the app's list), keyed by their Claude Code session id.
pub fn desktop_chats() -> HashMap<String, DesktopChat> {
    let dirs = |p: &Path| std::fs::read_dir(p).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect::<Vec<_>>();
    desktop_roots().iter().flat_map(|root| dirs(root)).map(|account| account_chats(&account, &dirs))
        .max_by_key(|chats| chats.values().map(|c| c.last_at).max().unwrap_or(0)).unwrap_or_default()
}

fn account_chats(account: &Path, dirs: &dyn Fn(&Path) -> Vec<PathBuf>) -> HashMap<String, DesktopChat> {
    let mut out = HashMap::new();
    for space in dirs(account) {
        for file in std::fs::read_dir(&space).into_iter().flatten().flatten().map(|e| e.path()) {
            let name = file.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if !(name.starts_with("local_") && name.ends_with(".json")) { continue; }
            let Some(v) = std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) else { continue };
            let (Some(id), Some(cli)) = (v.get("sessionId").and_then(Value::as_str), v.get("cliSessionId").and_then(Value::as_str)) else { continue };
            let title = v.get("title").and_then(Value::as_str).map(str::trim).filter(|t| !t.is_empty()).map(|t| t.chars().take(80).collect());
            let root = v.get("originCwd").or_else(|| v.get("cwd")).and_then(Value::as_str).map(str::to_owned);
            let last_at = ["lastActivityAt", "lastFocusedAt", "createdAt"].iter().find_map(|k| v.get(*k).and_then(Value::as_u64)).unwrap_or(0);
            out.insert(cli.to_owned(), DesktopChat { link: format!("claude://claude.ai/epitaxy/{id}"), title, archived: v.get("isArchived").and_then(Value::as_bool).unwrap_or(false), root, last_at });
        }
    }
    out
}

/// How a transcript ends: still busy, or the last reply is finished.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Ending { #[default] Unknown, Busy, Answered }

/// A question to the user (AskUserQuestion) that the transcript shows still unanswered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ask { pub tool_id: String, pub title: String, pub detail: String, pub at: u64 }

#[derive(Debug, Clone, Default)]
pub struct Transcript { pub session_id: String, pub cwd: Option<String>, pub title: Option<String>, pub reply: Option<String>, pub last_at: u64, pub ending: Ending, pub asking: Option<Ask>, asked_in: Option<String>, offset: u64 }

/// First sentence of a reply, without file paths or code, at most 110 chars.
pub fn first_sentence(text: &str) -> Option<String> {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with("```") && !l.starts_with('|'))?;
    let line = line.trim_start_matches(['#', '*', '-', '>', ' ']).replace("**", "").replace('`', "");
    let cleaned: String = line.split_whitespace().map(|w| if (w.contains(":\\") || w.contains('/') || w.contains('\\')) && w.len() > 12 { "…" } else { w }).collect::<Vec<_>>().join(" ");
    let end = cleaned.char_indices().find(|&(i, c)| matches!(c, '.' | '!' | '?' | ':') && i > 12).map(|(i, c)| i + c.len_utf8()).unwrap_or(cleaned.len());
    let s: String = cleaned[..end].chars().take(110).collect();
    (s.chars().count() >= 4).then_some(s)
}

impl Transcript {
    fn feed(&mut self, line: &str) {
        if !(line.contains("\"type\"")) { return; }
        let Ok(v) = serde_json::from_str::<Value>(line) else { return };
        let kind = v.get("type").and_then(Value::as_str).unwrap_or_default();
        if let Some(at) = v.get("timestamp").and_then(Value::as_str).and_then(crate::codex::parse_time) { self.last_at = self.last_at.max(at); }
        if self.cwd.is_none() { self.cwd = v.get("cwd").and_then(Value::as_str).map(str::to_owned); }
        if self.session_id.is_empty() { if let Some(id) = v.get("sessionId").and_then(Value::as_str) { self.session_id = id.to_owned(); } }
        match kind {
            "custom-title" => if let Some(t) = v.get("customTitle").and_then(Value::as_str) { self.title = Some(t.chars().take(80).collect()); },
            // An automatic title only until the chat gets a custom one.
            "ai-title" => if self.title.is_none() { if let Some(t) = v.get("aiTitle").and_then(Value::as_str) { self.title = Some(t.chars().take(80).collect()); } },
            "assistant" if v.get("isSidechain").and_then(Value::as_bool) != Some(true) => {
                let message = v.get("message");
                let stop = message.and_then(|m| m.get("stop_reason")).and_then(Value::as_str);
                let texts: Vec<&str> = message.and_then(|m| m.get("content")).and_then(Value::as_array).into_iter().flatten()
                    .filter(|c| c.get("type").and_then(Value::as_str) == Some("text")).filter_map(|c| c.get("text").and_then(Value::as_str)).collect();
                if let Some(s) = texts.iter().rev().find_map(|t| first_sentence(t)) { self.reply = Some(s); }
                self.ending = if stop == Some("end_turn") { Ending::Answered } else { Ending::Busy };
                // A question waits only while it is the last thing the chat said: a later message
                // (one line per part of a message, all with its id) means it went on without the answer.
                let id = message.and_then(|m| m.get("id")).and_then(Value::as_str);
                if self.asking.is_some() && (id.is_none() || id != self.asked_in.as_deref()) { self.asking = None; }
                // A question to the user waits until a tool result answers it (as the hook reads it).
                let at = v.get("timestamp").and_then(Value::as_str).and_then(crate::codex::parse_time).unwrap_or(self.last_at);
                for c in message.and_then(|m| m.get("content")).and_then(Value::as_array).into_iter().flatten() {
                    if c.get("type").and_then(Value::as_str) != Some("tool_use") || c.get("name").and_then(Value::as_str) != Some("AskUserQuestion") { continue; }
                    let Some(id) = c.get("id").and_then(Value::as_str) else { continue };
                    let first = c.get("input").and_then(|i| i.get("questions")).and_then(Value::as_array).and_then(|q| q.first());
                    let title = first.and_then(|q| q.get("question")).and_then(Value::as_str).map(|t| t.chars().take(160).collect()).unwrap_or_else(|| "Bir soru soruyor".into());
                    let detail = first.and_then(|q| q.get("options")).and_then(Value::as_array).map(|o| o.iter().filter_map(|x| x.get("label").and_then(Value::as_str)).take(4).collect::<Vec<_>>().join(" · ")).unwrap_or_default();
                    self.asking = Some(Ask { tool_id: id.to_owned(), title, detail, at });
                    self.asked_in = message.and_then(|m| m.get("id")).and_then(Value::as_str).map(str::to_owned);
                }
            }
            "user" if v.get("isSidechain").and_then(Value::as_bool) != Some(true) => {
                self.ending = Ending::Busy;
                let content = v.get("message").and_then(|m| m.get("content"));
                let results: Vec<&str> = content.and_then(Value::as_array).into_iter().flatten()
                    .filter(|c| c.get("type").and_then(Value::as_str) == Some("tool_result")).filter_map(|c| c.get("tool_use_id").and_then(Value::as_str)).collect();
                // Answered (its tool result, an interruption included), or a new prompt: the question
                // was set aside. Another tool's result (asked alongside it) leaves it waiting.
                let answered = self.asking.as_ref().is_some_and(|a| results.contains(&a.tool_id.as_str()));
                if answered || (results.is_empty() && content.is_some()) { self.asking = None; }
            }
            _ => {}
        }
    }
}

/// Incremental transcript reader shared by the hook path and the startup scan.
#[derive(Default)]
pub struct Transcripts(HashMap<PathBuf, Transcript>);

impl Transcripts {
    pub fn read(&mut self, path: &Path) -> Option<&Transcript> {
        let mut file = std::fs::File::open(path).ok()?;
        let len = file.metadata().ok()?.len();
        let state = self.0.entry(path.to_path_buf()).or_default();
        if len < state.offset { *state = Transcript::default(); }
        let mut skip_partial = false;
        if state.offset == 0 && len > 8 * 1024 * 1024 { state.offset = len - 8 * 1024 * 1024; skip_partial = true; }
        if len > state.offset {
            file.seek(SeekFrom::Start(state.offset)).ok()?;
            let mut bytes = Vec::new();
            file.take(64 * 1024 * 1024).read_to_end(&mut bytes).ok()?;
            let complete = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
            // A line this reader cannot take is passed over; it never stops the reading of the rest.
            for (i, line) in String::from_utf8_lossy(&bytes[..complete]).lines().enumerate() { if !(skip_partial && i == 0) { let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| state.feed(line))); } }
            state.offset += complete as u64;
            if state.session_id.is_empty() { state.session_id = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_owned(); }
        }
        self.0.get(path)
    }
}

/// The project folder a transcript belongs to: Claude Code names the
/// transcript's folder after it (every character that is not a letter or a
/// digit becomes '-'), so it is the working folder or the nearest parent of it
/// whose name encodes to that folder name.
pub fn root_of(transcript: &Path, cwd: Option<&str>) -> Option<String> {
    let folder = transcript.parent()?.file_name()?.to_str()?;
    let encode = |p: &str| p.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect::<String>();
    let mut here = PathBuf::from(cwd?);
    loop {
        let text = here.to_string_lossy().trim_end_matches(['\\', '/']).to_string();
        if encode(&text) == folder { return Some(text); }
        if !here.pop() { return None; }
    }
}

/// The transcript of one chat, wherever its project folder is.
pub fn transcript_of(session_id: &str) -> Option<PathBuf> {
    let root = crate::setup::claude_dir()?.join("projects");
    std::fs::read_dir(root).into_iter().flatten().flatten().map(|e| e.path().join(format!("{session_id}.jsonl"))).find(|p| p.is_file())
}

/// Transcripts of main chats touched in the last `hours` hours.
pub fn recent_transcripts(hours: u64) -> Vec<PathBuf> {
    let Some(root) = crate::setup::claude_dir().map(|d| d.join("projects")) else { return vec![] };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(hours * 3600);
    std::fs::read_dir(root).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir())
        .flat_map(|dir| std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .filter(|p| p.metadata().and_then(|m| m.modified()).is_ok_and(|m| m >= cutoff))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn finds_the_project_folder_from_the_transcript_folder() {
        let t = Path::new(r"C:\Users\demo\.claude\projects\C--Users-demo-Desktop-puzzle\a.jsonl");
        assert_eq!(root_of(t, Some(r"C:\Users\demo\Desktop\puzzle\tools\fullscreen")).as_deref(), Some(r"C:\Users\demo\Desktop\puzzle"));
        assert_eq!(root_of(t, Some(r"C:\Users\demo\Desktop\puzzle")).as_deref(), Some(r"C:\Users\demo\Desktop\puzzle"));
        assert_eq!(root_of(t, Some(r"D:\other")), None);
    }
    #[test] fn reads_titles_replies_and_endings() {
        let mut t = Transcript::default();
        t.feed(r#"{"type":"ai-title","aiTitle":"Kupon hatasını çöz","sessionId":"s1"}"#);
        t.feed(r#"{"type":"user","cwd":"C:\\work\\shop","timestamp":"2026-10-22T10:00:00Z","message":{"role":"user","content":"selam"}}"#);
        assert_eq!(t.ending, Ending::Busy);
        t.feed(r#"{"type":"assistant","timestamp":"2026-10-22T10:01:00Z","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Kupon hatası düzeltildi, `C:\\work\\shop\\cart.ts` güncellendi. Testler geçti."}]}}"#);
        assert_eq!(t.ending, Ending::Answered);
        assert_eq!(t.reply.as_deref(), Some("Kupon hatası düzeltildi, … güncellendi."));
        assert_eq!(t.title.as_deref(), Some("Kupon hatasını çöz"));
        t.feed(r#"{"type":"custom-title","customTitle":"Bulmaca - Yönetici","sessionId":"s1"}"#);
        t.feed(r#"{"type":"ai-title","aiTitle":"Başka","sessionId":"s1"}"#);
        assert_eq!(t.title.as_deref(), Some("Bulmaca - Yönetici"));
        assert_eq!(t.cwd.as_deref(), Some("C:\\work\\shop"));
        t.feed(r#"{"type":"assistant","isSidechain":true,"message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Yardımcı bitti."}]}}"#);
        assert_eq!(t.reply.as_deref(), Some("Kupon hatası düzeltildi, … güncellendi."));
    }
    #[test] fn a_question_waits_until_its_tool_result() {
        let mut t = Transcript::default();
        t.feed(r#"{"type":"assistant","timestamp":"2026-10-26T11:51:06Z","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","id":"toolu_1","name":"AskUserQuestion","input":{"questions":[{"question":"Ham şekiller çıktı. Nasıl devam edelim?","options":[{"label":"Tek karakter, tek hareket"},{"label":"Önce yüz ve el"},{"label":"Burada dur"}]}]}}]}}"#);
        let a = t.asking.clone().unwrap();
        assert_eq!((a.tool_id.as_str(), a.title.as_str(), a.detail.as_str()), ("toolu_1", "Ham şekiller çıktı. Nasıl devam edelim?", "Tek karakter, tek hareket · Önce yüz ve el · Burada dur"));
        t.feed(r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"other","content":"x"}]}}"#);
        assert!(t.asking.is_some(), "another tool's result does not answer it");
        t.feed(r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"The user answered"}]}}"#);
        assert!(t.asking.is_none());
    }
    #[test] fn a_question_the_chat_went_on_from_is_not_waiting() {
        let ask = r#"{"type":"assistant","timestamp":"2026-10-30T15:28:54Z","message":{"id":"msg_a","stop_reason":"tool_use","content":[{"type":"tool_use","id":"toolu_q","name":"AskUserQuestion","input":{"questions":[{"question":"Nasıl devam edelim?","options":[{"label":"Q4'te kal"},{"label":"Q3'e geç"}]}]}}]}}"#;
        // Another part of the same message (a tool asked alongside) and that tool's result: still waiting.
        let mut t = Transcript::default();
        t.feed(ask);
        t.feed(r#"{"type":"assistant","message":{"id":"msg_a","stop_reason":"tool_use","content":[{"type":"tool_use","id":"toolu_b","name":"Bash","input":{}}]}}"#);
        t.feed(r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_b","content":"ok"}]}}"#);
        assert!(t.asking.is_some());
        // A later reply of the chat: it went on without the answer.
        t.feed(r#"{"type":"assistant","timestamp":"2026-10-30T15:30:36Z","message":{"id":"msg_b","stop_reason":"end_turn","content":[{"type":"text","text":"Q4 modelinde kalıyorum ve beklemeye devam ediyorum."}]}}"#);
        assert!(t.asking.is_none());
        // A new prompt (a background task's notice) sets it aside too.
        let mut t = Transcript::default();
        t.feed(ask);
        t.feed(r#"{"type":"user","message":{"role":"user","content":"<task-notification>parts: 58 / 822</task-notification>"}}"#);
        assert!(t.asking.is_none());
        // A helper's lines are not the chat's.
        let mut t = Transcript::default();
        t.feed(ask);
        t.feed(r#"{"type":"assistant","isSidechain":true,"message":{"id":"msg_h","stop_reason":"end_turn","content":[{"type":"text","text":"Yardımcı bitti."}]}}"#);
        assert!(t.asking.is_some());
    }
}
