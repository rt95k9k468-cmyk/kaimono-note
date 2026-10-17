/* 飲みたくなった：手軽さ優先の紙（docs/health.md の「飲みたくなったとき」）。

   時計を 2026年10月8日21時に止めて。はじめの紙は二段（強さ・求めているもの）と詳細だけ・
   強さを押して「記録する」の二回で保存・結果は聞かない・札は固定で増えない・
   「あとで記入」から結果を書き足す・旧い記録は書き換えずに読みかえる・書き出し→戻すで変わらない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/urge-quick.js */
const { open, checker } = require("./lib");

const t = checker("urge-quick");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 9, 8, 21, 0)); },
  });

  // 旧い形の記録（その他の一言の欄が無い・結果が「もう少し待つ」・表に無い言葉）
  const OLD = {
    id: "ur_old1", day: "2026-10-08", time: "20:10", before: 5,
    scene: ["寝る前"], trigger: ["疲れた", "さみしい"], tried: ["水を飲む", "横になる"],
    after: null, outcome: "wait", memo: "旧いメモ", at: "2026-10-08T11:10:00.000Z", closedAt: null,
  };

  await page.evaluate(() => {
    KN.store.update((s) => { s.diet.urges = []; });
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(500);

  const openSheet = async () => {
    await page.click("#screen-diet .js-day-card .js-urge");
    await page.waitForSelector(".sheet.is-open .urge-form");
  };
  const sheetInfo = () => page.evaluate(() => {
    const sh = document.querySelector(".sheet.is-open");
    const vis = (e) => !e.closest("[hidden]");
    const secs = [...sh.querySelectorAll(".urge-sec")];
    const chipsOf = (title) => {
      const s = secs.find((x) => x.querySelector(".urge-sec-title").textContent === title);
      return s ? [...s.querySelectorAll(".chip")].map((c) => c.textContent.trim()) : null;
    };
    return {
      visible: secs.filter(vis).map((s) => s.querySelector(".urge-sec-title").textContent),
      want: chipsOf("いま何を求めている？"), scene: chipsOf("場面"), tried: chipsOf("試したこと"),
      saveOff: sh.querySelector(".js-save").disabled,
      text: sh.innerText,
    };
  });
  const urges = () => page.evaluate(() => JSON.parse(JSON.stringify(KN.store.get().diet.urges)));
  const chip = (title, label) => page.evaluate(([title, label]) => {
    const sh = document.querySelector(".sheet.is-open");
    const s = [...sh.querySelectorAll(".urge-sec")].find((x) => x.querySelector(".urge-sec-title").textContent === title);
    [...s.querySelectorAll(".chip")].find((c) => c.textContent.trim() === label).click();
  }, [title, label]);
  const waitClosed = () => page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 5000 });

  /* ---- A：はじめの紙 ---- */
  await openSheet();
  const a = await sheetInfo();
  t.check("はじめに見える段は二つ（強さ・求めているもの）", JSON.stringify(a.visible) === JSON.stringify(["いま、どれくらい飲みたいか", "いま何を求めている？"]), a.visible.join(","));
  t.check("求めているものは六つの札", JSON.stringify(a.want) === JSON.stringify(
    ["ストレス・疲れをほぐしたい", "ご褒美・区切りがほしい", "暇・手持ちぶさた", "習慣・いつもの流れ", "喉の渇き・空腹", "その他"]), String(a.want));
  t.check("場面は七つ・試したことは八つ（詳細の中）", a.scene && a.scene.length === 7 && a.tried && a.tried.length === 8);
  t.check("記録するときに結果は聞かない", !/飲まなかった|飲んだ|しばらく後/.test(a.text) && a.visible.length === 2);
  t.check("強さを選ぶまで保存できない", a.saveOff);
  t.check("絵文字なし", !EMOJI.test(a.text));

  /* ---- B：強さだけで、二回で保存 ---- */
  await page.click('.sheet.is-open .urge-lv[aria-label="4"]');
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  let u = await urges();
  t.check("強さだけで保存できる（日時は自動）", u.length === 1 && u[0].before === 4 && u[0].time === "21:00"
    && u[0].day === "2026-10-08" && u[0].outcome === null && u[0].after === null, JSON.stringify(u[0]));

  /* ---- C：「その他」の一言は残すが、札にはならない ---- */
  await openSheet();
  await page.click('.sheet.is-open .urge-lv[aria-label="3"]');
  await chip("いま何を求めている？", "その他");
  await page.fill(".sheet.is-open .js-want .js-other", "退屈");
  await chip("いま何を求めている？", "暇・手持ちぶさた");
  await page.click(".sheet.is-open .js-more");
  await chip("場面", "その他");
  await chip("場面", "帰宅後");
  await page.fill(".sheet.is-open .js-scene .js-other", "散歩の帰り");
  await chip("試したこと", "別の飲み物");
  await chip("試したこと", "少し待つ");
  await page.fill(".sheet.is-open .js-memo-in", "試験のメモ");
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  u = await urges();
  const c = u[1];
  t.check("その他の一言を保存する（求めているものも場面も重ねて選べる）", c
    && JSON.stringify(c.trigger) === '["その他","暇・手持ちぶさた"]' && c.triggerOther === "退屈"
    && JSON.stringify(c.scene) === '["その他","帰宅後"]' && c.sceneOther === "散歩の帰り"
    && JSON.stringify(c.tried) === '["別の飲み物","少し待つ"]' && c.memo === "試験のメモ", JSON.stringify(c));
  await openSheet();
  const c2 = await sheetInfo();
  t.check("次の紙でも札は増えない（6・7・8）", c2.want.length === 6 && c2.scene.length === 7 && c2.tried.length === 8
    && !c2.want.includes("退屈") && !c2.scene.includes("散歩の帰り"), [c2.want, c2.scene].join(" / "));
  await page.keyboard.press("Escape");
  await waitClosed().catch(() => {});

  /* ---- C2：別の飲み物の下の候補／時刻を選び直す／しばらく後の時刻 ---- */
  await openSheet();
  await page.click('.sheet.is-open .urge-lv[aria-label="2"]');
  await page.click(".sheet.is-open .js-more");
  const subsBefore = await page.$$eval(".sheet.is-open .js-sub .chip", (e) => e.length);
  await chip("試したこと", "別の飲み物");
  const subLabels = await page.$$eval(".sheet.is-open .js-sub .chip", (e) => e.map((x) => x.textContent.trim()));
  await chip("試したこと", "炭酸水");
  await chip("試したこと", "水");
  await page.evaluate(() => { const i = document.querySelector(".sheet.is-open .js-urge-time"); i.value = "20:30"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  u = await urges();
  const d = u[u.length - 1];
  t.check("別の飲み物を選ぶと下の候補が出て、飲み物:◯◯で残る", subsBefore === 0 && subLabels.includes("炭酸水") && subLabels.includes("ノンアル")
    && JSON.stringify(d.tried) === '["別の飲み物","飲み物:炭酸水","飲み物:水"]', JSON.stringify([subsBefore, subLabels, d.tried]));
  t.check("時刻を選び直せる", d.time === "20:30", d.time);
  const sum = await page.evaluate((id) => KN.store.updateUrge(id, { after: 1, afterTime: "21:45" }), d.id);
  t.check("しばらく後の時刻を持てる（古い記録は null）", sum.afterTime === "21:45" && u[0].afterTime === null, JSON.stringify([sum.afterTime, u[0].afterTime]));
  await page.evaluate((id) => KN.store.removeUrge(id), d.id);
  await page.reload();
  await page.waitForSelector("#screen-diet .js-day-card");

  /* ---- D：あとで記入 ---- */
  const later = () => page.evaluate(() => [...document.querySelectorAll("#screen-diet .js-day-card .js-later .urge-row")].length);
  const laterTitle = await page.evaluate(() => (document.querySelector("#screen-diet .urge-later-t") || {}).textContent);
  t.check("結果がまだの二件が「あとで記入」に並ぶ", (await later()) === 2 && laterTitle === "あとで記入", `${await later()} ${laterTitle}`);
  await page.click("#screen-diet .js-day-card .js-later .urge-row");
  await page.waitForSelector(".sheet.is-open .js-res");
  await page.click('.sheet.is-open .urge-lv[aria-label="2"]');
  await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .js-out .chip")].find((x) => x.textContent.trim() === "飲まなかった").click());
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  u = await urges();
  t.check("あとから強さと結果を書き足せる（ほかの欄はそのまま）", u[0].after === 2 && u[0].outcome === "none"
    && !!u[0].closedAt && u[0].before === 4 && u[0].time === "21:00", JSON.stringify(u[0]));
  t.check("書けば「あとで記入」から消える", (await later()) === 1);
  // あとの強さだけ書いた一件（結果は空）は並べない（前の版の記録で残り続けていた）
  await page.evaluate(() => {
    const id = KN.store.get().diet.urges[1].id;
    KN.store.updateUrge(id, { after: 1 });
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(300);
  t.check("あとの強さだけ書いた一件は「あとで記入」に残らない", (await later()) === 0, String(await later()));
  const warn = await page.evaluate(() => {
    const el = document.querySelector("#screen-diet .urge-bar");
    return /成功|失敗|連続|達成/.test(el.innerText) || !!el.querySelector(".is-warn, .is-bad, .is-good");
  });
  t.check("評価・警告色・連続日数を出さない", !warn);

  /* ---- E：旧い記録（戻したファイルから） ---- */
  const E = await page.evaluate((OLD) => {
    const S = KN.store;
    const file = JSON.parse(S.exportJSON());
    file.diet.urges.push(OLD);
    S.importJSON(JSON.stringify(file));
    KN.app.showScreen("diet");
    return JSON.parse(JSON.stringify(S.get().diet.urges.find((x) => x.id === OLD.id) || null));
  }, OLD);
  const keep = (x) => x && ["day", "time", "before", "scene", "trigger", "tried", "after", "outcome", "memo", "at"]
    .every((k) => JSON.stringify(x[k]) === JSON.stringify(OLD[k]));
  t.check("旧い形の記録を読み込める（言葉も結果も書き換えない）", keep(E), JSON.stringify(E));
  await page.waitForTimeout(300);
  const row = await page.evaluate(() => [...document.querySelectorAll("#screen-diet .js-later .urge-row")]
    .map((r) => r.innerText).find((s) => /20:10/.test(s)) || "");
  t.check("表示では新しい札に読みかえる（旧い「もう少し待つ」は試したことの「少し待つ」）",
    /その他（旧）/.test(row) && /ストレス・疲れをほぐしたい/.test(row) && /別の飲み物/.test(row) && /少し待つ/.test(row)
    && !/疲れた|水を飲む|もう少し待つ/.test(row), row);

  // 詳細の紙を開いて、触らずに保存しても旧い記録は変わらない
  await page.evaluate(() => [...document.querySelectorAll("#screen-diet .js-later .urge-row")].find((r) => /20:10/.test(r.innerText)).click());
  await page.waitForSelector(".sheet.is-open .js-full");
  await page.click(".sheet.is-open .js-full");
  await page.waitForFunction(() => document.querySelector(".sheet.is-open .js-memo-in"));
  const ed = await sheetInfo();
  t.check("旧い記録も編集の紙で開ける（その他（旧）の札が点く）", ed.want.includes("その他（旧）") && ed.scene.includes("その他（旧）"), String(ed.want));
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  const E2 = (await urges()).find((x) => x.id === OLD.id);
  t.check("触らずに保存しても旧い記録は書き換わらない", keep(E2), JSON.stringify(E2));

  // 編集：結果を選ぶと「待つ」は試したことへ移り、旧い言葉はそのまま
  await page.evaluate(() => [...document.querySelectorAll("#screen-diet .js-later .urge-row")].find((r) => /20:10/.test(r.innerText)).click());
  await page.waitForSelector(".sheet.is-open .js-res");
  await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .js-out .chip")].find((x) => x.textContent.trim() === "飲んだ").click());
  await page.click(".sheet.is-open .js-save");
  await waitClosed();
  const E3 = (await urges()).find((x) => x.id === OLD.id);
  t.check("旧い記録に結果を書くと、待つは試したことへ（旧い言葉は残る）", E3.outcome === "drank"
    && JSON.stringify(E3.tried) === '["水を飲む","横になる","少し待つ"]' && JSON.stringify(E3.trigger) === '["疲れた","さみしい"]', JSON.stringify(E3));

  /* ---- F：書き出し → 空 → 戻す ---- */
  const F = await page.evaluate(() => {
    const S = KN.store;
    const before = JSON.stringify(S.get().diet.urges);
    const file = S.exportJSON();
    S.reset(); const emptied = S.get().diet.urges.length;
    S.importJSON(file);
    return { same: before === JSON.stringify(S.get().diet.urges), emptied };
  });
  t.check("書き出し→空→戻すで、飲みたくなった記録が変わらない（その他の一言も）", F.same && F.emptied === 0);

  t.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
