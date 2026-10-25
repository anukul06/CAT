export type QuickDue='hour'|'three-hours'|'tomorrow'|'tonight';
export function localDateInput(date:Date):string{
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function quickDue(choice:QuickDue,now=new Date()):string{
 const date=new Date(now);
 if(choice==='hour'||choice==='three-hours')date.setTime(date.getTime()+(choice==='hour'?1:3)*3600000);
 else if(choice==='tomorrow'){date.setDate(date.getDate()+1);date.setHours(9,0,0,0);}
 else {date.setHours(21,0,0,0);if(date.getTime()<=now.getTime())date.setDate(date.getDate()+1);}
 return localDateInput(date);
}
export function taskDateError(value:string,now=Date.now()):string{
 if(!value)return '';
 const time=new Date(value).getTime();
 if(!Number.isFinite(time))return 'Choose a valid date and time.';
 if(time<=now)return 'That time has already passed. Choose a future time or use Quick set.';
 if(time>now+366*86400000)return 'Choose a due time within the next year.';
 return '';
}
export function friendlyError(error:unknown):string{
 return (error instanceof Error?error.message:String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
}
