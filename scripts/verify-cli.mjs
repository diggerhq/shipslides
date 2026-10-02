import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { doctorProject } from '../node_modules/@opencomputer/cli/dist/doctor.js';
const root = await mkdtemp(join(tmpdir(), 'shipslides-doctor-'));
try {
 await cp('opencomputer', join(root, 'opencomputer'), {recursive:true,filter:source=>!source.split('/').includes('.opencomputer')});
 const generated=join(root,'opencomputer/agents/designer/.opencomputer/runtime');await mkdir(generated,{recursive:true});
 const duplicate='defineTool({ name: "check_deck" });';
 await writeFile(join(generated,'agent.js'),duplicate);
 const clean=await doctorProject(root);assert.equal(clean.ok,true,JSON.stringify(clean));
 await writeFile(join(root,'opencomputer/misplaced.ts'),duplicate);
 const invalid=await doctorProject(root);assert.equal(invalid.ok,false);
 assert.ok(invalid.diagnostics.some(d=>d.code==='tool_location_invalid'));
 assert.ok(invalid.diagnostics.some(d=>d.code==='tool_name_duplicate'));
 console.log('CLI diagnostics ignore generated runtime and still reject misplaced/duplicate source tools');
} finally {await rm(root,{recursive:true,force:true});}
