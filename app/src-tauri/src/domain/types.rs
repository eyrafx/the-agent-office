use serde::{Deserialize, Serialize};

#[derive(Debug,Clone,Default,Serialize,Deserialize,PartialEq,Eq,Hash)]
#[serde(rename_all="camelCase")]
pub struct SessionKey { pub provider:String, pub host_id:String, pub session_id:String }
#[derive(Debug,Clone,Default,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
/// Working, waiting for the user (a permission or question), replied (its turn is over;
/// the task may go on), idle (Claude Code says it waits for input), interrupted, error,
/// ended (the session closed) or unknown (no live evidence; connection not verified).
pub enum SessionStatus { Working, Waiting, ReplyEnded, Idle, Interrupted, Error, Ended, #[default] Unknown }
#[derive(Debug,Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct FileChange { pub path:String, pub additions:u64, pub deletions:u64, #[serde(skip_serializing_if="Option::is_none")] pub before:Option<String>, #[serde(skip_serializing_if="Option::is_none")] pub after:Option<String> }
#[derive(Debug,Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
/// `name` is what people see: the user's own name, else the chat's real title, else the
/// helper's type, else the folder. `link` opens the chat in its source app; `verified` is
/// false until live evidence arrives (e.g. a session restored after a restart).
pub struct Session { pub key:SessionKey, pub name:String, pub project:String, pub status:SessionStatus, pub last_activity:u64, pub summary:String, #[serde(skip_serializing_if="Option::is_none")] pub parent_key:Option<SessionKey>, pub source:String, #[serde(default)] pub files:Vec<FileChange>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub title:Option<String>, #[serde(default,skip_serializing_if="Option::is_none")] pub custom_name:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub agent_type:Option<String>, #[serde(default,skip_serializing_if="Option::is_none")] pub reply:Option<String>,
    /// The project folder the chat started in (its office); `project` is where it works now.
    #[serde(default,skip_serializing_if="Option::is_none")] pub root:Option<String>,
    /// The project as the chat's own app names it (Codex: its project, or "Sohbetler" outside any).
    #[serde(default,skip_serializing_if="Option::is_none")] pub office:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub link:Option<String>, #[serde(default="yes")] pub verified:bool, #[serde(default)] pub started_at:u64,
    /// When the chat's last reply really ended (its own Stop or task_complete), not its last tool.
    #[serde(default,skip_serializing_if="Option::is_none")] pub replied_at:Option<u64>,
    /// How the chat opens from the office: "exact" (the chat itself), "app" (its tool's window) or none (no button). Set from its provider's rule.
    #[serde(default,skip_serializing_if="Option::is_none")] pub open:Option<String> }
fn yes()->bool{true}
/// A provider's rule for opening its chats: by the chat's own link, by its id, or only its app.
#[derive(Debug,Clone,Copy,Default,PartialEq,Eq)]
pub struct OpenRule { pub exact_with_link:bool, pub exact_by_id:bool, pub app:bool }
impl OpenRule { pub fn of(&self,s:&Session)->Option<&'static str>{ if (self.exact_with_link&&s.link.is_some())||self.exact_by_id {Some("exact")} else if self.app {Some("app")} else {None} } }
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq,Hash)]
#[serde(rename_all="camelCase")]
pub struct RequestKey { pub session_key:SessionKey, pub request_id:String }
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
pub enum RequestStatus { Pending, Answering, Resolved, Expired, Cancelled }
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PendingRequest { pub key:RequestKey, pub version:u64, #[serde(skip_serializing_if="Option::is_none")] pub turn_id:Option<String>, pub kind:String, pub title:String, pub detail:String, pub options:Vec<String>, pub expires_at:u64, pub status:RequestStatus, pub can_answer:bool,
    /// The tool call that asks (Claude's AskUserQuestion), when known.
    #[serde(default,skip_serializing_if="Option::is_none")] pub tool_id:Option<String>,
    /// A question's full form as the chat asked it: one to four questions, each with its options.
    #[serde(default,skip_serializing_if="Vec::is_empty")] pub questions:Vec<Question>,
    /// While AgentOffice holds the question so it can be answered here: when it passes to the
    /// chat's own screen (ms). None: it is answered in the chat's own app.
    #[serde(default,skip_serializing_if="Option::is_none")] pub hold_until:Option<u64>,
    /// How it ended, as far as AgentOffice knows: "delivered" (answered here and handed over),
    /// "elsewhere" (answered in the chat itself), "released" (passed to the chat's own screen).
    #[serde(default,skip_serializing_if="Option::is_none")] pub outcome:Option<String> }
/// One question of an AskUserQuestion call.
#[derive(Debug,Clone,Default,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",default)]
pub struct Question { pub question:String, pub header:String, pub options:Vec<QuestionOption>, pub multi_select:bool }
#[derive(Debug,Clone,Default,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",default)]
pub struct QuestionOption { pub label:String, pub description:String }
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct HistoryEvent { pub id:String, pub session_key:SessionKey, pub kind:String, pub title:String, pub at:u64 }
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Connection { pub provider:String, pub status:String, pub detail:String, #[serde(skip_serializing_if="Option::is_none")] pub verified_version:Option<String> }
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Snapshot { pub schema_version:u8, pub revision:u64, pub mode:String, pub sessions:Vec<Session>, pub requests:Vec<PendingRequest>, pub history:Vec<HistoryEvent>, pub connections:Vec<Connection>, #[serde(default)] pub limits:Vec<ProviderLimits>,
    /// Before managers were per office: the one chat the user made the manager (read once, to carry it over).
    #[serde(default,skip_serializing_if="Option::is_none")] pub manager:Option<String>,
    /// Each office's manager, if the user chose one (office key → chat); None until set up.
    #[serde(default,skip_serializing_if="Option::is_none")] pub managers:Option<std::collections::BTreeMap<String,String>>,
    /// Names the user gave offices (office key → name); the key, the project's identity, stays.
    #[serde(default,skip_serializing_if="std::collections::BTreeMap::is_empty")] pub office_names:std::collections::BTreeMap<String,String> }
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
pub enum AnswerResult { Delivered, Stale, Unsupported, Disconnected, Failed }
#[derive(Debug,Clone,Default,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
pub enum EventKind { #[default] SessionStarted, TurnStarted, ToolStarted, ToolEnded, TurnEnded, Interrupted, Error, ConnectionLost, RequestOpened, RequestClosed, FileChanged, Idle, SessionEnded,
    /// The chat's own record was written just now: live evidence that it is as its record says
    /// (Codex writes no event while a turn goes on, only its steps).
    Active }
#[derive(Debug,Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct NormalizedEvent {
    pub key:SessionKey, pub event_id:String, pub kind:EventKind, pub at:u64,
    #[serde(default)] pub turn_id:Option<String>, #[serde(default)] pub tool_id:Option<String>,
    #[serde(default)] pub name:Option<String>, #[serde(default)] pub project:Option<String>,
    #[serde(default)] pub summary:Option<String>, #[serde(default)] pub parent_key:Option<SessionKey>,
    #[serde(default)] pub request:Option<PendingRequest>, #[serde(default)] pub file_change:Option<FileChange>,
    #[serde(default)] pub replay:bool,
    /// Helper type for a subagent (e.g. "Explore"); the transcript a Claude event came from.
    #[serde(default)] pub agent_type:Option<String>, #[serde(default)] pub transcript:Option<String>,
    /// The reply's first sentence when the source gives it with the event (Codex).
    #[serde(default)] pub reply:Option<String>,
}
/// One line of an office's work board, written when it happened and never rebuilt from a
/// later message: which chat, in which office (its folder or app project then), what kind
/// of moment and a short description. No chat content beyond that sentence.
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase")]
pub struct WorkEntry { pub id:String, pub at:u64, pub provider:String, pub session_id:String, pub chat:String,
    #[serde(default,skip_serializing_if="Option::is_none")] pub root:Option<String>, #[serde(default,skip_serializing_if="Option::is_none")] pub office:Option<String>, #[serde(default)] pub project:String,
    /// reply, permission, question, error or stopped.
    pub kind:String, #[serde(default)] pub text:String, #[serde(default,skip_serializing_if="Option::is_none")] pub link:Option<String> }
#[derive(Debug,Clone,Serialize)]
pub struct StoreDelta { pub revision:u64, pub changed:bool }

/// A usage window exactly as the source reports it; nothing is estimated.
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase")]
/// `model`: set for a model-specific window (e.g. Claude's weekly Fable limit).
pub struct LimitWindow { pub window_minutes:u64, pub used_percent:f64, #[serde(skip_serializing_if="Option::is_none")] pub resets_at:Option<u64>, #[serde(default,skip_serializing_if="Option::is_none")] pub model:Option<String> }
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase")]
/// `note`: why there is no reading yet (shown when `windows` is empty).
pub struct ProviderLimits { pub provider:String, #[serde(skip_serializing_if="Option::is_none")] pub plan:Option<String>, pub windows:Vec<LimitWindow>, pub updated_at:u64, pub source:String, #[serde(default,skip_serializing_if="Option::is_none")] pub note:Option<String>, #[serde(default,skip_serializing_if="Option::is_none")] pub credits:Option<Credits>, /// Rate-limit resets the account can still use (Codex). 
#[serde(default,skip_serializing_if="Option::is_none")] pub resets_available:Option<u64> }
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase")]
/// Extra usage credits beyond the plan's windows (Codex reports them).
pub struct Credits { pub unlimited:bool, pub balance:f64 }
