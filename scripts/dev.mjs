import {spawn} from 'node:child_process';
import {createServer} from 'vite';
const build=spawn('npm',['run','build:electron'],{stdio:'inherit',shell:process.platform==='win32'});
await new Promise(resolve=>build.on('exit',code=>code===0?resolve():process.exit(code??1)));
const server=await createServer(); await server.listen();
const child=spawn('electron',['.'],{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,SCREENSENSE_DEV_URL:'http://127.0.0.1:5173'}});
const close=async()=>{child.kill();await server.close();};
process.on('SIGINT',close);process.on('SIGTERM',close);
child.on('exit',async code=>{await server.close();process.exit(code??0)});
