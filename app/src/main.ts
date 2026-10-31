import './ui/dropdown.css';
import { watchSelects } from './ui/dropdown';
import { resolveLanguage, setLanguage, t } from './i18n';
import { readPreferences } from './ui/preferences';
import { createBridge } from './shared/bridge';
const params=new URLSearchParams(location.search);
const root=document.querySelector<HTMLElement>('#app')!;
async function boot() {
  // Every list in the app opens as the app's own dropdown (ui/dropdown.ts), never the system's.
  watchSelects();
  const bridge=createBridge();
  if(params.get('demo')==='1' && (await bridge.getSnapshot()).mode!=='demo') await bridge.setDemo(true);
  if(params.get('view')==='mascot') {
    const { mountLab }=await import('./mascot-lab');mountLab(root);return;
  }
  if(params.get('view')==='notch') { const {mountNotch}=await import('./notch/view'); mountNotch(root,bridge); }
  else {const {mountOffice}=await import('./ui/shell');mountOffice(root,bridge);}
}
boot().catch(error=>{setLanguage(resolveLanguage(readPreferences().language));root.textContent=t('main.could_not_open',{error:String(error)});console.error(error);});
