/* 変換を決める改行で、手順が増えたり題が閉じたりしない——その見張り（roadmap-seamless の N5）。

   一、画面を開かない：js/ の中で "Enter" を直に比べる行が KN.util.isEnter の外に無い。
   二、開く：keyCode 229・isComposing の改行は素通り、ただの改行だけが効く。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/ime-enter.js */
const fs = require("fs");
const path = require("path");
const { open, checker, ROOT } = require("./lib");

(async () => {
  const t = checker("ime-enter");

  /* ---- 一、字面 ---- */
  const dir = path.join(ROOT, "js");
  const stray = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
      if (!/["'`]Enter["'`]/.test(line)) return;
      if (f === "util.js" && /function isEnter\(/.test(line)) return;
      stray.push(`${f}:${i + 1}`);
    });
  }
  t.check("\"Enter\" を比べるのは isEnter だけ", !stray.length, stray.join(" "));

  /* ---- 二、画面 ---- */
  const { browser, page, errors } = await open();
  const key = (sel, init) => page.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, o)));
  }, [sel, init]);

  const pure = await page.evaluate(() => {
    const k = (o) => KN.util.isEnter(new KeyboardEvent("keydown", Object.assign({ key: "Enter" }, o)));
    return { plain: k({}), ime: k({ isComposing: true }), k229: k({ keyCode: 229 }), other: KN.util.isEnter(new KeyboardEvent("keydown", { key: "a" })) };
  });
  t.check("isEnter：ただの改行は真", pure.plain === true);
  t.check("isEnter：変換中・229・ほかのキーは偽", !pure.ime && !pure.k229 && !pure.other, JSON.stringify(pure));

  await page.evaluate(() => { KN.app.showScreen("todo"); KN.screens.todo.open(); });
  await page.waitForSelector(".js-sub-add", { state: "attached" });
  await page.evaluate(() => document.querySelector(".js-sub-add").click());
  await page.waitForTimeout(150);
  const subs = () => page.evaluate(() => document.querySelectorAll(".js-sub").length);
  t.check("手順の欄は改行キーが「改行」", await page.evaluate(() => document.querySelector(".js-sub").getAttribute("enterkeyhint")) === "enter");

  await key(".js-sub", { keyCode: 229 });
  await key(".js-sub", { isComposing: true });
  await page.waitForTimeout(100);
  t.check("手順：変換を決める改行では増えない", await subs() === 1, `${await subs()}`);
  await key(".js-sub", {});
  await page.waitForTimeout(100);
  t.check("手順：ただの改行で次の手順", await subs() === 2, `${await subs()}`);

  const title = ".hero-title.js-title";
  t.check("題の欄は改行キーが「完了」", await page.evaluate((s) => document.querySelector(s).getAttribute("enterkeyhint"), title) === "done");
  await key(title, { keyCode: 229 });
  t.check("題：変換を決める改行では閉じない", await page.evaluate((s) => document.activeElement === document.querySelector(s), title));
  await key(title, {});
  t.check("題：ただの改行でキーボードを下ろす", await page.evaluate((s) => document.activeElement !== document.querySelector(s), title));

  t.check("探す欄は改行キーが「検索」", await page.evaluate(() =>
    [...document.querySelectorAll(".search-input")].every((el) => el.getAttribute("enterkeyhint") === "search")));

  t.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
