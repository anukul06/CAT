import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Task,Memory,TaskInput,MemoryInput} from '../src/shared.js';
type Data={version:1;tasks:Task[];memories:Memory[]};
export function titleText(value:unknown,max=300):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`Enter text between 1 and ${max} characters.`);return value.trim();}
export function dueDate(value:unknown,now=Date.now()):string|undefined{
 if(value===undefined||value==='')return undefined;
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Choose a valid reminder time with a timezone.');
 const date=Date.parse(value);if(date<=now||date>now+366*86400000)throw Error('Reminder time must be in the future, within one year.');return new Date(date).toISOString();
}
export class AssistantStore{
 private data:Data={version:1,tasks:[],memories:[]};
 private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly dir:string,private changed:()=>void=()=>{},private now:()=>number=Date.now){}
 async load(){try{const value=JSON.parse(await readFile(path.join(this.dir,'assistant.json'),'utf8'));if(value.version!==1||!Array.isArray(value.tasks)||!Array.isArray(value.memories))throw Error('Invalid assistant data');
 if(!value.tasks.every((t:Task)=>typeof t?.id==='string'&&typeof t.title==='string'&&typeof t.createdAt==='string'&&(!t.dueAt||Number.isFinite(Date.parse(t.dueAt))))||!value.memories.every((m:Memory)=>typeof m?.id==='string'&&typeof m.text==='string'&&['preference','summary'].includes(m.kind)))throw Error('Invalid assistant records');this.data=value;
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Could not load assistant.json. Your data was preserved; check the file before restarting.');}}
 snapshot(){return structuredClone(this.data);}
 private update<T>(fn:(draft:Data)=>T):Promise<T>{
 const work=this.queue.then(async()=>{const draft=structuredClone(this.data);const result=fn(draft);await mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'assistant.json');await writeFile(file+'.tmp',JSON.stringify(draft,null,2),{mode:0o600});await rename(file+'.tmp',file);this.data=draft;this.changed();return result;});this.queue=work.catch(()=>{});return work;
 }
 create(input:TaskInput,reminder=false){
 if(!input||typeof input!=='object')throw Error('Invalid task.');const title=titleText(input.title);const dueAt=dueDate(input.dueAt,this.now());if(reminder&&!dueAt)throw Error('A reminder needs a due time.');
 return this.update(d=>{if(d.tasks.length>=500)throw Error('Task limit reached. Delete old tasks first.');const task:Task={id:randomUUID(),title,createdAt:new Date(this.now()).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...(dueAt?{dueAt}:{})};d.tasks.push(task);return task;});
 }
 complete(id:string){return this.update(d=>{const task=d.tasks.find(t=>t.id===id);if(!task)throw Error('Task not found.');task.completedAt??=new Date(this.now()).toISOString();return task;});}
 deleteTask(id:string){return this.update(d=>{const index=d.tasks.findIndex(t=>t.id===id);if(index<0)throw Error('Task not found.');d.tasks.splice(index,1);});}
 saveMemory(input:MemoryInput){
 if(!input||input.approved!==true)throw Error('Approve the memory before saving.');const text=titleText(input.text,2000);if(!['preference','summary'].includes(input.kind))throw Error('Invalid memory type.');
 return this.update(d=>{const now=new Date(this.now()).toISOString();if(input.id){const memory=d.memories.find(m=>m.id===input.id);if(!memory)throw Error('Memory not found.');memory.text=text;memory.kind=input.kind;memory.updatedAt=now;}else{if(d.memories.length>=100)throw Error('Memory limit reached. Delete a memory first.');d.memories.push({id:randomUUID(),text,kind:input.kind,createdAt:now,updatedAt:now});}});
 }
 deleteMemory(id:string){return this.update(d=>{const index=d.memories.findIndex(m=>m.id===id);if(index<0)throw Error('Memory not found.');d.memories.splice(index,1);});}
 clearMemories(){return this.update(d=>{d.memories=[];});}
 // Persist the claim before attempting a notification, including across app restarts.
 claimDue(){return this.update(d=>{const due=d.tasks.filter(t=>!t.completedAt&&t.dueAt&&!t.notifiedAt&&Date.parse(t.dueAt)<=this.now());for(const t of due){t.notifiedAt=new Date(this.now()).toISOString();t.notificationStatus='claimed';}return due;});}
 markNotification(id:string,success:boolean){return this.update(d=>{const t=d.tasks.find(t=>t.id===id);if(t)t.notificationStatus=success?'sent':'failed';});}
}
