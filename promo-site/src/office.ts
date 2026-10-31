// The live office: the app's own office window (app/src/ui/shell.ts, with the office scene from
// app/public/ofis) mounted with the demo bridge. The island's "Ofiste yanıtla" selects the agent
// here the way the app's browser preview does (a selection event), so its question opens in the balloon.
import type { SessionKey } from '@app/shared/contract';
import { createDemoBridge } from './demo/bridge';
import { getHub } from './demo/hub';

const root = document.querySelector<HTMLElement>('#app')!;
async function boot() {
  const { bridge } = createDemoBridge('office');
  const { mountOffice } = await import('@app/ui/shell');
  mountOffice(root, bridge);
  const hub = getHub();
  hub.on('frame', m => {
    const msg = m as { type?: string; frame?: string; key?: SessionKey };
    if (msg.frame !== 'office' || msg.type !== 'select' || !msg.key) return;
    const value = JSON.stringify(msg.key);
    localStorage.setItem('agentoffice-selection', value);
    window.dispatchEvent(new StorageEvent('storage', { key: 'agentoffice-selection', newValue: value }));
  });
  hub.emit('frame', { type: 'ready', frame: 'office' });
}
boot().catch(error => { root.textContent = 'Ofis açılamadı: ' + String(error); console.error(error); });
