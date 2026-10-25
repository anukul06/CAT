import type {PetState,WatchEntry} from './shared';
export function watchReaction(entry:Pick<WatchEntry,'status'|'confidence'|'comparison'>):{pose:PetState;speech:string}{
 if(entry.confidence==='low')return {pose:'breathe',speech:'Hard to tell. Let’s review the evidence.'};
 switch(entry.status){
 case 'error':return {pose:'confused',speech:'A visible error. Let’s take a look.'};
 case 'waiting':return {pose:'sleepy',speech:'Looks like it’s waiting for a nudge.'};
 case 'completed':return {pose:'celebrating',speech:'A completion message is visible!'};
 case 'working':return {pose:'bounce',speech:entry.comparison?.changes.length?'Some visible progress to review.':'It appears to be working.'};
 default:return {pose:'breathe',speech:'I can’t tell from this snapshot.'};
 }
}
