/* DIAG（一時）：WebKit 26.6 で scroll-anchor の「暦を払う」が固まって落ちる件の切り分け。
   1) 頁に入る前に、アプリの呼ばれ口（rAF・タイマー・イベント・観察者・then）を包み、入った／出たを Worker へ送る。
      固まったとき Worker が「入ったまま出ていない口」を報告すれば、アプリの JS が回り続けている。
      口がすべて出ていれば、JS の外（WebKit の中）で止まっている。
   2) 頁が3秒応えなければ、WebKit の頁のプロセスのスタックを gdb で撮る（dump.sh）。
   走らせ方：KN_BROWSER=webkit KN_SCENE=暦を払う node tests/diag/run.js */
const { execSync } = require("child_process");
const path = require("path");
const lib = require("../lib");
const orig = lib.open;

function tracer() {
  let w;
  try { w = new Worker("/tests/diag/worker.js"); } catch (e) { return; }
  const send = (m) => { try { w.postMessage(m); } catch (_) {} };
  const SI = window.setInterval.bind(window);
  SI(() => send(["H"]), 100);
  let id = 0;
  const names = new WeakMap();
  const label = (kind, f, extra) => {
    let s = names.get(f);
    if (!s) { s = (f.name || "anon") + ":" + String(f).replace(/\s+/g, " ").slice(0, 70); names.set(f, s); }
    return kind + (extra ? "(" + extra + ")" : "") + " " + s;
  };
  const wrap = (kind, f, extra) => (typeof f !== "function" ? f : function (...a) {
    const n = ++id;
    send(["E", n, label(kind, f, extra)]);
    try { return f.apply(this, a); } finally { send(["X", n]); }
  });
  const rAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => rAF(wrap("raf", f));
  const ST = window.setTimeout.bind(window);
  window.setTimeout = (f, ...a) => ST(wrap("timeout", f), ...a);
  window.setInterval = (f, ...a) => SI(wrap("interval", f), ...a);
  const QM = window.queueMicrotask.bind(window);
  window.queueMicrotask = (f) => QM(wrap("microtask", f));
  const then = Promise.prototype.then;
  Promise.prototype.then = function (a, b) { return then.call(this, wrap("then", a), wrap("catch", b)); };
  const map = new WeakMap();
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) {
    if (typeof f !== "function") return add.call(this, t, f, o);
    let byType = map.get(f);
    if (!byType) { byType = {}; map.set(f, byType); }
    const g = byType[t] || (byType[t] = wrap("ev", f, t));
    return add.call(this, t, g, o);
  };
  EventTarget.prototype.removeEventListener = function (t, f, o) {
    const g = typeof f === "function" && map.get(f) && map.get(f)[t];
    return rem.call(this, t, g || f, o);
  };
  ["MutationObserver", "ResizeObserver", "IntersectionObserver"].forEach((k) => {
    const C = window[k];
    if (!C) return;
    window[k] = class extends C { constructor(f, o) { super(wrap(k, f), o); } };
  });
}

lib.open = async (opts = {}) => {
  const before = opts.before;
  const r = await orig({ ...opts, before: async (cx, p) => { await cx.addInitScript(tracer); if (before) await before(cx, p); } });
  const t0 = Date.now();
  let dumped = false, alive = true;
  r.browser.on("disconnected", () => { alive = false; });
  r.page.on("crash", () => console.log(`DIAG page crash event at +${Date.now() - t0}ms ${new Date().toISOString()}`));
  (async () => {
    while (alive && !dumped) {
      await new Promise((ok) => setTimeout(ok, 1000));
      if (!alive) break;
      const ok = await Promise.race([r.page.evaluate(() => 1).then(() => true, () => true),
        new Promise((res) => setTimeout(() => res(false), 3000))]);
      if (!ok && alive) {
        dumped = true;
        console.log(`DIAG hang: no answer for 3s at ${new Date().toISOString()} — dumping stacks`);
        try { execSync(`bash ${path.join(__dirname, "dump.sh")} /tmp/diag-stacks.log`, { stdio: "inherit", timeout: 120000 }); }
        catch (e) { console.log("DIAG dump failed", String(e).slice(0, 200)); }
        console.log(`DIAG dump done at ${new Date().toISOString()}`);
      }
    }
  })();
  return r;
};

require("../scroll-anchor.js");
