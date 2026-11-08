# 素材の目録 — 入れられる字と絵（2026年11月8日）

くらしノートに**入れられる**字（フォント）と絵（アイコン・挿絵・写真）を、いま使っているものも含めて一枚に集めた。
決めごとではなく目録。使うと決めたら、該当する docs の決まりに従う（字 → look、アイコン → icons と ICON-*.md、
季節の絵・写真 → season-art と sky）。数字の出どころと取り直しかたは末尾。
**ライセンスは索引に出ている表示。入れる前に、配布元の LICENSE を一本ずつ読む**（Remix Icon は索引と違っていた・3-1）。

## 0. 物差し — 公開リポジトリから配る

GitHub Pages で配る＝素材の元のファイルを、誰でも落とせる形で配ることになる。だから「使ってよい」だけでなく
「**配ってよい**」ものに限る。

| | 置ける | 条件つき | 置かない |
|---|---|---|---|
| アイコン（単色の面） | MIT・Apache 2.0・ISC・CC0・OFL・BSD・MPL・Unlicense | CC BY（設定に出典の欄が要る。いまは無い） | CC BY-SA・NC・GPL・独自規約・絵文字・ロゴ |
| 季節の絵・写真 | PD（PDM）・CC0 | CC BY／BY-SA（設定に出典。いまの写真がこれ） | NC・ND・独自規約（再配布の禁止・点数の上限） |
| 字 | 端末に入っている字（配らない） | OFL・Apache の web フォント（look.md の決まりを変えるとき） | 取りに行く配信（Google Fonts の CDN・商用の配信） |

ほかの物差し：オフラインで全部の字が出る（look.md「書体は三つ」）・UI に絵文字を出さない・25px で崩れない単色
（icons-drawing.md）・出どころ（所蔵・作者・URL）が言える（season-art.md）。

## 1. いま使っているもの

**字**（`css/base.css` の「書体」の節。web フォントは無い）
- ゴシック（既定）：`-apple-system` → ヒラギノ角ゴ → 游ゴシック（`"KN Yu Gothic"`＝`local()` で Medium／Bold を束ねる）
  → Noto Sans JP → Segoe UI → Roboto → sans-serif。
- 丸ゴシック：ヒラギノ丸ゴ ProN W4。無い端末はゴシックの顔へ。
- 明朝：ヒラギノ明朝 ProN W3/W6 → 游明朝 → Noto Serif JP → serif。
- 数字：`--font-num`＝`ui-rounded`（iPhone・Mac の Safari で SF Pro Rounded）。明朝では効かせない。

**絵**
- UI：Phosphor Regular v2.1.1（MIT）。体重計だけ IconOven（線・MIT）。
- 品物（708キー）：単色シルエット。借り先は Phosphor Fill・Material Symbols（rounded fill）・MingCute Fill・Tabler Filled・
  Remix Icon Fill・Boxicons Solid・Bootstrap Icons Fill・Fluent（filled）・Pinhead・IconOven（線を面に直した3枚：まな板・ティッシュ・らっぷ）。描き起こしは無い。
- こと（108枚）：Phosphor Fill とよそのセット（手描きは無い）。空の画面 4枚（`empty-art.js`）：IconOven 3枚・andrsrxn 1枚（線・MIT）。
- ノートの地：歌川広重『名所江戸百景』72枚（NDL イメージバンク・PDM）。
- daily の紙：Wikimedia Commons の写真72枚。帯の空：同じく20枚（季節×時間帯。CC BY／BY-SA ほか）。
- 水彩の挿絵：`img/think` 4枚・`img/set` 10枚（利用者の素材）。

## 2. 字

### 2-1. 呼ぶだけで出る字（いまの決まりのまま使える）

**iPhone・iPad**（Apple の書体表で「system」のもの。「downloadable」は web から呼んでも出ない）
- 日本語：ヒラギノ角ゴ W3〜W8・丸ゴ ProN W4・明朝 ProN W3/W6 の三つで**全部**。いま全部使っている。
- 入っていない日本語：Hiragino Sans W0〜W2・W9／Klee／筑紫A丸・B丸ゴシック／凸版文久（ゴシック・明朝・見出しゴ・見出しミン）／
  游ゴシック／游明朝（+36p かな）／游教科書体（横）／BIZ UDゴシック・UD明朝／Osaka。
- 欧文（数字と英字にだけ効き、日本語は後ろの字へ落ちる）。総称で呼べるのは `system-ui`（SF Pro）・`ui-rounded`
  （SF Pro Rounded・使用中）・`ui-serif`（New York）・`ui-monospace`（SF Mono）。名前で呼べる 81 系統のうち使いどころのあるもの：
  - 丸い・やわらかい：Arial Rounded MT・Avenir Next・Futura・Gill Sans・Optima・Chalkboard SE・Noteworthy・Marker Felt・Bradley Hand
  - 数字が締まる：DIN Alternate・DIN Condensed・Helvetica Neue・Menlo・Courier New・American Typewriter
  - 明朝に合う：Didot・Bodoni 72・Baskerville・Hoefler Text・Palatino・Georgia・Charter・Cochin・Times New Roman・STIX Two
  - 筆記体・飾り：Snell Roundhand・Savoye LET・Zapfino・Party LET・Academy Engraved LET・Copperplate・Rockwell・Chalkduster・
    Papyrus・Bodoni Ornaments・Zapf Dingbats
  - 使わない：Apple Color Emoji（絵文字）
- Mac：上に加えて Hiragino Sans W0〜W9 が全部入っている（iPhone に無い太さは使わない）。游ゴシック・游明朝は Mac でも downloadable。

**Windows**（日本語版には入っている。ほかの言語の Windows では「日本語の補助フォント」を足したときだけ。細目は Microsoft の一覧で要確認）
- 游ゴシック・游ゴシック UI（使用中）・游明朝・メイリオ・Meiryo UI・MS ゴシック／MS Pゴシック／MS UI Gothic・MS 明朝／MS P明朝・
  BIZ UDゴシック／UDPゴシック・BIZ UD明朝／UDP明朝・UD デジタル 教科書体。BIZ UD と教科書体は Windows でだけ名前で出る。

**Android**（AOSP の `fonts.xml`）
- 日本語：Noto Sans CJK JP（ゴシック）・Noto Serif CJK JP（明朝）・Noto Serif Hentaigana（変体仮名）。丸ゴは無い。
- 欧文：Roboto・Roboto Flex・Noto Serif・Source Sans Pro・Droid Sans Mono・Cutive Mono・Coming Soon・Dancing Script・Carrois Gothic SC。
- メーカーが自前の字を足した機種では、それが既定になる。

### 2-2. 持てば使える字（web フォント。look.md の決まりを変えるときだけ）

持つなら**削らずに全部の字**を持つ（削ると、削った外の字＝人の名前だけが別の顔で出た・look.md）。一本で数MB、
太さごとに一本。`sw.js` の `ASSETS` と配布物（`build-standalone.js` の base64）の扱いを先に決める。

**Google Fonts の日本語 66 書体**（OFL が 64、Apache 2.0 が Kosugi と Kosugi Maru。括弧は太さの数）
- ゴシック：Noto Sans JP（可変 100–900）・BIZ UDGothic／UDPGothic（2）・IBM Plex Sans JP（7）・M PLUS 1・M PLUS 2（可変）・
  M PLUS 1p（7）・Zen Kaku Gothic New／Antique（5）・Murecho（可変）・Sawarabi Gothic・Kosugi・Shippori Antique／B1・WDXL Lubrifont JP N
- 丸ゴシック：Zen Maru Gothic（5）・M PLUS Rounded 1c（7）・Kosugi Maru・Tsukimi Rounded（5）・Mochiy Pop One／P One
- 明朝：Noto Serif JP（可変 200–900）・BIZ UDMincho／UDPMincho（2）・Shippori Mincho／B1（5）・Zen Old Mincho（5）・
  Kaisei Opti／Tokumin／Decol／HarunoUmi・Kiwi Maru（丸い明朝・3）・Sawarabi Mincho・Hina Mincho・New Tegomin・Zen Antique／Soft・Aoboshi One
- 手書き・筆・教科書体：Klee One（2）・Yomogi・Zen Kurenaido・Hachi Maru Pop・Yuji Syuku／Boku／Mai・
  Yuji Hentaigana Akari／Akebono（変体仮名）・Kapakana・Slackside One
- 見出し・飾り：Dela Gothic One・DotGothic16・RocknRoll One・Reggae One・Rampart One・Train One・Stick・Potta One・Yusei Magic・
  Cherry Bomb One・Chokokutai・Darumadrop One・Monomaniac One・Palette Mosaic・Rock 3D・Shizuru
- 等幅：M PLUS 1 Code

**Google Fonts の外**（LICENSE を読んで OFL と確かめたもの）：Source Han Sans／Source Han Serif（Adobe。Noto CJK と同じ字）・
原ノ味フォント・PlemolJP・UDEV Gothic・Moralerspace（この三つは等幅）。
ほかに名の知れた無料の字（LINE Seed JP・源柔ゴシック・源真ゴシック・源暎フォント・IPAex など）は、この版では LICENSE を読んでいない。

**数字だけの字**（ここだけは削っても欠けない）：`--font-num` の欄は数字の外を後ろの `--font` に任せている（いまの
`ui-rounded` と同じ落ち方）。だから数字だけに削った字を前に置いても、人の名前の事故は起きない。iPhone の外でも丸い数字に
したいときの候補：M PLUS Rounded 1c・Zen Maru Gothic・Kosugi Maru の数字、欧文の Nunito・Quicksand・Varela Round（どれも OFL）。

### 2-3. 使えない字

- Apple の downloadable（2-1）— 入れた端末にしか無く、web からは呼べない。
- 取りに行く配信：Google Fonts の CDN（字ごとの切り分けがオフラインで欠ける）・TypeSquare・FONTPLUS・Adobe Fonts・Morisawa Fonts。
- 絵文字の字（Apple Color Emoji・Noto Color Emoji ほか）。
- 「フリー」でも独自規約の字 — 再配布と組み込みの条件を読むまで置かない。

## 3. 絵

### 3-1. 単色のアイコン（Iconify の索引：276 セット・474,829 枚）

置けるのは **131 セット・298,568 枚**。残りは、色つき・絵文字・ロゴ・旗が 83、CC BY が 37（条件つき）、古い版で隠されたものが 16、
継承・非営利・GPL が 9。

**Remix Icon の規約が変わった**（2026年1月の「Remix Icon License v1.0」。npm と Iconify の索引は Apache 2.0 のまま）。
アプリの部品として入れるのは可（2.3）。**してはいけない**のは、単体で配る・競合するアイコン集を作る・**アプリの印やロゴにする**（3.3）。
品物とことに入っている Remix の絵は部品なので、そのままでよい。`js/icons-goods.js` の頭にある「Remix Icon Fill（Apache 2.0）」は古い表示。

**探し済み**（ICON-SILHOUETTE.md・ICON-DEIMAGINE.md・ICON-TODO.md）：Phosphor（`ph`）・Material Symbols（`material-symbols`）・Tabler Icons（`tabler`）・Remix Icon（`ri`）・Bootstrap Icons（`bi`）・Fluent UI System Icons（`fluent`）・MingCute Icon（`mingcute`）・IonIcons（`ion`）・BoxIcons v2 Solid（`bxs`）・Huge Icons（`hugeicons`）・Health Icons（`healthicons`）・Iconoir（`iconoir`）・Maki（`maki`）・Noto Emoji (v1)（`noto-v1`）・Fluent Emoji High Contrast（`fluent-emoji-high-contrast`）・
Pinhead・Energy Icons・TDesign・Boxicons（新版）・MDI・Feather Icon（`fe`）（2026年11月8日。手描き・描き起こしの代わりを探した）
- Energy Icons は「面」に数えられるが、線を面に直しただけの**線の見た目**。品物のシルエットには向かない。
- 日用品が多いのは Pinhead（洗剤・ごみ袋・歯ぶらし）。`fe` は日用品が無い。まな板・ラップ・箱ティッシュは面のセットに無く、線の IconOven にあった（面に直して入れた。
  線の外形を太さぶんふくらませて塗り、中の線は2本までを穴で抜く。まな板はまっすぐだと電池・カップとぶつかるので斜め）。

**まだ探していない、面のあるセット**（「面」＝線（stroke）を使わない絵の枚数。「和の題材」は名前で当たったもの）

| セット（prefix） | 枚数 | 面 | ライセンス | 和の題材 |
|---|---:|---:|---|---|
| coolicons（`coolicons`） | 19860 | 7944 | MIT |  |
| Reicon（`reicon`） | 6590 | 5426 | MIT |  |
| Carbon（`carbon`） | 2789 | 2789 | Apache | 麺 |
| Griddy Icons（`griddy-icons`） | 2010 | 2010 | MIT | やかん |
| with icons（`withicons`） | 7000 | 1993 | MIT | 竹・箸・餃子・凧・灯り・蓮・急須 |
| Fluent UI MDL2（`fluent-mdl2`） | 1735 | 1735 | MIT | 箸 |
| Line Awesome（`la`） | 1544 | 1544 | Apache | 鳥居 |
| Lucide Extended（`lucide-extended`） | 2879 | 1515 | ISC |  |
| Siemens Industrial Experience Icons（`ix`） | 1501 | 1500 | MIT |  |
| Myna UI Icons（`mynaui`） | 2658 | 1322 | MIT |  |
| Pixelarticons（`pixelarticons`） | 1306 | 1306 | MIT |  |
| Keyline Icons（`keyline-icons`） | 13544 | 1304 | MIT |  |
| Framework7 Icons（`f7`） | 1253 | 1253 | MIT |  |
| Unicons（`uil`） | 1216 | 1215 | Apache |  |
| Dinkie Icons（`dinkie-icons`） | 1198 | 1198 | MIT | 竹・桜・栗・ご飯・凧・神社 |
| Clarity（`clarity`） | 1105 | 1104 | MIT |  |
| Garden SVG Icons（`garden`） | 1491 | 1098 | Apache |  |
| HeroIcons（`heroicons`） | 1288 | 964 | MIT |  |
| Octicons（`octicon`） | 963 | 963 | MIT |  |
| Lineicons（`lineicons`） | 962 | 962 | MIT |  |
| Stash Icons（`stash`） | 982 | 956 | MIT |  |
| Jam Icons（`jam`） | 940 | 940 | MIT |  |
| Qlementine Icons（`qlementine-icons`） | 905 | 904 | MIT |  |
| Ant Design Icons（`ant-design`） | 848 | 848 | MIT |  |
| Teenyicons（`teenyicons`） | 1200 | 836 | MIT |  |
| Pico-icon（`picon`） | 824 | 824 | OFL | ご飯・神社 |
| Famicons（`famicons`） | 1342 | 817 | MIT |  |
| Gravity UI Icons（`gravity-ui`） | 809 | 809 | MIT |  |
| css.gg（`gg`） | 704 | 698 | MIT |  |
| Memory Icons（`memory`） | 651 | 651 | Apache |  |
| @icons（`at-icons`） | 643 | 643 | MIT |  |
| Vaadin Icons（`vaadin`） | 636 | 636 | Apache |  |
| Fontisto（`fontisto`） | 615 | 615 | MIT |  |
| Temaki（`temaki`） | 557 | 557 | CC0 |  |
| Glyphs（`glyphs`） | 3452 | 539 | MIT |  |
| Mage Icons（`mage`） | 1042 | 497 | Apache |  |
| Eva Icons（`eva`） | 490 | 490 | MIT |  |
| Sargam Icons（`si`） | 1301 | 467 | MIT |  |
| OpenSearch UI（`oui`） | 444 | 443 | Apache |  |
| Majesticons（`majesticons`） | 1045 | 440 | MIT |  |
| OOUI（`ooui`） | 430 | 430 | MIT |  |
| Gitlab SVGs（`pajamas`） | 414 | 414 | MIT |  |
| SidekickIcons（`sidekickicons`） | 500 | 375 | MIT |  |
| Flowbite Icons（`flowbite`） | 804 | 360 | MIT | ご飯 |
| Lsicon（`lsicon`） | 716 | 349 | MIT | ご飯 |
| Radix Icons（`radix-icons`） | 342 | 342 | MIT |  |
| Prime Icons（`prime`） | 313 | 313 | MIT |  |
| Material Design Light（`mdi-light`） | 304 | 304 | OFL |  |
| Elusive Icons（`el`） | 304 | 303 | OFL |  |
| Unicons Monochrome（`uim`） | 298 | 298 | Apache |  |
| Zondicons（`zondicons`） | 297 | 297 | MIT |  |
| Element Plus（`ep`） | 293 | 293 | MIT |  |
| Circum Icons（`circum`） | 288 | 288 | MPL | 麺 |
| Foundation（`foundation`） | 283 | 283 | MIT |  |
| Raphael（`raphael`） | 266 | 266 | MIT |  |
| EOS Icons（`eos-icons`） | 253 | 253 | MIT |  |
| Icons8 Windows 10 Icons（`icons8`） | 234 | 234 | MIT |  |
| Weather Icons（`wi`） | 230 | 230 | OFL |  |
| Open Iconic（`oi`） | 223 | 223 | MIT |  |
| Unicons Thin Line（`uit`） | 216 | 215 | Apache |  |
| uiw icons（`uiw`） | 214 | 214 | MIT |  |
| Rivet Icons（`rivet-icons`） | 210 | 209 | BSD-3-Clause |  |
| Icons8 Windows 8 Icons（`wpf`） | 200 | 200 | MIT |  |
| Simple line icons（`simple-line-icons`） | 194 | 194 | MIT |  |
| Unicons Solid（`uis`） | 190 | 190 | Apache |  |
| Cuida Icons（`cuida`） | 182 | 182 | Apache |  |
| Mono Icons（`mi`） | 180 | 180 | MIT |  |
| OSM Icons（`osmic`） | 169 | 169 | CC0 |  |
| Map Icons（`map`） | 167 | 167 | OFL |  |
| Bitcoin Icons（`bitcoin-icons`） | 330 | 165 | MIT |  |
| WeUI Icon（`weui`） | 162 | 162 | MIT |  |
| Grommet Icons（`grommet-icons`） | 637 | 157 | Apache |  |
| Academicons（`academicons`） | 158 | 157 | OFL |  |

- 和の題材は、面のセットでは **Pinhead（CC0）**・**Energy Icons**・**TDesign**（おにぎり・大根・たけのこ）・**Boxicons**（新しい版。
  探し済みの `bxs` は旧版）・**MDI**（おでん）・**Feather Icon**（`fe`。日本の作者の小さなセット。団子・せんべい）に多い。
- MDI の規約は「Pictogrammers Free License」で、アイコン自体は Apache 2.0。Dinkie Icons と Pixelarticons はドット絵。

**線だけのセット**（面に直す手間が要る。品物の絵には、名前に fill／solid／filled を含むものだけ・ICON-DEIMAGINE.md）：
IconMind（`iconmind` 31722・MIT・やかん・凧・麺・温泉・ご飯・寿司）・IconOven（`iconoven` 18236・MIT・竹・弁当・盆栽・桜・箸・餃子・温泉・やかん・着物・凧・灯り・蓮・麺・おでん・塔・提灯・ラーメン・ご飯・炊飯器・海藻・神社・そば・寿司・急須・鳥居）・andrsrxn/icons（`andrsrxn` 2776・MIT・蓮・寿司）・IconPark Outline（`icon-park-outline` 2658・Apache・箸・やかん・蓮・麺・塔・大根・ご飯・急須）・Lucide（`lucide` 2109・ISC）・Vadivam（`vadivam` 2026・MIT）・IconPark Solid（`icon-park-solid` 1970・Apache・やかん・蓮・麺・塔・大根・ご飯・急須）・IconPark TwoTone（`icon-park-twotone` 1947・Apache・やかん・蓮・麺・塔・大根・ご飯・急須）・Material Line Icons（`line-md` 1233・MIT）・ProIcons（`proicons` 552・MIT）・Akar Icons（`akar-icons` 458・MIT・大根）・Meteor Icons（`meteor-icons` 431・MIT）・System UIcons（`system-uicons` 430・Unlicense）・Lucide Lab（`lucide-lab` 373・ISC・箸・やかん・蓮・寿司）・Matita（`matita` 302・MIT）・Struq Icons（`struq` 300・MIT）・Humbleicons（`humbleicons` 287・MIT）・Charm Icons（`charm` 262・MIT）・Oreo Doodle Icons（`doodle-icons` 204・MIT・桜）・CodeX Icons（`codex` 156・MIT）

- 和の題材がいちばん多いのは線の **IconOven**（弁当・盆栽・着物・提灯・おでん・炊飯器・鳥居…）。

**条件つき — CC BY**（設定に「アイコンの出典」の欄を作れば使える。いまは無い。Font Awesome Free のアイコンもここ）：
Solar（8706）・Game Icons（4133）・Streamline（3000）・Font Awesome Solid（2000）・Ultimate free icons（1999）・IconaMoon（1781）・Lets Icons（1528）・Sharp free icons（1500）・Flex free icons（1500）・Plump free icons（1499）・Font Awesome 6 Solid（1402）・Pepicons Pop!（1275）・Pepicons Print（1275）・Pepicons Pencil（1275）・Font Awesome 5 Solid（1001）・Freehand free icons（1000）・Pixel free icons（662）・Codicons（657）・NRK Core Icons（637）・Pixel Icon（578）・Röntgen（574）・CoreUI Free（554）・Cyber free icons（500）・Font Awesome 6 Brands（495）・Basil（493）・Font Awesome 5 Brands（457）・coolicons v4（442）・Font-GIS（367）・Guidance（360）・Subway Icon Set（306）・Streamline Block（300）・Font Awesome Regular（272）・Font Awesome 6 Regular（163）・FontAudio（155）・Font Awesome 5 Regular（151）・Covid Icons（142）・Memes（84）

**置かない**
- 色つき・絵文字（OpenMoji・Twemoji・Noto Emoji・Fluent Emoji・Emoji One ほか）— UI に絵文字を出さない。影に潰すと団子に
  なった（ICON-DEIMAGINE.md の③）。
- ロゴ・旗（Simple Icons・SVG Logos・Flag Icons ほか）— 商標で、単色でもない。
- 継承・非営利・GPL：Arcticons・Typicons・Entypo+（BY-SA）／IcoMoon Free・WordPress・Dashicons・Gridicons・Elegant・Gala（GPL）／
  Custom Brand Icons（BY-NC-SA）。
- 日本の素材サイトのアイコン：ICOOON MONO（商用可・クレジット不要だが「いかなる形でも再配布しない」）・シルエットAC ほか独自規約。

### 3-2. 季節の絵・和の絵（パブリックドメイン）

**出どころ**（使う前に、一点ずつ表示を確かめる）
- 国立国会図書館（デジタルコレクション・NDL イメージバンク）：保護期間の切れたものは PDM。出典の表示を求める。**使用中**。
- ColBase（国立文化財機構。東博・京博・奈良博・九博ほか）：規約を守れば自由（season-art.md）。
- 国書データベース（国文学研究資料館）：**国文研の所蔵分は 2024年6月3日から PD**（前は CC BY-SA）。ほかの館の所蔵分は館ごと。
  料理本・本草・絵本・図案の古典籍がある。
- ジャパンサーチ：国内の横断の窓口。利用条件（CC0・PDM・CC BY）で絞れる。
- 海外の公開（PD の作品は CC0 など）：The Met・シカゴ美術館・スミソニアン（国立アジア美術館）・アムステルダム国立美術館・
  クリーブランド美術館・米国議会図書館（日本の版画）・Biodiversity Heritage Library（本草・博物の本）・Wikimedia Commons（一枚ずつ）。
- 東京都立図書館（TOKYOアーカイブ）：利用条件をこの版では確かめられなかった。

**七十二候・花鳥・暮らしに合う作**
- 花鳥の画譜：今尾景年『景年花鳥画譜』（四季の巻）・幸野楳嶺『楳嶺百鳥画譜』・渡辺省亭『省亭花鳥画譜』・酒井抱一『鶯邨画譜』・『光琳百図』。
- 本草・博物（写実の草花・野菜・魚・虫・鳥）：岩崎灌園『本草図譜』・毛利梅園『梅園図譜』（草木花譜・禽譜・魚譜・介譜・虫譜）・
  飯沼慾斎『草木図説』。候の生き物（鶯・燕・雁・螢・蟷螂・蚯蚓…）に当てられる。
- 図案：神坂雪佳『百々世草』・杉浦非水『非水百花譜』・古谷紅麟の図案集・竹久夢二の千代紙と図案。
- 版画：歌川広重（使用中）・葛飾北斎（『冨嶽三十六景』『北斎漫画』）・月岡芳年『月百姿』（夜と月）・小原古邨・川瀬巴水・吉田博。
  **新版画（古邨・巴水・吉田博）は、日本で PD でも 1931年以降に出た版は米国で権利が残りうる**（GitHub は米国にある）。

**自分で描けば、出どころの要らないもの**
- 和柄（文様）：麻の葉・青海波・七宝・鱗・市松・矢絣・亀甲・紗綾形・籠目・立涌・観世水・千鳥・雪輪・檜垣・網代。古くからの
  文様そのものは誰のものでもない。SVG／CSS で描き起こせば、装い（和紙と墨・季節の手帳）の地に使える。人の作った柄の素材集は各規約。
- 家紋：梅鉢・桜・藤・桔梗・撫子・菊・紅葉・雪輪・千鳥・蜻蛉…。単色の小さな形で 25px に向く。古くからの紋の形に権利は無いが、
  Commons などの SVG は描いた人ごとにライセンスが違う（PD と BY-SA が混じる）→ 描き起こすか、PD／CC0 のものだけ。

### 3-3. 写真

- Wikimedia Commons（使用中。CC0／PD を先に、CC BY／BY-SA は設定に出典。人の顔・ロゴ・透かし・大きな文字は除く・sky.md）。
- Find47（都道府県の景色。CC BY 4.0。Commons 経由で使用中）。
- NASA（米国政府の作は PD。月・星・地球）— 夜の帯や月齢に。NASA のロゴと、NASA の外の人が撮った写真は除く。
- 独自規約の写真サイト（Unsplash・Pixabay・ぱくたそ・写真AC など）— いまの決まり（PD・CC）の外。使うなら規約を一つずつ読む。

### 3-4. 挿絵（人・暮らし・空の画面）

- **利用者の水彩**（使用中）がいちばん合う。新しい挿絵も、まず利用者の素材から。
- Open Peeps（手描きの人。CC0）・Open Doodles（CC0 と紹介されているが、配布元の規約のページは確かめられなかった）。
- Oreo Doodle Icons（`doodle-icons`。MIT・手描き風の線 204 枚）。
- unDraw（独自規約。一枚ずつ使うのは可、束ねて配る・取り込む道具を作るのは不可）→ 入れるなら数枚まで。
- Humaaans（規約の情報が食い違う）→ 配布元で確かめるまで置かない。
- いらすとや：点数の上限（商用は一つの制作物に20点までと紹介されてきた）と、素材そのものの再配布の禁止がある。画像を挿し込む
  拡張機能が規約違反で公開を止められた例もある → **置かない**（公開リポジトリに置くと、素材をそのまま配る形になる）。
- イラストAC・ちょうどいいイラスト・Loose Drawing・ヒューマンピクトグラム2.0 など：独自規約（多くは再配布の禁止）→ 読むまで置かない。

## 4. 足すとき

- 字（端末の字）：`css/base.css` の「書体」の節の並びに足す → `tests/typeface.js`。札（`data-font`）は増やさない（look.md）。
- 字（web フォント）：先に look.md の決まりを変える（2-2）。
- アイコン：`npm pack @iconify-json/<prefix>`（`api.iconify.design` は proxy が 403）→ ICON-SILHOUETTE.md の①〜⑥。
  ライセンスは npm の表示ではなく、配布元の LICENSE で確かめる。
- 季節の絵・写真：season-art.md の「手順」。出典を表に書き、設定に出す。

## 5. 数字の出どころ（取り直すとき）

- アイコン：npm の `@iconify/collections` 1.0.762（`collections.json`：枚数・ライセンス・色つきか）と、各 `@iconify-json/<prefix>` の
  `icons.json`（面＝body に stroke の無い絵。和の題材は名前の英語で拾った）。
- Google Fonts：npm の `google-font-metadata` 6.0.8（`data/google-fonts-v2.json` の subsets に japanese、`data/licenses.json`）。
- Apple：developer.apple.com/fonts/system-fonts/ の表（system／downloadable／document support）。
- Android：raw.githubusercontent.com の `aosp-mirror/platform_frameworks_base` にある `data/fonts/fonts.xml`。
- この環境の proxy で通らないもの：fonts.google.com・api.iconify.design・learn.microsoft.com・多くの素材サイト（規約は検索で読んだ）。
