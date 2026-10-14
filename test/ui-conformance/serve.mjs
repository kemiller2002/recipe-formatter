// Static server for the UI conformance suite. It serves exactly the files that
// .github/workflows/publish.yml stages for GitHub Pages, so the suite exercises
// what ships; any other path is a 404.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.UI_CONFORMANCE_PORT ?? 4321);

export const PUBLISHED = Object.freeze({
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/builder.css": "builder.css",
  "/favicon.svg": "favicon.svg",
  "/pilot-data/recipe-taxonomy.json": "pilot-data/recipe-taxonomy.json"
});

const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
});

const respond = (response, status, type, body) => {
  response.writeHead(status, { "content-type": type });
  response.end(body);
};

createServer(async (request, response) => {
  const file = PUBLISHED[new URL(request.url, "http://localhost").pathname];
  if (!file) return respond(response, 404, "text/plain", "Not found");
  const body = await readFile(resolve(root, file));
  return respond(response, 200, TYPES[extname(file)] ?? "application/octet-stream", body);
}).listen(port, "127.0.0.1", () => process.stdout.write(`serving published files on http://127.0.0.1:${port}\n`));
