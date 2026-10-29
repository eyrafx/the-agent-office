import fs from 'node:fs/promises';
import {copy,en,headlines} from './site-copy.mjs';
import {statusCopy} from './status-copy.mjs';
import {showcaseCopy} from './showcase-copy.mjs';
import {referenceCopy} from './reference-copy.mjs';
import {polishCopy} from './polish-copy.mjs';
import {launchCopy} from './launch-copy.mjs';
import {supportCopy} from './support-copy.mjs';
import {weatherCopy} from './weather-copy.mjs';
import {scenesCopy} from './scenes-copy.mjs';
import {walletCopy} from './wallet-copy.mjs';
import {pledgeCopy} from './pledge-copy.mjs';
import {noteCopy} from './note-copy.mjs';
import {footerCopy} from './footer-copy.mjs';
import {sectionCopy} from './section-copy.mjs';
import {filesCopy} from './files-copy.mjs';
import {contactCopy} from './contact-copy.mjs';
for(const id of Object.keys(copy)){const extra=statusCopy[id]?.split('\n');if(extra?.length!==10)throw new Error(`Incomplete status copy: ${id}`);copy[id].push(...extra);}
for(const id of Object.keys(copy)){const extra=showcaseCopy[id]?.split('|');if(extra?.length!==29)throw new Error(`Incomplete showcase copy: ${id}`);copy[id].push(...extra);}
for(const id of Object.keys(copy)){if(referenceCopy[id]?.length!==6)throw new Error('Incomplete reference copy '+id);copy[id].push(...referenceCopy[id]);}
for(const id of Object.keys(copy)){if(polishCopy[id]?.length!==3)throw new Error('Incomplete polish copy '+id);copy[id].push(...polishCopy[id]);}
for(const id of Object.keys(copy)){if(launchCopy[id]?.length!==18)throw new Error('Incomplete launch copy '+id);copy[id].push(...launchCopy[id]);}
for(const id of Object.keys(copy)){if(supportCopy[id]?.length!==55)throw new Error('Incomplete support copy '+id);copy[id].push(...supportCopy[id]);}
for(const id of Object.keys(copy)){if(weatherCopy[id]?.length!==6)throw new Error('Incomplete weather copy '+id);copy[id].push(...weatherCopy[id]);}
for(const id of Object.keys(copy)){if(scenesCopy[id]?.length!==3)throw new Error('Incomplete scenes copy '+id);copy[id].push(...scenesCopy[id]);}
for(const id of Object.keys(copy)){if(walletCopy[id]?.length!==5)throw new Error('Incomplete wallet copy '+id);copy[id].push(...walletCopy[id]);}
for(const id of Object.keys(copy)){if(pledgeCopy[id]?.length!==4)throw new Error('Incomplete pledge copy '+id);copy[id].push(...pledgeCopy[id]);}
for(const id of Object.keys(copy)){if(noteCopy[id]?.length!==11)throw new Error('Incomplete note copy '+id);copy[id].push(...noteCopy[id]);}
for(const id of Object.keys(copy)){if(footerCopy[id]?.length!==6)throw new Error('Incomplete footer copy '+id);copy[id].push(...footerCopy[id]);}
for(const id of Object.keys(copy)){if(sectionCopy[id]?.length!==4)throw new Error('Incomplete section copy '+id);copy[id].push(...sectionCopy[id]);}
for(const id of Object.keys(copy)){if(filesCopy[id]?.length!==4)throw new Error('Incomplete files copy '+id);copy[id].push(...filesCopy[id]);}
for(const id of Object.keys(copy)){if(contactCopy[id]?.length!==3)throw new Error('Incomplete contact copy '+id);copy[id].push(...contactCopy[id]);}
for(const [id,values] of Object.entries(copy)){
 if(values.length!==en.length||values.some(x=>!x))throw new Error(`Incomplete ${id}: ${values.length}/${en.length}`);
 for(let i=0;i<en.length;i++)if(en[i].includes('{n}')&&!values[i].includes('{n}'))throw new Error(`Missing variable ${id}:${i}`);
}
await fs.writeFile('dist/site-translations.js',`window.AO_COPY=${JSON.stringify({copy,headlines})};\n`);
let html=await fs.readFile('dist/index.html','utf8');
if(!html.includes('site-i18n.js'))html=html.replace('<script src="demo.js" defer></script>','<script src="site-translations.js" defer></script><script src="site-i18n.js" defer></script><script src="demo.js" defer></script>');
const languages=[['tr','TR','Türkçe','tr-TR'],['en','EN','English','en-US'],['es','ES','Español','es-ES'],['de','DE','Deutsch','de-DE'],['fr','FR','Français','fr-FR'],['pt-BR','PT-BR','Português (Brasil)','pt-BR'],['it','IT','Italiano','it-IT'],['ru','RU','Русский','ru-RU'],['ja','JA','日本語','ja-JP'],['ko','KO','한국어','ko-KR'],['zh-Hans','ZH','简体中文','zh-CN']];
if(!html.includes('site-language-menu')){
 const control=`<details class="site-language" id="site-language-menu"><summary aria-label="Language"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg><span id="site-language-code">EN</span><svg class="site-language-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></summary><div class="site-language-options" role="group" aria-label="Language">${languages.map(([id,code,name,tag])=>`<button type="button" data-site-lang="${id}" lang="${tag}" aria-pressed="${id==='en'}"><span>${name}</span><i>${code}</i></button>`).join('')}</div></details>`;
 const cta=html.match(/<a class="header-try"[^]*?<\/a>/)[0];
 html=html.replace(cta,`<div class="header-actions">${cta}${control}</div>`);
}
html=html.replace(/<div class="language-list">[^]*?<\/div>/,`<div class="language-list" role="group" aria-label="Language">${languages.map(([id,code,name,tag])=>`<button type="button" lang="${tag}" data-site-lang="${id}" aria-pressed="${id==='en'}"><i>${code}</i>${name}</button>`).join('')}</div>`);
await fs.writeFile('dist/index.html',html);
console.log(`Validated ${en.length} messages × ${Object.keys(copy).length} languages.`);
