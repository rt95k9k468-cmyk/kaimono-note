/* =========================================================
   くらしノート — ノートの装飾（段4）

   本文は素の文字のまま持ちます（docs/notes.md の「本文は素の文字」）。
   装飾は行頭の印「# 」「- 」「1. 」「- [ ] 」「- [x] 」「> 」「---」と、行の中の
   太字「**…**」（2026年10月7日、利用者「太字がないのも困る」）。
   ここにあるのは、その印を**読むときに整える**ことと、**書くときに印を
   打つ**手伝い（道具の帯・改行の続き・やり直し）だけで、保存の形には
   何も足しません。

   画面（screen-notes.js）からは KN.noteFormat として借ります。DOM に
   触るのは render() だけで、ほかは文字列を受けて文字列を返します
   ——試験が中身を直に確かめられるように。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* 行の形。印の判定は上から順に（区切りは箇条書きより先に見る——「---」は
     「- 」で始まらないが、「* * *」のような形を箇条書きに取られないため）。 */
  const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const HEAD = /^(#{1,3}) (.*)$/;
  const TASK = /^(\s*)([-*]) \[( |x|X)\](?: (.*))?$/;
  const BULLET = /^(\s*)([-*]) (.*)$/;
  const NUM = /^(\s*)(\d{1,9})\. (.*)$/;
  const QUOTE = /^> ?(.*)$/;
  /* 太字。「**」のすぐ内側は空白でない（「2 ** 3 ** 4」を拾わない）。行をまたがない。 */
  const BOLD = /\*\*(\S(?:[^\n]*?\S)?)\*\*/g;

  /** 行の中の太字の場所（a〜b は「**」込み）。 */
  function boldSpans(line) {
    const out = [];
    let m;
    BOLD.lastIndex = 0;
    while ((m = BOLD.exec(line))) out.push({ a: m.index, b: m.index + m[0].length });
    return out;
  }
  /** 太字の印を外した字。 */
  const unbold = (t) => String(t).replace(BOLD, "$1");

  /** 字下げの段（空白2つ、またはタブ1つで一段）。 */
  const levelOf = (sp) => Math.min(6, Math.floor(sp.replace(/\t/g, "  ").length / 2));

  /**
   * 一行を読む。返すのは
   * { kind, text, lead }：kind は head / task / bullet / num / quote / rule /
   * blank / para、text は印を除いた中身、lead は印までの長さ（字下げ込み）。
   */
  function parse(line) {
    let m;
    if (!line.trim()) return { kind: "blank", text: "", lead: line.length };
    if (RULE.test(line)) return { kind: "rule", text: "", lead: line.length };
    if ((m = HEAD.exec(line))) return { kind: "head", level: m[1].length, text: m[2], lead: m[1].length + 1 };
    if ((m = TASK.exec(line))) {
      const text = m[4] || "";
      return {
        kind: "task", indent: m[1], level: levelOf(m[1]), mark: m[2],
        done: m[3] !== " ", text, lead: line.length - text.length,
      };
    }
    if ((m = BULLET.exec(line))) return { kind: "bullet", indent: m[1], level: levelOf(m[1]), mark: m[2], text: m[3], lead: m[1].length + 2 };
    if ((m = NUM.exec(line))) return { kind: "num", indent: m[1], level: levelOf(m[1]), n: Number(m[2]), text: m[3], lead: m[1].length + m[2].length + 2 };
    if ((m = QUOTE.exec(line))) return { kind: "quote", text: m[1], lead: line.length - m[1].length };
    return { kind: "para", text: line, lead: 0 };
  }

  /** 印を除いた一行（一覧の冒頭・題の代わり）。区切りと空の行は "" 。 */
  function plain(line) {
    const p = parse(String(line || ""));
    return p.kind === "rule" || p.kind === "blank" ? "" : unbold(p.text).trim();
  }

  /** 見出し（`# ` `## ` `### `）の並び。line は render の data-line と同じ数え方。保存の形は読むだけ。 */
  function headings(body) {
    const out = [];
    String(body || "").split("\n").forEach((l, line) => {
      const p = parse(l);
      if (p.kind === "head" && p.text.trim()) out.push({ line, level: p.level, text: unbold(p.text).trim() });
    });
    return out;
  }

  /* ---------------- 読むときに整える ---------------- */

  /**
   * 本文を、整えた要素の並びにします。一行が一つの塊で、それぞれ
   * data-at（本文の中で行が始まる位置）と data-end（行の終わり）を持ちます
   * ——押した行にカーソルを入れるため。字は textContent で入れます
   * （本文に何が書いてあっても、要素にはならない）。
   */
  function render(body, box) {
    box.textContent = "";
    const lines = String(body || "").split("\n");
    let at = 0;
    lines.forEach((line, i) => {
      const p = parse(line);
      let el;
      if (p.kind === "rule") {
        el = document.createElement("div");
        el.className = "nv-hr";
        el.append(document.createElement("hr"));
      } else if (p.kind === "blank") {
        el = document.createElement("div");
        el.className = "nv-blank";
      } else {
        el = document.createElement("div");
        const t = document.createElement("span");
        t.className = "nv-t";
        /* 中身の無い項目も、高さを持たせます（押せる行のまま）。 */
        fill(t, p.text || " ");
        if (p.kind === "head") el.className = `nv-h nv-h${p.level}`;
        else if (p.kind === "quote") el.className = "nv-q";
        else if (p.kind === "para") el.className = "nv-p";
        else {
          el.className = `nv-li is-${p.kind}${p.done ? " is-done" : ""}`;
          el.style.setProperty("--lv", String(p.level));
          let mark;
          if (p.kind === "task") {
            mark = document.createElement("button");
            mark.type = "button";
            mark.className = "nv-box js-tick";
            mark.setAttribute("role", "checkbox");
            mark.setAttribute("aria-checked", String(!!p.done));
            mark.setAttribute("aria-label", unbold(p.text) || "チェック");
            if (p.done) mark.innerHTML = KN.icons ? KN.icons.svg("check") : "";
          } else {
            mark = document.createElement("span");
            mark.className = p.kind === "num" ? "nv-n" : "nv-dot";
            if (p.kind === "num") mark.textContent = `${p.n}.`;
          }
          el.append(mark);
        }
        el.append(t);
      }
      el.dataset.at = String(at);
      el.dataset.end = String(at + line.length);
      el.dataset.line = String(i);
      box.append(el);
      at += line.length + 1;
    });
    return box;
  }

  /** 一行の中身を入れる。太字は <strong>、字はどれも textContent。 */
  function fill(el, text) {
    let at = 0;
    boldSpans(text).forEach(({ a, b }) => {
      if (a > at) el.append(text.slice(at, a));
      const st = document.createElement("strong");
      st.className = "nv-b";
      st.textContent = text.slice(a + 2, b - 2);
      el.append(st);
      at = b;
    });
    if (at < text.length) el.append(text.slice(at));
  }

  /** at で始まる行のチェックを付け外しした本文。チェックの行でなければ同じもの。 */
  function toggleTask(body, at) {
    const end = body.indexOf("\n", at);
    const line = body.slice(at, end < 0 ? body.length : end);
    const p = parse(line);
    if (p.kind !== "task") return body;
    const i = line.indexOf("[");
    const next = `${line.slice(0, i)}[${p.done ? " " : "x"}]${line.slice(i + 3)}`;
    return body.slice(0, at) + next + body.slice(at + line.length);
  }

  /* ---------------- 書くときの手伝い ----------------

     どれも「本文と選んでいる範囲」を受けて、置き換えを一つ返します：
     { from, to, text, s, e }——本文の from〜to を text に差し替えて、
     選ぶ範囲を s〜e にする。差し替えは画面の側でします（やり直しの控えを
     取ってから）。 */

  const lineStart = (v, i) => v.lastIndexOf("\n", i - 1) + 1;
  const lineEnd = (v, i) => { const e = v.indexOf("\n", i); return e < 0 ? v.length : e; };

  /** 印を外した一行（字下げは残す。見出しと引用は字下げを持たない）。 */
  function bare(line) {
    const p = parse(line);
    if (p.kind === "head" || p.kind === "quote") return p.text;
    if (p.kind === "task" || p.kind === "bullet" || p.kind === "num") return p.indent + p.text;
    return line;
  }
  const indentOf = (line) => /^\s*/.exec(line)[0];
  const markFor = (kind, i) => ({
    head: "# ", bullet: "- ", num: `${i + 1}. `, task: "- [ ] ", quote: "> ",
  })[kind];

  /**
   * 道具の帯の「見出し・箇条書き・番号・チェック・引用」。選んでいる行
   * （カーソルの行）ぜんぶに、その印を付けます。ぜんぶがもうその印なら
   * 外します（押すたびに付け外し）。ほかの印が付いていたら、付け替えます。
   */
  function setKind(v, s, e, kind) {
    const from = lineStart(v, s);
    const to = lineEnd(v, Math.max(s, e - (e > s && v[e - 1] === "\n" ? 1 : 0)));
    const lines = v.slice(from, to).split("\n");
    const many = lines.length > 1;
    const has = (l) => parse(l).kind === kind;
    const off = lines.filter((l) => !many || l.trim()).every(has);
    let k = 0;
    const out = lines.map((l) => {
      if (many && !l.trim()) return l;
      const b = bare(l);
      if (off) return b;
      const ind = kind === "head" || kind === "quote" ? "" : indentOf(b);
      return ind + markFor(kind, k++) + b.slice(ind.length);
    });
    const text = out.join("\n");
    if (many) return { from, to, text, s: from, e: from + text.length };
    /* 一行なら、カーソルは中身の同じ場所に留めます（印のぶんだけ動かす）。 */
    const leadOf = (l) => { const p = parse(l); return p.kind === "para" ? 0 : p.lead; };
    const inText = Math.max(0, s - from - leadOf(lines[0]));
    const c = from + Math.min(text.length, leadOf(text) + inText);
    return { from, to, text, s: c, e: c };
  }

  /** 区切り（---）。空の行ならその行に、そうでなければ行の下に置きます。 */
  function rule(v, s) {
    const from = lineStart(v, s);
    const to = lineEnd(v, s);
    const empty = !v.slice(from, to).trim();
    const text = empty ? "---\n" : `${v.slice(from, to)}\n---\n`;
    const tail = v.slice(to);
    /* 下にもう行があるなら、その行の頭の改行を一つ借ります（空の行が増えないように）。 */
    const eat = tail.startsWith("\n") ? 1 : 0;
    const c = from + text.length;
    return { from, to: to + eat, text, s: c, e: c };
  }

  /** 一段下げる／上げる（選んでいる行ぜんぶ。空白2つで一段）。 */
  function shift(v, s, e, dir) {
    const from = lineStart(v, s);
    const to = lineEnd(v, Math.max(s, e - (e > s && v[e - 1] === "\n" ? 1 : 0)));
    const lines = v.slice(from, to).split("\n");
    let moved0 = 0;
    const out = lines.map((l, i) => {
      if (!l.trim()) return l;
      if (dir > 0) { if (i === 0) moved0 = 2; return `  ${l}`; }
      const cut = l.startsWith("\t") ? 1 : Math.min(2, indentOf(l).length);
      if (i === 0) moved0 = -cut;
      return l.slice(cut);
    });
    const text = out.join("\n");
    if (lines.length > 1) return { from, to, text, s: from, e: from + text.length };
    const c = Math.max(from, s + moved0);
    return { from, to, text, s: c, e: c };
  }

  /**
   * 太字（道具の帯の B）。選んでいる字を「**」で挟みます。もう太字なら外す。
   * 何も選んでいなければ、カーソルの居る太字を外すか、「****」を置いて
   * その間にカーソル。行をまたいで選んでいたら、行ごとに挟みます（太字は
   * 行をまたがない）。行頭の印と、端の空白は挟みません。
   */
  function bold(v, s, e) {
    const from = lineStart(v, s);
    if (s === e) {
      const line = v.slice(from, lineEnd(v, s));
      const at = s - from;
      const m = boldSpans(line).find((x) => at > x.a && at < x.b);
      if (!m) return { from: s, to: s, text: "****", s: s + 2, e: s + 2 };
      const text = line.slice(0, m.a) + line.slice(m.a + 2, m.b - 2) + line.slice(m.b);
      const c = from + Math.min(Math.max(at - 2, m.a), m.b - 4);
      return { from, to: from + line.length, text, s: c, e: c };
    }
    const to = lineEnd(v, Math.max(s, e - (v[e - 1] === "\n" ? 1 : 0)));
    let ls = from;
    const segs = v.slice(from, to).split("\n").map((line) => {
      const p = parse(line);
      const lead = p.kind === "para" || p.kind === "blank" ? 0 : p.lead;
      let a = Math.max(s, ls + lead) - ls;
      let b = Math.min(e, ls + line.length) - ls;
      while (a < b && /\s/.test(line[a])) a++;
      while (b > a && /\s/.test(line[b - 1])) b--;
      ls += line.length + 1;
      return { line, a, b, live: b > a && p.kind !== "rule" };
    });
    if (!segs.some((g) => g.live)) return null;
    const wrapped = (g) => { const t = g.line.slice(g.a, g.b); return t.length >= 4 && /^\*\*[\s\S]*\*\*$/.test(t); };
    const hugged = (g) => g.a >= 2 && g.line.slice(g.a - 2, g.a) === "**" && g.line.slice(g.b, g.b + 2) === "**";
    const off = segs.filter((g) => g.live).every((g) => wrapped(g) || hugged(g));
    let pos = from;
    let s2 = null;
    let e2 = null;
    const out = segs.map((g) => {
      let line = g.line;
      if (g.live) {
        const t = line.slice(g.a, g.b);
        let a2;
        let b2;
        if (off && wrapped(g)) { line = line.slice(0, g.a) + t.slice(2, -2) + line.slice(g.b); a2 = g.a; b2 = g.b - 4; }
        else if (off) { line = line.slice(0, g.a - 2) + t + line.slice(g.b + 2); a2 = g.a - 2; b2 = g.b - 2; }
        else if (hugged(g) || wrapped(g)) { a2 = g.a; b2 = g.b; }
        else {
          const inner = unbold(t);
          line = `${line.slice(0, g.a)}**${inner}**${line.slice(g.b)}`;
          a2 = g.a + 2; b2 = g.a + 2 + inner.length;
        }
        if (s2 == null) s2 = pos + a2;
        e2 = pos + b2;
      }
      pos += line.length + 1;
      return line;
    });
    return { from, to, text: out.join("\n"), s: s2, e: e2 };
  }

  /** カーソルが太字の中に居るか（道具の帯の B を光らせるため）。 */
  function boldAt(v, s) {
    const from = lineStart(v, s);
    const at = s - from;
    return boldSpans(v.slice(from, lineEnd(v, s))).some((x) => at > x.a && at < x.b);
  }

  /**
   * 改行の続き。箇条書き・番号・チェック・引用の行で改行したら、次の行にも
   * 同じ印を付けます（番号は一つ進める）。中身の無い項目で改行したら、
   * 印を外して終わります（Apple のメモと同じ）。何もしないときは null
   * ——そのときは素の改行に任せます。
   */
  function onEnter(v, s, e) {
    if (s !== e) return null;
    const from = lineStart(v, s);
    const to = lineEnd(v, s);
    const line = v.slice(from, to);
    const p = parse(line);
    if (!["bullet", "num", "task", "quote"].includes(p.kind)) return null;
    /* 印の途中（字下げや「- 」の前）で押したときは、素の改行。 */
    if (s - from < p.lead) return null;
    if (!p.text.trim() && s === to) {
      /* 段のある空の項目は、まず一段上げます。いちばん上なら、印を外す。 */
      if (p.level > 0) {
        const r = shift(v, s, s, -1);
        return r;
      }
      return { from, to, text: "", s: from, e: from };
    }
    const ind = p.indent || "";
    const mark = p.kind === "quote" ? "> "
      : p.kind === "task" ? `${p.mark} [ ] `
        : p.kind === "num" ? `${p.n + 1}. ` : `${p.mark} `;
    const text = `\n${ind}${mark}`;
    const c = s + text.length;
    return { from: s, to: s, text, s: c, e: c };
  }

  /**
   * いまの行の形（道具の帯で、押されている印を光らせるため）。
   */
  function kindAt(v, s) {
    return parse(v.slice(lineStart(v, s), lineEnd(v, s))).kind;
  }

  /* ---------------- やり直し ----------------

     控えは書く紙を開いているあいだだけの記憶です（前の版とは別もの——
     あちらは端末に残る守り、こちらは打ち間違いを戻す手）。打つ字は
     1秒の切れ目でまとめ、改行・道具の帯・チェックは一手ずつ。 */
  function history(get, set, limit = 200) {
    const past = [];
    const future = [];
    let last = 0;
    let lastKind = "";
    return {
      /** 変える前に呼ぶ。kind が同じで間が空いていなければ、一手にまとめる。 */
      note(kind, force) {
        const now = Date.now();
        const cur = get();
        const top = past[past.length - 1];
        if (!force && kind === lastKind && now - last < 1000) { last = now; return; }
        last = now;
        lastKind = kind;
        future.length = 0;
        if (top && top.v === cur.v) return;
        past.push(cur);
        if (past.length > limit) past.shift();
      },
      undo() {
        if (!past.length) return false;
        future.push(get());
        set(past.pop());
        lastKind = "";
        return true;
      },
      redo() {
        if (!future.length) return false;
        past.push(get());
        set(future.pop());
        lastKind = "";
        return true;
      },
      can() { return { undo: past.length > 0, redo: future.length > 0 }; },
    };
  }

  KN.noteFormat = { parse, plain, unbold, headings, render, toggleTask, setKind, bold, boldAt, rule, shift, onEnter, kindAt, history };
})();
