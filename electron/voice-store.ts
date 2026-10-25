import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import type {VoiceNote,VoiceNoteInput} from '../src/shared.js';
import {titleText} from './assistant-store.js';
const MAX_BYTES=8*1024*1024;
function noteId(value:unknown):string{if(typeof value!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(value))throw Error('Invalid voice note ID.');return value;}
export function validateRecording(input:VoiceNoteInput):Buffer{
 if(!input||typeof input!=='object')throw Error('Invalid recording.');
 titleText(input.title,100);
 if(input.mimeType!=='audio/webm'&&input.mimeType!=='audio/webm;codecs=opus')throw Error('Unsupported recording format. Use WebM audio.');
 if(!Number.isFinite(input.duration)||input.duration<=0||input.duration>181)throw Error('Voice notes must be between 0 and 180 seconds.');
 if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength<16||input.bytes.byteLength>MAX_BYTES)throw Error('Recording is empty or exceeds the 8 MB limit.');
 const bytes=Buffer.from(input.bytes);
 if(bytes.readUInt32BE(0)!==0x1a45dfa3)throw Error('Invalid WebM recording.');
 return bytes;
}
export class VoiceStore{
 private notes:VoiceNote[]=[];
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private dir:string,private changed:()=>void=()=>{}){}
 private get folder(){return path.join(this.dir,'voice-notes');}
 private get index(){return path.join(this.folder,'index.json');}
 async load(){try{const notes=JSON.parse(await readFile(this.index,'utf8'));if(!Array.isArray(notes)||!notes.every(n=>typeof n.title==='string'&&typeof n.duration==='number'&&typeof n.createdAt==='string'&&noteId(n.id)))throw Error('Invalid voice-note index');this.notes=notes;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Could not load saved voice notes. Your files have been preserved.');}}
 list(){return structuredClone(this.notes);}
 private serialize<T>(work:()=>Promise<T>):Promise<T>{const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;}
 private async persist(notes:VoiceNote[]){await mkdir(this.folder,{recursive:true,mode:0o700});await writeFile(this.index+'.tmp',JSON.stringify(notes,null,2),{mode:0o600});await rename(this.index+'.tmp',this.index);this.notes=notes;this.changed();}
 save(input:VoiceNoteInput){const bytes=validateRecording(input);return this.serialize(async()=>{
 if(this.notes.length>=100)throw Error('Voice-note limit reached. Delete an old note first.');
 const note:VoiceNote={id:randomUUID(),title:input.title.trim(),duration:input.duration,createdAt:new Date().toISOString(),mimeType:'audio/webm'};
 await mkdir(this.folder,{recursive:true,mode:0o700});const file=path.join(this.folder,note.id+'.webm');await writeFile(file,bytes,{mode:0o600});
 try{await this.persist([note,...this.notes]);}catch(e){await rm(file,{force:true});throw e;}
 return this.list();
 });}
 async audio(id:unknown){const key=noteId(id);if(!this.notes.some(n=>n.id===key))throw Error('Voice note not found.');const bytes=await readFile(path.join(this.folder,key+'.webm'));return 'data:audio/webm;base64,'+bytes.toString('base64');}
 delete(id:unknown){const key=noteId(id);return this.serialize(async()=>{
 if(!this.notes.some(n=>n.id===key))throw Error('Voice note not found.');
 const file=path.join(this.folder,key+'.webm'),trash=file+'.deleting';
 await rename(file,trash);
 try{await this.persist(this.notes.filter(n=>n.id!==key));}catch(e){await rename(trash,file);throw e;}
 await rm(trash,{force:true});return this.list();
 });}
}
