// CLI 0.6.9 scans its own generated runtime as source. Remove when upstream fixes it.
import { readFile, writeFile } from "node:fs/promises";
const path = new URL("../node_modules/@opencomputer/cli/dist/doctor.js", import.meta.url);
const source = await readFile(path, "utf8");
const before = "if (entry.isDirectory())\n            files.push";
const after = 'if (entry.isDirectory() && ![".opencomputer", "node_modules", ".git"].includes(entry.name))\n            files.push';
if (source.includes(before)) await writeFile(path, source.replace(before, after));
else if (!source.includes(after)) throw new Error("CLI doctor changed; review the generated-directory fix");
