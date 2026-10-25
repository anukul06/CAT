import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Play,Trash2,LockKeyhole,Save,AudioLines} from 'lucide-react';
import type {VoiceNote} from '../shared';
import {friendlyError} from '../task-dates';
const api=window.screensense;
const durationText=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function VoiceNotes({notes}:{notes:VoiceNote[]}){
 const [recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[elapsed,setElapsed]=useState(0),[error,setError]=useState(''),[title,setTitle]=useState(''),[draft,setDraft]=useState<{blob:Blob;duration:number}>(),[draftUrl,setDraftUrl]=useState(''),[saving,setSaving]=useState(false),[playing,setPlaying]=useState<{id:string;src:string}>();
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),started=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;if(recorder.current.state!=='inactive')recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(!draft){setDraftUrl('');return;}const url=URL.createObjectURL(draft.blob);setDraftUrl(url);return()=>URL.revokeObjectURL(url);},[draft]);
 useEffect(()=>{if(!recording)return;const interval=setInterval(()=>setElapsed(Math.min(180,Math.floor((performance.now()-started.current)/1000))),250);const timeout=setTimeout(stop,180000);return()=>{clearInterval(interval);clearTimeout(timeout);};},[recording]);
 function stop(){if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());setRecording(false);}
 async function start(){if(!api||starting||recording)return;setStarting(true);setError('');
 try{
  await api.voicePermission();if(!mounted.current)return;
  const input=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  if(!mounted.current){input.getTracks().forEach(t=>t.stop());return;}stream.current=input;
  const mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mimeType)throw Error('This version of Electron cannot record WebM audio.');
  const r=new MediaRecorder(input,{mimeType,audioBitsPerSecond:64000});recorder.current=r;const chunks:Blob[]=[];
  r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  r.onstop=()=>{input.getTracks().forEach(t=>t.stop());if(!mounted.current)return;const seconds=Math.min(180,(performance.now()-started.current)/1000);const blob=new Blob(chunks,{type:mimeType});setRecording(false);if(blob.size&&seconds>0)setDraft({blob,duration:seconds});else setError('No audio was recorded. Try again.');};
  r.onerror=()=>{r.onstop=null;input.getTracks().forEach(t=>t.stop());setRecording(false);setError('The recording stopped unexpectedly. Please try again.');};
  started.current=performance.now();setElapsed(0);r.start(250);setRecording(true);
 }catch(e){stream.current?.getTracks().forEach(t=>t.stop());if(mounted.current)setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone access was denied. Enable Electron or Desktop PA in your microphone privacy settings.':friendlyError(e));}
 finally{if(mounted.current)setStarting(false);}
 }
 async function save(){if(!draft||!api||saving)return;setSaving(true);setError('');try{await api.saveVoiceNote({title:title.trim()||`Voice note · ${new Date().toLocaleDateString()}`,duration:draft.duration,mimeType:draft.blob.type,bytes:new Uint8Array(await draft.blob.arrayBuffer())});setDraft(undefined);setTitle('');}catch(e){setError(friendlyError(e));}finally{setSaving(false);}}
 async function load(note:VoiceNote){setError('');try{const src=await api?.voiceAudio(note.id);if(src)setPlaying({id:note.id,src});}catch(e){setError(friendlyError(e));}}
 async function remove(note:VoiceNote){try{await api?.deleteVoiceNote(note.id);if(playing?.id===note.id)setPlaying(undefined);}catch(e){setError(friendlyError(e));}}
 return <section className="voice-section" aria-label="Voice notes"><div className="voice-heading"><span className="voice-icon"><AudioLines size={18}/></span><div><h3>Voice notes</h3><p>A thought, in your own words.</p></div><span className="local-badge"><LockKeyhole size={9}/> LOCAL</span></div>
 <div className={`voice-recorder ${recording?'is-recording':''}`}>{!draft?<><div className="recording-indicator"><span className={recording?'recording-dot':'mic-dot'}/><span>{recording?'Recording…':starting?'Waiting for microphone…':'Ready when you are'}</span><time>{durationText(elapsed)}</time></div><button type="button" className={recording?'record-button stop-button':'record-button'} onClick={recording?stop:()=>void start()} disabled={starting||!api}>{recording?<Square size={12} fill="currentColor"/>:<Mic size={14}/>} {recording?'Stop recording':'Record a note'}</button></>:<><label htmlFor="voice-title">Give this thought a name</label><input id="voice-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder="An idea for tomorrow…"/><audio controls src={draftUrl} aria-label="Preview your voice note"/><div className="voice-draft-actions"><button type="button" className="text-button" disabled={saving} onClick={()=>{setDraft(undefined);setTitle('');setElapsed(0);}}>Discard</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void save()}><Save size={12}/>{saving?'Saving…':'Save voice note'}</button></div></>}
 <p className="voice-privacy">{recording?'Microphone is on. Stops automatically at 3 minutes.':'Up to 3 minutes. Saved on this device. Never sent to AI.'}</p></div>
 {error&&<div className="field-error" role="alert">{error}</div>}
 <div className="voice-list">{notes.map(note=><article className="voice-note" key={note.id}><button type="button" className="voice-play" aria-label={`Play ${note.title}`} onClick={()=>void load(note)}><Play size={12} fill="currentColor"/></button><div className="voice-note-info"><strong>{note.title}</strong><small>{durationText(note.duration)} · {new Date(note.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></div><button type="button" className="icon-button" aria-label={`Delete voice note ${note.title}`} onClick={()=>void remove(note)}><Trash2 size={13}/></button>{playing?.id===note.id&&<audio controls autoPlay src={playing.src} aria-label={`Playback ${note.title}`}/>}</article>)}</div>
 </section>;
}
