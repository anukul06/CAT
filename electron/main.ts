import {app,BrowserWindow,ipcMain,screen,Menu,shell,dialog,Notification,powerMonitor,systemPreferences,type IpcMainInvokeEvent} from 'electron';
import {config} from 'dotenv';
import {randomUUID} from 'node:crypto';
import {captureDisplay,displays,permission} from './screenshot.js';
import {Gemma} from './gemma.js';
import {Coordinator} from './coordinator.js';
import {AssistantStore,titleText} from './assistant-store.js';
import {ReminderScheduler} from './reminders.js';
import {fitWindow} from './window-geometry.js';
import type {AssistantEvent,TaskOperation,MemoryInput} from '../src/shared.js';
import {AgentLogSource} from './agent-log.js';
import {AgentWatchService,WatchStore} from './agent-watch.js';
import {VoiceStore} from './voice-store.js';
import {Store} from './store.js';
import {question} from './validation.js';
import type {Capture,Message} from '../src/shared.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
// Keep existing user data/API configuration through the product rename.
const originalDataPath=app.getPath('userData');
app.setName('Desktop PA');
app.setPath('userData',app.isPackaged?path.join(app.getPath('appData'),'ScreenSense AI'):originalDataPath);
let win:BrowserWindow;
let pending:Capture|undefined;
let approvedImage:string|undefined;
let busy=false;
let capturing=false;
let messages:Message[]=[];
let expanded=false;
let voiceAllowedUntil=0;
let reminders:ReminderScheduler;
config({path:path.join(app.isPackaged?app.getPath('userData'):app.getAppPath(),'.env'),quiet:true});
const gemma=new Gemma(process.env.GEMINI_API_KEY,process.env.GEMMA_MODEL||'gemma-4-26b-a4b-it');
const store=new Store(app.getPath('userData'));
function emit(event:AssistantEvent){if(win&&!win.isDestroyed())win.webContents.send('screensense:event',event);}
const assistant=new AssistantStore(app.getPath('userData'),()=>{emit({type:'changed'});reminders?.reschedule();});
const voiceNotes=new VoiceStore(app.getPath('userData'),()=>emit({type:'changed'}));
const watchStore=new WatchStore(app.getPath('userData'),()=>emit({type:'changed'}));
const watch=new AgentWatchService(watchStore,gemma,id=>captureDisplay(win,id),new AgentLogSource(process.env.GEMINI_API_KEY));
const coordinator=new Coordinator(assistant,gemma,activity=>emit({type:'activity',activity}));
function snapshot(){return {...assistant.snapshot(),voiceNotes:voiceNotes.list(),activity:coordinator.activity,dataPath:app.getPath('userData'),notificationsSupported:Notification.isSupported()};}
const notifications=new Set<Notification>();
async function notify(task:import('../src/shared.js').Task):Promise<boolean>{
 emit({type:'reminder',task});coordinator.record('TaskAgent','success','Reminder due: '+task.title);
 if(!Notification.isSupported())return false;
 return new Promise(resolve=>{
  const n=new Notification({id:task.id,groupId:'screensense-reminders',title:'Desktop PA · A little nudge',body:task.title,silent:false});notifications.add(n);
  let done=false;const finish=(sent:boolean)=>{if(done)return;done=true;clearTimeout(timeout);resolve(sent);};
  const timeout=setTimeout(()=>{notifications.delete(n);finish(false);},10000);
  n.on('show',()=>finish(true));n.on('failed',(_event,reason)=>{console.warn('[Desktop PA notification]',String(reason).slice(0,400));notifications.delete(n);finish(false);});
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
 handle('watch-history',()=>watch.history());
 handle('watch-log-connect',async()=>{if(busy||capturing)throw Error('Please wait for the current operation.');const choice=await dialog.showOpenDialog(win,{title:'Choose an agent log to read',properties:['openFile'],filters:[{name:'Agent logs',extensions:['log','txt','jsonl','json','out']},{name:'All files',extensions:['*']}]});if(choice.canceled||!choice.filePaths[0])return undefined;return watch.connectLog(choice.filePaths[0]);});
 handle('watch-log-tail',()=>watch.logTail());
 handle('watch-log-review',()=>watch.reviewLog());
 handle('watch-log-disconnect',()=>watch.disconnectLog());
 handle('watch-capture',async(id:unknown)=>{if(busy||capturing)throw Error('Please wait for the current operation.');capturing=true;try{return await watch.capture(id);}finally{capturing=false;}});
 handle('watch-discard',()=>watch.discard());
 handle('watch-clear',()=>watch.clear());
 handle('watch-analyze',async(request:import('../src/shared.js').WatchRequest)=>{
  if(busy||capturing)throw Error('Please wait for the current operation.');busy=true;
  try{const entry=await coordinator.run('AgentWatch','Reading approved agent output',()=>watch.analyze(request));emit({type:'watch-result',entry});return entry;}finally{busy=false;}
 });
 handle('voice-permission',async()=>{
  if(process.platform==='darwin'&&!await systemPreferences.askForMediaAccess('microphone'))throw Error('Microphone access is off. Enable Electron or Desktop PA in System Settings → Privacy & Security → Microphone, then restart.');
  voiceAllowedUntil=Date.now()+30000;
 });
 handle('voice-save',(input:import('../src/shared.js').VoiceNoteInput)=>voiceNotes.save(input));
 handle('voice-audio',(id:unknown)=>voiceNotes.audio(id));
 handle('voice-delete',(id:unknown)=>voiceNotes.delete(id));
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
 win=new BrowserWindow({width:152,height:154,x:area.x+area.width-180,y:area.y+area.height-180,transparent:true,frame:false,resizable:false,alwaysOnTop:true,hasShadow:false,backgroundColor:'#00000000',title:'Desktop PA',webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 const session=win.webContents.session;
 session.setPermissionCheckHandler((contents,permission,_origin,details)=>contents===win.webContents&&details.isMainFrame&&permission==='media'&&details.mediaType==='audio'&&Date.now()<voiceAllowedUntil);
 session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===win.webContents&&details.isMainFrame&&permission==='media'&&'mediaTypes' in details&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length>0&&details.mediaTypes.every(type=>type==='audio')&&Date.now()<voiceAllowedUntil));
 handle('expanded',(open)=>{if(typeof open!=='boolean')throw Error('Invalid window state');expanded=open;win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,open));});
 handle('move',(dx,dy)=>{if(!Number.isFinite(dx)||!Number.isFinite(dy))return;const b=win.getBounds();const a=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;if(Math.abs(dx)>2000||Math.abs(dy)>2000)throw Error('Invalid drag distance');win.setPosition(Math.round(Math.max(a.x,Math.min(b.x+dx,a.x+a.width-b.width))),Math.round(Math.max(a.y,Math.min(b.y+dy,a.y+a.height-b.height))));});
 handle('quit',()=>app.quit());
 win.on('closed',()=>app.quit());
 if(process.env.SCREENSENSE_DEV_URL)void win.loadURL(process.env.SCREENSENSE_DEV_URL);else void win.loadFile(path.join(here,'../../dist/index.html'));
}
if(!app.requestSingleInstanceLock()){app.quit();}else app.whenReady().then(()=>{Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Desktop PA',submenu:[{role:'quit'}]}]));Promise.all([store.read(),assistant.load(),voiceNotes.load(),watchStore.load()]).then(([history])=>{messages=history;createWindow();registerFeatures();reminders=new ReminderScheduler(assistant,notify,()=>coordinator.record('TaskAgent','error','Reminder delivery failed. Check Tasks and notification settings.'));reminders.start();powerMonitor.on('resume',()=>void reminders.tick());screen.on('display-metrics-changed',()=>{if(!win.isDestroyed())win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,expanded));});screen.on('display-removed',()=>{if(!win.isDestroyed())win.setBounds(fitWindow(win.getBounds(),screen.getDisplayMatching(win.getBounds()).workArea,expanded));});}).catch(error=>{console.error(error.message);app.quit();});});
app.on('before-quit',()=>reminders?.stop());
app.on('window-all-closed',()=>app.quit());
