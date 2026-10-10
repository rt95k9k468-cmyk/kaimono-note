/* 手ざわりの音（docs/motion.md の「手ざわりの表」・roadmap-seamless の N6・2026年10月10日）。
   音の口は偽物に差しかえ、鳴った音を長さで見分けて数える（カチッ 12ms・ぽっ 45ms・ことっ 60ms）。

   - 見張り：音を作る・鳴らすのは motion.js だけ。鳴らすのは fire() の中の一か所だけで、snd を持つ
     出来事（turn・lift・drop）はどれも手ざわりの表に行がある。持ち上げの三か所は指を置いたときに口を開け、
     lift と drop を返す。
   - 口を開けたあと、四つのタブを開いても鳴らない。
   - 並べ替え（reorder.js）：持ち上がると「ぽっ」、置くと「ことっ」。HOLD より前に離せば鳴らない。
   - 時間割（screen-todo.js の lift / drop）：同じく「ぽっ」「ことっ」。 */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function fakeAudio() {
  window.__snd = [];
  class FakeCtx {
    constructor() { this.state = "running"; this.sampleRate = 1000; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createBuffer(c, len) { const d = new Float32Array(len); return { len, getChannelData: () => d }; }
    createGain() { return { gain: {}, connect: (x) => x }; }
    createBufferSource() {
      const s = { connect: (g) => g, start() { window.__snd.push({ 12: "tick", 45: "lift", 60: "drop" }[s.buffer.len] || s.buffer.len); } };
      return s;
    }
  }
  window.AudioContext = FakeCtx;
}

/* iPhone のふり：作った口は閉じたまま始まり、開けられるのは指を離したとき（touchend）だけ（iOS 9 から。
   touchstart・pointerdown では開かない）。アプリの見張りより先に、ここで「離した」を覚える。 */
function iosAudio() {
  window.__snd = [];
  let lifting = false;
  document.addEventListener("touchend", () => { lifting = true; setTimeout(() => { lifting = false; }, 0); }, true);
  class FakeCtx {
    constructor() { this.state = "suspended"; this.sampleRate = 1000; this.destination = {}; }
    resume() { if (lifting) this.state = "running"; return Promise.resolve(); }
    createBuffer(c, len) { const d = new Float32Array(len); return { len, getChannelData: () => d }; }
    createGain() { return { gain: {}, connect: (x) => x }; }
    createBufferSource() {
      const s = { connect: (g) => g, start() { window.__snd.push({ 12: "tick", 45: "lift", 60: "drop" }[s.buffer.len] || s.buffer.len); } };
      return s;
    }
  }
  window.AudioContext = FakeCtx;
}

(async () => {
  const c = checker("feel-sound");

  /* ---------- 見張り（読むだけ） ---------- */
  const js = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"));
  const audioIn = js.filter((f) => /AudioContext|createBufferSource|audioSession/.test(read("js/" + f)));
  c.check("音を作るのは motion.js だけ", audioIn.join() === "motion.js", audioIn.join());
  const motion = read("js/motion.js");
  const calls = motion.match(/\bsound\(/g) || [];
  c.check("鳴らすのは fire() の一か所だけ（定義と呼び出しの二つ）",
    calls.length === 2 && /if \(spec\.snd\) sound\(spec\.snd\);/.test(motion), String(calls.length));
  const snd = [...motion.matchAll(/^\s*(\w+):\s*\{[^}]*\bsnd:\s*"(\w+)"/gm)].map((m) => m[1]);
  c.check("snd を持つ出来事は turn・lift・drop", snd.join() === "turn,lift,drop", snd.join());
  const doc = read("docs/motion.md");
  const table = (doc.split("### 手ざわりの表")[1] || "").split("\n### ")[0];
  for (const n of snd) c.check(`手ざわりの表に ${n} の行`, new RegExp("`" + n + "`").test(table));
  for (const f of ["js/reorder.js", "js/screen-todo.js", "js/day-road.js"]) {
    const s = read(f);
    c.check(`${f}：指を置いたときに口を開け、lift と drop を返す`,
      /KN\.motion\.wakeSound\(\)/.test(s) && /fire\("lift"\)/.test(s) && /fire\("drop"\)/.test(s));
  }
  c.check("ドラムは turn を返す", /fire\("turn"\)/.test(read("js/ui.js")) && /wakeSound\(\)/.test(read("js/ui.js")));

  /* ---------- 動かして ---------- */
  const { browser, page, errors } = await open({ before: (ctx) => ctx.addInitScript(fakeAudio) });
  const wait = (ms) => page.waitForTimeout(ms);
  const heard = () => page.evaluate(() => window.__snd.slice());
  const clear = () => page.evaluate(() => { window.__snd.length = 0; });
  await page.evaluate(() => KN.store.loadSample());
  await wait(300);
  const G = await page.evaluate(() => ({ ...KN.gesture }));

  await page.evaluate(() => KN.motion.wakeSound());
  for (const tab of ["list", "diet", "archive", "todo"]) { await page.click(`.tab[data-tab="${tab}"]`); await wait(250); }
  c.check("口を開けたあと、タブを開いても鳴らない", (await heard()).length === 0, JSON.stringify(await heard()));

  /* 並べ替え（gesture-weight.js と同じ試しの器）。 */
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "t-reorder";
    box.style.cssText = "position:fixed;left:0;top:120px;width:300px;z-index:99999;background:#fff";
    for (let i = 0; i < 3; i++) {
      const r = document.createElement("div");
      r.className = "t-row"; r.textContent = "行" + i;
      r.style.cssText = "height:50px;user-select:none";
      box.append(r);
    }
    document.body.append(box);
    KN.reorder.attach(box, { item: ".t-row", onDrop: () => {} });
  });
  await page.mouse.move(100, 145);
  await page.mouse.down();
  await wait(G.HOLD - 160);
  await page.mouse.up();
  await wait(200);
  c.check("HOLD より前に離せば鳴らない", (await heard()).length === 0, JSON.stringify(await heard()));
  await page.mouse.move(100, 145);
  await page.mouse.down();
  await wait(G.HOLD + 120);
  c.check("持ち上がると「ぽっ」", JSON.stringify(await heard()) === '["lift"]', JSON.stringify(await heard()));
  await page.mouse.move(100, 255, { steps: 12 });
  await page.mouse.up();
  await wait(450);
  c.check("置くと「ことっ」", JSON.stringify(await heard()) === '["lift","drop"]', JSON.stringify(await heard()));
  await page.evaluate(() => document.getElementById("t-reorder").remove());

  /* 時間割の行。 */
  await clear();
  const row = await page.evaluate(async () => {
    const r = document.querySelector("#screen-todo .tl-list .tl-row");
    if (!r) return null;
    r.scrollIntoView({ block: "center" });
    await new Promise((ok) => setTimeout(ok, 300));
    const t = r.querySelector(".tl-title, .tl-body") || r;
    const b = t.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  c.check("時間割に持てる行がある", !!row);
  if (row) {
    await page.mouse.move(row.x, row.y);
    await page.mouse.down();
    await wait(700);
    const lifted = await page.evaluate(() => !!document.querySelector("#screen-todo .tl-row.is-lifted"));
    c.check("時間割の行が持ち上がると「ぽっ」", lifted && JSON.stringify(await heard()) === '["lift"]',
      `${lifted} ${JSON.stringify(await heard())}`);
    await page.mouse.up();
    await wait(450);
    c.check("時間割の行を置くと「ことっ」", JSON.stringify(await heard()) === '["lift","drop"]', JSON.stringify(await heard()));
  }

  c.check("エラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();

  /* ---------- iPhone のふり：指を離したところで口が開く ---------- */
  {
    const { browser: b2, page: p2, errors: e2 } = await open({ before: (ctx) => ctx.addInitScript(iosAudio) });
    const heard2 = () => p2.evaluate(() => window.__snd.slice());
    await p2.evaluate(() => {
      const box = document.createElement("div");
      box.id = "t-reorder";
      box.style.cssText = "position:fixed;left:0;top:120px;width:300px;z-index:99999;background:#fff";
      for (let i = 0; i < 3; i++) {
        const r = document.createElement("div");
        r.className = "t-row"; r.textContent = "行" + i;
        r.style.cssText = "height:50px;user-select:none";
        box.append(r);
      }
      document.body.append(box);
      KN.reorder.attach(box, { item: ".t-row", onDrop: () => {} });
    });
    const liftOnce = async () => {
      await p2.mouse.move(100, 145);
      await p2.mouse.down();
      await p2.waitForTimeout(G.HOLD + 120);
      const got = await heard2();
      await p2.mouse.up();
      await p2.waitForTimeout(450);
      return got;
    };
    const first = await liftOnce();
    c.check("iPhone：指を置いただけでは口が開かない（一度めの持ち上げは黙る）", first.length === 0, JSON.stringify(first));
    /* 指を離した（iPhone は click より先に touchend を出す）。 */
    await p2.evaluate(() => document.dispatchEvent(new Event("touchend", { bubbles: true })));
    await p2.evaluate(() => { window.__snd.length = 0; });
    const second = await liftOnce();
    c.check("iPhone：一度指を離したあとは、持ち上がると「ぽっ」", JSON.stringify(second) === '["lift"]', JSON.stringify(second));
    c.check("iPhone のふりでもエラーなし", e2.length === 0, e2.join(" | "));
    await b2.close();
  }
  c.done();
})();
