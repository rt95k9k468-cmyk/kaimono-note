/* =========================================================
   くらしノート — AI とほどく（3.0 の C1。docs/roadmap-3.0.md・docs/todo-items.md の「AI とほどく」）

   **アプリは AI を呼びません。** 文を作り、本人が運び、本人が選んで取り込みます。
   1. 渡す中身を選ぶ（題は必ず。メモ・手順・期限・長さ・いつから・置き直した回数・困っていること）。
      日記・ノート・からだ・買うものは候補にも出さない。下に、できあがる文をそのまま見せる。
   2. 「コピーして開く」：文をクリップボードへ → ChatGPT か Claude を開く（一度選べば覚える）。
   3. AI と何往復か（文が順番を指示する：質問 → 理解の要約 → 確認 → 分ける → 決まった枠で出す）。
   4. 「答えを貼る」→ 枠を読み、候補を並べる。枠が読めなければ、行ごとの候補として出す。
   5. 選んだものだけ取り込む（store.importUnfold。元に戻す一回で全部戻る）。貼った答えは保存しない。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon } = U;

  const AIS = [
    { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "claude", label: "Claude", url: "https://claude.ai/new" },
  ];
  /* 「出さない」を押した用事の id（store の外の鍵。バックアップには乗らない。すすめの札を消すだけ）。 */
  const HUSH_KEY = "kaimono-note-ai-hush";

  const mdJa = (key) => { const d = U.dayDate(key); return d ? `${d.getMonth() + 1}月${d.getDate()}日` : ""; };
  const dayOf = (v) => {
    const s = String(v || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : U.dayKey(d);
  };

  /* ---------------- 渡す中身と文 ---------------- */

  /** 用事から、渡せる欄（値のあるものだけ）。 */
  function fieldsOf(t) {
    const f = [];
    if (t.memo && t.memo.trim()) f.push({ id: "memo", label: "メモ", line: `メモ：${t.memo.trim().replace(/\n+/g, " / ")}` });
    const subs = (t.subs || []).map((x) => x.title).filter(Boolean);
    if (subs.length) f.push({ id: "subs", label: "手順", line: `すでにある手順：${subs.join("、")}` });
    if (t.deadline) f.push({ id: "deadline", label: "期限", line: `期限：${mdJa(t.deadline)}` });
    if (Number(t.minutes) > 0) f.push({ id: "minutes", label: "長さ", line: `見込みの長さ：${KN.plan.humanSpan(Number(t.minutes))}` });
    const since = dayOf(t.createdAt);
    if (since) f.push({ id: "since", label: "いつから", line: `いつから：${mdJa(since)}` });
    const n = (t.slips || []).length;
    if (n) f.push({ id: "slips", label: "置き直した回数", line: `置き直した回数：${n}回` });
    return f;
  }

  /** 相談文（roadmap-3.0 の C1 の見本）。picks は入れる欄の id の Set、trouble は一行。 */
  function prompt(t, picks, trouble) {
    const lines = [`題：${t.title}`];
    fieldsOf(t).forEach((f) => { if (!picks || picks.has(f.id)) lines.push(f.line); });
    const tr = String(trouble || "").trim();
    if (tr) lines.push(`困っていること：${tr}`);
    return [
      "あなたは、大きすぎて進まないタスクを一緒にほどく相手です。いきなり分解しないでください。",
      "",
      "## タスク",
      ...lines,
      "",
      "## 進め方（この順を守ってください）",
      "1. まず質問だけをしてください。一度に3つまで。聞くのは「どうなったら終わりか」「まだ分かっていないこと」",
      "   「使える時間・お金・人などの制約」。私の答えを待ってください。",
      "2. 答えがそろったら、「こういう背景・目的・完了条件だと理解した」を5行以内でまとめ、合っているか",
      "   私に確かめてください。違っていれば私が直します。",
      "3. 私が「それで合っている」と言ってから、初めて分けてください。",
      "4. 分け方の決まり：",
      "   - 一つの手順は、だいたい15〜60分。やり始め方が分かる動詞で書く（「調べる」「考える」だけで終わらせない）",
      "   - 全部で7つまで。細かく刻みすぎない",
      "   - 60分を超えそうなもの、中身がまだあいまいなものは「さらに分ける」に番号を書く",
      "   - 今日やるのは「次の一歩」の1件だけでよい",
      "5. 最後の答えは、下の枠の形だけで出してください（アプリに貼り戻します）。",
      "",
      "<<くらしノート>>",
      "完了条件：…",
      "前提：…",
      "次の一歩：…｜15分",
      "1. …｜30分",
      "2. …｜45分｜1のあと",
      "さらに分ける：2",
      "<</くらしノート>>",
    ].join("\n");
  }

  /* ---------------- 答えを読む ---------------- */

  const half = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  function minutesIn(s) {
    const t = half(s);
    const hm = /(\d+(?:\.\d+)?)\s*時間(?:\s*(\d+)\s*分)?/.exec(t);
    if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] || 0));
    const m = /(\d+)\s*分/.exec(t);
    return m ? Number(m[1]) : null;
  }
  /* 「題｜30分｜1のあと」 */
  function cell(str) {
    const parts = String(str).split(/\s*[｜|]\s*/).map((x) => x.trim()).filter(Boolean);
    let title = parts.shift() || "";
    let minutes = null, after = null;
    parts.forEach((p) => {
      if (minutes == null && /分|時間/.test(p) && minutesIn(p) != null) minutes = minutesIn(p);
      else if (/のあと|の後/.test(p)) { const n = /(\d+)/.exec(half(p)); if (n) after = Number(n[1]); }
    });
    /* 枠を守らず「題（30分）」と書く AI もある */
    if (minutes == null) {
      const m = /[（(]\s*([0-9０-９.]+\s*(?:時間|分)[^）)]*)[）)]\s*$/.exec(title);
      if (m) { minutes = minutesIn(m[1]); title = title.slice(0, m.index).trim(); }
    }
    return { title: title.replace(/^[「『]|[」』]$/g, "").trim(), minutes, after };
  }

  /**
   * 貼った答えを読む。枠（<<くらしノート>>…<</くらしノート>>）があればその中、無ければ行ごとの候補。
   * @returns {{ framed, done, premise, next, steps:[{n,title,minutes,after,split}] }}
   */
  function parse(text) {
    let s = half(String(text || "").replace(/\r/g, "")).replace(/```[^\n]*\n?/g, "");
    const m = /<<\s*くらしノート\s*>>([\s\S]*?)<<\s*\/\s*くらしノート\s*>>/.exec(s);
    const framed = !!m;
    const body = m ? m[1] : s;
    const out = { framed, done: "", premise: "", next: null, steps: [] };
    let more = [];
    const lines = body.split("\n")
      .map((l) => l.replace(/\*\*|__/g, "").replace(/^\s*>\s*/, "").trim())
      .filter(Boolean);
    const loose = [];
    lines.forEach((l) => {
      const b = l.replace(/^[-・*•]\s*/, "");
      let x;
      if ((x = /^完了条件\s*[:：]\s*(.*)$/.exec(b))) out.done = x[1].trim();
      else if ((x = /^前提\s*[:：]\s*(.*)$/.exec(b))) out.premise = x[1].trim();
      else if ((x = /^次の一歩\s*[:：]\s*(.*)$/.exec(b))) out.next = cell(x[1]);
      else if ((x = /^さらに分ける\s*[:：]\s*(.*)$/.exec(b))) more = (x[1].match(/\d+/g) || []).map(Number);
      else if ((x = /^(\d+)\s*[.．、)）]\s*(.+)$/.exec(b))) out.steps.push({ n: Number(x[1]), ...cell(x[2]) });
      else if (!framed && !/^#/.test(b) && !/[:：]\s*$/.test(b)) loose.push(b);
    });
    /* 枠が読めなかったとき：番号の行が無ければ、箇条の行（無ければ全部の行）を候補に。 */
    if (!framed && !out.steps.length) {
      const bullets = lines.filter((l) => /^[-・*•]\s+/.test(l)).map((l) => l.replace(/^[-・*•]\s+/, ""));
      (bullets.length ? bullets : loose).slice(0, 15).forEach((l, i) => out.steps.push({ n: i + 1, ...cell(l) }));
    }
    out.steps = out.steps.filter((x) => x.title && x.title !== "…").slice(0, 20);
    out.steps.forEach((x) => { x.split = more.includes(x.n); });
    if (out.next && (!out.next.title || out.next.title === "…")) out.next = null;
    return out;
  }

  /* ---------------- 紙 ---------------- */

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function open(id) {
    const store = KN.store;
    const t = store.getTodo(id);
    if (!t) return;
    const fields = fieldsOf(t);
    const picks = new Set(fields.map((f) => f.id));
    let trouble = "";
    let ai = store.get().settings.aiChat === "claude" ? "claude" : "chatgpt";
    let parsed = null;
    let pastedBlock = "";

    const body = node(html`
      <div class="stack unfold">
        <div class="unf-sec">
          <h3 class="unf-h">渡す中身</h3>
          <p class="unf-title">${t.title}</p>
          <div class="chip-row unf-picks js-picks"></div>
          <input type="text" class="input js-trouble" placeholder="困っていること（一行）" enterkeyhint="done" autocomplete="off">
          <div class="js-preview"></div>
          <div class="js-ai"></div>
          <button type="button" class="btn btn-primary btn-block js-copy">${icon("copy", "is-sub")}<span>コピーして開く</span></button>
        </div>
        <div class="unf-sec">
          <h3 class="unf-h">答えを貼る</h3>
          <textarea class="textarea js-answer" rows="4" placeholder="AI の答え"></textarea>
          <div class="js-cands"></div>
        </div>
      </div>
    `);
    const pickHost = body.querySelector(".js-picks");
    fields.forEach((f) => {
      const b = node(html`<button type="button" class="chip" aria-pressed="true" data-f="${f.id}">${f.label}</button>`);
      b.addEventListener("click", () => {
        if (picks.has(f.id)) picks.delete(f.id); else picks.add(f.id);
        b.setAttribute("aria-pressed", String(picks.has(f.id)));
        KN.motion.fire("select");
        paintPreview();
      });
      pickHost.append(b);
    });
    if (!fields.length) pickHost.remove();
    const troubleIn = body.querySelector(".js-trouble");
    troubleIn.addEventListener("input", () => { trouble = troubleIn.value; paintPreview(); });
    const previewHost = body.querySelector(".js-preview");
    /* できあがる文は畳んでおく（設定の more() と同じ形）。開いたかは描き直しても保つ。 */
    let previewOpen = false;
    function paintPreview() {
      const was = previewHost.querySelector("details");
      if (was) previewOpen = was.open;
      previewHost.innerHTML = "";
      previewHost.append(node(html`<details class="set-more unf-more" ${previewOpen ? "open" : ""}>
        <summary>文を見る</summary><pre class="unf-prompt">${prompt(t, picks, trouble)}</pre></details>`));
    }
    paintPreview();
    const paintAi = () => KN.ui.chipRow(body.querySelector(".js-ai"), AIS.map((a) => ({ id: a.id, label: a.label })), {
      activeId: ai,
      onPick: (id) => { ai = id; store.update((s) => { s.settings.aiChat = id; }); KN.motion.fire("select"); paintAi(); },
    });
    paintAi();
    body.querySelector(".js-copy").addEventListener("click", () => {
      const text = prompt(t, picks, trouble);
      copy(text).then((ok) => {
        KN.ui.toast(ok ? "コピーしました" : "コピーできませんでした");
        if (!ok) return;
        const a = AIS.find((x) => x.id === ai);
        try { window.open(a.url, "_blank", "noopener"); } catch (_) { /* 開けなくても文は手元にある */ }
      });
    });

    const answerIn = body.querySelector(".js-answer");
    const candHost = body.querySelector(".js-cands");
    /* 貼ったら読む（往復の手数は「貼る1回」。3.0 の F1）。打ち直しても、少し待ってから読み直す。 */
    let readT = 0;
    const readNow = () => {
      const v = String(answerIn.value || "");
      if (!v.trim()) { parsed = null; pastedBlock = ""; paintCands(); return; }
      parsed = parse(v);
      const m = /<<\s*くらしノート\s*>>[\s\S]*?<<\s*\/\s*くらしノート\s*>>/.exec(v);
      pastedBlock = m ? m[0] : "";
      paintCands();
    };
    answerIn.addEventListener("input", () => { clearTimeout(readT); readT = setTimeout(readNow, 250); });

    function paintCands() {
      candHost.innerHTML = "";
      if (!parsed) return;
      const p = parsed;
      if (!p.steps.length && !p.next && !p.done && !p.premise) {
        candHost.append(node(html`<p class="unf-none">読み取れるものがありませんでした</p>`));
        return;
      }
      const span = (m) => (m ? KN.plan.humanSpan(m) : "");
      const box = node(html`
        <div class="unf-cands">
          ${p.done || p.premise ? html`<label class="unf-pick"><input type="checkbox" class="js-memo" checked>
            <span class="unf-pt">メモに残す</span>
            <small class="unf-ps">${[p.done && `完了条件：${p.done}`, p.premise && `前提：${p.premise}`].filter(Boolean).join(" / ")}</small></label>` : ""}
          ${p.next ? html`<div class="unf-next">
            <label class="unf-pick"><input type="checkbox" class="js-next" checked>
              <span class="unf-pt">次の一歩：${p.next.title}</span><small class="unf-ps">${span(p.next.minutes)}</small></label>
            <label class="unf-pick is-sub"><input type="checkbox" class="js-next-today"><span class="unf-pt">今日の道に置く</span></label>
          </div>` : ""}
          ${p.steps.length ? html`<div class="unf-steps">
            ${p.steps.map((x, i) => html`<label class="unf-pick"><input type="checkbox" class="js-step" data-i="${i}" checked>
              <span class="unf-pt">${x.n}. ${x.title}</span>
              <small class="unf-ps">${[span(x.minutes), x.after ? `${x.after}のあと` : "", x.split ? "さらに分ける" : ""].filter(Boolean).join(" · ")}</small></label>`)}
          </div>` : ""}
          <div class="js-dest"></div>
          <button type="button" class="btn btn-primary btn-block js-take">取り込む</button>
          <button type="button" class="btn btn-soft btn-block js-again">${icon("copy", "is-sub")}<span>ほかの AI にも相談する</span></button>
        </div>
      `);
      let dest = "subs";
      const paintDest = () => KN.ui.chipRow(box.querySelector(".js-dest"),
        [{ id: "subs", label: "この用事の手順" }, { id: "todos", label: "別の用事としてこれからへ" }], {
          activeId: dest, onPick: (id) => { dest = id; KN.motion.fire("select"); paintDest(); },
        });
      if (p.steps.length || p.next) paintDest(); else box.querySelector(".js-dest").remove();
      box.querySelector(".js-take").addEventListener("click", () => {
        const steps = [...box.querySelectorAll(".js-step")].filter((c) => c.checked).map((c) => p.steps[Number(c.dataset.i)]);
        const nextOn = !!(p.next && box.querySelector(".js-next") && box.querySelector(".js-next").checked);
        const today = !!(p.next && box.querySelector(".js-next-today") && box.querySelector(".js-next-today").checked);
        const memoOn = !!(box.querySelector(".js-memo") && box.querySelector(".js-memo").checked);
        const label = (x) => (x.minutes ? `${x.title}（${KN.plan.humanSpan(x.minutes)}）` : x.title);
        const list = (nextOn ? [p.next] : []).concat(steps);
        const o = {
          subs: dest === "subs" ? list.map(label) : [],
          todos: dest === "todos" ? list.map((x) => ({ title: x.title, minutes: x.minutes })) : [],
          memo: memoOn ? [p.done && `完了条件：${p.done}`, p.premise && `前提：${p.premise}`].filter(Boolean).join("\n") : "",
          today: today ? { title: p.next.title, minutes: p.next.minutes } : null,
        };
        const n = o.subs.length + o.todos.length + (o.today ? 1 : 0) + (o.memo ? 1 : 0);
        if (!n) { KN.ui.toast("選んだものがありません"); return; }
        const undo = KN.store.importUnfold(t.id, o);
        KN.motion.fire("save");
        h.close();
        KN.ui.toast(`${n}件を取り込みました`, { action: { label: "元に戻す", onClick: undo } });
      });
      box.querySelector(".js-again").addEventListener("click", () => {
        const sum = pastedBlock || [p.done && `完了条件：${p.done}`, p.next && `次の一歩：${p.next.title}`]
          .concat(p.steps.map((x) => `${x.n}. ${x.title}`)).filter(Boolean).join("\n");
        const text = `${prompt(t, picks, trouble)}\n\n## ここまでの結果（別の AI と話して出たもの。見直して、足りないところを質問してください）\n${sum}`;
        copy(text).then((ok) => KN.ui.toast(ok ? "ここまでの結果を足してコピーしました" : "コピーできませんでした"));
      });
      candHost.append(box);
    }

    const h = KN.ui.sheet({ title: "AIとほどく", content: body, cls: "is-unfold" });
    return h;
  }

  /* ---------------- 静かにすすめる ----------------

     詳細の紙に「AIとほどく」の札を一つだけ（紙・吹き出しで割り込まない）。当てはまる用事だけ：
     置き直し3回以上／これから・いつかで21日以上手が入っていない／長さ60分以上で手順なし。
     「出さない」を一度押した用事には二度と出さない。 */
  function hushed() {
    try { const v = JSON.parse(localStorage.getItem(HUSH_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
  }
  function hush(id) {
    const v = hushed();
    if (!v.includes(id)) v.push(id);
    try { localStorage.setItem(HUSH_KEY, JSON.stringify(v.slice(-500))); } catch (_) { /* 札が消えないだけ */ }
  }
  function suggest(t) {
    if (!t || t.done || t.archived || t.trace || hushed().includes(t.id)) return false;
    if ((t.slips || []).length >= 3) return true;
    if (!t.due && !t.repeat && t.shelf !== "wait") {
      const base = dayOf(t.editedAt) || dayOf(t.createdAt);
      if (base && U.daysUntil(base) <= -21) return true;
    }
    return Number(t.minutes) >= 60 && !(t.subs || []).length;
  }

  KN.unfold = { open, prompt, parse, fieldsOf, suggest, hush, hushed, AIS };
})();
