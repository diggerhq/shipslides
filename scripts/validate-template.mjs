import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTemplateProject } from "../node_modules/@opencomputer/cli/dist/template.js";
const staging = await mkdtemp(join(tmpdir(), "shipslides-template-"));
try {
  for (const path of ["opencomputer", "oc-template.toml"])
    await cp(path, join(staging, path), { recursive: true, filter: source => !source.split("/").includes(".opencomputer") });
  const result = await buildTemplateProject(staging);
  console.log(JSON.stringify({ template: result.template, agents: result.artifacts.map(({ localAgentId, size, digest }) => ({ localAgentId, size, digest })) }, null, 2));
} finally { await rm(staging, { recursive: true, force: true }); }
