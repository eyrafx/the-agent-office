import {createStillMascot} from './source/mascot/still';
import './mascot-preview.css';
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const mascot=createStillMascot(document.querySelector<HTMLElement>('#mascot')!,reduced.matches);
reduced.addEventListener('change',event=>mascot.setReducedMotion(event.matches));
window.addEventListener('pagehide',()=>mascot.dispose(),{once:true});
