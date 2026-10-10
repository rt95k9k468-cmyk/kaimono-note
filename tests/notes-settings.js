/* ノートの設定（docs/notes.md の「設定」）。

   daily の歯車からも、ノートの面の歯車からも、daily の下に notes の見出しで
   並び・ノートブック・タグ・書き出し／「並び」は daily の表示から移った（鍵は
   notesOrder のまま）／ノートブックの名前を付け替える（最近削除のノートも・
   更新日は動かない・題が追いかける）／色を選ぶと一覧のカードもその色／もうある
   名前へ付け替えると訊いてからまとめる（色はまとめ先）／タグを外してもノートは
   残る／書き出し：1件ずつ（zip、ノートブックはフォルダ・頭に作った日など）・
   1つにまとめる（題が一番上の見出し・本文の見出しは一段下げる）・★で絞る・
   ダウンロードした zip が壊れていない（python の zipfile で確かめる）／
   数・評価の言葉・絵文字を出さない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-settings.js */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { open, checker } = require("./lib");

const FORBIDDEN = ["目標", "連続", "達成", "割合", "先月", "前月", "平均", "件"];

/** python の zipfile で開いて、壊れていないか・名前・中身を返す。 */
function readZip(file) {
  const py = `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
out = {"bad": bad, "names": z.namelist(), "files": {}}
for n in z.namelist():
    if not n.endswith("/"):
        out["files"][n] = z.read(n).decode("utf-8")
print(json.dumps(out, ensure_ascii=False))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, file], { encoding: "utf8" }));
}

(async () => {
  const t = checker("notes-settings");
  const { browser, page, errors } = await open();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "notes-set-"));

  const top = ".set-layer:last-child";
  const rowOf = (text) => page.locator(`${top} .set-row`, { hasText: text }).first();
  const topText = () => page.locator(top).innerText();
  const heads = () => page.$$eval(`${top} .set-head`, (hs) => hs.map((h) => h.textContent.trim()));
  const navTitle = () => page.$eval(`${top} .js-nav-title`, (e) => e.textContent);
  const layers = () => page.locator(".set-layer").count();
  /* 一枚が押し出し終わるまで待つ。動いているあいだの押しは、画面がわざと捨てる（二重に積まない。
     screen-settings.js の moving）。決め打ちの300msは押し出し（2フレーム＋--m-push＋20ms）と競って、まれに捨てられていた。 */
  const layerStill = () => page.waitForFunction(() => !document.querySelector(".set-layer.is-edge-lift"));
  /* last … 同じ名前の行が二つあるとき（daily と notes の「書き出し」）は下のほう。 */
  const into = async (text, last) => {
    const n = await layers();
    const rows = page.locator(`${top} .set-row`, { hasText: text });
    await (last ? rows.last() : rows.first()).click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length > k, n);
    await layerStill();
    await page.waitForTimeout(300);
  };
  const back = async () => {
    const n = await layers();
    await layerStill();
    await page.locator(`${top} .set-back`).first().click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length < k, n);
    await layerStill();
    await page.waitForTimeout(300);
  };
  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const openSettings = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForTimeout(300);
  };
  const confirmOk = async (label) => {
    await page.waitForSelector(".sheet.is-open .js-ok");
    t.check(`確認の「${label}」`, (await page.$eval(".sheet.is-open .js-ok", (b) => b.textContent.trim())) === label);
    await page.click(".sheet.is-open .js-ok");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"));
    await page.waitForTimeout(300);
  };

  /* ---- 材料 ---- */
  await page.evaluate(() => KN.notes.ready());
  const ids = await page.evaluate(() => {
    const mk = (p) => { const n = Object.assign(KN.notes.draft(), p); KN.notes.put(n); return n.id; };
    const a = mk({ title: "京都の宿", body: "# 一日目\n- 朝ごはん\n- [x] 予約", notebook: "旅", tags: ["料理", "雑記"], fav: true,
                   createdAt: "2018-05-01T11:20:00.000Z", updatedAt: "2018-05-02T01:00:00.000Z" });
    const b = mk({ title: "", body: "献立の一行目\n二行目", notebook: "仕事", tags: ["料理"],
                   createdAt: "2019-01-01T00:00:00.000Z", updatedAt: "2019-01-02T00:00:00.000Z", noTime: true });
    const c = mk({ title: "消したノート", body: "x", notebook: "旅", createdAt: "2020-01-01T00:00:00.000Z" });
    const d = mk({ title: "京都の宿", body: "同じ題", createdAt: "2021-01-01T00:00:00.000Z", updatedAt: "2021-01-01T00:00:00.000Z" });
    const e = mk({ title: "京都の宿", body: "もう一つ" });
    KN.notes.remove(c);
    return { a, b, c, d, e };
  });
  await page.evaluate(() => KN.notes.flush());

  /* ---- 置き場所 ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await settled("archive");
  await openSettings();
  t.check("daily の歯車：daily → notes → General の順", (await heads()).join() === "daily,notes,General", (await heads()).join());
  const R0 = await topText();
  t.check("notes に並び・ノートブック・タグ・書き出し",
    ["並び", "ノートブック", "タグ", "書き出し"].every((x) => R0.includes(x)) && R0.includes("「あの日」を出す"), R0.slice(0, 300));
  t.check("並びの右に「直した日」", /並び\s*直した日/.test(R0));
  await into("表示");
  t.check("daily の表示に「ノートの並び」はもう無い", !(await topText()).includes("ノートの並び"));
  await back();

  await page.evaluate(() => KN.app.showScreen("archive"));
  await settled("archive");
  await page.click('.tab[data-tab="archive"]');
  await settled("notes");
  await openSettings();
  t.check("ノートの面の歯車でも daily → notes → General", (await heads()).join() === "daily,notes,General", (await heads()).join());

  /* ---- 並び ---- */
  await into("並び");
  await page.locator(`${top} .set-row.is-choice`, { hasText: "作った日" }).click();
  await page.waitForTimeout(400);
  t.check("並びを作った日に（鍵は notesOrder）", (await page.evaluate(() => KN.store.get().settings.notesOrder)) === "created");
  t.check("根っこの値も作った日", /並び\s*作った日/.test(await topText()));
  await page.evaluate(() => { KN.store.update((s) => { delete s.settings.notesOrder; }); });

  /* ---- ノートブック ---- */
  await into("ノートブック");
  const books = await page.$$eval(`${top} .set-row .set-title`, (r) => r.map((x) => x.textContent));
  t.check("ノートブックの一覧（消していないノートから）", books.join() === "仕事,旅", books.join());
  const tile = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".set-layer:last-child .set-row")].find((r) => r.textContent.includes("旅"));
    return { got: getComputedStyle(row.querySelector(".set-tile")).backgroundColor, want: KN.screens.notes.colorOf("nb", "旅") };
  });
  const hex = (rgb) => "#" + rgb.match(/\d+/g).slice(0, 3).map((x) => Number(x).toString(16).padStart(2, "0")).join("");
  t.check("行の四角はそのノートブックの色", hex(tile.got) === tile.want, `${tile.got} ${tile.want}`);

  await into("旅");
  t.check("一枚の題は名前", (await navTitle()) === "旅");
  const before = await page.evaluate((x) => KN.notes.get(x.a).updatedAt, ids);
  await page.fill(`${top} .js-name`, "旅行");
  await page.press(`${top} .js-name`, "Enter");
  await page.waitForTimeout(400);
  const ren = await page.evaluate((x) => ({
    a: KN.notes.get(x.a).notebook, c: KN.notes.get(x.c).notebook, upd: KN.notes.get(x.a).updatedAt,
    books: KN.notes.notebooks(),
  }), ids);
  t.check("付け替えると、最近削除のノートも新しい名前に", ren.a === "旅行" && ren.c === "旅行", JSON.stringify(ren));
  t.check("付け替えても更新日は動かない", ren.upd === before);
  t.check("題が新しい名前を追いかける", (await navTitle()) === "旅行");

  await page.locator(`${top} .note-colors .accent-dot`).nth(3).click();
  await page.waitForTimeout(300);
  const col = await page.evaluate(() => ({
    saved: KN.store.get().settings.noteColors,
    now: KN.screens.notes.colorOf("nb", "旅行"),
    on: document.querySelector(".set-layer:last-child .note-colors .accent-dot.is-on").getAttribute("aria-label"),
  }));
  t.check("色を選ぶと noteColors に入る", col.saved.nb["旅行"] === "#5b9bd5" && col.now === "#5b9bd5", JSON.stringify(col.saved));
  t.check("選んだ色に輪", col.on === "青", col.on);

  /* もうある名前へ → 訊いてからまとめる */
  await page.fill(`${top} .js-name`, "仕事");
  await page.press(`${top} .js-name`, "Enter");
  await confirmOk("まとめる");
  const mg = await page.evaluate((x) => ({
    a: KN.notes.get(x.a).notebook, c: KN.notes.get(x.c).notebook,
    books: KN.notes.notebooks(), colors: KN.store.get().settings.noteColors.nb,
  }), ids);
  t.check("まとめると一つのノートブックに", mg.books.join() === "仕事" && mg.a === "仕事" && mg.c === "仕事", JSON.stringify(mg));
  t.check("まとめた側の色は捨てる", !("旅行" in mg.colors), JSON.stringify(mg.colors));
  t.check("題は「仕事」", (await navTitle()) === "仕事");
  await back();
  await back();

  /* ---- タグ ---- */
  await into("タグ");
  const tagRows = await page.$$eval(`${top} .set-row .set-title`, (r) => r.map((x) => x.textContent));
  t.check("タグの一覧", tagRows.slice().sort().join() === ["料理", "雑記"].sort().join(), tagRows.join());
  await into("雑記");
  await page.fill(`${top} .js-name`, "料理");
  await page.press(`${top} .js-name`, "Enter");
  await confirmOk("まとめる");
  t.check("タグをまとめると重ならない", JSON.stringify(await page.evaluate((x) => KN.notes.get(x.a).tags, ids)) === '["料理"]');
  await page.locator(`${top} .set-row.is-danger`).click();
  await confirmOk("外す");
  await page.waitForFunction(() => document.querySelectorAll(".set-layer").length === 2);
  await page.waitForTimeout(300);
  const rm = await page.evaluate((x) => ({ a: KN.notes.get(x.a), b: KN.notes.get(x.b), tags: KN.notes.tagNames() }), ids);
  t.check("タグを外してもノートは残る", !!rm.a && !!rm.b && !rm.tags.length && !rm.a.tags.length, JSON.stringify(rm.tags));
  await back();
  t.check("タグが無くなったら根っこにタグの行は出ない", !/\nタグ\n/.test("\n" + (await topText()) + "\n"));

  /* 一覧のカードは選んだ色（仕事に色を付けて確かめる）。 */
  await page.evaluate(() => {
    KN.store.update((s) => { s.settings.noteColors = { nb: { "仕事": "#e07fa8" } }; });
    KN.screens.notes.render();
  });
  const card = await page.evaluate(() => {
    const ico = document.querySelector("#screen-notes .note-nb .nb-ico");
    return ico ? ico.style.getPropertyValue("--cat") : "";
  });
  t.check("一覧のカードも選んだ色", card === "#e07fa8", card);

  /* ---- 書き出し：中身 ---- */
  await page.evaluate((x) => KN.notes.setLabels(x.a, { tags: ["料理"] }), ids);
  const ex = await page.evaluate(() => {
    const list = KN.notesExport.notesIn(null);
    return {
      n: list.length,
      fav: KN.notesExport.notesIn({ k: "fav" }).length,
      one: KN.notesExport.oneFile(list),
    };
  });
  t.check("書き出すのは消していないノート", ex.n === 4, String(ex.n));
  t.check("★で絞れる", ex.fav === 1);
  t.check("1つにまとめる：題が一番上の見出し・本文の見出しは一段下げる",
    ex.one.includes("# 京都の宿\n") && ex.one.includes("\n## 一日目\n") && ex.one.includes("- [x] 予約"), ex.one.slice(0, 200));
  t.check("1つにまとめる：日だけのノートは時刻なし", ex.one.includes("2019年1月1日 ・ 仕事"), ex.one);
  t.check("1つにまとめる：題の無いノートは一行目を見出しに", ex.one.includes("# 献立の一行目\n"));

  /* ---- 書き出し：画面から zip ---- */
  await into("書き出し", true);
  t.check("書き出しの一枚", (await navTitle()) === "ノートを書き出す");
  const chips = await page.$$eval(`${top} .chip`, (c) => c.map((x) => x.getAttribute("aria-label") || x.textContent.trim()));
  t.check("何を書き出すかのチップ（すべて・★・ノートブック・タグ）", chips.join() === "すべて,★,仕事,料理", chips.join());
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.click(`${top} .js-zip`),
  ]);
  const zipName = dl.suggestedFilename();
  t.check("zip の名前", /^kurashi-notes-\d{8}\.zip$/.test(zipName), zipName);
  const zf = path.join(tmp, zipName);
  await dl.saveAs(zf);
  const z = readZip(zf);
  t.check("zip が壊れていない", z.bad === null, String(z.bad));
  t.check("ノートブックはフォルダ・同じ場所の同じ題は (2)",
    ["仕事/", "仕事/京都の宿.md", "仕事/献立の一行目.md", "京都の宿.md", "京都の宿 (2).md"].every((n) => z.names.includes(n))
      && z.names.length === 5,
    z.names.join(" | "));
  t.check("最近削除のノートは入らない", !z.names.some((n) => n.includes("消したノート")));
  const fa = z.files["仕事/京都の宿.md"] || "";
  /* created は端末の時間帯で書く（UTC の 5/1 11:20 は、UTC+13 より東では 5/2）。 */
  t.check("頭に作った日・直した日・ノートブック・タグ・★",
    /^---\ncreated: 2018-05-0[12]T\d\d:20:00[+-]\d\d:\d\d\nupdated: .+\nnotebook: "仕事"\ntags: \["料理"\]\nfavorite: true\n---\n\n# 京都の宿\n\n# 一日目\n- 朝ごはん\n- \[x\] 予約\n$/.test(fa), fa);
  const fb = z.files["仕事/献立の一行目.md"] || "";
  t.check("日だけのノートは created が日付だけ・題の無いノートは見出しを足さない",
    /^---\ncreated: 2019-01-01\n/.test(fb) && /---\n\n献立の一行目\n二行目\n$/.test(fb), fb);

  await page.locator(`${top} .chip[aria-label="★"]`).click();
  const [dl2] = await Promise.all([
    page.waitForEvent("download"),
    page.click(`${top} .js-one`),
  ]);
  t.check("★だけを1つの md に", /^kurashi-notes-star-\d{8}\.md$/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
  const mdf = path.join(tmp, "one.md");
  await dl2.saveAs(mdf);
  const md = fs.readFileSync(mdf, "utf8");
  t.check("★の md は★のノートだけ", md.includes("# 京都の宿") && !md.includes("献立"), md.slice(0, 120));

  /* ---- 言葉 ---- */
  await back();
  const texts = await page.$$eval(".set-layer", (ls) => ls.map((l) => l.innerText).join("\n"));
  const notesPart = texts.slice(texts.indexOf("notes"), texts.indexOf("General"));
  const bad = FORBIDDEN.filter((w) => notesPart.includes(w));
  t.check("notes の行に数・評価の言葉が無い", !bad.length, bad.join());
  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(texts));
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
