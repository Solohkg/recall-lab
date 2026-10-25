// Recall Lab, local edition.
// Serves the app on http://localhost:5173 and stands in for the claude.ai runtime:
//   POST /api/ai        -> runs `codex exec` with your ChatGPT login (no API key)
//   /api/db/*           -> JSON document store in data/db.json
//   /api/assets, /_blob -> uploaded PDFs and photos in data/assets/
// No dependencies: Node 18+ only.

const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const ASSETS = path.join(DATA, "assets");
const DB_FILE = path.join(DATA, "db.json");
const PORT = Number(process.env.PORT) || 5188;
const MAX_UPLOAD = 25 * 1048576;

fs.mkdirSync(ASSETS, { recursive: true });

/* ---------- Codex CLI ---------- */

function findCodex() {
  const candidates = [
    process.env.CODEX_BIN,
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
    path.join(os.homedir(), "Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try { return execFileSync("/bin/sh", ["-lc", "command -v codex"], { encoding: "utf8" }).trim() || null; } catch { return null; }
}

// Use the model you picked in Codex (~/.codex/config.toml) unless CODEX_MODEL overrides it.
function configuredModel() {
  if (process.env.CODEX_MODEL) return process.env.CODEX_MODEL;
  try {
    const toml = fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8");
    const m = toml.match(/^model\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch { return null; }
}

const CODEX = findCodex();
const MODEL = configuredModel();
const EFFORT = { quick: "low", default: "medium", complex: "high" };
const WORKDIR = fs.mkdtempSync(path.join(os.tmpdir(), "recall-lab-ai-"));

const router = require('./ai-router.cjs')({data:DATA,codex:CODEX});
const audio = require('./local-audio.cjs')({assets:ASSETS});
const imports = require('./source-import.cjs')({root:ROOT});

/* ---------- JSON document store ---------- */

let DB = {};
try { DB = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
let writing = Promise.resolve();
function saveDb() {
  writing = writing.then(async () => {
    const tmp = DB_FILE + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(DB));
    await fsp.rename(tmp, DB_FILE);
  }).catch(e => console.error("Couldn't save data/db.json:", e.message));
  return writing;
}

/* ---------- HTTP ---------- */

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { reject(Object.assign(new Error("too_large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const safeId = s => /^[A-Za-z0-9_-]{1,80}$/.test(s);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  const host=req.headers.host;
  if(![`localhost:${PORT}`,`127.0.0.1:${PORT}`].includes(host))return send(res,403,{error:"Invalid host"});
  if(!["GET","HEAD"].includes(req.method)&&req.headers.origin&&!['http://localhost:'+PORT,'http://127.0.0.1:'+PORT].includes(req.headers.origin))return send(res,403,{error:"Invalid origin"});
  try {
    if(req.headers.origin && ![`http://127.0.0.1:${PORT}`,`http://127.0.0.1:${PORT}`].includes(req.headers.origin)) return send(res,403,{error:"Origin rejected"});
    if(req.headers['sec-fetch-site']==='cross-site') return send(res,403,{error:"Cross-site request rejected"});
    if (p === "/api/status") return send(res, 200, { app:"recall-lab",version:"3.0.0",ai: !!CODEX, model: router.state().settings.routes.chat });
    if(p === '/api/models' && req.method === 'GET') return send(res,200,router.state());
    if(p === '/api/models' && req.method === 'PUT') { try { return send(res,200,router.configure(JSON.parse((await readBody(req,100000)).toString('utf8')))); }catch(e){return send(res,400,{error:e.message})} }
    if(p === '/api/audio' && req.method === 'POST') return send(res,200,await audio(JSON.parse((await readBody(req,100000)).toString('utf8'))));
    if(p === '/api/import' && req.method === 'POST') return send(res,200,await imports.url(JSON.parse((await readBody(req,100000)).toString('utf8')).url));
    if(p === '/api/extract' && req.method === 'POST') return send(res,200,await imports.file(await readBody(req),url.searchParams.get('name')||'source'));
    if(p === '/api/export/anki' && req.method === 'POST') {const result=await imports.anki(JSON.parse((await readBody(req,8000000)).toString('utf8')));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="recall-lab.apkg"'});return res.end(result);}


    if (p === "/api/ai" && req.method === "POST") {
      const body = JSON.parse((await readBody(req, 60 * 1048576)).toString("utf8"));
      let abort = () => {};
      res.on("close", () => { if (!res.writableEnded) abort(); });
      try {
        const out = await router.run(body, fn => { abort = fn; });
        return send(res, 200, out);
      } catch (e) { return send(res, 200, { error: e }); }
    }

    if (p === "/api/db" && req.method === "GET") return send(res, 200, DB);
    if (p.startsWith("/api/db/")) {
      const key = p.slice("/api/db/".length);
      if (req.method === "PUT") { DB[key] = JSON.parse((await readBody(req, 30 * 1048576)).toString("utf8")); await saveDb(); return send(res, 200, { ok: true }); }
      if (req.method === "DELETE") { delete DB[key]; await saveDb(); return send(res, 200, { ok: true }); }
      if (req.method === "GET") return send(res, 200, DB[key] ?? null);
    }

    if (p === "/api/assets" && req.method === "POST") {
      const data = await readBody(req);
      const id = crypto.randomBytes(16).toString("hex");
      const contentType = (req.headers["content-type"] || "application/octet-stream").split(";")[0];
      await fsp.writeFile(path.join(ASSETS, id), data);
      await fsp.writeFile(path.join(ASSETS, id + ".type"), contentType);
      return send(res, 200, { id, url: "/_blob/" + id, sizeBytes: data.length, contentType });
    }
    if (p === "/api/assets" && req.method === "GET") {
      const ids = (await fsp.readdir(ASSETS)).filter(f => !f.endsWith(".type"));
      const assets = await Promise.all(ids.map(async id => ({ id, url: "/_blob/" + id, sizeBytes: (await fsp.stat(path.join(ASSETS, id))).size })));
      return send(res, 200, { assets, usage: { bytes: assets.reduce((n, a) => n + a.sizeBytes, 0) } });
    }
    if (p.startsWith("/api/assets/") && req.method === "DELETE") {
      const id = p.slice("/api/assets/".length); if (!safeId(id)) return send(res, 400, { error: "bad id" });
      await fsp.rm(path.join(ASSETS, id), { force: true }); await fsp.rm(path.join(ASSETS, id + ".type"), { force: true });
      return send(res, 200, { ok: true });
    }
    if (p.startsWith("/_blob/")) {
      const id = p.slice("/_blob/".length); if (!safeId(id)) return send(res, 404, "Not found", "text/plain");
      const f = path.join(ASSETS, id);
      if (!fs.existsSync(f)) return send(res, 404, "Not found", "text/plain");
      let type = "application/octet-stream"; try { type = fs.readFileSync(f + ".type", "utf8"); } catch {}
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "private, max-age=31536000" });
      return fs.createReadStream(f).pipe(res);
    }

    // static files
    const file = path.join(PUBLIC, p === "/" ? "index.html" : p);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, e.status || 500, { error: { code: "error", message: e.message } });
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.requestTimeout = 0; // AI calls can take a few minutes on long lectures

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Recall Lab is running:  http://127.0.0.1:${PORT}\n`);
  console.log(CODEX ? `  AI: per-task models via Codex; chat=${router.state().settings.routes.chat}` : "  AI: Codex not found. Study tools work; AI features stay off.");
  console.log("  Your data: " + DATA + "\n  Press Ctrl+C to stop.\n");
});
