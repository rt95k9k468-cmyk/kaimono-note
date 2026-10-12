/* =========================================================
   くらしノート — ノートの同期（Dropbox。docs/notes-unify.md「同期」、段2）

   - 本物は `notes/<題> <id の尻6字>.md`（1件1ファイル・平ら）。消した印のノートは `notes/.trash/`。
     色は `notes-sync/labels.json`。記録本体（localStorage）にも控え（kurashi-latest.json）にも触れない。
   - 端末ごとに覚える（ノートの入れ物の meta）：`sync-state`（入り切り・cursor・つないだ Dropbox）と、
     ノートごとの `sync:<id>`＝**元**（ファイルの id・場所・rev と、そのとき向こうにあった欄と字の指紋）。
   - 手元の直しは「元と違う」で見分ける（送る印は持たない——書く道のどれかで付け忘れても漏れない）。
     外から来た中身は元と**同じ取引で**書くので、送り返さない。
   - 送るのは update(<覚えた rev>)。断られたら次の回で取ってきて三方で。上書きを時計で決めない。
   - 三方：片方だけが変えた欄はその変更。両方が字（題・本文）を変えたときだけ、新しく直したほうを
     本文に、もう片方を前の版へ（「二つの版」）。元が無い（はじめて）ときも同じ——足し合わせる。
   - 覚えたファイルが無くなった：手元で直していれば送り直す（残るほうへ）。直していなければ最近削除へ
     （本当には消さない）。一度にたくさん無くなったら止めて訊く（`halt`）。
   - 開いて書いているノートは、紙を閉じてから（`KN.notes.isOpen`）。
   - 一度に一本。取るのは同時に PULL 本まで、書くのは一本ずつ。429 は retry_after だけ待つ。
   - 新しい端末は写し（`notes-sync/pack.json`）から。rev が同じものだけ写しを使い、違うものは取る
     （写しよりファイルが正）。写しは合わせ終えた端末が1日1回まで書き直す。
   - 見えているあいだは longpoll（notify。鍵は要らない）で待ち、変わったら一回。
   - 入れてあるのに合わせられないまま3日 → 歯車に点（`stale`。今の控えと同じ）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const DIR = "/notes";
  const TRASH = "/notes/.trash";
  const LABELS = "/notes-sync/labels.json";
  const PACK = "/notes-sync/pack.json";
  const NOTIFY = "https://notify.dropboxapi.com";
  const SOON = 4000;                 // 書いてから合わせるまで
  const EVERY = 10 * 60 * 1000;      // 開いているあいだ、これごとに見る（ノートは longpoll が先に。色はこれで）
  const WAIT = 120;                  // longpoll で待つ秒
  const GAP = 5000;                  // longpoll のあいだは少なくともこれだけ空ける
  const FIRST = 9000;                // 開いてすぐは起動の邪魔をしない（dropbox.js の 8 秒のあと）
  const PULL = 4;                    // 取るのは同時にこれだけ
  const MANY = 3;                    // これだけ、かつ生きている覚えの 1/5 以上が一度に無くなったら止まる
  const PACK_MIN = 8;                // 元の無いファイルがこれだけあれば写しを読む（少なければ書かない）
  const DAY = 86400000;
  const STUCK = 3;                   // 合わせられないまま、これだけの日で歯車に点
  const ST = "sync-state";
  const LB = "sync-labels";
  /* 三方で合わせる欄（題は本文と一つの「字」として合わせる）。 */
  const FIELDS = ["notebook", "tags", "fav", "parent", "deletedAt", "createdAt", "noTime", "emoji", "src"];

  const N = () => KN.notes;
  const D = () => KN.dropbox && KN.dropbox.api;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  let st = null;                     // sync-state
  let loaded = null;
  let running = null;
  let again = false;
  let timer = null;
  let checked = false;               // この開きで、つないだ Dropbox を確かめた
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* 一つ落ちても続けます */ } });

  /* ---------------- 形（.md） ---------------- */

  const pad = (n, w = 2) => String(n).padStart(w, "0");

  /** 「2026-10-01T09:05:00.123+09:00」（その端末の時刻と、ずれ。書き出しと同じ書き方に、ミリ秒も）。 */
  function localIso(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const off = -d.getTimezoneOffset();
    const a = Math.abs(off);
    const ms = d.getMilliseconds();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${ms ? `.${pad(ms, 3)}` : ""}`
      + `${off >= 0 ? "+" : "-"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }
  const isoOf = (v) => {
    if (v == null || v === "") return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  const q = (v) => JSON.stringify(v);

  /** 1件の .md。頭に YAML（値は JSON の書き方。そのまま YAML として読める）、続けて本文を打ったまま。
      `# 題` は足さない（読むときに外し損ねると、合わせるたびに見出しが増える）。 */
  function fileOf(n) {
    const L = ["---", `id: ${q(String(n.id))}`, `title: ${q(n.title || "")}`,
      `created: ${localIso(n.createdAt)}`, `updated: ${localIso(n.updatedAt)}`];
    if (n.notebook) L.push(`notebook: ${q(n.notebook)}`);
    if (n.tags && n.tags.length) L.push(`tags: ${q(n.tags)}`);
    if (n.fav) L.push("favorite: true");
    if (n.parent) L.push(`parent: ${q(String(n.parent))}`);
    if (n.deletedAt) L.push(`deleted: ${localIso(n.deletedAt)}`);
    if (n.noTime) L.push("no_time: true");
    if (n.emoji) L.push(`emoji: ${q(String(n.emoji))}`);
    if (n.src && typeof n.src === "object") L.push(`source: ${q(n.src)}`);
    L.push("format: 1", "---", "");
    return `${L.join("\n")}\n${String(n.body || "")}`;
  }

  function scalar(v) {
    const s = String(v).trim();
    if (/^["[{]/.test(s)) { try { return JSON.parse(s); } catch (_) { /* 外で書いた YAML の流れ。下で字に */ } }
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    return s;
  }
  function tagsOf(v) {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string" && /^\[.*\]$/.test(v.trim())) return v.trim().slice(1, -1).split(",").map((x) => String(scalar(x)));
    return v == null || v === "" ? [] : [String(v)];
  }

  /** .md を一件に。id の無いもの・読めない YAML・知らない新しい形は null（読まず、手元を変えない）。 */
  function parse(text, at) {
    const t = String(text == null ? "" : text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    if (!t.startsWith("---\n")) return null;
    let end = t.indexOf("\n---\n", 3);
    let rest = end + 5;
    if (end < 0 && t.endsWith("\n---")) { end = t.length - 4; rest = t.length; }
    if (end < 0) return null;
    const head = t.slice(4, end).split("\n");
    let body = t.slice(rest);
    if (body.startsWith("\n")) body = body.slice(1);
    const y = {};
    for (let i = 0; i < head.length; i++) {
      const line = head[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
      if (!m) return null;
      if (m[2] == null || !m[2].trim()) {
        const list = [];
        while (i + 1 < head.length && /^\s+-\s/.test(head[i + 1])) list.push(scalar(head[++i].replace(/^\s+-\s+/, "")));
        y[m[1]] = list.length ? list : null;
        continue;
      }
      y[m[1]] = scalar(m[2]);
    }
    const id = y.id == null ? "" : String(y.id).trim();
    if (!id) return null;
    if (y.format != null && Number(y.format) > 1) return null;
    const str = (v) => (v == null ? "" : String(v));
    const updatedAt = isoOf(y.updated) || isoOf(at) || new Date().toISOString();
    return {
      id,
      title: str(y.title),
      body,
      notebook: str(y.notebook).trim(),
      tags: N().cleanTags(tagsOf(y.tags)),
      fav: y.favorite === true,
      parent: y.parent ? String(y.parent) : undefined,
      deletedAt: isoOf(y.deleted),
      createdAt: isoOf(y.created) || updatedAt,
      updatedAt,
      noTime: y.no_time === true ? true : undefined,
      emoji: y.emoji ? String(y.emoji) : undefined,
      src: y.source && typeof y.source === "object" && !Array.isArray(y.source) ? y.source : undefined,
    };
  }

  /** 手元の一件を、ファイルに書いて読み戻した姿に（比べるときはいつもこの姿で）。 */
  const norm = (n) => parse(fileOf(n), n.updatedAt);

  /* ---------------- 指紋と比べ方 ---------------- */

  function canon(v) {
    if (v === undefined || v === null) return "null";
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${q(k)}:${canon(v[k])}`).join(",")}}`;
    return q(v);
  }
  /** 字の指紋（cyrb53。比べるだけなので暗号でなくてよい）。 */
  function hash(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ":" + s.length;
  }
  const textOf = (n) => hash(`${n.title}\u0000${n.body}`);
  const fieldsOf = (n) => Object.fromEntries(FIELDS.map((k) => [k, n[k] === undefined ? null : n[k]]));
  const sig = (n) => (n ? `${canon(fieldsOf(n))}|${textOf(n)}` : "");
  const changed = (b, n) => FIELDS.some((k) => canon(b.f[k]) !== canon(n[k])) || b.x !== textOf(n);
  const blank = (n) => !String(n.title || "").trim() && !String(n.body || "").trim();
  const later = (a, b) => String(a || "") > String(b || "");

  /** 元の記録。at … 向こうのファイル {fid, path, rev}（無ければ null：向こうに無いと知っている）。
      u … そのときの updatedAt（写しに入れてよいかを見るだけ。無い元は写しに入れない）。 */
  const baseOf = (id, at, n) => ({ k: `sync:${id}`, id, fid: at ? at.fid : null, path: at ? at.path : null,
    rev: at ? at.rev : null, f: fieldsOf(n), x: textOf(n), u: n.updatedAt || null });

  /** 三方で合わせる。b … 元（無ければ足し合わせ）。返すのは合わせた一件と、本文から外れた側の版。 */
  function merge3(b, L, R) {
    const newer = later(R.updatedAt, L.updatedAt) ? R : L;
    const out = { id: L.id };
    FIELDS.forEach((k) => {
      const l = canon(L[k]), r = canon(R[k]), o = b ? canon(b.f[k]) : null;
      out[k] = l === r ? L[k] : o === l ? R[k] : o === r ? L[k] : newer[k];
    });
    const lx = textOf(L), rx = textOf(R);
    let win = L, ver = null;
    if (lx !== rx) {
      if (b && b.x === lx) win = R;
      else if (b && b.x === rx) win = L;
      else {
        win = newer;
        const lose = win === R ? L : R;
        ver = { at: lose.updatedAt, title: lose.title, body: lose.body, two: true };
      }
    }
    /* 消した印と字の直しがぶつかったら、残るほうへ（直した字を最近削除に埋めない）。 */
    if (out.deletedAt && b && !!L.deletedAt !== !!R.deletedAt) {
      const alive = L.deletedAt ? R : L;
      if (textOf(alive) !== b.x) out.deletedAt = null;
    }
    out.title = win.title;
    out.body = win.body;
    out.updatedAt = lx === rx ? (later(R.updatedAt, L.updatedAt) ? R.updatedAt : L.updatedAt) : win.updatedAt;
    return { note: out, ver };
  }

  /** 入れ物へ渡す直し（undefined は欄を外す）。 */
  const patchOf = (n) => {
    const p = { title: n.title, body: n.body, updatedAt: n.updatedAt };
    FIELDS.forEach((k) => { p[k] = n[k] === null && k !== "deletedAt" ? undefined : n[k]; });
    if (p.deletedAt === undefined) p.deletedAt = null;
    return p;
  };

  /* ---------------- ファイルの名前 ---------------- */

  function safe(s) {
    const x = Array.from(String(s || "").normalize("NFC")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()).slice(0, 60).join("")
      .replace(/^[. ]+/, "")
      .replace(/[. ]+$/, "");
    return x;
  }
  /** 置く名前の候補（後ろの id の尻6字で、同じ題でもぶつからない。それでもぶつかれば id を全部）。 */
  function namesFor(n) {
    const dir = n.deletedAt ? TRASH : DIR;
    const t = safe(n.title) || safe(String(n.createdAt || "").slice(0, 10)) || "無題";
    const id = safe(n.id) || "x";
    return [`${dir}/${t} ${id.slice(-6)}.md`, `${dir}/${t} ${id}.md`];
  }

  /* ---------------- Dropbox ---------------- */

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const retryAfter = (r) => {
    const s = Number((r.body && r.body.error && r.body.error.retry_after)
      || (r.res.headers && r.res.headers.get && r.res.headers.get("Retry-After")) || 1);
    return Math.min(60, Math.max(1, isFinite(s) ? s : 1)) * 1000;
  };

  /** 一つ呼ぶ。429 は言われただけ待って、三度まで。 */
  async function call(host, path, opts) {
    const api = D();
    for (let i = 0; ; i++) {
      const r = await api.call(host === "content" ? api.CONTENT : api.API, path, opts || {});
      if (r.res.status === 429 && i < 3) { await wait(retryAfter(r)); continue; }
      return { ok: !!r.res.ok, res: r.res, body: r.body, err: r.res.ok ? "" : api.summary(r) };
    }
  }
  const rpc = (path, json) => call("api", path, json === undefined ? {} : { json });

  async function upload(path, text, mode) {
    return call("content", "/2/files/upload", {
      arg: { path, mode, autorename: false, mute: true },
      body: new Blob([text], { type: "application/octet-stream" }),
    });
  }

  async function download(rev) {
    const r = await call("content", "/2/files/download", { arg: { path: `rev:${rev}` }, raw: true });
    if (!r.ok) throw new Error(r.err);
    return r.res.text();
  }

  /** notes/ の中（下のフォルダも）。cursor が無ければ全部。files … .md のファイル、gone … 無くなった場所。 */
  async function list(cursor) {
    const files = [];
    const gone = [];
    let r = cursor ? await rpc("/2/files/list_folder/continue", { cursor })
      : await rpc("/2/files/list_folder", { path: DIR, recursive: true, include_deleted: false });
    if (!r.ok) {
      if (cursor && /reset/.test(r.err)) return list(null);
      if (!cursor && /not_found/.test(r.err)) return { files, gone, cursor: "", whole: true };
      throw new Error(r.err);
    }
    for (;;) {
      (r.body.entries || []).forEach((e) => {
        if (e[".tag"] === "file" && /\.md$/i.test(e.name || "")) files.push(e);
        else if (e[".tag"] === "deleted") gone.push(String(e.path_lower || "").toLowerCase());
      });
      if (!r.body.has_more) break;
      r = await rpc("/2/files/list_folder/continue", { cursor: r.body.cursor });
      if (!r.ok) throw new Error(r.err);
    }
    return { files, gone, cursor: r.body.cursor || "", whole: !cursor };
  }

  /** 本文が参照する画像・ファイルのうち、まだ送っていないものを先に（add。名前＝中身なので上書きしない）。
      参照だけがほかの端末へ着いて、中身がどこにも無い時を作らない。落ちたらこの .md も送らない。 */
  async function carry(body) {
    const kinds = [[KN.noteImg, (id) => `/images/${id}.jpg`], [KN.noteFile, (id) => `/files/${id}`]];
    for (const [M, path] of kinds) {
      if (!M || !M.unsent) continue;
      const want = new Set(M.idsIn(body));
      if (!want.size) continue;
      for (const id of await M.unsent()) {
        if (!want.has(id)) continue;
        const rec = await M.get(id);
        if (!rec || !rec.bytes) continue;
        const r = await call("content", "/2/files/upload", {
          arg: { path: path(id), mode: "add", autorename: false, mute: true },
          body: new Blob([rec.bytes], { type: "application/octet-stream" }),
        });
        if (!r.ok && !/conflict/.test(r.err)) throw new Error(r.err);
        const ft = M.textOf && M.textOf(id);
        if (ft) {
          const t = await call("content", "/2/files/upload", {
            arg: { path: `${path(id)}.txt`, mode: "add", autorename: false, mute: true },
            body: new Blob([ft], { type: "application/octet-stream" }),
          });
          if (!t.ok && !/conflict/.test(t.err)) throw new Error(t.err);
        }
        await M.markSent(id);
      }
    }
  }

  /** 送る。at … 覚えたファイル（無ければ新しく置く）。置けた版の metadata、ほかの端末が先に直していたら "conflict"。 */
  async function send(n, at) {
    if (!n.deletedAt) await carry(n.body);
    const text = fileOf(n);
    if (!at) {
      for (const p of namesFor(n)) {
        const r = await upload(p, text, "add");
        if (r.ok) return r.body;
        if (!/conflict/.test(r.err)) throw new Error(r.err);
      }
      throw new Error("置く名前がありません");
    }
    let path = at.path;
    const want = namesFor(n);
    if (!want.some((p) => p.toLowerCase() === String(path).toLowerCase())) {
      for (const to of want) {
        const r = await rpc("/2/files/move_v2", { from_path: path, to_path: to, autorename: false });
        if (r.ok) { path = r.body.metadata.path_display; break; }
        if (!/to\/conflict/.test(r.err)) break;   // 動かせない（もう無い等）→ 下の update が断る
      }
    }
    const r = await upload(path, text, { ".tag": "update", update: at.rev });
    if (r.ok) return r.body;
    if (/conflict|not_found/.test(r.err)) return "conflict";
    throw new Error(r.err);
  }

  /* ---------------- 写し（pack.json。作り直せる） ---------------- */

  /** 写しを読む。fid → { rev, note }。無い・読めない → null（1件ずつ取る）。 */
  async function readPack() {
    const r = await call("content", "/2/files/download", { arg: { path: PACK }, raw: true });
    if (!r.ok) return null;
    try {
      const v = JSON.parse(await r.res.text());
      if (!v || Number(v.format) !== 1 || !Array.isArray(v.notes)) return null;
      return new Map(v.notes.filter((x) => x && x.fid && x.rev && x.note && x.note.id).map((x) => [x.fid, x]));
    } catch (_) { return null; }
  }

  /** 合わせ終えたら、1日1回まで書き直す（誰が書いてもよい）。手元が元のままのノートだけ。 */
  async function writePack() {
    if (st.packAt && Date.now() - new Date(st.packAt).getTime() < DAY) return;
    const local = new Map(N().list().concat(N().trash()).map((n) => [n.id, n]));
    const notes = [];
    (await N().metaAll("sync:")).forEach((b) => {
      const n = b && b.fid && b.rev && b.u && local.get(b.id);
      const L = n && norm(n);
      if (L && !changed(b, L) && L.updatedAt === b.u) notes.push({ fid: b.fid, rev: b.rev, note: L });
    });
    if (notes.length < PACK_MIN) return;
    const m = await rpc("/2/files/get_metadata", { path: PACK });
    if (m.ok && Date.now() - new Date(m.body.server_modified).getTime() < DAY) { st.packAt = m.body.server_modified; return; }
    if (!m.ok && !/not_found/.test(m.err)) return;
    const r = await upload(PACK, JSON.stringify({ format: 1, at: new Date().toISOString(), notes }), "overwrite");
    if (r.ok) st.packAt = new Date().toISOString();
  }

  /* ---------------- 覚え（入れ物の meta） ---------------- */

  function loadState() {
    if (!loaded) {
      loaded = N().ready().then(() => (N().state() === "on" ? N().metaAll(ST) : []))
        .then((rows) => { st = rows.find((r) => r.k === ST) || { k: ST, on: false }; })
        .catch(() => { st = { k: ST, on: false }; loaded = null; });
    }
    return loaded;
  }
  const saveState = () => N().absorb([], [[ST, { ...st }]]);

  /* ---------------- 合わせる一回 ---------------- */

  async function round() {
    await loadState();
    if (!st || !st.on || st.halt) return "off";
    if (N().state() !== "on") return "off";
    const api = D();
    if (!api) return "off";
    if (!(await api.ready())) throw new Error("Dropbox につながっていません");

    /* つないだ Dropbox が替わっていたら、覚えたものを捨ててここから（足し合わせ）。 */
    if (!checked) {
      const a = await rpc("/2/users/get_current_account");
      if (!a.ok) throw new Error(a.err);
      const acc = (a.body && a.body.account_id) || "";
      if (st.account && acc && st.account !== acc) await forget();
      st.account = acc;
      st.full = true;
      checked = true;
    }

    const rows = await N().metaAll("sync:");
    const bases = new Map(rows.filter((r) => r && r.id).map((r) => [r.id, r]));
    /* はじめて合わせる前に控えを（手元のノートは消さない形でも、念のため）。 */
    if (!st.began) {
      if (KN.backup && KN.backup.take) { try { await KN.backup.take("ノートを合わせる前", { now: true }); } catch (_) { /* 控えが取れない日も、足し合わせは消さない */ } }
      st.began = true;
      await saveState();
    }

    const listed = await list(st.full || !st.cursor ? null : st.cursor);

    /* ---- 向こうで変わったもの ---- */
    const byFid = new Map();
    bases.forEach((b) => { if (b.fid) byFid.set(b.fid, b); });
    const seen = new Set();
    const pull = [];
    const metas = [];
    listed.files.forEach((e) => {
      seen.add(e.id);
      const b = byFid.get(e.id);
      if (b && b.rev === e.rev) {
        if (b.path !== e.path_display) metas.push([b.k, { ...b, path: e.path_display }]);
        return;
      }
      pull.push(e);
    });
    /* 新しい端末（元の無いファイルが多い）は写しから。rev が同じものだけ。 */
    const pack = pull.filter((e) => !byFid.has(e.id)).length >= PACK_MIN ? await readPack() : null;
    const fromPack = (e) => {
      const x = pack && pack.get(e.id);
      if (!x || x.rev !== e.rev) return null;
      try { return parse(fileOf(x.note), e.server_modified); } catch (_) { return null; }
    };
    const remote = new Map();
    for (let i = 0; i < pull.length; i += PULL) {
      const got = await Promise.all(pull.slice(i, i + PULL).map((e) => {
        const n = fromPack(e);
        return n ? { e, n } : download(e.rev).then((text) => ({ e, n: parse(text, e.server_modified) }), () => ({ e, n: null }));
      }));
      got.forEach(({ e, n }) => {
        if (!n) return;                                  // 読まず・消さず・上書きせず
        const had = remote.get(n.id);
        const b = bases.get(n.id);
        if (had && !(b && b.fid === e.id)) return;       // 同じ id の写し（外で複製したもの）は一つめだけ
        remote.set(n.id, { e, n });
      });
    }

    /* ---- 無くなったもの ---- */
    const gone = new Set();
    bases.forEach((b) => {
      if (!b.fid || seen.has(b.fid) || remote.has(b.id)) return;
      const p = String(b.path || "").toLowerCase();
      if (listed.whole || listed.gone.some((g) => p === g || p.startsWith(`${g}/`))) gone.add(b.id);
    });

    const local = new Map();
    N().list().concat(N().trash()).forEach((n) => local.set(n.id, norm(n)));

    /* 一度にたくさん無くなったら、手元は消さずに止めて訊く。 */
    const lost = [...gone].filter((id) => { const L = local.get(id); return L && !L.deletedAt && !changed(bases.get(id), L); });
    const alive = [...bases.values()].filter((b) => b.fid && local.has(b.id) && !local.get(b.id).deletedAt).length;
    if (lost.length >= MANY && lost.length * 5 >= alive) {
      st.halt = "many";
      await saveState();
      emit();
      return "halt";
    }

    /* ---- 一件ずつ決める ---- */
    const ids = new Set([...remote.keys(), ...gone]);
    local.forEach((L, id) => { const b = bases.get(id); if (b ? changed(b, L) : !blank(L)) ids.add(id); });
    bases.forEach((b, id) => { if (!local.has(id)) ids.add(id); });

    const plan = new Map();          // id → { take?, base?, send?, del? }
    let held = false;
    const now = new Date().toISOString();
    ids.forEach((id) => {
      if (N().isOpen(id)) { if (remote.has(id) || gone.has(id)) held = true; return; }
      const L = local.get(id) || null;
      const b = bases.get(id) || null;
      const R = remote.get(id) || null;
      if (R) {
        const at = { fid: R.e.id, path: R.e.path_display, rev: R.e.rev };
        if (!L) {
          /* 手元で本当に消した（30日）ノートに、向こうも消した印 → ファイルも消す。生きていれば戻ってくる。 */
          if (b && R.n.deletedAt) plan.set(id, { del: at });
          else plan.set(id, { take: [id, patchOf(R.n), null], base: baseOf(id, at, R.n) });
          return;
        }
        const { note, ver } = merge3(b, L, R.n);
        const p = { base: baseOf(id, at, R.n) };
        if (ver || sig(note) !== sig(L)) p.take = [id, patchOf(note), ver];
        if (sig(note) !== sig(R.n)) p.send = { n: note, at };
        plan.set(id, p);
        return;
      }
      if (gone.has(id)) {
        if (!L) plan.set(id, { base: null });
        else if (changed(b, L)) plan.set(id, { send: { n: L, at: null } });           // 直したほうが勝つ
        else if (!L.deletedAt) {
          const n = { ...L, deletedAt: now };
          plan.set(id, { take: [id, { deletedAt: now }, null], base: baseOf(id, null, n) });
        } else plan.set(id, { base: baseOf(id, null, L) });
        return;
      }
      if (!L) { plan.set(id, b && b.fid ? { del: b } : { base: null }); return; }
      plan.set(id, { send: { n: L, at: b && b.fid ? b : null } });
    });

    /* ---- 書く：外から来た中身と元を、同じ取引で。読んだあとで手元が直っていたら、その一件は次の回へ。 */
    const notes = [];
    plan.forEach((p, id) => {
      if (p.take) {
        const cur = N().get(id);
        if (sig(cur ? norm(cur) : null) !== sig(local.get(id) || null) || N().isOpen(id)) { plan.delete(id); again = true; return; }
        notes.push(p.take);
      }
      if (p.base !== undefined) metas.push([`sync:${id}`, p.base]);
    });
    if (notes.length || metas.length) await N().absorb(notes, metas);
    if (notes.length && KN.noteImg && KN.noteImg.pullMissing) KN.noteImg.pullMissing().catch(() => {});

    /* ---- 送る・消す（一本ずつ） ---- */
    let out = [];
    for (const [id, p] of plan) {
      if (p.send) {
        const m = await send(p.send.n, p.send.at);
        if (m === "conflict") { again = true; continue; }
        out.push([`sync:${id}`, baseOf(id, { fid: m.id, path: m.path_display, rev: m.rev }, p.send.n)]);
      } else if (p.del) {
        const r = await rpc("/2/files/delete_v2", { path: p.del.path, parent_rev: p.del.rev });
        if (r.ok || /not_found/.test(r.err)) out.push([`sync:${id}`, null]);
        else again = true;
      }
      if (out.length >= 20) { await N().absorb([], out); out = []; }
    }
    if (out.length) await N().absorb([], out);

    await labelsRound();
    if (!again && !held) { try { await writePack(); } catch (_) { /* 写しは作り直せる。書けない日は書かない */ } }

    st.cursor = listed.cursor;
    st.full = held;
    st.at = new Date().toISOString();
    delete st.err;
    delete st.errAt;
    await saveState();
    return "done";
  }

  /* ---------------- 色（labels.json） ---------------- */

  function mergeLabels(b, l, r) {
    const out = { nb: {}, tag: {} };
    ["nb", "tag"].forEach((kind) => {
      const B = (b && b[kind]) || {}, Lk = l[kind] || {}, Rk = r[kind] || {};
      new Set([...Object.keys(Lk), ...Object.keys(Rk), ...Object.keys(B)]).forEach((name) => {
        const lv = own(Lk, name) ? Lk[name] : null, rv = own(Rk, name) ? Rk[name] : null, bv = own(B, name) ? B[name] : null;
        const v = lv === rv ? lv : bv === lv ? rv : lv;
        if (v) out[kind][name] = v;
      });
    });
    return out;
  }

  async function labelsRound() {
    const lb = (await N().metaAll(LB)).find((r) => r.k === LB) || null;
    const m = await rpc("/2/files/get_metadata", { path: LABELS });
    if (!m.ok && !/not_found/.test(m.err)) throw new Error(m.err);
    let rem = null;
    const rev = m.ok ? m.body.rev : null;
    if (rev && lb && lb.rev === rev) rem = lb.data;
    else if (rev) {
      try {
        const v = JSON.parse(await download(rev));
        if (v && typeof v === "object") rem = { nb: { ...(v.nb || {}) }, tag: { ...(v.tag || {}) } };
      } catch (_) { return; }                        // 読めない labels.json は上書きしない
    }
    const mine = N().colors();
    const before = canon(mine);
    const next = rem ? mergeLabels(lb && lb.data, mine, rem) : mine;
    const metas = [];
    if (canon(next) !== before) {
      if (canon(N().colors()) !== before) { again = true; return; }
      N().setColors((all) => { all.nb = { ...next.nb }; all.tag = { ...next.tag }; }, true);
    }
    if (rem) metas.push([LB, { k: LB, rev, data: rem }]);
    if (metas.length || canon(next) !== before) await N().absorb([], metas);
    if (rem && canon(next) === canon(rem)) return;
    if (!rem && !Object.keys(next.nb).length && !Object.keys(next.tag).length) return;
    const r = await upload(LABELS, JSON.stringify({ format: 1, nb: next.nb, tag: next.tag }, null, 1),
      rev ? { ".tag": "update", update: rev } : "add");
    if (!r.ok) { if (/conflict/.test(r.err)) { again = true; return; } throw new Error(r.err); }
    await N().absorb([], [[LB, { k: LB, rev: r.body.rev, data: next }]]);
  }

  /** 覚えたものを捨てる（別の Dropbox・合わせ直す）。次の回は足し合わせ。手元のノートには触れない。 */
  async function forget() {
    const rows = (await N().metaAll("sync:")).map((r) => [r.k, null]);
    rows.push([LB, null]);
    delete st.cursor;
    delete st.began;
    st.full = true;
    await N().absorb([], rows);
  }

  /* ---------------- 回す ---------------- */

  function sync() {
    if (running) { again = true; return running; }
    clearTimeout(timer);
    timer = null;
    running = (async () => {
      let res = "off";
      for (let i = 0; i < 3; i++) {
        again = false;
        try { res = await round(); } catch (err) {
          if (st) { st.err = String((err && err.message) || err); st.errAt = new Date().toISOString(); try { await saveState(); } catch (_) { /* 次の回に */ } }
          res = "failed";
          break;
        }
        if (!again || res !== "done") break;
      }
      return res;
    })().finally(() => { running = null; emit(); if (!polling) poll(); });
    return running;
  }

  /* ---------------- 開いているあいだは longpoll ---------------- */

  let pollGen = 0;
  let pollCtl = null;
  let polling = false;
  function stopPoll() {
    pollGen++;
    if (pollCtl) pollCtl.abort();
    pollCtl = null;
    polling = false;
  }
  async function poll() {
    stopPoll();
    const g = pollGen;
    const live = () => g === pollGen && !!st && st.on && !st.halt && !!st.cursor && document.visibilityState === "visible";
    if (!live()) return;
    polling = true;
    while (live()) {
      const t0 = Date.now();
      let ok = false, body = null;
      const ctl = (pollCtl = new AbortController());
      try {
        const res = await fetch(`${NOTIFY}/2/files/list_folder/longpoll`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor: st.cursor, timeout: WAIT }), signal: ctl.signal,
        });
        ok = res.ok;
        body = await res.json().catch(() => null);
      } catch (_) { /* 切れた・隠れた */ }
      if (!live()) return;
      /* 変わった・古い cursor（reset）は合わせる一回が直す。sync の終わりがここを呼び直す。 */
      if (!ok) await wait(60000);
      if (!live()) return;
      if (!ok || (body && body.changes)) { polling = false; sync(); return; }
      await wait(Math.max(body && body.backoff ? body.backoff * 1000 : 0, GAP - (Date.now() - t0)));
    }
    if (g === pollGen) polling = false;
  }

  /** 入れてあるのに、合わせられないまま STUCK 日。{ days, halt } か null（歯車の点）。 */
  function stale(now) {
    if (!st || !st.on || !(st.err || st.halt)) return null;
    const last = st.at || st.onAt;
    const t = last ? new Date(last).getTime() : NaN;
    if (!isFinite(t)) return null;
    const days = Math.floor(((now || Date.now()) - t) / DAY);
    return days >= STUCK ? { days, halt: !!st.halt } : null;
  }

  /** 書いた。少しあとに一度（その間の書き換えはまとめる）。 */
  function soon() {
    if (!st || !st.on) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, SOON);
  }

  async function setOn(on) {
    await loadState();
    st.on = !!on;
    if (on) { st.full = true; delete st.err; if (!st.onAt) st.onAt = new Date().toISOString(); } else stopPoll();
    await saveState();
    emit();
    return on ? sync() : "off";
  }

  /** 止まっていたのを、覚えを捨てて足し合わせからやり直す（手元のノートは消さない）。 */
  async function restart() {
    await loadState();
    if (running) await running.catch(() => {});
    delete st.halt;
    await forget();
    await saveState();
    emit();
    return sync();
  }

  function status() {
    return {
      on: !!(st && st.on), at: (st && st.at) || "", halt: (st && st.halt) || "",
      error: (st && st.err) || "", errorAt: (st && st.errAt) || "", busy: !!running,
    };
  }

  document.addEventListener("visibilitychange", () => {
    if (!st || !st.on) return;
    if (document.visibilityState === "hidden") { stopPoll(); if (timer) sync(); }
    else sync();
  });
  setInterval(() => { if (st && st.on && document.visibilityState === "visible") sync(); }, EVERY);
  setTimeout(() => { loadState().then(() => { if (st && st.on) sync(); emit(); }); }, FIRST);

  KN.notesSync = {
    status, setOn, restart, soon, stale, now: sync, ready: loadState,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* 試験の口（台本が形を確かめる） */
    _: { fileOf, parse, merge3, namesFor, st: () => st },
  };
})();
