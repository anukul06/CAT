import {open,realpath,lstat,constants} from 'node:fs/promises';
import path from 'node:path';
import type {LogTail} from '../src/shared.js';
const MAX_READ=16*1024;
export function cleanLog(text:string,key?:string):string{
 let result=text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').replace(/\r\n?/g,'\n');
 if(key)result=result.replaceAll(key,'[redacted]');
 return result.replace(/AIza[0-9A-Za-z_-]{30,}/g,'[redacted]').replace(/\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}/g,'[redacted]');
}
export class AgentLogSource{
 private file:string|undefined;
 constructor(private key?:string){}
 async connect(selectedPath:string):Promise<LogTail>{
 const resolved=await realpath(selectedPath);const sample=await this.read(resolved);this.file=resolved;return sample;
 }
 disconnect(){this.file=undefined;}
 async tail(){if(!this.file)throw Error('Choose an agent log file first.');return this.read(this.file);}
 private async read(file:string):Promise<LogTail>{
 if((await lstat(file)).isSymbolicLink())throw Error('The selected log was replaced with a link. Reconnect the log file.');
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const info=await handle.stat();if(!info.isFile())throw Error('Select a regular text log file.');
 const start=Math.max(0,info.size-MAX_READ);const buffer=Buffer.alloc(Math.min(info.size,MAX_READ));const {bytesRead}=await handle.read(buffer,0,buffer.length,start);
 if(buffer.subarray(0,bytesRead).includes(0))throw Error('This looks like a binary file. Select a text, JSONL, or agent log file.');
 const text=cleanLog(buffer.subarray(0,bytesRead).toString('utf8'),this.key);
 return {name:path.basename(file),text,sampledAt:new Date().toISOString(),modifiedAt:info.mtime.toISOString(),truncated:start>0};
 }finally{await handle.close();}
 }
}
