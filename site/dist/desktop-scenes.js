(() => {
 'use strict';
 const root=document.querySelector('[data-scenes]');
 if(!root)return;
 const full=root.querySelector('[data-scene-full]');
 const picks=[...full.querySelectorAll('[data-mode-pick]')];
 const pause=document.querySelector('[data-scenes-pause]');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const order=['small','line','hidden'];
 let timer=0,userPicked=false,paused=false,visible=false;
 function show(mode){full.dataset.mode=mode;picks.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modePick===mode)));}
 function tick(){show(order[(order.indexOf(full.dataset.mode)+1)%order.length]);}
 function sync(){
  clearInterval(timer);timer=0;
  if(!userPicked&&!paused&&visible&&!reduce.matches)timer=setInterval(tick,2800);
 }
 picks.forEach(b=>b.addEventListener('click',()=>{userPicked=true;show(b.dataset.modePick);sync();}));
 pause?.addEventListener('click',()=>{
  paused=!paused;
  pause.setAttribute('aria-pressed',String(paused));
  pause.querySelector('[data-scenes-label="pause"]').hidden=paused;
  pause.querySelector('[data-scenes-label="play"]').hidden=!paused;
  root.classList.toggle('is-paused',paused);
  sync();
 });
 if('IntersectionObserver' in window){
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;root.classList.toggle('is-offscreen',!visible);sync();},{threshold:.15}).observe(root);
 }else{visible=true;sync();}
 reduce.addEventListener?.('change',sync);
})();
