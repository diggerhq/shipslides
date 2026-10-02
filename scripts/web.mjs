import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { OpenComputerClient } from '../node_modules/@opencomputer/cli/dist/api.js';
import { resolveConfig } from '../node_modules/@opencomputer/cli/dist/config.js';
const port = Number(process.env.PORT ?? 4173);
const client = new OpenComputerClient(await resolveConfig({}));
const binding = JSON.parse(await readFile(new URL('../.opencomputer/project.json', import.meta.url), 'utf8'));
const dashboard = `https://app.opencomputer.dev/projects/${binding.projectId}`;
const base = '/api/managed-agents/sessions/';
function json(res, status, value) { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); }
async function body(req) { let data=''; for await (const chunk of req) { data+=chunk; if(data.length>20000)throw Error('Brief is too long'); } return JSON.parse(data); }
createServer(async (req,res) => {
 try {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  // This local preview uses your CLI login on the server. Reject cross-origin writes.
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`) return json(res,403,{error:'Invalid origin'});
  if (req.method==='GET' && url.pathname==='/') { res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});return res.end(await readFile(new URL('../web/index.html',import.meta.url))); }
  if(req.method==='GET' && ['/examples/index.html','/examples/deck.pdf','/examples/slide-01.png'].includes(url.pathname)) {
   const type=url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.pdf')?'application/pdf':'image/png';
   res.writeHead(200,{'content-type':type});return res.end(await readFile(new URL('../web'+url.pathname,import.meta.url)));
  }
  if(req.method==='POST' && url.pathname==='/api/generate') {
   const input=await body(req); if(typeof input.prompt!=='string'||!input.prompt.trim())throw Error('Enter a URL or presentation brief');
   const count=Number(input.slides);if(!Number.isInteger(count)||count<3||count>30)throw Error('Choose 3–30 slides');
   const style = ['Editorial','Cobalt','Dark'].includes(input.style) ? input.style : 'Editorial';
   const { session }=await client.createSession(binding.agentId);
   await client.createTurn(session.id,`Create a ${count}-slide presentation. Style: ${style}. Audience: ${String(input.audience??'General audience').slice(0,150)}. User brief:\n${input.prompt}\nExport HTML, PDF and PNG previews. Work unattended.`);
   return json(res,200,{id:session.id,dashboard});
  }
  const match=url.pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(events|files|file))?$/);
  if(match) {
   const [,id,action]=match;
   if(action==='events') return json(res,200,await client.events(id,Math.max(0,Number(url.searchParams.get('after')??0))));
   if(action==='files') return json(res,200,await client.request(base+id+'/workspace/files'));
   if(action==='file') {
    const path=url.searchParams.get('path');if(!path?.startsWith('slides/')||path.includes('..'))throw Error('Invalid file path');
    const auth=await client.request(base+id+'/workspace/download',{method:'POST',body:JSON.stringify({path})});
    const upstream=await fetch(auth.url);if(!upstream.ok)throw Error('File download failed');
    const data=Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200,{'content-type':auth.mediaType??'application/octet-stream','cache-control':'no-store',...(url.searchParams.has('download')?{'content-disposition':`attachment; filename="${path.split('/').at(-1)}"`}:{})});return res.end(data);
   }
   return json(res,200,await client.session(id));
  }
  json(res,404,{error:'Not found'});
 }catch(error){json(res,400,{error:error.message});}
}).listen(port,'127.0.0.1',()=>console.log(`ShipSlides prompt UI: http://127.0.0.1:${port}`));
