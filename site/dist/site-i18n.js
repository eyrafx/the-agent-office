(() => {
 'use strict';
 const {copy,headlines}=window.AO_COPY;
 const ids=Object.keys(copy), source=copy.en, dictionary=new Map(source.map((text,index)=>[text,index]));
 const names={'tr':'TR','en':'EN','es':'ES','de':'DE','fr':'FR','pt-BR':'PT-BR','it':'IT','ru':'RU','ja':'JA','ko':'KO','zh-Hans':'ZH'};
 const tags={tr:'tr-TR',en:'en-US',es:'es-ES',de:'de-DE',fr:'fr-FR','pt-BR':'pt-BR',it:'it-IT',ru:'ru-RU',ja:'ja-JP',ko:'ko-KR','zh-Hans':'zh-CN'};
 let lang='en';
 const records=new Map(),attributes=new Map();
 const excluded='script,style,.brand,.language-list,.site-language,h1,.desktop-clock';
 function t(text,vars={}){const index=dictionary.get(text);let out=index===undefined?text:copy[lang][index];for(const [key,value] of Object.entries(vars))out=out.split(`{${key}}`).join(String(value));return out;}
 function original(text){if(dictionary.has(text))return text;const index=copy[lang].indexOf(text);return index<0?null:source[index];}
 function collect(root){
   if(root.nodeType===3){const text=root.nodeValue.trim(),base=original(text);if(base&&!root.parentElement?.closest(excluded)){records.set(root,base);root.nodeValue=root.nodeValue.replace(text,t(base));}return;}
   if(root.nodeType!==1||root.matches(excluded))return;
   for(const attr of ['aria-label','title','alt']){const value=root.getAttribute(attr);if(value&&dictionary.has(value)){let attrs=attributes.get(root);if(!attrs){attrs={};attributes.set(root,attrs);}attrs[attr]=value;root.setAttribute(attr,t(value));}}
   [...root.childNodes].forEach(collect);
 }
 collect(document.body);
 const observer=new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)collect(node);});
 observer.observe(document.body,{childList:true,subtree:true});
 function apply(id,persist=false){
   if(!ids.includes(id))return;
   lang=id;document.documentElement.lang=tags[id];
   for(const [node,base] of records){if(!node.isConnected){records.delete(node);continue;}const padding=node.nodeValue.match(/^(\s*)[^]*?(\s*)$/);node.nodeValue=(padding?.[1]||'')+t(base)+(padding?.[2]||'');}
   for(const [el,attrs] of attributes)if(el.isConnected)for(const [attr,base] of Object.entries(attrs))el.setAttribute(attr,t(base));
   document.querySelector('h1').innerHTML=headlines[id].join('<br>');
   document.title='The Agent Office — '+headlines[id].join(' ').replace(/<[^>]*>/g,'');
   document.querySelector('meta[name="description"]').content=t(source[8]);
   document.querySelectorAll('[data-site-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.siteLang===id)));
   document.querySelector('#site-language-code').textContent=names[id];
   document.querySelector('.site-language summary').setAttribute('aria-label',t('Language'));
   document.querySelector('.site-language-options').setAttribute('aria-label',t('Language'));
   document.querySelector('.language-list').setAttribute('aria-label',t('Language'));
   document.querySelector('.brand[aria-label]')?.setAttribute('aria-label',t('The Agent Office home'));
   document.querySelectorAll('iframe[src*="product/"]').forEach(frame=>{const url=new URL(frame.getAttribute('src'),location.href);if(url.searchParams.get('lang')!==id){url.searchParams.set('lang',id);frame.src=url.pathname+url.search;}});
   if(persist){try{localStorage.setItem('agentoffice:site-language',id);}catch{}const url=new URL(location.href);url.searchParams.set('lang',id);history.replaceState(null,'',url);}
   window.dispatchEvent(new CustomEvent('site-languagechange',{detail:{language:id}}));
 }
 window.AO_I18N={t,get language(){return lang;}};
 document.querySelectorAll('[data-site-lang]').forEach(button=>button.addEventListener('click',()=>{const fromHeader=!!button.closest('.site-language');apply(button.dataset.siteLang,true);const menu=document.querySelector('#site-language-menu');menu.open=false;if(fromHeader)menu.querySelector('summary').focus({preventScroll:true});}));
 document.addEventListener('click',event=>{const menu=document.querySelector('#site-language-menu');if(!menu.contains(event.target))menu.open=false;});
 document.addEventListener('keydown',event=>{const menu=document.querySelector('#site-language-menu');if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
 let initial=new URLSearchParams(location.search).get('lang');
 if(!ids.includes(initial))try{initial=localStorage.getItem('agentoffice:site-language');}catch{}
 apply(ids.includes(initial)?initial:'en');
})();
