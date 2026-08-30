// Servidor estático simple para probar la app en la PC.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../docs/", import.meta.url));
const PUERTO = process.env.PORT || 8080;
const TIPOS = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".webmanifest":"application/manifest+json; charset=utf-8", ".png":"image/png",
  ".svg":"image/svg+xml", ".ico":"image/x-icon",
};

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(req.url.split("?")[0]);
    if (ruta.endsWith("/")) ruta += "index.html";
    const abs = join(RAIZ, normalize(ruta));
    if (!abs.startsWith(RAIZ)) { res.writeHead(403).end("Prohibido"); return; }
    await stat(abs);
    const buf = await readFile(abs);
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(abs)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
  }
}).listen(PUERTO, () => console.log(`\n▶ App en  http://localhost:${PUERTO}\n  (Ctrl+C para parar)\n`));
