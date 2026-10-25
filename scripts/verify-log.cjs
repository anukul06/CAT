// Opt-in real Gemma test against a controlled log file. Does not read any terminal session.
const {app}=require('electron');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
app.whenReady().then(async()=>{let dir;try{
 const {config}=await import('dotenv');config({quiet:true});
 const {Gemma}=await import('../dist-electron/electron/gemma.js');const {AgentLogSource}=await import('../dist-electron/electron/agent-log.js');const {AgentWatchService,WatchStore}=await import('../dist-electron/electron/agent-watch.js');
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-pa-live-log-'));const file=path.join(dir,'controlled-agent.log');
 await fs.writeFile(file,'CONTROLLED TEST LOG — not a live Hermes process\n[agent] Reading parser.ts\n[agent] Working: npm test is running\n');
 const gemma=new Gemma(process.env.GEMINI_API_KEY,process.env.GEMMA_MODEL||'gemma-4-26b-a4b-it');const store=new WatchStore(dir);await store.load();const watch=new AgentWatchService(store,gemma,async()=>{throw Error('No screenshot should be taken');},new AgentLogSource(process.env.GEMINI_API_KEY));
 await watch.connectLog(file);const first=await watch.analyze({captureId:(await watch.reviewLog()).id});console.log('REAL GEMMA LOG OBSERVATION:',JSON.stringify(first));
 await fs.appendFile(file,'PASS parser.test.ts (12 tests)\nAll tests passed\n[agent] Task completed successfully\n');
 const second=await watch.analyze({captureId:(await watch.reviewLog()).id,compareWith:first.id});console.log('REAL GEMMA LOG COMPARISON:',JSON.stringify(second));
 if(second.source!=='log'||!second.comparison||store.list().length!==2)throw Error('Log comparison failed');
 console.log('PASS: Read-only selected log, explicit frozen samples, real Gemma analysis and comparison.');
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/log-live-results.json',JSON.stringify(store.list(),null,2));await fs.rm(dir,{recursive:true,force:true});app.exit(0);
}catch(e){console.error(e.message);if(dir)await fs.rm(dir,{recursive:true,force:true});app.exit(1);}});
