import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {Message} from '../src/shared.js';
export class Store{
 constructor(private dir:string){}
 async read():Promise<Message[]>{try{const data=JSON.parse(await readFile(path.join(this.dir,'history.json'),'utf8'));if(!Array.isArray(data))return [];return data.filter((m):m is Message=>m&&typeof m.id==='string'&&(m.role==='user'||m.role==='assistant')&&typeof m.text==='string'&&typeof m.createdAt==='string').slice(-100);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'||e instanceof SyntaxError)return [];throw Error('Could not read local chat history. Check file permissions.');}}
 async save(messages:Message[]){await mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'history.json');await writeFile(file+'.tmp',JSON.stringify(messages.slice(-100)),{mode:0o600});await rename(file+'.tmp',file);}
}
