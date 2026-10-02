import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile(new URL("../examples/background-agents.html", import.meta.url));
const server = createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/index.html") { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
});
server.listen(Number(process.env.PORT ?? 3207), "127.0.0.1", () => console.log(`Hand-authored example deck: http://127.0.0.1:${server.address().port}`));
