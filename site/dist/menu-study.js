(() => {
 const frame=document.querySelector('#menu-frame'),scene=document.querySelector('.menu-study-scene'),study=document.querySelector('.menu-study');
 const tabs=[...document.querySelectorAll('[data-study]')];
 const descriptions={focus:'A little focus. A calmer day.',water:'A glass of water, a moment for yourself.',notes:'A place for thoughts and small tasks.',settings:'Your colours, your pace, your desktop.'};
 const tr=s=>window.AO_I18N?.t(s)||s;
 const labels={focus:'Focus & timer',water:'Water',notes:'Notes & to-dos',settings:'Settings'};
 let selected='focus',ready=false;
 const post=data=>frame.contentWindow?.postMessage(data,location.origin);
 function resize(){const scale=scene.clientWidth/(matchMedia('(max-width:680px)').matches?620:864);study.style.setProperty('--study-scale',scale);const r=scene.getBoundingClientRect(),f=frame.getBoundingClientRect();post({type:'product-surface',surface:{width:r.width,height:r.height,offsetX:f.left-r.left,offsetY:f.top-r.top,scale,asset:'studio'}});}
 function open(){if(!ready)return;post({type:'product-close-settings'});if(selected==='settings'){post({type:'product-page',page:'rest'});post({type:'product-settings'});}else post({type:'product-page',page:selected});resize();}
 function choose(id,focus=false){selected=id;frame.title=tr(labels[id]);study.dataset.menu=id;tabs.forEach(b=>{const active=b.dataset.study===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active&&focus)b.focus();});document.querySelector('#study-panel').setAttribute('aria-labelledby','study-tab-'+id);document.querySelector('#study-description').textContent=tr(descriptions[id]);open();}
 tabs.forEach((button,index)=>{button.addEventListener('click',()=>choose(button.dataset.study));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;choose(tabs[next].dataset.study,true);});});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='product-ready'){ready=true;resize();open();}});
 document.querySelector('#menu-drag').addEventListener('click',()=>{choose('water');post({type:'product-drag-demo',label:tr('Drag the dotted handle. Double-click to centre.')});});
 window.addEventListener('site-languagechange',()=>{ready=false;frame.title=tr(labels[selected]);document.querySelector('#study-description').textContent=tr(descriptions[selected]);});
 new ResizeObserver(resize).observe(scene);frame.addEventListener('load',resize);resize();
})();
