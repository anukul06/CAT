// A local ad-hoc signature seals Electron's development bundle for macOS notifications.
// This is not a Developer ID signature or notarization for distribution.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
if(process.platform==='darwin'){
 const require=createRequire(import.meta.url);
 const binary=require('electron');
 const bundle=path.resolve(binary,'../../..');
 execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit'});
 console.log('Local Electron development bundle signed. Restart ScreenSense.');
}else console.log('Local ad-hoc signing is only needed on macOS.');
