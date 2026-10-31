import { resolveLanguage, t } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AnswerResult, Bridge, DocName, Lyrics, MediaSession, ShelfFile, Sign, SignKind, Reminder, PageId, MonitorInfo, NotifyPrefs, NotifyResult, RequestKey, SessionKey, Settings, Snapshot, WorkEntry, IslandStatus, WeatherPlace, ToolsState } from './contract';
import { DEFAULT_SETTINGS } from './settings';
import { geocodeUrl, placesOf } from './places';
import { requestId, sessionId } from './contract';
import { createDemoSnapshot, emptySnapshot } from './demo';

export function isNative():boolean { return '__TAURI_INTERNALS__' in window; }
export function createBridge():Bridge {
  if(isNative()) return {
    getSnapshot:()=>invoke<Snapshot>('get_snapshot'),
    subscribe: async cb=>listen<Snapshot>('snapshot',event=>cb(event.payload)),
    setDemo:enabled=>invoke('set_demo',{enabled}),
    answer:(key,version,answers)=>invoke<AnswerResult>('answer_request',{key,version,answers}),
    releaseRequest:key=>invoke<boolean>('release_request',{key}),
    lyrics:track=>invoke<Lyrics>('lyrics',track),
    openOffice:key=>invoke('open_office',{key:key??null}),
    resizeNotch:expanded=>invoke('resize_notch',{expanded}),
    showNotch:()=>invoke('show_notch'),
    pinNotch:pinned=>invoke('set_notch_pinned',{pinned}),
    onNotchReveal:async cb=>listen<{holdMs:number;inside:boolean;alert?:boolean;page?:PageId|null}>('notch-reveal',event=>cb(event.payload)),
    onNotchPointer:async cb=>listen<boolean>('notch-pointer',event=>cb(event.payload)),
    onNotchPinned:async cb=>listen<boolean>('notch-pinned',event=>cb(event.payload)),
    setLimitsPanel:open=>invoke('set_limits_panel',{open}),
    notchShape:(rects,moving,area)=>invoke('notch_shape',{rects,moving:!!moving,area:area??null}),
    onNotchLayout:async cb=>listen<{side:'left'|'right'}>('notch-layout',event=>cb(event.payload)),
    onNotchDock:async cb=>listen<'capsule'|'line'|'hidden'>('notch-dock',event=>cb(event.payload)),
    notchMove:action=>invoke('notch_move',{action}),
    notchAutoHide:()=>invoke<boolean>('notch_autohide'),
    setNotchAutoHide:enabled=>invoke('set_notch_autohide',{enabled}),
    notchInScreenshots:()=>invoke<boolean>('notch_in_screenshots'),
    setNotchInScreenshots:enabled=>invoke('set_notch_in_screenshots',{enabled}),
    onLimitsPanel:async cb=>listen<{open:boolean;side:'left'|'right'}>('limits-panel',event=>cb(event.payload)),
    renameSession:(sessionId,name)=>invoke('rename_session',{sessionId,name}),
    openInSource:sessionId=>invoke<boolean>('open_in_source',{sessionId}),
    setMuted:muted=>invoke('set_muted',{muted}),
    getWorkLog:()=>invoke<WorkEntry[]>('get_work_log'),
    onWorkLog:async cb=>listen<WorkEntry[]>('work-log',event=>cb(event.payload)),
    notifyPrefs:()=>invoke<NotifyPrefs>('notify_prefs'),
    setNotchAlerts:enabled=>invoke('set_notch_alerts',{enabled}),
    onChime:async cb=>listen('chime',()=>cb()),
    getSettings:()=>invoke<Settings>('get_settings'),
    setSettings:patch=>invoke<Settings>('set_settings',{patch}),
    onSettings:async cb=>listen<Settings>('settings',event=>cb(event.payload)),
    playChime:(volume,sound)=>invoke('play_chime',{volume:volume??null,sound:sound??null}),
    shelfInfo:paths=>invoke<ShelfFile[]>('shelf_info',{paths}),
    shelfOpen:path=>invoke('shelf_open',{path}),
    shelfReveal:path=>invoke('shelf_reveal',{path}),
    shelfDrag:paths=>invoke<boolean>('shelf_drag',{paths}),
    shelfPick:()=>invoke<string[]>('shelf_pick'),
    shelfOpenWith:path=>invoke('shelf_open_with',{path}),
    indicatorsSupported:()=>invoke<SignKind[]>('indicators_supported'),
    onSign:async cb=>listen<Sign>('notch-indicator',event=>cb(event.payload)),
    listMonitors:()=>invoke<MonitorInfo[]>('list_monitors'),
    openSettings:()=>invoke('open_settings'),
    onOpenSettings:async cb=>listen('open-settings',()=>cb()),
    setOfficeManagers:managers=>invoke('set_office_managers',{managers}),
    setOfficeName:(office,name)=>invoke('set_office_name',{office,name}),
    shortcuts:()=>invoke<boolean[]>('shortcuts'),
    claudeHooksStatus:()=>invoke<boolean>('claude_hooks_status'),
    loadDoc:<T,>(name:DocName)=>invoke<T|null>('load_doc',{name}),
    saveDoc:(name,doc)=>invoke('save_doc',{name,doc}),
    onDoc:async cb=>listen<{name:DocName;doc:unknown}>('doc',event=>cb(event.payload)),
    notify:kind=>invoke<NotifyResult>('notify',{kind}),
    autostart:()=>invoke<boolean>('get_autostart'),setAutostart:on=>invoke<boolean>('set_autostart',{on}),toolsState:()=>invoke<ToolsState>('tools_state'),connectTools:()=>invoke<ToolsState>('connect_tools'),connectHooks:tool=>invoke<ToolsState>('connect_hooks',{tool}),disconnectHooks:tool=>invoke<ToolsState>('disconnect_hooks',{tool}),status:()=>invoke<IslandStatus>('get_status'),searchPlaces:query=>invoke<WeatherPlace[]>('search_places',{query}),
    onStatus:async cb=>listen<IslandStatus>('notch-status',event=>cb(event.payload)),
    reminders:()=>invoke<Reminder[]>('reminders'),
    onReminders:async cb=>listen<Reminder[]>('reminders',event=>cb(event.payload)),
    saveReminder:reminder=>invoke<Reminder[]>('save_reminder',{reminder}),
    deleteReminder:id=>invoke<Reminder[]>('delete_reminder',{id}),
    snoozeReminder:(id,minutes)=>invoke<Reminder[]>('snooze_reminder',{id,minutes}),
    dismissReminder:id=>invoke<Reminder[]>('dismiss_reminder',{id}),
    mediaSessions:()=>invoke<MediaSession[]>('media_sessions'),
    onMedia:async cb=>listen<MediaSession[]>('media',event=>cb(event.payload)),
    mediaControl:(id,action)=>invoke<boolean>('media_control',{id,action}),
    mediaSeek:(id,positionMs)=>invoke<boolean>('media_seek',{id,positionMs}),
    setClaudeHooks:enable=>invoke<boolean>('set_claude_hooks',{enable})
  };
  const storageKey='agentoffice-preview-snapshot-v1';
  let state=emptySnapshot();
  try { const saved=JSON.parse(localStorage.getItem(storageKey)||'null'); if(saved?.schemaVersion===1)state=saved; } catch { /* Broken preview data starts empty. */ }
  const callbacks=new Set<(s:Snapshot)=>void>(), pinListeners=new Set<(pinned:boolean)=>void>(), limitListeners=new Set<(state:{open:boolean;side:'left'|'right'})=>void>();
  // The preview's work board and notification choice live in this browser only; a request
  // that appears opens the notch as the app does (once per request, unless turned off).
  const logKey='agentoffice-preview-worklog-v1', logListeners=new Set<(entries:WorkEntry[])=>void>(), revealListeners=new Set<(r:{holdMs:number;inside:boolean;alert?:boolean;page?:PageId|null})=>void>();
  const readLog=():WorkEntry[]=>{ try { const v=JSON.parse(localStorage.getItem(logKey)||'[]'); return Array.isArray(v)?v:[]; } catch { return []; } };
  let prefs:NotifyPrefs={alerts:localStorage.getItem('agentoffice-preview-alerts')!=='off',muted:true,quiet:null};
  const docListeners=new Set<(c:{name:DocName;doc:unknown})=>void>(), mediaListeners=new Set<(m:MediaSession[])=>void>(), remListeners=new Set<(r:Reminder[])=>void>();
  const readRem=():Reminder[]=>{ try { const v=JSON.parse(localStorage.getItem('agentoffice-preview-reminders')||'[]'); return Array.isArray(v)?v:[]; } catch { return []; } };
  const writeRem=(list:Reminder[])=>{ localStorage.setItem('agentoffice-preview-reminders',JSON.stringify(list)); remListeners.forEach(cb=>cb(structuredClone(list))); };
  const readMedia=():MediaSession[]=>{ try { const v=JSON.parse(localStorage.getItem('agentoffice-preview-media')||'[]'); return Array.isArray(v)?v:[]; } catch { return []; } };
  const writeMedia=(list:MediaSession[])=>{ localStorage.setItem('agentoffice-preview-media',JSON.stringify(list)); mediaListeners.forEach(cb=>cb(structuredClone(list))); };
  // What the preview would have notified (tests read it).
  const notified:{kind:string;at:number}[]=[]; (window as unknown as {__notified?:typeof notified}).__notified=notified;
  const settingsKey='agentoffice-preview-settings-v1', settingsListeners=new Set<(s:Settings)=>void>(), openSettingsListeners=new Set<()=>void>();
  const readTools=():ToolsState=>{ try { const v=JSON.parse(localStorage.getItem('agentoffice-preview-tools')||'null'); if(v?.tools) return v; } catch { /* Broken test data: the default. */ } return {tools:{claude:true,codex:true},claude:{state:'off'}}; };
const readSettings=():Settings=>{ try { return {...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem(settingsKey)||'{}')}; } catch { return {...DEFAULT_SETTINGS}; } };
  const pendingIds=(s:Snapshot)=>new Set(s.requests.filter(r=>r.status==='pending').map(r=>requestId(r.key)));
  let announced=pendingIds(state);
  const announce=()=>{ const now=pendingIds(state); const fresh=[...now].some(id=>!announced.has(id)); announced=now; if(fresh&&prefs.alerts&&!prefs.quiet) revealListeners.forEach(cb=>cb({holdMs:10_000,inside:false,alert:true})); };
  const channel=new BroadcastChannel('agentoffice-preview');
  channel.onmessage=e=>{ if(e.data?.type==='work-log'){logListeners.forEach(cb=>cb(e.data.entries));return;} if(e.data?.type==='quiet'){prefs={...prefs,quiet:e.data.quiet};return;} if(e.data?.type==='settings'){settingsListeners.forEach(cb=>cb(e.data.settings));return;} if(e.data?.type==='open-settings'){openSettingsListeners.forEach(cb=>cb());return;} if(e.data?.type==='doc'){docListeners.forEach(cb=>cb({name:e.data.name,doc:e.data.doc}));return;} if(e.data?.schemaVersion===1 && e.data.revision>=state.revision) {state=e.data; callbacks.forEach(cb=>cb(structuredClone(state))); announce();} };
  const publish=()=>{state.revision=Math.max(Date.now(),state.revision+1);localStorage.setItem(storageKey,JSON.stringify(state)); channel.postMessage(state);callbacks.forEach(cb=>cb(structuredClone(state)));announce();};
  return {
    getSnapshot:async()=>structuredClone(state),
    subscribe:async cb=>{ callbacks.add(cb); return ()=>callbacks.delete(cb); },
    setDemo:async enabled=>{state=enabled?createDemoSnapshot(state.revision+1):emptySnapshot(state.revision+1);publish();},
    answer:async(key:RequestKey,version:number,answers:Record<string,string>)=>{
      const answer=Object.values(answers)[0]??'';
      const request=state.requests.find(r=>requestId(r.key)===requestId(key));
      if(!request || request.version!==version || request.status!=='pending' || request.expiresAt<=Date.now()) return 'stale';
      if(state.mode!=='demo' || !request.canAnswer) return 'unsupported';
      if(!request.options.includes(answer) && !request.questions?.some(q=>q.options.some(o=>o.label===answer))) return 'failed';
      request.status='resolved'; request.version++;
      const session=state.sessions.find(s=>sessionId(s.key)===sessionId(key.sessionKey));
      if(session) {session.status='working';session.summary='Örnek yanıt uygulandı · Gerçek araca gönderilmedi';session.lastActivity=Date.now();}
      publish(); return 'delivered';
    },
    releaseRequest:async()=>false,
    lyrics:async()=>({status:'off',lines:[],plain:''}),
    openOffice:async(key?:SessionKey)=>{ if(key)localStorage.setItem('agentoffice-selection',JSON.stringify(key));window.open('/?view=office'+(state.mode==='demo'?'&demo=1':''),'agentoffice-office'); },
    resizeNotch:async()=>{},
    showNotch:async()=>{ window.open('/?view=notch'+(state.mode==='demo'?'&demo=1':''),'agentoffice-notch','popup,width=560,height=344'); },
    pinNotch:async pinned=>{pinListeners.forEach(cb=>cb(pinned));},
    onNotchReveal:async cb=>{revealListeners.add(cb);return()=>revealListeners.delete(cb);},
    onNotchPointer:async()=>()=>{},
    onNotchPinned:async cb=>{pinListeners.add(cb);return()=>pinListeners.delete(cb);},
    setLimitsPanel:async()=>{},
    notchShape:async()=>{},
    onNotchLayout:async()=>()=>{},
    onNotchDock:async()=>()=>{},
    notchMove:async()=>{},
    notchAutoHide:async()=>null,
    setNotchAutoHide:async()=>{throw new Error(t('preview.desktop_only'));},
    notchInScreenshots:async()=>null,
    setNotchInScreenshots:async()=>{throw new Error(t('preview.desktop_only'));},
    onLimitsPanel:async cb=>{limitListeners.add(cb);return()=>limitListeners.delete(cb);},
    renameSession:async(sessionId,name)=>{const s=state.sessions.find(x=>x.key.sessionId===sessionId);if(s){s.customName=name||undefined;s.name=name||s.title||s.name;publish();}},
    openInSource:async()=>false,
    setMuted:async()=>{},
    getWorkLog:async()=>readLog(),
    onWorkLog:async cb=>{logListeners.add(cb);return()=>logListeners.delete(cb);},
    notifyPrefs:async()=>({...prefs}),
    setNotchAlerts:async enabled=>{prefs={...prefs,alerts:enabled};localStorage.setItem('agentoffice-preview-alerts',enabled?'on':'off');},
    onChime:async()=>()=>{},
    getSettings:async()=>readSettings(),
    setSettings:async patch=>{ if(localStorage.getItem('agentoffice-preview-settings-fail')) throw new Error(t('preview.storage_failed')); const next={...readSettings(),...patch} as Settings; localStorage.setItem(settingsKey,JSON.stringify(next)); settingsListeners.forEach(cb=>cb(next)); channel.postMessage({type:'settings',settings:next}); return next; },
    onSettings:async cb=>{settingsListeners.add(cb);return()=>settingsListeners.delete(cb);},
    playChime:async()=>{},
    shelfInfo:async paths=>paths.map(path=>({path,name:path.split(/[\\/]/).pop()||path,exists:true,folder:false,size:0,modified:0})),
    shelfOpen:async()=>{throw new Error(t('preview.opens_in_desktop'));},
    shelfReveal:async()=>{throw new Error(t('preview.opens_in_desktop'));},
    shelfDrag:async()=>false,
    shelfPick:async()=>[],
    shelfOpenWith:async()=>{throw new Error(t('preview.opens_in_desktop'));},
    indicatorsSupported:async()=>[],
    onSign:async()=>()=>{},
    listMonitors:async()=>[{name:'\\.\DISPLAY1',label:'Ekran 1 (1920×1080)',primary:true}],
    openSettings:async()=>{ openSettingsListeners.forEach(cb=>cb()); channel.postMessage({type:'open-settings'}); },
    onOpenSettings:async cb=>{openSettingsListeners.add(cb);return()=>openSettingsListeners.delete(cb);},
    setOfficeManagers:async managers=>{state.managers=managers;delete state.manager;publish();},
    setOfficeName:async(office,name)=>{const names={...(state.officeNames??{})};if(name?.trim())names[office]=name.trim();else delete names[office];state.officeNames=names;publish();},
    shortcuts:async()=>null,
    claudeHooksStatus:async()=>null,
    setClaudeHooks:async()=>{throw new Error(t('preview.claude_link_desktop'));},
    // The island's records live in this browser in the preview; a notification only says
    // what it would do (it never sounds here).
    loadDoc:async<T,>(name:DocName)=>{ try { return JSON.parse(localStorage.getItem(`agentoffice-preview-doc-${name}`)||'null') as T|null; } catch { return null; } },
    saveDoc:async(name,doc)=>{ if(localStorage.getItem('agentoffice-preview-doc-fail')) throw new Error(t('preview.not_saved')); localStorage.setItem(`agentoffice-preview-doc-${name}`,JSON.stringify(doc)); docListeners.forEach(cb=>cb({name,doc})); channel.postMessage({type:'doc',name,doc}); },
    onDoc:async cb=>{docListeners.add(cb);return()=>docListeners.delete(cb);},
    // SAMPLE media in the preview (tests set it); controls change only this sample, never anything real.
    // SAMPLE reminders in the preview: kept in this browser, never timed or rung here.
    // The preview's tools: as a test sets them (agentoffice-preview-tools), else both found, not connected.
    autostart:async()=>localStorage.getItem('agentoffice-preview-autostart')!=='off',
    setAutostart:async on=>{ localStorage.setItem('agentoffice-preview-autostart',on?'on':'off'); return on; },
    toolsState:async()=>readTools(),
    connectHooks:async tool=>{ const now=readTools(); const providers=(now.providers??[]).map(p=>p.id===tool?{...p,link:{state:'on'}}:p); const next={...now,providers}; localStorage.setItem('agentoffice-preview-tools',JSON.stringify(next)); return next; },
    disconnectHooks:async tool=>{ const now=readTools(); const providers=(now.providers??[]).map(p=>p.id===tool?{...p,link:{state:'off'}}:p); const next={...now,providers}; localStorage.setItem('agentoffice-preview-tools',JSON.stringify(next)); return next; },
    connectTools:async()=>{ const now=readTools(); if(localStorage.getItem('agentoffice-preview-connect-fail')) throw new Error(localStorage.getItem('agentoffice-preview-connect-fail')!); const next:ToolsState={...now,claude:{state:now.tools.claude?'on':'absent'}}; localStorage.setItem('agentoffice-preview-tools',JSON.stringify(next)); const s={...readSettings(),setupDone:true}; localStorage.setItem(settingsKey,JSON.stringify(s)); settingsListeners.forEach(cb=>cb(s)); channel.postMessage({type:'settings',settings:s}); return next; },
    status:async()=>{ try { return JSON.parse(localStorage.getItem('agentoffice-preview-status')||'{}'); } catch { return {}; } },
    // The preview asks Open-Meteo itself (it allows pages to); a failed request is "offline", as in the app.
    searchPlaces:async query=>{ if(query.trim().length<2) return []; let answer:unknown; try { const r=await fetch(geocodeUrl(query,resolveLanguage(readSettings().language))); if(!r.ok) throw new Error(); answer=await r.json(); } catch { throw new Error('offline'); } return placesOf(answer); },
    onStatus:async()=>()=>{},
    reminders:async()=>readRem(),
    onReminders:async cb=>{remListeners.add(cb);return()=>remListeners.delete(cb);},
    saveReminder:async r=>{ const list=readRem(); const id=r.id||`r${Date.now()}`; const [d,t]=r.at.split('T'); const [y,mo,da]=d.split('-').map(Number); const [h,mi]=t.split(':').map(Number); const due=new Date(y,mo-1,da,h,mi).getTime(); if(r.enabled&&r.repeat==='once'&&due<Date.now()) throw new Error('Bu zaman geçti; ileri bir zaman seç.'); const item={id,title:r.title.trim()||'Hatırlatıcı',at:r.at,repeat:r.repeat,enabled:r.enabled,kind:r.kind,due:r.enabled?due:0,snoozed:null,rung:null,ringing:false,missed:false}; const at=list.findIndex(x=>x.id===id); if(at>=0) list[at]=item; else list.push(item); writeRem(list); return list; },
    deleteReminder:async id=>{ const list=readRem().filter(x=>x.id!==id); writeRem(list); return list; },
    snoozeReminder:async(id,minutes)=>{ const list=readRem(); const r=list.find(x=>x.id===id); if(r){r.ringing=false;r.missed=false;r.snoozed=Date.now()+minutes*60_000;} writeRem(list); return list; },
    dismissReminder:async id=>{ const list=readRem(); const r=list.find(x=>x.id===id); if(r){r.ringing=false;r.missed=false;r.snoozed=null;if(r.repeat==='once')r.enabled=false;} writeRem(list); return list; },
    mediaSessions:async()=>readMedia(),
    onMedia:async cb=>{mediaListeners.add(cb);return()=>mediaListeners.delete(cb);},
    mediaControl:async(id,action)=>{ const list=readMedia(); const m=list.find(x=>x.id===id); if(!m) return false; const at=m.positionMs==null?null:Math.min(m.durationMs??Infinity,m.positionMs+(m.status==='playing'?(Date.now()-m.readAt)*(m.rate||1):0)); if(action==='toggle'||action==='play'||action==='pause'){ const play=action==='toggle'?m.status!=='playing':action==='play'; if(play?!m.canPlay:!m.canPause) return false; m.status=play?'playing':'paused'; } else if(action==='next'){ if(!m.canNext) return false; m.title=m.title+' ›'; m.positionMs=m.positionMs==null?null:0; } else { if(!m.canPrev) return false; m.positionMs=m.positionMs==null?null:0; } if(m.positionMs!=null&&action!=='next'&&action!=='prev') m.positionMs=at; m.readAt=Date.now(); writeMedia(list); return true; },
    mediaSeek:async(id,positionMs)=>{ const list=readMedia(); const m=list.find(x=>x.id===id); if(!m||!m.canSeek) return false; m.positionMs=positionMs; m.readAt=Date.now(); writeMedia(list); return true; },
    notify:async kind=>{ const s=readSettings(); const c=kind==='focus'?s.notifyFocus:s.notifyReminder; notified.push({kind,at:Date.now()}); if(c.open&&!prefs.quiet) revealListeners.forEach(cb=>cb({holdMs:s.alertHold*1000,inside:false,alert:false,page:kind==='focus'?'focus':kind==='water'?'water':'alarms'})); return {opened:c.open&&!prefs.quiet,sounded:false,quiet:prefs.quiet}; },
  };
}
