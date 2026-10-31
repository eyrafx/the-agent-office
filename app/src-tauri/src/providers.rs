//! The AI tools AgentOffice shows, each as a provider of the same shape:
//! - `detect`: is the tool on this computer (its folder or program);
//! - a read-only reader of its own records (Claude: `claude_meta`, Codex: `codex::watch`), if any;
//! - an optional hook connection (`link` / `connect` / `disconnect`), writing only AgentOffice's
//!   own entries, after a backup (see `setup`);
//! - an event mapper from the tool's hook events to the common events (`relay::ClaudeMapper`, …);
//! - `capabilities`: what is really known to work for it now, all off unless verified and connected;
//! - an opener: the exact chat when the tool has a link to it, else the tool's window brought to
//!   the front, else no button at all.
//! The office and the island never decide by a tool's name what it can do: they read these.
use crate::domain::{OpenRule, Session};
use crate::setup::Link;
use serde::Serialize;

/// What works for a provider now. Each one is on only when it has been verified for that tool
/// and its source is in place (e.g. live states only while its hook connection is on).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub history: bool,
    pub live_working: bool,
    pub live_idle: bool,
    pub live_waiting_permission: bool,
    pub live_waiting_input: bool,
    pub answer_question: bool,
    pub answer_permission: bool,
    pub open_chat_exact: bool,
    pub open_app: bool,
    pub usage_limits: bool,
}

/// How a chat of this tool is opened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Open {
    /// Its own link, handed to the tool's program (`exe`, lower case) so its window comes first.
    Exact { link: String, exe: &'static str },
    /// No way to a chat: the tool's window to the front (or the tool started), by its programs.
    App { exes: &'static [&'static str] },
}

pub trait Provider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    /// The tool is on this computer.
    fn detect(&self) -> bool;
    /// The hook connection's state; `Absent` when the tool is not here, `Off` when it has none.
    fn link(&self) -> Link { if self.detect() { Link::Off } else { Link::Absent } }
    fn capabilities(&self, link: &Link) -> Capabilities;
    /// The rule the office follows to offer opening a chat (see `domain::OpenRule`).
    fn open_rule(&self) -> OpenRule;
    /// How this chat opens; None: no button.
    fn opener(&self, session: &Session) -> Option<Open>;
}

pub struct Claude;
impl Provider for Claude {
    fn id(&self) -> &'static str { "claude" }
    fn name(&self) -> &'static str { "Claude Code" }
    fn detect(&self) -> bool { crate::setup::find_tools().claude }
    fn link(&self) -> Link { crate::setup::claude_link() }
    fn capabilities(&self, link: &Link) -> Capabilities {
        let on = *link == Link::On;
        // Transcripts are read without a connection; live states and answering need the hooks.
        Capabilities { history: true, live_working: on, live_idle: on, live_waiting_permission: on, live_waiting_input: on, answer_question: on, open_chat_exact: true, usage_limits: true, ..Default::default() }
    }
    // Only the desktop app's chats have a link (claude://…); a terminal chat has no way to it.
    fn open_rule(&self) -> OpenRule { OpenRule { exact_with_link: true, ..Default::default() } }
    fn opener(&self, session: &Session) -> Option<Open> {
        let link = session.link.clone().filter(|l| l.starts_with("claude://claude.ai/"))?;
        Some(Open::Exact { link, exe: "claude.exe" })
    }
}

/// Tools whose own hook events have really arrived since AgentOffice started: only then are the
/// states that come from those hooks claimed (a hook not yet trusted in the tool sends nothing).
static HOOKS_SEEN: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
pub fn hook_seen(id: &str) { if let Ok(mut s) = HOOKS_SEEN.lock() { if !s.iter().any(|x| x == id) { s.push(id.into()); } } }
fn seen(id: &str) -> bool { HOOKS_SEEN.lock().is_ok_and(|s| s.iter().any(|x| x == id)) }

pub struct Codex;
impl Provider for Codex {
    fn id(&self) -> &'static str { "codex" }
    fn name(&self) -> &'static str { "Codex" }
    fn detect(&self) -> bool { crate::setup::find_tools().codex }
    /// Its own hooks (optional; the user trusts them once in Codex with /hooks).
    fn link(&self) -> Link { crate::setup::tool_link(&crate::setup::CODEX_HOOKS) }
    fn capabilities(&self, link: &Link) -> Capabilities {
        // From its session records (read only): working, replied, and a question waiting; with its
        // hooks connected and their events arriving, also a permission waiting for the user.
        let hooks = *link == Link::On && seen("codex");
        Capabilities { history: true, live_working: true, live_idle: true, live_waiting_input: true, live_waiting_permission: hooks, open_chat_exact: true, usage_limits: true, ..Default::default() }
    }
    fn open_rule(&self) -> OpenRule { OpenRule { exact_by_id: true, ..Default::default() } }
    fn opener(&self, session: &Session) -> Option<Open> {
        let id = &session.key.session_id;
        (!id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')).then(|| Open::Exact { link: format!("codex://threads/{id}"), exe: "codex.exe" })
    }
}

/// Cursor: known only from its own hooks (its chat database is undocumented and not read). It has
/// no link to a single chat, so opening brings Cursor's window to the front.
pub struct Cursor;
impl Provider for Cursor {
    fn id(&self) -> &'static str { "cursor" }
    fn name(&self) -> &'static str { "Cursor" }
    fn detect(&self) -> bool { crate::setup::cursor_present() }
    fn link(&self) -> Link { crate::setup::tool_link(&crate::setup::CURSOR_HOOKS) }
    fn capabilities(&self, link: &Link) -> Capabilities {
        let hooks = *link == Link::On && seen("cursor");
        // No approval event in Cursor's hooks: never shown as waiting.
        Capabilities { live_working: hooks, live_idle: hooks, open_app: true, ..Default::default() }
    }
    fn open_rule(&self) -> OpenRule { OpenRule { app: true, ..Default::default() } }
    fn opener(&self, _session: &Session) -> Option<Open> { Some(Open::App { exes: &["cursor.exe"] }) }
}

static CLAUDE: Claude = Claude;
static CODEX: Codex = Codex;
static CURSOR: Cursor = Cursor;

/// Every provider AgentOffice knows, in the order they are shown.
pub fn all() -> [&'static dyn Provider; 3] { [&CLAUDE, &CODEX, &CURSOR] }
pub fn get(id: &str) -> Option<&'static dyn Provider> { all().into_iter().find(|p| p.id() == id) }

/// A provider as Settings and the first-run screen show it: whether it is here, its connection,
/// and what works for it now.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderState { pub id: &'static str, pub name: &'static str, pub present: bool, pub link: Link, pub capabilities: Capabilities }
pub fn states() -> Vec<ProviderState> {
    all().into_iter().map(|p| { let link = p.link(); ProviderState { id: p.id(), name: p.name(), present: p.detect(), capabilities: p.capabilities(&link), link } }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::SessionKey;
    fn session(provider: &str, id: &str, link: Option<&str>) -> Session { Session { key: SessionKey { provider: provider.into(), host_id: "pc".into(), session_id: id.into() }, link: link.map(str::to_owned), ..Default::default() } }
    #[test] fn nothing_is_claimed_that_is_not_verified() {
        let off = Claude.capabilities(&Link::Off);
        assert!(off.history && !off.live_working && !off.live_waiting_permission && !off.answer_question, "Claude without its hooks: history only");
        assert!(Claude.capabilities(&Link::On).live_waiting_permission);
        let codex = Codex.capabilities(&Link::Off);
        assert!(!codex.live_waiting_permission && !codex.answer_permission && !codex.answer_question && !codex.open_app);
        assert_eq!(Capabilities::default(), Capabilities { history: false, live_working: false, live_idle: false, live_waiting_permission: false, live_waiting_input: false, answer_question: false, answer_permission: false, open_chat_exact: false, open_app: false, usage_limits: false });
    }
    #[test] fn a_chat_opens_exactly_or_not_at_all() {
        assert_eq!(Claude.opener(&session("claude", "s", Some("claude://claude.ai/epitaxy/local_1"))), Some(Open::Exact { link: "claude://claude.ai/epitaxy/local_1".into(), exe: "claude.exe" }));
        assert_eq!(Claude.opener(&session("claude", "s", None)), None, "a terminal chat has no way to it: no button");
        assert_eq!(Claude.opener(&session("claude", "s", Some("https://evil.example/"))), None);
        assert_eq!(Codex.opener(&session("codex", "019a-bc", None)), Some(Open::Exact { link: "codex://threads/019a-bc".into(), exe: "codex.exe" }));
        assert_eq!(Codex.opener(&session("codex", "a b", None)), None);
        assert!(get("claude").is_some() && get("codex").is_some() && get("other").is_none());
    }
    #[test] fn the_office_offers_opening_only_as_the_rule_says() {
        let (linked, plain) = (session("claude", "s", Some("claude://claude.ai/x")), session("claude", "s", None));
        assert_eq!(Claude.open_rule().of(&linked), Some("exact"));
        assert_eq!(Claude.open_rule().of(&plain), None);
        assert_eq!(Codex.open_rule().of(&plain), Some("exact"));
        assert_eq!(OpenRule { app: true, ..Default::default() }.of(&plain), Some("app"));
        assert_eq!(OpenRule::default().of(&linked), None);
    }
}
