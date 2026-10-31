//! The tracking scenarios the office has to get right, end to end from Claude
//! Code hook payloads through the mapper into the store.
use agentoffice_lib::domain::*;
use agentoffice_lib::relay::ClaudeMapper;
use serde_json::{json, Value};

fn hook(session: &str, name: &str, at: u64, extra: Value) -> Value {
    let mut v = json!({"session_id": session, "hook_event_name": name, "cwd": "C:\\Users\\demo\\Desktop\\puzzle", "agentoffice_at": at});
    for (k, val) in extra.as_object().unwrap() { v[k] = val.clone(); }
    v
}
fn feed(store: &mut Store, mapper: &ClaudeMapper, h: Value) { for e in mapper.map(&h, "pc") { store.ingest(e); } }
fn find<'a>(snap: &'a Snapshot, id: &str) -> &'a Session { snap.sessions.iter().find(|s| s.key.session_id == id).unwrap() }
/// Main sessions only (helpers belong to their chat), as the office counts them.
fn main_sessions(snap: &Snapshot) -> usize { snap.sessions.iter().filter(|s| s.parent_key.is_none()).count() }

#[test] fn two_chats_in_one_folder_with_a_helper() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat-a", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat-b", "UserPromptSubmit", 101, json!({})));
    feed(&mut s, &m, hook("chat-a", "SubagentStart", 102, json!({"agent_id": "h1", "agent_type": "Explore"})));
    feed(&mut s, &m, hook("chat-a", "PreToolUse", 103, json!({"agent_id": "h1", "agent_type": "Explore", "tool_name": "Grep", "tool_use_id": "g1"})));
    let snap = s.snapshot_at(110);
    assert_eq!(main_sessions(&snap), 2, "two chats, the helper is not a third worker");
    let helper = find(&snap, "chat-a~h1");
    assert_eq!(helper.parent_key.as_ref().map(|k| k.session_id.as_str()), Some("chat-a"));
    assert_eq!(helper.name, "Yardımcı · Explore");
    assert_eq!(helper.status, SessionStatus::Working);
    // The chat's reply ends while its helper keeps working.
    feed(&mut s, &m, hook("chat-a", "Stop", 120, json!({})));
    let snap = s.snapshot_at(121);
    assert_eq!(find(&snap, "chat-a").status, SessionStatus::ReplyEnded);
    assert_eq!(find(&snap, "chat-a~h1").status, SessionStatus::Working);
    feed(&mut s, &m, hook("chat-a", "SubagentStop", 130, json!({"agent_id": "h1", "agent_type": "Explore"})));
    assert_eq!(find(&s.snapshot_at(131), "chat-a~h1").status, SessionStatus::ReplyEnded);
}

#[test] fn a_permission_waits_for_the_user_however_long_it_takes() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat", "Notification", 110, json!({"notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash"})));
    let later = s.snapshot_at(110 + 3 * 3600 * 1000);
    assert_eq!(find(&later, "chat").status, SessionStatus::Waiting);
    assert_eq!(later.requests.iter().filter(|r| r.status == RequestStatus::Pending).count(), 1);
    // Answered in Claude: the next tool call closes it.
    feed(&mut s, &m, hook("chat", "PreToolUse", 120, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    let snap = s.snapshot_at(121);
    assert_eq!(find(&snap, "chat").status, SessionStatus::Working);
    assert!(snap.requests.iter().all(|r| r.status != RequestStatus::Pending));
}

#[test] fn long_silent_work_stays_working_and_a_reply_is_not_the_end_of_the_task() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat", "PreToolUse", 110, json!({"tool_name": "Bash", "tool_use_id": "test", "tool_input": {"command": "npm test", "description": "Run the puzzle tests"}})));
    let snap = s.snapshot_at(110 + 2 * 3600 * 1000);
    assert_eq!(find(&snap, "chat").status, SessionStatus::Working);
    assert_eq!(find(&snap, "chat").summary, "test çalıştırıyor");
    feed(&mut s, &m, hook("chat", "PostToolUse", 200, json!({"tool_name": "Bash", "tool_use_id": "test"})));
    feed(&mut s, &m, hook("chat", "Stop", 210, json!({})));
    let chat = find(&s.snapshot_at(211), "chat").clone();
    assert_eq!(chat.status, SessionStatus::ReplyEnded);
    assert_eq!(chat.summary, "Yanıt verdi");
    // Claude Code reports it is waiting for input: idle, not finished, not working.
    feed(&mut s, &m, hook("chat", "Notification", 300, json!({"notification_type": "idle_prompt", "message": "Claude is waiting for your input"})));
    assert_eq!(find(&s.snapshot_at(301), "chat").status, SessionStatus::Idle);
}

#[test] fn a_closed_chat_ends_and_leaves_the_office_later() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 1_000, json!({})));
    feed(&mut s, &m, hook("chat", "SessionEnd", 2_000, json!({})));
    assert_eq!(find(&s.snapshot_at(2_001), "chat").status, SessionStatus::Ended);
    assert!(!s.prune(2_000 + 60_000));
    assert!(s.prune(2_000 + 16 * 60_000));
    assert!(s.snapshot_at(2_000 + 16 * 60_000).sessions.is_empty());
}

#[test] fn a_quiet_chat_stays_in_the_office_for_three_days() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("quiet", "UserPromptSubmit", 1_000, json!({})));
    feed(&mut s, &m, hook("quiet", "Stop", 2_000, json!({})));
    let day = 24 * 3600 * 1000;
    assert!(!s.prune(2_000 + 2 * day + 23 * 3600 * 1000), "still there after two days");
    assert!(s.prune(2_000 + 3 * day + 1));
}

#[test] fn a_chat_its_app_still_lists_stays_however_old_and_leaves_once_archived() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let key = |id: &str| SessionKey { provider: "codex".into(), host_id: "pc".into(), session_id: id.into() };
    s.seed(key("old"), Some(r"C:\work".into()), Some("Sabit master şablon".into()), None, true, 1_000, 2_000);
    s.seed(key("other"), Some(r"C:\work".into()), Some("Ürün kopyalama".into()), None, true, 1_000, 2_000);
    feed(&mut s, &m, hook("cli", "Stop", 1_000, json!({})));
    assert!(s.apply_app(&key("old"), Some("Sabit master şablon".into()), Some(r"C:\work".into()), Some("work".into())));
    assert_eq!(find(&s.live_snapshot(), "old").office.as_deref(), Some("work"));
    s.set_listed("codex", ["old".to_string(), "other".to_string()].into());
    let month = 30 * 24 * 3600 * 1000;
    s.prune(month);
    let snap = s.live_snapshot();
    assert!(snap.sessions.iter().any(|x| x.key.session_id == "old") && snap.sessions.iter().any(|x| x.key.session_id == "other"), "listed chats stay");
    assert!(!snap.sessions.iter().any(|x| x.key.session_id == "cli"), "an unlisted quiet chat still leaves after three days");
    assert!(s.set_listed("codex", ["other".to_string()].into()), "archived in the app: it leaves");
    assert!(!s.live_snapshot().sessions.iter().any(|x| x.key.session_id == "old"));
    assert!(!s.set_listed("codex", Default::default()), "an unreadable list removes nothing");
    assert!(s.live_snapshot().sessions.iter().any(|x| x.key.session_id == "other"));
}

#[test] fn each_office_keeps_its_own_manager_across_a_restart() {
    let mut s = Store::new();
    let mut old = s.live_snapshot(); old.manager = Some("yonetici".into());
    let mut s2 = Store::restore(old);
    let managers: std::collections::BTreeMap<String, String> = [("claude:c:\\puzzle".to_string(), "yonetici".to_string())].into();
    assert!(s2.set_managers(managers.clone()), "the former single manager is carried into the office's choice");
    assert!(!s2.set_managers(managers.clone()), "the same choice again changes nothing");
    assert!(s2.set_office_name("claude:c:\\puzzle".into(), Some("Bulmaca".into())));
    let saved = serde_json::to_string(&s2.live_snapshot()).unwrap();
    let back = Store::restore(serde_json::from_str(&saved).unwrap()).live_snapshot();
    assert_eq!(back.managers.as_ref(), Some(&managers));
    assert!(back.manager.is_none());
    assert_eq!(back.office_names.get("claude:c:\\puzzle").map(String::as_str), Some("Bulmaca"), "an office's name is kept too");
    // Dropping the puzzle office's manager leaves the office without one.
    assert!(s.set_managers(Default::default()));
    assert_eq!(s.live_snapshot().managers, Some(Default::default()));
}

#[test] fn a_chat_begun_in_the_scratch_folder_moves_into_the_project_it_works_in() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let scratch = r"C:\Users\demo\AppData\Roaming\Claude\scratch-workspaces\e7\2e\scratch-2026-10-24-a1b2c3";
    let mut start = hook("voice", "UserPromptSubmit", 1_000, json!({}));
    start["cwd"] = json!(scratch);
    feed(&mut s, &m, start);
    s.set_root("voice", Some(scratch.into()), true);
    assert_eq!(find(&s.live_snapshot(), "voice").root.as_deref(), Some(scratch));
    let mut work = hook("voice", "PreToolUse", 2_000, json!({"tool_name": "Bash", "tool_input": {"command": "dir"}}));
    work["cwd"] = json!(r"C:\Users\demo\Desktop\NoteTaker");
    feed(&mut s, &m, work);
    assert_eq!(find(&s.live_snapshot(), "voice").root.as_deref(), Some(r"C:\Users\demo\Desktop\NoteTaker"), "working in a folder of the user's: that is its project");
    // The Claude app's record still names the scratch folder: it does not take the project back.
    assert!(!s.set_root("voice", Some(scratch.into()), true));
    // A subfolder of the project, or another folder for a while, moves nothing.
    let mut sub = hook("voice", "PreToolUse", 3_000, json!({"tool_name": "Read", "tool_input": {}}));
    sub["cwd"] = json!(r"C:\Users\demo\Desktop\NoteTaker\src");
    feed(&mut s, &m, sub);
    let mut other = hook("voice", "PreToolUse", 4_000, json!({"tool_name": "Read", "tool_input": {}}));
    other["cwd"] = json!(r"C:\Users\demo\Desktop\puzzle");
    feed(&mut s, &m, other);
    assert_eq!(find(&s.live_snapshot(), "voice").root.as_deref(), Some(r"C:\Users\demo\Desktop\NoteTaker"));
    assert_eq!(main_sessions(&s.live_snapshot()), 1, "one chat, one person");
    // Saved and opened again: still in its project.
    let back = Store::restore(serde_json::from_str(&serde_json::to_string(&s.live_snapshot()).unwrap()).unwrap());
    let mut back = back; assert!(!back.set_root("voice", Some(scratch.into()), true));
    assert_eq!(find(&back.live_snapshot(), "voice").root.as_deref(), Some(r"C:\Users\demo\Desktop\NoteTaker"));
}

#[test] fn a_chat_saved_in_the_scratch_folder_moves_on_the_next_read_of_the_claude_apps_record() {
    // Saved with its scratch folder as root and its work already elsewhere (as it was
    // before this rule): the app's record, read again, names the scratch folder still.
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let scratch = r"C:\Users\demo\AppData\Roaming\Claude\scratch-workspaces\e7\2e\scratch-2026-10-24-a1b2c3";
    let mut work = hook("voice", "PreToolUse", 2_000, json!({"tool_name": "Bash", "tool_input": {"command": "dir"}}));
    work["cwd"] = json!(scratch);
    feed(&mut s, &m, work);
    s.set_root("voice", Some(scratch.into()), true);
    let mut saved = s.live_snapshot();
    saved.sessions[0].project = r"C:\Users\demo\Desktop\NoteTaker".into();
    let mut back = Store::restore(saved);
    assert!(back.set_root("voice", Some(scratch.into()), true), "the same scratch root read again still moves it");
    assert_eq!(find(&back.live_snapshot(), "voice").root.as_deref(), Some(r"C:\Users\demo\Desktop\NoteTaker"));
}

#[test] fn after_a_restart_nothing_claims_to_be_live_until_seen_again() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("busy", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("done", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("done", "Stop", 110, json!({})));
    let saved = serde_json::to_string(&s.live_snapshot()).unwrap();
    let mut restarted = Store::restore(serde_json::from_str(&saved).unwrap());
    let snap = restarted.snapshot_at(200);
    let busy = find(&snap, "busy");
    assert_eq!(busy.status, SessionStatus::Unknown);
    assert!(!busy.verified);
    assert_eq!(find(&snap, "done").status, SessionStatus::ReplyEnded);
    // Its transcript shows it still busy but silent for an hour: still not verified.
    let key = busy.key.clone();
    restarted.seed(key.clone(), None, Some("Test ve Paket".into()), None, false, 300, 300 + 3600 * 1000);
    let snap = restarted.snapshot_at(400);
    assert_eq!(find(&snap, "busy").name, "Test ve Paket");
    assert_eq!(find(&snap, "busy").status, SessionStatus::Unknown);
    // The next live event verifies it again.
    let mapper = ClaudeMapper::default();
    feed(&mut restarted, &mapper, hook("busy", "PreToolUse", 5_000_000, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    let busy = find(&restarted.snapshot_at(5_000_001), "busy").clone();
    assert!(busy.verified);
    assert_eq!(busy.status, SessionStatus::Working);
}

#[test] fn after_a_restart_an_old_answered_chat_is_idle_and_only_unfinished_work_is_unknown() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("old", "UserPromptSubmit", 1_000, json!({})));
    feed(&mut s, &m, hook("old", "Stop", 2_000, json!({})));
    feed(&mut s, &m, hook("cut", "UserPromptSubmit", 1_000, json!({})));
    let saved = serde_json::to_string(&s.live_snapshot()).unwrap();
    let mut restarted = Store::restore(serde_json::from_str(&saved).unwrap());
    let a_day = 24 * 3600 * 1000;
    // Its transcript's last line is a moment older than the saved Stop event, and a day old.
    let old = find(&restarted.snapshot_at(10), "old").key.clone();
    restarted.seed(old, None, None, Some("Bitti.".into()), true, 1_990, 1_990 + a_day);
    let done = find(&restarted.snapshot_at(1_990 + a_day), "old").clone();
    assert_eq!(done.status, SessionStatus::ReplyEnded);
    assert!(done.verified, "an answered chat on record is known: idle");
    // A transcript that stopped in the middle of work, a day ago: that is unknown.
    let cut = find(&restarted.snapshot_at(10), "cut").key.clone();
    restarted.seed(cut, None, None, None, false, 1_500, 1_500 + a_day);
    let cut = find(&restarted.snapshot_at(1_500 + a_day), "cut").clone();
    assert_eq!(cut.status, SessionStatus::Unknown);
    assert!(!cut.verified);
}

#[test] fn user_names_win_and_survive() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    assert_eq!(find(&s.snapshot_at(101), "chat").name, "puzzle");
    s.apply_meta("chat", Some("Bulmaca - Test ve Paket".into()), Some("claude://claude.ai/epitaxy/local_x".into()), false, None);
    assert_eq!(find(&s.snapshot_at(102), "chat").name, "Bulmaca - Test ve Paket");
    s.rename("chat", Some("Test ekibi".into()));
    feed(&mut s, &m, hook("chat", "PreToolUse", 200, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    assert_eq!(find(&s.snapshot_at(201), "chat").name, "Test ekibi");
    s.rename("chat", None);
    assert_eq!(find(&s.snapshot_at(202), "chat").name, "Bulmaca - Test ve Paket");
    // Archived in Claude: it leaves the office.
    s.apply_meta("chat", None, None, true, None);
    assert!(s.snapshot_at(203).sessions.is_empty());
}

#[test] fn work_already_under_way_when_the_office_starts_counts_as_working_until_the_reply() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    // No prompt was seen: the first events are tools of a turn that began earlier.
    feed(&mut s, &m, hook("chat", "PreToolUse", 100, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 200, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    assert_eq!(find(&s.snapshot_at(10 * 60 * 1000), "chat").status, SessionStatus::Working, "between two tools it still works");
    feed(&mut s, &m, hook("chat", "Stop", 300, json!({})));
    assert_eq!(find(&s.snapshot_at(301), "chat").status, SessionStatus::ReplyEnded);
}

fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64 }
fn codex_event(id: &str, event: &str, kind: EventKind, at: u64) -> NormalizedEvent {
    NormalizedEvent { key: SessionKey { provider: "codex".into(), host_id: "pc".into(), session_id: id.into() }, event_id: event.into(), kind, at, turn_id: Some("t1".into()), project: Some(r"C:\work\shop".into()), name: Some("shop".into()), ..Default::default() }
}

#[test] fn the_work_board_writes_each_moment_once_with_the_office_it_happened_in() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let t = now_ms() - 60_000;
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", t, json!({})));
    feed(&mut s, &m, hook("chat", "PreToolUse", t + 1, json!({"agent_id": "h1", "agent_type": "Explore", "tool_name": "Read", "tool_use_id": "r1"})));
    feed(&mut s, &m, hook("chat", "SubagentStop", t + 2, json!({"agent_id": "h1", "agent_type": "Explore"})));
    feed(&mut s, &m, hook("chat", "Stop", t + 3, json!({})));
    // The reply's sentence is read from the transcript just after the reply ended.
    assert!(s.describe_reply("chat", "Kupon hatası düzeltildi."));
    let lines = s.take_fresh_log();
    assert_eq!(lines.len(), 1, "a helper's own reply is not a line of the board");
    let line = &lines[0];
    assert_eq!((line.kind.as_str(), line.text.as_str(), line.at, line.provider.as_str()), ("reply", "Kupon hatası düzeltildi.", t + 3, "claude"));
    assert_eq!(line.project, r"C:\Users\demo\Desktop\puzzle");
    // A later sentence never rewrites an earlier reply's line.
    assert!(!s.describe_reply("chat", "Başka bir şey."));
    assert!(s.take_fresh_log().is_empty());
    // A permission a helper asks for is its chat's line; the chat's office is kept as it was then.
    feed(&mut s, &m, hook("chat", "PreToolUse", t + 10, json!({"agent_id": "h2", "agent_type": "Plan", "tool_name": "Bash", "tool_use_id": "b2", "tool_input": {"command": "npm test"}})));
    feed(&mut s, &m, hook("chat", "Notification", t + 11, json!({"agent_id": "h2", "notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash"})));
    let asked = s.take_fresh_log();
    assert_eq!((asked[0].kind.as_str(), asked[0].session_id.as_str(), asked[0].text.as_str()), ("permission", "chat", "Komut çalıştırmak için izin istiyor"));
    assert!(!asked[0].text.contains("npm"), "the command itself stays off the board");
}

#[test] fn the_board_survives_a_restart_without_doubling_and_keeps_thirty_days() {
    let mut s = Store::new();
    let t = now_ms() - 3_600_000;
    let mut done = codex_event("th1", "f:1", EventKind::TurnEnded, t);
    done.reply = Some("Sepet sayfası hazır.".into());
    s.ingest(codex_event("th1", "f:0", EventKind::TurnStarted, t - 5000));
    s.ingest(done.clone());
    let saved = s.log_entries();
    assert_eq!(saved.len(), 1);
    assert_eq!((saved[0].text.as_str(), saved[0].link.as_deref()), ("Sepet sayfası hazır.", Some("codex://threads/th1")));
    assert_eq!(find(&s.snapshot(), "th1").reply.as_deref(), Some("Sepet sayfası hazır."), "a Codex chat says its last reply too");
    // After a restart the same record is read again from the rollout: no second line.
    let mut again = Store::new();
    let old = WorkEntry { id: "old".into(), at: now_ms() - 31 * 24 * 3_600_000, provider: "codex".into(), session_id: "x".into(), chat: "x".into(), root: None, office: None, project: String::new(), kind: "reply".into(), text: String::new(), link: None };
    again.load_log(vec![saved[0].clone(), old], now_ms());
    assert_eq!(again.log_entries().len(), 1, "a line older than 30 days is dropped");
    let mut replay = done; replay.replay = true;
    again.ingest(codex_event("th1", "f:0", EventKind::TurnStarted, t - 5000));
    again.ingest(replay);
    assert_eq!(again.log_entries().len(), 1);
    assert!(again.take_fresh_log().is_empty());
}

#[test] fn the_last_reply_is_when_the_reply_ended_not_the_last_tool() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let t = now_ms() - 600_000;
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", t, json!({})));
    feed(&mut s, &m, hook("chat", "Stop", t + 1000, json!({})));
    // A background task's tool runs on after the reply, then stops again later.
    feed(&mut s, &m, hook("chat", "PreToolUse", t + 5000, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    let snap = s.snapshot();
    assert_eq!(find(&snap, "chat").replied_at, Some(t + 1000));
    assert_eq!(find(&snap, "chat").last_activity, t + 5000);
    // A chat found answered in its transcript at start replied at its last line.
    s.seed(SessionKey { provider: "claude".into(), host_id: "pc".into(), session_id: "old".into() }, None, Some("Eski".into()), None, true, t - 9000, t);
    assert_eq!(find(&s.snapshot(), "old").replied_at, Some(t - 9000));
}

#[test] fn a_source_app_that_is_not_running_has_nobody_at_work() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let t = now_ms();
    s.ingest(codex_event("th1", "f:0", EventKind::TurnStarted, t));
    let mut ask = codex_event("th1", "f:1", EventKind::RequestOpened, t + 1);
    ask.request = Some(PendingRequest { key: RequestKey { session_key: ask.key.clone(), request_id: "c1".into() }, version: 1, turn_id: Some("t1".into()), kind: "permission".into(), title: "Komut onayı isteniyor".into(), detail: String::new(), options: vec![], expires_at: t + 60_000, status: RequestStatus::Pending, can_answer: false, tool_id: None, questions: vec![], hold_until: None, outcome: None});
    s.ingest(ask);
    feed(&mut s, &m, hook("terminal", "UserPromptSubmit", t, json!({})));
    feed(&mut s, &m, hook("desktop", "UserPromptSubmit", t, json!({})));
    s.apply_meta("desktop", Some("Masaüstü".into()), Some("claude://claude.ai/claude-code-desktop/local_1".into()), false, None);
    assert!(s.source_lost("codex", None));
    let only_desktop = |x: &Session| x.link.is_some();
    assert!(s.source_lost("claude", Some(&only_desktop)));
    let snap = s.snapshot();
    let th = find(&snap, "th1");
    assert_eq!((th.status.clone(), th.verified), (SessionStatus::Unknown, false));
    assert!(snap.requests.iter().all(|r| r.status != RequestStatus::Pending), "its request is over too");
    assert_eq!(find(&snap, "desktop").status, SessionStatus::Unknown);
    assert_eq!(find(&snap, "terminal").status, SessionStatus::Working, "a terminal chat is not judged by the desktop app");
    // Back at work once its next event arrives.
    s.ingest(codex_event("th1", "f:2", EventKind::TurnStarted, t + 5000));
    assert_eq!(find(&s.snapshot(), "th1").status, SessionStatus::Working);
}

#[test] fn a_board_line_leaves_out_what_looks_like_a_key() {
    assert_eq!(board_text("Anahtar sk-ant-api03-AbCdEf0123456789xyzQW eklendi."), "Anahtar … eklendi.");
    assert_eq!(board_text("Kupon   hatası\ndüzeltildi."), "Kupon hatası düzeltildi.");
    assert_eq!(board_text(&"a".repeat(400)).chars().count(), 240);
}

#[test] fn a_hook_that_arrives_after_the_reply_but_started_before_it_does_not_reopen_work() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat", "PreToolUse", 200, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 300, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    feed(&mut s, &m, hook("chat", "Stop", 1000, json!({})));
    // Each hook runs in its own process: this one began at 250 but is delivered after the Stop.
    feed(&mut s, &m, hook("chat", "PreToolUse", 250, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 260, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    assert_eq!(find(&s.snapshot_at(2000), "chat").status, SessionStatus::ReplyEnded, "a late event belongs to the finished turn");
    // Real work after the reply (a background task's result) is work again, and its reply ends it.
    feed(&mut s, &m, hook("chat", "PreToolUse", 3000, json!({"tool_name": "Bash", "tool_use_id": "b2"})));
    assert_eq!(find(&s.snapshot_at(3001), "chat").status, SessionStatus::Working);
    feed(&mut s, &m, hook("chat", "PostToolUse", 3100, json!({"tool_name": "Bash", "tool_use_id": "b2"})));
    feed(&mut s, &m, hook("chat", "Stop", 3200, json!({})));
    assert_eq!(find(&s.snapshot_at(3300), "chat").status, SessionStatus::ReplyEnded);
}

#[test] fn after_a_restart_the_next_prompt_is_a_new_turn_not_the_one_already_over() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    // The office starts in the middle of a turn: its first events are tools, then the reply.
    feed(&mut s, &m, hook("chat", "PreToolUse", 100, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 150, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    feed(&mut s, &m, hook("chat", "Stop", 200, json!({})));
    assert_eq!(find(&s.snapshot_at(201), "chat").status, SessionStatus::ReplyEnded);
    // The user's next message: working (not "unknown"), and its reply ends it.
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 300, json!({})));
    assert_eq!(find(&s.snapshot_at(301), "chat").status, SessionStatus::Working);
    feed(&mut s, &m, hook("chat", "PreToolUse", 310, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    assert_eq!(find(&s.snapshot_at(311), "chat").status, SessionStatus::Working);
    feed(&mut s, &m, hook("chat", "PostToolUse", 320, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    feed(&mut s, &m, hook("chat", "Stop", 400, json!({})));
    assert_eq!(find(&s.snapshot_at(401), "chat").status, SessionStatus::ReplyEnded);
}

#[test] fn a_chat_whose_transcript_says_the_reply_ended_is_not_left_working() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat", "PreToolUse", 200, json!({"tool_name": "Bash", "tool_use_id": "b1"})));
    // The Stop never reaches the office (lost): its transcript ends with the reply at 900.
    assert_eq!(find(&s.snapshot_at(1000), "chat").status, SessionStatus::Working);
    assert!(s.settle_reply("chat", 900));
    let snap = s.snapshot_at(1000);
    assert_eq!((find(&snap, "chat").status.clone(), find(&snap, "chat").replied_at), (SessionStatus::ReplyEnded, Some(900)));
    assert!(!s.settle_reply("chat", 900), "only a chat counted as working is settled");
    // Its next real work opens a turn again.
    feed(&mut s, &m, hook("chat", "PreToolUse", 2000, json!({"tool_name": "Bash", "tool_use_id": "b2"})));
    assert_eq!(find(&s.snapshot_at(2001), "chat").status, SessionStatus::Working);
}

/// A question the user has not answered yet survives AgentOffice restarting: the restart calls
/// off the request its hook opened, the chat's transcript still shows the question waiting, so
/// it is shown again (once) and goes when the transcript has the answer.
#[test] fn a_waiting_question_comes_back_after_a_restart_and_goes_when_answered() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let ask = json!({"tool_name": "AskUserQuestion", "tool_use_id": "toolu_q", "tool_input": {"questions": [{"question": "Ham şekiller çıktı. Nasıl devam edelim?", "options": [{"label": "Tek karakter"}, {"label": "Burada dur"}]}]}});
    feed(&mut s, &m, hook("boss", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("boss", "PreToolUse", 200, ask));
    let waiting = |snap: &Snapshot| snap.requests.iter().filter(|r| r.key.session_key.session_id == "boss" && matches!(r.status, RequestStatus::Pending | RequestStatus::Answering)).count();
    assert_eq!(waiting(&s.live_snapshot()), 1);
    let key = find(&s.live_snapshot(), "boss").key.clone();
    // The hook's own question and the transcript's are one question, not two.
    assert!(!s.transcript_question(&key, Some(("toolu_q", "Ham şekiller çıktı. Nasıl devam edelim?", "Tek karakter · Burada dur", 200))));
    assert_eq!(waiting(&s.live_snapshot()), 1);
    let mut restarted = Store::restore(serde_json::from_str(&serde_json::to_string(&s.live_snapshot()).unwrap()).unwrap());
    assert_eq!(waiting(&restarted.live_snapshot()), 0, "a restart calls off what it cannot see");
    assert!(restarted.transcript_question(&key, Some(("toolu_q", "Ham şekiller çıktı. Nasıl devam edelim?", "Tek karakter · Burada dur", 200))));
    let snap = restarted.snapshot_at(300);
    assert_eq!(waiting(&snap), 1);
    let r = snap.requests.iter().find(|r| r.status == RequestStatus::Pending).unwrap();
    assert_eq!((r.kind.as_str(), r.detail.as_str()), ("question", "Tek karakter · Burada dur"));
    assert_eq!(find(&snap, "boss").status, SessionStatus::Waiting);
    assert!(find(&snap, "boss").verified);
    // Read again (every pass): nothing changes.
    assert!(!restarted.transcript_question(&key, Some(("toolu_q", "Ham şekiller çıktı. Nasıl devam edelim?", "Tek karakter · Burada dur", 200))));
    // Answered: the transcript has the tool result.
    assert!(restarted.transcript_question(&key, None));
    let snap = restarted.snapshot_at(400);
    assert_eq!(waiting(&snap), 0);
    assert_eq!(find(&snap, "boss").status, SessionStatus::Working);
}

#[test] fn the_desktop_apps_new_scratch_folder_is_a_scratch_folder() {
    assert!(agentoffice_lib::domain::is_scratch(r"C:\Users\demo\AppData\Local\Claude-Data\claude_demo0000000000\scratch-workspaces\e7\2e\scratch-1"));
    assert!(agentoffice_lib::domain::is_scratch(r"C:\Users\demo\AppData\Roaming\Claude\scratch-workspaces\e7\2e\scratch-1"));
    assert!(!agentoffice_lib::domain::is_scratch(r"C:\Users\demo\Desktop\puzzle\scratch-workspaces\a"));
}

fn open_requests(snap: &Snapshot) -> usize { snap.requests.iter().filter(|r| matches!(r.status, RequestStatus::Pending | RequestStatus::Answering)).count() }

/// 30 Oct: a helper of the chat asked a question (its hook said so) and was never heard from
/// again, while the chat itself went on for an hour, turn after turn. The island kept saying the
/// chat had a question that was no longer anywhere. A helper's question is over once its chat
/// moves on (a new turn or a finished reply) after the helper last spoke.
#[test] fn a_helpers_question_its_chat_has_moved_past_is_not_waiting() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let lines: Vec<Value> = include_str!("fixtures/stale-helper-question.jsonl").lines().map(|l| serde_json::from_str(l).unwrap()).collect();
    let chat = "6b5447e0-235b-44ad-9493-e4e6c2e423a7";
    for h in &lines[..5] { feed(&mut s, &m, h.clone()); }
    let snap = s.snapshot_at(1793374140000);
    assert_eq!(open_requests(&snap), 1, "the helper asks after the chat's reply: it waits");
    assert_eq!(find(&snap, &format!("{chat}~ad7056bcab7dacd97")).status, SessionStatus::Waiting);
    for h in &lines[5..] { feed(&mut s, &m, h.clone()); }
    let snap = s.snapshot_at(1793375890000);
    assert_eq!(open_requests(&snap), 0, "the chat went on: nothing waits");
    let helper = find(&snap, &format!("{chat}~ad7056bcab7dacd97"));
    assert_ne!(helper.status, SessionStatus::Waiting);
    assert_ne!(helper.status, SessionStatus::Working, "the silent helper does not work on either");
    assert_eq!(find(&snap, chat).status, SessionStatus::ReplyEnded);
}

/// A helper's question asked while its chat waits on it stays until the helper ends it; and a
/// helper's question delivered late (it began before the chat's reply ended) opens nothing.
#[test] fn a_helpers_question_waits_while_the_chat_waits_on_the_helper() {
    let (mut s, m) = (Store::new(), ClaudeMapper::default());
    let ask = |id: &str| json!({"agent_id": "h1", "tool_name": "AskUserQuestion", "tool_use_id": id, "tool_input": {"questions": [{"question": "Devam?", "options": [{"label": "Evet"}]}]}});
    feed(&mut s, &m, hook("chat", "UserPromptSubmit", 100, json!({})));
    feed(&mut s, &m, hook("chat", "PreToolUse", 110, json!({"tool_name": "Agent", "tool_use_id": "a1"})));
    feed(&mut s, &m, hook("chat", "SubagentStart", 120, json!({"agent_id": "h1"})));
    feed(&mut s, &m, hook("chat", "PreToolUse", 130, ask("q1")));
    // A tool of the chat's own running alongside the helper does not call the question off.
    feed(&mut s, &m, hook("chat", "PreToolUse", 140, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 150, json!({"tool_name": "Read", "tool_use_id": "r1"})));
    assert_eq!(open_requests(&s.snapshot_at(1000)), 1);
    feed(&mut s, &m, hook("chat", "PostToolUse", 2000, json!({"agent_id": "h1", "tool_name": "AskUserQuestion", "tool_use_id": "q1"})));
    feed(&mut s, &m, hook("chat", "SubagentStop", 2100, json!({"agent_id": "h1"})));
    feed(&mut s, &m, hook("chat", "PostToolUse", 2200, json!({"tool_name": "Agent", "tool_use_id": "a1"})));
    feed(&mut s, &m, hook("chat", "Stop", 3000, json!({})));
    assert_eq!(open_requests(&s.snapshot_at(3001)), 0);
    feed(&mut s, &m, hook("chat", "PreToolUse", 2500, ask("q2")));
    assert_eq!(open_requests(&s.snapshot_at(3002)), 0, "late: it began before the reply ended");
}
