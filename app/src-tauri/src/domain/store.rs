use super::*;
use std::collections::{HashMap,HashSet,VecDeque};
use std::time::{SystemTime,UNIX_EPOCH};

fn now()->u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
/// Folder name of a working directory.
fn folder(path:&str)->String { path.trim_end_matches(['\\','/']).rsplit(['\\','/']).next().unwrap_or(path).to_owned() }
/// The name people see: their own, the chat's title, the helper's type, else the folder.
fn refresh_name(s:&mut Session,fallback:Option<&str>){
    let helper=s.parent_key.is_some();
    let name=s.custom_name.clone().or_else(||s.title.clone()).or_else(||s.agent_type.clone().map(|t|format!("Yardımcı · {t}"))).or_else(||helper.then(||"Yardımcı".to_string()))
        .or_else(||fallback.map(str::to_owned)).unwrap_or_else(||if s.project.is_empty(){s.name.clone()}else{folder(&s.project)});
    s.name=name.chars().take(80).collect();
}
/// Claude's own folder for a chat started without a project: no project of the user's.
/// The desktop app's own folder for chats begun without a project (`…\Claude\scratch-workspaces\`, and since late
/// October 2026 `…\Claude-Data\claude_<package id>\scratch-workspaces\`).
pub fn is_scratch(path:&str)->bool{let p=path.replace('/',"\\").to_lowercase();p.find("\\scratch-workspaces\\").is_some_and(|at|{let folder=p[..at].rsplit('\\').next().unwrap_or_default();folder=="claude"||folder.starts_with("claude_")})}
fn norm(path:&str)->String{path.replace('/',"\\").trim_end_matches('\\').to_lowercase()}
/// Where a chat's project is once it works in `cwd`. A chat begun in Claude's scratch
/// folder that goes on working in a folder of the user's has moved into that project;
/// working in a subfolder of its project, or for a while elsewhere, moves nothing, and
/// going up to a folder that holds the project widens it to that folder.
pub fn project_after(root:Option<&str>,cwd:&str)->Option<String>{
    if cwd.is_empty()||is_scratch(cwd){return None;}
    let (here,cwd_n)=(root.map(norm),norm(cwd));
    match here {
        Some(r) if is_scratch(&r) => Some(cwd.trim_end_matches(['\\','/']).to_owned()),
        Some(r) if r.starts_with(&format!("{cwd_n}\\")) => Some(cwd.trim_end_matches(['\\','/']).to_owned()),
        _ => None,
    }
}
/// A chat stays in the office while it has spoken in the last three days.
pub const OFFICE_DAYS:u64=3;
/// The work board keeps 30 days, at most 5000 lines, on this computer only.
pub const LOG_DAYS:u64=30;
pub const LOG_MAX:usize=5000;
/// A board line's description: one short sentence, with anything that looks like a key or
/// token (a long unbroken run of letters and digits) left out.
pub fn board_text(text:&str)->String{
    let words:Vec<&str>=text.split_whitespace().map(|w|{let run=w.chars().filter(|c|c.is_ascii_alphanumeric()||matches!(c,'_'|'-'|'+'|'='|'/')).count();if run>=24&&w.chars().any(|c|c.is_ascii_digit())&&w.chars().any(|c|c.is_ascii_alphabetic()){"…"}else{w}}).collect();
    words.join(" ").chars().take(240).collect()
}
fn empty()->Snapshot { Snapshot {schema_version:1,revision:0,mode:"live".into(),sessions:vec![],requests:vec![],history:vec![],limits:vec![],manager:None,managers:None,office_names:Default::default(),connections:["claude","codex"].iter().map(|p|Connection{provider:(*p).into(),status:"unverified".into(),detail:"Bağlantı henüz doğrulanmadı".into(),verified_version:None}).collect()} }
#[derive(Default)]
struct Runtime { turns:HashSet<String>, tools:HashMap<String,String>, closed_turns:HashSet<String>, last_status_at:u64, forced:Option<SessionStatus> }
pub struct Store { open_rules:HashMap<String,OpenRule>, live:Snapshot, demo:Option<Snapshot>, revision:u64, runtime:HashMap<SessionKey,Runtime>, seen:HashSet<(SessionKey,String)>, order:VecDeque<(SessionKey,String)>, notifications:Vec<HistoryEvent>, names:HashMap<String,String>,
    /// The chats each app lists (not archived), by provider: they stay in the office however quiet.
    listed:HashMap<String,HashSet<String>>,
    /// The work board's lines (oldest first), their ids, and the ids not yet saved.
    log:VecDeque<WorkEntry>, log_ids:HashSet<String>, log_fresh:Vec<String> ,
    /// Questions the user can answer here now (their hook waits): chat and tool call → when the
    /// question passes to the chat's own screen (ms).
    live_asks:HashMap<(SessionKey,String),u64>}
impl Default for Store {fn default()->Self{Self::new()}}
impl Store {
    pub fn new()->Self { Self{open_rules:HashMap::new(),live_asks:HashMap::new(),live:empty(),demo:None,revision:0,runtime:HashMap::new(),seen:HashSet::new(),order:VecDeque::new(),notifications:vec![],names:HashMap::new(),listed:HashMap::new(),log:VecDeque::new(),log_ids:HashSet::new(),log_fresh:vec![]} }
    pub fn restore(mut snapshot:Snapshot)->Self {
        let mut store=Self::new();if snapshot.schema_version!=1 || snapshot.mode!="live" {return store;}
        for s in &mut snapshot.sessions {s.verified=false;if s.parent_key.is_some(){refresh_name(s,None);}if matches!(s.status,SessionStatus::Working|SessionStatus::Waiting){s.status=SessionStatus::Unknown;s.summary="Bağlantı doğrulanmadı · son kayıttan".into();}}
        for r in &mut snapshot.requests {if matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.can_answer=false;r.version+=1;}}
        for c in &mut snapshot.connections {c.status="disconnected".into();c.detail="Yeniden bağlanma bekleniyor".into();}
        store.revision=snapshot.revision;store.live=snapshot;store
    }
    pub fn pending_notifications(&self)->&[HistoryEvent] {&self.notifications}
    pub fn drain_notifications(&mut self)->Vec<HistoryEvent>{std::mem::take(&mut self.notifications)}
    fn bump(&mut self){self.revision+=1;self.live.revision=self.revision;if let Some(d)=&mut self.demo{d.revision=self.revision;}}
    pub fn snapshot(&mut self)->Snapshot {self.snapshot_at(now())}
    pub fn live_snapshot(&self)->Snapshot {self.live.clone()}
    pub fn snapshot_at(&mut self,at:u64)->Snapshot {
        let target=if let Some(d)=&mut self.demo {d}else{&mut self.live};let mut changed=false;
        for r in &mut target.requests {if matches!(r.status,RequestStatus::Pending|RequestStatus::Answering)&&r.expires_at<=at{r.status=RequestStatus::Expired;r.version+=1;r.can_answer=false;changed=true;}}
        if changed {self.recalculate();self.bump();}
        let mut out=self.demo.as_ref().unwrap_or(&self.live).clone();
        self.mark_open(&mut out);
        out
    }
    /// Each provider's rule for opening its chats (see providers); none: its chats get no button.
    pub fn set_open_rule(&mut self,provider:&str,rule:OpenRule){self.open_rules.insert(provider.into(),rule);}
    /// How each chat opens, by its provider's rule; a helper chat opens as the chat it works for.
    fn mark_open(&self,s:&mut Snapshot){
        let owners:Vec<Option<String>>=s.sessions.iter().map(|x|{let owner=x.parent_key.as_ref().and_then(|p|s.sessions.iter().find(|m|&m.key==p)).unwrap_or(x);self.open_rules.get(&owner.key.provider).and_then(|r|r.of(owner)).map(str::to_owned)}).collect();
        for (x,open) in s.sessions.iter_mut().zip(owners){x.open=open;}
    }
    /// Whether the demo office is shown (its offices and chats are not the user's: nothing done to
    /// them is kept).
    pub fn demo_on(&self)->bool {self.demo.is_some()}
    pub fn set_demo(&mut self,enabled:bool)->Snapshot {
        if enabled && self.demo.is_none() {
            let mut value:serde_json::Value=serde_json::from_str(include_str!("../../../src/shared/demo-fixture.json")).expect("bundled demo fixture");
            let time=now() as i64;
            for s in value["sessions"].as_array_mut().unwrap(){s["lastActivity"]=serde_json::json!(time+s["lastActivity"].as_i64().unwrap_or(0));}
            for r in value["requests"].as_array_mut().unwrap(){r["expiresAt"]=serde_json::json!(time+r["expiresAt"].as_i64().unwrap_or(0));}
            for h in value["history"].as_array_mut().unwrap(){h["at"]=serde_json::json!(time+h["at"].as_i64().unwrap_or(0));}
            self.demo=Some(serde_json::from_value(value).expect("valid demo fixture"));
        } else if !enabled {self.demo=None;}
        self.bump();self.snapshot()
    }
    pub fn ingest(&mut self,event:NormalizedEvent)->StoreDelta {
        if !matches!(event.key.provider.as_str(),"claude"|"codex"|"cursor") || event.key.host_id.is_empty()||event.key.session_id.is_empty()||event.event_id.is_empty(){return StoreDelta{revision:self.revision,changed:false};}
        let seen=(event.key.clone(),event.event_id.clone());if !self.seen.insert(seen.clone()){return StoreDelta{revision:self.revision,changed:false};}
        self.order.push_back(seen);while self.order.len()>8192{if let Some(old)=self.order.pop_front(){self.seen.remove(&old);}}
        let index=self.live.sessions.iter().position(|s|s.key==event.key).unwrap_or_else(||{
            self.live.sessions.push(Session{open:None,key:event.key.clone(),name:event.name.clone().unwrap_or_else(||"Oturum".into()),project:event.project.clone().unwrap_or_default(),status:SessionStatus::Unknown,last_activity:event.at,summary:"Durum doğrulanamıyor".into(),parent_key:event.parent_key.clone(),source:"hook".into(),files:vec![],title:None,custom_name:self.names.get(&event.key.session_id).cloned(),agent_type:event.agent_type.clone(),reply:None,link:None,verified:!event.replay,started_at:event.at,root:None,office:None,replied_at:None});self.live.sessions.len()-1
        });
        let recent=event.at>=self.live.sessions[index].last_activity;
        if recent {let s=&mut self.live.sessions[index];s.last_activity=event.at;if !event.replay{s.verified=true;}if let Some(v)=event.project.as_ref(){s.project=v.chars().take(1024).collect();if s.key.provider=="claude"{if let Some(root)=project_after(s.root.as_deref(),v){s.root=Some(root);}}}if let Some(v)=event.summary.as_ref(){s.summary=v.chars().take(320).collect();}if let Some(v)=event.reply.as_ref(){s.reply=Some(v.chars().take(160).collect());}if event.kind==EventKind::TurnEnded{s.replied_at=Some(event.at);}if s.agent_type.is_none(){s.agent_type=event.agent_type.clone();}if s.parent_key.is_none(){s.parent_key=event.parent_key.clone();}refresh_name(s,event.name.as_deref());}
        // Work that began before the chat's last reply ended (an event delivered late) opens nothing.
        let before_reply=self.live.sessions[index].replied_at.is_some_and(|r|event.at<r);
        let rt=self.runtime.entry(event.key.clone()).or_default();
        let turn=event.turn_id.clone().unwrap_or_else(||"unscoped".into());
        let opens=!rt.closed_turns.contains(&turn)&&!before_reply;
        match event.kind {
            EventKind::TurnStarted=>{if opens{rt.turns.insert(turn.clone());if recent{rt.forced=None;}}},
            EventKind::ToolStarted=>{if opens{if let Some(t)=&event.tool_id{rt.tools.insert(t.clone(),turn.clone());}
                // A Claude chat that uses tools is inside a turn even if its start was
                // missed (AgentOffice started later): it works until its reply ends.
                if event.key.provider=="claude"&&!event.replay{rt.turns.insert(turn.clone());}if recent{rt.forced=None;}}},
            EventKind::ToolEnded=>{if let Some(t)=&event.tool_id{rt.tools.remove(t);}},
            EventKind::TurnEnded|EventKind::Interrupted=>{
                rt.turns.remove(&turn);rt.tools.retain(|_,v|v!=&turn);rt.closed_turns.insert(turn.clone());
                if recent{rt.forced=Some(if event.kind==EventKind::Interrupted{SessionStatus::Interrupted}else{SessionStatus::ReplyEnded});}
                for r in &mut self.live.requests {if r.key.session_key==event.key && r.turn_id.as_ref()==Some(&turn) && matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.version+=1;r.can_answer=false;}}
            },
            EventKind::Error=>{if recent{rt.forced=Some(SessionStatus::Error);}},
            EventKind::Idle=>{if recent && rt.turns.is_empty() && rt.tools.is_empty(){rt.forced=Some(SessionStatus::Idle);}},
            EventKind::SessionEnded=>{rt.turns.clear();rt.tools.clear();if recent{rt.forced=Some(SessionStatus::Ended);}for r in &mut self.live.requests{if r.key.session_key==event.key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.version+=1;r.can_answer=false;}}},
            EventKind::ConnectionLost=>{if recent{rt.forced=Some(SessionStatus::Unknown);}for r in &mut self.live.requests{if r.key.session_key==event.key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.version+=1;r.can_answer=false;}}},
            // A request the last shutdown called off is open again when its own record is read
            // again on start (a Codex question waits in the chat across restarts; what closed it
            // since is read right after, in order).
            EventKind::RequestOpened=>{if let Some(mut req)=event.request.clone(){if req.key.session_key==event.key&&!self.parent_moved_on(event.parent_key.as_ref(),event.at)&&matches!(req.kind.as_str(),"permission"|"question"){req.status=RequestStatus::Pending;match self.live.requests.iter_mut().find(|r|r.key==req.key){None=>self.live.requests.push(req),Some(old) if event.replay&&old.status==RequestStatus::Cancelled=>{req.version=old.version+1;*old=req;},Some(_)=>{}}}}},
            EventKind::RequestClosed=>{if let Some(req)=event.request.as_ref(){self.close_request(&req.key,RequestStatus::Resolved);}},
            EventKind::FileChanged=>{if let Some(change)=event.file_change.clone(){let files=&mut self.live.sessions[index].files;if let Some(old)=files.iter_mut().find(|f|f.path==change.path){*old=change;}else{files.push(change);}}},
            EventKind::SessionStarted=>{},
            // A turn read again from its record and now seen live no longer says it is unverified.
            EventKind::Active=>{let s=&mut self.live.sessions[index];if recent&&!rt.turns.is_empty()&&s.summary.contains("doğrulanmadı"){s.summary="Görev çalışıyor".into();}},
        }
        if event.parent_key.is_none()&&matches!(event.kind,EventKind::TurnStarted|EventKind::TurnEnded|EventKind::Interrupted|EventKind::SessionEnded){self.release_helpers(&event.key,event.at);}
        let rt=self.runtime.entry(event.key.clone()).or_default();if recent{rt.last_status_at=event.at;}
        if let Some(kind)=match event.kind{EventKind::TurnEnded=>Some("replyEnded"),EventKind::Error=>Some("error"),EventKind::RequestOpened=>event.request.as_ref().map(|r|r.kind.as_str()),_=>None}{
            if !event.replay {let history=HistoryEvent{id:serde_json::to_string(&(event.key.clone(),event.event_id.clone())).unwrap_or_default(),session_key:event.key.clone(),kind:kind.into(),title:self.live.sessions[index].name.clone(),at:event.at};self.notifications.push(history.clone());self.live.history.push(history);if self.live.history.len()>500{self.live.history.remove(0);}}
        }
        // The work board: a chat's reply, a question or permission it (or its helper) asked, an
        // error or a stop, written now with the office the chat is in now. A helper's own reply
        // is its chat's business, not a line of the board.
        let line=match event.kind{EventKind::TurnEnded if event.parent_key.is_none()=>Some(("reply",event.reply.clone().unwrap_or_default())),EventKind::RequestOpened=>event.request.as_ref().map(|r|(if r.kind=="question"{"question"}else{"permission"},r.title.clone())),EventKind::Error=>Some(("error",event.summary.clone().unwrap_or_default())),EventKind::Interrupted if event.parent_key.is_none()=>Some(("stopped",String::new())),_=>None};
        if let Some((kind,text))=line {let id=serde_json::to_string(&(event.key.clone(),event.event_id.clone())).unwrap_or_default();self.log_line(id,&event.parent_key.clone().unwrap_or(event.key.clone()),kind,&text,event.at);}
        self.recalculate();self.bump();StoreDelta{revision:self.revision,changed:true}
    }
    /// Whether a helper's chat ended a reply after this moment: a helper's event from before
    /// that (delivered late) opens no request.
    fn parent_moved_on(&self,parent:Option<&SessionKey>,at:u64)->bool{
        parent.and_then(|p|self.live.sessions.iter().find(|s|&s.key==p)).and_then(|s|s.replied_at).is_some_and(|r|at<r)
    }
    /// A helper's question or permission is over once its chat has moved on (a new turn, or the
    /// reply ended) and the helper said nothing since: it was called off, or the helper was let go
    /// without a word (no tool result, no stop). Only one whose hook still holds it waits on.
    fn release_helpers(&mut self,parent:&SessionKey,at:u64){
        let helpers:Vec<SessionKey>=self.live.sessions.iter().filter(|s|s.parent_key.as_ref()==Some(parent)&&s.last_activity<=at).map(|s|s.key.clone()).collect();
        for key in helpers {
            let mut stale=false;
            for r in &mut self.live.requests {if r.key.session_key==key&&r.hold_until.is_none()&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.version+=1;r.can_answer=false;stale=true;}}
            if !stale {continue;}
            let rt=self.runtime.entry(key.clone()).or_default();rt.turns.clear();rt.tools.clear();rt.forced=Some(SessionStatus::ReplyEnded);
            if let Some(s)=self.live.sessions.iter_mut().find(|s|s.key==key){s.summary="İşini bitirdi".into();}
        }
    }
    fn recalculate(&mut self){
        // A question is answerable here exactly while its hook waits for the answer.
        for r in &mut self.live.requests {
            if r.kind!="question"||!matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){continue;}
            let live=r.tool_id.as_ref().and_then(|t|self.live_asks.get(&(r.key.session_key.clone(),t.clone()))).copied();
            if live!=r.hold_until||(live.is_some()!=r.can_answer&&r.status==RequestStatus::Pending){r.can_answer=live.is_some();r.hold_until=live;r.version+=1;}
        }
        for s in &mut self.live.sessions {let waiting=self.live.requests.iter().any(|r|r.key.session_key==s.key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering));if let Some(rt)=self.runtime.get(&s.key){s.status=if matches!(rt.forced,Some(SessionStatus::Error|SessionStatus::Unknown|SessionStatus::Ended)){rt.forced.clone().unwrap()}else if waiting{SessionStatus::Waiting}else if !rt.turns.is_empty()||!rt.tools.is_empty(){SessionStatus::Working}else{rt.forced.clone().unwrap_or(SessionStatus::Unknown)};}}
    }
    /// Real title, link, archive state and last reply of a Claude chat (desktop app files or
    /// transcript). An archived chat leaves the office with its helpers and requests.
    pub fn apply_meta(&mut self,session_id:&str,title:Option<String>,link:Option<String>,archived:bool,reply:Option<String>)->bool{
        let Some(i)=self.live.sessions.iter().position(|s|s.key.provider=="claude"&&s.key.session_id==session_id) else {return false};
        if archived {let key=self.live.sessions[i].key.clone();self.live.sessions.retain(|s|s.key!=key&&s.parent_key.as_ref()!=Some(&key));self.live.requests.retain(|r|r.key.session_key!=key);self.bump();return true;}
        let s=&mut self.live.sessions[i];let before=(s.title.clone(),s.link.clone(),s.reply.clone(),s.name.clone());
        if title.is_some(){s.title=title;}if link.is_some(){s.link=link;}if reply.is_some(){s.reply=reply;}refresh_name(s,None);
        let changed=before!=(s.title.clone(),s.link.clone(),s.reply.clone(),s.name.clone());if changed{self.bump();}changed
    }
    /// A chat found at startup in its transcript, before any live event: answered chats are
    /// idle; open ones count as working only if the transcript moved in the last 3 minutes,
    /// otherwise their connection is not verified. A chat restored from the saved office and
    /// not seen live since takes the transcript's verdict even when the last saved event is a
    /// moment newer than the transcript's last line.
    pub fn seed(&mut self,key:SessionKey,project:Option<String>,title:Option<String>,reply:Option<String>,answered:bool,last_at:u64,at:u64){
        let fresh=at.saturating_sub(last_at)<3*60*1000;
        let (status,summary,verified)=if answered{(SessionStatus::ReplyEnded,"Yanıt verdi".to_string(),true)}else if fresh{(SessionStatus::Working,"Çalışıyor".to_string(),true)}else{(SessionStatus::Unknown,"Bağlantı doğrulanmadı · son kayıttan".to_string(),false)};
        if let Some(s)=self.live.sessions.iter_mut().find(|s|s.key==key){
            if s.last_activity<=last_at||!s.verified{s.status=status;s.summary=summary;s.verified=verified;s.last_activity=s.last_activity.max(last_at);}
            if answered&&s.replied_at.is_none_or(|r|r<last_at){s.replied_at=Some(last_at);}
            if title.is_some(){s.title=title;}if reply.is_some(){s.reply=reply;}refresh_name(s,None);
        } else {
            let mut s=Session{open:None,key:key.clone(),name:String::new(),project:project.unwrap_or_default(),status,last_activity:last_at,summary,parent_key:None,source:"transcript".into(),files:vec![],title,custom_name:self.names.get(&key.session_id).cloned(),agent_type:None,reply,link:None,verified,started_at:last_at,root:None,office:None,replied_at:answered.then_some(last_at)};
            refresh_name(&mut s,None);self.live.sessions.push(s);
        }
        self.bump();
    }
    /// The project folder a chat started in. The Claude app's own record is authoritative;
    /// a folder worked out from the transcript only fills a gap.
    pub fn set_root(&mut self,session_id:&str,root:Option<String>,authoritative:bool)->bool{
        let Some(root)=root.filter(|r|!r.is_empty()) else {return false};
        let Some(s)=self.live.sessions.iter_mut().find(|s|s.key.provider=="claude"&&s.key.session_id==session_id) else {return false};
        if !authoritative&&s.root.is_some(){return false;}
        // The scratch folder a chat began in never takes back a project it has moved into.
        if is_scratch(&root)&&s.root.as_deref().is_some_and(|r|!is_scratch(r)){return false;}
        // Begun in the scratch folder but already working in a folder of the user's: that is its project.
        let root=if is_scratch(&root){project_after(Some(&root),&s.project).unwrap_or(root)}else{root};
        if s.root.as_deref()==Some(root.as_str()){return false;}
        s.root=Some(root);self.bump();true
    }
    /// Whether the office already has this chat (a listed chat is only seeded when it has not).
    pub fn knows(&self,key:&SessionKey)->bool{self.live.sessions.iter().any(|s|&s.key==key)}
    /// A chat as its own app lists it (Codex): its name there, and the project it is
    /// filed under (folder and name; no folder outside any project).
    pub fn apply_app(&mut self,key:&SessionKey,title:Option<String>,root:Option<String>,office:Option<String>)->bool{
        let Some(s)=self.live.sessions.iter_mut().find(|s|&s.key==key) else {return false};
        let title=title.filter(|t|!t.trim().is_empty()).or(s.title.clone());
        if s.title==title&&s.root==root&&s.office==office{return false;}
        s.title=title;s.root=root;s.office=office;refresh_name(s,None);self.bump();true
    }
    /// The chats an app lists now (not archived). A chat it listed before, or a Claude
    /// desktop chat (it has a link), that it no longer lists was archived or deleted
    /// there and leaves the office with its helpers and requests. An empty list (the
    /// app's records could not be read) removes nothing.
    pub fn set_listed(&mut self,provider:&str,ids:HashSet<String>)->bool{
        if ids.is_empty(){return false;}
        let before=self.listed.remove(provider).unwrap_or_default();
        let gone:HashSet<SessionKey>=self.live.sessions.iter().filter(|s|s.key.provider==provider&&s.parent_key.is_none()&&!ids.contains(&s.key.session_id)&&(before.contains(&s.key.session_id)||s.link.is_some())).map(|s|s.key.clone()).collect();
        self.listed.insert(provider.to_owned(),ids);
        if gone.is_empty(){return false;}
        self.live.sessions.retain(|s|!gone.contains(&s.key)&&s.parent_key.as_ref().is_none_or(|p|!gone.contains(p)));
        self.live.requests.retain(|r|!gone.contains(&r.key.session_key));
        self.bump();true
    }
    /// Each office's manager (office key → chat), as the user chose them; an office not in
    /// the map has none. Replaces the former single manager. Saved with the office.
    pub fn set_managers(&mut self,managers:std::collections::BTreeMap<String,String>)->bool{
        if self.live.managers.as_ref()==Some(&managers)&&self.live.manager.is_none(){return false;}
        self.live.managers=Some(managers);self.live.manager=None;self.bump();true
    }
    /// The name the user gives an office (None: back to its folder's name). Saved with the office.
    pub fn set_office_name(&mut self,office:String,name:Option<String>)->bool{
        let name=name.map(|n|n.trim().chars().take(40).collect::<String>()).filter(|n|!n.is_empty());
        if self.live.office_names.get(&office)==name.as_ref(){return false;}
        match name {Some(n)=>{self.live.office_names.insert(office,n);},None=>{self.live.office_names.remove(&office);}}
        self.bump();true
    }
    /// The user's own name for a session (None clears it), kept across restarts by the caller.
    pub fn rename(&mut self,session_id:&str,name:Option<String>)->bool{
        let name=name.map(|n|n.trim().chars().take(60).collect::<String>()).filter(|n|!n.is_empty());
        match &name {Some(n)=>{self.names.insert(session_id.to_owned(),n.clone());},None=>{self.names.remove(session_id);}}
        let mut changed=false;for s in self.live.sessions.iter_mut().filter(|s|s.key.session_id==session_id){s.custom_name=name.clone();refresh_name(s,None);changed=true;}
        if changed{self.bump();}changed
    }
    pub fn set_names(&mut self,names:HashMap<String,String>){self.names=names;for s in &mut self.live.sessions{s.custom_name=self.names.get(&s.key.session_id).cloned();refresh_name(s,None);}}
    pub fn names(&self)->&HashMap<String,String>{&self.names}
    /// Drops what no longer belongs in the office: sessions silent for three days (unless
    /// their app still lists them), closed ones after 15 minutes, helpers whose main
    /// session is gone, and their requests.
    pub fn prune(&mut self,at:u64)->bool{
        let before=self.live.sessions.len();
        let listed=&self.listed;
        self.live.sessions.retain(|s|(at.saturating_sub(s.last_activity)<OFFICE_DAYS*24*3600*1000||listed.get(&s.key.provider).is_some_and(|ids|ids.contains(&s.key.session_id)))&&!(s.status==SessionStatus::Ended&&at.saturating_sub(s.last_activity)>15*60*1000));
        let keys:HashSet<SessionKey>=self.live.sessions.iter().map(|s|s.key.clone()).collect();
        self.live.sessions.retain(|s|s.parent_key.as_ref().is_none_or(|p|keys.contains(p)));
        let keys:HashSet<SessionKey>=self.live.sessions.iter().map(|s|s.key.clone()).collect();
        self.live.requests.retain(|r|keys.contains(&r.key.session_key)||!matches!(r.status,RequestStatus::Pending|RequestStatus::Answering));
        let changed=self.live.sessions.len()!=before;if changed{self.bump();}changed
    }
    /// Adds a line to the work board for this chat as it is now (name, office, link), once per
    /// event however often the event is read again; lines older than the board keeps are not added.
    fn log_line(&mut self,id:String,owner:&SessionKey,kind:&str,text:&str,at:u64){
        if self.log_ids.contains(&id)||at+LOG_DAYS*24*3600*1000<now(){return;}
        let Some(s)=self.live.sessions.iter().find(|s|&s.key==owner) else {return};
        let link=if s.key.provider=="codex"{Some(format!("codex://threads/{}",s.key.session_id))}else{s.link.clone()};
        let entry=WorkEntry{id:id.clone(),at,provider:s.key.provider.clone(),session_id:s.key.session_id.clone(),chat:s.name.clone(),root:s.root.clone(),office:s.office.clone(),project:s.project.clone(),kind:kind.into(),text:board_text(text),link};
        self.log_ids.insert(id.clone());self.log_fresh.push(id);
        let pos=self.log.iter().rposition(|e|e.at<=at).map_or(0,|i|i+1);self.log.insert(pos,entry);
        self.trim_log(now());
    }
    fn trim_log(&mut self,at:u64){
        let oldest=at.saturating_sub(LOG_DAYS*24*3600*1000);
        while self.log.front().is_some_and(|e|e.at<oldest)||self.log.len()>LOG_MAX{if let Some(e)=self.log.pop_front(){self.log_ids.remove(&e.id);}}
    }
    /// A Claude reply's first sentence, known once its transcript is read just after the reply
    /// ended: it describes that reply's line (only while the line has no description yet).
    pub fn describe_reply(&mut self,session_id:&str,text:&str)->bool{
        let Some(e)=self.log.iter_mut().rev().find(|e|e.session_id==session_id&&e.provider=="claude") else {return false};
        if e.kind!="reply"||!e.text.is_empty(){return false;}
        e.text=board_text(text);true
    }
    /// A Claude chat still counted as working whose own transcript says its reply ended, with
    /// nothing after it: the reply's event was lost or arrived out of order, so the chat is not
    /// working (the transcript is the chat's own record). Its next tool or prompt opens a turn again.
    /// A question the chat's own transcript shows still waiting (Claude). It is shown when nothing
    /// else from that chat waits: a restart calls off the one its hook opened, and the hook only
    /// speaks again after the answer. It is over once the transcript has the answer, or when the
    /// hook shows the same question itself.
    pub fn transcript_question(&mut self,key:&SessionKey,ask:Option<(&str,&str,&str,u64)>)->bool{
        let id=|t:&str|format!("ask:{t}");
        let hooked=|title:&str,requests:&[PendingRequest]|requests.iter().any(|r|&r.key.session_key==key&&!r.key.request_id.starts_with("ask:")&&r.title==title&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering));
        let mut changed=false;let mut answered=false;
        let others:Vec<PendingRequest>=self.live.requests.clone();
        for r in &mut self.live.requests {
            if &r.key.session_key!=key||!r.key.request_id.starts_with("ask:")||!matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){continue;}
            if ask.is_none_or(|(t,..)|r.key.request_id!=id(t))||hooked(&r.title,&others){r.status=RequestStatus::Resolved;r.version+=1;r.can_answer=false;changed=true;answered=true;}
        }
        if let Some((tool,title,detail,at))=ask {
            let waiting=self.live.requests.iter().any(|r|&r.key.session_key==key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering));
            if !waiting&&self.knows(key) {
                let rk=RequestKey{session_key:key.clone(),request_id:id(tool)};
                let mut req=PendingRequest{key:rk.clone(),version:1,turn_id:None,kind:"question".into(),title:title.into(),detail:detail.into(),options:vec![],expires_at:at+7*24*3600*1000,status:RequestStatus::Pending,can_answer: false, tool_id: Some(tool.to_owned()), questions: vec![], hold_until: None, outcome: None};
                match self.live.requests.iter_mut().find(|r|r.key==rk){None=>self.live.requests.push(req),Some(old)=>{req.version=old.version+1;*old=req;}}
                // The transcript is the proof: the chat waits for the user now.
                self.runtime.entry(key.clone()).or_default();
                if let Some(s)=self.live.sessions.iter_mut().find(|s|&s.key==key){s.verified=true;s.summary="Seni bekliyor".into();}
                changed=true;
            }
        }
        // Answered: the chat goes on with the answer until its reply ends.
        if answered&&!self.live.requests.iter().any(|r|&r.key.session_key==key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering)){
            let rt=self.runtime.entry(key.clone()).or_default();if rt.turns.is_empty()&&rt.tools.is_empty(){rt.forced=Some(SessionStatus::Working);}
        }
        if changed{self.recalculate();self.bump();}changed
    }
    pub fn settle_reply(&mut self,session_id:&str,ended_at:u64)->bool{
        let Some(s)=self.live.sessions.iter_mut().find(|s|s.key.provider=="claude"&&s.parent_key.is_none()&&s.key.session_id==session_id&&s.status==SessionStatus::Working) else {return false};
        let key=s.key.clone();
        s.summary="Yanıt verdi".into();if s.replied_at.is_none_or(|r|r<ended_at){s.replied_at=Some(ended_at);}
        let rt=self.runtime.entry(key).or_default();
        rt.turns.clear();rt.tools.clear();rt.forced=Some(SessionStatus::ReplyEnded);
        self.recalculate();
        if let Some(s)=self.live.sessions.iter_mut().find(|s|s.key.provider=="claude"&&s.key.session_id==session_id&&s.parent_key.is_none()){if s.status==SessionStatus::Working{s.status=SessionStatus::ReplyEnded;}}
        self.bump();true
    }
    /// The lines added since the last call (to append to the saved board).
    pub fn take_fresh_log(&mut self)->Vec<WorkEntry>{
        let fresh:HashSet<String>=std::mem::take(&mut self.log_fresh).into_iter().collect();
        self.log.iter().filter(|e|fresh.contains(&e.id)).cloned().collect()
    }
    /// The board as saved: oldest first, without duplicates or lines past what it keeps.
    pub fn load_log(&mut self,entries:Vec<WorkEntry>,at:u64){
        for e in entries{if self.log_ids.insert(e.id.clone()){self.log.push_back(e);}}
        let mut sorted:Vec<WorkEntry>=self.log.drain(..).collect();sorted.sort_by_key(|e|e.at);self.log=sorted.into();
        self.trim_log(at);
    }
    pub fn log_entries(&self)->Vec<WorkEntry>{self.log.iter().cloned().collect()}
    /// The source app is not running: none of its chats can be working or waiting now, so
    /// they are said to be unverified (never shown as live) and their requests are over.
    /// `only`: limit to these chats (Claude: the desktop app's own chats).
    pub fn source_lost(&mut self,provider:&str,only:Option<&dyn Fn(&Session)->bool>)->bool{
        let keys:Vec<SessionKey>=self.live.sessions.iter().filter(|s|s.key.provider==provider&&matches!(s.status,SessionStatus::Working|SessionStatus::Waiting)).filter(|s|{let owner=s.parent_key.as_ref().and_then(|p|self.live.sessions.iter().find(|m|&m.key==p)).unwrap_or(s);only.is_none_or(|f|f(owner))}).map(|s|s.key.clone()).collect();
        let mut changed=false;
        for key in &keys {
            let rt=self.runtime.entry(key.clone()).or_default();rt.turns.clear();rt.tools.clear();rt.forced=Some(SessionStatus::Unknown);
            if let Some(s)=self.live.sessions.iter_mut().find(|s|&s.key==key){s.verified=false;s.summary="Kaynak uygulama kapalı · durum doğrulanmadı".into();}
            for r in &mut self.live.requests{if &r.key.session_key==key&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.status=RequestStatus::Cancelled;r.version+=1;r.can_answer=false;}}
        }
        if !keys.is_empty(){changed=true;self.recalculate();for key in &keys{if let Some(s)=self.live.sessions.iter_mut().find(|s|&s.key==key){s.status=SessionStatus::Unknown;}}}
        if changed{self.bump();}changed
    }
    pub fn revision(&self)->u64{self.revision}
    /// Keeps the newest reading per provider; an older reading never replaces a newer one.
    pub fn set_limits(&mut self,limits:ProviderLimits)->bool{match self.live.limits.iter_mut().find(|l|l.provider==limits.provider){Some(old) if old.updated_at>=limits.updated_at=>false,Some(old)=>{*old=limits;self.bump();true},None=>{self.live.limits.push(limits);self.bump();true}}}
    /// Marks a provider verified by an event that actually arrived from it.
    pub fn mark_connected(&mut self,provider:&str,detail:&str){match self.live.connections.iter_mut().find(|c|c.provider==provider){Some(c)=>{if c.status!="connected"||c.detail!=detail{c.status="connected".into();c.detail=detail.into();self.bump();}},None=>{self.live.connections.push(Connection{provider:provider.into(),status:"connected".into(),detail:detail.into(),verified_version:None});self.bump();}}}
    pub fn close_request(&mut self,key:&RequestKey,status:RequestStatus){if let Some(r)=self.live.requests.iter_mut().find(|r|&r.key==key){if status==RequestStatus::Resolved&&r.outcome.is_none()&&matches!(r.status,RequestStatus::Pending|RequestStatus::Answering){r.outcome=Some("elsewhere".into());}r.status=status;r.can_answer=false;r.version+=1;}self.recalculate();self.bump();}
    /// A question's hook waits for an answer from here (`hold_until`: when it passes to the chat's
    /// own screen) or no longer does (None: answered, handed back, or the hook ended).
    pub fn set_live_ask(&mut self,key:&SessionKey,tool_id:&str,hold_until:Option<u64>)->bool{
        let id=(key.clone(),tool_id.to_owned());
        let changed=match hold_until{Some(t)=>self.live_asks.insert(id,t)!=Some(t),None=>self.live_asks.remove(&id).is_some()};
        if hold_until.is_none(){for r in &mut self.live.requests{if &r.key.session_key==key&&r.tool_id.as_deref()==Some(tool_id)&&r.status==RequestStatus::Pending&&r.outcome.is_none(){r.outcome=Some("released".into());r.version+=1;}}}
        if changed{self.recalculate();self.bump();}changed
    }
    /// The answerable question asked by this tool call in this chat, if it is still pending.
    pub fn live_question(&self,key:&RequestKey)->Option<PendingRequest>{self.live.requests.iter().find(|r|&r.key==key&&r.can_answer&&r.status==RequestStatus::Pending).cloned()}
    /// Starts handing over an answer typed here: the request is "being sent" (a second click, or
    /// a stale card, gets `Stale`). Only a question whose hook waits can be answered.
    pub fn begin_live_answer(&mut self,key:&RequestKey,version:u64,at:u64)->Result<(String,u64),AnswerResult>{
        let r=self.live.requests.iter_mut().find(|r|&r.key==key).ok_or(AnswerResult::Stale)?;
        if r.version!=version||r.status!=RequestStatus::Pending||r.expires_at<=at{return Err(AnswerResult::Stale);}
        let Some(tool)=r.tool_id.clone().filter(|_|r.can_answer) else {return Err(if r.outcome.as_deref()==Some("released"){AnswerResult::Stale}else{AnswerResult::Unsupported})};
        r.status=RequestStatus::Answering;r.version+=1;let ticket=r.version;self.bump();Ok((tool,ticket))
    }
    pub fn begin_answer_at(&mut self,key:&RequestKey,version:u64,answer:&str,at:u64)->Result<u64,AnswerResult>{
        let target=if let Some(d)=&mut self.demo{d}else{&mut self.live};
        let r=target.requests.iter_mut().find(|r|&r.key==key).ok_or(AnswerResult::Stale)?;
        if r.version!=version||r.status!=RequestStatus::Pending||r.expires_at<=at{return Err(AnswerResult::Stale);}
        if !r.can_answer{return Err(AnswerResult::Unsupported);}if !r.options.iter().any(|a|a==answer){return Err(AnswerResult::Failed);}
        r.status=RequestStatus::Answering;r.version+=1;let ticket=r.version;self.bump();Ok(ticket)
    }
    pub fn finish_answer_at(&mut self,key:&RequestKey,ticket:u64,delivered:bool,at:u64)->AnswerResult{
        let demo_mode=self.demo.is_some();
        let target=if let Some(d)=&mut self.demo{d}else{&mut self.live};
        let Some(r)=target.requests.iter_mut().find(|r|&r.key==key)else{return AnswerResult::Stale;};
        if r.version!=ticket||r.status!=RequestStatus::Answering||r.expires_at<=at{return AnswerResult::Stale;}
        r.status=if delivered{RequestStatus::Resolved}else{RequestStatus::Cancelled};r.version+=1;r.can_answer=false;r.outcome=Some(if delivered{"delivered"}else{"failed"}.into());
        if let Some(s)=target.sessions.iter_mut().find(|s|s.key==key.session_key){s.status=if delivered{SessionStatus::Working}else{SessionStatus::Unknown};s.summary=if demo_mode{"Örnek yanıt uygulandı · Gerçek araca gönderilmedi"}else if delivered{"Yanıt kaynak araca teslim edildi"}else{"Yanıt teslim edilemedi · Durum doğrulanamıyor"}.into();s.last_activity=at;}
        self.recalculate();self.bump();if delivered{AnswerResult::Delivered}else{AnswerResult::Disconnected}
    }
    pub fn answer_request(&mut self,key:RequestKey,version:u64,answer:String)->AnswerResult{
        if self.demo.is_none(){return AnswerResult::Unsupported;}
        let at=now();match self.begin_answer_at(&key,version,&answer,at){Ok(ticket)=>self.finish_answer_at(&key,ticket,true,at),Err(e)=>e}
    }
}
