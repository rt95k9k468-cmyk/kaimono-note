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
- **アプリ内UIに絵文字を使わない。**（`js/uiicon.js` が手描きアイコンで代替）
- **daily（日記）は評価しない。** 目標・連続記録・月比較・達成率・空白日の
  警告色などを一切出さない。`js/daily-rules.js` のテスト群がこれを見張る。
- モデル識別子（Claude Opus/Sonnet等）をコミットメッセージ・PR・コード
  コメントに書かない。

## 開発ブランチとデプロイ

- 作業ブランチ: `claude/shopping-list-file-migration-ct4ufx`
- ユーザーの明示的な許可のもと、`main` への直接pushが認められている：
  ```
  git push -u origin claude/shopping-list-file-migration-ct4ufx
  git checkout main && git merge --ff-only claude/shopping-list-file-migration-ct4ufx
  git push origin main
  git checkout claude/shopping-list-file-migration-ct4ufx
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
  はモジュール評価の途中（450行目あたり）で走る**ので、load パスが触れる
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
  (setsid python3 -m http.server 8765 --directory /workspace/kaimono-note >/dev/null 2>&1 < /dev/null &)
  ```
  サーバーはターンをまたぐと落ちていることがあるので、テスト前に生きて
  いるか確認し、必要なら上のコマンドで再起動する。
- 実行：`NODE_PATH=/opt/node22/lib/node_modules node <test>.js`
- 既存のテスト資産（daily-rules.js / daily2-smoke.js / aimeal.js など）は
  過去のセッションのスクラッチ領域にあり、新しいセッションでは失われて
  いる。テストを再走行したい場合は、対象の挙動から新しく書き起こす。
- 変更のたびに、触った画面の主要テストと `daily-rules.js`（dailyの非評価
  原則）は必ず走らせる。

## 現在の状態（このファイルを作った時点）

`main` とこの作業ブランチは同じコミットで、デプロイ済み・保留中のタスクは
無い。直近の作業内容は `git log` を見ること。
