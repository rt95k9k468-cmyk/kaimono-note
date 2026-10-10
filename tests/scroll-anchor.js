/* スクロールの錨（Safari 27）で送りが跳ねないか（docs/roadmap-3.1.md の S1・2026年10月9日）。

   iPhone で見る代わりに、試験の Chromium（錨がある）で S1 の五か所を「錨あり」と「錨なし」（iOS 26 までの
   Safari と同じ。lib の noAnchor）の二通りで同じ手順だけ動かし、見ていた行の画面の位置を比べる。
   跳ねは一瞬なので、終わりの位置だけでなく、毎フレーム見ていちばん動いた量も比べる。アプリが書いた送り
   （scrollTop・scrollTo ほか）も控えて比べる——錨が動いたぶんをアプリが打ち消していれば、書く値が違ってくる。
   二通りで同じなら、その場面では錨が何もしていない——Safari の錨の細部が Chromium と違っても、効く場面が無い。
   違えば、その器だけ `overflow-anchor: none`（S1 の「跳ねたら」）。
   - ノートで長い文を打つ（見えている行で一字・改行・五行の貼りつけ・帯の裏の行で打つ）
   - daily の記録の紙で打つ（メモに改行と字）
   - 買うもの「今日買ったもの」の束を閉じる・開く
   - やることの「これから」の下の「待つ」「いつか」を開く・閉じる
   - 暦を払って月をめくる（5行の月と6行の月をまたぐ。送りが頭のときと、下へ送ったとき）

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/scroll-anchor.js */
const { open, checker, noAnchor } = require("./lib");

const TOL = 1;   // 二通りの差（px）。字の位置は小数で揺れるので 1px まで

/** 一つの場面を、錨あり／なしで開いて動かす。body(page, step) が手順。返すのは手順ごとの { v0, v, lo, hi, sc }。 */
async function scene(anchor, setup, body) {
  const { browser, ctx, page, errors } = await open({
    before: async (cx, p) => {
      await p.clock.setFixedTime(new Date(2026, 8, 15, 10, 0));
      if (!anchor) await cx.addInitScript(noAnchor);
      /* アプリが書いた送りを控える。錨が動いてアプリがそれを打ち消していたら、書く値が二通りで違ってくる
         （終わりの位置が同じでも）。Safari では打ち消しと錨が二重に効きうるので、それも見る。 */
      await cx.addInitScript(() => {
        window.__writes = [];
        const P = Element.prototype;
        const d = Object.getOwnPropertyDescriptor(P, "scrollTop");
        Object.defineProperty(P, "scrollTop", { configurable: true, get: d.get,
          set(v) { window.__writes.push(Math.round(v)); d.set.call(this, v); } });
        ["scrollTo", "scrollBy", "scrollIntoView"].forEach((k) => {
          const f = P[k];
          P[k] = function (...a) { window.__writes.push(k); return f.apply(this, a); };
        });
      });
    },
  });
  await page.evaluate(() => {
    /* 見ていた行の、画面の上からの位置（毎フレーム読む）。DOM は組み直されるので毎回引き直す。 */
    const live = (e) => e && !e.closest("[inert], .is-peek, .is-ahead");
    const R = {
      sel: (s) => { const e = [...document.querySelectorAll(s)].find(live); return e ? e.getBoundingClientRect().top : null; },
      /* 器の中で、いちばん上に見えているもの（払うと日が替わって中身も替わるので、名前では追わない） */
      first: (s) => {
        const sc = KN.app.scrollerOf(document.getElementById("screen-todo"));
        const top = sc.getBoundingClientRect().top;
        const e = [...document.querySelectorAll(s)].find((x) => live(x) && x.getBoundingClientRect().bottom > top);
        return e ? e.getBoundingClientRect().top : null;
      },
      text: ([s, t]) => {
        const e = [...document.querySelectorAll(s)].find((x) => live(x) && x.textContent.trim() === t);
        return e ? e.getBoundingClientRect().top : null;
      },
      /* ノートのカーソルの行（折り返さない短い行だけ）。 */
      caret: () => {
        const ta = document.querySelector(".sheet.is-note .js-text");
        if (!ta) return null;
        const n = ta.value.slice(0, ta.selectionStart).split("\n").length - 1;
        return ta.getBoundingClientRect().top + n * parseFloat(getComputedStyle(ta).lineHeight);
      },
    };
    window.__watch = (kind, arg) => {
      const read = () => R[kind](arg);
      const w = { read, v0: read(), lo: 0, hi: 0, on: true };
      const tick = () => {
        if (!w.on) return;
        const v = read();
        if (v != null && w.v0 != null) { w.lo = Math.min(w.lo, v - w.v0); w.hi = Math.max(w.hi, v - w.v0); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__w = w;
      window.__writes = [];
    };
    window.__stop = (sc) => {
      const w = window.__w;
      w.on = false;
      const r = (x) => (x == null ? null : Math.round(x * 10) / 10);
      return { v0: r(w.v0), v: r(w.read()), lo: r(w.lo), hi: r(w.hi), sc: sc ? Math.round(sc.scrollTop) : null,
               writes: window.__writes.join(",") };
    };
  });
  const out = [];
  await setup(page, ctx);
  /* 手順：見張りを始め、動かし、収まるまで待って、位置を控える。scSel はそのとき送っている器（控えに載せるだけ。
     "#screen-…" なら scrollerOf——やることは組み直すたびに器が替わるので、印を付けずに毎回引く）。 */
  const step = async (name, kind, arg, act, scSel, settle = 700) => {
    await page.evaluate(([k, a]) => window.__watch(k, a), [kind, arg]);
    await act();
    await page.waitForTimeout(settle);
    out.push({ name, ...(await page.evaluate((s) => window.__stop(!s ? null
      : /^#screen-[a-z]+$/.test(s) ? KN.app.scrollerOf(document.querySelector(s)) : document.querySelector(s)), scSel || null)) });
  };
  await body(page, step, ctx);
  out.errors = errors.slice();
  await browser.close();
  return out;
}

/* キーボードが出ている見え方（アプリ自身の測り方に通す。tests/note-typing.js と同じ）。 */
const keyboard = (page) => page.evaluate(() => {
  Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 464 });
  visualViewport.dispatchEvent(new Event("resize"));
});

const SCENES = [
  {
    title: "ノートで打つ",
    setup: async (page) => {
      await page.evaluate(() => KN.app.showScreen("archive"));
      await page.waitForTimeout(900);
      await page.click('.tab[data-tab="archive"]');
      await page.waitForTimeout(900);
      await page.click("#dock .add-fab");
      await page.waitForSelector(".sheet.is-note.is-open");
      await page.waitForTimeout(600);
      await page.keyboard.insertText(Array.from({ length: 80 }, (_, i) => `行${i + 1}`).join("\n"));
      await page.waitForTimeout(200);
      await keyboard(page);
      await page.waitForTimeout(300);
    },
    body: async (page, step) => {
      const SC = ".sheet.is-note .sheet-body";
      /* n 行目の頭にカーソルを置き、その行を帯の上端から u px 下に置く。 */
      const caretTo = (n, u) => page.$eval(".sheet.is-note", (s, [k, d]) => {
        const ta = s.querySelector(".js-text");
        const lines = ta.value.split("\n");
        const pos = lines.slice(0, k - 1).join("\n").length + (k > 1 ? 1 : 0);
        ta.setSelectionRange(pos, pos);
        const sc = s.querySelector(".sheet-body");
        const lh = parseFloat(getComputedStyle(ta).lineHeight);
        const bar = s.querySelector(".note-tools").getBoundingClientRect();
        sc.scrollTop += ta.getBoundingClientRect().top + (k - 1) * lh - (bar.top + d);
      }, [n, u]);
      await caretTo(40, -160);
      await page.waitForTimeout(200);
      await step("見えている行で一字", "caret", null, () => page.keyboard.insertText("あ"), SC);
      await step("改行", "caret", null, () => page.keyboard.press("Enter"), SC);
      await step("五行を貼る", "caret", null, () => page.keyboard.insertText("貼1\n貼2\n貼3\n貼4\n貼5"), SC);
      await caretTo(60, 4);
      await page.waitForTimeout(200);
      await step("帯の裏の行で打つ", "caret", null, () => page.keyboard.insertText("い"), SC);
      await step("帯の裏で改行を三つ", "caret", null, async () => {
        for (let i = 0; i < 3; i++) { await page.keyboard.press("Enter"); await page.waitForTimeout(60); }
      }, SC);
    },
  },
  {
    title: "daily の記録の紙で打つ",
    setup: async (page) => {
      await page.evaluate(() => KN.app.showScreen("archive"));
      await page.waitForTimeout(900);
      await page.click("#dock .js-open-add");
      await page.waitForSelector(".sheet.is-open .js-memo");
      await page.waitForTimeout(600);
      await page.$eval(".sheet.is-open .js-memo", (m) => {
        m.value = Array.from({ length: 30 }, (_, i) => `メモ${i + 1}`).join("\n");
        m.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await keyboard(page);
      await page.waitForTimeout(300);
    },
    body: async (page, step) => {
      const SC = ".sheet.is-open .sheet-body";
      const MEMO = ".sheet.is-open .arc-memo-field";
      await step("メモを押す", "sel", MEMO, () => page.click(".sheet.is-open .js-memo"), SC);
      await step("メモの終わりで改行と字", "sel", MEMO, async () => {
        await page.keyboard.press("End");
        for (let i = 0; i < 4; i++) { await page.keyboard.press("Enter"); await page.keyboard.insertText(`続き${i}`); await page.waitForTimeout(60); }
      }, SC);
      await step("貼りつけ", "sel", MEMO, () => page.keyboard.insertText("貼1\n貼2\n貼3\n貼4\n貼5"), SC);
    },
  },
  {
    title: "今日買ったものの束",
    setup: async (page) => {
      await page.evaluate(() => {
        const S = KN.store;
        S.loadSample();
        /* 送れる長さに（見本だけでは一画面に収まる） */
        for (let i = 0; i < 24; i++) S.addItem(S.addProduct({ name: `品物 ${i}` }).id);
      });
      await page.waitForTimeout(300);
      await page.click('.tab[data-tab="list"]');
      await page.waitForTimeout(900);
      for (let i = 0; i < 4; i++) {
        await page.click("#screen-list .item-wrap:not(.day-bought .item-wrap) .check");
        await page.waitForTimeout(1300);
      }
    },
    body: async (page, step) => {
      const T = "#screen-list .day-bought-toggle";
      const SC = "#screen-list";
      /* 束の頭を画面の中ほどへ */
      const mid = (y) => page.evaluate(([t, yy]) => {
        const s = KN.app.scrollerOf(document.getElementById("screen-list"));
        s.scrollTop += document.querySelector(t).getBoundingClientRect().top - yy;
      }, [T, y]);
      await mid(420);
      await page.waitForTimeout(300);
      await step("中ほどで閉じる", "sel", T, () => page.click(T), SC);
      await step("中ほどで開く", "sel", T, () => page.click(T), SC);
      await mid(140);
      await page.waitForTimeout(300);
      await step("上のほうで閉じる", "sel", T, () => page.click(T), SC);
      await step("上のほうで開く", "sel", T, () => page.click(T), SC);
    },
  },
  {
    title: "やることの「これから」の畳み",
    setup: async (page) => {
      await page.evaluate(() => {
        const S = KN.store;
        for (let h = 7; h < 21; h++) S.addTodo({ title: `予定 ${h}`, due: "2026-09-15", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
        for (let i = 0; i < 6; i++) S.addTodo({ title: `これから ${i}` });
        for (let i = 0; i < 4; i++) { const t = S.addTodo({ title: `待つ ${i}` }); S.setShelf(t.id, "wait", "返事"); }
        for (let i = 0; i < 4; i++) { const t = S.addTodo({ title: `いつか ${i}` }); S.setShelf(t.id, "someday"); }
        S.setCalPref(null, { shown: true, open: false });
      });
      await page.click('.tab[data-tab="todo"]');
      await page.waitForTimeout(1000);
    },
    body: async (page, step) => {
      const head = (k) => `#screen-todo .tl-shelf[data-shelf="${k}"] .tl-shelf-head`;
      const mid = (k, y) => page.evaluate(([s, yy]) => {
        const sc = KN.app.scrollerOf(document.getElementById("screen-todo"));
        sc.scrollTop += document.querySelector(s).getBoundingClientRect().top - yy;
      }, [head(k), y]);
      await mid("wait", 420);
      await page.waitForTimeout(400);
      await step("待つを開く", "sel", head("wait"), () => page.click(head("wait")), "#screen-todo");
      await step("いつかを開く", "sel", head("someday"), () => page.click(head("someday")), "#screen-todo");
      await step("待つを閉じる", "sel", head("wait"), () => page.click(head("wait")), "#screen-todo");
      /* 下まで送って、開いた「いつか」の中を見ているときに閉じる */
      await page.evaluate(() => { const s = KN.app.scrollerOf(document.getElementById("screen-todo")); s.scrollTop = s.scrollHeight; });
      await page.waitForTimeout(400);
      await step("下で、いつかを閉じる", "sel", head("someday"), () => page.click(head("someday")), "#screen-todo");
    },
  },
  {
    title: "暦を払う",
    setup: async (page) => {
      await page.evaluate(() => {
        const S = KN.store;
        for (let h = 6; h < 22; h++) S.addTodo({ title: `予定 ${h}`, due: "2026-09-15", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
        for (let i = 0; i < 6; i++) S.addTodo({ title: `これから ${i}` });
        S.setCalPref(null, { shown: true, open: true });
      });
      await page.click('.tab[data-tab="todo"]');
      await page.waitForTimeout(1000);
      /* 開いたときの動き（「いま」へ送り、過ぎた行が降りてくる。合わせて約1秒）が止まるまで。決め打ちの ms だけでは、
         混んだ機械で動きの途中を測り、錨のあり・なしで見ていた行の位置（v0）が 25px ずれて落ちた（2026年10月10日）。 */
      await page.waitForFunction(() => {
        const root = document.getElementById("screen-todo");
        const moving = document.getAnimations().some((a) => a.playState === "running" && a.effect && a.effect.target
          && root.contains(a.effect.target) && isFinite(a.effect.getComputedTiming().endTime));
        const top = Math.round(KN.app.scrollerOf(root).scrollTop);
        const still = window.__lastTop === top;
        window.__lastTop = top;
        return !moving && still;
      }, null, { timeout: 10000, polling: 100 });
    },
    body: async (page, step) => {
      const rows = () => page.evaluate(() => document.querySelectorAll("#head .cal .cal-grid .cal-day[data-day]").length / 7);
      const swipe = async (dx) => {
        const b = await page.$eval("#head .cal .cal-grid", (g) => { const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.move(b.x, b.y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + dx * i / 10, b.y); await page.waitForTimeout(16); }
        await page.mouse.up();
      };
      const N = "#screen-todo .item-name";
      const r0 = await rows();
      await step(`頭で、前の月へ（${r0}行から）`, "first", N, () => swipe(220), "#screen-todo", 1200);
      const r1 = await rows();
      await step(`頭で、戻る（${r1}行から）`, "first", N, () => swipe(-220), "#screen-todo", 1200);
      await page.evaluate(() => { KN.app.scrollerOf(document.getElementById("screen-todo")).scrollTop = 260; });
      await page.waitForTimeout(400);
      await step("下へ送って、前の月へ", "first", N, () => swipe(220), "#screen-todo", 1200);
      await step("下へ送って、戻る", "first", N, () => swipe(-220), "#screen-todo", 1200);
    },
  },
];

(async () => {
  const c = checker("scroll-anchor");
  const only = process.env.KN_SCENE;
  for (const s of SCENES) {
    if (only && !s.title.includes(only)) continue;
    const on = await scene(true, s.setup, s.body);
    const off = await scene(false, s.setup, s.body);
    c.check(`${s.title}：ページのエラーが無い`, !on.errors.length && !off.errors.length, [...on.errors, ...off.errors].join(" / "));
    on.forEach((a, i) => {
      const b = off[i];
      const d = (k) => (a[k] == null || b[k] == null ? (a[k] === b[k] ? 0 : Infinity) : Math.abs(a[k] - b[k]));
      const same = d("v0") <= TOL && d("v") <= TOL && d("lo") <= TOL && d("hi") <= TOL && a.writes === b.writes;
      if (process.env.KN_VERBOSE) console.log(`    ${s.title}／${a.name}  錨あり ${JSON.stringify(a)}  錨なし ${JSON.stringify(b)}`);
      c.check(`${s.title}／${a.name}：錨のあるなしで、見ていた行もアプリが書いた送りも同じ`,
        same && a.v != null, `錨あり ${JSON.stringify(a)} / 錨なし ${JSON.stringify(b)}`);
    });
  }
  c.done();
})();
