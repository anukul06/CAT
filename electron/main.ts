import {app,BrowserWindow,ipcMain,screen,Menu,shell,Notification,powerMonitor,type IpcMainInvokeEvent} from 'electron';
import {config} from 'dotenv';
import {randomUUID} from 'node:crypto';
import {captureDisplay,displays,permission} from './screenshot.js';
import {Gemma} from './gemma.js';
import {Coordinator} from './coordinator.js';
import {AssistantStore,titleText} from './assistant-store.js';
import {ReminderScheduler} from './reminders.js';
import {fitWindow} from './window-geometry.js';
import type {AssistantEvent,TaskOperation,MemoryInput} from '../src/shared.js';
import {Store} from './store.js';
import {question} from './validation.js';
import type {Capture,Message} from '../src/shared.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
let win:BrowserWindow;
let pending:Capture|undefined;
let approvedImage:string|undefined;
let busy=false;
let capturing=false;
let messages:Message[]=[];
let expanded=false;
let reminders:ReminderScheduler;
config({path:path.join(app.isPackaged?app.getPath('userData'):app.getAppPath(),'.env'),quiet:true});
const gemma=new Gemma(process.env.GEMINI_API_KEY,process.env.GEMMA_MODEL||'gemma-4-26b-a4b-it');
const store=new Store(app.getPath('userData'));
function emit(event:AssistantEvent){if(win&&!win.isDestroyed())win.webContents.send('screensense:event',event);}
const assistant=new AssistantStore(app.getPath('userData'),()=>{emit({type:'changed'});reminders?.reschedule();});
const coordinator=new Coordinator(assistant,gemma,activity=>emit({type:'activity',activity}));
function snapshot(){return {...assistant.snapshot(),activity:coordinator.activity,dataPath:app.getPath('userData'),notificationsSupported:Notification.isSupported()};}
const notifications=new Set<Notification>();
async function notify(task:import('../src/shared.js').Task):Promise<boolean>{
 emit({type:'reminder',task});coordinator.record('TaskAgent','success','Reminder due: '+task.title);
 if(!Notification.isSupported())return false;
 return new Promise(resolve=>{
  const n=new Notification({id:task.id,groupId:'screensense-reminders',title:'ScreenSense · A little nudge',body:task.title,silent:false});notifications.add(n);
  let done=false;const finish=(sent:boolean)=>{if(done)return;done=true;clearTimeout(timeout);resolve(sent);};
  const timeout=setTimeout(()=>{notifications.delete(n);finish(false);},10000);
  n.on('show',()=>finish(true));n.on('failed',(_event,reason)=>{console.warn('[ScreenSense notification]',String(reason).slice(0,400));notifications.delete(n);finish(false);});
  n.on('close',()=>notifications.delete(n));n.on('click',()=>{if(!win.isDestroyed()){win.show();win.focus();}notifications.delete(n);});
  try{n.show();}catch{notifications.delete(n);finish(false);}
 });
}
function handle(name:string,fn:(...args:any[])=>unknown){
 ipcMain.handle('screensense:'+name,(event:IpcMainInvokeEvent,...args:unknown[])=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted IPC sender');
  return fn(...args);
 });
}
function registerFeatures(){
 handle('status',()=>({configured:gemma.configured,model:gemma.model,permission:permission()}));
 handle('history',()=>messages);
 handle('assistant',snapshot);
 handle('task',async(operation:TaskOperation)=>{const result=await coordinator.task(operation);reminders.reschedule();return result;});
 handle('memory-save',(input:MemoryInput)=>coordinator.saveMemory(input));
 handle('memory-delete',(id:unknown)=>coordinator.run('MemoryAgent','Delete memory',async()=>{await assistant.deleteMemory(titleText(id,100));return assistant.snapshot().memories;}));
 handle('memory-clear',()=>coordinator.run('MemoryAgent','Clear all memories',()=>assistant.clearMemories()));
 handle('displays',displays);
 handle('permissions',()=>process.platform==='darwin'?shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'):undefined);
 handle('capture',async(id:unknown)=>{if(busy||capturing)throw Error('Please wait for the current operation.');if(typeof id!=='string'||id.length>100)throw Error('Choose a display.');capturing=true;pending=undefined;try{pending=await captureDisplay(win,id);return pending;}finally{capturing=false;}});
 handle('discard',()=>{if(busy||capturing)throw Error('Please wait.');pending=undefined;});
 handle('clear',async()=>{if(busy||capturing)throw Error('Please wait.');await store.save([]);messages=[];pending=undefined;approvedImage=undefined;});
 handle('send',async(raw:unknown,captureId:unknown)=>{
  if(busy||capturing)throw Error('Please wait for the current operation.');
  const q=question(raw);
  if(captureId!==undefined&&(typeof captureId!=='string'||!pending||pending.id!==captureId))throw Error('Screenshot expired. Capture and approve it again.');
  if(pending&&captureId===undefined)throw Error('Approve or discard the screenshot first.');
  busy=true;
  try{
   const image=captureId?pending!.dataUrl.split(',')[1]:approvedImage;
   const result=await coordinator.execute({question:q,image,forceVision:!!captureId,messages});
   const answer=result.answer;
   const next:Message[]=[...messages,{id:randomUUID(),role:'user' as const,text:q,createdAt:new Date().toISOString(),image:result.imageUsed},{id:randomUUID(),role:'assistant' as const,agent:result.agent,text:answer,createdAt:new Date().toISOString()}].slice(-100);
   await store.save(next);
   messages=next;if(captureId){approvedImage=image;pending=undefined;}return messages;
  }finally{busy=false;}
 });
}
function createWindow(){
 const area=screen.getPrimaryDisplay().workArea;
 win=new BrowserWindow({width:152,height:154,x:area.x+area.width-180,y:area.y+area.height-180,transparent:true,frame:false,resizable:false,alwaysOnTop:true,hasShadow:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 handle('expanded',(open)=>{if(typeof open!=='boolean')throw Error('Invalid window state');expanded=open;win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,open));});
 handle('move',(dx,dy)=>{if(!Number.isFinite(dx)||!Number.isFinite(dy))return;const b=win.getBounds();const a=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;if(Math.abs(dx)>2000||Math.abs(dy)>2000)throw Error('Invalid drag distance');win.setPosition(Math.round(Math.max(a.x,Math.min(b.x+dx,a.x+a.width-b.width))),Math.round(Math.max(a.y,Math.min(b.y+dy,a.y+a.height-b.height))));});
 handle('quit',()=>app.quit());
 win.on('closed',()=>app.quit());
 if(process.env.SCREENSENSE_DEV_URL)void win.loadURL(process.env.SCREENSENSE_DEV_URL);else void win.loadFile(path.join(here,'../../dist/index.html'));
}
if(!app.requestSingleInstanceLock()){app.quit();}else app.whenReady().then(()=>{Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'ScreenSense AI',submenu:[{role:'quit'}]}]));Promise.all([store.read(),assistant.load()]).then(([history])=>{messages=history;createWindow();registerFeatures();reminders=new ReminderScheduler(assistant,notify,()=>coordinator.record('TaskAgent','error','Reminder delivery failed. Check Tasks and notification settings.'));reminders.start();powerMonitor.on('resume',()=>void reminders.tick());screen.on('display-metrics-changed',()=>{if(!win.isDestroyed())win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,expanded));});screen.on('display-removed',()=>{if(!win.isDestroyed())win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,expanded));});}).catch(error=>{console.error(error.message);app.quit();});});
app.on('before-quit',()=>reminders?.stop());
app.on('window-all-closed',()=>app.quit());
