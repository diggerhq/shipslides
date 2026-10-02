// Run once with the production Blob credential; never overwrite live counters.
import {get,put}from'@vercel/blob';
const path='quota/v1.json';
if(await get(path,{access:'private',useCache:false}))console.log('Quota state already exists; preserved');
else{await put(path,JSON.stringify({version:1,entries:[]}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});console.log('Private quota state initialized');}
