/* Google 取り込み（js/google-import.js。docs/todo-items.md「Google 取り込み」）。
   偽の .ics と Tasks.json を File にして読ませる（zip は内側を note-notion の読み口で開く＝ここでは .ics／.json を直接）。
   確かめる：UTC の時刻は端末の時間に直す・過ぎた予定は済・読める型は一本・読めない型は一回ずつ・取り消された回／
   VALARM の中・タスクの済／これから・二度目は飛ばす・束ごと戻す・設定の行。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("Google 取り込み");
  const { browser, page, errors } = await open({ timezoneId: "Asia/Tokyo" });

  const r = await page.evaluate(async () => {
    const U = KN.util, today = U.todayKey();
    const fut = U.shiftDay(today, 10).replace(/-/g, ""), futNext = U.shiftDay(today, 11).replace(/-/g, "");
    const ics = [
      "BEGIN:VCALENDAR", "X-WR-CALNAME:テスト暦", "X-WR-TIMEZONE:Asia/Tokyo",
      // 単発・UTC 01:00Z は日本の 10:00。VALARM の中の DESCRIPTION は読まない。
      "BEGIN:VEVENT", "UID:a1", "DTSTART:20200302T010000Z", "DTEND:20200302T023000Z", "SUMMARY:過去の会議", "DESCRIPTION:本文", "LOCATION:会議室",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:アラーム", "END:VALARM", "STATUS:CONFIRMED", "END:VEVENT",
      // 終日・何日か（DTEND は含まない日）
      "BEGIN:VEVENT", "UID:a2", "DTSTART;VALUE=DATE:20200310", "DTEND;VALUE=DATE:20200313", "SUMMARY:出張", "END:VEVENT",
      // これからの単発・折り返し行
      "BEGIN:VEVENT", "UID:a3", `DTSTART:${fut}T000000Z`, `DTEND:${fut}T010000Z`, "SUMMARY:先の予", " 定", "END:VEVENT",
      // 取り消し
      "BEGIN:VEVENT", "UID:a4", "DTSTART;VALUE=DATE:20200401", "SUMMARY:消えた", "STATUS:CANCELLED", "END:VEVENT",
      // 毎月第1木曜（読める型）
      "BEGIN:VEVENT", "UID:m1", "DTSTART;VALUE=DATE:20240104", "DTEND;VALUE=DATE:20240105", "RRULE:FREQ=MONTHLY;BYDAY=1TH", "SUMMARY:月例", "END:VEVENT",
      // 隔週の月・水（読める型）
      "BEGIN:VEVENT", "UID:w1", "DTSTART;VALUE=DATE:20240101", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "SUMMARY:隔週", "END:VEVENT",
      // 期限つき（一回ずつ）：月末、2024-01-31〜2024-04-30 → 1/31, 2/29, 3/31, 4/30
      "BEGIN:VEVENT", "UID:u1", "DTSTART;VALUE=DATE:20240131", "RRULE:FREQ=MONTHLY;UNTIL=20240430;BYMONTHDAY=-1", "SUMMARY:月末", "END:VEVENT",
      // 一回だけ直した・外した（読める型でも過去の回は単発で、直した回は直したとおり・外した回は出ない）
      "BEGIN:VEVENT", "UID:x1", "DTSTART;VALUE=DATE:20240110", "RRULE:FREQ=WEEKLY;BYDAY=WE", "EXDATE;VALUE=DATE:20240117", "SUMMARY:水曜", "END:VEVENT",
      "BEGIN:VEVENT", "UID:x1", "RECURRENCE-ID;VALUE=DATE:20240124", "DTSTART;VALUE=DATE:20240125", "SUMMARY:水曜（動かした）", "END:VEVENT",
      // 読めない型（BYSETPOS）：最初の一回だけ
      "BEGIN:VEVENT", "UID:b1", "DTSTART;VALUE=DATE:20240105", "RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU", "SUMMARY:読めない", "END:VEVENT",
      // 毎年（誕生日）
      "BEGIN:VEVENT", "UID:y1", "DTSTART;VALUE=DATE:20220505", "RRULE:FREQ=YEARLY", "SUMMARY:毎年", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const tasks = JSON.stringify({ kind: "tasks#taskLists", items: [{
      kind: "tasks#taskList", title: "テスト一覧", id: "L1",
      recurrences: [
        { id: "R1", title: "毎月五日", schedule: { first_instance_date: "2024-09-05T00:00:00Z", interval: { interval_multiplier: 1, monthly: { day_of_month: 5 } } } },
        { id: "R2", title: "止めた", stopped: true, schedule: { first_instance_date: "2024-09-24T00:00:00Z", interval: { interval_multiplier: 1, weekly: { day_of_week: ["TUESDAY"] } } } },
      ],
      items: [
        { id: "k1", title: "済んだ用事", status: "completed", completed: "2025-01-10T03:00:00.000Z", scheduled_time: [{ current: true, start: "2025-01-09T15:00:00Z" }], starred: true, notes: "メモ" },
        { id: "k2", title: "日の無い済", status: "completed", completed: "2025-02-01T03:00:00.000Z" },
        { id: "k3", title: "過ぎた未完了", status: "needsAction", scheduled_time: [{ current: true, start: "2025-03-01T00:00:00Z" }] },
        { id: "k4", title: "先の未完了", status: "needsAction", scheduled_time: [{ current: true, start: `${futNext.slice(0, 4)}-${futNext.slice(4, 6)}-${futNext.slice(6)}T00:00:00Z` }] },
        { id: "k5", title: "毎月五日", status: "needsAction", task_recurrence_id: "R1", scheduled_time: [{ current: true, start: "2025-04-04T15:00:00Z" }] },
        { id: "k6", title: "止めたものの残り", status: "needsAction", task_recurrence_id: "R2" },
        { id: "k7", title: "毎月五日", status: "completed", completed: "2025-04-05T03:00:00.000Z", task_recurrence_id: "R1" },
      ],
    }] });
    const files = [new File([ics], "cal.ics"), new File([tasks], "Tasks.json")];
    const read = await KN.googleImport.read(files);
    const pl = KN.googleImport.plan(read.sources, new Set(), today);
    return { today, labels: read.sources.map((s) => s.label), bad: read.bad, all: pl.all, per: pl.per.map((p) => ({ live: p.live, expanded: p.expanded, had: p.had })) };
  });

  const by = (g) => r.all.filter((x) => x.gid && x.gid.startsWith(g));
  const one = (g) => r.all.find((x) => x.gid === g);
  t.check("カレンダー名と一覧名を読む", r.labels.join() === "テスト暦,テスト一覧" && !r.bad.length, JSON.stringify([r.labels, r.bad]));
  const a1 = one("e:a1");
  t.check("UTC は端末の時間に（10:00・90分）・過ぎたものは済", a1 && a1.time === "10:00" && a1.minutes === 90 && a1.done && a1.due === "2020-03-02" && a1.kind === "event", JSON.stringify(a1));
  t.check("説明は場所＋本文・VALARM の字は入らない", a1 && a1.memo === "会議室\n本文", JSON.stringify(a1 && a1.memo));
  const a2 = one("e:a2");
  t.check("終日の何日かは終わりの日（含まない日を引く）", a2 && a2.due === "2020-03-10" && a2.endDay === "2020-03-12" && a2.time === null, JSON.stringify(a2));
  const a3 = one("e:a3");
  t.check("先の予定は済でなく・折り返しをつなぐ", a3 && !a3.done && a3.title === "先の予定" && a3.time === "09:00", JSON.stringify(a3));
  t.check("取り消した予定は入れない", !one("e:a4"));
  const m1 = one("e:m1");
  t.check("毎月第1木曜は一本（第◯曜日）で残る", m1 && m1.repeat === "monthly" && m1.repeatNth && m1.repeatNth.nth === 1 && m1.repeatNth.weekday === 4 && !m1.done, JSON.stringify(m1));
  t.check("その一本は今日以降の第1木曜", m1 && m1.due >= r.today && new Date(m1.due + "T00:00:00").getDay() === 4, JSON.stringify(m1 && m1.due));
  t.check("過ぎた回は単発の済（2024-01-04 から）", by("e:m1@").length > 20 && by("e:m1@").every((x) => x.done && !x.repeat) && by("e:m1@").some((x) => x.due === "2024-01-04"));
  const w1 = one("e:w1");
  t.check("隔週の月水は一本（2週ごと・月と水）", w1 && w1.repeat === "weekly" && w1.repeatWeeks === 2 && w1.repeatDays.join() === "1,3", JSON.stringify(w1));
  t.check("隔週の過ぎた回は二週おき", by("e:w1@").some((x) => x.due === "2024-01-01") && !by("e:w1@").some((x) => x.due === "2024-01-08") && by("e:w1@").some((x) => x.due === "2024-01-15"));
  t.check("期限つきの月末は一回ずつ（4回）", by("e:u1@").map((x) => x.due).sort().join() === "2024-01-31,2024-02-29,2024-03-31,2024-04-30" && !one("e:u1"), by("e:u1@").map((x) => x.due).join());
  const x1 = by("e:x1@").map((x) => x.due);
  t.check("外した回は出ず・動かした回は動かしたとおり", !x1.includes("2024-01-17") && !x1.includes("2024-01-24") && x1.includes("2024-01-25") && x1.includes("2024-01-10"), x1.slice(0, 6).join());
  t.check("先に外した・直した回が無ければ読める型で一本", one("e:x1") && one("e:x1").repeat === "weekly");
  t.check("読めない型は最初の一回だけ", by("e:b1").length === 1, JSON.stringify(by("e:b1")));
  const y1 = one("e:y1");
  t.check("毎年は一本・過ぎた年は単発", y1 && y1.repeat === "yearly" && by("e:y1@").some((x) => x.due === "2022-05-05"), JSON.stringify(y1));
  const k1 = one("t:k1");
  t.check("済のタスク：日・済んだ時刻・★・メモ", k1 && k1.done && k1.due === "2025-01-10" && k1.doneAt === "2025-01-10T03:00:00.000Z" && k1.flagged && k1.memo === "メモ", JSON.stringify(k1));
  t.check("日の無い済は日なしの済", one("t:k2") && one("t:k2").done && one("t:k2").due === null);
  t.check("過ぎた未完了は「これから」（日なし・済でない）", one("t:k3") && !one("t:k3").done && one("t:k3").due === null);
  t.check("先の未完了はその日", one("t:k4") && one("t:k4").due.replace(/-/g, "").length === 8 && !one("t:k4").done);
  t.check("動いている元のある未完了の回は入れず、元の一本が代わる", !one("t:k5") && one("r:R1") && one("r:R1").repeat === "monthly" && one("r:R1").due >= r.today && one("r:R1").due.endsWith("-05"), JSON.stringify(one("r:R1")));
  t.check("止めた元の未完了は「これから」へ・済んだ回はそのまま", one("t:k6") && one("t:k6").due === null && one("t:k7") && one("t:k7").done);
  t.check("止めた元は一本にしない", !one("r:R2"));

  /* 入れる：控え → 一括 → 二度目は飛ばす → 束ごと戻す（直したものは残す）。 */
  const before = await page.evaluate(() => KN.store.get().todos.length);
  const made = await page.evaluate(async () => {
    const files = [new File(["BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:solo\nDTSTART;VALUE=DATE:20200501\nSUMMARY:一つだけ\nEND:VEVENT\nBEGIN:VEVENT\nUID:solo2\nDTSTART;VALUE=DATE:20200502\nSUMMARY:二つ目\nEND:VEVENT\nEND:VCALENDAR"], "x.ics")];
    const rd = await KN.googleImport.read(files);
    const n = KN.store.importGoogle(KN.googleImport.plan(rd.sources, KN.store.googleIds(), KN.util.todayKey()).all, "2026-10-19T00:00:00.000Z");
    const again = KN.googleImport.plan(rd.sources, KN.store.googleIds(), KN.util.todayKey());
    const mine = KN.store.get().todos.filter((x) => x.gbatch === "2026-10-19T00:00:00.000Z");
    return { n, again: again.all.length, had: again.per[0].had, done: mine.every((x) => x.done && x.kind === "event"), keys: Object.keys(mine[0]).includes("gid"), batches: KN.store.googleBatches() };
  });
  t.check("二件を一括で入れ、済の予定として", made.n === 2 && made.done && made.keys, JSON.stringify(made));
  t.check("二度目は飛ばす（取り込み済み 2）", made.again === 0 && made.had === 2);
  t.check("束の一覧に出る", made.batches.length === 1 && made.batches[0].n === 2);
  await page.evaluate(() => KN.store.updateTodo(KN.store.get().todos.find((x) => x.gid === "e:solo2").id, { title: "直した" }));
  const un = await page.evaluate(() => KN.store.unimportGoogle("2026-10-19T00:00:00.000Z"));
  const left = await page.evaluate(() => KN.store.get().todos.filter((x) => x.gbatch).map((x) => x.title));
  t.check("束ごと戻す（取り込んだあとに直したものは残す）", un.gone === 1 && un.kept === 1 && left.join() === "直した", JSON.stringify([un, left]));
  t.check("記録の数は戻る（残した一件を除く）", (await page.evaluate(() => KN.store.get().todos.length)) === before + 1);

  /* 保存を通る：再読み込みしても gid・gbatch は落ちない。 */
  await page.evaluate(() => KN.store.flush && KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store);
  const kept = await page.evaluate(() => KN.store.get().todos.filter((x) => x.gbatch).map((x) => [x.gid, x.gbatch]));
  t.check("読み直しても gid・gbatch が残る", kept.length === 1 && kept[0][0] === "e:solo2", JSON.stringify(kept));

  /* 設定の行：やることの紙に「Google から取り込む」。取り消しは束のあるときだけ。 */
  await page.evaluate(() => { document.querySelector('[data-tab="settings"], #tab-settings, .tab-settings'); });
  const rows = await page.evaluate(() => KN.settingsParts.todoRows().flatMap((c) => [...(c ? c.querySelectorAll(".set-title") : [])].map((e) => e.textContent)));
  t.check("設定に取り込みの行（束があれば取り消しも）", rows.includes("Google から取り込む") && rows.includes("取り込みを取り消す"), rows.join());

  /* 枠に収まるぶんだけ：先のものを残し、古い過去から省く。 */
  const trim = await page.evaluate(async () => {
    const ics = "BEGIN:VCALENDAR\n" + [1, 2, 3, 4, 5].map((i) => `BEGIN:VEVENT\nUID:r${i}\nDTSTART;VALUE=DATE:2020010${i}\nSUMMARY:r${i}\nEND:VEVENT`).join("\n") + "\nEND:VCALENDAR";
    const rd = await KN.googleImport.read([new File([ics], "r.ics")]);
    const p = KN.googleImport.plan(rd.sources, new Set(), KN.util.todayKey(), 2 * 640 / 0.8);
    return { n: p.all.length, cut: p.cut, dues: p.all.map((x) => x.due), left: KN.googleImport.roomLeft() };
  });
  t.check("枠が二件ぶんなら新しい二件だけ・省いた数", trim.n === 2 && trim.cut === 3 && trim.dues.join() === "2020-01-05,2020-01-04", JSON.stringify(trim));
  t.check("あと何字書けるかを測れ、試しの字は残さない", trim.left > 100000 && (await page.evaluate(() => localStorage.getItem("kn-room-probe"))) === null, String(trim.left));

  /* 紙：選ぶ → 先に見せる → 取り込む（控えを取って入る）。 */
  const ui = await page.evaluate(async () => {
    const f = new File(["BEGIN:VCALENDAR\nX-WR-CALNAME:紙の暦\nBEGIN:VEVENT\nUID:ui1\nDTSTART;VALUE=DATE:20200601\nSUMMARY:紙の予定\nEND:VEVENT\nEND:VCALENDAR"], "ui.ics");
    await KN.googleImport.show([f]);
    return true;
  });
  await page.waitForSelector(".sheet .js-go:not([disabled])", { timeout: 5000 });
  const sheetText = await page.locator(".sheet").last().innerText();
  t.check("紙に暦の名前と件数が出る", /紙の暦/.test(sheetText) && /予定\s*1/.test(sheetText), sheetText.slice(0, 120));
  await page.locator(".sheet select").first().selectOption("work");
  await page.locator(".sheet .js-go").click();
  await page.waitForFunction(() => KN.store.get().todos.some((x) => x.gid === "e:ui1"), null, { timeout: 8000 });
  const made2 = await page.evaluate(() => KN.store.get().todos.find((x) => x.gid === "e:ui1"));
  t.check("選んだ側（仕事）で入る", ui && made2.side === "work" && made2.done === true, JSON.stringify(made2));

  /* 連絡先の誕生日（.vcf）：年あり・年なし（--MMDD・Apple の 1604）・2月29日・誕生日なし・N だけ・折り返し。 */
  const vc = await page.evaluate(async () => {
    const today = KN.util.todayKey();
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:テスト太郎", "UID:c1", "BDAY:1990-04-12", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "N:花子;テスト;;;", "item1.BDAY:--0705", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:年なし", "BDAY:1604-12-25", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:うるう", "BDAY:20000229", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:誕生日なし", "TEL:000", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "FN:折り返", " しの人", "BDAY:19801231", "END:VCARD",
    ].join("\r\n");
    const rd = await KN.googleImport.read([new File([vcf], "c.vcf")]);
    const p = KN.googleImport.plan(rd.sources, new Set(), today);
    return { today, kind: rd.sources.map((s) => s.kind).join(), all: p.all };
  });
  const vt = (n) => vc.all.find((x) => x.title === n + "の誕生日");
  t.check(".vcf は誕生日のある人だけ（誕生日なしは入れない）", vc.kind === "contacts" && vc.all.length === 5 && !vt("誕生日なし"), JSON.stringify(vc.all.map((x) => x.title)));
  t.check("毎年の終日予定・次の回は今日以降・済でない", vc.all.every((x) => x.repeat === "yearly" && x.kind === "event" && !x.time && x.due >= vc.today && !x.done), JSON.stringify(vc.all));
  t.check("日の位置が合う（4/12）", vt("テスト太郎").due.slice(5) === "04-12");
  t.check("N だけでも名前（姓名の順）・--MMDD も読む", vc.all.some((x) => x.title === "テスト 花子の誕生日" && x.due.slice(5) === "07-05"), JSON.stringify(vc.all.map((x) => x.title)));
  t.check("年なし（1604）も読み・折り返しをつなぐ", vt("年なし").due.slice(5) === "12-25" && vt("折り返しの人").due.slice(5) === "12-31");
  t.check("2月29日はうるう年の 29 日まで飛ぶ", vt("うるう").due.slice(5) === "02-29" && new Date(vt("うるう").due).getUTCDate() === 29);
  t.check("gid は UID（無ければ名前＋日）", vt("テスト太郎").gid === "b:c1" && vt("年なし").gid === "b:年なし:1225");

  t.check("エラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
