import { defineTool, type DataValue } from "@opencomputer/agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HEIGHT, OUTPUT, WIDTH, openBrowser } from "./runtime.js";

export function validateHtml(value: unknown): string {
  if (typeof value !== "string" || value.length < 300 || value.length > 750_000) throw new Error("Provide a complete HTML deck, 300–750,000 characters.");
  if (!/<html[\s>]/i.test(value) || !/<head[\s>]/i.test(value) || !/<\/head>/i.test(value) || !/<\/html>/i.test(value)) throw new Error("Include a complete HTML document with a head element.");
  if (/<(?:iframe|object|embed|video|audio)\b/i.test(value) || /<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(value)) throw new Error("Embedded documents, audio/video and redirects are not supported.");
  if (/<script[^>]+src\s*=/i.test(value)) throw new Error("Keep presentation JavaScript inline; external scripts are not allowed.");
  return value;
}

const exportCSS = `@page{size:1920px 1080px;margin:0} @media print {
html,body{width:1920px!important;height:auto!important;overflow:visible!important;margin:0!important}
.deck-viewport,.deck-stage{position:static!important;transform:none!important;width:1920px!important;height:auto!important;overflow:visible!important}
.slide{position:relative!important;inset:auto!important;width:1920px!important;height:1080px!important;display:block!important;visibility:visible!important;opacity:1!important;transform:none!important;break-after:page!important;overflow:hidden!important}
.slide:last-child{break-after:auto!important}.deck-controls,.editing-toolbar{display:none!important}
*,*::before,*::after{animation:none!important;transition:none!important}
.reveal{opacity:1!important;transform:none!important}}
html[data-export] *,html[data-export] *::before,html[data-export] *::after{animation:none!important;transition:none!important}
html[data-export] .reveal{opacity:1!important;transform:none!important}
html[data-export] .deck-controls,html[data-export] .editing-toolbar{display:none!important}`;

export function prepareHtml(html: string) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return html.replace(/<head([^>]*)>/i, `<head$1><meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace(/<\/head>/i, `<style>${exportCSS}</style></head>`);
}

async function inspect(html: string, output: string, signal?: AbortSignal, progress?: (step: string) => void) {
  const browser = await openBrowser(signal, progress);
  const errors: string[] = [];
  const abort = () => { void browser.close(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.route("**/*", (route: any) => {
      const url = new URL(route.request().url());
      return url.protocol === "https:" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)
        ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.setContent(prepareHtml(html), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]));
    await page.evaluate(() => { document.documentElement.dataset.export = "true"; });
    const count: number = await page.locator(".slide").count();
    if (count < 3 || count > 30) throw new Error("The deck must have 3–30 elements with class slide.");
    await mkdir(output, { recursive: true });
    const slides: Array<{ index: number; title: string; text: string; issues: string[]; previewPath: string }> = [];
    for (let index = 0; index < count; index++) {
      signal?.throwIfAborted();
      progress?.(`Checking slide ${index + 1} of ${count}`);
      await page.evaluate((index: number) => {
        document.querySelectorAll(".slide").forEach((slide, i) => {
          slide.classList.toggle("active", i === index);
          slide.classList.remove("visible");
          slide.setAttribute("aria-hidden", String(i !== index));
        });
      }, index);
      const result = await page.locator(".slide").nth(index).evaluate((slide: HTMLElement) => {
        const box = slide.getBoundingClientRect();
        const issues: string[] = [];
        if (Math.abs(box.width - 1920) > 2 || Math.abs(box.height - 1080) > 2) issues.push("Slide canvas must be 1920×1080.");
        if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) issues.push("Slide does not fit the viewport.");
        const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim() || !node.parentElement || node.parentElement.closest("script,style,.speaker-notes,[hidden]")) continue;
          if (!node.parentElement.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.left < box.left - 1 || rect.top < box.top - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1) issues.push(`Text outside canvas: ${node.textContent.trim().slice(0, 65)}`);
          const parent = node.parentElement;
          if ((parent.scrollWidth > parent.clientWidth + 2 || parent.scrollHeight > parent.clientHeight + 2) && getComputedStyle(parent).overflow !== "visible") issues.push(`Clipped text: ${node.textContent.trim().slice(0, 65)}`);
        }
        return { title: slide.querySelector("h1,h2,h3")?.textContent?.trim() ?? "", text: slide.innerText.slice(0, 3000), issues: [...new Set(issues)] };
      });
      const previewPath = join(output, `slide-${String(index + 1).padStart(2, "0")}.png`);
      await page.screenshot({ path: previewPath });
      slides.push({ index: index + 1, ...result, previewPath });
    }
    return { browser, page, count, slides, errors, ok: errors.length === 0 && slides.every(slide => slide.issues.length === 0), cleanup: () => signal?.removeEventListener("abort", abort) };
  } catch (error) {
    signal?.removeEventListener("abort", abort); await browser.close(); throw error;
  }
}

const schema = {
  type: "object", properties: {
    html: { type: "string", description: "Complete HTML deck with .deck-stage and 3–30 .slide sections. All assets inline except Google Fonts." },
    name: { type: "string", description: "Short file slug, e.g. product-pitch. Default deck. Reuse it when revising." },
  }, required: ["html"], additionalProperties: false,
};
export function safeName(value: unknown) {
  const name = String(value ?? "deck");
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(name)) throw new Error("name must be a lowercase slug, at most 48 characters.");
  return name;
}

export const checkDeck = defineTool({
  name: "check_deck", description: "Render every slide to PNG, check JavaScript errors, canvas bounds and clipped text. Returns preview paths for visual inspection. Fix all issues before export. These checks do not replace reviewing layout and content.", input: schema,
  async run({ input, signal, reportProgress }) {
    const name = safeName(input.name);
    const result = await inspect(validateHtml(input.html), join(OUTPUT, name, "draft"), signal, step => void reportProgress({ step }));
    try {
      await writeFile(join(OUTPUT, name, "draft", "index.html"), prepareHtml(validateHtml(input.html)));
      return { ok: result.ok, slideCount: result.count, errors: result.errors, slides: result.slides };
    }
    finally { result.cleanup(); await result.browser.close(); }
  },
});

export const exportDeck = defineTool({
  name: "export_deck", description: "Validate and export an HTML slide deck as a browser presentation, PDF, PNG previews and manifest.json in the session's /workspace/slides directory. No external storage credentials. Returns download paths. Export refuses decks with detected layout errors.", input: schema,
  async run({ input, signal, reportProgress }): Promise<DataValue> {
    const html = validateHtml(input.html), name = safeName(input.name), directory = join(OUTPUT, name);
    const result = await inspect(html, join(directory, "previews"), signal, step => void reportProgress({ step }));
    try {
      if (!result.ok) return { ok: false, errors: result.errors, slides: result.slides, message: "Fix the issues and call export_deck again." };
      await reportProgress({ step: "Exporting presentation and PDF" });
      const htmlPath = join(directory, "index.html"), pdfPath = join(directory, "deck.pdf");
      await result.page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
      await writeFile(htmlPath, prepareHtml(html));
      const manifest = { title: result.slides[0].title, slideCount: result.count, html: htmlPath, pdf: pdfPath, previews: result.slides.map(slide => slide.previewPath), createdAt: new Date().toISOString() };
      await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
      return { ok: true, ...manifest, manifest: join(directory, "manifest.json") };
    } finally { result.cleanup(); await result.browser.close(); }
  },
});

export const readDeck = defineTool({
  name: "read_deck", description: "Read an exported deck's HTML, or the latest checked draft when it has not been exported yet, for revision.",
  input: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
  async run({ input }) {
    const directory = join(OUTPUT, safeName(input.name));
    try { return { html: await readFile(join(directory, "index.html"), "utf8"), stage: "exported" }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { html: await readFile(join(directory, "draft", "index.html"), "utf8"), stage: "draft" };
    }
  },
});
