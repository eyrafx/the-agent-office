import {localizeSampleQuestion} from './sample-question';
import {copyFor, swapSample, sampleFileName} from './sample-copy';
import './source/ui/styles.css';
import './source/ui/offices.css';
import { mountNotch } from './source/notch/view';
import { createSettingsPanel } from './source/ui/settings-panel';
import { DEFAULT_SETTINGS } from './source/shared/settings';
import { stripItems } from './source/notch/strip';
import { t, setLanguage, resolveLanguage } from './source/i18n';
import type { Bridge, Snapshot, Settings, IslandStatus } from './source/shared/contract';
import './preview.css';

const clone = <T>(x:T):T => structuredClone(x);
const callbacks = new Map<string,Set<(v:any)=>void>>();
const emit = (key:string,value:any) => callbacks.get(key)?.forEach(f=>f(clone(value)));
const subscribe = (key:string,fn:(v:any)=>void) => { if(!callbacks.has(key)) callbacks.set(key,new Set()); callbacks.get(key)!.add(fn); return Promise.resolve(()=>callbacks.get(key)?.delete(fn)); };
const tell = (value:object) => parent.postMessage(value, location.origin);
let selectedLanguage=resolveLanguage(new URLSearchParams(location.search).get('lang')||'en');
const preferences = { language:selectedLanguage, reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches, muted:true };
setLanguage(selectedLanguage);
localStorage.setItem('agentoffice:ui',JSON.stringify(preferences));
localStorage.removeItem('agentoffice-island-page');
localStorage.setItem('agentoffice-media-lyrics','0');
let settings:Settings = { ...clone(DEFAULT_SETTINGS),language:selectedLanguage,islandTheme:'glass',scale:100,clockStyle:'time',reducedMotion:preferences.reducedMotion,closeDelay:700,lyricsOnline:true,hideMascot:false,statusBattery:true,statusAudio:true,statusWeather:true,statusAlarm:false,weatherCity:'Istanbul',weatherPlace:{name:'Istanbul',admin1:'Istanbul',country:'Türkiye',countryCode:'TR',latitude:41.01,longitude:28.98,timezone:'Europe/Istanbul'} };
// Fictional device conditions; the real desktop component owns their layout and five-second rotation.
const sampleStatus=():IslandStatus=>({battery:{percent:68,charging:true},audio:{kind:'headphones',name:'AirPods Pro',bluetooth:true},weather:{temperature:21,code:1,place:'Istanbul',at:Date.now()}});
const now = Date.now();
const key = (provider:'claude'|'codex',id:string)=>({provider,hostId:'demo',sessionId:id});
let snapshot:Snapshot = {schemaVersion:1,revision:1,mode:'demo',sessions:[
  {key:key('claude','sample-manager'),name:'Project lead',project:'Website',status:'working',lastActivity:now,summary:'Coordinating the website launch',source:'demo',files:[],verified:true},
  {key:key('claude','sample-design'),name:'Design',project:'Website',status:'waiting',lastActivity:now,summary:'Which homepage should we use?',source:'demo',files:[],verified:true},
  {key:key('codex','sample-code'),name:'Development',project:'Website',status:'working',lastActivity:now-4000,summary:'Building the interface',source:'demo',files:[],verified:true},
  {key:key('codex','sample-test'),name:'Testing',project:'Website',status:'working',lastActivity:now-8000,summary:'Checking layouts and interactions',source:'demo',files:[],verified:true},
  {key:key('claude','sample-copy'),name:'Writing',project:'Website',status:'idle',lastActivity:now-60000,summary:'Copy is ready for review',source:'demo',files:[],verified:true},
  {key:key('codex','sample-research'),name:'Research',project:'Website',status:'idle',lastActivity:now-80000,summary:'Research complete',source:'demo',files:[],verified:true}
], requests:[],history:[],connections:[{provider:'claude',status:'connected',detail:copyFor(selectedLanguage).connection},{provider:'codex',status:'connected',detail:copyFor(selectedLanguage).connection}],limits:[],
  // The project lead is the Claude office's manager: the app's own manager desk in the middle of the office.
  managers:{'claude:website':'sample-manager'}};
function setWaiting(waiting:boolean) {
  snapshot.revision++;
  const design=snapshot.sessions.find(s=>s.key.sessionId==='sample-design')!;
  design.status=waiting?'waiting':'working'; design.summary=waiting?'Which homepage should we use?':'Preparing the interactive homepage'; design.lastActivity=Date.now();
  snapshot.requests=waiting?[{key:{sessionKey:design.key,requestId:'sample-question'},version:1,kind:'question',title:'Which homepage should we use?',detail:'Choose an interactive product demo or a product screenshot.',options:['Interactive product demo','Product screenshot'],questions:[{header:'Homepage',question:'Which homepage should we use?',options:[{label:'Interactive product demo',description:'Let visitors try the island and office.'},{label:'Product screenshot',description:'Show one product view.'}],multiSelect:false}],expiresAt:Date.now()+86_400_000,holdUntil:Date.now()+120000,status:'pending',canAnswer:true}]:[];
  snapshot=localizeSampleQuestion(snapshot,selectedLanguage);
  emit('snapshot',snapshot);tell({type:'product-snapshot',snapshot});
}
setWaiting(false);
// The manager coordinates the team: its activity turns every few seconds (sample lines, translated).
const managerLines=['Coordinating the website launch','Asking Design to pick the homepage','Reviewing what Development has built','Lining up the tests for launch'];
let managerTurn=0;
setInterval(()=>{ if(document.hidden)return; const lead=snapshot.sessions.find(s=>s.key.sessionId==='sample-manager'); if(!lead)return; managerTurn=(managerTurn+1)%managerLines.length; lead.summary=managerLines[managerTurn]; lead.lastActivity=Date.now(); snapshot.revision++; snapshot=localizeSampleQuestion(snapshot,selectedLanguage); emit('snapshot',snapshot); tell({type:'product-snapshot',snapshot}); },7000);
let reminders:any[]=[];
const tomorrow = new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(9,0,0,0);
const at = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T09:00`;
reminders=[{id:'sample-alarm',title:copyFor(selectedLanguage).alarm,at,repeat:'weekdays',enabled:true,due:tomorrow.getTime(),ringing:false,missed:false,kind:'alarm'}];
const docs:Record<string,any> = {
  notes:{items:[{id:'sample-task',text:copyFor(selectedLanguage).task,kind:'task',done:false,created:now,updated:now},{id:'sample-note',text:copyFor(selectedLanguage).note,kind:'note',done:false,created:now,updated:now}]},
  water:{portion:250,goal:2000,from:9,to:22,every:90,remind:false,log:[{at:now-3600000,ml:250},{at:now-1800000,ml:250},{at:now-300000,ml:250}]},
  shelf:{items:[]},focus:null
};
const track = {id:'demo-music',app:'Music',title:'Midnight Lines',artist:'AgentOffice Sessions',album:copyFor(selectedLanguage).album,status:'paused',canPlay:true,canPause:true,canNext:true,canPrev:true,canSeek:true,canStop:true,positionMs:42000,durationMs:192000,readAt:Date.now(),rate:1,art:'../assets/album.svg',current:true,playingSince:now,lastPlayed:now};
let tracks:any[]=[track];
// The demo's sample alarm, note, to-do, album line and connection follow the site language (texts a visitor changed stay).
function localizeSamples(){
  const lang=selectedLanguage;
  reminders=reminders.map(r=>r.id==='sample-alarm'?{...r,title:swapSample(r.title,'alarm',lang)}:r);emit('reminders',clone(reminders));
  if(docs.notes?.items){docs.notes={...docs.notes,items:docs.notes.items.map((it:any)=>it.id==='sample-task'?{...it,text:swapSample(it.text,'task',lang)}:it.id==='sample-note'?{...it,text:swapSample(it.text,'note',lang)}:it)};emit('doc',{name:'notes',doc:clone(docs.notes)});}
  tracks=tracks.map(x=>({...x,album:swapSample(x.album,'album',lang)}));emit('media',clone(tracks));
  snapshot.connections=(snapshot.connections||[]).map((c:any)=>({...c,detail:swapSample(c.detail,'connection',lang)}));
}
let noticeTimer:ReturnType<typeof setTimeout>;
function notice(text:string) { const el=document.querySelector<HTMLElement>('#demo-notice')!;el.textContent=text;el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.hidden=true,4000); }
const noOp=async()=>{};
let panel:ReturnType<typeof createSettingsPanel>;
const methods:Record<string,any>={
  toolsState:async()=>({tools:{claude:false,codex:false},claude:{state:'absent'}}),
  connectTools:async()=>({tools:{claude:false,codex:false},claude:{state:'absent'}}),
  status:async()=>sampleStatus(),onStatus:(fn:any)=>subscribe('status',fn),
  searchPlaces:async(query:string)=>query.trim().length>1?[clone(settings.weatherPlace)]:[],
  getSnapshot:async()=>clone(snapshot),subscribe:(fn:any)=>subscribe('snapshot',fn),
  getSettings:async()=>clone(settings),onSettings:(fn:any)=>subscribe('settings',fn),
  setSettings:async(patch:any)=>{settings={...settings,...patch,language:selectedLanguage,muted:true};emit('settings',settings);requestAnimationFrame(paintDesktop);return clone(settings);},
  openOffice:async()=>tell({type:'product-open-office'}),openInSource:async()=>{tell({type:'product-open-office'});return true;},
  openSettings:async()=>panel.open(),onOpenSettings:(fn:any)=>subscribe('open-settings',fn),
  loadDoc:async(name:string)=>clone(docs[name]??null),saveDoc:async(name:string,doc:any)=>{docs[name]=clone(doc);emit('doc',{name,doc});},onDoc:(fn:any)=>subscribe('doc',fn),
  reminders:async()=>clone(reminders),onReminders:(fn:any)=>subscribe('reminders',fn),
  saveReminder:async(input:any)=>{const id=input.id||`demo-${crypto.randomUUID()}`;const item={...input,id,due:new Date(input.at).getTime(),ringing:false,missed:false};reminders=[...reminders.filter(r=>r.id!==id),item];emit('reminders',reminders);return clone(reminders);},
  deleteReminder:async(id:string)=>{reminders=reminders.filter(r=>r.id!==id);emit('reminders',reminders);return clone(reminders);},
  dismissReminder:async(id:string)=>{reminders=reminders.map(r=>r.id===id?{...r,ringing:false}:r);emit('reminders',reminders);return clone(reminders);},
  snoozeReminder:async()=>clone(reminders),
  mediaSessions:async()=>clone(tracks),onMedia:(fn:any)=>subscribe('media',fn),
  mediaControl:async(_id:string,action:string)=>{const t=tracks[0];if(t.status==='playing')t.positionMs=Math.min(t.durationMs,t.positionMs+Date.now()-t.readAt);t.readAt=Date.now();if(action==='toggle')t.status=t.status==='playing'?'paused':'playing';if(action==='pause'||action==='stop')t.status=action==='stop'?'stopped':'paused';if(action==='play')t.status='playing';if(action==='next'||action==='prev'){t.positionMs=0;t.title=t.title==='Midnight Lines'?'A Little More Room':'Midnight Lines';}emit('media',tracks);return true;},
  mediaSeek:async(_id:string,position:number)=>{tracks[0].positionMs=position;tracks[0].readAt=Date.now();emit('media',tracks);return true;},
  lyrics:async()=>({status:'synced',lines:[{t:0,text:'A little space to make a start'},{t:18000,text:'A little room for every thought'},{t:36000,text:'Let the quiet hold the light'},{t:52000,text:'And make a little more tonight'},{t:70000,text:'Keep the things you need in view'},{t:96000,text:'Leave some space for something new'},{t:130000,text:'A little room, a little time'},{t:160000,text:'Everything begins to find its line'}],plain:''}),
  shelfInfo:async(paths:string[])=>paths.map(path=>({path,name:sampleFileName(path.split('/').pop()||path,selectedLanguage),exists:true,folder:false,size:path.endsWith('.pdf')?124800:path.endsWith('.svg')?18400:840,modified:now})),
  shelfOpen:async()=>notice(copyFor(selectedLanguage).open),shelfReveal:async()=>notice(copyFor(selectedLanguage).reveal),shelfOpenWith:async()=>notice(copyFor(selectedLanguage).openWith),
  shelfPick:async()=>['Demo/Project notes.txt'],shelfDrag:async()=>{notice(copyFor(selectedLanguage).drag);return true;},
  notify:async()=>({opened:false,sounded:false,quiet:null}),notifyPrefs:async()=>({alerts:true,muted:true,quiet:null}),
  pinNotch:async(value:boolean)=>emit('pinned',value),onNotchPinned:(fn:any)=>subscribe('pinned',fn),
  onNotchReveal:(fn:any)=>subscribe('reveal',fn),onNotchPointer:(fn:any)=>subscribe('pointer',fn),onNotchDock:(fn:any)=>subscribe('dock',fn),onNotchLayout:(fn:any)=>subscribe('layout',fn),
  onLimitsPanel:(fn:any)=>subscribe('limits',fn),setLimitsPanel:async(open:boolean)=>emit('limits',{open,side:'right'}),
  resizeNotch:async(expanded:boolean)=>tell({type:'product-state',expanded}),notchShape:async()=>{},notchMove:async(action:'start'|'end'|'center')=>moveIsland(action),
  onSign:(fn:any)=>subscribe('sign',fn),indicatorsSupported:async()=>['volume','caps','language','battery','wifi','audio'],
  listMonitors:async()=>[{name:'demo',label:'Demo display',primary:true}],shortcuts:async()=>[true,true],
  playChime:async()=>notice(copyFor(selectedLanguage).muted),claudeHooksStatus:async()=>null,setClaudeHooks:async()=>false,
  setDemo:async()=>setWaiting(true),getWorkLog:async()=>[],onWorkLog:(fn:any)=>subscribe('worklog',fn),onChime:(fn:any)=>subscribe('chime',fn)
};
const bridge=new Proxy(methods,{get(target,prop:string){if(prop in target)return target[prop];if(prop.startsWith('on'))return(fn:any)=>subscribe(prop,fn);return noOp;}}) as Bridge;
mountNotch(document.querySelector('#app')!,bridge);
panel=createSettingsPanel(document.querySelector('#settings-root')!,bridge,{l:()=>t,toast:notice,snapshot:()=>snapshot,setDemo:async()=>setWaiting(true),claudeHooks:async()=>null,setClaudeHooks:async()=>{notice(copyFor(selectedLanguage).hooks);}});
function saveLanguage(){localStorage.setItem('agentoffice:ui',JSON.stringify({...preferences,language:selectedLanguage}));}
type NotchAPI={open():void;close():void;page(id:string):void;current:string};
const ui=()=>(window as any).__notch as NotchAPI;
const appRoot=document.querySelector<HTMLElement>('#app')!;
let surface={width:864,height:510,offsetX:0,offsetY:0,scale:1,asset:'desktop'},offset=0,dragging=false,startX=0,startOffset=0,pointerX=0;
const desktopImage=new Image(),desktopFrame=document.createElement('canvas');
desktopImage.src=new URL('../assets/desktop-backdrop.jpg',location.href).href;
desktopImage.addEventListener('load',paintDesktop);
function paintDesktop(){
  if(!desktopImage.complete||!desktopImage.naturalWidth)return;
  desktopFrame.width=innerWidth;desktopFrame.height=innerHeight;
  const g=desktopFrame.getContext('2d')!,cover=Math.max(surface.width/desktopImage.naturalWidth,surface.height/desktopImage.naturalHeight),s=surface.scale||1;
  g.drawImage(desktopImage,((surface.width-desktopImage.naturalWidth*cover)/2-surface.offsetX)/s,((surface.height-desktopImage.naturalHeight*cover)/2-surface.offsetY)/s,desktopImage.naturalWidth*cover/s,desktopImage.naturalHeight*cover/s);
  (window as any).__demoGlassFrame?.(desktopFrame);
}
const zoom=()=>settings.scale/100;
function limitOffset(value:number){const w=appRoot.classList.contains('expanded')?parseFloat(appRoot.style.getPropertyValue('--page-w'))||620:232;const max=Math.max(0,(Math.min(innerWidth,surface.width/(surface.scale||1))/zoom()-w)/2-26);return Math.min(max,Math.max(-max,value));}
function setOffset(value:number,smooth=false){
  offset=limitOffset(value);appRoot.classList.toggle('demo-positioning',smooth&&!preferences.reducedMotion);appRoot.style.setProperty('--demo-x',`${offset}px`);appRoot.dataset.demoOffset=String(Math.round(offset));paintDesktop();
}
const guideTimers:ReturnType<typeof setTimeout>[]=[];
function stopGuide(){guideTimers.splice(0).forEach(clearTimeout);appRoot.classList.remove('demo-guiding','demo-positioning');}
function moveIsland(action:'start'|'end'|'center'){
  stopGuide();
  if(action==='start'){dragging=true;startX=pointerX;startOffset=offset;}
  if(action==='end'){dragging=false;setOffset(offset);tell({type:'product-moved'});}
  if(action==='center'){dragging=false;setOffset(0,true);}
}
window.addEventListener('pointerdown',event=>{pointerX=event.clientX;},{capture:true});
window.addEventListener('pointermove',event=>{if(dragging)setOffset(startOffset+(event.clientX-startX)/zoom());});
window.addEventListener('pointerup',()=>{dragging=false;});
const grip=document.querySelector<HTMLElement>('.move-grip')!;
grip.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();stopGuide();setOffset(event.key==='Home'?0:offset+(event.key==='ArrowLeft'?-24:24),true);});
const guide=document.createElement('div');guide.className='demo-drag-guide';guide.setAttribute('aria-hidden','true');guide.innerHTML='<svg viewBox="0 0 24 28" fill="none"><path d="M4 2v20l5-5 4 8 4-2-4-8h7L4 2Z" fill="#c5f8f7" stroke="#132d3c" stroke-width="1.5"/></svg><span></span>';document.querySelector('.island-area')!.append(guide);
function demonstrateDrag(label:string){
  stopGuide();show('water');guide.querySelector('span')!.textContent=label;appRoot.classList.add('demo-guiding');
  if(preferences.reducedMotion){setOffset(-60);return;}
  for(const [ms,x] of [[450,-95],[1550,95],[2650,0]])guideTimers.push(setTimeout(()=>setOffset(x,true),ms));
  guideTimers.push(setTimeout(()=>appRoot.classList.remove('demo-guiding','demo-positioning'),3900));
}
function show(page:string) {
  if(['charging','airpods','weather'].includes(page)){
    emit('pinned',false);ui().close();emit('dock','capsule');emit('status',sampleStatus());
    const item=page==='charging'?'battery':page==='airpods'?'audio':'weather';
    requestAnimationFrame(()=>{
      const strip=(window as any).__islandStrip;
      // A manually selected example gets a full five-second turn before normal rotation resumes.
      strip?.set([]);strip?.set(stripItems(sampleStatus(),settings,null,t));strip?.showItem(item);
      if(page==='charging')emit('sign',{kind:'battery',text:t('app.charging',{percent:68}),value:68,on:true});
      if(page==='airpods')emit('sign',{kind:'audio',text:t('app.sound_output',{device:'AirPods Pro'}),on:true});
    });
    return;
  }
  emit('pinned',true);emit('dock','capsule');
  if(page==='rest'||page==='line'||page==='hidden'){emit('pinned',false);ui().close();emit('dock',page==='rest'?'capsule':page);}
  else {ui().page(page==='lyrics'?'media':page);ui().open();if(page==='lyrics'){const b=document.querySelector<HTMLButtonElement>('.media-lyrics-toggle');if(b?.getAttribute('aria-pressed')!=='true')b?.click();}}
}
window.addEventListener('message',(event)=>{if(event.source!==parent||event.origin!==location.origin)return;const msg=event.data;if(msg?.type==='product-page'){stopGuide();show(msg.page);setOffset(offset);}if(msg?.type==='product-question')setWaiting(!!msg.waiting);if(msg?.type==='product-sync'){snapshot=localizeSampleQuestion(msg.snapshot,selectedLanguage);emit('snapshot',snapshot);}if(msg?.type==='product-language'){selectedLanguage=resolveLanguage(msg.language);settings={...settings,language:selectedLanguage};setLanguage(selectedLanguage);saveLanguage();localizeSamples();snapshot=localizeSampleQuestion(snapshot,selectedLanguage);emit('snapshot',snapshot);emit('settings',settings);}if(msg?.type==='product-shelf-add'){(ui() as any).shelfDrop(msg.paths);}if(msg?.type==='product-settings')panel.open();if(msg?.type==='product-close-settings')panel.close();if(msg?.type==='product-surface'){surface=msg.surface;const asset=['hero','agents','media','notes','focus','alarms','water','shelf','settings'].map(x=>'promo-'+x).includes(surface.asset)?surface.asset:null;const image=new URL(asset?'../assets/'+asset+'.svg':surface.asset==='studio'?'../assets/menu-atmosphere.svg':'../assets/desktop-backdrop.jpg',location.href).href;if(desktopImage.src!==image)desktopImage.src=image;paintDesktop();}if(msg?.type==='product-appearance'){settings={...settings,...msg.settings};emit('settings',settings);requestAnimationFrame(paintDesktop);}if(msg?.type==='product-drag-demo')demonstrateDrag(msg.label);if(msg?.type==='product-center')setOffset(0,true);});
const observer=new MutationObserver(()=>{const root=document.querySelector<HTMLElement>('#app')!;tell({type:'product-page-changed',page:root.dataset.page||'agents',expanded:root.classList.contains('expanded')});});observer.observe(document.querySelector('#app')!,{attributes:true,attributeFilter:['data-page','class']});
new ResizeObserver(()=>{const box=document.querySelector('.island-shape')!.getBoundingClientRect();tell({type:'product-measure',height:Math.round(box.height),width:Math.round(box.width)});}).observe(document.querySelector('.island-shape')!);
queueMicrotask(()=>{show('rest');paintDesktop();tell({type:'product-ready'});tell({type:'product-snapshot',snapshot});});

window.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('application/x-agentoffice-sample')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
window.addEventListener('drop',event=>{const path=event.dataTransfer?.getData('application/x-agentoffice-sample');if(path){event.preventDefault();(ui() as any).shelfDrop([path]);}});
