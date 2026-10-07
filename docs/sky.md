# 帯の空（朝・昼・夕方・夜）

上の帯と暦（`#head`、全タブで一つ。`shared-header.md`）の後ろに、いまの時間帯の空を敷く。
2026年10月7日に計画し、同じ日に段1（描いた空）と段2の写真（4枚、続けて季節×時間帯の16枚）まで入れた。利用者の言葉では「カレンダーの部分に空の画像を
背景に。空単体ではなく、自然や海を含んでいてもいい」。

## 決めたこと（2026年10月7日、全部おすすめどおり）

1. **敷く範囲は、帯（日付と右のボタン）と暦をまとめて一枚。** 帯だけ・暦だけに分けると細い帯になる。
2. **区切りは、その日の日の出・日の入りで四つ。** 決まった時刻だと、夏の18時半（まだ明るい）と冬の
   17時半（もう暗い）が同じ空になる。
3. **写真は、まず時間帯ごとに4枚で見て、よければ時間帯×四季の16枚。**（同じ日に16枚へ。「64枚」と頼まれたが、
   季節×時間帯は16なので、利用者に訊いて「まず16枚、のちに増やす」に）
4. **daily は、紙の後ろの季節の写真と両方出して見る**（同じ日に、広重はノートの地へ移った。`season-art.md`）。
   気になれば daily だけ空を止める。

決めなくても起きること：空はいつも**いまの時刻**のもの。過去・未来の日を見ていても替えない（日を払うたびに
空が替わると「帯は微動だにしない」に反する）。帯は全タブ共通なので、空も全タブに出る（ノートでは帯だけ）。

## 段

| 段 | 中身 | 状態 |
|---|---|---|
| 1 | 仕組みと見た目を、描いた空（色の重なり、4つ）で | 入れた（2026年10月7日） |
| 2 | 写真を集める（まず4枚、よければ16枚） | 4枚を入れ、同じ日に16枚（季節×時間帯）へ（2026年10月7日）。64枚（16×4枚を回す）は16枚を実機で見てから |
| 3 | iPhone で濃さ・区切り・daily との重なりを詰める | 写真の濃さと縦の位置・紙の丸角の外まで空・流れる途中も丸角・上で引いたすき間も空（2026年10月7日）。時計の帯までは iOS 26 の都合で戻した。同じ日に写真を二段濃く・ぼかしを軽く・時計の帯の色を theme-color で試したが映らず外した。ほかは見てから |

## 区切り（`js/sky.js`）

| 時間帯 | 札 | 始まり | 今日（10/7・東京）なら |
|---|---|---|---|
| 朝 | `morning` | 日の出の30分前 | 5:09 |
| 昼 | `day` | 10時 | 10:00 |
| 夕方 | `evening` | 日の入りの1時間前 | 16:17 |
| 夜 | `night` | 日の入りの30分後 | 17:47 |

- 日の出・日の入りは NOAA の近似式（数分の誤差）。**位置情報は訊かない。** 端末の時間帯が日本（+9時間）なら
  東京、それ以外はその時間帯の真ん中の経度（旅先で昼に夜空が出ない）。緯度は東京のまま。
- 開いたまま区切りをまたいだら、次の区切りの1秒後に札を替える（`setTimeout`）。iPhone は隠れているあいだ
  時計を止めるので、戻ってきたとき（`visibilitychange`・`pageshow`）にも測り直す。

## 作り

- **js は `#head` に `data-sky` の札を付けるだけ。** 色は CSS（base.css の「帯の空」）が明るい面・暗い面ごとに
  持つ。カスタムプロパティは書かない（docs/traps.md）。札が替わると色は `--m-season` でゆっくり移る
  （`@property --sky-a/c/d`。動きを減らす設定では切り替えるだけ）。
- 帯（`.topbar`）と暦（`.cal`）は、札のあるときだけ地を塗るのをやめて空を透かす。札が無ければいままでどおり。
- 空は帯の後ろの一枚（`.head[data-sky]::before`）が描く。帯の下の端から紙の角の半径（`--r-xl`）だけ下へはみ出し、
  **下の画面の後ろ**に敷く（帯は z-index を持たず地も塗らない。-1 は deck の奥へ行く）。画面（`.panes > .screen`）は
  上の角を丸めて成形してあり、角の外から空が覗く（段3、2026年10月7日。「丸角のところが真っ白」）。
  `--sky-a/c/d` は `inherits: true`（擬似要素が色を継ぐ）。
  - 前は帯を前（`--z-stick`）に出し、はみ出しを mask で角の形に抜いた当て布にしていた。当て布は動かないので、
    タブを流すあいだ角が地の色になり、着いてから丸角になった（実機）。角は紙と一緒に動くものとして画面に持たせた。
  - 同時に、タブの流れの出る面の曲線を入る面と同じ `--ease-out` に（`motion.md` の例外）。分けたままだと二枚が
    大きく重なり、上の紙の角の下に同じ色の紙が覗いて丸角が見えない。いまは二枚が並んで流れ、あいだの角に空。
  - **空は角の下へさらに `--sky-more`（140px）続く。** 紙の画面（やること・daily・買うもの）は、その帯ぶん画面の地を
    透かす（`.is-face-front`・`.is-face-parked` は元から透明なので除く）。いちばん上でさらに引くと紙が下がる
    （`pull-refresh.js` の give、最大 `GIVE` 76px）——そこに地の白が出ていた（実機）。いまは紙が空からはがれて
    見える。探す欄（約 58px）が紙の上に開いていても届く長さ。日を払うときの紙と紙のあいだの角も空になった。
    写真の縦の位置は `calc(55% - .55 * var(--sky-more))` で伸ばしたぶん戻し、帯の中は据え置き。
  - 写真の下端より下（月に開いて大きく引いたとき見える）は、写真ごとの地面の色 `--sky-g`（下端 12 行の平均）で
    続ける。描いた空の淡い色だと、そこだけ白い帯になる。**写真を足したら `--sky-g` も測って足す。**
- 色の止まる場所は px（`--safe-t` から）。% で書くと、暦を月に開いたとき空ごと伸びる。週では上の濃い所と
  淡い所だけ、月に開くと下の色（地平の色）まで見える。
- 下の端は溶かさない（段3、2026年10月7日。前は 16px を地の色へ溶かしていたが、iPhone で「白いぼかし、なくていい」。
  外しても紙の角の後ろに空が続き、継ぎ目は出ない）。
- ノートへ移るとき、暦は帯の裏へ上がる（`notes.md`）。帯が透けるので、上がった所（帯の下の線より上）を
  `clip-path` で切る（`--face-p` と `--face-lift` から。js は足さない）。
- 設定：外観 → 表示 →「空を出す」（`settings.sky`。既定は入。`!== false` で読むので古い保存もそのまま）。
  写真の出典はその下の「空の写真の出典」（`KN.sky.credits()`）。

## 色の決まり（字の濃さの比）

`tests/sky.js` が**画面の画素で**見張る（字を隠して帯を撮り、字の箱の中を5点ずつ測る。門に入っている）。

- 題の段（いちばん上〜帯の下）：題の字・年の主色・ボタンの絵が 3:1 以上。
- 暦の段（曜日から下）：どの字も、空の無いときより読みにくくしない（4.5:1、もともとそれ未満の字は元の比）。

明るい面では暦の字がもともと地の上で 4.5:1 前後（土曜の曜日は 3.44:1）なので、**暦の段は地より暗くできない**。
だから明るい面の空は、上（題の段）で空らしく、暦の段では地より明るい淡い色になる。暗い面は余裕があり
（いちばん狭いのは昼の土曜の曜日で 4.93:1）、深い色を置ける。夜空らしい夜は暗い面で映える。

もっと濃くしたいなら、空ではなく字のほうを替える話になる（暦の数字・曜日を濃くする。今日の数字の主色が
4.5:1 で頭打ちなので、それも含めて）。段3で、写真のあいだだけそうした（下の「幕」）。描いた空はそのまま。

## 段2の手順（写真）

1. 出どころは Wikimedia Commons（`season-art.md` の写真の表と同じ決まり：CC0／パブリックドメインを先に、
   CC BY／BY-SA は設定に出典。人の顔・ロゴ・透かし・大きな文字は除く）。空だけでなく、海・山・田・雪原・桜・紅葉
   など**その時間の光が分かる景色**でよい。上が空、下に地平や景色のある絵が合う（週では上だけ見え、月に開くと
   下の景色が出る）。
2. 加工は `tools/season-art.js` に空の口を足す（正方形に切る・縮める・軽くぼかす・WebP。1枚 40KB まで）。置き場は
   `img/sky/`、名前は `<季節>-<札>.webp`（`spring|summer|autumn|winter`。4枚の間は `<札>.webp` だった）。
   季節は立春・立夏・立秋・立冬で区切る（`js/season.js` の節気。`KN.sky.seasonOf`）。季節は日で替わるので、`js/sky.js` は
   夜中の0時にも測り直す（夜のまま写真だけ替わる）。`#head` の札は時間帯（`data-sky`）と写真（`data-sky-img="autumn-day"`
   など）の二つ。CSS は写真の札が時間帯の札で終わるとき（`$="-day"`）だけ写真を敷き、幕の色（`--sky-v1/v2`）は時間帯ごと。
3. sw.js は季節の絵と同じく**別の名前のキャッシュ**に覚える（ASSETS に入れない。版のキャッシュに入れると、
   出すたびに消える）。読めないあいだは描いた空のまま。
   一度覚えた写真は取り直さないので、**描き直したら URL の `?v=` を上げる**（`KN.sky.PHOTO` の `file` と base.css の
   `--sky-photo` を同じ値に。試験が見張る）。16枚は名前が新しいので `?v=` なし（4枚のころの `?v=2` は役目を終えた）。
   古い版は覚え場所に残るが小さい。
4. 写真の上には幕を重ねる（混ぜ方で上限・下限を決める。下の「幕」）。濃さは `tests/sky.js` の画素の試験が、
   写真を敷いた状態でも見張る。
5. 出典を設定の奥に（`KN.seasonArt.credits()` と同じ形）。

## 写真の表（Wikimedia Commons・2026年10月7日）

`img/sky/<季節>-<札>.webp`・`KN.sky.PHOTO`。16枚・合計 476KB（1枚 40KB まで）。全部日本で撮ったもの。4枚のころの写真のうち、
撮った日が季節に合う3枚（朝・夕方・夜）は残し、昼（塩見岳、9月）は秋の昼に紅葉の写真があったので外した。
新しい12枚は、検索で約200枚を縮小一覧に並べて目で選んだ（人の顔・ロゴ・透かし・文字の無いもの、上が空で下に景色の
あるもの、**その季節の手がかり**——桜・ひまわり・蛍・紅葉・雪——のあるもの）。時間帯は題か撮影時刻で確かめた
（Find47 の説明には撮影時刻がある）。撮った日は、なるべく立春・立夏・立秋・立冬の区切りどおりの季節から。
半分は Koichi Hayakawa さんの新潟の写真（Find47・Flickr「Japanese beauty」。季節と時間の分かる風景がそろっていた）。

| 季節と時間帯 | 写真の題 | 作者 | ライセンス | URL | 選んだ理由 |
|---|---|---|---|---|---|
| 春の朝 `spring-morning` | 2010-4-18 日の出(The sunrise) - panoramio | ys1979 | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:2010-4-18_日の出(The_sunrise)_-_panoramio.jpg | 霞む山並みに昇る日。撮影 4/18 |
| 春の昼 `spring-day` | Aomori-Hirosaki Cherry Blossom Festival and Mt. Iwaki-xl | mko294 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Aomori-Hirosaki_Cherry_Blossom_Festival_and_Mt._Iwaki-xl.jpg | 弘前城の堀の桜と岩木山、青空。撮影 4/24 |
| 春の夕方 `spring-evening` | Shiroyone-Senmaida sunset | MaedaAkihiko | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Shiroyone-Senmaida_sunset.jpg | 白米千枚田と海に沈む夕日。撮影 5/1（4枚のころの夕方） |
| 春の夜 `spring-night` | Niigata-Snowy mountain and spring Milky Way - Flickr - Japanese beauty | Koichi Hayakawa | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Niigata-Snowy_mountain_and_spring_Milky_Way_-_Flickr_-_Japanese_beauty.jpg | 雪の山と春の天の川、麓の町の灯（新潟。4枚のころの夜） |
| 夏の朝 `summer-morning` | Find47 Niigata-Early summer awakening (Yamakoshi's rice terraces and ponds)-m | Koichi Hayakawa | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Find47_Niigata-Early_summer_awakening_(Yamakoshi's_rice_terraces_and_ponds)-m.jpg | 山古志の棚田に昇る初夏の朝日。撮影 6/4 |
| 夏の昼 `summer-day` | Find47 Niigata-Vitamin color (Yamamotoyama Kogen sunflower field, Ojiya City)-m | Koichi Hayakawa | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Find47_Niigata-Vitamin_color_(Yamamotoyama_Kogen_sunflower_field,_Ojiya_City)-m.jpg | 山本山高原のひまわり畑と夏の雲。撮影 8/19（暦では立秋の後だが、絵は夏） |
| 夏の夕方 `summer-evening` | Niigata-Sunset on the Echigo Plain-m - Flickr - Japanese beauty | Koichi Hayakawa | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Niigata-Sunset_on_the_Echigo_Plain-m_-_Flickr_-_Japanese_beauty.jpg | 水を張った越後平野に沈む夕日。撮影 5/23 18:48 |
| 夏の夜 `summer-night` | Find47 Niigata-Dance of firefly (Takigashira marshland・Aga-town)-m | Koichi Hayakawa | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Find47_Niigata-Dance_of_firefly_(Takigashira_marshland繝ｻAga-town)-m.jpg | 滝頭湿原（阿賀町）の蛍の光と木道。撮影 7/8。Commons のファイル名は「・」が文字化けしたまま（URL はそのとおりに） |
| 秋の朝 `autumn-morning` | Mount Fuji early morning from Lake Motosu - Nov 2, 2008 | [puamelia] | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Mount_Fuji_early_morning_from_Lake_Motosu_-_Nov_2,_2008.jpg | 本栖湖から見た明け方の富士。撮影 11/2（4枚のころの朝） |
| 秋の昼 `autumn-day` | Nagano-Togakushi Kagamiike Autumn leaves-xl | Koichi Hayakawa | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Nagano-Togakushi_Kagamiike_Autumn_leaves-xl.jpg | 戸隠・鏡池に映る紅葉と戸隠連峰、青空。撮影 10/28 |
| 秋の夕方 `autumn-evening` | Landscape of Hazaki (Niigata City, a row of Hazaki trees in Manganji) (51556156427) | Koichi Hayakawa | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Landscape_of_Hazaki_(Niigata_City,_a_row_of_Hazaki_trees_in_Manganji)_(51556156427).jpg | 満願寺のはさ木並木に沈む夕日。撮影 9/24。左下の署名は正方形に切ると外れる |
| 秋の夜 `autumn-night` | Niigata-Echigo Plain is illuminated by the moonlight.-m - Flickr - Japanese beauty | Koichi Hayakawa | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Niigata-Echigo_Plain_is_illuminated_by_the_moonlight.-m_-_Flickr_-_Japanese_beauty.jpg | 月明かりの雲と越後平野の灯。撮影は 4/16 だが、夜で季節の手がかりが無く、月を秋に |
| 冬の朝 `winter-morning` | Find47 Niigata-River (Shinano River, Ojiya City)-m | Koichi Hayakawa | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Find47_Niigata-River_(Shinano_River,_Ojiya_City)-m.jpg | 雪の信濃川の夜明け（小千谷市）。撮影 2/20 6:13 |
| 冬の昼 `winter-day` | Mount Yoko from Tsuboniwa | Naganojmmmm | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Mount_Yoko_from_Tsuboniwa.jpg | 八ヶ岳・坪庭の霧氷と濃い青空。撮影 1/19 |
| 冬の夕方 `winter-evening` | Sunset, Hokkaido | Kaibak | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Sunset,_Hokkaido.jpg | 雪の林に沈む夕日（北海道）。撮影 1/2 |
| 冬の夜 `winter-night` | Shirakawa-go 001 | tsuda | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Shirakawa-go_001.jpg | 雪の白川郷の灯（荻町城跡展望台から）。撮影 1/9 |

- 加工：`node tools/season-art.js sky`（`tools/sky-src/<季節>-<札>.jpg` → 正方形に切って 853px・彩度 115%・ぼかし 1px・WebP・1枚 40KB まで）。
  元は Commons の 1280px 版（853px はその短い辺そのまま）。16:9 の2枚（夏の夕方・秋の昼）は 1280px 版の短い辺が 720px なので
  1920px 版から。冬の夕方は 1280px 版が 848px で、そのまま 848px。細かい花や葉の写真は 40KB に収めるため質が下がる
  （春の昼 0.24・夏の昼 0.3。実寸で見て粗さは目立たない）。前は 720px・ぼかし 2px・25KB で、幅 390 の iPhone（3倍）では
  ぼけて見えた（「ぼかしを減らし、少し濃く」・10月7日）。左右のどこを残すかは道具の `CROP`（写真の札ごと。春の昼 0.45・
  春の夕方 0.4・春の夜 0.55・夏の朝 0.45・夏の夕方 0.6〔日が右寄り〕・秋の朝 0.55・ほかは真ん中）。
- `--sky-g`（写真の下端 12 行の平均）は16枚ぶん測った（時計の帯の `BAR` は外した。下の「時計の帯」）。
  測り方は 4 枚のころの値と同じ（残した3枚で一致を確かめた）。下端が暗い写真（夏の夕方・秋の夕方・夏の夜）は地面の色も黒に近い。
- 正方形なのは、幅 390 の iPhone で月に開いた暦（安全域込みで約 400px）まで届くように。幅いっぱいに敷き、縦は
  `50% 55%` で合わせる（段3）：週（帯が約 135px）では写真の真ん中——富士・山並み・日・町の灯——が出て、月に開くと
  ほぼ全部。暦の高さにつれて写真も少し動く（伸びるぶんの 55%）。上から合わせていたころは、週では空しか見えなかった。
- 探し方：API は User-Agent に連絡先（このリポジトリの URL）を書くと通る。縮小版は `upload.wikimedia.org/.../thumb/...`。
  429 は `retry-after`（10秒）を守る。

### 幕（字の濃さ）

写真は画素の明暗が大きく、試験の測る点だけで合わせると、幅の違う画面や別の写真で崩れる。だから**混ぜ方で上限・下限を
決めて、どんな画素でも比が守られる**ようにした（base.css の「写真（段2・段3）」）。

- 明るい面：`screen`。screen は幕より暗くならない（灰の幕なら「写真を白に重ねて薄めた」のと同じ）。幕は時間帯の
  色（朝 薄紅・昼 青・夕方 橙・夜 藍。`--sky-v1/v2`）で、題の段は輝度 0.30（40% 濃くした主色に 3:1。いちばん
  厳しいのは青緑 `#2b7f8f` で 0.283）、暦の段は 0.425（50% 濃くした字に 4.5:1。いちばん厳しいのは土曜の曜日で 0.405）。
  幕の色は前の淡い色を、色味を変えずに（線形の光で割合をそろえて）暗くしたもの。
- 暗い面：`multiply`、幕は灰色。multiply は幕より明るくならない。題の段 `#686868` は 40% 明るくした主色
  （いちばん厳しいのは緑で、3:1 の上限が輝度 0.151）とボタンの絵に 3:1、暦の段 `#505052` は 50% 明るくした字に
  4.5:1（上限 0.085）。
- 色が替わるのは題の字の下（34px）と曜日の上（56px）のあいだ。
- **字は、写真のあいだだけ濃く（暗い面は明るく）する。** 題の段の主色とボタンの絵は 40%（`.head[data-sky-img] > .topbar`
  で `--c-primary`・`--c-text-2`）、暦の字は 50%（`.head[data-sky-img] .cal` で `--c-text-2/3`・`--c-danger`・
  `--c-primary`・`--cal-blue`）。もとの色は `.head` で `--sky-was-*` に控える——同じ要素で自分を参照すると無効。
  今日の丸の塗りは字ではないので、もとの基調色のまま。題の字（黒・白）は混ぜない。
- 2026年10月7日、iPhone で「もう少し画像が濃くていい」と言われ、題 0%・暦 35% から 25%・45% へ。写真の見える幅は
  明るい面の題の段で約2倍、暦の段で約1.4倍、暗い面で約1.2倍。代わりに土日の字の色味が少し沈む。
  同じ日に「もっと濃く、それかぼかしを減らす」。見本（今／ぼかしだけ／字をさらに濃く／帯だけ暗い写真に白い字）を
  見せ、「ぼかしを減らし、なおかつ少し濃く」に：題 40%・暦 50%、写真は彩度 115%・ぼかし 1px。白い字の案は採らなかった。
  割合は、各基調色・各字の色について題 3:1・暦 4.5:1 になる幕の輝度の境を計算して決めた。
- 段2では幕が描いた空そのもの（暦の段は地より暗くできない）で、明るい面の写真はほとんど見えず、暗い面の暦の段も
  輝度 0.018 まで沈んでいた。iPhone で「もう少しよく見えたら」と言われ、字のほうを濃くして幕を薄くした
  （写真の見える幅は、明るい面で数% → 約 20%、暗い面の暦の段で 14% → 27%）。
- 写真が読めるまでは `data-sky-img` が付かず、描いた空のまま（二つの札がそろったときだけ写真の層を出す。
  そろっていないのに写真の層を出すと、screen の幕が描いた空を白っぽくする）。札の替わり目は、色はゆっくり移るが写真は
  読めたときに切り替わる。

## 実機で見ること（段3）

- 空の濃さ。写真は段3で字を濃くして見せ、同じ日にさらに二段（題 40%・暦 50%。上の「幕」）。暦はもう目安の上限を
  越えている（それより上は曜日・数字が黒・白に近づき、土日の色が濁る）。もっと要るなら、帯だけ暗い写真に白い字の案（見本あり）。
- 時計の帯（ステータスバー）：**`default` のまま（iOS が塗る）。空は時計の帯の下から。** 2026年10月7日に一度
  `black-translucent` にして時刻・電波・電池の段まで空を敷いたが、同じ日に戻した。わかったこと：
  - この指定は**ホーム画面に追加した時点で焼きつく**（WebKit Bug 260508）。変えたら追加し直しが要る。
  - iOS 26 は black-translucent のアプリを、画面の底より**時計の帯ひとつぶん短く**作る（WebKit Bug 301108）。
    その帯はアプリの外で、CSS では塗れない。シェルを伸ばしたら（本当の底まで・fixed に貼りつけ）タブ欄が切れた。
    利用者に「空を時計まで・下の空白は我慢」か「元に戻す」かを訊き、**元に戻す**に。
  - iOS 26 は black-translucent でも時計の字を明るい面では黒で描く（白と思って敷いた黒い影は「黒い帯」に見えた）。
  - `tests/sky.js` が `default` を見張る（black-translucent に戻さない）。
  - **読み込みの時点で theme-color を空の色にする試しも、映らなかった（2026年10月7日、iPhone）。** アプリを閉じて
    開き直しても帯は白っぽい灰のまま。iOS 26 は帯の色を、ホーム画面に追加したときの manifest の色で固定するとみる。
    開いたあとの差し替え（`notes.md` の段4.1〜4.3）と合わせて、**theme-color でも地でも帯は変わらない。同じ手を
    もう一度試さないこと。** コードは外した（`tests/sky.js` が theme-color を変えないことを見張る）。
    残る手は manifest の `theme_color` を変えての追加し直しだけ。データの引っ越しが要り危険が大きいので、
    やるなら利用者が決めてから。
  - 追加し直すとき：古いほうで「バックアップを保存」→ ファイルに置く → 新しいほう（または `default` で焼きついて
    いる前のアプリ）で復元（「入りきりません」なら先に「日記を記録から外す」）→ 数を見比べる → Dropbox・顔の鍵・
    通知は入れ直す（記録の外）。中継所の URL は設定ごと移るので、**移したら古いほうを開かない**。古いほうは数日
    使ってから消す（保存場所ごと消える。`improvements.md` の B5）。
- daily：上に空、紙に季節の写真（ノートは帯に空、紙に広重）。二枚がうるさければ daily だけ空を止める。
- 明るい面の夜は淡い藍色まで。夜らしさが足りないなら、夜だけの扱いを相談する。
- 写真の見え方（段3で濃くした）・縦の位置（`50% 55%`）・左右の位置（`CROP`）。16枚（季節×時間帯）にした。いまの季節（秋）の
  4枚から見る。ほかの季節は区切りの日に替わる。64枚（同じ季節・時間帯の4枚を回す）は、16枚を見てから。
- タブを流すあいだの丸角（画面が角を持ち、二枚が並んで流れる）。流れの手ざわりが変わっていないか（出る面の曲線を
  入る面にそろえた）。
- いちばん上で引いたすき間（空が出る。月に開いたときは写真の下端の先が地面の色で続く）。
