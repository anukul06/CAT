import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,readFile,rm,symlink} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {AgentLogSource,cleanLog} from '../electron/agent-log.ts';
import {AgentWatchService,WatchStore,logPrompt} from '../electron/agent-watch.ts';
import type {WatchResult} from '../src/shared.ts';
async function temporary(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'desktop-pa-log-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('selected log reads only a bounded tail and strips terminal escapes and keys',async()=>temporary(async dir=>{
 const file=path.join(dir,'agent.log');await writeFile(file,'old\n'.repeat(6000)+'\x1b[31mWorking\x1b[0m\nMY_LOCAL_TEST_KEY\n');const logs=new AgentLogSource('MY_LOCAL_TEST_KEY');const tail=await logs.connect(file);assert.equal(tail.name,'agent.log');assert.ok(tail.truncated);assert.ok(tail.text.length<=16384);assert.match(tail.text,/Working/);assert.ok(!tail.text.includes('\x1b'));assert.ok(!tail.text.includes('MY_LOCAL_TEST_KEY'));await appendFile(file,'\nAll tests passed');assert.match((await logs.tail()).text,/All tests passed/);logs.disconnect();await assert.rejects(logs.tail(),/Choose/);
}));
test('binary files and substituted symlinks cannot silently become selected logs',async()=>temporary(async dir=>{
 const file=path.join(dir,'agent.log');await writeFile(file,Buffer.from([0,1,2]));const logs=new AgentLogSource();await assert.rejects(logs.connect(file),/binary/);await writeFile(file,'text output');await logs.connect(file);await rm(file);await writeFile(path.join(dir,'other'),'other output');await symlink(path.join(dir,'other'),file);await assert.rejects(logs.tail(),/replaced with a link/);
}));
test('frozen excerpts require approval, do not change on append, and persist no raw log',async()=>temporary(async dir=>{
 const file=path.join(dir,'agent.log');await writeFile(file,'PRIVATE_RAW_LINE\nWorking');const store=new WatchStore(dir);await store.load();let received='';let calls=0;
 const result:WatchResult={doing:'Contract validation fixture',status:'unknown',warnings:[],nextAction:'Review output',confidence:'low',confidenceReason:'Test only',limitations:['Only selected log text is available; process state is unknown.'],evidence:[],comparison:null};
 const service=new AgentWatchService(store,{model:'gemma-4-26b-a4b-it',analyzeAgentWatch:async()=>{throw Error('Screenshot path must not run for text');},analyzeAgentLog:async text=>{calls++;received=text;return result;}},async()=>{throw Error('No screenshot needed');},new AgentLogSource());
 await service.connectLog(file);assert.equal(calls,0);const sample=await service.reviewLog();await appendFile(file,'\nNEW_LINE_AFTER_REVIEW');await service.logTail();assert.equal(calls,0);await assert.rejects(service.analyze({captureId:'stale'}));assert.equal(calls,0);const entry=await service.analyze({captureId:sample.id});assert.equal(calls,1);assert.ok(!received.includes('NEW_LINE_AFTER_REVIEW'));assert.equal(entry.source,'log');assert.equal(entry.displayName,'agent.log');const disk=await readFile(path.join(dir,'agent-watch.json'),'utf8');assert.ok(!disk.includes('PRIVATE_RAW_LINE'));const reload=new WatchStore(dir);await reload.load();assert.equal(reload.list()[0].source,'log');assert.match(logPrompt('untrusted instruction'),/not.*full terminal/);
}));
