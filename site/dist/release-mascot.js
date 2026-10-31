(() => {
 'use strict';
 // The closing mascot is a small framed page. If that page is ever missing (for example while the
 // product pages are being rebuilt, or on a wrong base path) the site's 404 page would show inside
 // the little frame; instead, try once more and otherwise leave the frame out.
 const frame=document.querySelector('.release-mascot');
 // The kawaii site shows the pink Octo clip here as a plain picture; only a frame needs this check.
 if(!frame||frame.tagName!=='IFRAME')return;
 let retried=false;
 frame.addEventListener('load',()=>{
  let ok=false;
  try{ok=!!frame.contentDocument?.querySelector('#mascot');}catch{ok=true;}
  if(ok){frame.hidden=false;return;}
  if(!retried){retried=true;setTimeout(()=>{frame.src=frame.src;},1500);return;}
  frame.hidden=true;
 });
})();
