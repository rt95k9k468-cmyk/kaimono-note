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
  リポジトリ・コミット・成果物に書かない。fetchもしない——いまの `relay/worker.js`
  の GET は消さない（版で新しさを見る）が、古い版の GET は `env.MAIL.delete` を伴い、
  保留中の健康データを黙って消費した。利用者が置いている版は分からない。
- **ユーザーが貼り付ける日記本文は深く個人的な内容。** 形式判定のためだけに
  使い、内容を引用・言及・要約しない。
- **アプリ内UIに絵文字を使わない。**（`icon("gear")` の絵、カテゴリなら
  色の丸 `.chip-dot` で代替。詳しくは `docs/look.md` の「絵文字は、もうどこにも無い」）
  **打ちこませる欄も置かない**——打てるのに出ないのは、打った人の字が消えた
  ように見えるので。**保存済みの `emoji` 欄は消さない**（描かないだけ）。
- **画面に説明文を書かない。** 見れば・押せば分かることは書かない。要る一言
  だけを短く大きく。めったに要らない手順は畳む（`more()`）。利用者の強い要望
  （2026年9月30日）。詳しくは `docs/look.md` の「説明は書かない」。
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
  git push origin <branch>:main
  ```
  **ローカルの `main` は使わない（checkout も merge もしない）。** 容器は環境の
  古い写しから始まるので、ローカルの `main` は写しを取った日のまま。取得も浅い
  （`--depth 50`）ので `origin/main` とのつながりが見えず、`merge --ff-only` は
  必ず失敗する。早送りかどうかは GitHub 側が見る（`--force` は付けない）。
  断られたら先に誰かが流している：`git fetch origin main && git merge origin/main`
  → テスト → もう一度。
- デプロイは GitHub Actions（"Deploy to GitHub Pages"）が自動実行。確かめるのは
  必要なときだけ：`mcp__github__actions_list`（method: list_workflow_runs,
  **resource_id: "pages.yml"**, **perPage: 1**）。perPage を省くと30件返って大きい。
  `workflow_runs_filter: {branch: "main"}` で引くと**古い run（9月21日の #403）が
  返った**ことがある（2026年9月29日）——run_number と head_sha を push したものと照らすこと。
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

- Playwright を使う。**台本は `tests/` に置いてコミットする**（2026年9月26日から。
  サイトには載らない——デプロイが上げる前に消す。`sw.js` / `build-standalone.js`
  には入れない）。一覧と決めごとは `tests/README.md`。文脈・待ち方・サーバーは
  `tests/lib.js` の `open()` に寄せてあるので、新しい台本もそれを使う。
- ローカルサーバー：
  ```
  (setsid python3 -m http.server 8765 --directory "$(git rev-parse --show-toplevel)" >/dev/null 2>&1 < /dev/null &)
  ```
  サーバーはターンをまたぐと落ちていることがあるので、テスト前に生きて
  いるか確認し、必要なら上のコマンドで再起動する。
- 実行：`NODE_PATH=/opt/node22/lib/node_modules node tests/<台本>.js`
  （`lib.js` はサーバーが落ちていれば自分で立ち上げる）。全部は `tests/run-all.js`
  （3本ずつ並べて約3分、要約だけ）。
- **main へ push すると GitHub が門（`run-all.js --gate`）を回し、落ちたら配られない。**
  流したあとは `actions_list` で結論を一度見る（門の決めごとは `tests/README.md`）。
- 新しい文脈で初めて開くと、Service Worker が入れ替わって**一度読み直す**
  （`app.js` の `controllerchange`）。`newContext({ serviceWorkers: "block" })` で作る。
  日記の本文と控えは IndexedDB にもあり、reload をまたいで残る（docs/storage.md の
  「試験の罠」）。
- `tests/` に無い試験（daily2-smoke.js / aimeal.js など、9月26日より前の
  もの）は失われている。要るときは対象の挙動から書き起こし、`tests/` に足す
  ——書き直しの浪費は一度で終わらせる。
- 変更のたびに、触った画面の主要テストと `tests/daily-rules.js`（dailyの
  非評価原則）は必ず走らせる。
- **localStorage に直に書いてから `reload()` するなら、
  `waitForFunction(() => KN.store)` のあと 300ms 待つ。** 待たないと `pagehide` の
  `store.flush()` が注入前の中身を書き戻し、注入ごと消える（アプリの不具合では
  ない。これを「全データが消えるバグ」と読み違えたことがある）。
- **指の手つきは本物のタッチ（CDP の `Input.dispatchTouchEvent`）で試す。**
  自前の `PointerEvent` では `touchstart` を見るもの（`pull-refresh.js`）が動かず、
  「テストが通ったのに実機で崩れる」になる。当たり判定も一緒に置く。
- この二つの全文と書き方は `tests/README.md` の「試験の罠」。

## 詳しい決めごとは `docs/` にある（触る前に、該当するものだけ読む）

ここに全部を書いていた時期があり、2,820行・約23万バイトになっていた。
このファイルは**毎回の会話に丸ごと載る**ので、それだけで利用者の制限を
大きく使う。だから画面ごとの決めごと・経緯・実測は `docs/` へ見出しごと
移した（2026年9月26日）。**消したものは一つも無い。**

**触る前に、その場所の docs を読むこと。** どの節も「一度こわした」話で
できている——読まずに直すと、一度直した不具合をもう一度作る。

| 触るもの | 読む docs |
|---|---|
| やることの時間割（丸薬・線・運ぶ・「いま」・`plan.js`）、一日の道（`day-road.js`）、組み直しの速さ（`calDigest` / `sheetDigest`） | `docs/todo-timeline.md` |
| 手順（サブタスク）・長期タスク・期限（`deadline`）・くり返し（`fallsOn`）・`when-parse.js` | `docs/todo-items.md` |
| 紙（`.tl-sheet` / `.sheet`）・送る器（`scrollerOf`）・`pull-refresh.js`・紙を閉じる／払って閉じる・キーボードと紙の底（`--kb`） | `docs/sheet-scroll.md` |
| `day-swipe.js`・`cal-swipe.js`・`cal-peek.js`・暦の三段 | `docs/calendar-swipe.md` |
| 設定（`screen-settings.js`・`settings-*.js`・`edge-back.js`・`KN.ui.setPageHost`・中継所の紙） | `docs/settings.md` |
| 画面の移り変わり（`app.js` の `show`）・帯の構成・上の題（`dayTitleBar`） | `docs/screens-nav.md` |
| 上の帯と暦を全タブで一つに（計画の段1〜4・共通の日 `dayShare`・暦の段 `calAll`） | `docs/shared-header.md` |
| 下の帯（押してふくらむ・席の印 `tab-lens.js`） | `docs/tabbar.md` |
| 買うもの・価格（`screen-list.js` / `screen-prices.js`・紙の面 `--face-p`） | `docs/shopping.md` |
| ダイエット（中継所 `health-relay.js` / `relay/`・飲みたくなった `diet.urges`）・閉じていても鳴る通知（`bell.js`・`sw.js` の push） | `docs/health.md` |
| daily（`screen-archive.js`） | `docs/daily.md` |
| ノート（`screen-notes.js`・`notes-idb.js`） | `docs/notes.md` |
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
  全要素の style 再計算を呼ぶ。読む相手そのものへ書く。同じ値の書き直しも
  しない（`KN.util.setVar`）。（calendar-swipe・glass）
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
