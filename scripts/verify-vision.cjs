// Sends only the app's UI-only test artifact, never the desktop.
const {app,nativeImage}=require('electron');
app.whenReady().then(async()=>{
 const {config}=await import('dotenv');const {Gemma}=await import('../dist-electron/electron/gemma.js');
 config({quiet:true});
 try{const image=nativeImage.createFromPath(require('node:path').resolve('artifacts/app.png'));const jpeg=image.toJPEG(88).toString('base64');
 const gemma=new Gemma(process.env.GEMINI_API_KEY,process.env.GEMMA_MODEL||'gemma-4-26b-a4b-it');
 const answer=await gemma.analyze('Describe this screenshot briefly. What application is visible?',jpeg,[]);
 console.log('VISION RESPONSE:',answer);app.exit(0);
 }catch(e){console.error(e.message);app.exit(1);}
});
