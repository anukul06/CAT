import {BrowserWindow,desktopCapturer,screen,systemPreferences} from 'electron';
import {randomUUID} from 'node:crypto';
import type {Capture} from '../src/shared.js';
export function permission(){return process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'not-required';}
export function displays(){return screen.getAllDisplays().map((d,i)=>({id:String(d.id),name:d.label||`Display ${i+1}${d.id===screen.getPrimaryDisplay().id?' · Primary':''}`}));}
export async function captureDisplay(win:BrowserWindow,id:string):Promise<Capture>{
 const display=screen.getAllDisplays().find(d=>String(d.id)===id);
 if(!display)throw Error('That display is no longer connected. Choose another display.');
 if(permission()==='denied'||permission()==='restricted')throw Error('Screen Recording permission is required. Open System Settings → Privacy & Security → Screen Recording, enable ScreenSense AI (Electron during development), then restart the app.');
 const label=displays().find(d=>d.id===id)!.name;
 win.hide();
 try{
  await new Promise(resolve=>setTimeout(resolve,300));
  const ratio=Math.min(1,2560/display.size.width);
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*ratio),height:Math.round(display.size.height*ratio)}});
  const source=sources.find(s=>s.display_id===id)||(sources.length===1?sources[0]:undefined);
  if(!source||source.thumbnail.isEmpty())throw Error('No screen image was returned. Enable Screen Recording permission and restart ScreenSense.');
  const size=source.thumbnail.getSize();
  return {id:randomUUID(),dataUrl:`data:image/jpeg;base64,${source.thumbnail.toJPEG(88).toString('base64')}`,width:size.width,height:size.height,displayName:label};
 }finally{if(!win.isDestroyed())win.show();}
}
