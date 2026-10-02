import { blobQuota, clientIp, hashIp } from '../lib/quota.mjs';
export const config = { maxDuration: 60 };
const API = 'https://app.opencomputer.dev';
async function oc(path,init={}){const r=await fetch(API+'/api/managed-agents/'+path,{...init,headers:{'x-api-key':process.env.OPENCOMPUTER_API_KEY,'content-type':'application/json'},signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(typeof data.error==='string'?data.error:data.error?.message??'OpenComputer request failed');return data;}
function json(res,status,value){res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value));}
async function input(req){if(req.body){if(typeof req.body==='string')return JSON.parse(req.body);return req.body;}let raw='';for await(const c of req){raw+=c;if(raw.length>20000)throw Error('Brief too long');}return JSON.parse(raw||'{}');}
export default async function handler(req,res){
 try {
  const url=new URL(req.url,'https://shipslides.vercel.app');
  const route=url.searchParams.get('route')??url.pathname.replace(/^\/api\//,'');
  if(req.method==='POST'&&req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return json(res,403,{error:'Invalid origin'});}
  if(route==='generate'&&req.method==='POST'){
   const data=await input(req);if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>12000)throw Error('Enter a brief of up to 12,000 characters');
   const count=Number(data.slides);if(![5,8,12].includes(count))throw Error('Choose 5, 8 or 12 slides');
   const style=['Editorial','Cobalt','Dark'].includes(data.style)?data.style:'Editorial';
   const quota=blobQuota();const reservation=await quota.reserve(hashIp(clientIp(req)));
   let created;try{created=await oc('sessions',{method:'POST',body:JSON.stringify({agentId:process.env.OC_AGENT_ID})});}catch(e){await quota.release(reservation.id).catch(()=>{});throw e;}
   const {session}=created;
   await oc(`sessions/${session.id}/turns`,{method:'POST',body:JSON.stringify({input:`Create a ${count}-slide presentation. Style: ${style}. Audience: ${String(data.audience??'General audience').slice(0,150)}. User brief:\n${data.prompt}\nExport HTML, PDF and PNG previews. Work unattended.`,idempotencyKey:crypto.randomUUID()})});
   return json(res,200,{id:session.id});
  }
  const m=route.match(/^sessions\/([a-f0-9-]{36})(?:\/(events|files|file))?$/);
  if(m){const [,id,action]=m;const session=await oc(`sessions/${id}`);if(session.projectId!==process.env.OC_PROJECT_ID)return json(res,404,{error:'Session not found'});
   if(action==='events')return json(res,200,(await oc(`sessions/${id}/events?after=${Math.max(0,Number(url.searchParams.get('after')??0))}`)).events);
   if(action==='files')return json(res,200,await oc(`sessions/${id}/workspace/files`));
   if(action==='file'){const path=url.searchParams.get('path');if(!path?.startsWith('slides/')||path.includes('..'))throw Error('Invalid path');const auth=await oc(`sessions/${id}/workspace/download`,{method:'POST',body:JSON.stringify({path})});const r=await fetch(auth.url);if(!r.ok)throw Error('Download failed');res.setHeader('content-type',auth.mediaType??'application/octet-stream');res.setHeader('cache-control','no-store');if(url.searchParams.has('download'))res.setHeader('content-disposition',`attachment; filename="${path.split('/').at(-1)}"`);return res.end(Buffer.from(await r.arrayBuffer()));}
   return json(res,200,session);
  }
  json(res,404,{error:'Not found'});
 }catch(e){if(e.retryAfter)res.setHeader('retry-after',String(e.retryAfter));json(res,e.status??400,{error:e.message,...(e.code?{code:e.code}:{}),...(e.retryAt?{retryAt:e.retryAt}:{}),...(e.retryAfter?{retryAfter:e.retryAfter}:{})});}
}
