# くらしノート (kaimono-note)

日本語のバニラJS PWA。買うもの・やること・ダイエット・daily（日記）の4タブ。
`rt95k9k468-cmyk/kaimono-note` の GitHub Pages にデプロイされている。

## 最優先の約束事（絶対に破らない）

- **データ保全が最優先。** 過去に一度データ消失事故を起こしている。
  `backup.js` / `guard.js` / 復元処理 / 既存の localStorage データ / 既存の
  バックアップには、本当に必要な場合以外触れない。設定の追加は必ず
  後方互換に（`reconcile()` で既定値へフォールバック）。**データの移行が
  必要になった場合は、勝手に実行せず先に報告する。**
- **中継所URL（`kurashi-relay.*.workers.dev/...` 形式）はそれ自体が資格情報。**
  リポジトリ・コミット・成果物に書かない。fetchもしない——その GET は
  `env.MAIL.delete` を伴う破壊的操作で、保留中の健康データを黙って消費する。
- **ユーザーが貼り付ける日記本文は深く個人的な内容。** 形式判定のためだけに
  使い、内容を引用・言及・要約しない。
- **アプリ内UIに絵文字を使わない。**（`icon("gear")` の絵、カテゴリなら
  色の丸 `.chip-dot` で代替。詳しくは `docs/look.md` の「絵文字は、もうどこにも無い」）
  **打ちこませる欄も置かない**——打てるのに出ないのは、打った人の字が消えた
  ように見えるので。**保存済みの `emoji` 欄は消さない**（描かないだけ）。
- **daily（日記）は評価しない。** 目標・連続記録・月比較・達成率・空白日の
  警告色などを一切出さない。`js/daily-rules.js` のテスト群がこれを見張る。
- モデル識別子（Claude Opus/Sonnet等）をコミットメッセージ・PR・コード
  コメントに書かない。

## 開発ブランチとデプロイ

- 作業ブランチはセッションごとに指定される。`git branch --show-current`
  で確認し、指定されたブランチを使う。
- **`main` へ流すのに、いちいち訊かない。** 直したら、テストを通して
  コミットして、そのまま `main` まで流すところまでが一続き。ユーザーの
  明示的な許可のもとで認められている。
  ただし**先に報告するもの**は変わらない——データの移行、既存の記録の
  作り替え、後戻りできない類。それは「よっぽど」のほう。
- `main` への直接pushの手順（`<branch>` は現在の作業ブランチ）：
  ```
  git push -u origin <branch>
  git checkout main && git merge --ff-only <branch>
  git push origin main
  git checkout <branch>
  ```
- デプロイは GitHub Actions（"Deploy to GitHub Pages"）が自動実行。
  `mcp__github__actions_list`（method: list_workflow_runs, branch: main）で
  確認できるが、出力が大きいので `.txt` に保存されたものを python で
  スライスして読む。
- `stamp-build.js` は**絶対にローカルで実行してコミットしない**
  （ビルド時にCI側が使うもの）。
- PRは明示的に頼まれない限り作らない。

## アーキテクチャのクセ

- グローバル名前空間は `KN.*`。`<script>` の読み込み順は `index.html` が
  決めている。
- 新しい `.js` ファイルを追加したら、**3箇所**に登録が要る：
  `index.html`（`<script src>`）、`sw.js`（`ASSETS` 配列）、
  `build-standalone.js`（`JS` 配列）。
- store（`js/store.js`）は単一の localStorage キー `kaimono-note-v2`。
  `reconcile()` が `{...base, ...saved}` でマージする。**`let state = load()`
  はモジュール評価の途中（いまは600行目あたり）で走る**ので、load パスが触れる
  ものは、それより上に書くか、巻き上げられる `function` 宣言にすること
  （`const` で下に書くと TDZ で落ちる——過去のデータ消失事故の原因）。
- `KN.util.today()` は **UTC ISO**（`toISOString()`）、`dayKey()` /
  `todayKey()` は**ローカル**。混ぜると JST で9時間・1日のズレが起きる。
  日をまたぐ集計は必ず `dayKey()` 系で揃える。
- `node(html\`...\`)` は**最初のルート要素だけ**を返す（複数ルートは黙って
  捨てる）。
- CSSの詳細度の罠: `.tl-row .tl-item`（0,2,0）は
  `.item.todo:not(.is-tile)`（0,3,0）に負ける。負けた側にクラスを足して
  詳細度を上げること。
- Daily Log は「写さず引く」設計（`store.dayFeed()` / `monthDigest()`）。
  todo・積み上げ・買い物の完了記録から**そのつど**組み立てる。新しい
  「記録用の入れ物」を増やしたくなったら、まず本当に必要か疑うこと
  ——二重管理・不整合の温床になる。

## テストの回し方

- Playwright を使う。テストスクリプトはリポジトリの外
  （セッションのスクラッチディレクトリ）に置き、コミットしない。
- ローカルサーバー：
  ```
  (setsid python3 -m http.server 8765 --directory "$(git rev-parse --show-toplevel)" >/dev/null 2>&1 < /dev/null &)
  ```
  サーバーはターンをまたぐと落ちていることがあるので、テスト前に生きて
  いるか確認し、必要なら上のコマンドで再起動する。
- 実行：`NODE_PATH=/opt/node22/lib/node_modules node <test>.js`
- 新しい文脈で初めて開くと、Service Worker が入れ替わって**一度読み直す**
  （`app.js` の `controllerchange`）。`newContext({ serviceWorkers: "block" })` で作る。
  日記の本文と控えは IndexedDB にもあり、reload をまたいで残る（docs/storage.md の
  「試験の罠」）。
- 既存のテスト資産（daily-rules.js / daily2-smoke.js / aimeal.js など）は
  過去のセッションのスクラッチ領域にあり、新しいセッションでは失われて
  いる。テストを再走行したい場合は、対象の挙動から新しく書き起こす。
- 変更のたびに、触った画面の主要テストと `daily-rules.js`（dailyの非評価
  原則）は必ず走らせる。
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

## 詳しい決めごとは `docs/` にある（触る前に、該当するものだけ読む）

ここに全部を書いていた時期があり、2,820行・約23万バイトになっていた。
このファイルは**毎回の会話に丸ごと載る**ので、それだけで利用者の制限を
大きく使う。だから画面ごとの決めごと・経緯・実測は `docs/` へ見出しごと
移した（2026年9月26日）。**消したものは一つも無い。**

**触る前に、その場所の docs を読むこと。** どの節も「一度こわした」話で
できている——読まずに直すと、一度直した不具合をもう一度作る。

| 触るもの | 読む docs |
|---|---|
| やることの時間割（丸薬・線・運ぶ・「いま」・`plan.js`）、組み直しの速さ（`calDigest` / `sheetDigest`） | `docs/todo-timeline.md` |
| 手順（サブタスク）・長期タスク・期限（`deadline`）・くり返し（`fallsOn`）・`when-parse.js` | `docs/todo-items.md` |
| 紙（`.tl-sheet` / `.sheet`）・送る器（`scrollerOf`）・`pull-refresh.js`・紙を閉じる／払って閉じる | `docs/sheet-scroll.md` |
| `day-swipe.js`・`cal-swipe.js`・`cal-peek.js`・暦の三段 | `docs/calendar-swipe.md` |
| 設定（`screen-settings.js`・`edge-back.js`・`KN.ui.setPageHost`・中継所の紙） | `docs/settings.md` |
| 画面の移り変わり（`app.js` の `show`）・帯の構成・上の題（`dayTitleBar`） | `docs/screens-nav.md` |
| 下の帯（押してふくらむ・席の印 `tab-lens.js`） | `docs/tabbar.md` |
| 買うもの・価格（`screen-list.js` / `screen-prices.js`・紙の面 `--face-p`） | `docs/shopping.md` |
| ダイエット（中継所 `health-relay.js` / `relay/`・飲みたくなった `diet.urges`） | `docs/health.md` |
| daily（`screen-archive.js`） | `docs/daily.md` |
| 保存の置き場（`store.js` の書き込み・`backup.js`・`idb.js`・`diary-idb.js`）・日記の写し・自動の控え | `docs/storage.md` |
| 動きの速さ・曲線（`--m-*`・`motion.js`・`KN.motion.glide`） | `docs/motion.md` |
| ガラス（`--glass-*`） | `docs/glass.md` |
| 色・字の太さ・重なりの順（`--z-*`）・絵文字・席の名前 | `docs/look.md` |
| 絵の系統・「こと」アイコン・絵選び紙 | `docs/icons.md` |
| 絵を描く・なぞる・型・画風・崩れの測り方（core） | `docs/icons-drawing.md` |
| 絵の引き当て（`findKey`・`hasWord`・`icon-eval.json`・絵の報告） | `docs/icons-matching.md` |

- コードや `ICON-*.md` のコメントにある「CLAUDE.md の『〜』」は、いまは
  `docs/` のどれかにある。見出しの一部で `grep -rn '〜' docs/` すれば出る。
- **新しい決めごとは、該当する docs に書く。** ここ（CLAUDE.md）に足して
  よいのは、下の「横断の罠」に入るもの——どの画面を触っても踏むもの——
  だけ。ここをもう一度太らせないこと。

## 横断の罠（どの画面でも踏む。詳しくは括弧の docs）

- **送る器は紙**（やること・daily・買うもの・ダイエット。設定は `.set-scroll`）。
  `root.scrollTop` や `activeScreen()` を送る相手にせず、`KN.app.scrollerOf()` を
  通す。（sheet-scroll）
- **毎フレーム書くカスタムプロパティは `:root` に書かない。** 継承で文書の
  全要素の style 再計算を呼ぶ。読む相手そのものへ書く。（calendar-swipe・glass）
- **`var()` は、それを書いた要素の上で解決される。** `:root` で組んだ一枚は
  `:root` の値を焼きつけて配られる——三枚重ねや `--face-cut` は、使う側で組む。
  （glass・shopping）
- **同じ詳細度の二つの規則で、同じプロパティを取り合わない**（特に
  `transform`）。あとに書いたほうだけが効く。倍率は `scale:` で。（tabbar・todo-timeline）
- **速さ・曲線を数字で書かない**（`--m-*` / `KN.motion.ms()`）。**重なりの順も
  名前で**（`--z-*`）。（motion・look）
- **字の色は `--c-primary`、塗りは `--c-primary-fill`。** 取り違えると 1.8:1 で
  読めない。字の太さは 400 と 700 だけ。（look）
- **設定の画面が出ているあいだ、`KN.ui.sheet` は紙ではなく一枚を押しのける**
  （`as: "dialog"` などは紙のまま）。（settings）
- **`.tl` は二つの別物。** 長期タスクから時間割への落とし先は `.tl-list`。（todo-timeline）
- **払う・引くの隣の紙は DOM に居ない**（控えは `document` の外）。`.cal-day` /
  `.tl-sheet` / `.js-now` のように複数の画面にあるものは、出ている画面に絞って
  掴む。（calendar-swipe・todo-timeline）

## セッションの区切り（制限の節約。利用者の希望）

会話が長くなるほど、1ターンごとの消費が増える（それまでの文脈を毎回読み
直すため）。**一つの区切りがついたら**、次の作業を新しいセッションで始めた
ほうが安いかを判断し、そのほうがよければ**タイミングと、次のセッションに
そのまま貼れるプロンプト**を利用者に示すこと。目安：

- 数ファイルにまたがる作業や調査が、一つ終わったとき
- CLAUDE.md や docs を書き換えたあと（新しいセッションは新しい中身で始まる）
- 別の画面・別の話題へ移るとき
