import {localizeSampleQuestion} from './sample-question';
import {createDemoBridge} from './real-demo/bridge';
import {getHub} from './real-demo/hub';
import {setLanguage,resolveLanguage} from '@app/i18n';
import {mountOffice} from '@app/ui/shell';
import './office-preview.css';
const lang=resolveLanguage(new URLSearchParams(location.search).get('lang')||'en');
setLanguage(lang);
localStorage.setItem('agentoffice:ui',JSON.stringify({language:lang,muted:true,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches}));
const hub=getHub();hub.settings={...hub.settings,language:lang,setupDone:true,notifyClick:'office'};
hub.snapshot={...hub.snapshot,sessions:[],requests:[]};
const {bridge}=createDemoBridge('office');
const tell=(data:object)=>parent.postMessage(data,location.origin);
hub.on('answered',data=>tell({type:'native-office-answered',data}));
hub.on('open-source',()=>tell({type:'native-office-source'}));
mountOffice(document.querySelector('#app')!,bridge);
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin)return;
 const msg=event.data;
 if(msg?.type==='office-snapshot'){hub.snapshot=localizeSampleQuestion(msg.snapshot,lang);hub.publish();}
 if(msg?.type==='office-select'&&msg.key){const value=JSON.stringify(msg.key);localStorage.setItem('agentoffice-selection',value);window.dispatchEvent(new StorageEvent('storage',{key:'agentoffice-selection',newValue:value}));requestAnimationFrame(()=>{document.querySelector<HTMLElement>('input[type=radio],textarea,button[type=submit]')?.focus({preventScroll:true});});}
});
// Window weather showcase (demo data, chosen on the page): a weather code and a place whose sun is up
// (or down, for "night") right now, fed through the same status and settings the app's office reads.
const WEATHER:Record<string,{code:number;night?:boolean;temperature:number}>={sunny:{code:0,temperature:24},rainy:{code:61,temperature:14},snowy:{code:71,temperature:-2},night:{code:0,night:true,temperature:12}};
function showWeather(kind:string,place:string){
 const w=WEATHER[kind];if(!w)return;
 const now=new Date(),noon=((12-(now.getUTCHours()+now.getUTCMinutes()/60))*15+540)%360-180;
 const longitude=w.night?((noon+360)%360)-180:noon,latitude=20;
 hub.settings={...hub.settings,statusWeather:true,weatherCity:place,weatherPlace:{name:place,admin1:'',country:'',countryCode:'',latitude,longitude,timezone:'UTC'}};
 hub.status={...hub.status,weather:{temperature:w.temperature,code:w.code,place,at:Date.now()}};
 hub.emit('settings',hub.settings);hub.emit('status',hub.status);
}
window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;const msg=event.data;if(msg?.type==='office-weather')showWeather(String(msg.kind),String(msg.place||'Demo'));});
tell({type:'native-office-ready'});
