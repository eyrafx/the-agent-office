import { createMascot } from './mascot/renderer';
import type { MascotState } from './shared/contract';

export function mountLab(root:HTMLElement) {
  document.body.style.cssText='margin:0;background:#17191f;color:#f2f3f7;font-family:Segoe UI,sans-serif';
  root.innerHTML=`<main style="max-width:1050px;margin:28px auto;padding:24px"><a href="/?demo=1" style="color:#ff9e45">← Ofise dön</a><div style="display:flex;justify-content:space-between;align-items:center"><div><p style="color:#a9a9b7;letter-spacing:2px;font-size:12px">AGENTOFFICE · HAREKET ATÖLYESİ</p><h1 style="font-size:28px;font-weight:500">Sekiz kol. Tek yardımcı.</h1></div><span style="border:1px solid #51515e;border-radius:20px;padding:8px 14px;font-size:13px">3D geliştirme önizlemesi</span></div><div id="model" style="height:520px;border:1px solid #343641;border-radius:28px;background:radial-gradient(ellipse at 50% 40%,#353238,#1e2027 70%);position:relative"></div><div id="poses" style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0"></div><label style="color:#c5c5d0;font-size:14px"><input id="reduce" type="checkbox"> Hareketi azalt</label><p style="color:#a9a9b7;font-size:13px">İmleci karakterin çevresinde gezdirin. Baş, dijital gözler ve kollar ayrı hareket eder. Bu ekran AI bağlantısı kullanmaz.</p></main>`;
  const host=root.querySelector<HTMLElement>('#model')!;
  const mascot=createMascot(host);
  const poses:Array<[MascotState,string]>=[['idle','Dinlenme'],['working','Çalışma'],['waiting','Yanıt bekliyor'],['replyEnded','Yanıt sona erdi'],['error','Hata / limit'],['resting','Uyku'],['dragged','Sürükleme']];
  for(const [state,label] of poses){const button=document.createElement('button');button.textContent=label;button.style.cssText='color:#f2f3f7;background:#2b2d36;border:1px solid #515360;border-radius:12px;padding:12px 18px;font:inherit;cursor:pointer';button.onclick=()=>{mascot.setState(state);for(const b of root.querySelectorAll<HTMLButtonElement>('#poses button'))b.style.borderColor='#515360';button.style.borderColor='#ff8a1f';};root.querySelector('#poses')!.append(button);}
  host.addEventListener('pointermove',e=>{const rect=host.getBoundingClientRect();mascot.setPointer((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));});
  root.querySelector<HTMLInputElement>('#reduce')!.onchange=e=>mascot.setReducedMotion((e.target as HTMLInputElement).checked);
  document.addEventListener('visibilitychange',()=>mascot.setVisible(!document.hidden));
  window.addEventListener('pagehide',()=>mascot.dispose(),{once:true});
}
