(() => {
  'use strict';
  const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
  const tr=(text,vars)=>window.AO_I18N?.t(text,vars)||text;
  const desktop=$('#desktop'),product=$('#product-frame'),office=$('#office-frame');
  const restPages=['rest','line','hidden','charging','airpods','weather'];
  const state={mode:'island',page:'rest',pending:null,waiting:false,answered:false,inView:true,ready:false};
  const captions={agents:'See who’s working and who’s waiting. Open the office to reply.',media:'Your music, one glance away. Try the controls on this sample track.',lyrics:'Follow the current line. Click a lyric to jump there.',notes:'A thought, a little to-do. Add one, edit it or tick it off.',focus:'A little focus. A short break. Or a countdown for whatever comes next.',alarms:'Try an alarm or a reminder. This preview keeps it here in your browser.',water:'One glass at a time. Log a drink or make the daily goal your own.',shelf:'Keep a sample file handy while you switch apps.',rest:'See charging, connected headphones and weather in the small island. Updates change every five seconds, with the clock in between.',charging:'Sample laptop: charging at 68%. Try the battery ring and plug-in animation.',airpods:'Sample audio output: AirPods Pro. See the connection notice and headphones status.',weather:'Sample weather: Istanbul, 21°C. This is a demo reading, not a live forecast.',line:'Just a little line. Move over it to open your island.',hidden:'Out of sight. In Windows, move to the top edge to bring the island back.'};
  let toastTimer;
  const rail=$('#module-tabs');
  if(rail){
    const carousel=document.createElement('div');carousel.className='tool-carousel';
    rail.before(carousel);carousel.append(rail);
    function arrow(direction,label){
      const button=document.createElement('button');button.type='button';button.className='rail-arrow';
      button.setAttribute('aria-label',label);button.setAttribute('aria-controls','module-tabs');
      button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction<0?'M14 6l-6 6 6 6':'M10 6l6 6-6 6'}"/></svg>`;
      button.addEventListener('click',()=>rail.scrollBy({left:direction*Math.max(130,rail.clientWidth*.65),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));
      return button;
    }
    const previous=arrow(-1,'Scroll features left'),next=arrow(1,'Scroll features right');
    carousel.prepend(previous);carousel.append(next);
    function edges(){const max=rail.scrollWidth-rail.clientWidth;const overflow=max>4;carousel.classList.toggle('is-scrollable',overflow);previous.disabled=!overflow||rail.scrollLeft<=4;next.disabled=!overflow||rail.scrollLeft>=max-4;}
    rail.addEventListener('scroll',edges,{passive:true});new ResizeObserver(edges).observe(rail);
    rail.addEventListener('focusin',event=>{const button=event.target.closest('[data-module]');if(!button)return;const box=button.getBoundingClientRect(),view=rail.getBoundingClientRect();if(box.left<view.left)rail.scrollBy({left:box.left-view.left});else if(box.right>view.right)rail.scrollBy({left:box.right-view.right});});
    edges();
  }
  function post(data){product.contentWindow?.postMessage(data,location.origin);}
  function clock(){const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$$('.desktop-clock,.flow-small b').forEach(el=>el.textContent=time);}
  function feed(){const day=new Date().toISOString().slice(0,10);return{zaman:Math.floor(Date.now()/1000),baslik:'Website',yonetici:true,digerleri:0,sekmeler:[
    {id:'sample-design',ad:'Design',durum:state.waiting?'bekliyor':'calisiyor',nokta:state.waiting?'bekliyor':'calisiyor',balon:state.waiting?'A question for you':'Preparing the design',uzun:'Which homepage should we use?',koltuk:2,yas:0},
    {id:'sample-code',ad:'Development',durum:'calisiyor',nokta:'calisiyor',balon:'Building the interface',uzun:'Putting the components together.',koltuk:4,yas:0},
    {id:'sample-test',ad:'Testing',durum:'calisiyor',nokta:'calisiyor',balon:'Checking the layout',uzun:'Checking interactions and layouts.',koltuk:8,yas:0},
    {id:'sample-manager',ad:'Project lead',durum:'calisiyor',nokta:'calisiyor',balon:'Following the work',uzun:'Coordinating the website.',koltuk:3,yas:0},
    {id:'sample-copy',ad:'Writing',durum:'bosta',nokta:'bosta',balon:'Ready',uzun:'Ready for the next task.',koltuk:1,yas:0},
    {id:'sample-research',ad:'Research',durum:'bosta',nokta:'bosta',balon:'Ready',uzun:'Ready for the next task.',koltuk:10,yas:0}],sayilar:{calisiyor:state.waiting?3:4,bekliyor:state.waiting?1:0,bosta:2,belirsiz:0,gecmis:0},zarflar:[],limit:null,pano:{gun:day,bugun:day,gunler:[day],kayitlar:[],enEski:day,alt:'Sample office',bos:'Activity appears here.',saklama:'Sample activity'}};}
  function updateOffice(){window.dispatchEvent(new CustomEvent('site-office-feed',{detail:feed()}));office.contentWindow?.postMessage({type:'ofis',data:feed()},location.origin);office.contentWindow?.postMessage({type:'ofis-pause',on:state.mode!=='office'||document.hidden||!state.inView},location.origin);$('.office-count').innerHTML=`<i class="status-dot"></i> ${tr('{n} working',{n:state.waiting?3:4})}`;if(!state.waiting&&!state.answered){$('#office-hint').textContent='Your agents are working. Try a question when you’re ready.';$('.open-question').innerHTML='Try a question <span aria-hidden="true">↗</span>';}}
  function caption(){$('#demo-caption').textContent=tr(state.mode==='office'?'A place for your team. Try a question, then open the agent’s speech bubble.':captions[state.page]);}
  function setMode(mode){state.mode=mode;desktop.dataset.mode=mode;$('#office-window').hidden=mode!=='office';$('#island-demo').hidden=mode!=='island';desktop.setAttribute('aria-labelledby',`tab-${mode}`);$$('[role=tab][data-mode]').forEach(tab=>{const active=tab.dataset.mode===mode;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});caption();updateOffice();}
  function choosePage(page){window.dispatchEvent(new CustomEvent('site-demo-state',{detail:{page}}));state.page=page;state.pending=restPages.includes(page)?null:page==='lyrics'?'media':page;setMode('island');post({type:'product-page',page});if($('#preview-tool'))$('#preview-tool').value=['line','hidden'].includes(page)?'rest':page;$$('[data-module]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.module===page)));$$('[data-look]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.look===page)));caption();}
  function toast(text){clearTimeout(toastTimer);$('#demo-toast').textContent=text;$('#demo-toast').hidden=false;toastTimer=setTimeout(()=>$('#demo-toast').hidden=true,4000);}
  function question(){setMode('office');office.contentWindow?.postMessage({type:'office-select',key:{provider:'claude',hostId:'demo',sessionId:'sample-design'}},location.origin);}
  function scenario(scroll=false){state.waiting=true;state.answered=false;$('#question-card').hidden=true;$('#office-hint').textContent='Click the Design agent’s speech bubble.';$('.open-question').innerHTML='View question <span class="arrow" aria-hidden="true">↗</span>';post({type:'product-question',waiting:true});choosePage('agents');if(scroll)$('#demo').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
  $$('[role=tab][data-mode]').forEach(tab=>{tab.addEventListener('click',()=>setMode(tab.dataset.mode));tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'island':e.key==='End'?'office':state.mode==='office'?'island':'office';setMode(next);$(`#tab-${next}`).focus();});});
  $$('[data-view],[data-explore]').forEach(el=>el.addEventListener('click',()=>{setMode(el.dataset.view||el.dataset.explore);if(el.dataset.explore)$('#demo').scrollIntoView();}));
  $$('[data-module]').forEach(b=>b.addEventListener('click',()=>choosePage(b.dataset.module)));
  $$('[data-look]').forEach(b=>b.addEventListener('click',()=>choosePage(b.dataset.look)));
  $('#preview-tool')?.addEventListener('change',event=>choosePage(event.currentTarget.value));
  $('#preview-settings').addEventListener('click',()=>{setMode('island');post({type:'product-settings'});});
  $$('[data-feature]').forEach(button=>button.addEventListener('click',()=>{const page=button.dataset.feature;if(page==='settings'){setMode('island');post({type:'product-settings'});}else if(page==='office')setMode('office');else if(page==='question'){scenario(true);setMode('office');}else choosePage(page);$('#demo').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}));
  $('#scenario').addEventListener('click',()=>scenario());$('#flow-demo').addEventListener('click',()=>{scenario(true);setMode('office');});
  $('.open-question').addEventListener('click',question);$('.close-question').addEventListener('click',()=>{$('#question-card').hidden=true;$('.open-question').focus({preventScroll:true});});
  $('.window-close').addEventListener('click',()=>{$('#question-card').hidden=true;setMode('island');});
  $('#question-form').addEventListener('submit',e=>{e.preventDefault();state.waiting=false;state.answered=true;$('#question-card').hidden=true;$('#office-hint').textContent='Reply sent. Design is working again.';$('.open-question').textContent='Replied ✓';post({type:'product-question',waiting:false});updateOffice();toast('Sample reply sent. Design is working again.');$('.open-question').focus({preventScroll:true});});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#question-card').hidden){$('#question-card').hidden=true;$('.open-question').focus({preventScroll:true});}else if(state.mode==='office'){setMode('island');$('#tab-island').focus({preventScroll:true});}});
  window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const msg=event.data;if(!msg)return;
    if(event.source===product.contentWindow){if(msg.type==='product-ready'){state.ready=true;post({type:'product-question',waiting:state.waiting});post({type:'product-page',page:state.page});}if(msg.type==='product-open-office')setMode('office');if(msg.type==='product-page-changed'&&msg.expanded&&!restPages.includes(state.page)){if(state.pending&&msg.page!==state.pending)return;state.pending=null;if(state.page==='lyrics'&&msg.page==='media')return;state.page=msg.page;if($('#preview-tool'))$('#preview-tool').value=msg.page;$$('[data-module]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.module===msg.page)));caption();}}
    if(event.source===office.contentWindow){if(msg.type==='ofis-ready')updateOffice();if(msg.type==='ofis-select'&&msg.id){if(msg.id==='sample-design'&&msg.part==='balon')question();else if(msg.part==='govde')toast('In the Windows app, clicking an agent opens its conversation. This office uses sample data.');}if(msg.type==='ofis-escape')$('#question-card').hidden=true;}
  });
  office.addEventListener('load',updateOffice);document.addEventListener('visibilitychange',updateOffice);
  new IntersectionObserver(([entry])=>{state.inView=entry.isIntersecting;updateOffice();},{threshold:.05}).observe(desktop);
  new ResizeObserver(()=>{const scale=Math.min(1,(desktop.clientWidth-12)/864);desktop.style.setProperty('--product-scale',String(scale));product.style.height=`${desktop.clientHeight/scale}px`;}).observe(desktop);
  window.addEventListener('site-languagechange',()=>{caption();updateOffice();});
  window.addEventListener('site-demo-page',event=>choosePage(event.detail.page));
  window.addEventListener('site-office-request',updateOffice);
  window.addEventListener('site-demo-start-question',()=>scenario(false));
  window.addEventListener('site-native-answered',()=>{state.waiting=false;state.answered=true;post({type:'product-question',waiting:false});updateOffice();});
  window.addEventListener('site-demo-question',event=>{scenario(true);setMode('office');if(event.detail?.open)question();});
  clock();setInterval(clock,15000);setMode('island');
})();
