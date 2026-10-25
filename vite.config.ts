import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({command})=>({
 plugins:[react(),tailwindcss(),...(command==='serve'?[{name:'dev-refresh-csp',transformIndexHtml(html:string){return html.replace("script-src 'self'","script-src 'self' 'unsafe-inline'");}}]:[])],
 base:'./',server:{host:'127.0.0.1',port:5173,strictPort:true}
}));
