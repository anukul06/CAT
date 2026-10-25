export function question(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>8000)throw Error('Enter a question of 1–8,000 characters.');return value.trim();}
export function modelId(value:string):string{const id=value.replace(/^models\//,'');if(!/^gemma-[a-z0-9-]+$/.test(id))throw Error('GEMMA_MODEL must be a Gemma model ID. Gemini is never substituted.');return id;}
export function apiDiagnostic(error:unknown):{httpStatus?:number;providerStatus?:string}{
 const status=(error as {status?:unknown})?.status;
 let providerStatus:string|undefined;
 try{const value=JSON.parse(error instanceof Error?error.message:'');const code=value?.error?.status;if(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','NOT_FOUND','RESOURCE_EXHAUSTED','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED','CANCELLED','FAILED_PRECONDITION'].includes(code))providerStatus=code;}catch{}
 return {httpStatus:typeof status==='number'&&Number.isFinite(status)?status:undefined,providerStatus};
}
export function apiError(error:unknown):Error{
 const {httpStatus:status,providerStatus}=apiDiagnostic(error);
 const suffix=typeof status==='number'?` (HTTP ${status}${providerStatus?' · '+providerStatus:''})`:'';
 const text=error instanceof Error?error.message:String(error);
 if(status&&status>=500)return Error('Google is temporarily unavailable'+suffix+'. Your input preview is still available; retry when ready.');
 if(/No answer/.test(text))return Error(/MAX_TOKENS/.test(text)?'Gemma reached its response limit before answering. Try a shorter question.':'Gemma returned no usable answer. The response may have been blocked; try another question or image.');
 if(status===401||status===403||/API_KEY_INVALID|API key not valid/i.test(text))return Error('Google rejected the API key or access'+suffix+'. Check GEMINI_API_KEY in .env, API restrictions, and your AI Studio account. Restart after changes.');
 if(status===400)return Error('Google rejected this request'+suffix+'. Check your Gemma configuration and retry with a fresh question or screenshot.');
 if(status===429)return Error('Google rate limit reached'+suffix+'. Wait a moment, then try again. Check your AI Studio quota.');
 if(status===404||/not found|not supported|unsupported|image input|mime type/i.test(text))return Error('The configured Gemma model is unavailable or does not accept images'+suffix+'. Set GEMMA_MODEL to an image-capable Gemma model available in your AI Studio account (for example gemma-4-26b-a4b-it), then restart. No substitute model was used.');
 if(/timeout|aborted/i.test(text))return Error('Google took too long to respond. Please try again.');
 return Error('The request to Google failed'+suffix+'. Check your connection and retry; your screenshot has not been discarded.');
}
