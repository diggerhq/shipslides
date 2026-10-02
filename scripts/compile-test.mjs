import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"], { stdio: "inherit" });
