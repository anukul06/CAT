import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {AssistantStore,dueDate} from '../electron/assistant-store.ts';
import {ReminderScheduler} from '../electron/reminders.ts';
import {Coordinator} from '../electron/coordinator.ts';
import {route} from '../electron/routing.ts';
import {fitWindow} from '../electron/window-geometry.ts';
async function withStore(fn:(store:AssistantStore,dir:string,advance:(ms:number)=>void)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'screensense-assistant-'));let time=Date.now();const store=new AssistantStore(dir,()=>{},()=>time);try{await store.load();await fn(store,dir,ms=>{time+=ms;});}finally{await rm(dir,{recursive:true,force:true});}}
test('routes explicit local tools, vision follow-ups, and honest general answers',()=>{
 const now=Date.now();const intent=route('Remind me to push my code in 15 minutes',false,now);assert.equal(intent.agent,'TaskAgent');assert.ok(intent.action==='create');if(intent.action==='create'){assert.equal(intent.title,'push my code');assert.equal(Date.parse(intent.dueAt!),now+900000);}
 assert.equal(route('Explain this screen',true).agent,'VisionAgent');assert.equal(route('Explain gravity',false).agent,'ResearchAgent');assert.equal(route('add task ship demo',true).agent,'TaskAgent');assert.equal(route('remember that I like concise answers',false).agent,'MemoryAgent');assert.equal(route('remind me to call sometime',false).action,'clarify');assert.equal(route('list my tasks',false).action,'list');assert.equal(route('delete task ship demo',false).action,'delete');
});
test('parses calendar reminders in system local time and rejects invalid times',()=>{const now=new Date(2026,9,25,10,0).getTime();const intent=route('Remind me to call tomorrow at 9:30 pm',false,now);assert.equal(intent.action,'create');if(intent.action==='create'){const d=new Date(intent.dueAt!);assert.equal(d.getDate(),26);assert.equal(d.getHours(),21);assert.equal(d.getMinutes(),30);}assert.equal(route('Remind me to call today at 99:00',false,now).action,'clarify');assert.throws(()=>dueDate('2026-10-25T14:00'));assert.throws(()=>dueDate(new Date(Date.now()-1000).toISOString()));});
test('task CRUD persists, concurrent mutations preserve all records, invalid operations fail',async()=>withStore(async(store,dir)=>{
 const tasks=await Promise.all(Array.from({length:8},(_,i)=>store.create({title:'Task '+i})));assert.equal(store.snapshot().tasks.length,8);await store.complete(tasks[0].id);await store.deleteTask(tasks[1].id);const again=new AssistantStore(dir);await again.load();assert.equal(again.snapshot().tasks.length,7);assert.ok(again.snapshot().tasks[0].completedAt);assert.throws(()=>store.create({title:''}));await assert.rejects(store.deleteTask('missing'),/not found/);
}));
test('memory requires approval, edits persist, deletions remove it',async()=>withStore(async(store,dir)=>{
 assert.throws(()=>store.saveMemory({text:'secret',kind:'preference',approved:false} as never),/Approve/);await store.saveMemory({text:'Concise answers',kind:'preference',approved:true});const id=store.snapshot().memories[0].id;await store.saveMemory({id,text:'Examples please',kind:'preference',approved:true});const again=new AssistantStore(dir);await again.load();assert.equal(again.snapshot().memories[0].text,'Examples please');await store.deleteMemory(id);assert.equal(store.snapshot().memories.length,0);await store.saveMemory({text:'Approved summary',kind:'summary',approved:true});await store.clearMemories();assert.equal(store.snapshot().memories.length,0);
}));
test('due reminder claims survive restart and deliver at most once',async()=>withStore(async(store,dir,advance)=>{
 await store.create({title:'Push code',dueAt:new Date(Date.now()+1000).toISOString()},true);const completed=await store.create({title:'Already done',dueAt:new Date(Date.now()+1000).toISOString()},true);await store.complete(completed.id);advance(2000);let calls=0;const scheduler=new ReminderScheduler(store,async()=>{calls++;return true;},e=>{throw e;},()=>Date.now()+2000);scheduler.start();await new Promise(r=>setTimeout(r,50));await scheduler.tick();scheduler.stop();assert.equal(calls,1);assert.equal(store.snapshot().tasks[0].notificationStatus,'sent');const again=new AssistantStore(dir);await again.load();assert.equal((await again.claimDue()).length,0);
}));
test('failed notifications stay visible and never retry automatically',async()=>withStore(async(store,_dir,advance)=>{
 await store.create({title:'A nudge',dueAt:new Date(Date.now()+1000).toISOString()},true);advance(2000);const s=new ReminderScheduler(store,async()=>false,()=>{},()=>Date.now()+2000);s.start();await new Promise(r=>setTimeout(r,50));s.stop();assert.equal(store.snapshot().tasks[0].notificationStatus,'failed');assert.equal((await store.claimDue()).length,0);
}));
test('coordinator local actions succeed only after validated tools, with no model calls',async()=>withStore(async(store)=>{
 const events:string[]=[];const c=new Coordinator(store,{analyze:async()=>{throw Error('Local tools must not call Gemma');}},a=>events.push(a.agent+':'+a.status));const result=await c.execute({question:'Add task prepare demo',messages:[]});assert.equal(result.agent,'TaskAgent');assert.match(result.answer,/Task created/);assert.equal(store.snapshot().tasks.length,1);await c.execute({question:'complete task prepare demo',messages:[]});assert.ok(store.snapshot().tasks[0].completedAt);await c.execute({question:'remember that I like short answers',messages:[]});assert.equal(store.snapshot().memories.length,1);await assert.rejects(c.task({tool:'delete_task',id:'missing'}),/not found/);assert.ok(events.includes('TaskAgent:error'));assert.ok(events.includes('Coordinator:success'));
}));
test('window stays inside small, negative-origin and secondary displays',()=>{
 for(const area of [{x:0,y:25,width:400,height:500},{x:-1920,y:-100,width:1920,height:1080},{x:1440,y:0,width:1280,height:720}]){const b=fitWindow({x:-8000,y:9000,width:152,height:154},area,true);assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);assert.ok(b.height<=760);}
});
