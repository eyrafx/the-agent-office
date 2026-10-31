(() => {
 const frame=document.querySelector('#product-frame'),hero=document.querySelector('.hero-island-live iframe');
 const tr=text=>window.AO_I18N?.t(text)||text;let line=false,theme='glass';
 const send=(data,both=false)=>{frame.contentWindow?.postMessage(data,location.origin);if(both)hero.contentWindow?.postMessage(data,location.origin);};
 function surfaceFor(el){const scene=el.closest('[data-product-scene]')||document.querySelector('#desktop'),r=scene.getBoundingClientRect(),f=el.getBoundingClientRect();return{width:r.width,height:r.height,offsetX:f.left-r.left,offsetY:f.top-r.top,scale:f.width/864,asset:scene.dataset.surface?'promo-'+scene.dataset.surface:'desktop'};}
 function surfaces(){[frame,hero].forEach(el=>el.contentWindow?.postMessage({type:'product-surface',surface:surfaceFor(el)},location.origin));}
 function updateLine(){document.querySelectorAll('[data-demo-line]').forEach(b=>{b.setAttribute('aria-pressed',String(line));b.title=tr(line?'Breathing line is on. Select it again to return to the small island.':'Breathing line is off. Select it to show the line.');});document.querySelector('[data-line-return]').hidden=!line;document.querySelector('.line-palette').classList.toggle('is-inactive',!line);}
 function chooseLine(value){line=value;if(value)send({type:'product-appearance',settings:{restLight:true}});window.dispatchEvent(new CustomEvent('site-demo-page',{detail:{page:value?'line':'rest'}}));updateLine();}
 [frame,hero].forEach(el=>el.addEventListener('load',surfaces));[document.querySelector('#desktop'),document.querySelector('.reference-hero')].forEach(el=>new ResizeObserver(surfaces).observe(el));
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='product-ready')return;if(e.source===frame.contentWindow||e.source===hero.contentWindow){surfaces();if(e.source===hero.contentWindow)e.source.postMessage({type:'product-language',language:window.AO_I18N?.language||'en'},location.origin);e.source.postMessage({type:'product-appearance',settings:{islandTheme:theme}},location.origin);}});
 document.querySelectorAll('[data-demo-theme]').forEach(button=>button.addEventListener('click',()=>{theme=button.dataset.demoTheme;send({type:'product-appearance',settings:{islandTheme:theme}},true);document.querySelectorAll('[data-demo-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
 document.querySelectorAll('[data-line-colour]').forEach(button=>button.addEventListener('click',()=>{send({type:'product-appearance',settings:{lineColor:button.dataset.lineColour,restLight:true}},true);chooseLine(true);document.querySelectorAll('[data-line-colour]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
 document.querySelectorAll('[data-demo-line]').forEach(button=>button.addEventListener('click',()=>chooseLine(!line)));
 document.querySelector('[data-line-return]').addEventListener('click',()=>chooseLine(false));
 window.addEventListener('site-demo-state',event=>{line=event.detail.page==='line';updateLine();});window.addEventListener('site-languagechange',updateLine);window.addEventListener('site-surface-update',surfaces);
 document.querySelector('#show-drag').addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('site-demo-page',{detail:{page:'water'}}));send({type:'product-drag-demo',label:tr('Drag the dotted handle. Double-click to centre.')});});
 document.querySelector('#centre-island').addEventListener('click',()=>send({type:'product-center'}));surfaces();updateLine();
})();
