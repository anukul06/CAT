const {app,BrowserWindow,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const tmp=require('node:fs').mkdtempSync(path.join(os.tmpdir(),'screensense-smoke-'));
app.setPath('userData',tmp);
app.whenReady().then(async()=>{
 if(process.env.SCREENSENSE_WATCH_RESULTS)await fs.copyFile(path.resolve(process.env.SCREENSENSE_WATCH_RESULTS),path.join(tmp,'agent-watch.json'));
 const testLog=path.join(tmp,'controlled-agent.log');await fs.writeFile(testLog,'CONTROLLED LOG TEST\n[agent] Working: tests running\n');
 // Only this isolated test's native chooser is replaced; the production API accepts no renderer path.
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[testLog]});
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
 document.querySelector('.composer-area .capture-button').click();
 for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const img=document.querySelector('.conversation .preview img');if(img){const result={ok:true,width:img.naturalWidth,height:img.naturalHeight,approval:!!document.querySelector('.approve')};document.querySelector('.conversation [aria-label="Discard screenshot"]').click();return result;}const error=document.querySelector('[role="alert"]');if(error)return {ok:false,error:error.textContent};}
 return {ok:false,error:'Capture timed out, possibly awaiting OS permission'};
 })()`);
 console.log('CAPTURE:',JSON.stringify(captured));
 if(!captured.ok||!captured.approval)throw Error('Capture preview/approval test failed');
 await new Promise(r=>setTimeout(r,200));
 if(await win.webContents.executeJavaScript(`!!document.querySelector('.conversation .preview')`))throw Error('Discard did not remove preview');
 }
 // Agent Watch uses a separate approval gate and cannot send a stale capture.
 const watchChecks=await win.webContents.executeJavaScript(`(async()=>{
 const button=Array.from(document.querySelectorAll('.assistant-tabs button')).find(b=>b.textContent==='Agent Watch');if(!button)throw Error('Agent Watch tab missing');button.click();await new Promise(r=>setTimeout(r,250));
 const history=await window.screensense.watchHistory();let stale=false;try{await window.screensense.watchAnalyze({captureId:'not-approved'});}catch(e){stale=e.message.includes('expired');}if(!stale)throw Error('Agent Watch approval gate failed');
 if(history.length){if(!document.querySelector('.watch-result'))throw Error('Watch saved result did not render');const items=document.querySelectorAll('.watch-timeline-item');if(items.length!==history.length)throw Error('Timeline count mismatch');items[items.length-1].click();await new Promise(r=>setTimeout(r,80));if(!document.querySelector('.watch-result').textContent.includes(history[history.length-1].doing))throw Error('Timeline selection failed');items[0].click();await new Promise(r=>setTimeout(r,80));if(history[0].comparison&&!document.querySelector('.watch-change'))throw Error('Saved comparison did not render');}

 return {tab:true,staleRejected:true,savedSummaries:history.length};
 })()`);
 console.log('PASS: Agent Watch UI and isolated approval gate',JSON.stringify(watchChecks));
 const logFrozen=await win.webContents.executeJavaScript(`(async()=>{
 document.querySelector('.log-connect').click();for(let i=0;i<30&&!document.querySelector('.log-tail');i++)await new Promise(r=>setTimeout(r,100));if(!document.querySelector('.log-tail')?.textContent.includes('CONTROLLED LOG TEST'))throw Error('Selected log preview missing');document.querySelector('.log-review').click();for(let i=0;i<30&&!document.querySelector('.log-frozen-heading');i++)await new Promise(r=>setTimeout(r,100));if(!document.querySelector('.watch-approve'))throw Error('Log approval control missing');return document.querySelector('.log-tail').textContent;
 })()`);
 await fs.appendFile(testLog,'NEW OUTPUT AFTER REVIEW\n');await new Promise(r=>setTimeout(r,2200));
 await win.webContents.executeJavaScript(`(async()=>{if(document.querySelector('.log-tail').textContent.includes('NEW OUTPUT AFTER REVIEW'))throw Error('Frozen excerpt changed before approval');document.querySelector('.log-frozen-heading .text-button').click();await new Promise(r=>setTimeout(r,150));if(document.querySelector('.watch-review-card'))throw Error('Discard log excerpt failed');document.querySelector('.log-source-actions .text-button').click();await new Promise(r=>setTimeout(r,150));if(document.querySelector('.log-tail'))throw Error('Log disconnect failed');})()`);
 console.log('PASS: Selected log preview, frozen approval, discard and disconnect; no AI request',!!logFrozen);
 if(process.env.SCREENSENSE_TEST_CAPTURE==='1'){
 const preview=await win.webContents.executeJavaScript(`(async()=>{
 const before=(await window.screensense.watchHistory()).length;Array.from(document.querySelectorAll('.watch-source-picker button')).find(b=>b.textContent==='Screenshot').click();await new Promise(r=>setTimeout(r,100));document.querySelector('.watch-capture').click();
 for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));if(document.querySelector('.watch-preview img')){if(!document.querySelector('.watch-approve'))throw Error('Watch approval missing');if(before&&!document.querySelector('.watch-compare-toggle input').checked)throw Error('Comparison approval toggle missing');document.querySelector('.watch-preview [aria-label="Discard screenshot"]').click();await new Promise(r=>setTimeout(r,100));if(document.querySelector('.watch-preview'))throw Error('Discard failed');if((await window.screensense.watchHistory()).length!==before)throw Error('Unapproved capture was saved');return true;}const error=document.querySelector('.watch-error');if(error)throw Error(error.textContent);}
 throw Error('Watch capture timed out');
 })()`);
 console.log('PASS: Native Agent Watch preview/approval/discard without transmission',preview);
 }
 await win.webContents.executeJavaScript(`document.querySelector('.watch-error button[aria-label="Dismiss Agent Watch error"]')?.click()`);
 await fs.writeFile(path.join(__dirname,'../artifacts/watch.png'),(await win.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`document.querySelector('.assistant-tabs button').click()`);
 // Exercise local tools through real React forms, then check typed IPC state.
 const tools=await win.webContents.executeJavaScript(`(async()=>{
 const pause=()=>new Promise(r=>setTimeout(r,200));
 const fill=(id,value)=>{const e=document.getElementById(id);const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};
 const tab=name=>Array.from(document.querySelectorAll('.assistant-tabs button')).find(b=>b.textContent.startsWith(name)).click();
 tab('Tasks');await pause();
 document.querySelector('.quick-due-row button').click();await pause();if(new Date(document.getElementById('task-due').value).getTime()<=Date.now())throw Error('Quick due is not future');
 fill('task-due','2020-01-01T12:00');await pause();if(!document.querySelector('.task-editor .field-error')||!document.querySelector('.task-editor .primary-button').disabled)throw Error('Past date validation failed');
 document.querySelector('.cancel-button').click();await pause();fill('task-title','Smoke test task');await pause();document.querySelector('.local-form').requestSubmit();await pause();
 let data=await window.screensense.assistant();const task=data.tasks.find(t=>t.title==='Smoke test task');if(!task||!document.querySelector('.task-card'))throw Error('Task form failed');
 await window.screensense.task({tool:'complete_task',id:task.id});await pause();if(!document.querySelector('.completed'))throw Error('Completion UI failed');
 tab('Memory');await pause();fill('memory-text','I approve concise replies for this test');await pause();document.querySelector('.approval-check input').click();await pause();document.querySelector('.local-form').requestSubmit();await pause();data=await window.screensense.assistant();const memory=data.memories[0];if(!memory||!document.querySelector('.memory-card'))throw Error('Memory approval form failed');
 document.querySelector('[aria-label="Edit memory"]').click();await pause();fill('memory-text','Updated approved preference');await pause();document.querySelector('.approval-check input').click();await pause();document.querySelector('.local-form').requestSubmit();await pause();if(!(await window.screensense.assistant()).memories.some(m=>m.text==='Updated approved preference'))throw Error('Memory edit failed');
 // Record a generated tone through real MediaRecorder; no microphone or room audio is used.
 const ctx=new AudioContext();const destination=ctx.createMediaStreamDestination();const oscillator=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=0.05;oscillator.connect(gain).connect(destination);oscillator.start();
 const chunks=[];const recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus'});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const blob=await new Promise((resolve,reject)=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));recorder.onerror=e=>reject(Error('MediaRecorder: '+e.error?.message));recorder.start();setTimeout(()=>recorder.stop(),600);});
 oscillator.stop();destination.stream.getTracks().forEach(t=>t.stop());await ctx.close();
 const notes=await window.screensense.saveVoiceNote({title:'Integration tone',duration:0.6,mimeType:blob.type,bytes:new Uint8Array(await blob.arrayBuffer())});await pause();
 for(let i=0;i<40&&!document.querySelector('.voice-note');i++)await new Promise(r=>setTimeout(r,50));if(!document.querySelector('.voice-note'))throw Error('Saved voice note did not render');
 const voice=notes.find(n=>n.title==='Integration tone');const source=await window.screensense.voiceAudio(voice.id);const audio=new Audio(source);audio.muted=true;await audio.play().catch(e=>{throw Error('Audio playback: '+e.name+' '+e.message)});audio.pause();
 await window.screensense.deleteVoiceNote(voice.id);await pause();if(document.querySelector('.voice-note'))throw Error('Voice note delete failed');
 if((await window.screensense.assistant()).activity.length===0)throw Error('Agent events missing');if(Array.from(document.querySelectorAll('.assistant-tabs button')).some(b=>b.textContent==='Agents'))throw Error('Removed Agents tab still visible');
 await window.screensense.task({tool:'delete_task',id:task.id});await window.screensense.deleteMemory(memory.id);await pause();
 window.__reminderEvents=0;const off=window.screensense.onEvent(e=>{if(e.type==='reminder')window.__reminderEvents++;});
 const tasks=await window.screensense.task({tool:'create_reminder',input:{title:'ScreenSense notification test',dueAt:new Date(Date.now()+1200).toISOString()}});const reminder=tasks.find(t=>t.title==='ScreenSense notification test');
 let notification;for(let i=0;i<130;i++){await new Promise(r=>setTimeout(r,100));const t=(await window.screensense.assistant()).tasks.find(t=>t.id===reminder.id);if(t.notificationStatus==='sent'||t.notificationStatus==='failed'){notification=t.notificationStatus;break;}}
 off();if(window.__reminderEvents!==1||!notification)throw Error('Reminder did not fire exactly once');await window.screensense.task({tool:'delete_task',id:reminder.id});
 tab('Chat');return {taskForm:true,voiceRecordSavePlaybackDelete:true,memoryApproval:true,memoryEdit:true,agentActivity:true,reminderEvents:window.__reminderEvents,desktopNotification:notification};
 })().catch(e=>{throw Error(e.name+': '+e.message)})`);
 console.log('PASS: Local assistant integration',JSON.stringify(tools));
 for(const tab of ['Tasks','Memory','Agent Watch']){
 await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.assistant-tabs button')).find(b=>b.textContent.startsWith('${tab}')).click()`);
 await new Promise(r=>setTimeout(r,150));
 await fs.writeFile(path.join(__dirname,'../artifacts/'+tab.toLowerCase().replaceAll(' ','-')+'.png'),(await win.capturePage()).toPNG());
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
