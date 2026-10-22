/* =========================================================
   くらしノート — 見たままの書く欄（docs/notes-unify.md「書き方：見たまま」の段A・段B＝表）

   本文の正は今までどおり Markdown の字（screen-notes.js の書く欄 .js-text が持つ）。
   ここは画面の上だけ：開くとき Markdown → 行の並び、打ったら行の並び → Markdown。
   一行が一つの塊で、読む姿（note-format.js の render）と同じ class を着る——書き終えても
   同じ姿。行頭の印（・番号・四角）は ::before で描き、打てる字の中に要素を置かない。
   一行の中の太字・リンクは要素が自分の印（data-o / data-c）を持ち、写すときに戻す。

   決まり：
   ・一行の中で打つ・消す・変換する・予測で直すのは、ブラウザに任せる（日本語入力を壊さない）。
     変換のあいだ（compositionstart〜end）は DOM に一切触れない。読むだけ（保存はする）。
   ・自分で受けるのは行をまたぐものだけ：改行・行頭の ⌫・行末の Delete・行をまたぐ選択の
     上書き・貼り付け・取り消す。差し替えは呼ぶ側の apply（{ from, to, text, s, e }）。
   ・打ったあとは、触った行を Markdown として読み直し、姿が違えば作り直す（「# 」で見出しに
     なる・「**…**」が太字になる）。違うのが class だけなら、中身は触らない。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const F = () => KN.noteFormat;
  const ZW = "​";
  /* 触れない塊（画像・ファイル・線）。 */
  const FIXED = new Set(["rule", "img", "file"]);
  const LISTS = ["bullet", "num", "task"];
  /* 画像の原本（note-format.js の PIC と同じ）。画像の行のすぐ下なら畳む。 */
  const PIC = /\.(jpg|png|gif|webp|heic|heif|bmp|avif|tif)$/;
  /* 「[] 」「[ ] 」をチェックに（行頭。箇条の「- [] 」も）。 */
  const BOX = /^(\s*)(?:([-*]) )?\[ ?\] /;

  const lineStart = (v, i) => (i > 0 ? v.lastIndexOf("\n", i - 1) + 1 : 0);
  const lineEnd = (v, i) => { const e = v.indexOf("\n", i); return e < 0 ? v.length : e; };
  /** 印までの長さ（段落・空の行は 0：字下げも中身）。 */
  const leadOf = (p) => (p.kind === "para" || p.kind === "blank" ? 0 : p.lead);

  /* ---------------- 行を作る・写す ---------------- */

  /** 一行の中身。太字は <strong>、リンクは <a>（印は data-o / data-c に。先は開かない——押すとカーソル）。 */
  function fill(el, text) {
    let at = 0;
    F().marksOf(text).forEach((x) => {
      if (x.a > at) el.append(text.slice(at, x.a));
      const m = document.createElement(x.kind === "bold" ? "strong" : "a");
      m.className = x.kind === "bold" ? "nv-b" : "nv-link";
      m.dataset.o = text.slice(x.a, x.s);
      m.dataset.c = text.slice(x.e, x.b);
      if (x.kind === "link") m.dataset.href = x.href;
      m.textContent = text.slice(x.s, x.e);
      el.append(m);
      at = x.b;
    });
    if (at < text.length) el.append(text.slice(at));
  }

  /** 一行の要素。prev は一つ上の行の字（画像の原本を畳むため）。_md はその行の Markdown。 */
  function build(line, prev) {
    const f = F();
    const p = f.parse(line);
    const el = document.createElement("div");
    el._md = line;
    if (FIXED.has(p.kind)) {
      el.contentEditable = "false";
      el._fixed = true;
      if (p.kind === "rule") {
        el.className = "nv-hr";
        el.append(document.createElement("hr"));
      } else if (p.kind === "img") {
        el.className = "nv-img";
        el.dataset.img = p.id;
      } else if (PIC.test(p.id) && prev != null && f.parse(prev).kind === "img") {
        /* 画像の原本：画像に預けて、行は出さない（screen-notes.js が押した画像から開く）。 */
        el.className = "nv-orig";
        el.dataset.file = p.id;
        el.dataset.name = p.text;
      } else {
        el.className = "nv-file";
        el.dataset.file = p.id;
        const mark = document.createElement("span");
        mark.className = "nv-file-i";
        mark.innerHTML = KN.icons ? KN.icons.svg("paper") : "";
        const t = document.createElement("span");
        t.className = "nv-t";
        t.textContent = p.text || " ";
        el.append(mark, t);
      }
      return el;
    }
    const lead = leadOf(p);
    const text = line.slice(lead);
    if (lead) el.dataset.p = line.slice(0, lead);
    if (p.kind === "head") el.className = `nv-h nv-h${p.level}`;
    else if (p.kind === "quote") el.className = "nv-q";
    else if (p.kind === "para") el.className = "nv-p";
    else if (p.kind === "blank") el.className = "nv-blank";
    else {
      el.className = `nv-li is-${p.kind}${p.done ? " is-done" : ""}`;
      el.style.setProperty("--lv", String(p.level));
      if (p.kind === "num") el.dataset.mk = `${p.n}.`;
    }
    if (f.askOf(line)) el.classList.add("is-ask");
    const t = document.createElement("span");
    t.className = "nv-t";
    fill(t, text);
    /* 中身の無い行もカーソルを持てるように。 */
    if (!text) t.append(document.createElement("br"));
    el.append(t);
    return el;
  }

  /** 表（段B・段5）：頭から終わりまでの行で一つの塊。読む姿と同じ表で、塊は触れない。マスの字（.lv-cell）が
      それぞれ打てる欄——マスの中で打つ・消す・変換するのはブラウザ任せ、写すのは打ったマスだけ（cellsInto）。
      マスの本文の位置は td._a〜_b（表の頭から）。 */
  function table(md) {
    const el = F().tableEl(F().tablesOf(md.split("\n")).get(0));
    el._md = md;
    el._fixed = true;
    el._table = true;
    el.contentEditable = "false";
    el.querySelectorAll("[data-at]").forEach((td) => {
      td._a = Number(td.dataset.at);
      td._b = Number(td.dataset.end);
      const t = td.querySelector(".nv-t");
      t.textContent = "";
      fill(t, F().cellText(md.slice(td._a, td._b)));
      if (!t.firstChild) t.append(document.createElement("br"));
      t.classList.add("lv-cell");
      t.contentEditable = "true";
    });
    return el;
  }
  const isTable = (c) => !!(c && c.nodeType === 1 && c._table);
  /** マスの字 → 本文の字（「|」は「\|」。マスの中の改行はそのまま——Notion の表と同じ形）。 */
  const cellMd = (t) => inl(t).replace(/\|/g, "\\|");
  /** 打ったマスを表の Markdown（el._md）へ写す。字の同じマスは元の字のまま（空白・改行の置き方を変えない）。
      写したあと表として読めなければ false（呼ぶ側が並べ直す）。DOM には触れない（変換中も呼ばれる）。 */
  function cellsInto(el) {
    const tds = [...el.querySelectorAll("[data-at]")];
    let v = el._md;
    let changed = false;
    for (let i = tds.length - 1; i >= 0; i--) {
      const td = tds[i];
      const t = td.querySelector(".lv-cell");
      if (!t || inl(t) === F().cellText(v.slice(td._a, td._b))) continue;
      /* 後ろの空白（改行も）は次の「|」まで書き直す——マスの終わりで改行した残りを挟まない。 */
      let b = td._b;
      while (b < v.length && v[b] !== "|" && /\s/.test(v[b])) b++;
      v = v.slice(0, td._a) + cellMd(t) + " " + v.slice(b);
      changed = true;
    }
    if (!changed) return true;
    el._md = v;
    const lines = v.split("\n");
    const tb = F().tablesOf(lines).get(0);
    const trs = [...el.querySelectorAll("tr")];
    if (!tb || tb.end !== lines.length || tb.rows.length !== trs.length) return false;
    for (let r = 0; r < trs.length; r++) {
      const mine = [...trs[r].children].filter((td) => td._a != null);
      if (tb.rows[r].length < mine.length) return false;
      mine.forEach((td, j) => { td._a = tb.rows[r][j].a; td._b = tb.rows[r][j].b; });
    }
    return true;
  }
  /** 本文を塊に（一行が一つ、表は一つ）。 */
  function blocks(v) {
    const lines = String(v).split("\n");
    const tabs = F().tablesOf(lines);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const tb = tabs.get(i);
      const sub = tb ? lines.slice(i, tb.end) : null;
      /* 表だけ切り出しても同じ表になるときだけ畳む（でなければ行のまま）。 */
      const one = sub && F().tablesOf(sub).get(0);
      if (one && one.end === sub.length) {
        out.push({ md: sub.join("\n"), table: true });
        i = tb.end - 1;
        continue;
      }
      out.push({ md: lines[i], prev: i ? lines[i - 1] : null });
    }
    return out;
  }
  const make = (b) => (b.table ? table(b.md) : build(b.md, b.prev));
  const lastLine = (md) => md.slice(md.lastIndexOf("\n") + 1);

  const isGap = (n) => !!(n.parentNode && n.parentNode.classList && n.parentNode.classList.contains("lv-gap"));
  /** 字の節の字（間の詰め物の中は、詰め物の字を数えない）。 */
  const textOf = (n) => (isGap(n) ? n.data.split(ZW).join("") : n.data);
  const isMark = (n) => n.nodeType === 1 && n.dataset && n.dataset.o != null;
  function inl(n) {
    let s = "";
    for (let c = n.firstChild; c; c = c.nextSibling) s += piece(c);
    return s;
  }
  function piece(c) {
    if (c.nodeType === 3) return textOf(c);
    if (c.nodeType !== 1 || c.tagName === "BR") return "";
    if (isMark(c)) {
      const s = inl(c);
      return s ? c.dataset.o + s + c.dataset.c : "";
    }
    return inl(c);
  }
  const BLOCK = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|UL|OL|PRE)$/;
  /** 並びの一つ（行の要素・ブラウザが足した何か）を Markdown の行に。 */
  function linesOf(n) {
    if (n.nodeType === 3) return [n.data];
    if (n.nodeType !== 1 || n.tagName === "BR") return [];
    if (n._fixed) return [n._md];
    const pre = (n.dataset && n.dataset.p) || "";
    if (![...n.children].some((c) => BLOCK.test(c.tagName))) return [pre + inl(n)];
    const out = [];
    let run = pre;
    let has = !!pre;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && BLOCK.test(c.tagName)) {
        if (has) out.push(run);
        run = "";
        has = false;
        out.push(...linesOf(c));
      } else { run += piece(c); has = true; }
    }
    if (has) out.push(run);
    return out;
  }
  /** 行の要素の Markdown（作った行だけ）。 */
  const lineMd = (el) => (el._fixed ? el._md : ((el.dataset && el.dataset.p) || "") + inl(el));

  /** 行の中の点（node, off）が、その行の Markdown の何字めか。 */
  function locate(el, node, off) {
    if (el._fixed) return el._md.length;
    const pre = ((el.dataset && el.dataset.p) || "").length;
    if (node !== el && !el.contains(node)) return pre;
    let k = pre;
    const path = [];
    for (let n = node; n !== el; n = n.parentNode) path.unshift(n);
    let cur = el;
    for (const step of path) {
      for (let c = cur.firstChild; c && c !== step; c = c.nextSibling) k += piece(c).length;
      if (isMark(step) && inl(step)) k += step.dataset.o.length;
      cur = step;
    }
    if (node.nodeType === 3) return k + (isGap(node) ? node.data.slice(0, off).split(ZW).join("").length : off);
    let i = 0;
    for (let c = node.firstChild; c && i < off; c = c.nextSibling, i++) k += piece(c).length;
    return k;
  }

  /** 行の Markdown の k 字めに当たる点。飾りの印の中なら飾りの字の端へ。行が飾りで終わり、
      その後ろを指すなら、詰め物（.lv-gap）を置いてそこへ（でないと打った字が太字の中へ入る）。 */
  function pointAt(el, k) {
    const pre = ((el.dataset && el.dataset.p) || "").length;
    let rest = Math.max(0, k - pre);
    let res = null;
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const len = textOf(c).length;
          if (rest <= len) {
            let off = rest;
            if (isGap(c)) { let seen = 0; off = 0; while (off < c.data.length && (seen < rest || c.data[off] === ZW)) { if (c.data[off] !== ZW) seen++; off++; } }
            res = { node: c, off };
            return true;
          }
          rest -= len;
          continue;
        }
        if (c.nodeType !== 1 || c.tagName === "BR") continue;
        if (isMark(c)) {
          const inner = inl(c);
          if (!inner) continue;
          const total = c.dataset.o.length + inner.length + c.dataset.c.length;
          if (rest < total) {
            rest = Math.min(Math.max(0, rest - c.dataset.o.length), inner.length);
            if (walk(c)) return true;
            res = { node: c, off: c.childNodes.length };
            return true;
          }
          rest -= total;
          continue;
        }
        if (walk(c)) return true;
      }
      return false;
    };
    if (walk(el)) return res;
    const box = el.querySelector(".nv-t") || el;
    let last = box.lastChild;
    while (last && last.nodeType === 1 && last.tagName === "BR") last = last.previousSibling;
    if (last && isMark(last)) {
      const g = document.createElement("span");
      g.className = "lv-gap";
      g.textContent = ZW;
      last.after(g);
      return { node: g.firstChild, off: 1 };
    }
    const brs = [...box.childNodes].filter((c) => c.nodeType === 1 && c.tagName === "BR");
    return { node: box, off: brs.length ? [...box.childNodes].indexOf(brs[0]) : box.childNodes.length };
  }

  /** 表の中の点（node, off）が、表の Markdown の何字めか（マスの外なら表の終わり）。 */
  function locateCell(el, node, off) {
    const n = node.nodeType === 1 ? node : node.parentNode;
    const t = n && n.closest && n.closest(".lv-cell");
    const td = t && el.contains(t) ? t.closest("[data-at]") : null;
    if (!td) return el._md.length;
    const k = locate(t, node, off);
    return Math.min(td._a + inl(t).slice(0, k).replace(/\|/g, "\\|").length, td._b);
  }
  /** 表の Markdown の k 字めに当たるマスの中の点。マスの間なら次のマスの頭（無ければ終わりのマスの終わり）。 */
  function cellPoint(el, k) {
    const tds = [...el.querySelectorAll("[data-at]")];
    if (!tds.length) return null;
    const td = tds.find((x) => k <= x._b) || tds[tds.length - 1];
    const t = td.querySelector(".lv-cell");
    const s = inl(t);
    let q = Math.max(0, Math.min(k, td._b) - td._a);
    let i = 0;
    for (; i < s.length && q > 0; i++) q -= s[i] === "|" ? 2 : 1;
    return pointAt(t, k > td._b ? Infinity : i);
  }
  const cellOf = (n) => { const x = n && (n.nodeType === 1 ? n : n.parentNode); return x && x.closest ? x.closest(".lv-cell") : null; };

  /** 見た目の印（作り直すかどうか）。字の並び・飾り・余計な要素。 */
  function sig(el) {
    if (el.nodeType !== 1) return "?";
    if (el._fixed) return `F${el._md}`;
    let s = "";
    let run = "";
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          if (n === el && textOf(c)) s += "?";
          run += textOf(c);
          continue;
        }
        if (c.nodeType !== 1 || c.tagName === "BR") continue;
        if (c.classList.contains("lv-gap")) { walk(c); continue; }
        if (n === el && c.classList.contains("nv-t")) { walk(c); continue; }
        if (isMark(c)) {
          s += `T${run}<${c.tagName}${c.dataset.o}${c.dataset.c}`;
          run = "";
          walk(c);
          s += `T${run}>`;
          run = "";
          continue;
        }
        s += "?";
        walk(c);
      }
    };
    walk(el);
    return `${s}T${run}`;
  }
  const looks = (el) => [el.className, (el.dataset && el.dataset.p) || "", (el.dataset && el.dataset.mk) || "", el.style.getPropertyValue("--lv")].join("|");
  function dressLike(el, from) {
    el.className = from.className;
    if (from.dataset.p) el.dataset.p = from.dataset.p; else delete el.dataset.p;
    if (from.dataset.mk) el.dataset.mk = from.dataset.mk; else delete el.dataset.mk;
    const lv = from.style.getPropertyValue("--lv");
    if (lv) el.style.setProperty("--lv", lv); else el.style.removeProperty("--lv");
  }

  /** Markdown → 並べて → 戻すと一字も違わないか（違うノートは印で開く）。 */
  function fits(md) {
    const v = String(md == null ? "" : md);
    const box = document.createElement("div");
    blocks(v).forEach((b) => box.append(make(b)));
    return [...box.childNodes].flatMap(linesOf).join("\n") === v;
  }

  /* ---------------- 行をまたぐ手（字を受けて字を返す。試験が直に確かめる） ---------------- */

  /** 改行。箇条・番号・チェック・引用は続き（note-format.js の onEnter）。見出しの頭なら上に空の行。
      太字の中で切ったら、両方の行で太字のまま。リンクの中なら、リンクの後ろで切る。 */
  function enter(v, s, e) {
    const f = F();
    const base = e > s ? v.slice(0, s) + v.slice(e) : v;
    const from = lineStart(base, s);
    const line = base.slice(from, lineEnd(base, s));
    const p = f.parse(line);
    const lead = leadOf(p);
    let k = s - from;
    let wrap = false;
    if (!FIXED.has(p.kind) && k > lead) {
      for (const x of f.marksOf(line.slice(lead))) {
        const a = x.a + lead;
        const b = x.b + lead;
        if (k <= a || k >= b) continue;
        if (k <= x.s + lead) k = a;
        else if (k >= x.e + lead) k = b;
        else if (x.kind === "bold") wrap = true;
        else k = b;
        break;
      }
    }
    const at = from + k;
    let r;
    if (lead && k === lead && line.length > lead && !LISTS.includes(p.kind) && p.kind !== "quote") {
      r = { from, to: from, text: "\n", s: at + 1, e: at + 1 };
    } else {
      r = f.onEnter(base, at, at) || { from: at, to: at, text: "\n", s: at + 1, e: at + 1 };
      if (wrap && r.from === at && r.to === at && r.text.startsWith("\n")) {
        r = { from: at, to: at, text: `**${r.text}**`, s: r.s + 4, e: r.s + 4 };
      }
    }
    return { from: 0, to: v.length, text: base.slice(0, r.from) + r.text + base.slice(r.to), s: r.s, e: r.e };
  }

  /** 行の中身の頭で ⌫。印があれば外す（段があれば一段上げる）、無ければ上の行とつなぐ。
      上が画像・ファイル・線なら、それを消す（画像の原本も一緒に）。頭でなければ null（ブラウザに任せる）。 */
  function back(v, s) {
    const f = F();
    const from = lineStart(v, s);
    const line = v.slice(from, lineEnd(v, s));
    const p = f.parse(line);
    const lead = leadOf(p);
    if (s - from !== lead) return null;
    if (lead) {
      if (LISTS.includes(p.kind) && p.level > 0) return f.shift(v, s, s, -1);
      return { from, to: from + lead, text: "", s: from, e: from };
    }
    if (!from) return { from: 0, to: 0, text: "", s: 0, e: 0 };
    const pf = lineStart(v, from - 1);
    const pp = f.parse(v.slice(pf, from - 1));
    if (FIXED.has(pp.kind)) {
      let a = pf;
      if (pp.kind === "file" && PIC.test(pp.id) && pf > 0) {
        const qf = lineStart(v, pf - 1);
        if (f.parse(v.slice(qf, pf - 1)).kind === "img") a = qf;
      }
      return { from: a, to: from, text: "", s: a, e: a };
    }
    return { from: from - 1, to: from, text: "", s: from - 1, e: from - 1 };
  }

  /** 行の終わりで Delete。下の行の中身をつなぐ（印は外す）。下が画像・ファイル・線ならそれを消す。
      この行が空なら、この行を消す。終わりでなければ null。 */
  function forward(v, s) {
    const f = F();
    const from = lineStart(v, s);
    const to = lineEnd(v, s);
    if (s !== to) return null;
    if (to >= v.length) return { from: s, to: s, text: "", s, e: s };
    const nf = to + 1;
    const nt = lineEnd(v, nf);
    const np = f.parse(v.slice(nf, nt));
    if (!v.slice(from, to).trim() && !FIXED.has(np.kind)) {
      return { from, to: nf, text: "", s: from + leadOf(np), e: from + leadOf(np) };
    }
    if (FIXED.has(np.kind)) {
      let b = nt;
      if (np.kind === "img" && nt < v.length) {
        const ot = lineEnd(v, nt + 1);
        const op = f.parse(v.slice(nt + 1, ot));
        if (op.kind === "file" && PIC.test(op.id)) b = ot;
      }
      return { from: to, to: b, text: "", s, e: s };
    }
    return { from: to, to: nf + leadOf(np), text: "", s, e: s };
  }

  /* ---------------- 書く欄 ---------------- */

  /**
   * 見たままの書く欄を root（contenteditable の div）に作る。o は画面の側の手：
   *   apply(r, kind)：差し替えを一つ当てる（{ from, to, text, s, e }。やり直しの控えも呼ぶ側）
   *   note(kind)：ブラウザに任せて打つ直前（やり直しの控え）
   *   input()：打ったあと（md() が新しい字）
   *   undo() / redo() / bold() / tick(at) / tail() / paint(el) / pic(el) / file(el) / link(el)
   */
  function create(root, o) {
    let composing = false;
    let alive = true;
    const dirty = new Set();
    let rootDirty = false;
    root.setAttribute("contenteditable", "true");
    root.setAttribute("role", "textbox");
    root.setAttribute("aria-multiline", "true");
    root.setAttribute("spellcheck", "false");
    /* 済みのチェックの印（Phosphor の check）。:root でなく欄に（docs/traps.md）。 */
    const ck = KN.icons && KN.icons.get && KN.icons.get("check");
    if (ck) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ck.viewBox || KN.icons.DEFAULT_BOX}">${ck.body}</svg>`;
      root.style.setProperty("--lv-check", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    }

    const lineOf = (n) => {
      let x = n;
      while (x && x.parentNode !== root) x = x.parentNode;
      return x;
    };
    const known = (c) => c.nodeType === 1 && c._md != null;
    const mdLen = (c) => (known(c) && !dirty.has(c) ? c._md.length : linesOf(c).join("\n").length);
    const md = () => [...root.childNodes].flatMap((c) => (known(c) && !dirty.has(c) ? [c._md] : linesOf(c))).join("\n");
    /** 並びの中の点の、本文の位置。 */
    function absOf(node, off) {
      if (node === root) {
        let k = 0;
        let i = 0;
        for (let c = root.firstChild; c && i < off; c = c.nextSibling, i++) k += mdLen(c) + 1;
        return Math.max(0, Math.min(k, md().length));
      }
      const line = lineOf(node);
      if (!line) return 0;
      let k = 0;
      for (let c = root.firstChild; c && c !== line; c = c.nextSibling) k += mdLen(c) + 1;
      return k + (line.nodeType === 3 ? off : isTable(line) ? locateCell(line, node, off) : known(line) ? locate(line, node, off) : 0);
    }
    /** 選んでいる範囲（本文の位置）。欄の外なら null。 */
    function sel() {
      const ws = window.getSelection();
      if (!ws || !ws.rangeCount) return null;
      const r = ws.getRangeAt(0);
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
      const a = absOf(r.startContainer, r.startOffset);
      const b = r.collapsed ? a : absOf(r.endContainer, r.endOffset);
      return [Math.min(a, b), Math.max(a, b)];
    }
    const lineAt = (abs) => {
      let k = abs;
      for (let c = root.firstChild; c; c = c.nextSibling) {
        const len = mdLen(c);
        if (k <= len) return { el: c, k };
        k -= len + 1;
      }
      const c = root.lastChild;
      return c ? { el: c, k: mdLen(c) } : null;
    };
    const editable = (c) => c && c.nodeType === 1 && !c._fixed && c.className !== "nv-orig";
    function pointOf(abs) {
      const at = lineAt(abs);
      if (!at) return { node: root, off: 0 };
      if (at.el.nodeType === 3) return { node: at.el, off: Math.min(at.k, at.el.data.length) };
      if (isTable(at.el)) { const p = cellPoint(at.el, at.k); if (p) return p; }
      if (!editable(at.el)) {
        for (let c = at.el.nextSibling; c; c = c.nextSibling) if (editable(c)) return pointAt(c, 0);
        for (let c = at.el.previousSibling; c; c = c.previousSibling) if (editable(c)) return pointAt(c, Infinity);
        return { node: root, off: [...root.childNodes].indexOf(at.el) + 1 };
      }
      return pointAt(at.el, at.k);
    }
    /** 本文の s〜e を選ぶ。表の中ならそのマスへ（マスをまたぐ選びは頭のマスの中だけ）。 */
    function place(s, e) {
      const a = pointOf(s);
      let b = e == null || e === s ? a : pointOf(e);
      const ca = cellOf(a.node);
      if (cellOf(b.node) !== ca) b = ca ? a : b;
      if (ca && cellOf(b.node) !== ca) b = a;
      /* マスは別の打つ欄：カーソルの居る欄へ寄せる（欄の外に居るときは寄せない）。 */
      const act = document.activeElement;
      const host = ca || root;
      if (act !== host && (act === root || root.contains(act))) host.focus({ preventScroll: true });
      const ws = window.getSelection();
      if (ws) ws.setBaseAndExtent(a.node, a.off, b.node, b.off);
      mo.takeRecords();
    }
    /** 行の頭の本文の位置。 */
    const startOf = (el) => {
      let k = 0;
      for (let c = root.firstChild; c && c !== el; c = c.nextSibling) k += mdLen(c) + 1;
      return k;
    };

    /** 本文を並べる。前と同じ塊の要素は使い回す（頭と尻の同じところ）。sel があれば選ぶ。 */
    function set(v, s) {
      const bl = blocks(v);
      const kids = [...root.childNodes];
      let a = 0;
      while (a < bl.length && a < kids.length && known(kids[a]) && !dirty.has(kids[a]) && kids[a]._md === bl[a].md) a++;
      let b = 0;
      while (b < bl.length - a && b < kids.length - a) {
        const c = kids[kids.length - 1 - b];
        if (!known(c) || dirty.has(c) || c._md !== bl[bl.length - 1 - b].md) break;
        b++;
      }
      /* 画像の原本は上の行で姿が変わるので、変わった所の下の一行も作り直す。 */
      if (b > 0 && (a < bl.length - b || a < kids.length - b)) b--;
      const tail = kids[kids.length - b] || null;
      kids.slice(a, kids.length - b).forEach((c) => c.remove());
      const made = [];
      for (let i = a; i < bl.length - b; i++) {
        const el = make(bl[i]);
        root.insertBefore(el, tail);
        made.push(el);
      }
      dirty.clear();
      rootDirty = false;
      mo.takeRecords();
      made.forEach((el) => {
        paint(el);
        const up = el.previousSibling;
        if (el.className === "nv-orig" && up && up.className === "nv-img") { up.dataset.orig = el.dataset.file; up.dataset.origName = el.dataset.name; }
      });
      if (s) place(s[0], s[1]);
    }
    /** はじめて並べる（書く欄に入るとき）。往復して一字も違えば false（呼ぶ側が印で開く）。 */
    function load(v) {
      root.textContent = "";
      set(v);
      return [...root.childNodes].flatMap(linesOf).join("\n") === String(v);
    }
    const paint = (el) => { if (el.classList && el.classList.contains("nv-img") && o.paint) o.paint(el); };

    /* ---- 打ったあと：触った行を写し、姿が違えば作り直す ---- */
    const mo = new MutationObserver((recs) => collect(recs));
    function collect(recs) {
      recs.forEach((r) => {
        if (r.target === root) { rootDirty = true; return; }
        const l = lineOf(r.target);
        if (l) dirty.add(l);
      });
    }
    mo.observe(root, { childList: true, characterData: true, subtree: true });

    /** 一行を読み直して作り直す。行頭の「[] 」はチェックに（打った直後だけ）。 */
    function canon(el, s) {
      if (!el.isConnected || el.parentNode !== root || !known(el) || el._fixed) return;
      let v = el._md;
      const at = startOf(el);
      const here = s && s[0] >= at && s[1] <= at + v.length ? [s[0] - at, s[1] - at] : null;
      let shift = 0;
      const m = BOX.exec(v);
      if (m && here && here[0] === m[0].length && F().parse(v).kind !== "task") {
        const to = `${m[1]}${m[2] || "-"} [ ] `;
        v = to + v.slice(m[0].length);
        shift = to.length - m[0].length;
      }
      const prev = el.previousSibling && known(el.previousSibling) ? lastLine(el.previousSibling._md) : null;
      const fresh = build(v, prev);
      if (!shift && sig(fresh) === sig(el)) {
        if (looks(fresh) !== looks(el)) dressLike(el, fresh);
        return;
      }
      el.replaceWith(fresh);
      paint(fresh);
      if (!here) return;
      if (fresh._fixed) {
        /* 「---」で線になったら、下に空の行を置いてそこへ。 */
        const nx = fresh.nextSibling;
        const blankNext = nx && known(nx) && nx._md === "";
        if (!blankNext) fresh.after(build("", v));
        place(at + v.length + 1);
        return;
      }
      place(at + here[0] + shift, at + here[1] + shift);
    }
    /** 並びがブラウザの手で崩れたら（知らない要素・字）、写して並べ直す。 */
    function heal(s) {
      const v = md();
      root.textContent = "";
      set(v, s ? [Math.min(s[0], v.length), Math.min(s[1], v.length)] : null);
    }
    function flush(final) {
      collect(mo.takeRecords());
      const s = final ? sel() : null;
      dirty.forEach((el) => {
        if (el.parentNode !== root || !known(el)) return;
        if (isTable(el)) { if (!cellsInto(el)) rootDirty = true; } else if (!el._fixed) el._md = lineMd(el);
      });
      if (!final) return;
      const lines = [...dirty];
      dirty.clear();
      if (rootDirty || [...root.childNodes].some((c) => !known(c))) { rootDirty = false; heal(s); return; }
      lines.forEach((el) => canon(el, sel() || s));
      mo.takeRecords();
    }

    /* ---- 行をまたぐものだけ、自分で ---- */
    const run = (e, r, kind) => {
      e.preventDefault();
      if (r) o.apply(r, kind);
    };
    root.addEventListener("beforeinput", (e) => {
      const t = e.inputType || "";
      if (composing || e.isComposing || t === "insertCompositionText") { o.note("type"); return; }
      if (t === "historyUndo") { e.preventDefault(); o.undo(); return; }
      if (t === "historyRedo") { e.preventDefault(); o.redo(); return; }
      if (t.startsWith("format")) { e.preventDefault(); if (t === "formatBold" && o.bold) o.bold(); return; }
      if (t === "insertFromDrop" || t === "deleteByDrag") { e.preventDefault(); return; }
      flush(true);
      /* マスの中：改行はマスの中の改行、ほかはブラウザに任せる（マスの外へは出ない）。 */
      const cell = cellOf(e.target);
      if (cell) {
        if (t === "insertParagraph" || t === "insertLineBreak") {
          e.preventDefault();
          o.note("br");
          putIn(cell, "\n");
          return;
        }
        o.note(t.startsWith("delete") ? "del" : "type");
        return;
      }
      const r = sel();
      if (!r) return;
      const [s, en] = r;
      const v = md();
      if (t === "insertParagraph" || t === "insertLineBreak") { run(e, enter(v, s, en), "br"); return; }
      const data = t.startsWith("insert") ? (e.data != null ? e.data : (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "") : "";
      const cross = v.slice(s, en).includes("\n");
      if (cross || data.includes("\n")) {
        if (!t.startsWith("insert") && !t.startsWith("delete")) return;
        const text = data.replace(/\r\n?/g, "\n");
        run(e, { from: s, to: en, text, s: s + text.length, e: s + text.length }, t.startsWith("delete") ? "del" : "type");
        return;
      }
      /* 畳んだ表のすぐ下の頭で ⌫・すぐ上の終わりで Delete：空の行なら消す、でなければ表を開くだけ（行を表へつながない）。 */
      const near = s === en && t.startsWith("delete") && lineAt(s);
      if (near && near.el.nodeType === 1 && !near.el._fixed) {
        const len = mdLen(near.el);
        const up = t.endsWith("Backward") && near.k === 0 && isTable(near.el.previousSibling);
        const down = t.endsWith("Forward") && near.k === len && isTable(near.el.nextSibling);
        if (up || down) {
          e.preventDefault();
          if (len) { place(up ? s - 1 : s + 1); return; }
          o.apply(up ? { from: s - 1, to: s, text: "", s: s - 1, e: s - 1 } : { from: s, to: s + 1, text: "", s, e: s }, "del");
          return;
        }
      }
      if (s === en && t.startsWith("delete") && t.endsWith("Backward")) {
        const b = back(v, s);
        if (b) { run(e, b, "del"); return; }
      }
      if (s === en && t.startsWith("delete") && t.endsWith("Forward")) {
        const b = forward(v, s);
        if (b) { run(e, b, "del"); return; }
      }
      o.note(t.startsWith("delete") ? "del" : "type");
    });
    root.addEventListener("input", (e) => {
      flush(!composing && !e.isComposing);
      o.input();
    });
    root.addEventListener("compositionstart", () => { composing = true; });
    root.addEventListener("compositionend", () => {
      composing = false;
      /* 確かめは変換が決まりきってから（Safari は compositionend のあとに input が来る）。 */
      setTimeout(() => {
        if (!alive || composing) return;
        flush(true);
        o.input();
      }, 0);
    });
    /** マスの中のカーソルに字を置く（改行・貼り付け）。終わりの改行は次の行が見えるよう詰め物の <br> を後ろに。 */
    function putIn(cell, text) {
      const ws = window.getSelection();
      if (!ws || !ws.rangeCount) return;
      const r = ws.getRangeAt(0);
      if (!cell.contains(r.startContainer)) return;
      r.deleteContents();
      const n = document.createTextNode(text);
      r.insertNode(n);
      cell.querySelectorAll("br").forEach((x) => x.remove());
      const all = inl(cell);
      if (!all || all.endsWith("\n")) cell.append(document.createElement("br"));
      ws.setBaseAndExtent(n, n.data.length, n, n.data.length);
      flush(true);
      o.input();
    }
    root.addEventListener("paste", (e) => {
      const d = e.clipboardData;
      if (!d) return;
      e.preventDefault();
      const text = (d.getData("text/plain") || "").replace(/\r\n?/g, "\n");
      const cell = cellOf(e.target);
      if (cell) { if (text) { o.note("paste"); putIn(cell, text); } return; }
      flush(true);
      const r = sel();
      if (!text || !r) return;
      o.apply({ from: r[0], to: r[1], text, s: r[0] + text.length, e: r[0] + text.length }, "paste");
    });
    root.addEventListener("keydown", (e) => {
      if (e.isComposing || composing) return;
      /* ⌘Z・Ctrl+Z は自前の取り消す（ブラウザの控えは、作り直した行で途切れていて当てにならない。
         Chromium は控えが空だと historyUndo を出さない）。 */
      const key = (e.key || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (key === "z" || key === "y")) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) o.redo(); else o.undo();
        return;
      }
      /* パソコンの Tab：箇条・番号・チェックの段を下げる（Shift で上げる）。マスの中なら次（前）のマスへ。 */
      if (e.key !== "Tab" || e.altKey || e.metaKey || e.ctrlKey) return;
      const cell = cellOf(e.target);
      if (cell) {
        e.preventDefault();
        const all = [...root.querySelectorAll(".lv-cell")];
        const to = all[all.indexOf(cell) + (e.shiftKey ? -1 : 1)];
        if (!to) return;
        to.focus({ preventScroll: true });
        const p = pointAt(to, Infinity);
        window.getSelection().setBaseAndExtent(p.node, p.off, p.node, p.off);
        mo.takeRecords();
        return;
      }
      const r = sel();
      if (!r) return;
      const v = md();
      if (!LISTS.includes(F().kindAt(v, r[0]))) return;
      e.preventDefault();
      o.apply(F().shift(v, r[0], r[1], e.shiftKey ? -1 : 1), "tool");
    });
    root.addEventListener("click", (e) => {
      /* 表：マスの字の上はブラウザがカーソルを置く。マスの余白・枠なら、そのマスの終わりへ。中のリンクは開かない。 */
      const tbl = e.target.closest(".nv-table");
      if (tbl && tbl.parentNode === root && isTable(tbl)) {
        const a = e.target.closest(".nv-link");
        if (a && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (o.link) o.link(a); return; }
        if (cellOf(e.target)) return;
        e.preventDefault();
        const td = e.target.closest("[data-at]");
        place(startOf(tbl) + (td && tbl.contains(td) ? td._b : tbl._md.length));
        return;
      }
      const pic = e.target.closest(".nv-img.is-on");
      if (pic) { if (o.pic) o.pic(pic); return; }
      const doc = e.target.closest(".nv-file");
      if (doc) { if (o.file) o.file(doc); return; }
      const ln = e.target.closest(".nv-li.is-task");
      if (ln && ln.parentNode === root) {
        const t = ln.querySelector(".nv-t");
        const fs = parseFloat(getComputedStyle(ln).fontSize) || 16;
        if (t && e.clientX < t.getBoundingClientRect().left && e.clientX > t.getBoundingClientRect().left - fs * 2.2) {
          e.preventDefault();
          if (o.tick) o.tick(startOf(ln));
          return;
        }
      }
      const a = e.target.closest(".nv-link");
      if (a && (e.metaKey || e.ctrlKey)) { if (o.link) o.link(a); return; }
      if (e.target === root && o.tail) {
        const last = root.lastElementChild;
        if (!last || e.clientY > last.getBoundingClientRect().bottom) o.tail();
      }
    });

    /** カーソルの上下（画面の位置）。字の箱が取れなければ、その行の箱。 */
    function caretRect() {
      const ws = window.getSelection();
      if (!ws || !ws.rangeCount || !root.contains(ws.focusNode)) return null;
      const r = document.createRange();
      r.setStart(ws.focusNode, ws.focusOffset);
      const box = [...r.getClientRects()].find((x) => x.height) || null;
      const lh = parseFloat(getComputedStyle(root).lineHeight) || 28;
      if (box) return { top: box.top, bottom: box.bottom, lh: box.height };
      const n = ws.focusNode.nodeType === 3 ? ws.focusNode.parentNode : ws.focusNode;
      const el = (n === root ? root.childNodes[ws.focusOffset] || root.lastChild : lineOf(n)) || root;
      const b = (el.nodeType === 1 ? el : root).getBoundingClientRect();
      return { top: b.top, bottom: b.top + Math.max(lh, b.height), lh };
    }
    /** 本文の位置 at の行の要素（画面の高さを揃えるため）。 */
    const lineEl = (at) => { const x = lineAt(at); return x && x.el.nodeType === 1 ? x.el : null; };

    return {
      el: root,
      load, set, md, sel, place, caretRect, lineEl, startOf,
      composing: () => composing,
      /** カーソルが表のマスの中か（行の形を変える道具は効かない）。 */
      inCell() { const ws = window.getSelection(); return !!(ws && ws.rangeCount && root.contains(ws.focusNode) && cellOf(ws.focusNode)); },
      /** カーソルが太字の中の終わりに居れば、太字の外へ出す（B を押したとき）。出したら true。 */
      leave() {
        const ws = window.getSelection();
        if (!ws || !ws.rangeCount || !ws.isCollapsed) return false;
        const n = ws.focusNode;
        const off = ws.focusOffset;
        const mark = n && (n.nodeType === 1 ? n : n.parentNode).closest && (n.nodeType === 1 ? n : n.parentNode).closest(".nv-b");
        if (!mark || !root.contains(mark)) return false;
        const r = document.createRange();
        r.selectNodeContents(mark);
        r.setStart(n, off);
        if (r.toString().length) return false;
        const g = document.createElement("span");
        g.className = "lv-gap";
        g.textContent = ZW;
        mark.after(g);
        ws.setBaseAndExtent(g.firstChild, 1, g.firstChild, 1);
        mo.takeRecords();
        return true;
      },
      destroy() { alive = false; mo.disconnect(); },
    };
  }

  KN.noteLive = { create, fits, enter, back, forward };
})();
