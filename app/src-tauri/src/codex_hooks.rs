//! Codex's own hooks (see `setup::CODEX_HOOKS`), as the app's common events: a turn starts with the
//! user's prompt and ends at Stop or Interrupt; a permission request waits for the user until the
//! tool goes on, the turn ends or the chat closes. The helper prints nothing back, so Codex itself
//! keeps asking the user; nothing is approved here. A chat is keyed by the same id as its session
//! record (the rollout file's id when Codex names it), so hook events and records meet in one chat.
use crate::domain::{EventKind, NormalizedEvent, SessionKey};
use crate::relay::{now, permission_ask, request, text, tool_phrase};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
struct Track { seq: u64, open_request: Option<String> }

#[derive(Default)]
pub struct CodexHookMapper(Mutex<HashMap<String, Track>>);

/// The chat's id: the session record's own id at the end of its file name
/// (`rollout-<time>-<id>.jsonl`), else the hook's `session_id`.
fn chat_id(hook: &Value) -> Option<String> {
    let from_file = text(hook, "transcript_path").and_then(|p| {
        let name = p.rsplit(['\\', '/']).next()?.strip_suffix(".jsonl")?.to_owned();
        let id: String = name.rsplit('-').take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("-");
        (name.starts_with("rollout-") && id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')).then_some(id)
    });
    from_file.or_else(|| text(hook, "session_id"))
}

/// A Codex tool's input as Claude's permission wording knows it (its shell command as one line).
fn as_claude_tool(tool: &str, input: Option<&Value>) -> (String, Option<Value>) {
    let command = input.and_then(|i| i.get("command")).map(|c| match c { Value::Array(a) => a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "), v => v.as_str().unwrap_or_default().to_owned() });
    match tool {
        "shell" | "local_shell" | "exec_command" | "Bash" | "unified_exec" => ("Bash".into(), Some(serde_json::json!({ "command": command.unwrap_or_default(), "description": input.and_then(|i| text(i, "description")).unwrap_or_default() }))),
        "apply_patch" => ("Edit".into(), input.cloned()),
        t => (t.to_owned(), input.cloned()),
    }
}

impl CodexHookMapper {
    pub fn map(&self, hook: &Value, host: &str) -> Vec<NormalizedEvent> {
        let (Some(session), Some(name)) = (chat_id(hook), text(hook, "hook_event_name")) else { return vec![] };
        let at = hook.get("agentoffice_at").and_then(Value::as_u64).unwrap_or_else(now);
        let key = SessionKey { provider: "codex".into(), host_id: host.into(), session_id: session.clone() };
        let cwd = text(hook, "cwd");
        let folder = cwd.as_deref().map(|c| c.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(c).to_owned());
        let mut tracks = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let track = tracks.entry(session).or_default();
        track.seq += 1;
        let event_id = format!("hook:{name}:{}:{at}", track.seq);
        let turn = text(hook, "turn_id");
        let tool = text(hook, "tool_name");
        let base = |kind: EventKind, summary: Option<String>| NormalizedEvent {
            key: key.clone(), event_id: event_id.clone(), kind, at, turn_id: turn.clone(), tool_id: text(hook, "tool_use_id"),
            name: folder.clone(), project: cwd.clone(), summary, ..Default::default()
        };
        let mut out = Vec::new();
        // The tool going on, the turn ending or the chat closing: the permission was answered in Codex.
        if matches!(name.as_str(), "PostToolUse" | "Stop" | "Interrupt" | "UserPromptSubmit" | "SessionEnd") {
            if let Some(request_id) = track.open_request.take() {
                let mut closed = base(EventKind::RequestClosed, None);
                closed.event_id = format!("{event_id}:close");
                closed.request = Some(request(&key, request_id, None, String::new(), String::new(), at));
                out.push(closed);
            }
        }
        match name.as_str() {
            "SessionStart" => out.push(base(EventKind::SessionStarted, Some("Oturum açıldı".into()))),
            "UserPromptSubmit" => out.push(base(EventKind::TurnStarted, Some("İsteği işliyor".into()))),
            "PreToolUse" => {
                let (t, input) = as_claude_tool(tool.as_deref().unwrap_or_default(), hook.get("tool_input"));
                out.push(base(EventKind::ToolStarted, Some(tool_phrase(&t, input.as_ref()))));
            }
            "PermissionRequest" => {
                let request_id = format!("p{}-{at}", track.seq);
                track.open_request = Some(request_id.clone());
                let pending = as_claude_tool(tool.as_deref().unwrap_or_default(), hook.get("tool_input"));
                let (title, detail) = permission_ask("", Some(&pending));
                let mut e = base(EventKind::RequestOpened, Some("İzin bekliyor".into()));
                e.request = Some(request(&key, request_id, turn.clone(), title, detail, at));
                out.push(e);
            }
            "PostToolUse" => out.push(base(EventKind::ToolEnded, None)),
            "Stop" => out.push(base(EventKind::TurnEnded, Some("Yanıt verdi".into()))),
            "Interrupt" => out.push(base(EventKind::Interrupted, Some("Tur durduruldu".into()))),
            "SessionEnd" => out.push(base(EventKind::SessionEnded, Some("Oturum kapandı".into()))),
            _ => {}
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{RequestStatus, SessionStatus, Store};
    use serde_json::json;
    fn hook(name: &str, extra: Value) -> Value {
        let mut v = json!({"session_id": "s-1", "hook_event_name": name, "cwd": "C:\\work\\shop", "agentoffice_at": now(), "agentoffice_provider": "codex",
            "transcript_path": "C:\\Users\\u\\.codex\\sessions\\2026\\10\\29\\rollout-2026-10-29T10-00-00-019a1b2c-3d4e-5f60-7182-93a4b5c6d7e8.jsonl"});
        for (k, val) in extra.as_object().unwrap() { v[k] = val.clone(); }
        v
    }
    #[test] fn a_codex_turn_shows_working_waiting_and_replied() {
        let (m, mut store) = (CodexHookMapper::default(), Store::new());
        let status = |s: &mut Store| s.snapshot().sessions.iter().find(|x| x.key.session_id == "019a1b2c-3d4e-5f60-7182-93a4b5c6d7e8").map(|x| x.status.clone());
        for e in m.map(&hook("UserPromptSubmit", json!({"turn_id": "t-9", "prompt": "fix"})), "pc") { store.ingest(e); }
        assert_eq!(status(&mut store), Some(SessionStatus::Working), "keyed by the rollout's own id, so it meets the session record");
        for e in m.map(&hook("PermissionRequest", json!({"turn_id": "t-9", "tool_name": "shell", "tool_input": {"command": ["powershell", "-c", "npm test"], "description": null}})), "pc") { store.ingest(e); }
        let snap = store.snapshot();
        let r = snap.requests.iter().find(|r| r.status == RequestStatus::Pending).expect("a waiting permission");
        assert_eq!((r.title.as_str(), r.detail.as_str(), r.can_answer), ("Komut çalıştırmak için izin istiyor", "powershell -c npm test", false));
        assert_eq!(status(&mut store), Some(SessionStatus::Waiting));
        for e in m.map(&hook("PostToolUse", json!({"turn_id": "t-9", "tool_name": "shell"})), "pc") { store.ingest(e); }
        assert!(store.snapshot().requests.iter().all(|r| r.status != RequestStatus::Pending), "answered in Codex");
        for e in m.map(&hook("Stop", json!({"turn_id": "t-9"})), "pc") { store.ingest(e); }
        assert_eq!(status(&mut store), Some(SessionStatus::ReplyEnded));
    }
    #[test] fn without_a_rollout_name_the_hook_s_session_id_is_the_chat() {
        assert_eq!(chat_id(&json!({"session_id": "abc", "transcript_path": "C:\\x\\t.jsonl"})).as_deref(), Some("abc"));
        assert_eq!(chat_id(&json!({"session_id": "abc"})).as_deref(), Some("abc"));
    }
}
