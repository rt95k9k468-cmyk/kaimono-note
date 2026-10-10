# tests/ — 試験の台本

2026年9月26日に置き始めた（docs/improvements.md の E2）。それまでは台本を
セッションのスクラッチに置いてコミットしなかったので、セッションが変わるたびに
消えて、毎回書き起こし直していた。

- **サイトには載らない。** デプロイ（`.github/workflows/pages.yml`）が上げる前に
  `tests/` を消す。`sw.js` の `ASSETS` にも `build-standalone.js` にも入れないこと。
- Playwright。走らせ方（リポジトリの根で）：
  ```
  NODE_PATH=/opt/node22/lib/node_modules node tests/daily-rules.js
  ```
  サーバー（8765）が落ちていれば `lib.js` が立ち上げる。落ちた試験があれば
  終了コードが 1。出すのは NG の行と「題: 通った/数えた」だけ（通った行も見るなら
  `KN_VERBOSE=1`。どこまで進んで落ちたかを追うとき）。伸びる欄を field-sizing の効かない端末の道
  （JS が測る）で回すなら `KN_NO_FIT=1`（`lib.js` の `noFit`。roadmap-3.1 の S2）。スクロールの錨の無い端末
  （iOS 26 までの Safari）の道で回すなら `KN_NO_ANCHOR=1`（`noAnchor`。S1）。日付の境目で回すなら
  `KN_CLOCK=23:59:50`（今日のその時刻から頁の時計を進める。台本が自分で止めた時計が勝つ。N10）。`settings` は
  この差し替えと相性が悪く、昼でも30秒待ちきれない——日付とは無関係。
- **まとめて回す**（R19、2026年9月29日）：`node tests/run-all.js`。3本ずつ並べて、
  一本一行の要約だけ出す（落ちたものは NG の行も）。全部で約8分（一本ずつだと約23分。2026年10月8日、118本）。
  名前で絞る（`run-all.js carry day-road`）・門だけ（`--gate`）・並べる数（`-j 4`）。
  同じ名前を何度も書けば、その数だけ回す（揺れを見るとき。`-j 6` で CPU を混ませると
  決め打ちの待ちがあぶり出される）。やり直しはしない。一本240秒で切って NG（2026年10月8日。
  途中で投げた台本はブラウザを開いたまま終わらず、全体と門を止めていた。`KN_LIMIT=秒` で変える）。
- **門**（R22）：main に push すると、GitHub の `pages.yml` が `run-all.js --gate` を
  回し、通ったときだけ配る。門に入れるのは速くて揺れないもの（`run-all.js` の `GATE`）。
  門で一度でも揺れた試験は `GATE` から外して手元の一覧へ戻し、直してから戻す。ただし `update-path`
  （配る版の入れ替え）は外さずに直す（2026年10月10日、利用者が決めた。外すと壊れた入れ替えが配られうる）。
  GitHub では playwright を `tests/package.json` で入れる（手元は今までどおり NODE_PATH）。
- 動きの終わりを**決め打ちの ms で待たない**。終わった印（影武者が消える・値が止まる）
  まで待ち、上限だけ置く。決め打ちは CPU が混むと途中で測って揺れる（`pill-morph` が
  6本並べたときに 2px ずれて落ちた、R19）。
- 文脈の作り方・立ち上げの待ち方・サーバーは `lib.js` の `open()` に寄せてある。
  新しい台本もそれを使う（CLAUDE.md の「テストの回し方」の罠を一か所で避ける）。
  「週に一度の控え」のトーストは `open()` が止めている（確かめるときだけ `nudge: true`）。
- 日記の本文を材料にするときは、試験用の無難な字だけ。利用者の本文は使わない。

**台本の一覧（どれが何を見張るか）は `tests/INDEX.md`。** 台本を足したら、その表の末尾に
一行足す。画面を触ったら、その画面の台本と `daily-rules.js` を走らせる。

## 試験の罠

2026年9月29日に CLAUDE.md から移した全文（CLAUDE.md は毎回の会話に丸ごと載るので、
あちらには要点だけ残した）。

- **localStorage に直に書いてから `reload()` するなら、立ち上げを待つこと。**
  待たずにやると、**注入した中身ごと消えます**。`app.js` が `pagehide` で
  `store.flush()` を呼ぶので、120msデバウンスの保存が待機中のまま reload
  すると、**注入する前の in-memory 状態**が上書きで書き戻るからです
  （`store.js` の `flushPending`）。`reconcile()` が落ちたわけでも、
  データが壊れたわけでもありません——**アプリ側の仕掛けは正しく働いて
  います**（隠れた瞬間に必ず書き出す、というのがあの一行の仕事）。
  `waitForFunction(() => KN.store)` のあとに 300ms 置けば収まります。
  一度これを「全部のデータが消えるバグ」と読み違えて、半時間ぶん
  bisect しました。
- **ノート（IndexedDB）を書いて閉じた直後に `reload()` しないこと。** 閉じた拍に
  書き込みは始まりますが、終わる前（20ms ほど）にページを捨てると書き込みごと
  消えます。新しい文脈の最初の書き込みは入れ物を作るぶん遅く、最初の一件だけが
  毎回落ちます（`tests/notes.js` の3件が、これで長く落ちていた。2026年10月1日）。
  アプリの不具合ではありません。読み直す前に入れ物を一度読めば、読みは先の
  書き込みのあとに並ぶので収まります（`tests/notes.js` の `reload()`）。
- **別の日へ移す行は、紙の中で数えること。** `KN.ui.sendToDay`（V15）は行を
  `cloneNode` した写し（元のクラスのまま、`.day-send` 付き）を body に出して
  飛ばすので、`document.querySelectorAll(".carry-row")` は飛んでいるあいだ写しも
  数えます（`tests/carry.js` が V15 からこれで落ちていた。2026年10月4日）。
- **閉じた紙は、帰り終えるまで DOM に残る。** 閉じた紙は指を受けない（e34179d）ので、閉じた直後の
  ＋の押しはもう待たされない。`.sheet.is-note …` のような選び方は、先に並ぶ帰る途中の紙の欄を掴む
  （`tests/notes-format.js` の2件が、これで2日落ちていた。2026年10月10日）。閉じるのを待つなら
  紙が外れるまで、すぐ次を開くなら `.is-open` で選ぶ。
- **設定の一枚は、押し出し終わるまで押しを捨てる**（`screen-settings.js` の `moving`）。入った・戻ったあと
  決め打ちの ms で次を押さず、`.set-layer.is-edge-lift` が消えるまで待つ（`tests/settings.js` の `layerStill`。
  300ms の待ちが押し出しの終わりの 20ms と競り、まれに30秒の時間切れになっていた。2026年10月10日）。
- **新しい Service Worker が待っているあいだ、古い版に `postMessage` で訊き続けないこと。** 古い版が暇にならず、
  Chromium は待ちを activate しない（`update-path` が門で揺れた元。古い版が抱えていたのは試験の問い合わせ
  だけで、`sw.js` の不具合ではない。2026年10月10日）。待つなら登録の `installing`・`waiting` が空になってから
  一度訊く（`tests/update-path.js` の `settle`）。
- **「今日」「昨日」「いま」を壁の時計で作らないこと。** `open({ before: (cx, p) => p.clock.setFixedTime(…) })` で
  昼の半ば（毎時0分台は避ける）に止め、台本の側の日付も同じ時刻から作る。壁の時計のままだと 0:00 の前後で落ち、
  門は UTC で回るので日本時間の朝9時の push が止まりうる（`backup-budget`・`shop-day`・`due-sheet`・`offdevice-watch`・
  `diary-idb`。2026年10月10日、N10）。Date.now で進む待ち（「5秒は読み直さない」）があるなら、止めずに
  `p.clock.install({ time })` で昼から進める（`diary-idb`）。
- **字の描いた幅を物差しにしないこと。** 字の形は機械で違う（GitHub は数字が細い）。アプリが字の数からの見積もりで
  置くもの（道の札・いまの時刻、`day-road.js` の `textW`）は、試験も同じ見積もりで測る（`road-now-clear` が
  置き場所は同じなのに GitHub だけで落ちていた。2026年10月10日、毎日の全部回しの #1）。
- **指の手つきは、本物のタッチで試すこと。** `new PointerEvent(...)` を
  自分で投げるやり方では、`touchstart` / `touchmove` を見ているものが
  **まるごと動きません**——`pull-refresh.js` がそれです。買うものの掴み手に
  `data-pull-own` が無い不具合（帯まで一緒に降りてくる）は、PointerEvent の
  試験を何度通しても出ませんでした。**「テストが通ったのに実機で崩れる」の
  正体がこれ**です。
  ```js
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart",
    touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
  // touchMove … / touchEnd は touchPoints: []
  ```
  対になる**当たり判定**も一緒に置くこと：掴み手ではないところ（紙の本体）を
  上端で下へ引いたら、送る器（`KN.app.scrollerOf()` の返すもの）に transform が
  付く——付かないなら、その試験はそもそも端の give を動かせていない、と
  分かります（引いて更新はもう無い。sheet-scroll）。
