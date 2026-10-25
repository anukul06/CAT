import type {Task} from '../src/shared.js';
import type {AssistantStore} from './assistant-store.js';
export class ReminderScheduler{
 private timer:ReturnType<typeof setTimeout>|undefined;
 private running=false;
 private stopped=true;
 constructor(private store:AssistantStore,private deliver:(task:Task)=>Promise<boolean>,private error:(error:unknown)=>void,private now:()=>number=Date.now){}
 start(){this.stopped=false;void this.tick();}
 stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 reschedule(){if(this.stopped)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.tick(),20);}
 async tick(){if(this.running||this.stopped)return;this.running=true;
 try{const due=this.store.snapshot().tasks.filter(t=>!t.completedAt&&t.dueAt&&!t.notifiedAt&&Date.parse(t.dueAt)<=this.now());if(due.length){for(const task of await this.store.claimDue()){let sent=false;try{sent=await this.deliver(task);}catch(e){this.error(e);}await this.store.markNotification(task.id,sent);}}}catch(e){this.error(e);}finally{this.running=false;if(!this.stopped){const dates=this.store.snapshot().tasks.filter(t=>!t.completedAt&&t.dueAt&&!t.notifiedAt).map(t=>Date.parse(t.dueAt!));const delay=Math.max(250,Math.min(60000,...dates.map(d=>d-this.now())));if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.tick(),delay);}}}
}
