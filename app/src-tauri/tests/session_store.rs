use agentoffice_lib::domain::*;

fn key(n:usize)->SessionKey { SessionKey{provider:if n%2==0{"claude"}else{"codex"}.into(),host_id:"test-local".into(),session_id:format!("session-{n}")} }
fn event(n:usize,id:&str,kind:EventKind,at:u64,turn:&str)->NormalizedEvent {
    NormalizedEvent { key:key(n),event_id:id.into(),kind,at,turn_id:Some(turn.into()),project:Some("Same project".into()),name:Some(format!("Worker {n}")),..Default::default() }
}
#[test] fn twelve_interleaved_sessions(){
    let mut s=Store::new();for n in 0..12{s.ingest(event(n,"start",EventKind::TurnStarted,100,"t1"));}
    s.ingest(event(0,"stop",EventKind::TurnEnded,110,"t1"));
    let view=s.snapshot_at(120);assert_eq!(view.sessions.len(),12);
    assert_eq!(view.sessions.iter().filter(|s|s.status==SessionStatus::Working).count(),11);
    assert_eq!(view.sessions.iter().find(|s|s.key==key(0)).unwrap().status,SessionStatus::ReplyEnded);
}
#[test] fn silent_tool_does_not_finish(){
    let mut s=Store::new();s.ingest(event(0,"start",EventKind::TurnStarted,100,"t1"));
    let mut e=event(0,"tool",EventKind::ToolStarted,110,"t1");e.tool_id=Some("render".into());s.ingest(e);
    assert_eq!(s.snapshot_at(7_200_110).sessions[0].status,SessionStatus::Working);
}
#[test] fn stop_of_old_turn_does_not_close_new_turn(){
    let mut s=Store::new();s.ingest(event(0,"first",EventKind::TurnStarted,100,"t1"));s.ingest(event(0,"second",EventKind::TurnStarted,110,"t2"));
    s.ingest(event(0,"old-stop",EventKind::TurnEnded,120,"t1"));assert_eq!(s.snapshot_at(130).sessions[0].status,SessionStatus::Working);
}
#[test] fn dedupe_and_restore_are_silent(){
    let mut s=Store::new();s.ingest(event(0,"start",EventKind::TurnStarted,100,"t1"));let done=event(0,"done",EventKind::TurnEnded,110,"t1");
    s.ingest(done.clone());s.ingest(done);assert_eq!(s.snapshot_at(120).history.len(),1);
    let restored=Store::restore(s.snapshot_at(120));assert_eq!(restored.pending_notifications().len(),0);
}
#[test] fn disconnected_retains_last_activity_without_inventing_success(){
    let mut s=Store::new();s.ingest(event(0,"start",EventKind::TurnStarted,100,"t1"));s.ingest(event(0,"lost",EventKind::ConnectionLost,200,"t1"));
    let v=s.snapshot_at(300);assert_eq!(v.sessions[0].status,SessionStatus::Unknown);assert_eq!(v.sessions[0].last_activity,200);assert!(v.history.is_empty());
}
#[test] fn demo_is_explicit_and_does_not_hide_live_sessions(){
    let mut s=Store::new();assert_eq!(s.snapshot().mode,"live");s.ingest(event(0,"start",EventKind::TurnStarted,100,"t1"));
    assert_eq!(s.set_demo(true).sessions.len(),20);let live=s.set_demo(false);assert_eq!(live.sessions.len(),1);assert_eq!(live.sessions[0].key,key(0));
}
#[test] fn source_cannot_supply_unsupported_provider(){
    let mut s=Store::new();let mut e=event(0,"bad",EventKind::TurnEnded,100,"t1");e.key.provider="windows-mail".into();s.ingest(e);assert!(s.snapshot().history.is_empty());assert!(s.snapshot().sessions.is_empty());
}
