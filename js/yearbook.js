/* 年の本（R10・2026年9月29日）。docs/daily.md の「年の本」。

   一年ぶんを、**事実だけ**の一冊にします——積み上げ・初めて買ったもの・
   よく買ったもの・その年の日記（本人の字）。置き場は daily ではなく書き出し
   （設定 → daily → 書き出し）。印刷（PDF に保存）と Markdown の二つ。

   - 記録の形は変えません。新しい入れ物も持ちません。store にあるものを、
     書き出すそのときに引いて組むだけ（Daily Log の「写さず引く」と同じ）。
   - 比べない・率を出さない・目標を言わない。数を言うのは「よく買ったもの」の
     回数だけ（その年に買った回数そのもの。前の年とは並べない）。
     日記の日の数・積み上げの件数は言いません（daily は数えない）。
   - 積み上げの種類「達成」は、ここでは「やったこと」と書きます。daily の
     禁止語（tests/daily-rules.js）に当たるので。記録の種類そのものは変えません。
   - 空の章は章ごと出しません（「ありません」と書くと、無いことの一覧になる）。 */
(() => {
  const KN = window.KN;
  const store = KN.store;
  const U = KN.util;

  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
  const TYPE_LABEL = { done: "やったこと" };

  /** 時刻つきの値（checkedAt は UTC の ISO）を、端末の日付に。 */
  function localDay(v) {
    const s = String(v || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return isNaN(d) ? "" : U.dayKey(d);
  }

  function md(day) {
    const [, m, d] = day.split("-").map(Number);
    return `${m}月${d}日`;
  }
  function mdw(day) {
    const [y, m, d] = day.split("-").map(Number);
    return `${m}月${d}日（${WEEK[new Date(y, m - 1, d).getDay()]}）`;
  }

  /** 買った記録：[{ productId, name, day }]（買った順）。 */
  function boughtAll() {
    const s = store.get();
    const names = new Map((s.products || []).map((p) => [p.id, p.name]));
    return (s.items || [])
      .filter((i) => i.checked && i.checkedAt)
      .map((i) => ({ productId: i.productId, name: names.get(i.productId) || "", day: localDay(i.checkedAt) }))
      .filter((b) => b.name && b.day)
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  const hasMemo = (d) => !!String((d && d.memo) || "").trim();

  /** 何か一つでも記録のある年（新しい順）。 */
  function years() {
    const s = store.get();
    const arc = s.archive || {};
    const set = new Set();
    (arc.entries || []).forEach((e) => { if (e.date) set.add(String(e.date).slice(0, 4)); });
    (arc.days || []).forEach((d) => { if (d.date && (hasMemo(d) || store.memoOut(d))) set.add(String(d.date).slice(0, 4)); });
    boughtAll().forEach((b) => set.add(b.day.slice(0, 4)));
    return [...set].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
  }

  /** その年の一冊の中身。数えるのは「よく買ったもの」の回数だけ。 */
  function build(year) {
    const y = String(year);
    const s = store.get();
    const arc = s.archive || {};
    const inYear = (day) => String(day || "").slice(0, 4) === y;

    const stacks = store.ARCHIVE_TYPES.map((t) => ({
      id: t.id,
      label: TYPE_LABEL[t.id] || t.label,
      items: (arc.entries || [])
        .filter((e) => e.type === t.id && inYear(e.date))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))
          || String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
        .map((e) => {
          const memo = String(e.memo || "").trim();
          const title = String(e.title || "").trim() || memo.split("\n")[0].trim();
          return {
            day: e.date, title,
            author: String(e.author || "").trim(),
            memo: memo && memo !== title ? memo : "",
          };
        }),
    })).filter((g) => g.items.length);

    const bought = boughtAll();
    const firstOf = new Map();
    bought.forEach((b) => { if (!firstOf.has(b.productId)) firstOf.set(b.productId, b); });
    const firsts = [...firstOf.values()].filter((b) => inYear(b.day));

    const times = new Map();
    bought.filter((b) => inYear(b.day)).forEach((b) => {
      const t = times.get(b.productId) || { name: b.name, times: 0 };
      t.times += 1;
      times.set(b.productId, t);
    });
    const often = [...times.values()].filter((t) => t.times >= 2)
      .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, "ja"))
      .slice(0, 10);

    const diary = (arc.days || [])
      .filter((d) => inYear(d.date) && (hasMemo(d) || store.memoOut(d)))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((d) => ({ day: d.date, text: hasMemo(d) ? String(d.memo).replace(/\s+$/, "") : null }));

    return { year: y, madeOn: U.todayKey(), stacks, firsts, often, diary };
  }

  const MISSING = "（本文を読めませんでした）";

  /* ---------------- Markdown ---------------- */

  function markdown(year) {
    const b = build(year);
    const out = [`# くらしノート ${b.year}年`, "", `書き出した日：${fullDay(b.madeOn)}`];
    const indent = (t) => t.split("\n").map((l) => `  ${l}`).join("\n");

    if (b.stacks.length) {
      out.push("", "## 積み上げ");
      b.stacks.forEach((g) => {
        out.push("", `### ${g.label}`, "");
        g.items.forEach((e) => {
          out.push(`- ${md(e.day)}　${e.title}${e.author ? `（${e.author}）` : ""}`);
          if (e.memo) out.push(indent(e.memo));
        });
      });
    }
    if (b.firsts.length) {
      out.push("", "## 初めて買ったもの", "");
      b.firsts.forEach((f) => out.push(`- ${md(f.day)}　${f.name}`));
    }
    if (b.often.length) {
      out.push("", "## よく買ったもの", "");
      b.often.forEach((o) => out.push(`- ${o.name}（${o.times}回）`));
    }
    if (b.diary.length) {
      out.push("", "## 日記");
      b.diary.forEach((d) => out.push("", `### ${mdw(d.day)}`, "", d.text == null ? MISSING : d.text));
    }
    return out.join("\n") + "\n";
  }

  function fullDay(day) {
    const [y, m, d] = day.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  }

  /* ---------------- 印刷（PDF に保存） ----------------

     別の窓は開きません（ホーム画面のアプリでは Safari へ飛ぶ）。本の一枚を
     body の直下に置き、印刷のあいだだけそれ以外を隠します（components.css の
     「年の本」）。画面には出ません。 */

  function printHtml(year) {
    const b = build(year);
    const e = U.escapeHtml;
    const parts = [`<h1>くらしノート ${e(b.year)}年</h1>`, `<p class="yb-made">書き出した日：${e(fullDay(b.madeOn))}</p>`];
    if (b.stacks.length) {
      parts.push("<h2>積み上げ</h2>");
      b.stacks.forEach((g) => {
        parts.push(`<h3>${e(g.label)}</h3><ul>`);
        g.items.forEach((x) => parts.push(`<li><span class="yb-day">${e(md(x.day))}</span>${e(x.title)}${x.author ? e(`（${x.author}）`) : ""}`
          + (x.memo ? `<div class="yb-text">${e(x.memo)}</div>` : "") + "</li>"));
        parts.push("</ul>");
      });
    }
    if (b.firsts.length) {
      parts.push("<h2>初めて買ったもの</h2><ul>");
      b.firsts.forEach((f) => parts.push(`<li><span class="yb-day">${e(md(f.day))}</span>${e(f.name)}</li>`));
      parts.push("</ul>");
    }
    if (b.often.length) {
      parts.push("<h2>よく買ったもの</h2><ul>");
      b.often.forEach((o) => parts.push(`<li>${e(o.name)}（${o.times}回）</li>`));
      parts.push("</ul>");
    }
    if (b.diary.length) {
      parts.push('<h2 class="yb-diary">日記</h2>');
      b.diary.forEach((d) => parts.push(`<section class="yb-entry"><h3>${e(mdw(d.day))}</h3>`
        + `<div class="yb-text">${e(d.text == null ? MISSING : d.text)}</div></section>`));
    }
    return parts.join("");
  }

  function print(year) {
    let el = document.getElementById("yearbook-print");
    if (!el) {
      el = document.createElement("div");
      el.id = "yearbook-print";
      el.setAttribute("aria-hidden", "true");
      document.body.append(el);
    }
    el.innerHTML = printHtml(year);
    const root = document.documentElement;
    root.classList.add("is-printing-book");
    const done = () => {
      root.classList.remove("is-printing-book");
      el.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  KN.yearbook = { years, build, markdown, printHtml, print };
})();
