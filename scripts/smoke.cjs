const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const tmp=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'screensense-smoke-'));
app.setPath('userData',tmp);
app.whenReady().then(async()=>{
 await import('../dist-electron/electron/main.js');
 for(let i=0;i<100&&!BrowserWindow.getAllWindows().length;i++)await new Promise(r=>setTimeout(r,100));
 const win=BrowserWindow.getAllWindows()[0];
 if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await new Promise(r=>setTimeout(r,700));
 try{
 const initial=await win.webContents.executeJavaScript(`({pet:!!document.querySelector('.pet'),bridge:!!window.screensense,node:typeof window.require})`);
 if(!initial.pet||!initial.bridge||initial.node!=='undefined')throw Error(JSON.stringify(initial));
 await win.webContents.executeJavaScript(`document.querySelector('.pet').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));document.querySelector('.pet').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));`);
 await new Promise(r=>setTimeout(r,500));
 const expanded=await win.webContents.executeJavaScript(`!!document.querySelector('.panel')`);
 if(!expanded||win.getBounds().width!==432)throw Error('Panel failed to expand');
 await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
 await fs.writeFile(path.join(__dirname,'../artifacts/app.png'),(await win.capturePage()).toPNG());
 const checks=await win.webContents.executeJavaScript(`(async()=>{
 const api=window.screensense;const status=await api.status();
 let invalid=false;try{await api.send('')}catch{invalid=true;}
 let stale=false;try{await api.send('hello','expired')}catch{stale=true;}
 if(!invalid||!stale)throw Error('IPC validation failed');
 if(!status.configured){let missing=false;try{await api.send('hello')}catch(e){missing=e.message.includes('GEMINI_API_KEY');}if(!missing)throw Error('Missing key was not reported');}
 return {permission:status.permission,configured:status.configured,displays:(await api.displays()).length};
})()`);
 console.log('PASS: IPC validation and configuration handling',JSON.stringify(checks));
 if(process.env.SCREENSENSE_TEST_CAPTURE==='1'){
 const captured=await win.webContents.executeJavaScript(`(async()=>{
 document.querySelector('.capture-button').click();
 for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const img=document.querySelector('.preview img');if(img){const result={ok:true,width:img.naturalWidth,height:img.naturalHeight,approval:!!document.querySelector('.approve')};document.querySelector('[aria-label="Discard screenshot"]').click();return result;}const error=document.querySelector('[role="alert"]');if(error)return {ok:false,error:error.textContent};}
 return {ok:false,error:'Capture timed out, possibly awaiting OS permission'};
 })()`);
 console.log('CAPTURE:',JSON.stringify(captured));
 if(!captured.ok||!captured.approval)throw Error('Capture preview/approval test failed');
 await new Promise(r=>setTimeout(r,200));
 if(await win.webContents.executeJavaScript(`!!document.querySelector('.preview')`))throw Error('Discard did not remove preview');
 }
 // Exercise local tools through real React forms, then check typed IPC state.
 const tools=await win.webContents.executeJavaScript(`(async()=>{
 const pause=()=>new Promise(r=>setTimeout(r,200));
 const fill=(id,value)=>{const e=document.getElementById(id);const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};
 const tab=name=>Array.from(document.querySelectorAll('.assistant-tabs button')).find(b=>b.textContent.startsWith(name)).click();
 tab('Tasks');await pause();fill('task-title','Smoke test task');await pause();document.querySelector('.local-form').requestSubmit();await pause();
 let data=await window.screensense.assistant();const task=data.tasks.find(t=>t.title==='Smoke test task');if(!task||!document.querySelector('.task-card'))throw Error('Task form failed');
 await window.screensense.task({tool:'complete_task',id:task.id});await pause();if(!document.querySelector('.completed'))throw Error('Completion UI failed');
 tab('Memory');await pause();fill('memory-text','I approve concise replies for this test');await pause();document.querySelector('.approval-check input').click();await pause();document.querySelector('.local-form').requestSubmit();await pause();data=await window.screensense.assistant();const memory=data.memories[0];if(!memory||!document.querySelector('.memory-card'))throw Error('Memory approval form failed');
 document.querySelector('[aria-label="Edit memory"]').click();await pause();fill('memory-text','Updated approved preference');await pause();document.querySelector('.approval-check input').click();await pause();document.querySelector('.local-form').requestSubmit();await pause();if(!(await window.screensense.assistant()).memories.some(m=>m.text==='Updated approved preference'))throw Error('Memory edit failed');
 tab('Agents');await pause();if(!document.querySelector('.activity-row.success'))throw Error('Activity UI failed');
 await window.screensense.task({tool:'delete_task',id:task.id});await window.screensense.deleteMemory(memory.id);await pause();
 window.__reminderEvents=0;const off=window.screensense.onEvent(e=>{if(e.type==='reminder')window.__reminderEvents++;});
 const tasks=await window.screensense.task({tool:'create_reminder',input:{title:'ScreenSense notification test',dueAt:new Date(Date.now()+1200).toISOString()}});const reminder=tasks.find(t=>t.title==='ScreenSense notification test');
 let notification;for(let i=0;i<130;i++){await new Promise(r=>setTimeout(r,100));const t=(await window.screensense.assistant()).tasks.find(t=>t.id===reminder.id);if(t.notificationStatus==='sent'||t.notificationStatus==='failed'){notification=t.notificationStatus;break;}}
 off();if(window.__reminderEvents!==1||!notification)throw Error('Reminder did not fire exactly once');await window.screensense.task({tool:'delete_task',id:reminder.id});
 tab('Chat');return {taskForm:true,memoryApproval:true,memoryEdit:true,agentActivity:true,reminderEvents:window.__reminderEvents,desktopNotification:notification};
 })()`);
 console.log('PASS: Local assistant integration',JSON.stringify(tools));
 for(const tab of ['Tasks','Memory','Agents']){
 await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.assistant-tabs button')).find(b=>b.textContent.startsWith('${tab}')).click()`);
 await new Promise(r=>setTimeout(r,150));
 await fs.writeFile(path.join(__dirname,'../artifacts/'+tab.toLowerCase()+'.png'),(await win.capturePage()).toPNG());
 }
 await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Minimize chat"]').click()`);await new Promise(r=>setTimeout(r,150));
 const before=win.getBounds();
 await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.pet');p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,screenX:500,screenY:500}));p.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,screenX:480,screenY:480}));p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,screenX:480,screenY:480}));})()`);await new Promise(r=>setTimeout(r,150));
 const after=win.getBounds();if(after.width!==152||before.x===after.x&&before.y===after.y)throw Error('Drag toggled panel or did not move window');
 console.log('PASS: Pet drag moved native window without opening chat');
 console.log('PASS: Electron launched, isolated bridge loaded, pet rendered, chat expanded.');
 app.exit(0);
 }catch(e){console.error(e);app.exit(1)}
});
