/* =========================================================
   くらしノート — 積み上げを一冊のノートへ（2026年10月12日。docs/thinking.md）

   積み上げ（`archive.entries`）はやめた。前からの記録は、一度だけ一冊のノートに
   日付の古い順でまとめる。**記録そのものは消さない・書き換えない**（控えにも残る）。
   済んだ印は設定 `entriesNote`（ノートの id）。書けたと確かめてから付ける——書けな
   ければ次の起動でもう一度。id は決まった一つなので、二台で走っても一冊のまま。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const ID = "n-tsumiage";
  const LABEL = { reading: "読書", study: "学習", seed: "種", done: "達成", change: "変化" };

  function dayHead(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return `### ${y}年${m}月${d}日(${KN.util.weekdayJa(key)})`;
  }

  /** 一件の頭の行（種類『題』著者 p.10–30・08:30から30分）。 */
  function headOf(e) {
    const kind = e.type === "reading" && e.kind === "paper" ? "論文" : LABEL[e.type] || "記録";
    const bits = [`${kind}${e.title ? `『${String(e.title).trim()}』` : ""}`];
    if (e.author) bits.push(String(e.author).trim());
    if (e.pageFrom != null || e.pageTo != null) bits.push(`p.${[e.pageFrom, e.pageTo].filter((x) => x != null).join("–")}`);
    else if (e.amount != null) bits.push(`${e.amount}${e.unit || ""}`);
    let head = bits.join(" ");
    const spent = e.minutes > 0 ? KN.plan.humanSpan(e.minutes) : "";
    if (spent || e.at) head += `・${e.at ? `${e.at}から` : ""}${spent}`;
    const tags = (e.tags || []).filter(Boolean);
    if (tags.length) head += `・${tags.join("、")}`;
    return head;
  }

  /** 本文（文字だけ。試験が直に確かめる）。日付の古い順、同じ日は書いた順。 */
  function text(entries) {
    const rows = (entries || []).filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)))
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date))
        || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const out = [];
    let day = null;
    rows.forEach((e) => {
      if (e.date !== day) { day = e.date; if (out.length) out.push(""); out.push(dayHead(day)); }
      out.push(headOf(e));
      const memo = String(e.memo || "").replace(/\s+$/, "");
      if (memo) out.push(memo);
    });
    return out.join("\n");
  }

  function titleOf(entries) {
    const last = (entries || []).map((e) => String(e.date || "")).filter((d) => /^\d{4}-\d{2}/.test(d)).sort().pop();
    return last ? `積み上げ（〜${Number(last.slice(0, 4))}年${Number(last.slice(5, 7))}月）` : "積み上げ";
  }

  const mark = (id) => KN.store.update((s) => { s.settings.entriesNote = id; });

  let busy = false;
  async function run() {
    const store = KN.store, N = KN.notes;
    if (busy || !store || !N || store.get().settings.entriesNote != null) return;
    if (N.state() !== "on") return;
    const entries = (store.get().archive || {}).entries || [];
    if (!entries.length) { mark(""); return; }
    if (N.get(ID)) { mark(ID); return; }   // ほかの端末か前の起動で書けている
    busy = true;
    try {
      const at = KN.util.today();
      await N.addMany([{ id: ID, title: titleOf(entries), body: text(entries), notebook: "", tags: [],
                         fav: false, createdAt: at, updatedAt: at, deletedAt: null }]);
      mark(ID);
    } catch (_) { /* 書けなければ印を付けない（次の起動でもう一度） */ }
    busy = false;
  }

  KN.entriesNote = { ID, text, titleOf, run, id: () => (KN.store.get().settings.entriesNote || null) };
  /* 入れ物が遅れて開いた日も（待ち切りのあと on へ）。済んでいれば run はすぐ戻る。 */
  if (KN.notes && KN.store) { KN.notes.ready().then(run, () => {}); KN.notes.onChange(run); }
})();
