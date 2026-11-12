/* 配信の守り（セキュリティ S1、2026年10月23日）。docs/dev.md「配信の守り」。門に入れる。

   - index.html の CSP が決めた形のまま（足しも削りもしない。変えるならここも直す）
   - 道具の頁（tools/calendar.html・diary-import.html）にも CSP があり、直書きのスクリプトは
     sha256 で許したものだけ（中身を直したら、頁の meta の値も直す——ここが値を出す）
   - 配る頁と js/・sw.js に、外から読むスクリプトが無い
   - js/・sw.js に eval と new Function が無い
   - 一通り動かしても、自分の origin と Dropbox 以外へ通信しない。道具の頁も CSP の違反なしに動く
   - 1ファイル版（build-standalone.js）にも CSP があり、起ち上がって違反が出ない（dist/ は .gitignore）
   - よその頁の枠（iframe）の中では見せない（js/frame-guard.js。meta の CSP では frame-ancestors が効かない）
   - 天気（F6 の D3・js/weather.js）：宛ては api.open-meteo.com だけで、書くのは weather.js だけ。場所を選ぶまで行かない。
     選んだら送るのは 0.1度に丸めた緯度経度と日数だけ・一日一度・電波が無ければ行かない。取った日の行に絵と「最高°／最低°」 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { open, checker, ROOT } = require("./lib");

/* index.html の CSP。connect-src の https: は中継所（利用者が URL を入れる）・同期の部屋・Dropbox のため。
   wss://*.workers.dev は同期の部屋の知らせ（WebSocket。docs/sync.md）。 */
const INDEX_CSP = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "img-src": ["'self'", "data:", "blob:"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "connect-src": ["'self'", "https:", "wss://*.workers.dev"],
  "form-action": ["'none'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
};
/* 道具の頁。配らない見本（notes-proto*・todo-proto）は pages.yml が消すので見ない。 */
const TOOLS = ["tools/calendar.html", "tools/diary-import.html"];
/* Dropbox の宛て：api・content（記録）・www（認可の頁へ移るだけ）・notify（ノートの同期の待ち受け）。 */
const DROPBOX = ["api.dropboxapi.com", "content.dropboxapi.com", "www.dropbox.com", "notify.dropboxapi.com"];
/* 天気（D3）。利用者が場所を選んだときだけ。 */
const WEATHER = "api.open-meteo.com";

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const cspOf = (html) => {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!m) return null;
  const o = {};
  for (const part of m[1].split(";")) {
    const [k, ...v] = part.trim().split(/\s+/);
    if (k) o[k] = v;
  }
  return o;
};
const sha = (s) => `'sha256-${crypto.createHash("sha256").update(s, "utf8").digest("base64")}'`;
const jsFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? jsFiles(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);

let browser;
(async () => {
  const t = checker("security-gate");

  /* ---------------- 読むだけ ---------------- */
  const index = cspOf(read("index.html"));
  const want = Object.entries(INDEX_CSP).map(([k, v]) => `${k} ${v.join(" ")}`).sort();
  const have = index ? Object.entries(index).map(([k, v]) => `${k} ${v.join(" ")}`).sort() : [];
  t.check("index.html の CSP が決めた形", JSON.stringify(want) === JSON.stringify(have),
    `余分：${have.filter((x) => !want.includes(x)).join(" / ")}　足りない：${want.filter((x) => !have.includes(x)).join(" / ")}`);

  for (const f of TOOLS) {
    const html = read(f);
    const c = cspOf(html);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const missing = inline.map(sha).filter((h) => !(c && c["script-src"].includes(h)));
    t.check(`${f}：CSP がある（default-src 'none'・eval と直書きは許さない）`, !!c
      && String(c["default-src"]) === "'none'" && String(c["object-src"]) === "'none'"
      && String(c["form-action"]) === "'none'" && !/unsafe-(eval|inline)/.test(String(c["script-src"])), JSON.stringify(c));
    t.check(`${f}：直書きのスクリプトはみな sha256 で許してある`, !missing.length, `meta に入れる値：${missing.join(" ")}`);
  }

  /* 外から読むスクリプト：配る頁の <script src> は同じ場所だけ。js/ は importScripts・外の import をしない。 */
  const pages = ["index.html", ...TOOLS, ...fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "index.html")];
  const outside = [];
  for (const f of pages) {
    for (const m of read(f).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]*)"/g)) {
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1])) outside.push(`${f}: ${m[1]}`);
    }
  }
  const js = [...jsFiles("js"), "sw.js"];
  for (const f of js) {
    const s = read(f);
    if (/\bimportScripts\s*\(/.test(s)) outside.push(`${f}: importScripts`);
    if (/\b(?:import\s*\(|from)\s*["'`](?:https?:)?\/\//.test(s)) outside.push(`${f}: 外の import`);
  }
  t.check("外から読むスクリプトが無い", !outside.length, outside.join(" / "));

  const evals = js.filter((f) => /\beval\s*\(|\bnew\s+Function\s*\(/.test(read(f)));
  t.check("js/・sw.js に eval と new Function が無い", !evals.length, evals.join(", "));
  const wxIn = js.filter((f) => read(f).includes(WEATHER));
  t.check("天気の宛ては js/weather.js だけが持つ", JSON.stringify(wxIn) === JSON.stringify(["js/weather.js"]), wxIn.join(", "));

  /* ---------------- 動かして、宛てを見る ---------------- */
  const o = await open();
  browser = o.browser;
  const { page, errors } = o;
  const ctx = page.context();
  const self = new URL(page.url()).origin;
  const away = [];
  const wx = [];
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin === self) return r.continue();
    if (/^(data|blob|file):$/.test(u.protocol)) return r.continue();
    if (u.protocol === "https:" && u.hostname === WEATHER) {
      /* 天気は数えて、決まった答えを返す（過ぎた past_days 日と今日。どの日も印 2・14°・6°）。 */
      wx.push(u);
      const n = Number(u.searchParams.get("past_days")) || 0;
      const time = [...Array(n + 1)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - n + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ daily: { time, weather_code: time.map(() => 2), temperature_2m_max: time.map(() => 14.2),
          temperature_2m_min: time.map(() => 5.6) } }) });
    }
    if (!(u.protocol === "https:" && DROPBOX.includes(u.hostname))) away.push(u.origin);
    return r.abort();   // 試験では外へは出ない（Dropbox も数えるだけ）
  });
  const violations = [];
  await ctx.exposeFunction("__cspSeen", (d) => violations.push(d));
  await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation",
    (e) => window.__cspSeen(`${location.pathname} ${e.violatedDirective} ${e.blockedURI}`)));

  await page.reload();
  await page.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen());
  await page.evaluate(() => KN.store.loadSample());
  for (const id of ["archive", "notes", "todo", "list", "prices", "diet", "settings", "archive"]) {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, id);
    await page.evaluate(() => { const s = document.scrollingElement; s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });
  }
  t.check("一通り動かしても、自分の origin と Dropbox 以外へ通信しない", !away.length, [...new Set(away)].join(", "));
  t.check("アプリで CSP の違反が出ない", !violations.length && !errors.length, [...violations, ...errors].join(" / "));
  t.check("天気：場所を選ぶまでは取りに行かない", !wx.length, wx.map(String).join(" "));

  /* 天気（D3）：場所を選ぶと一度だけ。送るのは丸めた緯度経度と日数。daily の今日の行に絵と「14°／6°」。 */
  await page.evaluate(() => KN.weather.setPlace({ lat: 35.6895, lon: 139.6917, name: "東京都" }));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(600);
  const sent = wx[0] ? [...wx[0].searchParams.keys()].sort().join(",") : "";
  t.check("天気：選ぶと一度だけ、0.1度に丸めた緯度経度で", wx.length === 1 && wx[0].searchParams.get("latitude") === "35.7"
    && wx[0].searchParams.get("longitude") === "139.7" && wx[0].searchParams.get("past_days") === "92", wx.map(String).join(" "));
  t.check("天気：送るのは場所と日数と欲しい欄だけ", sent === "daily,forecast_days,latitude,longitude,past_days,timezone", sent);
  const wxRow = await page.evaluate(() => {
    const e = document.querySelector(`#screen-archive .arc-log-row[data-day="${KN.util.todayKey()}"] .arc-log-wx`);
    return e ? { text: e.innerText.trim(), label: e.getAttribute("aria-label"), ico: !!e.querySelector('[data-ico="cloud-sun"]') } : null;
  });
  t.check("天気：今日の行の頭に絵と「14°／6°」", wxRow && wxRow.text === "14°／6°" && wxRow.ico && /最高14度 最低6度/.test(wxRow.label), JSON.stringify(wxRow));
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("kn-weather-place")));
  t.check("天気：場所は丸めて端末だけに（記録には入らない）", kept && kept.lat === 35.7 && kept.lon === 139.7
    && !JSON.stringify(await page.evaluate(() => KN.store.get())).includes("139.7"), JSON.stringify(kept));
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(300);
  t.check("天気：同じ日にもう一度開いても行かない", wx.length === 1, String(wx.length));
  await ctx.setOffline(true);
  const off = await page.evaluate(() => { KN.weather.setPlace({ lat: 34.69, lon: 135.52, name: "大阪府" }); return navigator.onLine; });
  await page.waitForTimeout(300);
  await ctx.setOffline(false);
  t.check("天気：電波が無ければ行かない", off === false && wx.length === 1, `${off} ${wx.length}`);
  await page.evaluate(() => KN.weather.setPlace(null));
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(300);
  t.check("天気：場所を外すと出さず、行かない", wx.length === 1
    && await page.evaluate(() => !document.querySelector("#screen-archive .arc-log-wx")), String(wx.length));

  /* カレンダーの受け渡し：# の後ろの予定が読めて、札が出る（頁は 250ms 後に blob: へ移るので、その前に見る） */
  const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:test\r\nDTSTART:20261023T0900\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  const cal = await ctx.newPage();
  await cal.goto(`${self}/tools/calendar.html#${Buffer.from(ics).toString("base64url")}`);
  const shown = await cal.evaluate(() => !document.getElementById("card").hidden && document.getElementById("what").textContent);
  t.check("calendar.html のスクリプトが動く", shown === "test", String(shown));
  await cal.close();

  /* 日記の取り込み：pdf.js（同じ場所の worker）で字を取り出せる */
  const pdf = tinyPdf("2026-10-23 hello");
  const di = await ctx.newPage();
  await di.goto(`${self}/tools/diary-import.html`);
  await di.setInputFiles("#file", { name: "t.pdf", mimeType: "application/pdf", buffer: pdf });
  const peek = await di.waitForFunction(() => !document.getElementById("s-peek").hidden
    && document.getElementById("peek").textContent, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => "");
  t.check("diary-import.html が PDF を読める", /hello/.test(peek), peek);
  await di.close();

  t.check("道具の頁で CSP の違反が出ず、外へも出ない", !violations.length && !away.length && !errors.length,
    [...violations, ...away, ...errors].join(" / "));

  /* 1ファイル版（build-standalone.js）にも CSP。組んで、ファイルのままと置いた版の両方で起ち上がり、違反が出ない。 */
  const built = spawnSync(process.execPath, [path.join(ROOT, "build-standalone.js")], { encoding: "utf8" });
  for (const [name, at] of [["kaimono-note.html", `file://${path.join(ROOT, "dist", "kaimono-note.html")}`],
    ["web/index.html", `${self}/dist/web/index.html`]]) {
    const html = built.status === 0 ? read(`dist/${name}`) : "";
    const c = cspOf(html);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    t.check(`1ファイル版 ${name}：CSP があり、直書きはみな sha256 で許してある`, !!c
      && inline.length > 0 && inline.every((s) => c["script-src"].includes(sha(s)))
      && !/unsafe-(eval|inline)/.test(String(c["script-src"])) && String(c["object-src"]) === "'none'",
      built.stderr || JSON.stringify(c && c["script-src"]));
    const one = await ctx.newPage();
    const pageErr = [];
    one.on("pageerror", (e) => pageErr.push(e.message));
    const before = violations.length;
    await one.goto(at);
    const up = await one.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen(), null, { timeout: 20000 })
      .then(() => true, () => false);
    t.check(`1ファイル版 ${name}：起ち上がり、CSP の違反が出ない`, up && violations.length === before && !pageErr.length,
      [...violations.slice(before), ...pageErr].join(" / "));
    await one.close();
  }

  /* よその頁の枠の中では見せない（js/frame-guard.js）。ふつうに開けば見える。1ファイル版は枠でも止めない。 */
  const shownIn = async (f) => f.evaluate(() => getComputedStyle(document.documentElement).display !== "none");
  const top = await ctx.newPage();
  await top.goto(`${self}/index.html`);
  await top.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen());
  t.check("ふつうに開いたアプリは見える", await shownIn(top));
  await top.close();
  const host = await ctx.newPage();
  await host.setContent(`<iframe src="${self}/index.html" width="390" height="600"></iframe>
    <iframe src="${self}/dist/kaimono-note.html" width="390" height="600"></iframe>`);
  const [app, solo] = host.frames().slice(1);
  await Promise.all([app, solo].map((f) => f.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen(), null, { timeout: 20000 })
    .catch(() => {})));
  t.check("よその頁の枠に入れたアプリは隠れる", !(await shownIn(app)));
  t.check("1ファイル版は枠の中でも見える", await shownIn(solo));
  await host.close();

  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; if (browser) browser.close(); });

/* 字が一行だけの PDF（Helvetica）。xref の位置はここで数える。 */
function tinyPdf(text) {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at = [];
  objs.forEach((b, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
