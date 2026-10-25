import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {VoiceStore,validateRecording} from '../electron/voice-store.ts';
import {quickDue,taskDateError,friendlyError} from '../src/task-dates.ts';
const bytes=new Uint8Array([0x1a,0x45,0xdf,0xa3,...new Array(20).fill(0)]);
const input={title:'My idea',duration:2,mimeType:'audio/webm;codecs=opus',bytes};
test('voice notes persist and deletion removes both metadata and audio',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'desktop-pa-voice-'));try{const store=new VoiceStore(dir);await store.load();const notes=await store.save(input);assert.equal(notes.length,1);assert.ok((await store.audio(notes[0].id)).startsWith('data:audio/webm;base64,'));const again=new VoiceStore(dir);await again.load();assert.equal(again.list()[0].title,'My idea');assert.equal(again.list()[0].duration,2);await again.delete(notes[0].id);assert.deepEqual(again.list(),[]);assert.deepEqual(await readdir(path.join(dir,'voice-notes')),['index.json']);await assert.rejects(again.audio('../.env'),/Invalid/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('voice input boundaries reject invalid bytes, formats, duration and oversized payloads',()=>{
 assert.equal(validateRecording(input).length,bytes.length);
 for(const bad of [{...input,bytes:new Uint8Array(2)},{...input,bytes:new Uint8Array(9*1024*1024)},{...input,mimeType:'text/html'},{...input,duration:182},{...input,title:''},{...input,bytes:new Uint8Array(32)}])assert.throws(()=>validateRecording(bad));
});
test('quick due times use local calendar time and always choose a future evening',()=>{
 const now=new Date(2026,9,25,22,15);assert.equal(quickDue('hour',now),'2026-10-25T23:15');assert.equal(quickDue('three-hours',now),'2026-10-26T01:15');assert.equal(quickDue('tomorrow',now),'2026-10-26T09:00');assert.equal(quickDue('tonight',now),'2026-10-26T21:00');assert.equal(quickDue('tonight',new Date(2026,9,25,12)),'2026-10-25T21:00');assert.equal(taskDateError('2026-10-24T09:00',now.getTime()).includes('already passed'),true);assert.equal(taskDateError('',now.getTime()),'');assert.equal(taskDateError(quickDue('hour',now),now.getTime()),'');assert.equal(friendlyError(Error("Error invoking remote method 'screensense:task': Error: A useful message")),'A useful message');
});
