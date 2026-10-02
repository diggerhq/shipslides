import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

// Set a runtime package directory and browser channel to verify using an
// existing browser without installing packages; omit them in the agent VM.
process.env.SHIPSLIDES_OUTPUT_DIR ??= resolve("artifacts");
const { checkDeck, exportDeck, readDeck } = await import("../opencomputer/agents/designer/tools/deck.js");
const html = await readFile("examples/background-agents.html", "utf8");
const context = { input: { html, name: "background-agents" }, sessionId: "local", messageId: "local", agentId: "designer", reportProgress: async () => {} };
const checked = await checkDeck.run(context) as any;
assert.equal(checked.ok, true, JSON.stringify(checked, null, 2));
const fresh = await checkDeck.run({ ...context, input: { html, name: "draft-read-check" } }) as any;
assert.equal(fresh.ok, true);
const draft = await readDeck.run({ ...context, input: { name: "draft-read-check" } }) as any;
assert.equal(draft.stage, "draft");
assert.ok(draft.html.includes("<html"));
const exported = await exportDeck.run(context) as any;
assert.equal(exported.ok, true);
assert.equal(exported.slideCount, 8);
const pdf = await readFile(exported.pdf);
assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
assert.equal([...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length, 8, "PDF must contain exactly eight pages");
const { openBrowser } = await import("../opencomputer/agents/designer/tools/runtime.js");
const browser = await openBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(await readFile(exported.html, "utf8"));
  await page.evaluate(() => (window as any).goToSlide(3));
  assert.equal(await page.locator(".slide.active").count(), 1);
  const box = await page.locator(".deck-stage").boundingBox();
  assert.ok(box && Math.abs(box.width / box.height - 16 / 9) < 0.01);
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(".slide.active h2").innerText(), "Tools turn a model into a worker.");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await page.locator(".slide.active h2").getAttribute("contenteditable"), "true");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/mobile.png" });
} finally { await browser.close(); }
// Deliberately broken layout must be rejected rather than clipped into a PDF.
const broken = html.replace("The loop that keeps work moving.", "The loop that keeps work moving.").replace(".slide{padding:", ".slide h2{position:relative;left:1900px!important}.slide{padding:");
const rejected = await exportDeck.run({ ...context, input: { html: broken, name: "broken" } }) as any;
assert.equal(rejected.ok, false, "Out-of-bounds text must fail export");
console.log(JSON.stringify({ slideCount: exported.slideCount, pdf: exported.pdf, html: exported.html, mobileAndNavigation: "passed", badLayoutRejected: true }, null, 2));
