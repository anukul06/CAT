import type {AgentName} from '../src/shared.js';
export type Intent={agent:'TaskAgent';action:'create';title:string;dueAt?:string}|{agent:'TaskAgent';action:'list'}|{agent:'TaskAgent';action:'complete'|'delete';target:string}|{agent:'TaskAgent';action:'clarify';text:string}|{agent:'MemoryAgent';action:'remember';text:string}|{agent:'MemoryAgent';action:'list'}|{agent:'VisionAgent'|'ResearchAgent';action:'answer'};
export function route(text:string,hasImage:boolean,now=Date.now()):Intent{
 // Screen approval takes priority; no task is ever created from screenshot contents.
 const q=text.trim();let m:RegExpMatchArray|null;
 if((m=q.match(/^(?:please\s+)?remind me (?:to\s+)?(.+?)\s+in\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|mins?|hours?|hrs?|days?)\.?$/i))){const n=Number(m[2]);const unit=m[3].toLowerCase();const ms=n*(unit.startsWith('s')?1000:unit.startsWith('m')?60000:unit.startsWith('h')?3600000:86400000);if(ms<1000||ms>366*86400000)return {agent:'TaskAgent',action:'clarify',text:'Choose a reminder between one second and one year from now.'};return {agent:'TaskAgent',action:'create',title:m[1],dueAt:new Date(now+ms).toISOString()};}
 if((m=q.match(/^remind me (?:to\s+)?(.+?)\s+(today|tomorrow)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\.?$/i))){let hour=Number(m[3]);const minute=Number(m[4]||0);const ampm=m[5]?.toLowerCase();if(minute>59||hour>(ampm?12:23)||hour<(ampm?1:0))return {agent:'TaskAgent',action:'clarify',text:'Use a valid local time, such as tomorrow at 9:30 am.'};if(ampm)hour=hour%12+(ampm==='pm'?12:0);const due=new Date(now);if(m[2].toLowerCase()==='tomorrow')due.setDate(due.getDate()+1);due.setHours(hour,minute,0,0);if(due.getTime()<=now)return {agent:'TaskAgent',action:'clarify',text:'That time has passed. Choose a future time.'};return {agent:'TaskAgent',action:'create',title:m[1],dueAt:due.toISOString()};}
 if(/^remind me\b/i.test(q))return {agent:'TaskAgent',action:'clarify',text:'Try “Remind me to push my code in 15 minutes” or “Remind me to call tomorrow at 9 am.” You can also choose an exact local time in Tasks.'};
 if((m=q.match(/^(?:add|create)\s+(?:a\s+)?task\s*:?\s+(.+)$/i)))return {agent:'TaskAgent',action:'create',title:m[1]};
 if(/^(?:(?:show|list)(?: me)?|what are)\s+(?:my\s+)?tasks[?.!]?$/i.test(q))return {agent:'TaskAgent',action:'list'};
 if((m=q.match(/^(complete|finish|delete|remove)\s+task\s+(.+)$/i)))return {agent:'TaskAgent',action:/complete|finish/i.test(m[1])?'complete':'delete',target:m[2].trim()};
 if((m=q.match(/^remember (?:that\s+)?(.+)$/i)))return {agent:'MemoryAgent',action:'remember',text:m[1]};
 if(/^(?:(?:show|list)(?: me)?\s+(?:my\s+)?memor(?:y|ies)|what do you remember(?: about me)?)[?.!]?$/i.test(q))return {agent:'MemoryAgent',action:'list'};
 return {agent:hasImage?'VisionAgent':'ResearchAgent',action:'answer'};
}
export const agentDescription:Record<AgentName,string>={Coordinator:'Routing your request',VisionAgent:'Understanding your snapshot',TaskAgent:'Managing your local tasks',ResearchAgent:'Answering with Gemma · no live web',MemoryAgent:'Working with approved memories'};
