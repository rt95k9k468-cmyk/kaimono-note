/* 一日の道：札どうしが重ならない（2026年10月13日・利用者の画面「朝のBaby」と「朝のルーティン」が
   段の上の通りで重なっていた）。角の内側に置いた札（placeArc）は、そこに重なる通りに控えるが、
   その通りがまだ作られていないと控え損ね、あとから同じ通りに置いた札が上に乗っていた。
   字の大きいとき（--fs-k 1.12〜1.3）に出ていた。起きる 7:40・寝る 22:30・時計 14:21・幅 393 で、
   字の倍率と朝の二つの済んだ用事の始まりと長さを振り、どの組み合わせでも札の字が重ならないことを見る。 */
const { open, checker } = require("./lib");

const DAY = "2026-10-13";
const CASES = [];
const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
for (const k of [1, 1.12, 1.25, 1.3]) {
  for (const a of [470, 480]) {
    for (const la of [75, 90]) {
      for (const o of [0, 30, 60]) CASES.push([hm(a), la, hm(a + o), 30, k]);
    }
  }
}

(async () => {
  const c = checker("road-labels-clear");
  const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 },
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 13, 14, 21)); },
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  const bad = [];
  for (const [a, la, b, lb, k] of CASES) {
    const r = await page.evaluate(async ({ day, a, la, b, lb, k }) => {
      document.documentElement.style.setProperty("--fs-k", String(k));
      const s = KN.store;
      s.update((x) => {
        x.settings.dayStart = "07:40"; x.settings.dayEnd = "22:30";
        x.todos = x.todos.filter((t) => t.due !== day);
      });
      const mk = (title, time, minutes, doneH, doneM) => {
        const t = s.addTodo({ title, due: day, time, minutes });
        if (doneH == null) return;
        s.toggleTodo(t.id);
        s.update((x) => { x.todos.find((y) => y.id === t.id).doneAt = new Date(2026, 9, 13, doneH, doneM).toISOString(); });
      };
      mk("朝のルーティン", a, la, 9, 40);
      mk("朝のBaby", b, lb, 9, 0);
      mk("春日中央保育園見学", "10:00", 60, 11, 0);
      mk("福岡病院に電話", "13:00", 0, 13, 5);
      mk("買い物", "13:00", 60, 13, 50);
      mk("夜のルーティン", "19:00", 180);
      await new Promise((ok) => setTimeout(ok, 400));
      const road = document.querySelector("#screen-todo .day-road");
      // 字の箱（button の上下 6px は指の的、行の高さの余りも字ではないので、高さは字の大きさ）
      const box = [...road.querySelectorAll(".road-label")].map((e) => {
        const q = [...e.children].map((x) => x.getBoundingClientRect()).filter((x) => x.width);
        const fs = parseFloat(getComputedStyle(e).fontSize);
        const cy = (Math.min(...q.map((x) => x.top)) + Math.max(...q.map((x) => x.bottom))) / 2;
        return { t: e.textContent.replace(/\s+/g, " ").trim(),
                 l: Math.min(...q.map((x) => x.left)), r: Math.max(...q.map((x) => x.right)),
                 u: cy - fs / 2, d: cy + fs / 2 };
      });
      const hit = [];
      box.forEach((p, i) => box.slice(i + 1).forEach((q) => {
        if (p.l < q.r - 1 && q.l < p.r - 1 && p.u < q.d - 1 && q.u < p.d - 1) hit.push(`${p.t} × ${q.t}`);
      }));
      return hit;
    }, { day: DAY, a, la, b, lb, k });
    if (r.length) bad.push(`×${k} ${a}+${la} / ${b}+${lb}: ${r.join(", ")}`);
  }
  c.check(`札どうしが重ならない（${CASES.length}通り）`, !bad.length, bad.join(" | "));
  c.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  c.done();
})();
