import {useEffect,useState} from 'react';
import {FileText,FolderOpen,Unplug,RefreshCw,ShieldCheck} from 'lucide-react';
import type {LogSample,LogTail} from '../shared';
import {friendlyError} from '../task-dates';
const api=window.screensense;
export function AgentLogInput({active,busy,review,onReview,onError,onDisconnect}:{active:boolean;busy:boolean;review?:LogSample;onReview:(sample:LogSample)=>void;onError:(message:string)=>void;onDisconnect:()=>void}){
 const [tail,setTail]=useState<LogTail>(),[connecting,setConnecting]=useState(false),[reading,setReading]=useState(false);
 useEffect(()=>{if(!active||!tail||review||!api)return;let live=true;let running=false;const read=async()=>{if(running)return;running=true;try{const next=await api.watchLogTail();if(live)setTail(next);}catch(e){if(live)onError(friendlyError(e));}finally{running=false;}};const timer=setInterval(()=>void read(),2000);return()=>{live=false;clearInterval(timer);};},[active,!!tail,!!review]);
 async function connect(){if(!api||connecting)return;setConnecting(true);try{const next=await api.watchLogConnect();if(next){setTail(next);onError('');onDisconnect();}}catch(e){onError(friendlyError(e));}finally{setConnecting(false);}}
 async function disconnect(){try{await api?.watchLogDisconnect();setTail(undefined);onDisconnect();onError('');}catch(e){onError(friendlyError(e));}}
 async function prepare(){if(!api||reading)return;setReading(true);try{onReview(await api.watchLogReview());onError('');}catch(e){onError(friendlyError(e));}finally{setReading(false);}}
 const visible=review||tail;
 return <section className="log-source" aria-label="Selected agent log"><div className="log-source-heading"><FileText size={15}/><span>{tail?.name||'Read a terminal log directly'}</span>{tail&&<span className="log-connection-label">{review?'FROZEN FOR REVIEW':active?'LOCAL · UPDATING':'PAUSED'}</span>}</div>
 <div className="log-source-actions"><button className="capture-button log-connect" disabled={busy||connecting||!!review} onClick={()=>void connect()}><FolderOpen size={13}/>{connecting?'Choosing…':tail?'Change log file':'Choose log file'}</button>{tail&&<button className="text-button" disabled={busy} onClick={()=>void disconnect()}><Unplug size={11}/> Disconnect</button>}</div>
 {visible?<><pre className="log-tail" aria-label={review?'Approved excerpt preview':'Live local log preview'}>{visible.text||'Waiting for the agent to write output…'}</pre><div className="log-sample-meta">{visible.truncated?'Latest 16 KB only · ':''}File modified {new Date(visible.modifiedAt).toLocaleTimeString()} · sampled {new Date(visible.sampledAt).toLocaleTimeString()}</div>{!review&&<button className="primary-button log-review" disabled={busy||reading||!tail?.text.trim()} onClick={()=>void prepare()}><RefreshCw size={12}/>{reading?'Reading…':'Review excerpt for analysis'}</button>}</>:<p className="log-source-help">Select the text/JSONL log your agent writes. If it doesn’t write a log, start it with output logging enabled. Desktop PA reads only the file you choose.</p>}
 <p className="log-source-privacy"><ShieldCheck size={11}/><span>Local preview refreshes every 2 seconds while this tab is open. Nothing goes to Gemma until you approve a frozen excerpt. File updates do not prove the agent is running.</span></p></section>;
}
