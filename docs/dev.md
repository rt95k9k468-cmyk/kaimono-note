# 開発の決めごと（もとの CLAUDE.md の全文）

2026年10月2日、毎回の会話の固定費を減らすために CLAUDE.md を要点だけにした。
そのとき、もとの本文（2026年10月1日時点）を**一字も削らず**ここへ移した。
下で「このファイル」「ここ」と言っているのは、当時の CLAUDE.md のこと。
CLAUDE.md の一行が足りないと感じたら、ここの該当する節を読む。

## 最優先の約束事（絶対に破らない）

- **データ保全が最優先。** 過去に一度データ消失事故を起こしている。
  `backup.js` / `live-idb.js` / 復元処理 / 既存の localStorage データ / 既存の
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
  **main へ流すのは一区切りごと**（2026年10月10日、制限の節約の点検で）。ブランチへの push はこまめでよいが、
  細かい直しを一つずつ main へ流すと、断られる・取りこむ・門を見る、がその回数ぶん増える。
- `main` への直接pushの手順（`<branch>` は現在の作業ブランチ）：
  ```
  git push -u origin <branch>
  git push origin <branch>:main
  ```
  **ローカルの `main` は使わない（checkout も merge もしない）。** 容器は環境の
  古い写しから始まるので、ローカルの `main` は写しを取った日のまま。取得も浅い
  （`--depth 50`）ので `origin/main` とのつながりが見えず、`merge --ff-only` は
  必ず失敗する。早送りかどうかは GitHub 側が見る（`--force` は付けない）。
  断られたら先に誰かが流している：`git fetch -q origin main && git merge --no-stat origin/main` → 門（`run-all.js --gate`、
  約1.5分）と自分の変更の台本（触った画面の台本・直した台本。競合を手で直したならその所のも）だけ回して → もう一度。
  全部回しは取りこむ前の一度で足りる（門の外は tests-daily.yml が毎日回す）。取りこむたびに全部（約11分）を回すと、
  そのあいだに次の誰かが流してまた断られる（10月10日は2時間半に取りこみ8回）。2026年10月10日、利用者が決めた。
  `-q`・`--no-stat` は、取りこんだ他人の変更の一覧（数十行になる）を会話に載せないため（同じ日、制限の節約）。
  衝突はそれでも `CONFLICT` の行で出る。
- デプロイは GitHub Actions（"Deploy to GitHub Pages"）が自動実行。確かめるのは
  必要なときだけ：`mcp__github__actions_list`（method: list_workflow_runs,
  **resource_id: "pages.yml"**, **perPage: 1**）。perPage を省くと30件返って大きい。
  `workflow_runs_filter: {branch: "main"}` で引くと**古い run（9月21日の #403）が
  返った**ことがある（2026年9月29日）——run_number と head_sha を push したものと照らすこと。
- **main を分け合う**（いくつものセッションが同じ main へ流す。2026年10月10日、利用者が決めた。run #802 が
  `update-path` の揺れで落ちて配られなかった——同時の push や競合ではなかった）：
  - 結論が赤なら `mcp__github__get_job_logs`（run_id・failed_only・return_content・tail_lines 40）で落ちた試験を見る。
    自分の変更が触る所なら直して流す。触らない所なら、一つ前の run も同じ所で赤いかを見たうえで、同じ SHA を
    **一度だけ**再実行（`actions_run_trigger` の rerun_failed_jobs）。二度目も落ちたら本物。再実行したこと・run 番号・
    落ちた試験は利用者に伝える（黙って緑にしない）。揺れの確かめ方と揺れた試験の扱いは `tests/README.md` の門。
  - `run_attempt` が2以上の run は、前の回が落ちている（`list_workflow_jobs` の filter "all" で見える）。
  - `cancelled` は落ちたのではない（`concurrency: pages` が待ちを一つに畳む）。後の run の head_sha が自分の
    コミットを含めば（`git merge-base --is-ancestor <自分> <その sha>`）それで足りる。
  - 赤い main に別件を積まない。自分の push で赤くしたら、次の仕事より先に片づける。
  - 共通の部品（下の「テストの回し方」の一覧）と門の試験を触る前に
    `git log origin/main -3 --format='%h %ar %s' -- <file>` を見る。ほかのセッションが数時間内に触っていたら、
    その差分を読んでから始める。
  - `tests/INDEX.md` は `.gitattributes` で `merge=union`：2日間の取りこみで手で直した5か所のうち2か所が、ここへの追記どうしだった（10月10日。読む試験は無い）。
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
  には入れない）。決めごとは `tests/README.md`、一覧は `tests/INDEX.md`。文脈・待ち方・サーバーは
  `tests/lib.js` の `open()` に寄せてあるので、新しい台本もそれを使う。
- ローカルサーバー：
  ```
  (setsid python3 -m http.server 8765 --directory "$(git rev-parse --show-toplevel)" >/dev/null 2>&1 < /dev/null &)
  ```
  サーバーはターンをまたぐと落ちていることがあるので、テスト前に生きて
  いるか確認し、必要なら上のコマンドで再起動する。
- 実行：`NODE_PATH=/opt/node22/lib/node_modules node tests/<台本>.js`
  （`lib.js` はサーバーが落ちていれば自分で立ち上げる）。全部は `tests/run-all.js`
  （3本ずつ並べて約11分。手元では落ちたものと最後の一行だけ——一本一行は GitHub と `--verbose`。2026年10月10日に143本で10分35秒）。**全部は Bash の `run_in_background`
  で回す**——前で待てる上限（10分）を超える。終われば知らせが来る。
- **main へ push すると GitHub が門（`run-all.js --gate`）を回し、落ちたら配られない。**
  流したあとは `actions_list` で結論を一度見る（門の決めごとは `tests/README.md`）。
- **門の外も含めた全部は、GitHub が毎日一度回す**（`.github/workflows/tests-daily.yml`、日本の朝3時。
  roadmap-seamless の X20、2026年10月10日）。**日本の時間帯で**（`TZ`・`KN_TZ`。門は UTC なので、日本の0〜9時に
  だけ出る日付の取り違えはここでしか見えない）。配るのは止めない。結果はセッションの頭に一度だけ見る
  （`actions_list`・resource_id "tests-daily.yml"・perPage 1）。赤なら、その台本を手元で回して直すのを先に。
- 新しい文脈で初めて開くと、Service Worker が入れ替わって**一度読み直す**
  （`app.js` の `controllerchange`。刻印の無い手元の版だけ——配った版は動いている版と同じなら読み直さない、
  roadmap-seamless の N1）。`newContext({ serviceWorkers: "block" })` で作る。版の入れ替えそのものは
  `tests/update-path.js`（`sw.js` を触ったら `offline`・`startup`・`csp` と一緒に回す）。
  日記の本文と控えは IndexedDB にもあり、reload をまたいで残る（docs/storage.md の
  「試験の罠」）。
- `tests/` に無い試験（daily2-smoke.js / aimeal.js など、9月26日より前の
  もの）は失われている。要るときは対象の挙動から書き起こし、`tests/` に足す
  ——書き直しの浪費は一度で終わらせる。
- 変更のたびに、触った画面の主要テストと `tests/daily-rules.js`（dailyの
  非評価原則）は必ず走らせる。
- **画面を三つ以上またぐ変更（U8 のような部品の差し替え）と、共通の部品（`ui.js`・`app.js`・`util.js`・`store.js`・
  `sw.js`・`css/base.css`・`css/components.css`）を触ったあとは、`run-all.js` を全部回す**（約11分・143本。
  2026年10月8日、利用者が決めた。門の外の試験が古いまま2日残っていた——docs/log/inspection.md）。**共通の部品**は
  10月10日に足した：やることの紙のための `ui.js` の変更（e34179d）がノートの書く紙の試験を落としたまま、一画面の変更として
  2日すり抜けた（docs/log/inspection.md の10月10日の節）。
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
| 帯の後ろの空（時間帯・季節の写真・幕の濃さ・`sky.js`） | `docs/sky.md` |
| 季節の絵（七十二候・daily の写真・ノートの広重・`season-art.js`） | `docs/season-art.md` |
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
  よいのは、「横断の罠」に入るもの——どの画面を触っても踏むもの——
  だけ。ここをもう一度太らせないこと。
- **短く書く**（2026年10月10日、制限の節約の点検で）。書いたもの・読んだものは会話に残り、以後の
  毎ターン読み直される。書く（出力）は読むより数倍高い。10月8〜10日の2日で、docs に約17万字・tests に
  約21万字を書いていた（js は約10万字）。docs には決めごと・罠・その理由だけ（「一度こわした」話は罠として
  一、二文で）。調べた経過・試した順・測った数字の並びは書かない——残すのは結論の数字。頼まれた記録は
  `docs/log/` へ要点だけ。同じことを二か所に書かない：commit の本文は数行（何を・なぜ）、`tests/INDEX.md` の
  行は一文（詳しくは台本の頭のコメント）。
- **大きい docs は丸ごと読まない**（2026年10月4日、利用者が決めた）。まず
  `grep -n '^#' docs/〜.md` で見出しを見て、触る所の節だけ読む。どの節か
  迷ったら全部読む。全画面に共通の罠は `docs/traps.md` に集めてあり、そちらは
  画面を触るたびに必ず読む。
- **数千行の .js と `tests/INDEX.md` も丸ごと読まない**（2026年10月8日、制限の節約の点検で）。
  `store.js`（約4,800行）・`screen-todo.js`（約6,000行）・`screen-diet.js`（約5,000行）は、頭から
  開くだけで2,000行が載る。`grep -n` で場所を引き、`offset`／`limit` で前後だけ。`tests/INDEX.md`
  （約3万字・一行に一本）は台本の名前か言葉で grep する——**出すのは名前だけ**
  （`grep 言葉 tests/INDEX.md | cut -s -d'|' -f2`）。一行が平均600字あり、行ごと出すと「紙」で67行・約4.5万字、
  「設定」で約3.3万字が載る（名前だけなら約1,200字。2026年10月10日）。中身は台本の頭のコメント
  （`head -12 tests/<名前>`）で見る。測った中身は `docs/log/data-check.md`。
- **作業の記録は `docs/log/`**（2026年10月4日）。セッションごとの「やったこと」など、
  決めごとを含まない記録だけを、**一字も変えずに**節ごと移す（移した位置に「移した N」を
  指す一行）。決めごとと日付・利用者の声が同じ文に入っている節は動かさない——分けると
  書き換えになるので。`grep -rn` は `docs/` の下まで見るので、移したものも出る。

## 横断の罠

`docs/traps.md` へ移した（2026年10月4日。画面を触るたびに読むので、この
ファイルごと読まずに済むよう小さく分けた）。

## セッションの区切り（制限の節約。利用者の希望）

会話が長くなるほど、1ターンごとの消費が増える（それまでの文脈を毎回読み
直すため）。**一つの区切りがついたら**、次の作業を新しいセッションで始めた
ほうが安いかを判断し、そのほうがよければ**タイミングと、次のセッションに
そのまま貼れるプロンプト**を利用者に示すこと。目安：

- 数ファイルにまたがる作業や調査が、一つ終わったとき
- CLAUDE.md や docs を書き換えたあと（新しいセッションは新しい中身で始まる）
- 別の画面・別の話題へ移るとき

**モデルと effort の目安**（2026年10月10日。次のセッションのプロンプトを示すとき、一緒に言う。
docs にはモデルの名前を書かない——会話の中で、その時のものを言う）：

- 軽いモデル・中：文言・試験の直し・docs の手入れ・数を見るだけのもの・一画面の小さな直し
- 重いモデル・中：画面をまたぐ変更・共通の部品（`ui.js`・`store.js` ほか）
- 重いモデル・高：原因の分からない不具合・データまわり（保存・復元・移行）・ロードマップや総点検の調べもの
  （調べるセッションと作るセッションは分ける）
- 迷ったら軽いほうで始め、詰まったら切り替える。max は使わない（考えた分はそのまま出力として数えられる）。

**呼ぶ回数を減らす**：ツールを一度呼ぶたびに、それまでの会話を丸ごと読み直す。独立した確認（git の状態・grep・
wc）は一つの Bash にまとめ、出力は `| head`・`| cut`・`| wc` で小さくしてから見る。
