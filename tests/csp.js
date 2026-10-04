/* 二つ目の鍵（CSP、R29）。
   - index.html に CSP の meta がある（script-src 'self'・object-src 'none'・base-uri 'self'）
   - 漏れた字が作るスクリプトは動かない：onerror の直書き・<script> の直書き
   - 使っているものは止まらない：data: の絵（写真）・blob: の絵・自分のスクリプト・https への fetch
   - 4タブと設定を開いても、CSP の違反が一つも出ない（lib.js は違反をエラーとして数える） */
const { open, checker } = require("./lib");

let browser;
(async () => {
  const t = checker("csp");
  const o = await open();
  browser = o.browser;
  const { page, errors } = o;
  const violations = [];
  await page.exposeFunction("__cspSeen", (d) => violations.push(d));
  await page.evaluate(() => document.addEventListener("securitypolicyviolation",
    (e) => window.__cspSeen(`${e.violatedDirective} ${e.blockedURI}`)));

  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.content : "";
  });
  t.check("CSP の meta がある", /script-src 'self'/.test(meta) && /object-src 'none'/.test(meta)
    && /base-uri 'self'/.test(meta) && !/unsafe-eval/.test(meta) && !/script-src[^;]*unsafe-inline/.test(meta), meta);

  /* ふつうに使う：4タブと設定 */
  for (const id of ["archive", "todo", "list", "diet", "settings"]) {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, id);
    await page.waitForTimeout(150);
  }
  t.check("4タブと設定を開いても、違反が出ない", !violations.length && !errors.length,
    [...violations, ...errors].join(" / "));

  /* 使っているもの：data: と blob: の絵・https への fetch（窓口は page.route で受ける） */
  await page.route("https://relay.invalid/**", (r) => r.fulfill({ status: 200, body: "ok",
    headers: { "Access-Control-Allow-Origin": "*" } }));
  const used = await page.evaluate(async () => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(png.split(",")[1]), (c) => c.charCodeAt(0));
    const blob = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const net = await fetch("https://relay.invalid/x").then((r) => r.ok, () => false);
    return { data: await load(png), blob: await load(blob), net };
  });
  t.check("data: の絵（写真）が読める", used.data);
  t.check("blob: の絵が読める", used.blob);
  t.check("https への fetch（中継所・AI の窓口・Dropbox）が通る", used.net);

  /* 漏れた字が作るスクリプトは動かない（ここは違反が出てよい） */
  const before = violations.length;
  const leaked = await page.evaluate(async () => {
    const box = document.createElement("div");
    box.innerHTML = '<img src="data:," onerror="window.__pwn1 = 1"><img src="x-nope:" onerror="window.__pwn1 = 1">';
    document.body.append(box);
    const s = document.createElement("script");
    s.textContent = "window.__pwn2 = 1";
    document.body.append(s);
    await new Promise((r) => setTimeout(r, 300));
    box.remove(); s.remove();
    return { a: !!window.__pwn1, b: !!window.__pwn2 };
  });
  t.check("onerror の直書きは動かない", !leaked.a);
  t.check("<script> の直書きは動かない", !leaked.b);
  t.check("止めたときは違反として見える", violations.length > before, String(violations.length - before));

  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; if (browser) browser.close(); });
