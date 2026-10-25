import {useEffect,useRef,useState} from 'react';
import {DesktopPet,type PetState} from './components/DesktopPet';
import {ChatPanel} from './components/ChatPanel';
import './styles/app.css';
export default function App(){
 const [open,setOpen]=useState(false),[state,setState]=useState<PetState>('idle'),[speech,setSpeech]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const react=(pose:PetState,label='')=>{clearTimeout(timer.current);setState(pose);if(label)setSpeech(label);if(pose!=='thinking'&&pose!=='listening')timer.current=setTimeout(()=>{setState('idle');setSpeech('');},pose==='celebrating'?8000:4000);};
 useEffect(()=>{const off=window.screensense?.onEvent(event=>{
 if(event.type==='reminder')react('celebrating',`Time for ${event.task.title.slice(0,65)}`);
 if(event.type==='activity'&&event.activity.agent!=='Coordinator'){
  if(event.activity.status==='running')react('thinking',event.activity.agent==='VisionAgent'?'Taking a closer look…':event.activity.agent==='TaskAgent'?'One little thing at a time.':event.activity.agent==='MemoryAgent'?'Keeping what matters.':'Let me think…');
  else if(event.activity.status==='error')react('confused','A little hiccup. Let’s try again.');
  else react('happy','All set. A little lighter.');
 }
 });return()=>{off?.();clearTimeout(timer.current);};},[]);
 const toggle=()=>{const next=!open;setOpen(next);react(next?'listening':'wave',next?'Hello. What’s on your mind?':'Right here when you need me.');void window.screensense?.setExpanded(next).catch(()=>react('confused','Couldn’t resize the panel.'));};
 return <div className={open?'app expanded':'app'}><div className="chat-slot" hidden={!open}><ChatPanel onClose={toggle} onState={pose=>react(pose)}/></div><div className="pet-dock">{speech?<div className="pet-speech" role="status">{speech}</div>:open&&<div className="dock-note"><span>HERE WHEN YOU NEED ME</span><i>Drag me somewhere cozy.</i></div>}<DesktopPet state={state} onClick={toggle} small={open}/></div></div>;
}
