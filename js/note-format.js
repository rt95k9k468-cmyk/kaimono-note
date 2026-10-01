/* =========================================================
   くらしノート — ノートの装飾（段4）

   本文は素の文字のまま持ちます（docs/notes.md の「本文は素の文字」）。
   装飾は行頭の印だけ：「# 」「- 」「1. 」「- [ ] 」「- [x] 」「> 」「---」。
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
    return p.kind === "rule" || p.kind === "blank" ? "" : p.text.trim();
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
        t.textContent = p.text || " ";
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
            mark.setAttribute("aria-label", p.text || "チェック");
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

  KN.noteFormat = { parse, plain, render, toggleTask, setKind, rule, shift, onEnter, kindAt, history };
})();
