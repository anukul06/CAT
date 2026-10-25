import {ScanEye} from 'lucide-react';
import type {Message} from '../shared';
export function MessageBubble({message}:{message:Message}){return <article className={`message ${message.role}`}><div className="message-label">{message.role==='assistant'?(message.agent||'SCREENSENSE'):'YOU'}{message.image&&<span><ScanEye size={11}/> Screen attached</span>}</div><div className="message-text">{message.text}</div></article>}
