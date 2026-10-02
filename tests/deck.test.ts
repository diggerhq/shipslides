import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareHtml, safeName, validateHtml } from "../opencomputer/agents/designer/tools/deck.js";
import { isPublicAddress, publicUrl } from "../opencomputer/agents/designer/tools/web.js";

test("artifact names cannot escape the workspace", () => {
  for (const name of ["../secret", "a/b", "", "a".repeat(49), "../deck", "x\\y"]) assert.throws(() => safeName(name));
  assert.equal(safeName("product-pitch"), "product-pitch");
});
test("rejects unsafe source URLs and local IPv4/IPv6 destinations", () => {
  for (const url of ["http://example.com", "file:///etc/passwd", "https://u:p@example.com", "https://example.com:8000"]) assert.throws(() => publicUrl(url));
  for (const address of ["127.0.0.1", "10.2.3.4", "169.254.169.254", "172.31.0.1", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2001:db8::1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
});
test("generated HTML is bounded and disallows external scripts and embedded documents", () => {
  const base = "<html><head></head><body>" + "x".repeat(300) + "</body></html>";
  assert.equal(validateHtml(base), base);
  for (const addition of ['<iframe src="https://example.com"></iframe>', '<script src="https://example.com/x.js"></script>', '<meta http-equiv="refresh" content="0;url=https://example.com">']) assert.throws(() => validateHtml(base.replace("</body>", addition + "</body>")));
  const hardened = prepareHtml(base);
  assert.match(hardened, /connect-src 'none'/);
  assert.match(hardened, /form-action 'none'/);
  assert.match(hardened, /@page\{size:1920px 1080px/);
});
