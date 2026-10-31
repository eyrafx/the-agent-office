//! A tool's own hooks file (Codex `~/.codex/hooks.json`, Cursor `~/.cursor/hooks.json`): only
//! AgentOffice's entries are added or taken out; every hook of the user's stays as it is. Our
//! entries are the ones that run the helper with `--hook <tool>`. Each event gets one entry that
//! only reports to the app: the helper prints nothing, so it never decides or approves anything.
use serde_json::{json, Map, Value};

/// How a tool writes its hooks file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    /// `{"hooks": {"Event": [{"hooks": [{"type": "command", "command": …}]}]}}` (Codex).
    Grouped,
    /// `{"version": 1, "hooks": {"event": [{"command": …}]}}` (Cursor).
    Flat,
}

/// The commands of every entry of ours (any path; for `old_path` repairs).
pub fn ours(doc: &Value, tool: &str) -> Vec<String> {
    let mine = |c: &str| { let c = c.to_lowercase(); c.contains("agentoffice-hook") && c.contains(&format!("--hook {tool}")) };
    let mut out = vec![];
    let Some(hooks) = doc.get("hooks").and_then(Value::as_object) else { return out };
    for list in hooks.values().filter_map(Value::as_array) {
        for item in list {
            let commands: Vec<&Value> = match item.get("hooks").and_then(Value::as_array) { Some(inner) => inner.iter().collect(), None => vec![item] };
            for h in commands { if let Some(c) = h.get("command").and_then(Value::as_str).filter(|c| mine(c)) { out.push(c.to_owned()); } }
        }
    }
    out
}

/// `doc` with our entries for `events` (name, timeout in seconds) put in, pointing at `command`
/// (on), or taken out (off). Entries of ours for other events or old paths go; others stay.
pub fn apply(mut doc: Value, style: Style, tool: &str, events: &[(&str, u64)], command: &str, on: bool) -> Value {
    if !doc.is_object() { doc = json!({}); }
    let mine = |c: &str| { let c = c.to_lowercase(); c.contains("agentoffice-hook") && c.contains(&format!("--hook {tool}")) };
    let root = doc.as_object_mut().unwrap();
    if style == Style::Flat && on { root.entry("version").or_insert(json!(1)); }
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() { *hooks = json!({}); }
    let hooks = hooks.as_object_mut().unwrap();
    // Out first, everywhere.
    for list in hooks.values_mut().filter_map(Value::as_array_mut) {
        list.retain_mut(|item| match item.get_mut("hooks").and_then(Value::as_array_mut) {
            Some(inner) => { inner.retain(|h| !h.get("command").and_then(Value::as_str).is_some_and(mine)); !inner.is_empty() }
            None => !item.get("command").and_then(Value::as_str).is_some_and(mine),
        });
    }
    if on {
        for (event, timeout) in events {
            let entry = match style {
                Style::Grouped => json!({"hooks": [{"type": "command", "command": command, "commandWindows": command, "timeout": timeout}]}),
                Style::Flat => json!({"command": command, "timeout": timeout}),
            };
            let list = hooks.entry(event.to_string()).or_insert_with(|| json!([]));
            if !list.is_array() { *list = json!([]); }
            list.as_array_mut().unwrap().push(entry);
        }
    }
    // Lists left empty by taking ours out go too (the user's never were empty).
    hooks.retain(|_, v| !v.as_array().is_some_and(Vec::is_empty));
    if hooks.is_empty() && !on { root.remove("hooks"); if style == Style::Flat && root.len() == 1 && root.contains_key("version") { root.remove("version"); } }
    doc
}

/// Whether every one of `events` has our entry, with exactly `command`.
pub fn complete(doc: &Value, style: Style, tool: &str, events: &[(&str, u64)], command: &str) -> bool {
    let _ = (style, tool);
    let Some(hooks) = doc.get("hooks").and_then(Value::as_object) else { return false };
    events.iter().all(|(event, _)| hooks.get(*event).and_then(Value::as_array).is_some_and(|list| list.iter().any(|item| {
        let inner: Vec<&Value> = match item.get("hooks").and_then(Value::as_array) { Some(i) => i.iter().collect(), None => vec![item] };
        inner.iter().any(|h| h.get("command").and_then(Value::as_str) == Some(command))
    })))
}

/// A document that is ours to leave as it was: a missing file reads as empty.
pub fn empty() -> Value { Value::Object(Map::new()) }

#[cfg(test)]
mod tests {
    use super::*;
    const CMD: &str = r#""C:\Users\u\.agentoffice\bin\agentoffice-hook.exe" --hook codex"#;
    const EVENTS: [(&str, u64); 2] = [("UserPromptSubmit", 5), ("Stop", 5)];
    #[test] fn only_our_entries_are_added_and_taken_out() {
        let user = json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "python3 ~/.codex/hooks/notify.py"}]}]}});
        let on = apply(user.clone(), Style::Grouped, "codex", &EVENTS, CMD, true);
        assert!(complete(&on, Style::Grouped, "codex", &EVENTS, CMD));
        assert_eq!(ours(&on, "codex").len(), 2);
        assert_eq!(on["hooks"]["Stop"].as_array().unwrap().len(), 2, "the user's own Stop hook stays");
        assert_eq!(on["hooks"]["Stop"][1]["hooks"][0]["commandWindows"], CMD);
        // Again: no duplicates; an old path is replaced.
        let again = apply(apply(on.clone(), Style::Grouped, "codex", &EVENTS, r#""C:\old\agentoffice-hook.exe" --hook codex"#, true), Style::Grouped, "codex", &EVENTS, CMD, true);
        assert_eq!(ours(&again, "codex").len(), 2);
        // Off: exactly the user's file again.
        assert_eq!(apply(on, Style::Grouped, "codex", &EVENTS, "", false), user);
        // Another tool's entries of ours are not touched.
        let both = apply(apply(json!({}), Style::Grouped, "codex", &EVENTS, CMD, true), Style::Grouped, "claude", &EVENTS, "", false);
        assert_eq!(ours(&both, "codex").len(), 2);
    }
    #[test] fn cursor_s_flat_file_keeps_its_version_and_the_user_s_hooks() {
        let cmd = r#""C:\h\agentoffice-hook.exe" --hook cursor"#;
        let user = json!({"version": 1, "hooks": {"afterFileEdit": [{"command": ".cursor/hooks/format.sh"}]}});
        let on = apply(user.clone(), Style::Flat, "cursor", &[("stop", 5), ("afterFileEdit", 5)], cmd, true);
        assert_eq!(on["version"], 1);
        assert_eq!(on["hooks"]["afterFileEdit"].as_array().unwrap().len(), 2);
        assert_eq!(on["hooks"]["stop"][0]["command"], cmd);
        assert_eq!(apply(on, Style::Flat, "cursor", &[], "", false), user);
        assert_eq!(apply(apply(json!({}), Style::Flat, "cursor", &[("stop", 5)], cmd, true), Style::Flat, "cursor", &[], "", false), json!({}));
    }
}
