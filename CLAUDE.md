# くらしノート (kaimono-note)

日本語のバニラJS PWA（買うもの・やること・ダイエット・daily の4タブ）。GitHub Pages で配信。
**このファイルは毎回の会話に丸ごと載る。一行も太らせない。** 全文・経緯は `docs/dev.md`。

## 絶対に破らない

- **データ保全が最優先**（消失事故の前歴あり）。`backup.js`・`live-idb.js`・復元処理・既存の
  localStorage とバックアップには、要るとき以外触れない。設定の追加は後方互換に（`reconcile()`）。
  **データの移行・既存記録の作り替え・後戻りできないことは、実行せず先に報告。**
- **中継所URL（`kurashi-relay.*.workers.dev/...`）は資格情報。** どこにも書かず、fetch もしない
  （古い版の GET は保留中の健康データを消す）。`relay/worker.js` の GET は消さない。
- **利用者が貼る日記本文は形式判定にだけ使う。** 引用・言及・要約しない。
- **UIに絵文字を出さない・打ちこむ欄も置かない**（`icon()` か `.chip-dot`）。保存済みの `emoji` 欄は消さない。
- **画面に説明文を書かない。** 要る一言だけ短く大きく。まれな手順は `more()` で畳む。
- **daily は評価しない**（目標・連続記録・月比較・達成率・空白日の警告色）。`tests/daily-rules.js` が見張る。
- モデル識別子をコミット・PR・コードコメントに書かない。

## 流し方（訊かずに main まで）

- ブランチはセッションの指定どおり（無ければ `claude/<話題>` を切る）。直したら テスト → コミット →
  `git push -u origin <branch>` → `git push origin <branch>:main`（`--force` なし）。
  **ローカルの `main` は使わない。** 断られたら `git fetch origin main && git merge origin/main` → テスト → 再push。
- push すると門（`run-all.js --gate`）が回る。結論は一度だけ見る：`mcp__github__actions_list`
  （list_workflow_runs・resource_id "pages.yml"・perPage 1）。run_number と head_sha を照らす。
- `stamp-build.js` はローカルで実行・コミットしない。PR は頼まれたときだけ。

## コードの罠

- 名前空間 `KN.*`、読み込み順は `index.html`。**新しい `.js` は3箇所に登録**：`index.html`・`sw.js` の `ASSETS`・`build-standalone.js` の `JS`。
- store は localStorage `kaimono-note-v2`。`let state = load()` はモジュールの途中で走る——load が触るものは
  上に書くか `function` 宣言に（下の `const` は TDZ で落ちる＝消失事故の原因）。
- `KN.util.today()` は UTC、`dayKey()`/`todayKey()` はローカル。日をまたぐ集計は `dayKey()` 系で。
- `node(html\`…\`)` は最初のルート要素だけ返す。Daily Log は「写さず引く」——記録用の入れ物を増やさない。
- **画面（CSS/JS）を触る前に `docs/traps.md`（横断の罠）を読む**（送る器 `scrollerOf()`・`:root` に毎フレーム
  書かない・`var()` の解決先・`transform` の取り合い・`--m-*`/`--z-*`・`--c-primary` と `-fill`・詳細度ほか）。

## テスト

- Playwright。台本は `tests/`、書き方と「試験の罠」は `tests/README.md`（`open()` を使う）、一覧は `tests/INDEX.md`（3万字。grep で引く）。
- `NODE_PATH=/opt/node22/lib/node_modules node tests/<台本>.js`。全部は `tests/run-all.js`（約8分）。
- 触った画面の主要テストと `tests/daily-rules.js` は毎回走らせる。

## docs（触る前に、該当するものだけ。丸ごと読まず `grep -n '^#'` で見出しを見て、触る節を読む。数千行の .js も grep で引いて前後だけ）

時間割・`plan.js`・`day-road.js` → todo-timeline ／ 手順・長期・期限・くり返し・`when-parse.js` → todo-items ／
紙・`scrollerOf`・`pull-refresh.js`・`--kb` → sheet-scroll ／ `day-swipe`・`cal-swipe`・`cal-peek`・暦 → calendar-swipe ／
設定・`edge-back.js`・中継所の紙 → settings ／ `app.js` の `show`・帯・`dayTitleBar` → screens-nav ／
全タブ共通の上の帯と暦 → shared-header、その空（`sky.js`）→ sky ／ 下の帯・`tab-lens.js` → tabbar ／ 買うもの・価格 → shopping ／
ダイエット・中継所・`bell.js`・push → health ／ daily → daily ／ ノート → notes ／ 季節の絵・七十二候 → season-art ／
保存・`backup.js`・`idb.js`・日記の写し → storage ／ 動き → motion ／ ガラス → glass ／ 色・字・`--z-*`・絵文字 → look ／
絵：系統 → icons、描く → icons-drawing、引き当て → icons-matching ／ 開発・テスト → dev

- コメントの「CLAUDE.md の『〜』」は `grep -rn '〜' docs/` で出る。新しい決めごとは該当する docs に書く。
- 一区切りついたら、新しいセッションのほうが安いか判断し、そうならタイミングと貼れるプロンプトを示す。
