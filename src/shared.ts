export type Message={id:string;role:'user'|'assistant';text:string;createdAt:string;image?:boolean;agent?:AgentName};
export type DisplayOption={id:string;name:string};
export type Capture={id:string;dataUrl:string;width:number;height:number;displayName:string;capturedAt:string};
export type Status={configured:boolean;model:string;permission:string};
export interface DesktopAPI {
 setExpanded(open:boolean):Promise<void>;
 move(dx:number,dy:number):Promise<void>;
 status():Promise<Status>;
 history():Promise<Message[]>;
 clear():Promise<void>;
 displays():Promise<DisplayOption[]>;
 capture(id:string):Promise<Capture>;
 discard():Promise<void>;
 send(question:string,captureId?:string):Promise<Message[]>;
 openPermissions():Promise<void>;
 quit():Promise<void>;
 assistant():Promise<AssistantSnapshot>;
 task(operation:TaskOperation):Promise<Task[]>;
 saveMemory(input:MemoryInput):Promise<Memory[]>;
 deleteMemory(id:string):Promise<Memory[]>;
 clearMemories():Promise<void>;
 voicePermission():Promise<void>;
 saveVoiceNote(input:VoiceNoteInput):Promise<VoiceNote[]>;
 voiceAudio(id:string):Promise<string>;
 deleteVoiceNote(id:string):Promise<VoiceNote[]>;
 watchHistory():Promise<WatchEntry[]>;
 watchCapture(displayId:string):Promise<Capture>;
 watchDiscard():Promise<void>;
 watchAnalyze(request:WatchRequest):Promise<WatchEntry>;
 watchClear():Promise<void>;
 watchLogConnect():Promise<LogTail|undefined>;
 watchLogTail():Promise<LogTail>;
 watchLogReview():Promise<LogSample>;
 watchLogDisconnect():Promise<void>;
 onEvent(callback:(event:AssistantEvent)=>void):()=>void;
}
declare global{interface Window{screensense?:DesktopAPI}}

export type AgentName='Coordinator'|'VisionAgent'|'TaskAgent'|'ResearchAgent'|'MemoryAgent'|'AgentWatch';
export type PetState='idle'|'blink'|'breathe'|'bounce'|'wave'|'thinking'|'listening'|'happy'|'confused'|'sleepy'|'celebrating';
export type Activity={id:string;agent:AgentName;status:'running'|'success'|'error';label:string;at:string};
export type Task={id:string;title:string;createdAt:string;dueAt?:string;timezone:string;completedAt?:string;notifiedAt?:string;notificationStatus?:'claimed'|'sent'|'failed'};
export type Memory={id:string;text:string;kind:'preference'|'summary';createdAt:string;updatedAt:string};
export type AssistantSnapshot={tasks:Task[];memories:Memory[];voiceNotes:VoiceNote[];activity:Activity[];dataPath:string;notificationsSupported:boolean};
export type AssistantEvent={type:'activity';activity:Activity}|{type:'reminder';task:Task}|{type:'changed'}|{type:'watch-result';entry:WatchEntry};
export type TaskInput={title:string;dueAt?:string};
export type TaskOperation={tool:'create_task';input:TaskInput}|{tool:'create_reminder';input:Required<TaskInput>}|{tool:'list_tasks'}|{tool:'complete_task'|'delete_task';id:string};
export type MemoryInput={text:string;kind:'preference'|'summary';approved:true;id?:string};

export type VoiceNote={id:string;title:string;duration:number;createdAt:string;mimeType:'audio/webm'};
export type VoiceNoteInput={title:string;duration:number;mimeType:string;bytes:Uint8Array};

export type WatchStatus='working'|'waiting'|'error'|'completed'|'unknown';
export type WatchResult={
 doing:string;status:WatchStatus;warnings:string[];nextAction:string;
 confidence:'low'|'medium'|'high';confidenceReason:string;limitations:string[];evidence:string[];
 comparison:{summary:string;changes:string[]}|null;
};
export type WatchEntry=WatchResult&{id:string;capturedAt:string;analyzedAt:string;displayName:string;model:string;previousId?:string;source?:'screenshot'|'log'};
export type WatchRequest={captureId:string;compareWith?:string};

export type LogTail={name:string;text:string;sampledAt:string;modifiedAt:string;truncated:boolean};
export type LogSample=LogTail&{id:string};
