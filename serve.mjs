#!/usr/bin/env node
/**
 * Preview `dist/` locally. Development only — the deployed site is plain static
 * files served by the host, and this exists so absolute paths like
 * `/assets/style.css` resolve the same way they will in production.
 *
 *   node serve.mjs [--port 4321]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist");
const i = process.argv.indexOf("--port");
const PORT = Number(i !== -1 ? process.argv[i + 1] : 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    // Strip the query, then contain the path inside dist/.
    const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    let file = join(DIST, rel);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");

    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404");
  }
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}`));
