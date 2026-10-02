import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { get, put, BlobError, BlobPreconditionFailedError } from '@vercel/blob';
export const WINDOW = 24 * 60 * 60 * 1000;
export const IP_LIMIT = 3;
export const DAILY_LIMIT = 50;
export class QuotaExceeded extends Error {
 constructor(scope,retryAt,now){super(scope==='ip'?'You’ve used your 3 presentations for this IP in the last 24 hours. Please try again after your quota resets.':'Today’s demo limit of 50 presentations has been reached. Try again after midnight UTC, or deploy your own ShipSlides.');this.status=429;this.code=scope==='ip'?'ip_quota_exceeded':'daily_quota_exceeded';this.retryAt=new Date(retryAt).toISOString();this.retryAfter=Math.max(1,Math.ceil((retryAt-now)/1000));}
}
export class QuotaUnavailable extends Error {
 constructor(){super('Generation is temporarily unavailable. Please try again shortly.');this.status=503;this.code='quota_unavailable';}
}
export class QuotaConflict extends Error {}
export function clientIp(req){
 // Vercel overwrites X-Forwarded-For with the client IP at its trusted edge.
 const value=String(req.headers['x-forwarded-for']??'').split(',')[0].trim();
 const version=isIP(value);if(!version)throw new QuotaUnavailable();
 return version===6?new URL(`http://[${value}]`).hostname.slice(1,-1):value;
}
export function hashIp(ip,salt=process.env.QUOTA_IP_SALT){if(!salt)throw new QuotaUnavailable();return createHmac('sha256',salt).update(ip).digest('hex');}
function validateState(state){
 if(!state||state.version!==1||!Array.isArray(state.entries)||state.entries.length>200||state.entries.some(e=>typeof e.id!=='string'||typeof e.ip!=='string'||!Number.isFinite(e.at)))throw new QuotaUnavailable();
}
export function createQuota(store,{now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}={}){
 async function mutate(change){
  for(let attempt=0;attempt<attempts;attempt++){
   let snapshot;try{snapshot=await store.read();validateState(snapshot.state);}catch{throw new QuotaUnavailable();}
   const at=now(),entries=snapshot.state.entries.filter(e=>e.at>at-WINDOW);
   const {next,result}=change(entries,at);
   try{await store.write({version:1,entries:next},snapshot.etag);return result;}
   catch(e){if(!(e instanceof QuotaConflict))throw new QuotaUnavailable();await wait(10+Math.floor(Math.random()*40));}
  }
  throw new QuotaUnavailable();
 }
 return {
  reserve(ip){const id=randomUUID();return mutate((entries,at)=>{
   const dayStart=Math.floor(at/WINDOW)*WINDOW;
   const daily=entries.filter(e=>e.at>=dayStart);
   if(daily.length>=DAILY_LIMIT)throw new QuotaExceeded('daily',dayStart+WINDOW,at);
   const own=entries.filter(e=>e.ip===ip);
   if(own.length>=IP_LIMIT)throw new QuotaExceeded('ip',Math.min(...own.map(e=>e.at))+WINDOW,at);
   return {next:[...entries,{id,ip,at}],result:{id,remaining:IP_LIMIT-own.length-1}};
  });},
  release(id){return mutate(entries=>({next:entries.filter(e=>e.id!==id),result:undefined}));}
 };
}
export function blobQuota(path='quota/v1.json'){
 const store={
  async read(){if(!process.env.BLOB_READ_WRITE_TOKEN)throw new QuotaUnavailable();const result=await get(path,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(10000)});if(!result?.stream)throw new QuotaUnavailable();return {etag:result.blob.etag,state:JSON.parse(await new Response(result.stream).text())};},
  async write(state,etag){try{await put(path,JSON.stringify(state),{access:'private',addRandomSuffix:false,allowOverwrite:true,ifMatch:etag,contentType:'application/json',cacheControlMaxAge:60,abortSignal:AbortSignal.timeout(10000)});}catch(e){if(e instanceof BlobPreconditionFailedError || (e instanceof BlobError && e.message.includes("conditional request cannot succeed due to a conflicting operation")))throw new QuotaConflict();throw e;}}
 };
 return createQuota(store);
}
