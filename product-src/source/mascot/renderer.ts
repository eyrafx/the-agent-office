import { createStillMascot } from './still';
export interface MascotController { setState(state:any):void;setPointer(x:number,y:number):void;setVisible(on:boolean):void;setReducedMotion(on:boolean):void;dispose():void }
export const createMascot=(el:HTMLElement,o:any={})=>createStillMascot(el,o.reducedMotion);
