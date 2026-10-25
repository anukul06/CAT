import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {AgentWatchService,WatchStore,parseWatchResponse,validateWatch,watchPrompt} from '../electron/agent-watch.ts';
import {watchReaction} from '../src/watch-reaction.ts';
import type {Capture,WatchResult,WatchEntry} from '../src/shared.ts';
// Contract fixtures are for isolated validation/storage tests, never displayed as AI observations.
const result:WatchResult={doing:'Visible test output',status:'unknown',warnings:[],nextAction:'Read the visible output.',confidence:'low',confidenceReason:'Test contract only.',limitations:['Only screenshot evidence is available. Hidden process state is unknown.'],evidence:[],comparison:null};
const capture:Capture={id:'capture-1',dataUrl:'data:image/jpeg;base64,TEST_IMAGE_BYTES',capturedAt:new Date().toISOString(),displayName:'Test display',width:100,height:100};
async function temp(fn:(store:WatchStore,dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'desktop-pa-watch-'));try{const store=new WatchStore(dir);await store.load();await fn(store,dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('watch schema rejects fabricated fallback statuses and malformed/empty fields',()=>{
 assert.deepEqual(parseWatchResponse('```json\n'+JSON.stringify(result)+'\n```',false),result);
 for(const value of ['not JSON','{}',JSON.stringify({...result,status:'running'}),JSON.stringify({...result,limitations:[]}),JSON.stringify({...result,confidence:0.99}),JSON.stringify({...result,doing:''})])assert.throws(()=>parseWatchResponse(value,false),/No status was saved/);
 assert.throws(()=>validateWatch(result,true));assert.throws(()=>validateWatch({...result,comparison:{summary:'test',changes:[]}},false));
});
test('no model call before approval, discard/stale IDs rejected, only summaries are persisted',async()=>temp(async(store,dir)=>{
 let calls=0;const model={model:'gemma-4-26b-a4b-it',analyzeAgentWatch:async(image:string)=>{calls++;assert.equal(image,'TEST_IMAGE_BYTES');return result;}};
 const watch=new AgentWatchService(store,model,async()=>capture);
 await assert.rejects(watch.analyze({captureId:'capture-1'}),/not approved/);assert.equal(calls,0);
 await watch.capture('1');assert.equal(calls,0);await watch.discard();await assert.rejects(watch.analyze({captureId:'capture-1'}));
 await watch.capture('1');await assert.rejects(watch.analyze({captureId:'stale'}));assert.equal(calls,0);
 const entry=await watch.analyze({captureId:(await watch.capture('1')).id});assert.equal(calls,1);assert.equal(entry.capturedAt,capture.capturedAt);assert.equal(entry.status,'unknown');
 await assert.rejects(watch.analyze({captureId:capture.id}));
 const saved=await readFile(path.join(dir,'agent-watch.json'),'utf8');assert.ok(!saved.includes('TEST_IMAGE_BYTES'));assert.ok(!saved.includes('data:image'));const reload=new WatchStore(dir);await reload.load();assert.equal(reload.list().length,1);
}));
test('comparison uses the latest approved summary, not a hidden previous image',async()=>temp(async(store)=>{
 const received:(WatchEntry|undefined)[]=[];let count=0;
 const watch=new AgentWatchService(store,{model:'gemma-4-26b-a4b-it',analyzeAgentWatch:async(_image,previous)=>{received.push(previous);return {...result,comparison:previous?{summary:'No supported change in contract fixture.',changes:[]}:null};}},async()=>({...capture,id:'capture-'+(++count)}));
 const first=await watch.analyze({captureId:(await watch.capture('1')).id});const secondCapture=await watch.capture('1');
 await assert.rejects(watch.analyze({captureId:secondCapture.id,compareWith:'stale-summary'}),/baseline changed/);assert.equal(received.length,1);
 const second=await watch.analyze({captureId:secondCapture.id,compareWith:first.id});assert.equal(second.previousId,first.id);assert.ok(second.comparison);assert.equal(received[1]?.id,first.id);assert.ok(!JSON.stringify(received[1]).includes('TEST_IMAGE_BYTES'));
 assert.match(watchPrompt(first),/not a previous image/);assert.match(watchPrompt(first),/control Hermes/);
}));
test('provider/schema failures retain preview for explicit retry and do not save a status',async()=>temp(async(store)=>{
 let fail=true;const watch=new AgentWatchService(store,{model:'gemma-4-26b-a4b-it',analyzeAgentWatch:async()=>{if(fail)throw Error('HTTP 503 · UNAVAILABLE');return result;}},async()=>capture);
 await watch.capture('1');await assert.rejects(watch.analyze({captureId:capture.id}),/503/);assert.equal(store.list().length,0);fail=false;await watch.analyze({captureId:capture.id});assert.equal(store.list().length,1);
}));
test('busy watch prevents duplicate approvals and history corruption cannot overwrite data silently',async()=>temp(async(store,dir)=>{
 let release:()=>void=()=>{};const wait=new Promise<void>(r=>{release=r;});const watch=new AgentWatchService(store,{model:'gemma-4-26b-a4b-it',analyzeAgentWatch:async()=>{await wait;return result;}},async()=>capture);
 await watch.capture('1');const pending=watch.analyze({captureId:capture.id});await assert.rejects(watch.analyze({captureId:capture.id}),/busy/);await assert.rejects(watch.clear(),/busy/);release();await pending;await watch.clear();assert.equal(watch.history().length,0);
 await writeFile(path.join(dir,'agent-watch.json'),'BROKEN');const corrupt=new WatchStore(dir);await corrupt.load();assert.throws(()=>corrupt.list(),/Other features remain available/);assert.equal(await readFile(path.join(dir,'agent-watch.json'),'utf8'),'BROKEN');await corrupt.clear();assert.deepEqual(corrupt.list(),[]);
}));

test('uncertain/unknown observations never celebrate a fabricated completion',()=>{assert.equal(watchReaction({...result,status:'completed',confidence:'low'}).pose,'breathe');assert.equal(watchReaction({...result,status:'unknown',confidence:'high'}).pose,'breathe');assert.equal(watchReaction({...result,status:'completed',confidence:'high'}).pose,'celebrating');assert.equal(watchReaction({...result,status:'waiting',confidence:'medium'}).pose,'sleepy');assert.equal(watchReaction({...result,status:'error',confidence:'high'}).pose,'confused');});
