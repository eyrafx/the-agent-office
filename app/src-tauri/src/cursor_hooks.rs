//! Cursor's own hooks (see `setup::CURSOR_HOOKS`), as the app's common events. Cursor tells when a
//! prompt is sent (working), what the agent runs (shell, MCP tools, file edits) and when the agent
//! loop stops (replied, stopped or failed). It has no event for "waiting for the user's approval",
//! so a Cursor chat is never shown as waiting: that would be a guess. Its chats live in an
//! undocumented database that is not read; a chat is known from its hook events only.
use crate::domain::{EventKind, FileChange, NormalizedEvent, SessionKey};
use crate::relay::{now, text, tool_phrase};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
pub struct CursorHookMapper(Mutex<HashMap<String, u64>>);

impl CursorHookMapper {
    pub fn map(&self, hook: &Value, host: &str) -> Vec<NormalizedEvent> {
        let (Some(session), Some(name)) = (text(hook, "conversation_id").or_else(|| text(hook, "session_id")), text(hook, "hook_event_name")) else { return vec![] };
        let at = hook.get("agentoffice_at").and_then(Value::as_u64).unwrap_or_else(now);
        let key = SessionKey { provider: "cursor".into(), host_id: host.into(), session_id: session.clone() };
        let root = hook.get("workspace_roots").and_then(Value::as_array).and_then(|r| r.first()).and_then(Value::as_str).map(str::to_owned).or_else(|| text(hook, "cwd"));
        let folder = root.as_deref().map(|c| c.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(c).to_owned());
        let seq = { let mut s = self.0.lock().unwrap_or_else(|e| e.into_inner()); let n = s.entry(session).or_default(); *n += 1; *n };
        let event_id = format!("hook:{name}:{seq}:{at}");
        let turn = text(hook, "generation_id");
        let base = |kind: EventKind, summary: Option<String>| NormalizedEvent {
            key: key.clone(), event_id: event_id.clone(), kind, at, turn_id: turn.clone(), name: folder.clone(), project: root.clone(), summary, ..Default::default()
        };
        let shell = || Some(serde_json::json!({ "command": text(hook, "command").unwrap_or_default() }));
        match name.as_str() {
            "sessionStart" => vec![base(EventKind::SessionStarted, Some("Oturum açıldı".into()))],
            "beforeSubmitPrompt" => vec![base(EventKind::TurnStarted, Some("İsteği işliyor".into()))],
            "beforeShellExecution" => vec![base(EventKind::ToolStarted, Some(tool_phrase("Bash", shell().as_ref())))],
            "beforeMCPExecution" => vec![base(EventKind::ToolStarted, Some(tool_phrase(&format!("mcp__{}", text(hook, "tool_name").unwrap_or_default()), None)))],
            "afterShellExecution" | "afterMCPExecution" => vec![base(EventKind::ToolEnded, None)],
            "afterFileEdit" => {
                let Some(path) = text(hook, "file_path") else { return vec![] };
                let edits = hook.get("edits").and_then(Value::as_array);
                let lines = |k: &str| edits.map(|e| e.iter().filter_map(|x| x.get(k).and_then(Value::as_str)).map(|s| s.lines().count() as u64).sum()).unwrap_or(0);
                let mut e = base(EventKind::FileChanged, None);
                e.file_change = Some(FileChange { path, additions: lines("new_string"), deletions: lines("old_string"), before: None, after: None });
                vec![e]
            }
            // The agent loop ended: replied, stopped by the user, or failed.
            "stop" => match text(hook, "status").as_deref() {
                Some("aborted") => vec![base(EventKind::Interrupted, Some("Tur durduruldu".into()))],
                Some("error") => vec![base(EventKind::Error, Some("Yanıt bir hatayla bitti".into()))],
                _ => vec![base(EventKind::TurnEnded, Some("Yanıt verdi".into()))],
            },
            "sessionEnd" => vec![base(EventKind::SessionEnded, Some("Oturum kapandı".into()))],
            _ => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{SessionStatus, Store};
    use serde_json::json;
    fn hook(name: &str, extra: Value) -> Value {
        let mut v = json!({"conversation_id": "c-1", "generation_id": "g-1", "hook_event_name": name, "cursor_version": "2.1.0", "workspace_roots": ["C:\\work\\shop"], "agentoffice_at": now()});
        for (k, val) in extra.as_object().unwrap() { v[k] = val.clone(); }
        v
    }
    #[test] fn a_cursor_chat_works_and_replies_but_is_never_guessed_waiting() {
        let (m, mut store) = (CursorHookMapper::default(), Store::new());
        let status = |s: &mut Store| s.snapshot().sessions.iter().find(|x| x.key.session_id == "c-1").map(|x| (x.status.clone(), x.name.clone()));
        for name in ["sessionStart", "beforeSubmitPrompt"] { for e in m.map(&hook(name, json!({})), "pc") { store.ingest(e); } }
        assert_eq!(status(&mut store), Some((SessionStatus::Working, "shop".into())));
        for e in m.map(&hook("beforeShellExecution", json!({"command": "npm test", "cwd": "C:\\work\\shop"})), "pc") { store.ingest(e); }
        assert!(store.snapshot().requests.is_empty(), "no approval event in Cursor: nothing shown as waiting");
        for e in m.map(&hook("afterFileEdit", json!({"file_path": "C:\\work\\shop\\a.ts", "edits": [{"old_string": "a", "new_string": "b\nc"}]})), "pc") { store.ingest(e); }
        for e in m.map(&hook("stop", json!({"status": "completed", "loop_count": 1})), "pc") { store.ingest(e); }
        let snap = store.snapshot(); let s = snap.sessions.iter().find(|x| x.key.session_id == "c-1").unwrap();
        assert_eq!(s.status, SessionStatus::ReplyEnded);
        assert_eq!((s.files[0].additions, s.files[0].deletions), (2, 1));
        assert_eq!(m.map(&hook("stop", json!({"status": "aborted"})), "pc")[0].kind, EventKind::Interrupted);
    }
}
