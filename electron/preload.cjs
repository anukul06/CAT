const {contextBridge,ipcRenderer}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke('screensense:'+name,...args);
contextBridge.exposeInMainWorld('screensense',{
 setExpanded:open=>call('expanded',open), move:(dx,dy)=>call('move',dx,dy),
 status:()=>call('status'),history:()=>call('history'),clear:()=>call('clear'),
 displays:()=>call('displays'),capture:id=>call('capture',id),discard:()=>call('discard'),
 send:(question,captureId)=>call('send',question,captureId),openPermissions:()=>call('permissions'),quit:()=>call('quit'),
 assistant:()=>call('assistant'), task:operation=>call('task',operation),
 saveMemory:input=>call('memory-save',input),deleteMemory:id=>call('memory-delete',id),clearMemories:()=>call('memory-clear'),
 onEvent:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('screensense:event',listener);return ()=>ipcRenderer.removeListener('screensense:event',listener);} 
});
