(() => {
 const main=document.querySelector('#product-frame');
 const offices=()=>[...document.querySelectorAll('iframe[src*="product/office.html"]')];
 const send=(frame,data)=>frame?.contentWindow?.postMessage(data,location.origin);
 function distribute(snapshot){window.AO_SNAPSHOT=snapshot;document.querySelectorAll('.reference-stage iframe:not(.reference-office-frame)').forEach(f=>send(f,{type:'product-sync',snapshot}));offices().forEach(f=>send(f,{type:'office-snapshot',snapshot}));}
 const key={provider:'claude',hostId:'demo',sessionId:'sample-design'};
 window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const msg=event.data;if(!msg)return;
  if(msg.type==='product-snapshot'&&event.source===main.contentWindow)distribute(msg.snapshot);
  if(msg.type==='product-ready'&&window.AO_SNAPSHOT){const f=[...document.querySelectorAll('.reference-stage iframe')].find(x=>x.contentWindow===event.source);if(f)send(f,{type:'product-sync',snapshot:window.AO_SNAPSHOT});}
  if(msg.type==='native-office-ready'&&window.AO_SNAPSHOT)offices().forEach(f=>{if(f.contentWindow===event.source)send(f,{type:'office-snapshot',snapshot:window.AO_SNAPSHOT});});
  if(msg.type==='native-office-answered')window.dispatchEvent(new CustomEvent('site-native-answered'));
 });
 document.querySelectorAll('[data-demo-ask]').forEach(b=>b.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('site-demo-start-question'))));
 window.addEventListener('site-native-office-open',()=>{const f=document.querySelector('.reference-office-frame');send(f,{type:'office-snapshot',snapshot:window.AO_SNAPSHOT});send(f,{type:'office-select',key});f.focus({preventScroll:true});f.scrollIntoView({block:'center',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});});
 document.querySelectorAll('[data-add-sample]').forEach(b=>{b.setAttribute('aria-label',b.dataset.addSample.split('/').pop()+' · '+(window.AO_I18N?.t('File shelf')||'File shelf'));b.addEventListener('click',()=>send(document.querySelector('[data-preview-page="shelf"] iframe'),{type:'product-shelf-add',paths:[b.dataset.addSample]}));});
 document.querySelectorAll('[data-sample-file]').forEach(el=>el.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-agentoffice-sample',el.dataset.sampleFile);event.dataTransfer.setData('text/plain',el.dataset.sampleFile.split('/').pop());event.dataTransfer.effectAllowed='copy';}));
 const shelf=document.querySelector('[data-preview-page="shelf"]');shelf.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-agentoffice-sample'))e.preventDefault();});shelf.addEventListener('drop',e=>{const path=e.dataTransfer.getData('application/x-agentoffice-sample');if(path){e.preventDefault();send(shelf.querySelector('iframe'),{type:'product-shelf-add',paths:[path]});}});
 const targets=[...document.querySelectorAll('.reference-copy,.reference-stage,.reference-trio>div,.languages,.release')];
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches){targets.forEach(el=>el.classList.add('scroll-reveal'));const reveal=new IntersectionObserver(rows=>rows.forEach(row=>{if(row.isIntersecting){row.target.classList.add('revealed');reveal.unobserve(row.target);}}),{threshold:.12});targets.forEach(el=>reveal.observe(el));}
})();
