(() => {
 const hosts=[...document.querySelectorAll('.reference-stage[data-preview-page]')];
 const entries=[];let officeFeed=null,heroExpanded=false;
 const hero=document.querySelector('.reference-hero'),heroFrame=hero.querySelector('iframe');
 function layoutHero(){hero.style.setProperty('--hero-scale',heroExpanded?Math.min(1,(hero.clientWidth-16)/700):1);window.dispatchEvent(new CustomEvent('site-surface-update'));}
 const tr=s=>window.AO_I18N?.t(s)||s;
 const send=(frame,data)=>frame.contentWindow?.postMessage(data,location.origin);
 function surface(entry){const {host,frame,page}=entry,r=host.getBoundingClientRect(),f=frame.getBoundingClientRect();send(frame,{type:'product-surface',surface:{width:r.width,height:r.height,offsetX:f.left-r.left,offsetY:f.top-r.top,scale:entry.scale,asset:'promo-'+page}});}
 function layout(entry){if(entry.page==='office')return;const fit=entry.page==='agents'?730:entry.page==='settings'?864:640;entry.scale=Math.min(1,entry.host.clientWidth/fit);entry.host.style.setProperty('--feature-scale',entry.scale);surface(entry);}
 function mount(host){const page=host.dataset.previewPage;if(page==='office')return;const frame=document.createElement('iframe');frame.title=tr(document.querySelector(`[data-example="${page}"] .eyebrow>span:last-child`).textContent);frame.src='product/index.html?lang='+encodeURIComponent(window.AO_I18N?.language||'en');frame.height=page==='settings'?'540':'780';frame.style.height=frame.height+'px';frame.width='864';const entry={host,frame,page,scale:1};entries.push(entry);host.append(frame);host.style.setProperty('--feature-height',page==='agents'?530:page==='water'?350:page==='notes'?280:page==='settings'?540:330);new ResizeObserver(()=>layout(entry)).observe(host);layout(entry);}
 const near=new IntersectionObserver(rows=>rows.forEach(row=>{if(row.isIntersecting){mount(row.target);near.unobserve(row.target);}}),{rootMargin:'400px 0px'});hosts.forEach(host=>near.observe(host));
 const office=document.querySelector('.reference-office-frame');
 window.addEventListener('site-office-feed',event=>{officeFeed=event.detail;send(office,{type:'ofis',data:officeFeed});});
 office.addEventListener('load',()=>window.dispatchEvent(new CustomEvent('site-office-request')));
 window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const msg=event.data;if(!msg)return;if(event.source===heroFrame.contentWindow&&msg.type==='product-state'){heroExpanded=msg.expanded;layoutHero();}const entry=entries.find(e=>e.frame.contentWindow===event.source);
  if(entry){if(msg.type==='product-ready'){layout(entry);send(entry.frame,{type:'product-question',waiting:!!window.AO_SNAPSHOT?.requests?.some(r=>r.status==='pending')});send(entry.frame,{type:'product-page',page:entry.page==='settings'?'rest':entry.page});if(entry.page==='settings')send(entry.frame,{type:'product-settings'});}if(msg.type==='product-measure'&&entry.page!=='settings'){entry.host.style.setProperty('--feature-height',Math.max(260,msg.height+55));}if(msg.type==='product-open-office')window.dispatchEvent(new CustomEvent('site-native-office-open'));}
  if(event.source===office.contentWindow){if(msg.type==='ofis-ready'&&officeFeed)send(office,{type:'ofis',data:officeFeed});if(msg.type==='ofis-select'&&msg.id==='sample-design'&&msg.part==='balon')window.dispatchEvent(new CustomEvent('site-demo-question',{detail:{open:true}}));}
 });
 new IntersectionObserver(([row])=>send(office,{type:'ofis-pause',on:!row.isIntersecting}),{threshold:.05}).observe(office);
 new ResizeObserver(layoutHero).observe(hero);layoutHero();
 window.dispatchEvent(new CustomEvent('site-office-request'));
})();
