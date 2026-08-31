# UIアイコンを Phosphor へ — 調査と移行

対象: `KN.util.icon(name)` が引く **UIアイコン 55個**（操作の記号）
移行先: [Phosphor Icons](https://phosphoricons.com/) v2.1.1 / MIT License / © 2023 Phosphor Icons

---

## 1. 調査 — このアプリの「アイコン」は三系統ある

「アイコンを移行する」と言ったとき、何を指すのかがまず問題でした。中身の
違う三つが同じ言葉で呼ばれています。

| # | 系統 | 実体 | 個数 | 置き場所 | 今回 |
|---|---|---|---|---|---|
| ① | **UIアイコン** | 操作の記号（＋・歯車・★…）。単色の線画 | **55** | `js/util.js` の `ICON_PATHS` | **移行した** |
| ② | **商品アイコン** | 品物の絵。**色そのものが「何の品物か」を言う**多色のイラスト | 708 | `js/icons-v2.js`（`js/icon-system.js` の語彙の上） | 対象外（下記） |
| ③ | **空の画面の絵** | かご・メモ帳などの挿絵 | 数点 | `js/empty-art.js` | 対象外（挿絵） |

②を移行しないのは、代替が無いからです。Phosphor は**単色の記号**の一族で、
卵の黄身の色も洗剤の青も持っていません。`CLAUDE.md` にも「絵を残して、地の
ほうを濃くする」と明記のある、このアプリの identity にあたる部分です。
**②③はまとめて分類 C** として、一つも触っていません。

以下は①の55個の話です。

---

## 2. 分類 — A / B / C / D

- **A** ＝ ほぼ完全一致（49個）
- **B** ＝ 十分代替可能。意味は通るが形が少し違う（4個）
- **C** ＝ 適切な代替なし。**置き換えていない**（1個）
- **D** ＝ 未使用（3個。※ A/B とは別軸で、A のうち3個が未使用）

| 名前 | Phosphor | 判 | 使用 | ひとこと |
|---|---|---|---|---|
| `list` | `list-bullets` | A | ✓ | 点＋三本線 |
| `tag` | `tag` | A | ✓ | 穴の位置まで同じ |
| `shop` | `storefront` | A | **D** | 店先 |
| `gear` | `gear` | A | ✓ | 歯車 |
| `star` | `star` | A | ✓ | 五芒星 |
| `plus` | `plus` | A | ✓ | ＋ |
| `check` | `check` | A | ✓ | ✓（下記の weight 例外） |
| `search` | `magnifying-glass` | A | ✓ | 虫めがね |
| `close` | `x` | A | ✓ | ✕ |
| `chevron` | `caret-right` | A | ✓ | › |
| `trash` | `trash` | A | ✓ | ごみ箱 |
| `edit` | `pencil-simple` | A | ✓ | 鉛筆 |
| `store` | `storefront` | A | **D** | 店先 |
| `minus` | `minus` | A | ✓ | − |
| `download` | `download-simple` | A | ✓ | 下向きの矢と受け皿 |
| `upload` | `upload-simple` | A | ✓ | 上向きの矢と台 |
| `copy` | `copy` | A | ✓ | 二枚重ねた紙 |
| `sparkles` | `sparkle` | A | ✓ | きらめき |
| `undo` | `arrow-counter-clockwise` | A | ✓ | 戻す矢 |
| `backspace` | `backspace` | A | ✓ | ⌫ |
| `cart` | `shopping-cart-simple` | A | ✓ | 買いもの車 |
| `rows` | `rows` | A | ✓ | 積んだ行 |
| `tiles` | `squares-four` | A | ✓ | 四つの四角 |
| `shopCompare` | `storefront` | **B** | ✓ | **棒グラフの「比べる」印が落ちる。** Phosphor に店＋グラフの複合形が無い。`shop`/`store` が未使用なので、この画面のなかで紛れることはない |
| `checklist` | `list-checks` | A | ✓ | ✓の付いた一覧 |
| `calendar` | `calendar-blank` | A | ✓ | 暦 |
| `calendar-off` | `calendar-slash` | A | ✓ | 斜線の入った暦 |
| `repeat` | `repeat` | A | ✓ | くりかえし |
| `flag` | `flag` | A | ✓ | 旗 |
| `book` | `book-open` | A | ✓ | 開いた本 |
| `sprout` | `plant` | **B** | ✓ | **芽 → 双葉。** こちらは「まだ何にもなっていないもの」の印で、地から出たばかりの芽。Phosphor は葉の付いた株 |
| `paper` | `file-text` | A | ✓ | 字の入った一枚 |
| `crown` | `crown-simple` | A | ✓ | 三つ山の冠 |
| `scale` | — | **C** | ✓ | **体重計。置き換えていない**（下記） |
| `flame` | `fire` | A | ✓ | 炎 |
| `steps` | `footprints` | A | ✓ | 足あと |
| `moon` | `moon` | A | ✓ | 月 |
| `meal` | `fork-knife` | A | ✓ | ナイフとフォーク |
| `camera` | `camera` | A | ✓ | カメラ |
| `chart` | `chart-line-up` | A | ✓ | 上がる折れ線 |
| `heart` | `heart` | A | ✓ | 心 |
| `route` | `road-horizon` | **B** | ✓ | **道。** こちらは真上から見た道、Phosphor は行く先の地平。どちらも「歩いた距離」は通る |
| `bed` | `bed` | A | ✓ | 寝台 |
| `sunrise` | `sun-horizon` | A | ✓ | 地平の日 |
| `sun` | `sun` | A | ✓ | 日 |
| `snack` | `cookie` | **B** | ✓ | **間食。** こちらは粒の入った丸（りんごは15pxでハートに見えたので避けた経緯がある）、Phosphor はクッキー。15pxでも粒が読めることは確認済み |
| `target` | `target` | A | ✓ | 的 |
| `trend` | `trend-up` | A | ✓ | 上がる |
| `trendDown` | `trend-down` | A | ✓ | 下がる |
| `drop` | `drop` | A | **D** | しずく |
| `clock` | `clock` | A | ✓ | 時計 |
| `more` | `dots-three` | A | ✓ | ⋯ |
| `palette` | `palette` | A | ✓ | 絵の具皿 |
| `bell` | `bell` | A | ✓ | 鈴 |
| `drink` | `beer-stein` | A | ✓ | 持ち手のあるジョッキ |

### C — 体重計（`scale`）だけは置き換えていない

ダイエットタブの顔です。Phosphor にあるのは **`scales`（天びん）** で、これは
「重さを量る」ではなく「比べる・裁く」の記号です。しかもこのアプリには
**買うものを店ごとに比べる**画面があり、天びんはそちらの意味に読まれます。
移行前のコードにも「秤の絵にすると買い物の天びんと紛れるので、乗るほうの秤に
してある」と書いてありました——同じ理由がそのまま残っています。

`gauge`（計器盤）・`barbell`（バーベル）・`person-simple` も見ましたが、
それぞれ「速さ」「筋トレ」「人」で、体重の記録ではありません。

**無理に置き換えず、手描きの絵をそのまま使っています。** `js/icons.js` の
逃げ場（fallback）が拾うので、画面側は何も知りません。まわりから浮かないよう、
線の太さだけ Phosphor Regular と同じ重さ（升目の 6.25% ＝ 1.5）に揃えました。

### D — 未使用の3個

`shop` / `store` / `drop`。使われていませんが、**消していません**（移行の
ついでに削るのは別の作業なので）。Phosphor 版も用意してあるので、使い始めれば
そのまま出ます。

---

## 3. 構造 — 画面はどの一族を使っているか知らない

```
  画面（screen-*.js）
        │  icon("gear")            ← 呼び方は移行前と同じ。一行も変えていない
        ▼
  js/util.js  icon()               ← 取り次ぎへ渡すだけの薄い一枚
        ▼
  js/icons.js  KN.icons            ← 名前 → 絵。一族の出し入れと逃げ場
        ├── js/icons-phosphor.js   register("phosphor")   ← いま使っている
        └── js/icons-legacy.js     register("legacy")     ← 手描きの55個
```

一族を入れ替えるのは一行です。

```js
KN.icons.use("legacy");   // 手描きへ全部戻る。画面には触らない
KN.icons.use("phosphor"); // 戻す
```

三つめの一族を足すときも `KN.icons.register("...", set)` を書くだけで、
画面側は何も知りません。

### 版が違うと、絵の作りも違う

|  | 手描き（legacy） | Phosphor |
|---|---|---|
| 升目 | `0 0 24 24` | `0 0 256 256` |
| 塗り | `fill:none` ＋ `stroke` | 輪郭の形を **塗った** path |
| 太さ | CSS（`--ico-w` / `--ico-sm-w`）が決める | **持ってきた weight が決める**（CSSでは変えられない） |

この違いは `KN.icons.get()` が `{ body, solid, viewBox, mode }` として返し、
`svg()` がそれに合わせて組みます。画面には漏れません。

出てくる svg は `data-ico`（名前）と `data-ico-mode`（`stroke` / `fill`）を
持ち、いま使っている一族は `<html data-icons="phosphor">` に出ています。
CSS からはこれを見て重さを合わせられます。

### 塗りを path に書いてある理由

画面のあちこちに、**線の絵を前提にした CSS** が残っています。

```css
.fav svg { fill: none; }                              /* ★の消えているほう */
.price-chevron svg { stroke: currentColor; stroke-width: 2.2; fill: none; }
.key-back svg { stroke: currentColor; stroke-width: 2.2; fill: none; }
```

`fill: none` は面の絵を**丸ごと消し**、`stroke` は輪郭のまわりをもう一度
なぞって**太らせます**。だから Phosphor の絵は `fill="currentColor"` と
`stroke="none"` を **一枚ずつの path** に書いてあります——svg を狙った CSS は
そこまで届きません。テスト（`icons-test.js`）がこれを見張っています。

---

## 4. 寸法・太さ・位置

- **weight は Regular ひとつ。** 例外は後述の ✓ だけです。
- **寸法は移行前と同じ token のまま**（`--ico` 20px / `--ico-sm` 15px）。
  svg の箱は一つも変えていないので、**レイアウトは一切動いていません。**
- **絵は箱に対して 18% ほど大きくなりました**（実測：升目に対する占め方が
  手描き 66.9%×65.4% → Phosphor 79.1%×72.5%）。Phosphor が箱をよく使う
  設計だからで、箱そのものは変わっていないため、動いたのは絵の中身だけです。
- **中心のずれは変わっていません**（実測：平均 x 0.7% / y 1.3%。手描きも
  同じ 0.7% / 1.2%）。位置ずれは出ていません。

### 面で言うところ（Fill weight）

タブの選ばれている面と、★の付いた印は、線ではなく**面**で言います。手描きの
ほうは塗り用の絵を別に描いてありました。Phosphor では同じ絵の **Fill weight**
がそれに当たります（`list-bullets` `list-checks` `tag` `book-open` `star`）。

移行前は `svg { fill: currentColor }` で線の絵を塗りつぶしていましたが、面の絵に
塗りを足しても何も変わりません（色が変わるだけで、付いているのか外れているのか
読めなくなる）。二枚の顔を差し替える形に直しました。

### weight の例外は一つだけ

**済ませる丸の中の ✓**（`.check`）は Phosphor **Bold** です。塗りつぶした丸の
上に白で抜く 15px の絵で、Regular（升目の 6.25%）だと線が地に負けて消えかけます
——白抜きは同じ太さでも細く見えるためで、移行前もここだけ 3.2 と一段太く
してありました。ほかの ✓ は Regular のままです。

---

## 5. していないこと

- 商品アイコン（708個）・空の画面の絵には触っていない
- 既存の手描き55個は**消していない**（`js/icons-legacy.js` に丸ごと保管）
- データ・保存形式・機能に変更なし
- アイコン移行以外のリファクタリングはしていない（CSS に散っている
  `stroke-width` の一つ書きも、legacy へ戻したときに要るのでそのまま）

---

## 6. 作り直しかた

`js/icons-phosphor.js` は手で書いたものではありません。

```
npm install @phosphor-icons/core@2.1.1
```

を入れて、§2 の対応表（このアプリの名前 → Phosphor の名前）で
`assets/regular/*.svg`（と、面で言う5個は `assets/fill/*.svg`、✓ だけ
`assets/bold/check-bold.svg`）から中身を引き写し、path に
`fill="currentColor" stroke="none"` を足したものです。

1512個ぜんぶは入れていません——service worker が資産を一つずつ数えて持ち歩く
つくりなので、使わない絵を入れるとその全部が端末に居座ります。
