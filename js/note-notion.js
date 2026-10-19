/* =========================================================
   くらしノート — Notion の書き出し（zip）を読む（notes-unify.md 段3「取り込み」）

   - 先に見せる紙・控え・src・取り消すは note-import.js（Evernote と同じ流れ）。ここは zip を読み、
     ページを note-import の「ノート」の形にするところだけ。
   - `<題> <32字の id>.md` と同じ名前のフォルダ → 親子。`key` はその32字。データベースの CSV → 表のノート
     （行は表の行。`_all.csv` があればそちら）、行のページはその子。大きいワークスペースは zip の中に zip。
   - 中のリンク（`題%20<id>.md`・notion.so の URL）は `[題](note:<id>)` に。zip の中の画像・PDF は
     note-import の carry で入れ物へ、ほかの添付は名前の行。外へのリンクは字のまま（fetch しない）。
   - 表のノートは、CSV の原本を files/ へ置いた参照の一行と、表の行（読むときの表は段5）。
   - 日付は残らない → 取り込んだ時刻から 1ms ずつ前（並びは親が先・同じ段は名前順。Notion の並びは整理で。note-organize.js）。
   - フォルダ無しの書き出しは親子が読めない（flat）→ 先に見せる紙に。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* ---------------- zip を読む（縮めたものは DecompressionStream） ---------------- */

  const u64 = (dv, at) => dv.getUint32(at, true) + dv.getUint32(at + 4, true) * 2 ** 32;
  const viewOf = async (blob, a, b) => new DataView(await blob.slice(a, b).arrayBuffer());

  /** 名前。UTF-8 の印が無ければ、UTF-8 で読めなければ Shift_JIS（Windows で詰め直した zip）。 */
  function nameOf(bytes, utf8) {
    if (!utf8) {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (_) { /* 次へ */ }
      try { return new TextDecoder("shift_jis").decode(bytes); } catch (_) { /* 次へ */ }
    }
    return new TextDecoder().decode(bytes);
  }

  /** 中央の目録を読む（ZIP64 も）。 */
  async function listOf(blob) {
    const size = blob.size;
    const tail = Math.min(size, 22 + 65535);
    const dv = await viewOf(blob, size - tail, size);
    let e = -1;
    for (let i = tail - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("zip ではありません");
    let count = dv.getUint16(e + 10, true);
    let cdSize = dv.getUint32(e + 12, true);
    let cdAt = dv.getUint32(e + 16, true);
    if ((count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) && e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50) {
      const at = u64(dv, e - 12);
      const z = await viewOf(blob, at, at + 56);
      if (z.getUint32(0, true) === 0x06064b50) { count = u64(z, 32); cdSize = u64(z, 40); cdAt = u64(z, 48); }
    }
    const cd = await viewOf(blob, cdAt, cdAt + cdSize);
    const out = [];
    for (let p = 0, k = 0; k < count && p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50; k++) {
      const flag = cd.getUint16(p + 8, true);
      const nl = cd.getUint16(p + 28, true);
      const xl = cd.getUint16(p + 30, true);
      const e2 = { flag, method: cd.getUint16(p + 10, true), csize: cd.getUint32(p + 20, true), usize: cd.getUint32(p + 24, true), at: cd.getUint32(p + 42, true) };
      for (let x = p + 46 + nl, end = x + xl; x + 4 <= end; x += 4 + cd.getUint16(x + 2, true)) {
        if (cd.getUint16(x, true) !== 1) continue;
        let q = x + 4;
        if (e2.usize === 0xffffffff) { e2.usize = u64(cd, q); q += 8; }
        if (e2.csize === 0xffffffff) { e2.csize = u64(cd, q); q += 8; }
        if (e2.at === 0xffffffff) e2.at = u64(cd, q);
      }
      e2.name = nameOf(new Uint8Array(cd.buffer, p + 46, nl), flag & 0x800).normalize("NFC").replace(/\\/g, "/");
      out.push(e2);
      p += 46 + nl + xl + cd.getUint16(p + 32, true);
    }
    return out;
  }

  /** 一つのファイルの中身（Blob）。 */
  async function openOf(blob, e) {
    if (e.flag & 1) throw new Error("鍵のかかった zip");
    const h = await viewOf(blob, e.at, e.at + 30);
    if (h.getUint32(0, true) !== 0x04034b50) throw new Error("壊れた zip");
    const from = e.at + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    const raw = blob.slice(from, from + e.csize);
    if (e.method === 0) return raw;
    if (e.method !== 8 || typeof DecompressionStream !== "function") throw new Error("読めない縮め方");
    return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
  }

  /** zip（中の zip も）のファイルを files（名前 → 読む口）へ。読めないものは bad へ名前を。 */
  async function gather(blob, label, files, bad, depth) {
    let list;
    try { list = await listOf(blob); } catch (_) { bad.push(label); return; }
    for (const e of list) {
      if (/\/$/.test(e.name) || /(^|\/)(__MACOSX\/|\.DS_Store$)/.test(e.name)) continue;
      if (/\.zip$/i.test(e.name) && depth < 3) {
        let inner;
        try { inner = await openOf(blob, e); } catch (_) { bad.push(e.name); continue; }
        await gather(inner, e.name, files, bad, depth + 1);
        continue;
      }
      if (!files.has(e.name)) files.set(e.name, () => openOf(blob, e));
    }
  }

  /* ---------------- ページ ---------------- */

  const PAGE = /^(.*?)\s*([0-9a-f]{32})(_all)?\.(md|csv)$/i;
  const UUID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", bmp: "image/bmp", avif: "image/avif", pdf: "application/pdf" };
  const extOf = (p) => (/\.([a-z0-9]+)$/i.exec(p) || [])[1];
  const mimeOf = (p) => MIME[String(extOf(p) || "").toLowerCase()] || "";
  const dirOf = (p) => p.split("/").slice(0, -1).join("/");
  const baseOf = (p) => p.split("/").pop();
  const depthOf = (p) => p.split("/").length;
  const idIn = (seg) => { const m = /([0-9a-f]{32})$/i.exec(seg); return m ? m[1].toLowerCase() : null; };

  /** Notion の Markdown を、ここの本文に。頭の `# 題` は題へ。字下げ（4つで一段）は2つで一段に。
      `<aside>`（コールアウト）・`<details>`（トグル）の印は外す。 */
  function tidy(text) {
    const lines = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const m = /^# (.*)$/.exec(lines[i] || "");
    let title = null;
    if (m) { title = m[1].trim(); lines.splice(0, i + 1); }
    const out = [];
    let fence = false;
    const half = (s) => s.replace(/^ +/, (sp) => " ".repeat(Math.floor(sp.length / 4) * 2 + (sp.length % 4)));
    for (const l of lines) {
      if (/^\s*```/.test(l)) { fence = !fence; out.push(half(l).replace(/\s+$/, "")); continue; }
      if (fence) { out.push(l); continue; }
      if (/^\s*<\/?(aside|details)>\s*$/.test(l)) continue;
      const s = l.replace(/<\/?(aside|details)>/g, "").replace(/<summary>(.*?)<\/summary>/g, "$1");
      out.push(half(s).replace(/\s+$/, ""));
    }
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return { title, body: out.join("\n") };
  }

  /** CSV（Notion は頭に BOM）を行の並びに。 */
  function csvRows(text) {
    const s = String(text || "").replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c !== '"') cell += c;
        else if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
        continue;
      }
      if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }

  /** 表のノートの本文（表の行。読むときの表は段5）。 */
  function tableOf(rows) {
    const cell = (x) => String(x).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
    return rows.flatMap((r, i) => {
      const line = `| ${r.map(cell).join(" | ")} |`;
      return i ? [line] : [line, `|${r.map(() => " --- ").join("|")}|`];
    }).join("\n");
  }

  /* ---------------- リンク ---------------- */

  /* `[字](先)` と `![字](先)`。先の中のかっこは一段だけ（Notion は「題 (下書き)」のかっこを符号にしない）。 */
  const LINK = /(!?)\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
  const WHOLE = /^(\s*(?:> )*)(!?)\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)\s*$/;
  const word = (s) => String(s || "").replace(/[[\]]/g, "");

  /** 先を読む → { page: id } ・{ path }（zip の中のファイル）・{ out: true }（外）・{ lost: 名前 }。 */
  function where(href, dir, files) {
    const h = String(href || "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) {
      const u = /^https?:\/\/([\w-]+\.)?notion\.(so|site)\//i.test(h) && UUID.exec(h.replace(/[?#].*$/, ""));
      return u ? { page: u[0].replace(/-/g, "").toLowerCase(), out: true } : { out: true };
    }
    let p = h.replace(/#.*$/, "");
    try { p = decodeURIComponent(p); } catch (_) { /* そのまま */ }
    const parts = [];
    (dir ? `${dir}/${p}` : p).normalize("NFC").split("/").forEach((s) => {
      if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s);
    });
    const path = parts.join("/");
    const m = PAGE.exec(baseOf(path));
    if (m) return { page: m[2].toLowerCase() };
    if (files.has(path)) return { path };
    return { lost: baseOf(path) || h };
  }

  /** 先に見せる紙の数に：本文の中の zip のファイル（画像・PDF・ほか）。 */
  function refsOf(body, dir, files) {
    const out = [];
    String(body || "").split("\n").forEach((l) => {
      for (const m of l.matchAll(LINK)) {
        const w = where(m[3], dir, files);
        if (w.path) out.push({ mime: mimeOf(w.path), name: baseOf(w.path), path: w.path });
      }
    });
    return out;
  }

  /** 本文のリンクをつなぎ直す。一行に一つだけの画像・ファイルは入れ物へ（carry）、行の途中のものは名前の字に。
      取り込んだ・取り込み済みのページへは `[題](note:<id>)`。見つからないページは字だけ。 */
  async function relink(body, dir, files, ids, carry, fails) {
    const toNote = (w, text) => (w.page && ids.has(w.page) ? `[${word(text)}](note:${ids.get(w.page)})` : null);
    const out = [];
    let fence = false;
    for (const line of String(body || "").split("\n")) {
      if (/^\s*```/.test(line)) fence = !fence;
      if (fence || !line.includes("](")) { out.push(line); continue; }
      const m = WHOLE.exec(line);
      if (m) {
        const w = where(m[4], dir, files);
        if (w.path) {
          const r = { mime: mimeOf(w.path), name: baseOf(w.path) };
          try { r.bytes = new Uint8Array(await (await files.get(w.path)()).arrayBuffer()); } catch (_) { r.bytes = null; }
          if (r.bytes) { out.push(await carry(r, fails, m[1])); continue; }
          fails.push(r.name);
          out.push(`${m[1]}[${word(r.name)}]`);
          continue;
        }
      }
      out.push(line.replace(LINK, (all, img, text, href) => {
        const w = where(href, dir, files);
        const n = toNote(w, text || (w.lost || ""));
        if (n) return n;
        if (w.out) return all;
        if (w.lost && !w.page) fails.push(w.lost);
        return img ? `[${word(text || (w.path ? baseOf(w.path) : w.lost) || "")}]` : word(text);
      }));
    }
    return out.join("\n");
  }

  /* ---------------- 読む・置く ---------------- */

  /** 選んだ zip（分かれた書き出しは全部まとめて一つ）→ note-import の本（book）。 */
  async function read(zips) {
    const files = new Map();
    const bad = [];
    for (const f of zips) await gather(f, f.name, files, bad, 0);
    const pages = new Map();
    for (const [path, get] of files) {
      const m = PAGE.exec(baseOf(path));
      if (!m) continue;
      const id = m[2].toLowerCase();
      const p = pages.get(id) || { key: id, name: m[1].trim(), path, md: null, csv: null, all: false };
      if (m[4].toLowerCase() === "md") { if (!p.md) { p.md = get; p.path = path; } }
      else if (!p.csv || (m[3] && !p.all)) { p.csv = get; p.all = !!m[3]; if (!p.md) p.path = path; }
      pages.set(id, p);
    }
    const notes = [];
    for (const p of pages.values()) {
      let md;
      let rows = null;
      try {
        md = tidy(p.md ? await (await p.md()).text() : "");
        if (p.csv) rows = csvRows(await (await p.csv()).text());
      } catch (_) { bad.push(p.path); continue; }
      const dir = dirOf(p.path);
      const segs = dir ? dir.split("/") : [];
      let parentKey = null;
      for (let i = segs.length - 1; i >= 0 && !parentKey; i--) {
        const id = idIn(segs[i]);
        if (id && id !== p.key && pages.has(id)) parentKey = id;
      }
      const body = rows ? tableOf(rows) : md.body;
      notes.push({
        from: "notion", key: p.key, title: (md.title != null ? md.title : p.name).replace(/\s+/g, " ").trim(), body, dir, path: p.path,
        parentKey, files, csv: rows ? p.csv : null, tags: [], table: rows ? 1 : 0, crypt: 0, reminder: false, res: rows ? [] : refsOf(body, dir, files),
      });
    }
    /* 親が先（途中で止めても、書いた子の親はもう在る）。同じ段は名前順。 */
    notes.sort((a, b) => depthOf(a.path) - depthOf(b.path) || a.path.localeCompare(b.path, "ja", { numeric: true }));
    return { kind: "notion", file: zips.map((f) => f.name).join("・"), notebook: "Notion", notes, bad, flat: flatOf(notes, files) };
  }

  /** フォルダ無しの書き出し（Notion の「サブページ用のフォルダを作成」を切ったもの。Windows で zip を開けないときの
      対処として勧められている）：親子が読めない。どのページも別のページのフォルダの中に無く、それでいて同じ場所の
      ページへの一行のリンク（中のページの書き方）がある。先に見せる紙で「落ちる：階層」に。 */
  function flatOf(notes, files) {
    if (notes.length < 2 || notes.some((n) => n.parentKey)) return false;
    const here = new Map(notes.map((n) => [n.key, n.dir]));
    return notes.some((n) => !n.table && String(n.body || "").split("\n").some((line) => {
      const m = WHOLE.exec(line);
      const w = m && where(m[4], n.dir, files);
      return !!(w && w.page && !w.out && w.page !== n.key && here.has(w.page) && here.get(w.page) === n.dir);
    }));
  }

  /** 一件を入れ物に置く形に。ids は key → ノートの id（取り込み済みも、これから置くものも）。 */
  async function build(n, nb, o) {
    let body = n.table ? n.body : await relink(n.body, n.dir, n.files, o.ids, o.carry, o.fails);
    if (n.table && n.csv && KN.noteFile) {
      const name = `${n.title || "表"}.csv`;
      try {
        const got = await KN.noteFile.keep(await n.csv(), name);
        body = `${KN.noteFile.refLine(got.id, got.name)}\n${body}`;
      } catch (_) { o.fails.push(name); }
    }
    const parent = n.parentKey ? o.ids.get(n.parentKey) : null;
    n.body = "";
    return {
      id: o.ids.get(n.key), title: n.title, body, notebook: nb, tags: [], fav: false,
      createdAt: o.at, updatedAt: o.at, deletedAt: null, ...(parent ? { parent } : {}),
      src: { from: "notion", key: n.key, batch: o.batch },
    };
  }

  KN.noteNotion = { listOf, openOf, read, build, tidy, csvRows };
})();
