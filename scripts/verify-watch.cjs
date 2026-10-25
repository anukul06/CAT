// Opt-in live Gemma integration using controlled Terminal-like screenshots only.
// No real desktop/terminal is captured or uploaded. No screenshot files are saved.
const {app,BrowserWindow}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');const os=require('node:os');
app.whenReady().then(async()=>{
 let fixture;
 let dir;
 try{
  const {config}=await import('dotenv');config({quiet:true});
  const {Gemma}=await import('../dist-electron/electron/gemma.js');
  const {AgentWatchService,WatchStore}=await import('../dist-electron/electron/agent-watch.js');
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-pa-live-watch-'));
  const gemma=new Gemma(process.env.GEMINI_API_KEY,process.env.GEMMA_MODEL||'gemma-4-26b-a4b-it');
  const store=new WatchStore(dir);await store.load();
  fixture=new BrowserWindow({width:1100,height:650,show:true,backgroundColor:'#141a18',webPreferences:{backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  let number=0;
  const frames=[
   '$ hermes run "repair project tests"\n[agent] Reading src/parser.ts\n[agent] Running npm test\nWARNING: network tools disabled\n[agent] Working: tests are running…',
   '$ hermes run "repair project tests"\n[agent] Reading src/parser.ts\n[agent] Running npm test\nWARNING: network tools disabled\nPASS parser.test.ts (12 tests)\nAll 12 tests passed.\n[agent] Task completed successfully.\n$ '
  ];
  const watch=new AgentWatchService(store,gemma,async()=>{
   const html=`<!doctype html><html><body style="margin:0;background:#141a18;color:#d5e6cd;font:22px/1.65 Menlo,monospace"><header style="background:#29322c;padding:14px 26px;color:#c8d3c2;font:16px -apple-system,sans-serif">Terminal · Controlled vision test fixture — not a live agent</header><pre style="margin:24px;white-space:pre-wrap">${frames[number].replaceAll('&','&amp;').replaceAll('<','&lt;')}</pre></body></html>`;
   await fixture.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
   await fixture.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
   let image;
   for(let attempt=0;attempt<3;attempt++){try{image=await fixture.capturePage(undefined,{stayAwake:true});break;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,200));}}
   number++;
   return {id:'fixture-'+number,capturedAt:new Date().toISOString(),displayName:'Controlled Terminal fixture',width:1100,height:650,dataUrl:'data:image/jpeg;base64,'+image.toJPEG(90).toString('base64')};
  });
  const firstCapture=await watch.capture('fixture');
  const first=await watch.analyze({captureId:firstCapture.id});
  console.log('FIRST LIVE GEMMA OBSERVATION:',JSON.stringify(first));
  const secondCapture=await watch.capture('fixture');
  const second=await watch.analyze({captureId:secondCapture.id,compareWith:first.id});
  console.log('SECOND LIVE GEMMA COMPARISON:',JSON.stringify(second));
  if(!second.comparison||second.previousId!==first.id||watch.history().length!==2)throw Error('Comparison/persistence check failed');
  const disk=await fs.readFile(path.join(dir,'agent-watch.json'),'utf8');
  if(disk.includes('data:image')||disk.includes('base64'))throw Error('An image leaked to summary storage');
  await fs.mkdir(path.resolve('artifacts'),{recursive:true});
  await fs.writeFile(path.resolve('artifacts/watch-live-results.json'),JSON.stringify(watch.history(),null,2));
  console.log('PASS: Real Gemma screenshot analysis + summary comparison + image-free persistence. Responses above describe controlled test fixtures, not a running Hermes process.');
  fixture.destroy();await fs.rm(dir,{recursive:true,force:true});app.exit(0);
 }catch(e){console.error(e.name+': '+e.message);if(fixture&&!fixture.isDestroyed())fixture.destroy();if(dir)await fs.rm(dir,{recursive:true,force:true});app.exit(1);}
});
