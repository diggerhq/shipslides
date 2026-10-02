import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

export const RUNTIME = process.env.SHIPSLIDES_RUNTIME_DIR ?? join(homedir(), ".shipslides-renderer");
export const OUTPUT = process.env.SHIPSLIDES_OUTPUT_DIR ?? "/workspace/slides";
export const WIDTH = 1920;
export const HEIGHT = 1080;

function command(binary: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    execFile(binary, args, { cwd: RUNTIME, signal, timeout: 600_000, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${binary} failed: ${String(stderr || stdout).slice(-1200)}`));
      else resolve();
    });
  });
}

let ready: Promise<void> | undefined;
export async function bootstrap(signal?: AbortSignal, progress?: (step: string) => void) {
  if (process.env.SHIPSLIDES_BROWSER_CHANNEL) return;
  ready ??= (async () => {
    await mkdir(RUNTIME, { recursive: true });
    await writeFile(join(RUNTIME, "package.json"), '{"private":true}');
    progress?.("Installing the slide renderer");
    await command("npm", ["install", "playwright-core@1.58.2", "--no-audit", "--no-fund"], signal);
    if (process.platform === "linux") {
      progress?.("Installing browser libraries");
      await command("/bin/bash", ["-c", "if command -v dnf >/dev/null; then dnf install -y -q nss nspr atk at-spi2-atk at-spi2-core cups-libs libdrm libxkbcommon libXcomposite libXdamage libXrandr libXfixes libXext libX11 libxcb mesa-libgbm pango cairo alsa-lib libxshmfence expat google-noto-sans-fonts liberation-fonts; elif command -v apt-get >/dev/null; then ./node_modules/.bin/playwright-core install-deps chromium; else exit 1; fi"], signal);
    }
    await command(join(RUNTIME, "node_modules", ".bin", "playwright-core"), ["install", "chromium-headless-shell"], signal);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}

// Browser packages are installed inside the agent's runtime, not required in
// the template's dependency graph. The local verification script reuses Chrome.
export async function openBrowser(signal?: AbortSignal, progress?: (step: string) => void): Promise<any> {
  await bootstrap(signal, progress);
  const require = createRequire(join(RUNTIME, "package.json"));
  const { chromium } = require("playwright-core");
  return chromium.launch({
    headless: true,
    ...(process.env.SHIPSLIDES_BROWSER_CHANNEL ? { channel: process.env.SHIPSLIDES_BROWSER_CHANNEL } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  });
}
