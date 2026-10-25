// Local stand-in for the claude.ai artifact runtime (window.claude.use).
// The app was written for Claude artifacts; this file gives it the same
// sample / db / user / assets namespaces, backed by server.js:
//   sample -> Codex (your ChatGPT login), db -> data/db.json, assets -> data/assets/.
(() => {
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const fail = (code, message, extra) => Object.assign(new Error(message), { code, message }, extra || {});

  async function api(path, init) {
    let r;
    try { r = await fetch(path, init).catch(e => { if (init && init.signal && init.signal.aborted) throw e; return new Promise(ok => setTimeout(ok, 400)).then(() => fetch(path, init)); }); }
    catch (e) { if (init && init.signal && init.signal.aborted) throw fail("cancelled", "Stopped."); console.warn("Recall Lab server request failed:", path, e); throw fail("unavailable", "暫時連唔到，請稍後再試。"); }
    if (!r.ok) throw fail(r.status === 413 ? "too_large" : "unavailable", "Server error " + r.status);
    return r.json();
  }

  /* ---------- sample (AI via Codex) ---------- */

  // The app's model picker sends these ids; each maps to a Codex reasoning effort.
  const TIER_OF = { fast: "quick", balanced: "default", thorough: "complex" };

  const PREAMBLE = "You are the AI built into Recall Lab, a revision web app for a university pharmacology and human physiology student. " +
    "Reply directly with the answer text the app asked for. Do not run shell commands, browse, read or edit files; you have everything you need below.\n" +
    "LANGUAGE: the app's own language rules in the request below override any general language preference you were given. " +
    "Flashcards, questions, answers, key points and all JSON content are in English (the exam is in English) unless the request explicitly says otherwise.\n\n";

  function toPrompt(input) {
    if (typeof input === "string") return PREAMBLE + input;
    const msgs = input.filter(m => m && m.content != null);
    if (msgs.length === 1) return PREAMBLE + msgs[0].content;
    return PREAMBLE + "Here is the conversation so far. Write the next ASSISTANT reply.\n\n" +
      msgs.map(m => `[${m.role === "assistant" ? "ASSISTANT" : "USER"}]\n${m.content}`).join("\n\n");
  }

  function toolsText(tools) {
    return "\n\nTOOLS. You can change the app for the student with these tools:\n" +
      tools.map(t => `- ${t.name}: ${t.description || ""}\n  input JSON schema: ${JSON.stringify(t.inputSchema || { type: "object" })}`).join("\n") +
      '\n\nTo call tools, reply with ONLY this JSON and nothing else: {"tool_calls":[{"name":"<tool name>","input":{...}}]}\n' +
      "You will then get the results and can write your final reply. If no tool is needed, just reply normally.";
  }

  function parseJSON(text) {
    const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return { ok: true, value: JSON.parse(t) }; } catch {}
    const starts = [t.indexOf("{"), t.indexOf("[")].filter(i => i >= 0);
    if (starts.length) {
      const s = Math.min(...starts), e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
      if (e > s) { try { return { ok: true, value: JSON.parse(t.slice(s, e + 1)) }; } catch {} }
    }
    return { ok: false };
  }

  const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

  async function callCodex(prompt, opts, images) {
    const tier = TIER_OF[opts.model] || opts.modelTier || "default";
    const out = await api("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal,
      body: JSON.stringify({ prompt, tier, images, model:opts.model, effort:opts.effort, task:opts.task, cache:opts.cache, schema:opts.schema, intent:opts.intent, difficulty:opts.difficulty }),
    });
    if (out.error) throw fail(out.error.code || "error", out.error.message || "Codex couldn't answer.");
    window.recallLastReceipt = out.receipt;
    window.dispatchEvent(new CustomEvent("recall-ai-receipt",{detail:out.receipt}));
    return out.text || "";
  }

  async function sample(input, opts = {}) {
    if (opts.signal && opts.signal.aborted) throw fail("cancelled", "Stopped.");
    const images = opts.images && opts.images.length ? await Promise.all(opts.images.map(blobToDataURL)) : [];
    const tools = Array.isArray(opts.tools) && opts.tools.length ? opts.tools : null;
    let prompt = toPrompt(input) + (tools ? toolsText(tools) : "") + (opts._suffix || "");
    let text = "";
    for (let round = 0; round < 5; round++) {
      text = await callCodex(prompt, opts, round === 0 ? images : []);
      if (!tools) break;
      const p = parseJSON(text);
      const calls = p.ok && p.value && Array.isArray(p.value.tool_calls) ? p.value.tool_calls : null;
      if (!calls || !calls.length) break;
      const results = [];
      for (const c of calls) {
        const tool = tools.find(t => t.name === c.name);
        try {
          if (!tool) throw new Error("Unknown tool " + c.name);
          results.push({ name: c.name, result: await tool.execute(c.input || {}) ?? "done" });
        } catch (e) { results.push({ name: c.name, error: String(e && e.message || e) }); }
      }
      prompt += `\n\n[ASSISTANT]\n${text}\n\n[TOOL RESULTS]\n${JSON.stringify(results)}\n\nNow write your final reply to the student (no more tool calls unless needed).`;
      text = "";
    }
    if (opts.onText) { try { opts.onText({ text, delta: text }); } catch {} }
    return { text, truncated: false, modelApplied: !!opts.model, receipt:window.recallLastReceipt };
  }

  sample.json = async (input, opts = {}) => {
    const r = await sample(input, { ...opts, _suffix: "\n\nReturn only valid JSON: no code fences, no commentary before or after." });
    const p = parseJSON(r.text);
    if (!p.ok) throw fail("invalid_json", "The AI's reply wasn't valid JSON. Try again.", { text: r.text });
    return p.value;
  };
  sample.limits = async () => ({ images: { maxCount: 20 }, tools: true, maxInputBytes: 8 * 1048576 });

  /* ---------- db (data/db.json via the server) ---------- */

  let all = null;
  const load = async () => (all = all || await api("/api/db"));
  const snapDoc = (key, v) => ({ id: key.split("/").pop(), ref: ref(key), exists: v != null, data: () => v == null ? undefined : clone(v) });
  function ref(key) {
    return {
      id: key.split("/").pop(), path: key,
      async get() { const a = await load(); return snapDoc(key, a[key]); },
      async set(v) { await api("/api/db/" + key, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }); (await load())[key] = clone(v); },
      async update(patch) { const a = await load(); const v = { ...(a[key] || {}), ...patch }; await this.set(v); },
      async delete() { await api("/api/db/" + key, { method: "DELETE" }); delete (await load())[key]; },
    };
  }
  const test = (v, op, x) => op === "==" ? v === x : op === "!=" ? v !== x : op === "in" ? x.includes(v) : op === "array-contains" ? Array.isArray(v) && v.includes(x)
    : op === "<" ? v < x : op === "<=" ? v <= x : op === ">" ? v > x : op === ">=" ? v >= x : false;
  function collection(path) {
    const query = (filters, lim) => ({
      where: (f, op, x) => query([...filters, [f, op, x]], lim),
      orderBy() { return query(filters, lim); },
      limit: n => query(filters, n),
      async get() {
        const a = await load();
        let docs = Object.keys(a).filter(k => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/"))
          .filter(k => filters.every(([f, op, x]) => a[k] && test(a[k][f], op, x)))
          .map(k => snapDoc(k, a[k]));
        if (lim) docs = docs.slice(0, lim);
        return { docs, size: docs.length, empty: !docs.length };
      },
    });
    return Object.assign(query([]), { path, doc: id => ref(path + "/" + id) });
  }
  const originalRef=ref; const originalCollection=collection;
  const watch=(fn,cb,err)=>{let stopped=false,last="";async function run(){try{all=null;const s=await fn();const sig=JSON.stringify(s.docs?s.docs.map(d=>[d.id,d.data()]):s.data());if(sig!==last){last=sig;if(!stopped)cb(s)}}catch(e){if(!stopped&&err)err(e)}}run();const id=setInterval(run,10000);return ()=>{stopped=true;clearInterval(id)}};
  const db = {collection(path){const q=originalCollection(path);q.onSnapshot=(cb,err)=>watch(()=>q.get(),cb,err);return q},doc(path){const r=originalRef(path);r.onSnapshot=(cb,err)=>watch(()=>r.get(),cb,err);return r}};

  /* ---------- user / assets ---------- */

  const user = {
    id: async () => "local", me: async () => ({ id: "local", name: "You" }),
    isOwner: () => true, canEdit: () => true, can: () => true, profiles: async () => ({}),
  };
  const assets = {
    async upload(blob, o) {
      return api("/api/assets", { method: "POST", headers: { "Content-Type": (o && o.type) || blob.type || "application/octet-stream" }, body: blob });
    },
    list: () => api("/api/assets"),
    async delete(id) { await api("/api/assets/" + encodeURIComponent(id), { method: "DELETE" }); },
  };

  /* ---------- claude.use ---------- */

  let status = null;
  const getStatus = () => (status = status || api("/api/status").catch(() => ({ ai: false })));
  window.claude = Object.freeze({
    async use(name) {
      if (name === "sample") return (await getStatus()).ai ? sample : null;
      return { db, user, assets }[name] || null;
    },
  });
})();
