/* =========================================================
   くらしノート — ノートの取り込み（Evernote の .enex・Notion の zip。notes-unify.md 段3「取り込み」）

   - 流れ：設定 → ノート → 取り込む → ファイルを選ぶ → **先に見せる紙**（件数・画像・PDF・表・落ちるもの。
     数を出すのはこの紙の中だけ）→ 控え → 取り込む。
   - 取り込んだノートは `src: {from, key, batch}`。`key` が同じものは二度目に飛ばす（途中で閉じても、
     同じファイルをもう一度選べば続きから）。`batch` は取り込みを始めた時刻（ISO）——「取り消す」は
     その時刻より後に直したノートを残す（`KN.notes.unimport`）。
   - ノートブックは .enex（ファイル）ごと、Notion は一つ。名前は先に見せる紙で変えられる。
   - Notion の zip を読む・ページの形にするのは note-notion.js。
   - 本文は Markdown（見出し・箇条・番号・チェック・引用・線・太字・リンク）。表とコードはそのままの行。
     暗号化した文は一行の印。画像は縮めて画像の入れ物へ、原本はそのすぐ下の行で files/ へ。PDF は files/
     へ置き、字を pdf.js で一度だけ取り出す（検索に。meta `ft:<id>`）。ほかの添付は名前の行。
   - 取り込み終えたら、選んだファイルをそのまま Dropbox の `imports/<日>/` へ（つないでいれば。裏で）。
   - 読めないノート・ファイルがあっても、ほかは取り込み、読めなかったものの名前を残す。
   - 外へのリンクは字のまま（fetch しない）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const { html, node, icon } = KN.util;
  const U = KN.util;

  const CHUNK = 20;                       // 一度に書くノートの数

  /* ---------------- MD5（en-media の hash が添付を指す。crypto.subtle に無い） ---------------- */

  const K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  function md5(bytes) {
    const n = bytes.length;
    const len = ((n + 8) >>> 6) * 64 + 64;
    const buf = new Uint8Array(len);
    buf.set(bytes);
    buf[n] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(len - 8, (n * 8) >>> 0, true);
    dv.setUint32(len - 4, Math.floor(n / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < len; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        const s = R[(i >>> 4) * 4 + (i % 4)];
        const x = (a + f + K[i] + M[g]) >>> 0;
        a = d; d = c; c = b;
        b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
    return [...out].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  async function sha(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function bytesOf64(s) {
    const bin = atob(String(s || "").replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---------------- ENML → Markdown ---------------- */

  const BLOCK = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "section",
    "article", "header", "footer", "center", "address", "dl", "dt", "dd", "figure", "en-note", "body", "form", "nav", "aside", "main"]);
  const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "col", "wbr", "source", "embed", "param", "base", "track"]);
  const styleOf = (el) => String(el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  const boldEl = (el) => /^(b|strong)$/.test(el.localName) || /font-weight:(bold|[6-9]00)/.test(styleOf(el));
  const cell = (el) => String(el.textContent || "").replace(/[\s ]+/g, " ").trim().replace(/\|/g, "\\|");

  /** ENML（en-note の XHTML）を、本文の行に。添付は `\u0001<hash>\u0001` の行（取り込むときに置きかえる）。
      数えたもの（表・暗号化）は got に。 */
  function enml(xml, got) {
    /* HTML として読む（&nbsp; などで XML は落ちる）。HTML は `<en-media/>` の閉じを無視して後ろの字を
       中に入れてしまうので、空の要素の閉じは書き足す（br・hr などの空の要素はそのまま）。 */
    const src = String(xml || "").replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\s*\/>/g, (all, tag, at) =>
      (VOID.has(tag.toLowerCase()) ? all : `<${tag}${at || ""}></${tag}>`));
    const doc = new DOMParser().parseFromString(src, "text/html");
    const root = doc.querySelector("en-note") || doc.body;
    const lines = [];
    let buf = "";
    let lead = "";
    let flushes = 0;
    const quote = [];
    const lists = [];
    const pre = () => "> ".repeat(quote.length);
    const push = (s) => { lines.push(pre() + s); flushes++; };
    const flush = (force) => {
      const text = buf.replace(/^[ \t]+|[ \t]+$/g, "");
      const todo = /\[[ x]\] $/.test(lead);
      if (text || force || todo) push((lead + text).replace(/[ \t]+$/, ""));
      buf = "";
      lead = "";
    };
    const indent = () => "  ".repeat(Math.max(0, lists.length - 1));

    const walk = (el) => {
      for (const c of [...el.childNodes]) {
        if (c.nodeType === 3) {
          const t = c.nodeValue.replace(/[\s ]+/g, " ");
          buf += buf || lead ? t : t.replace(/^ /, "");
          continue;
        }
        if (c.nodeType !== 1) continue;
        const tag = c.localName;
        if (tag === "br") { flush(true); continue; }
        if (tag === "hr") { flush(); push("---"); continue; }
        if (tag === "en-media") {
          flush();
          push(`\u0001${String(c.getAttribute("hash") || "").toLowerCase()}\u0001`);
          continue;
        }
        if (tag === "en-crypt") { flush(); push("[暗号化した文]"); got.crypt++; continue; }
        if (tag === "en-todo") {
          const on = String(c.getAttribute("checked")) === "true";
          const box = `- [${on ? "x" : " "}] `;
          /* 行の頭なら、その行をチェックに（箇条の中なら箇条の印と替える）。行の途中なら字のまま。 */
          if (!buf.trim()) { buf = ""; lead = /^\s*(- )?$/.test(lead) ? lead.replace(/- $/, "") + box : lead + box; }
          else buf += box.slice(2);
          continue;
        }
        if (tag === "table") {
          flush();
          got.table++;
          [...c.querySelectorAll("tr")].filter((tr) => tr.closest("table") === c).forEach((tr, i) => {
            const cells = [...tr.children].filter((x) => /^t[dh]$/.test(x.localName)).map(cell);
            push(`| ${cells.join(" | ")} |`);
            if (i === 0) push(`|${cells.map(() => " --- ").join("|")}|`);
          });
          continue;
        }
        if (tag === "pre" || /-en-codeblock:true/.test(styleOf(c))) {
          flush();
          const kids = [...c.children].filter((x) => x.localName === "div");
          const rows = kids.length ? kids.map((x) => x.textContent) : String(c.textContent || "").split("\n");
          push("```");
          rows.forEach((r) => push(String(r).replace(/ /g, " ").replace(/\s+$/, "")));
          push("```");
          continue;
        }
        if (tag === "script" || tag === "style" || tag === "head" || tag === "title") continue;
        if (tag === "ul" || tag === "ol") {
          flush();
          lists.push({ ol: tag === "ol", n: 0, todo: /--en-todo:true/.test(styleOf(c)) });
          walk(c);
          lists.pop();
          flush();
          continue;
        }
        if (tag === "li") {
          flush();
          const L = lists[lists.length - 1] || { ol: false, n: 0, todo: false };
          L.n++;
          if (L.todo) lead = `${indent()}- [${/--en-checked:true/.test(styleOf(c)) ? "x" : " "}] `;
          else lead = `${indent()}${L.ol ? `${L.n}. ` : "- "}`;
          walk(c);
          flush();
          continue;
        }
        if (tag === "blockquote") { flush(); quote.push(1); walk(c); flush(); quote.pop(); continue; }
        const h = /^h([1-6])$/.exec(tag);
        if (h) { flush(); lead = `${"#".repeat(Math.min(3, +h[1]))} `; walk(c); flush(); continue; }
        if (BLOCK.has(tag)) { flush(); walk(c); flush(); continue; }
        /* 行の中：太字とリンクだけ。行をまたいだら付けない。 */
        const at = buf.length;
        const was = flushes;
        walk(c);
        if (flushes !== was) continue;
        const inner = buf.slice(at);
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
        if (!m[2]) continue;
        if (tag === "a") {
          const href = String(c.getAttribute("href") || "").trim();
          const word = m[2].replace(/[[\]]/g, "");
          if (/^(https?:|mailto:)/i.test(href) && word !== href) buf = buf.slice(0, at) + `${m[1]}[${word}](${href.replace(/[()\s]/g, encodeURIComponent)})${m[3]}`;
        } else if (boldEl(c) && !m[2].includes("**")) {
          buf = buf.slice(0, at) + `${m[1]}**${m[2]}**${m[3]}`;
        }
      }
    };
    walk(root);
    flush();
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  }

  /* ---------------- .enex を読む ---------------- */

  const enDate = (s) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || "").trim());
    if (!m) return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
    return isNaN(Date.parse(iso)) ? null : iso;
  };
  const kid = (el, name) => [...el.children].find((x) => x.localName === name) || null;
  const textIn = (el, name) => { const x = el && kid(el, name); return x ? String(x.textContent || "") : ""; };

  /** 一つの .enex。ノートごとに切って読む（一件が壊れていても、ほかは読む）。 */
  function parse(text, fileName) {
    const book = { file: fileName, notebook: String(fileName || "").replace(/\.enex$/i, "").trim(), notes: [], bad: [] };
    const src = String(text || "");
    if (!/<en-export[\s>]/.test(src)) { book.bad.push(fileName); return book; }
    let i = 0;
    for (;;) {
      const a = src.indexOf("<note>", i);
      if (a < 0) break;
      const b = src.indexOf("</note>", a);
      if (b < 0) { book.bad.push(`${fileName} の終わり`); break; }
      i = b + 7;
      const piece = src.slice(a, i);
      const doc = new DOMParser().parseFromString(piece, "application/xml");
      const el = doc.documentElement;
      if (!el || el.localName !== "note" || doc.getElementsByTagName("parsererror").length) {
        const t = /<title>([\s\S]*?)<\/title>/.exec(piece);
        book.bad.push(t ? t[1].trim() : `${book.notes.length + book.bad.length + 1}件め`);
        continue;
      }
      const got = { table: 0, crypt: 0 };
      const attrs = kid(el, "note-attributes");
      const res = [...el.children].filter((x) => x.localName === "resource").map((r) => ({
        mime: textIn(r, "mime").trim().toLowerCase(),
        name: textIn(kid(r, "resource-attributes"), "file-name").trim(),
        data: textIn(r, "data"),
      }));
      let body;
      try { body = enml(textIn(el, "content"), got); } catch (_) { book.bad.push(textIn(el, "title").trim() || `${book.notes.length + 1}件め`); continue; }
      const created = enDate(textIn(el, "created"));
      book.notes.push({
        title: textIn(el, "title").replace(/\s+/g, " ").trim(),
        created,
        updated: enDate(textIn(el, "updated")) || created,
        tags: [...el.children].filter((x) => x.localName === "tag").map((x) => x.textContent.trim()).filter(Boolean),
        body,
        res,
        table: got.table,
        crypt: got.crypt,
        reminder: !!(attrs && (textIn(attrs, "reminder-time") || textIn(attrs, "reminder-order"))),
      });
    }
    return book;
  }

  const kindOf = (r) => (/^image\//.test(r.mime) ? "img" : r.mime === "application/pdf" || /\.pdf$/i.test(r.name) ? "pdf" : "other");

  /** 二度目に飛ばす印。題と作った日時から（Evernote で直して書き出し直しても同じ）。同じ題・同じ時刻が
      一つのファイルに重なったら、出てきた順の番号を足す。 */
  async function keysOf(book) {
    const seen = new Map();
    for (const n of book.notes) {
      const base = `en:${await sha(`${n.created || ""}\n${n.title}`)}`;
      const k = seen.get(base) || 0;
      seen.set(base, k + 1);
      n.key = k ? `${base}#${k + 1}` : base;
    }
  }

  /** いま持っているノートの key → id（取り消した印のものは除く——取り消したら、また取り込める）。 */
  function haveIds() {
    const N = KN.notes;
    const out = new Map();
    N.trash().concat(N.list()).forEach((n) => {
      if (n.src && n.src.key && !(n.deletedAt && n.src.undone)) out.set(n.src.key, n.id);
    });
    return out;
  }
  const haveKeys = () => new Set(haveIds().keys());

  /** 先に見せる紙の数。 */
  function count(book, have) {
    const c = { notes: 0, img: 0, pdf: 0, other: 0, table: 0, crypt: 0, reminder: 0, had: 0, others: [] };
    book.notes.forEach((n) => {
      if (have.has(n.key)) { c.had++; return; }
      c.notes++;
      n.res.forEach((r) => { const k = kindOf(r); c[k]++; if (k === "other") c.others.push(r.name || r.mime); });
      if (n.table) c.table++;
      if (n.crypt) c.crypt++;
      if (n.reminder) c.reminder++;
    });
    return c;
  }

  /* ---------------- PDF の字（pdf.js は tools/vendor のもの。取り込むときだけ読む） ---------------- */

  let pdfjsP = null;
  function pdfjs() {
    const at = (f) => new URL(`tools/vendor/${f}`, document.baseURI).href;
    if (!pdfjsP) {
      pdfjsP = import(at("pdf.min.mjs")).then((m) => { m.GlobalWorkerOptions.workerSrc = at("pdf.worker.min.mjs"); return m; });
      pdfjsP.catch(() => { pdfjsP = null; });
    }
    return pdfjsP;
  }

  /** PDF の字（ページごとに改行）。pdf.js は渡した中身を手放すので写しを渡す。 */
  async function pdfText(bytes) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false }).promise;
    const out = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        out.push(tc.items.map((x) => (x.str || "") + (x.hasEOL ? "\n" : "")).join(""));
        page.cleanup();
      }
    } finally {
      doc.destroy();
    }
    return out.join("\n");
  }

  /* ---------------- 取り込む ---------------- */

  /** 添付を入れ物へ。返すのは本文に置く行（pre は引用などの頭）。画像は縮めたものの行と、すぐ下に原本の行
      （files/。置けなければ縮めたものだけ——原本は imports/ の元のファイルに残る）。PDF は字を一度だけ
      取り出す。どれも書けなければ名前の行（落ちたものとして数える）。 */
  async function carry(r, fails, pre = "") {
    const name = r.name || (kindOf(r) === "pdf" ? "file.pdf" : r.mime || "file");
    const k = kindOf(r);
    const F = KN.noteFile;
    try {
      const bytes = r.bytes || bytesOf64(r.data);
      if (k === "img") {
        const blob = new Blob([bytes], { type: r.mime });
        const small = KN.noteImg ? await KN.noteImg.add(blob).catch(() => null) : null;
        const orig = F ? await F.keep(blob, r.name || "image").catch(() => null) : null;
        const lines = [small && KN.noteImg.refLine(small), orig && F.refLine(orig.id, orig.name)].filter(Boolean);
        if (lines.length) return lines.map((l) => pre + l).join("\n");
      }
      if (k === "pdf" && F) {
        const got = await F.add(new File([bytes], /\.pdf$/i.test(name) ? name : `${name}.pdf`, { type: "application/pdf" }));
        if (!F.hasText(got.id)) {
          const text = await pdfText(bytes).catch(() => null);
          if (text != null) await F.setText(got.id, text).catch(() => {});
        }
        return pre + F.refLine(got.id, got.name);
      }
    } catch (_) { /* 下で名前の行に */ }
    if (k !== "other") fails.push(name);
    return `${pre}[${name.replace(/[[\]]/g, "")}]`;
  }

  /** 一件のノートを、入れ物に置く形に（添付を先に書く）。 */
  async function build(n, nb, batch, fails, id) {
    const byHash = new Map();
    n.res.forEach((r) => {
      try { r.bytes = bytesOf64(r.data); r.hash = md5(r.bytes); byHash.set(r.hash, r); } catch (_) { r.bytes = null; }
    });
    const used = new Set();
    const lines = [];
    for (const line of n.body ? n.body.split("\n") : []) {
      const m = /^((?:> )*)\u0001([0-9a-f]*)\u0001$/.exec(line);
      if (!m) { lines.push(line); continue; }
      const r = byHash.get(m[2]) || n.res.find((x) => !used.has(x));
      if (!r || used.has(r)) continue;
      used.add(r);
      lines.push(await carry(r, fails, m[1]));
    }
    /* 本文で指していない添付は末尾に。 */
    for (const r of n.res) if (!used.has(r)) lines.push(await carry(r, fails));
    n.res.forEach((r) => { r.bytes = null; r.data = ""; });
    const at = n.created || batch;
    return {
      id, title: n.title, body: lines.join("\n"), notebook: nb, tags: KN.notes.cleanTags(n.tags), fav: false,
      createdAt: at, updatedAt: n.updated && n.updated <= batch ? n.updated : at <= batch ? at : batch, deletedAt: null,
      src: { from: "evernote", key: n.key, batch },
    };
  }

  /** books を取り込む。進みは step(済んだ数, 全部)。stop() が真なら一件の区切りで止める（続きは同じファイルで）。 */
  async function run(books, step, stop) {
    const batch = U.today();
    const ids = haveIds();
    const todo = [];
    books.forEach((b) => b.notes.forEach((n) => { if (!ids.has(n.key)) todo.push([n, b.notebook.trim()]); }));
    todo.forEach(([n]) => ids.set(n.key, U.uid("n")));
    const fails = [];
    let done = 0;
    let pend = [];
    const write = async () => { if (pend.length) { await KN.notes.addMany(pend); pend = []; } };
    for (const [n, nb] of todo) {
      if (stop && stop()) break;
      /* Notion は日付が残らない → 取り込んだ時刻から 1ms ずつ前（子の並びは作った日の順）。 */
      const at = new Date(Date.parse(batch) - (todo.length - done)).toISOString();
      pend.push(await (n.from === "notion" ? KN.noteNotion.build(n, nb, { batch, at, ids, fails, carry })
        : build(n, nb, batch, fails, ids.get(n.key))));
      done++;
      if (pend.length >= CHUNK) await write();
      if (step) step(done, todo.length);
    }
    await write();
    return { batch, done, total: todo.length, fails };
  }

  /* ---------------- 紙 ---------------- */

  const S = () => KN.settingsParts;

  const row = (title, val) => node(html`
    <div class="set-row"><span class="set-title">${title}</span><span class="set-val">${String(val)}</span></div>`);

  function pick() {
    const inp = node(html`<input type="file" accept=".enex,.zip" multiple hidden>`);
    document.body.append(inp);
    inp.addEventListener("change", () => {
      const files = [...(inp.files || [])];
      inp.remove();
      if (files.length) show(files);
    });
    inp.click();
  }

  async function show(files) {
    const books = [];
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    if (zips.length && KN.noteNotion) {
      KN.ui.toast("読んでいます");
      books.push(await KN.noteNotion.read(zips).catch(() => ({ kind: "notion", notebook: "", notes: [], bad: zips.map((f) => f.name) })));
    }
    for (const f of files) {
      if (zips.includes(f)) continue;
      let b;
      try { b = parse(await f.text(), f.name); } catch (_) { b = { file: f.name, notebook: "", notes: [], bad: [f.name] }; }
      await keysOf(b);
      books.push(b);
    }
    await KN.notes.ready();
    if (KN.notes.state() !== "on") { KN.ui.toast("ノートを開けない日なので、取り込めません"); return; }
    const have = haveKeys();
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    const bad = books.flatMap((b) => b.bad);
    let total = 0;
    books.forEach((b) => {
      if (!b.notes.length) return;
      const c = count(b, have);
      total += c.notes;
      const field = node(html`
        <label class="field">
          <span class="field-label">ノートブック</span>
          <input class="input" value="${b.notebook}" enterkeyhint="done" autocomplete="off" spellcheck="false">
        </label>`);
      field.querySelector("input").addEventListener("input", (e) => { b.notebook = e.target.value; });
      body.append(field, P.card(
        row("ノート", c.notes),
        c.img ? row("画像", c.img) : null,
        c.pdf ? row("PDF", c.pdf) : null,
        c.table ? row(b.kind === "notion" ? "表" : "表のあるノート", c.table) : null,
        c.had ? row("取り込み済み", c.had) : null
      ));
      const drop = P.card(
        b.flat ? row("落ちる：階層", "") : null,
        c.other ? row("落ちる：ほかの添付", c.other) : null,
        c.crypt ? row("落ちる：暗号化した文", c.crypt) : null,
        c.reminder ? row("落ちる：リマインダー", c.reminder) : null
      );
      if (drop) body.append(drop);
      /* フォルダ無しの書き出し（js/note-notion.js の flatOf）。取り込んでから書き出し直すと、取り込み済みは飛ばすので
         階層は直らない——先に言う。 */
      if (b.flat) body.append(P.more("階層ごと取り込むには", "Notion の書き出しで「サブページ用のフォルダを作成（Create folders for subpages）」を入れて書き出し直し、zip は開かずにそのまま選ぶ"));
      if (c.others.length) body.append(P.more("ほかの添付", c.others.join(" ／ ")));
    });
    if (bad.length) body.append(P.card(row("読めないもの", bad.length)), P.more("読めないもの", bad.join(" ／ ")));
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-go">${icon("download")}<span class="js-word">取り込む</span></button></div>`);
    const go = foot.querySelector(".js-go");
    if (!total) go.disabled = true;
    let closed = false;
    let busy = false;
    const h = KN.ui.sheet({ title: "取り込む", content: body, footer: foot, onClose: () => { closed = true; } });
    go.addEventListener("click", async () => {
      if (busy || !total) return;
      if (books.some((b) => b.notes.length && !b.notebook.trim())) { KN.ui.toast("ノートブックの名前を入れてください"); return; }
      busy = true;
      go.disabled = true;
      const word = foot.querySelector(".js-word");
      word.textContent = "控えを取っています";
      const snap = KN.backup && KN.backup.take ? await KN.backup.take("取り込む前", { force: true }).catch(() => "failed") : "failed";
      if (snap === "failed") {
        busy = false;
        go.disabled = false;
        word.textContent = "取り込む";
        KN.ui.toast("控えを取れなかったので、取り込んでいません", { long: true });
        return;
      }
      let res;
      try {
        res = await run(books, (d, all) => { word.textContent = `取り込んでいます ${d} / ${all}`; }, () => closed);
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした。同じファイルをもう一度選ぶと続きから取り込みます", { long: true });
        if (!closed) h.close();
        return;
      }
      if (res.done === res.total) {
        keepOriginals(files, res.batch);
        /* 整理した形で（notes-unify.md「整理」）。控えは取り込む前に取ってある。書けなければ、設定の「整理する」に残る。 */
        if (KN.noteOrganize) await KN.noteOrganize.after(res.batch).catch(() => null);
      }
      if (!res.fails.length) {
        if (!closed) h.close();
        KN.ui.toast(res.done < res.total ? "途中まで取り込みました" : "取り込みました");
        return;
      }
      if (closed) { KN.ui.toast("取り込みました（読めない添付がありました）", { long: true }); return; }
      body.innerHTML = "";
      body.append(P.card(row("読めない添付", res.fails.length)), P.more("読めない添付", res.fails.join(" ／ ")));
      word.textContent = "取り込みました";
    });
  }

  /** 選んだファイルをそのまま Dropbox の `imports/<取り込んだ日>/` へ（裏で。つないでいなければ置かない）。 */
  function keepOriginals(files, batch) {
    const D = KN.dropbox;
    if (!D || !D.putImport || !D.status().connected) return;
    const day = U.dayKey(new Date(batch));
    (async () => { for (const f of files) await D.putImport(day, f); })()
      .catch(() => KN.ui.toast("元のファイルを Dropbox に置けませんでした", { long: true }));
  }

  /** 取り込みの一覧（取り消せるノートのあるものだけ。新しい順）。名前は冊の名前（Evernote の入れ物の中は、
      元の冊＝入れ物の題）。入れ物そのものは数えない（中のノートと一緒に消える）。 */
  function batches() {
    const by = new Map();
    const list = KN.notes.list();
    const box = new Map(list.filter((n) => n.src && /^enbook:/.test(String(n.src.key || ""))).map((n) => [n.id, n]));
    list.forEach((n) => {
      const b = n.src && n.src.batch;
      if (!b || String(n.updatedAt) > b || box.has(n.id)) return;
      if (!by.has(b)) by.set(b, new Set());
      const up = n.parent ? box.get(String(n.parent)) : null;
      by.get(b).add(up ? up.title : n.notebook);
    });
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([batch, nbs]) => ({ batch, books: [...nbs].filter(Boolean) }));
  }

  const whenOf = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  /** 設定の「取り込む」。取り消せる取り込みも、整理するもの・戻せる整理も無ければ、そのままファイルを選ぶ。 */
  function open() {
    if (!KN.notes || KN.notes.state() !== "on") { KN.ui.toast("ノートを読み込んでいるところです。少し待ってから、もう一度押してください"); return; }
    const list = batches();
    const O = KN.noteOrganize;
    const tidy = !!O && !O.empty(O.plan());
    const linkable = !!O && !O.empty(O.linkPlan());
    const runs = O ? O.runs() : [];
    if (!list.length && !tidy && !linkable && !runs.length) { pick(); return; }
    const P = S();
    let h = null;
    const shut = () => { if (h) h.close(); };
    const body = node(html`<div class="stack"></div>`);
    body.append(P.card(P.navRow({ ico: "paper", tint: P.TINT.sub, title: "ファイルを選ぶ", onTap: () => { shut(); pick(); } })));
    if (tidy) body.append(P.card(P.navRow({ ico: "book", tint: P.TINT.cat, title: "取り込んだノートを整理する", onTap: () => { shut(); O.preview(); } })));
    if (linkable) body.append(P.card(P.navRow({ ico: "indent", tint: P.TINT.cat, title: "リンクのとおりに中へ", onTap: () => { shut(); O.linkPreview(); } })));
    if (runs.length) body.append(P.card(runs.map((at) => P.dangerRow({ ico: "undo", title: `${whenOf(at)}の整理を戻す`, onTap: () => O.undo(at, shut) }))));
    const named = (bs) => (bs.length > 3 ? `${bs.slice(0, 3).join("・")} ほか` : bs.join("・"));
    if (list.length) body.append(P.card(list.map((b) => P.dangerRow({
      ico: "undo", title: `${whenOf(b.batch)}${b.books.length ? `（${named(b.books)}）` : ""}を取り消す`,
      onTap: () => KN.ui.confirm({
        title: "この取り込みを取り消す", message: "取り込んだあと直したノートは残します。", okLabel: "取り消す", danger: true,
      }).then((ok) => {
        if (!ok) return;
        KN.notes.unimport(b.batch);
        if (h) h.close();
        KN.ui.toast("最近削除へ移しました");
      }),
    }))));
    h = KN.ui.sheet({ title: "取り込む", content: body });
  }

  KN.noteImport = { md5, enml, parse, keysOf, count, run, batches, open, show, pdfText, keepOriginals };
})();
