# 季節の絵の対応表（3.0 の E1）

daily の紙の後ろに敷く、七十二候ごとの絵（`js/season-art.js`・`img/season/kNN.webp`）。**72候すべてに一枚ずつ**
（2026年10月6日。合計 1727KB）。

- 出どころは一つ：歌川広重『名所江戸百景』、国立国会図書館（NDL イメージバンクの「名所江戸百景」。
  デジタルコレクションの記録は全72枚「広重」・パブリックドメイン（PDM））。IIIF で縦 1100px ほどの縮小版だけを取った。
- 割り当て：四季の部に沿う（春の部→立春〜穀雨、夏の部→立夏〜大暑、秋の部→立秋〜霜降、冬の部→立冬〜大寒）。
  候の名の物が描かれた絵・題に入った絵を先に（05 虹・39 鴻・45 椿は部をまたいで借りた）。全部の絵を縮小一覧で目で見て、
  「選んだ理由」を絵の中身に合わせた。
- 25（赤坂桐畑雨中夕けい、安政6年＝1859）は初代の没後に二代が描いた一枚。NDL の表記は「広重」。
- 56（目黒太鼓橋夕日の岡）は降る雪が細かく 25KB に収まらないので、上下を一割ずつ切り詰めて取った（IIIF の切り出し）。
- 出典の書き方（NDL の求めるもの）：出典：国立国会図書館「NDLイメージバンク」(https://www.ndl.go.jp/imagebank)。
  設定 → daily →「絵の出典」の頭に一度（`KN.seasonArt.SOURCE`）。

## 決まり（roadmap-3.0 の E1）

- 出どころは**パブリックドメインの浮世絵だけ**。主に歌川広重『名所江戸百景』と、広重ほかの花鳥画。
  NDL イメージバンク（転載に申請は要らない・出典の表示を求める）・ColBase（規約を守れば自由に使える）。
- どの絵も、所蔵先・作者・題・取得した URL・選んだ理由（一言）をこの表に書く。**出どころの分からない絵は使わない。直リンクもしない。**
- 候の名の生き物・花が描かれた絵を先に、無ければ同じ時期の景色。そろわない候は、同じ節気の隣の候と一枚を分け合ってよい。
- 加工は `tools/season-art.js`（短い辺 720px・彩度を落とす・少しぼかす・WebP で1枚25KBまで・72枚で2MBまで）。
  元の絵は `tools/season-src/kNN.jpg` に置く（コミットしない）。
- **下地の色は二十四節気の淡い色のまま**（`SEKKI_C`。絵の平均の色は使わない）。2026年10月6日に72枚を測ると、平均は
  どれも紙のくすんだ灰色（夜の絵は暗い灰色）で季節の色にならず、そのまま敷くと見出しの字の濃さの比が 3:1 を割った。
  明るさだけ上げると72色がほぼ同じベージュになる。候ごとの違いは絵が持ち、色は節気ごとに季節を言う。
- 番号 NN は**春分の初候から数えた候の番号**（`js/season.js` の `of(day).k`）。

## 手順（絵が手に入ったら）

1. 絵を落として `tools/season-src/kNN.jpg` に置き、この表の行を埋める。
2. `NODE_PATH=/opt/node22/lib/node_modules node tools/season-art.js` → `img/season/kNN.webp`（平均の色も出るが、使わない）。
3. `js/season-art.js` の `ART` に `NN: { file: "img/season/kNN.webp", title, author, holder, url, why }` を足す。
4. `tests/season-art.js`（大きさ・字の濃さの比）と `daily-rules.js`・`offline.js` を回す。iPhone で濃さ（6〜10%）を決める。

## 表

| 番号 | 節気 | 候 | 絵の題 | 作者 | 所蔵 | URL | 選んだ理由 |
|---|---|---|---|---|---|---|---|
| 00 | 春分 | 雀始巣（すずめはじめてすくう） | 名所江戸百景 日暮里寺院の林泉 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312250 | 春の部。寺の庭の桜 |
| 01 | 春分 | 桜始開（さくらはじめてさく） | 名所江戸百景 上野清水堂不忍ノ池 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312247 | 上野の桜 |
| 02 | 春分 | 雷乃発声（かみなりすなわちこえをはっす） | 名所江戸百景 王子音無川堰〔タイ〕世俗大滝ト唱 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312255 | 春の部。せきを落ちる水の音 |
| 03 | 清明 | 玄鳥至（つばめきたる） | 名所江戸百景 吾妻橋金竜山遠望 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312274 | 春の部。吾妻橋と隅田川 |
| 04 | 清明 | 鴻雁北（こうがんかえる） | 名所江戸百景 墨田河橋場の渡かわら竈 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312273 | 春の部。隅田川の渡しと瓦竈 |
| 05 | 清明 | 虹始見（にじはじめてあらわる） | 名所江戸百景 高輪うしまち | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312317 | 虹の出る一枚（秋の部から借りる） |
| 06 | 穀雨 | 葭始生（あしはじめてしょうず） | 名所江戸百景 四ツ木通用水引ふね | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312269 | 春の部。水辺の用水 |
| 07 | 穀雨 | 霜止出苗（しもやんでなえいずる） | 名所江戸百景 玉川堤の花 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312277 | 玉川堤の花。春の終わり |
| 08 | 穀雨 | 牡丹華（ぼたんはなさく） | 名所江戸百景 千駄木団子坂花屋敷 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312252 | 花屋敷。春の花の庭 |
| 09 | 立夏 | 蛙始鳴（かわずはじめてなく） | 名所江戸百景 日本橋江戸ばし | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312278 | 夏の部の初め。初鰹の日本橋 |
| 10 | 立夏 | 蚯蚓出（みみずいずる） | 名所江戸百景 水道橋駿河台 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312283 | 端午の鯉のぼり |
| 11 | 立夏 | 竹笋生（たけのこしょうず） | 名所江戸百景 亀戸天神境内 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312301 | 亀戸天神の藤 |
| 12 | 小満 | 蚕起食桑（かいこおきてくわをはむ） | 名所江戸百景 鎧の渡し小網町 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312281 | 夏の部。小網町の渡し |
| 13 | 小満 | 紅花栄（べにばなさかう） | 名所江戸百景 綾瀬川鐘か淵 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312299 | 夏の部。綾瀬川の合歓の花 |
| 14 | 小満 | 麦秋至（むぎのときいたる） | 名所江戸百景 八ツ見のはし | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312280 | 夏の部。八ツ見のはし |
| 15 | 芒種 | 蟷螂生（かまきりしょうず） | 名所江戸百景 王子不動之滝 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312284 | 夏の部。王子の滝 |
| 16 | 芒種 | 腐草為螢（くされたるくさほたるとなる） | 名所江戸百景 駒形堂吾嬬橋 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312298 | 夏の部。駒形堂のほととぎす |
| 17 | 芒種 | 梅子黄（うめのみきばむ） | 名所江戸百景 昌平橋聖堂神田川 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312282 | 雨の昌平橋（梅雨のころ） |
| 18 | 夏至 | 乃東枯（なつかれくさかるる） | 名所江戸百景 増上寺塔赤羽根 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312289 | 夏の部。増上寺の塔 |
| 19 | 夏至 | 菖蒲華（あやめはなさく） | 名所江戸百景 堀切の花菖蒲 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312300 | 堀切の花菖蒲 |
| 20 | 夏至 | 半夏生（はんげしょうず） | 名所江戸百景 外桜田弁慶堀糀町 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312290 | 夏の部。弁慶堀 |
| 21 | 小暑 | 温風至（あつかぜいたる） | 名所江戸百景 糀町一丁目山王祭ねり込 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312286 | 山王祭。夏の祭り |
| 22 | 小暑 | 蓮始開（はすはじめてひらく） | 名所江戸百景 角筈熊野十二社俗称十二そう | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312285 | 夏の部。十二社の池 |
| 23 | 小暑 | 鷹乃学習（たかすなわちわざをならう） | 名所江戸百景 佃じま住吉の祭 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312291 | 佃島住吉の祭り。夏の祭り |
| 24 | 大暑 | 桐始結花（きりはじめてはなをむすぶ） | 名所江戸百景 赤坂桐畑 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312287 | 赤坂の桐畑 |
| 25 | 大暑 | 土潤溽暑（つちうるおうてむしあつし） | 名所江戸百景 赤坂桐畑雨中夕けい | 二代 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312288 | 雨の桐畑。蒸す夏の夕 |
| 26 | 大暑 | 大雨時行（たいうときどきふる） | 名所江戸百景 大はしあたけの夕立 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312294 | 大はしの夕立 |
| 27 | 立秋 | 涼風至（すずかぜいたる） | 名所江戸百景 市中繁栄七夕祭 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312309 | 七夕。秋の部の初め |
| 28 | 立秋 | 寒蝉鳴（ひぐらしなく） | 名所江戸百景 目黒爺々が茶屋 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312320 | 秋の部。目黒の茶屋 |
| 29 | 立秋 | 蒙霧升降（ふかききりまとう） | 名所江戸百景 にい宿のわたし | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312329 | 秋の部。にい宿の渡し |
| 30 | 処暑 | 綿柎開（わたのはなしべひらく） | 名所江戸百景 神田紺屋町 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312311 | 紺屋町の染め布（木綿） |
| 31 | 処暑 | 天地始粛（てんちはじめてさむし） | 名所江戸百景 紀の国坂赤坂溜池遠景 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312321 | 秋の部。紀の国坂 |
| 32 | 処暑 | 禾乃登（こくものすなわちみのる） | 名所江戸百景 木母寺内川御前栽畑 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312328 | 秋の部。御前栽畑 |
| 33 | 白露 | 草露白（くさのつゆしろし） | 名所江戸百景 井の頭の池弁天の社 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312323 | 秋の部。井の頭の池 |
| 34 | 白露 | 鶺鴒鳴（せきれいなく） | 名所江戸百景 品川すさき | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312319 | 秋の部。品川の洲崎 |
| 35 | 白露 | 玄鳥去（つばめさる） | 名所江戸百景 金杉橋芝浦 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312316 | 秋の部。金杉橋 |
| 36 | 秋分 | 雷乃収声（かみなりすなわちこえをおさむ） | 名所江戸百景 月の岬 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312318 | 月見の座敷。仲秋の月 |
| 37 | 秋分 | 蟄虫坏戸（むしかくれてとをふさぐ） | 名所江戸百景 上野山内月のまつ | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312325 | 秋の部。上野の月の松 |
| 38 | 秋分 | 水始涸（みずはじめてかるる） | 名所江戸百景 王子滝の川 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312324 | 秋の部。王子滝の川 |
| 39 | 寒露 | 鴻雁来（こうがんきたる） | 名所江戸百景 鴻の台とね川風景 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312331 | 題の「鴻」。鴻の台 |
| 40 | 寒露 | 菊花開（きくのはなひらく） | 名所江戸百景 請地秋葉の境内 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312327 | 秋の部。秋葉の境内 |
| 41 | 寒露 | 蟋蟀在戸（きりぎりすとにあり） | 名所江戸百景 猿わか町よるの景 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312326 | 秋の夜の猿若町 |
| 42 | 霜降 | 霜始降（しもはじめてふる） | 名所江戸百景 堀江ねこざね | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312332 | 秋の部。堀江ねこざね |
| 43 | 霜降 | 霎時施（こさめときどきふる） | 名所江戸百景 小奈木川五本まつ | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312333 | 秋の部。小奈木川 |
| 44 | 霜降 | 楓蔦黄（もみじつたきばむ） | 名所江戸百景 真間の紅葉手古那の社継はし | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312330 | 真間の紅葉 |
| 45 | 立冬 | 山茶始開（つばきはじめてひらく） | 名所江戸百景 せき口上水端はせを庵椿やま | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312275 | 題の「椿」。椿やま（春の部から借りる） |
| 46 | 立冬 | 地始凍（ちはじめてこおる） | 名所江戸百景 浅草田甫酉の町詣 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312337 | 酉の町詣。冬の部の初め |
| 47 | 立冬 | 金盞香（きんせんかさく） | 名所江戸百景 よし原日本堤 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312336 | 冬の部。よし原日本堤 |
| 48 | 小雪 | 虹蔵不見（にじかくれてみえず） | 名所江戸百景 小梅堤 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312340 | 冬の部。小梅堤 |
| 49 | 小雪 | 朔風払葉（きたかぜこのはをはらう） | 名所江戸百景 千住の大はし | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312339 | 冬の部。千住の大はし |
| 50 | 小雪 | 橘始黄（たちばなはじめてきばむ） | 名所江戸百景 御厩河岸 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312341 | 冬の部。御厩河岸 |
| 51 | 大雪 | 閉塞成冬（そらさむくふゆとなる） | 名所江戸百景 浅草金竜山 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312335 | 雪の浅草金竜山 |
| 52 | 大雪 | 熊蟄穴（くまあなにこもる） | 名所江戸百景 深川木場 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312342 | 冬の部。深川木場 |
| 53 | 大雪 | 鱖魚群（さけのうおむらがる） | 名所江戸百景 南品川鮫洲海岸 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312345 | 冬の部。鮫洲の海苔ひび |
| 54 | 冬至 | 乃東生（なつかれくさしょうず） | 名所江戸百景 千束の池袈裟懸松 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312346 | 冬の部。千束の池 |
| 55 | 冬至 | 麋角解（さわしかのつのおつる） | 名所江戸百景 蓑輪金杉三河しま | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312338 | 冬の部。三河しまの鶴 |
| 56 | 冬至 | 雪下出麦（ゆきわたりてむぎのびる） | 名所江戸百景 目黒太鼓橋夕日の岡 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312347 | 冬の部。目黒太鼓橋 |
| 57 | 小寒 | 芹乃栄（せりすなわちさかう） | 名所江戸百景 虎の門外あふひ坂 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312349 | 冬の部。寒参りのあふひ坂 |
| 58 | 小寒 | 水泉動（しみずあたたかをふくむ） | 名所江戸百景 芝うらの風景 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312344 | 冬の部。芝浦の海と鳥 |
| 59 | 小寒 | 雉始雊（きじはじめてなく） | 名所江戸百景 深川洲崎十万坪 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312343 | 冬の部。雪原の上を飛ぶ鷲 |
| 60 | 大寒 | 款冬華（ふきのはなさく） | 名所江戸百景 愛宕下藪小路 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312348 | 冬の部。愛宕下藪小路 |
| 61 | 大寒 | 水沢腹堅（さわみずこおりつめる） | 名所江戸百景 びくにはし雪中 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312350 | 雪のびくにはし |
| 62 | 大寒 | 鶏始乳（にわとりはじめてとやにつく） | 名所江戸百景 王子装束ゑの木大晦日の狐火 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312354 | 大晦日の狐火。冬の部の終わり |
| 63 | 立春 | 東風解凍（はるかぜこおりをとく） | 名所江戸百景 日本橋雪晴 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312237 | 春の部の初め。日本橋雪晴 |
| 64 | 立春 | 黄鶯睍睆（うぐいすなく） | 名所江戸百景 馬喰町初音の馬場 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312242 | 題の「初音」（鶯の初鳴き） |
| 65 | 立春 | 魚上氷（うおこおりをいずる） | 名所江戸百景 永代橋佃しま | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312240 | 春の部。佃島の夜の漁 |
| 66 | 雨水 | 土脉潤起（つちのしょううるおいおこる） | 名所江戸百景 亀戸梅屋舗 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312266 | 亀戸の梅 |
| 67 | 雨水 | 霞始靆（かすみはじめてたなびく） | 名所江戸百景 霞かせき | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312238 | 題の「霞」 |
| 68 | 雨水 | 草木萌動（そうもくめばえいずる） | 名所江戸百景 柳しま | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312268 | 題の「柳」 |
| 69 | 啓蟄 | 蟄虫啓戸（すごもりむしとをひらく） | 名所江戸百景 神田明神曙之景 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312246 | 神田明神の曙 |
| 70 | 啓蟄 | 桃始笑（ももはじめてさく） | 名所江戸百景 蒲田の梅園 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312263 | 蒲田の梅園 |
| 71 | 啓蟄 | 菜虫化蝶（なむしちょうとなる） | 名所江戸百景 飛鳥山北の眺望 | 歌川広重 | 国立国会図書館 | https://dl.ndl.go.jp/pid/1312253 | 春の部。飛鳥山の眺め |

## 写真の表（Wikimedia Commons・2026年10月7日）

浮世絵と見比べるための別の一揃い（`img/season-photo/kNN.webp`。72枚・合計 1513KB）。**画面にはまだつないでいない**
（daily を写真に、広重をノートタブに移すかは見比べてから決める）。

- 出どころは Wikimedia Commons だけ。ライセンスは CC0／パブリックドメイン／CC BY／CC BY-SA のみ。人の顔が大きく写るもの・
  ロゴ・透かし・大きな文字の看板は除いた（72枚の縮小一覧を目で見て、柚子湯の人・山肌の文字・看板の3枚を差し替えた）。
- CC BY／BY-SA は**画面に出すとき作者・ライセンス・URL の表示が要る**（浮世絵の `SOURCE` と同じように、つなぐときに設定へ）。
- 加工：`node tools/season-art.js photo`（`tools/season-photo-src/kNN.jpg` → 同じ加工。写真は細かく 25KB に収まらないので
  ぼかしだけ 2px に強めた）。元は Commons の 1280px 版。
- Commons の API は User-Agent を付けないと 429。付けても共有の出口では 429 が多い——`retry-after` を守って間を空ける。
  `thumb.wikimedia.org` は通らないので `upload.wikimedia.org/.../thumb/...` を使う。
- 合いの弱いもの：30（綿）・53（サケの川）・68（モミジの芽）は日本で撮った候補が無く、撮影地が日本の外らしい。
  54（ユズ）は幹が主で実が小さい。56（雪下出麦）は青い麦だが後ろに桜が咲く。見比べで気になれば差し替える。

| 番号 | 候 | 写真の題 | 作者 | ライセンス | URL | 選んだ理由 |
|---|---|---|---|---|---|---|
| 00 | 雀始巣 | Passer montanus saturatus (flocks) | Alpsdake | CC0 | https://commons.wikimedia.org/wiki/File:Passer_montanus_saturatus_(flocks).jpg | 枝に群れるスズメ |
| 01 | 桜始開 | Cherry blossoms (Somei Yoshino), Nagai Botanical Garden, April 2026 -1488 | Laitche | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Cherry_blossoms_(Somei_Yoshino),_Nagai_Botanical_Garden,_April_2026_-1488.jpg | 咲いたソメイヨシノ（長居植物園） |
| 02 | 雷乃発声 | Thunder @ Kasai Rinkai Park | Masahiro Hayata from Tokyo, Japan | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Thunder_@_Kasai_Rinkai_Park.jpg | 街の向こうに落ちる雷（葛西臨海公園） |
| 03 | 玄鳥至 | Barn Swallow nest in Japan | Kuribo | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Barn_Swallow_nest_in_Japan.jpg | 巣のツバメのひな |
| 04 | 鴻雁北 | Swans on the rice field after harvest, photographed at Kitaakita, Japan 20201108b | 掬茶 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Swans_on_the_rice_field_after_harvest,_photographed_at_Kitaakita,_Japan_20201108b.jpg | 刈田の白鳥（北秋田）。北へ帰る渡り鳥 |
| 05 | 虹始見 | 香川県丸亀市 虹と飯野山 rainbow and Mount Iino 4 - panoramio | iPhone修理/カスタマイズパーツ販売… | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:%E9%A6%99%E5%B7%9D%E7%9C%8C%E4%B8%B8%E4%BA%80%E5%B8%82_%E8%99%B9%E3%81%A8%E9%A3%AF%E9%87%8E%E5%B1%B1_rainbow_and_Mount_Iino_4_-_panoramio.jpg | 飯野山にかかる虹（香川） |
| 06 | 葭始生 | 巨椋池排水機場水場 01 | おいでやす千年の都 | CC0 | https://commons.wikimedia.org/wiki/File:%E5%B7%A8%E6%A4%8B%E6%B1%A0%E6%8E%92%E6%B0%B4%E6%A9%9F%E5%A0%B4%E6%B0%B4%E5%A0%B4_01.jpg | 葦の茂る水場（巨椋池） |
| 07 | 霜止出苗 | A raising of seedling box of the rice,ikubyoubako,katori-city,japan | katorisi | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:A_raising_of_seedling_box_of_the_rice,ikubyoubako,katori-city,japan.JPG | 育苗箱の稲の苗（香取） |
| 08 | 牡丹華 | Peonies - Ueno Tōshō-gū Peony Garden - DSC01885 | Daderot | CC0 | https://commons.wikimedia.org/wiki/File:Peonies_-_Ueno_T%C5%8Dsh%C5%8D-g%C5%AB_Peony_Garden_-_DSC01885.JPG | 牡丹（上野東照宮） |
| 09 | 蛙始鳴 | Rice transplanter working in a paddy field, Kameoka - May 19, 2005 | Peggy (Pei-Yi) Chen | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Rice_transplanter_working_in_a_paddy_field,_Kameoka_-_May_19,_2005.jpg | 5月の田植え（亀岡）。蛙の鳴く水田 |
| 10 | 蚯蚓出 | Fresh green Echigo Komagatake (Ginzandaira, Uonuma City) Niigata,Japan (51298942135) | Koichi Hayakawa | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Fresh_green_Echigo_Komagatake_(Ginzandaira,_Uonuma_City)_Niigata,Japan_(51298942135).jpg | 新緑の越後駒ヶ岳 |
| 11 | 竹笋生 | Japan The Bamboo Forest (13914447656) | Yiannis Theologos Michellis | CC0 | https://commons.wikimedia.org/wiki/File:Japan_The_Bamboo_Forest_(13914447656).jpg | 竹林（嵐山） |
| 12 | 蚕起食桑 | Wild silkworm mulberry - Kanagawa Japan - 2024 June 7 | Nesnad | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Wild_silkworm_mulberry_-_Kanagawa_Japan_-_2024_June_7.jpeg | 桑の若木（神奈川） |
| 13 | 紅花栄 | Safflower field in Kahoku, Yamagata (1) | 掬茶 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Safflower_field_in_Kahoku,_Yamagata_(1).jpg | 紅花の畑（山形・河北） |
| 14 | 麦秋至 | Wheat field near Satsukibashi Bridge | そらみみ | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Wheat_field_near_Satsukibashi_Bridge.jpg | 実った麦の畑 |
| 15 | 蟷螂生 | Japanese Praying Mantis (6453486763) | Maarten Heerlien from Voorschoten, The Netherlands | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Japanese_Praying_Mantis_(6453486763).jpg | カマキリ |
| 16 | 腐草為螢 | Luciola cruciata on the grass - 8 | Kyu3a | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Luciola_cruciata_on_the_grass_-_8.jpg | 草にとまるゲンジボタル |
| 17 | 梅子黄 | Wakasa town Fukui Ume ac (1) | Asturio Cantabrio | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Wakasa_town_Fukui_Ume_ac_(1).jpg | 梅林（福井・若狭）。実のなる梅 |
| 18 | 乃東枯 | Prunella vulgaris subsp. asiatica (Mount Ibuki) | Alpsdake | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Prunella_vulgaris_subsp._asiatica_(Mount_Ibuki).JPG | ウツボグサ（伊吹山） |
| 19 | 菖蒲華 | Suigo Itako Ayame Garden 07 | Σ64 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Suigo_Itako_Ayame_Garden_07.jpg | あやめ園（潮来） |
| 20 | 半夏生 | Saururus chinensis (Imo Wetland) | Alpsdake | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Saururus_chinensis_(Imo_Wetland).jpg | ハンゲショウ（伊茂湿原） |
| 21 | 温風至 | Rice paddy fields near Tamamura Station Ibaraki Japan 20080715 | LERK | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Rice_paddy_fields_near_Tamamura_Station_Ibaraki_Japan_20080715.jpg | 7月の青い田（茨城） |
| 22 | 蓮始開 | View of the Five-storied Pagoda from the Lotus Pond, Tō-ji Temple, Kyoto, 20240821 1015 5226 | Jakub Hałun | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:View_of_the_Five-storied_Pagoda_from_the_Lotus_Pond,_T%C5%8D-ji_Temple,_Kyoto,_20240821_1015_5226.jpg | 東寺の蓮池と五重塔 |
| 23 | 鷹乃学習 | Accipiter gularis from iNaturalist photo 297299807 | mami_t_t | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Accipiter_gularis_from_iNaturalist_photo_297299807.jpg | 木にとまるツミ（小さな鷹） |
| 24 | 桐始結花 | Paulownia tomentosa4 | KENPEI | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Paulownia_tomentosa4.jpg | キリの実 |
| 25 | 土潤溽暑 | Forest in Yakushima 55 | Σ64 | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Forest_in_Yakushima_55.jpg | 屋久島の森。蒸す夏の森 |
| 26 | 大雨時行 | Cumulonimbus cloud in Japan 1 | Hyougushi | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Cumulonimbus_cloud_in_Japan_1.jpg | 夏の積乱雲 |
| 27 | 涼風至 | Paddy field in Wakayama City, Wakayama Prefecture; August 2016 (01) | jinkemoole | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Paddy_field_in_Wakayama_City,_Wakayama_Prefecture;_August_2016_(01).jpg | 8月の田と里（和歌山） |
| 28 | 寒蝉鳴 | Evening cicada (Tanna japonensis) (20037878650) | harum.koh from Kobe city, Japan | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Evening_cicada_(Tanna_japonensis)_(20037878650).jpg | 木にとまるヒグラシ |
| 29 | 蒙霧升降 | Dense fog creeping up the slopes of Mt. Fuji (6155482477) | Maarten Heerlien from Voorschoten, The Netherlands | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Dense_fog_creeping_up_the_slopes_of_Mt._Fuji_(6155482477).jpg | 富士の斜面をのぼる濃い霧 |
| 30 | 綿柎開 | Cotton boll nearly ready for harvest | Michael Bass-Deschenes(Commons User Mike Bass-Deschênes) | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Cotton_boll_nearly_ready_for_harvest.jpg | はじけた綿の実 |
| 31 | 天地始粛 | Morning view of the pond at Oizumi Ryokuchi, September 2024 - 0644 | Laitche | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Morning_view_of_the_pond_at_Oizumi_Ryokuchi,_September_2024_-_0644.jpg | 9月の朝の池（大泉緑地） |
| 32 | 禾乃登 | Rice Fields Before Harvest in Autumn Hokkaido Japan | Sgroey | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Rice_Fields_Before_Harvest_in_Autumn_Hokkaido_Japan.jpg | 実った稲の田（北海道） |
| 33 | 草露白 | A morning dew (15416014226) | Raita Futo from Tokyo, Japan | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:A_morning_dew_(15416014226).jpg | 草の朝露 |
| 34 | 鶺鴒鳴 | Japanese Pied Wagtail in Sakai, Osaka, February 2016 | Laitche | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Japanese_Pied_Wagtail_in_Sakai,_Osaka,_February_2016.jpg | ハクセキレイ（堺） |
| 35 | 玄鳥去 | 高原の秋空（Autumn sky of plateau） - panoramio | pakku | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:%E9%AB%98%E5%8E%9F%E3%81%AE%E7%A7%8B%E7%A9%BA%EF%BC%88Autumn_sky_of_plateau%EF%BC%89_-_panoramio.jpg | 高原の秋空と色づく木 |
| 36 | 雷乃収声 | Lycoris radiata - Kinchakuda Plateau, Hidaka, Saitama | Kakidai | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Lycoris_radiata_-_Kinchakuda_Plateau,_Hidaka,_Saitama.jpg | ヒガンバナ（巾着田）。秋分のころの花 |
| 37 | 蟄虫坏戸 | Japan, countryside in autumn 2 | Marie-Sophie Mejan | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Japan,_countryside_in_autumn_2.jpg | 秋の里と茅葺きの家 |
| 38 | 水始涸 | Rice fields and Kashima line during the harvest season,Katori city,Japan | Katorisi | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Rice_fields_and_Kashima_line_during_the_harvest_season,Katori_city,Japan.jpg | 刈り入れのころの田（香取） |
| 39 | 鴻雁来 | Anser fabalis middendorffii in flight | Alpsdake | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Anser_fabalis_middendorffii_in_flight.jpg | 飛ぶヒシクイ（雁） |
| 40 | 菊花開 | Chrysanthemum November 2007 Osaka Japan | Laitche | Public domain | https://commons.wikimedia.org/wiki/File:Chrysanthemum_November_2007_Osaka_Japan.jpg | 菊（大阪・11月） |
| 41 | 蟋蟀在戸 | Susuki IMG 3515 | 雑用部 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Susuki_IMG_3515.jpg | ススキ |
| 42 | 霜始降 | Collinsonia japonica (frost columns s4) | Alpsdake | CC0 | https://commons.wikimedia.org/wiki/File:Collinsonia_japonica_(frost_columns_s4).jpg | 霜柱（シモバシラの茎） |
| 43 | 霎時施 | Togetsu bridge and Arashiyama hills under the rain (Kyoto, Japan) (3262583370) | KimonBerlin | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Togetsu_bridge_and_Arashiyama_hills_under_the_rain_(Kyoto,_Japan)_(3262583370).jpg | 雨の渡月橋と嵐山 |
| 44 | 楓蔦黄 | Japanese maple leaves in autumn in Japan 2011 4 (7024866637) | Yiannis Theologos Michellis | CC0 | https://commons.wikimedia.org/wiki/File:Japanese_maple_leaves_in_autumn_in_Japan_2011_4_(7024866637).jpg | 色づいたモミジ |
| 45 | 山茶始開 | Sasanqua camellia (Camellia sasanqua) (22407381836) | harum.koh from Kobe city, Japan | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Sasanqua_camellia_(Camellia_sasanqua)_(22407381836).jpg | サザンカ（神戸） |
| 46 | 地始凍 | Field with frost, Kurokawa, Aso, Kumamoto - Jan 31, 2013 | 迷惘的人生 | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Field_with_frost,_Kurokawa,_Aso,_Kumamoto_-_Jan_31,_2013.jpg | 霜の降りた畑（阿蘇） |
| 47 | 金盞香 | Flower of Narcissus tazetta at Nagai Park, January 2024 - 1393 | Laitche | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Flower_of_Narcissus_tazetta_at_Nagai_Park,_January_2024_-_1393.jpg | スイセン（長居公園・1月） |
| 48 | 虹蔵不見 | 初冬の旭岳（Mt.Asahidake of the early winter） - panoramio | pakku | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:%E5%88%9D%E5%86%AC%E3%81%AE%E6%97%AD%E5%B2%B3%EF%BC%88Mt.Asahidake_of_the_early_winter%EF%BC%89_-_panoramio.jpg | 初冬の旭岳。虹の出ない冬空 |
| 49 | 朔風払葉 | Fallen Leaves - Flickr - Yoshikazu TAKADA | Yoshikazu TAKADA from Tokyo, Japan | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Fallen_Leaves_-_Flickr_-_Yoshikazu_TAKADA.jpg | 散り敷いた落ち葉 |
| 50 | 橘始黄 | Citrus tachibana, Kofuku-ji Nanendo | Degueulasse | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Citrus_tachibana,_Kofuku-ji_Nanendo.JPG | タチバナの実（興福寺南円堂） |
| 51 | 閉塞成冬 | Hakkoda snow fields (51886442341) | Raita Futo from Tokyo, Japan | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Hakkoda_snow_fields_(51886442341).jpg | 八甲田の雪原 |
| 52 | 熊蟄穴 | Snow forest in the Hokuou-no-mori Park 20250111b | 掬茶 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Snow_forest_in_the_Hokuou-no-mori_Park_20250111b.jpg | 雪の林と野（北欧の森公園） |
| 53 | 鱖魚群 | Chum salmon (Oncorhynchus keta) 121523 | Chris Light | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Chum_salmon_(Oncorhynchus_keta)_121523.jpg | シロザケの上る川 |
| 54 | 乃東生 | Citrus junos1 | KENPEI | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Citrus_junos1.jpg | ユズの木。冬至の柚子 |
| 55 | 麋角解 | Sika deer in Nara 06 | Dariusz Jemielniak ("Pundit") | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Sika_deer_in_Nara_06.jpg | 奈良のシカ |
| 56 | 雪下出麦 | 美作滝尾駅と青々とした小麦畑 (50153837741) | 津山市立図書館 Public Library of Tsuyama | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:%E7%BE%8E%E4%BD%9C%E6%BB%9D%E5%B0%BE%E9%A7%85%E3%81%A8%E9%9D%92%E3%80%85%E3%81%A8%E3%81%97%E3%81%9F%E5%B0%8F%E9%BA%A6%E7%95%91_(50153837741).jpg | 青い小麦の畑（美作滝尾） |
| 57 | 芹乃栄 | Oenanthe javanica1 | KENPEI | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Oenanthe_javanica1.jpg | セリ |
| 58 | 水泉動 | Hokkaido Jingu, stream during the winter with heavy snow | bryan... | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Hokkaido_Jingu,_stream_during_the_winter_with_heavy_snow.jpg | 雪の中を流れる小川（北海道神宮） |
| 59 | 雉始雊 | Phasianus versicolor in Japan | Alpsdake | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Phasianus_versicolor_in_Japan.JPG | キジ |
| 60 | 款冬華 | フキノトウの雌株20080407 | あおもりくま（Aomorikuma） | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:%E3%83%95%E3%82%AD%E3%83%8E%E3%83%88%E3%82%A6%E3%81%AE%E9%9B%8C%E6%A0%AA20080407.JPG | フキノトウ |
| 61 | 水沢腹堅 | Frozen Lake Onuma (Nanae, Hokkaido) in winter 20260118e | 掬茶 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Frozen_Lake_Onuma_(Nanae,_Hokkaido)_in_winter_20260118e.jpg | 凍った大沼（北海道） |
| 62 | 鶏始乳 | Isonokami Jingu chickens, messengers of god-4 | Immanuelle | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Isonokami_Jingu_chickens,_messengers_of_god-4.jpg | 石上神宮の鶏 |
| 63 | 東風解凍 | Hokkaido-Drift ice, Shiretoko Peninsula-xl | kkawamura | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Hokkaido-Drift_ice,_Shiretoko_Peninsula-xl.jpg | 知床の流氷 |
| 64 | 黄鶯睍睆 | Japanese bush warbler（Horornis diphone）ウグイス | Ken Ishigaki | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Japanese_bush_warbler%EF%BC%88Horornis_diphone%EF%BC%89%E3%82%A6%E3%82%B0%E3%82%A4%E3%82%B9.jpg | ウグイス |
| 65 | 魚上氷 | Ice fishing on Lake Onuma | 掬茶 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Ice_fishing_on_Lake_Onuma.jpg | 氷上のワカサギ釣り（大沼） |
| 66 | 土脉潤起 | 雪融けの牧野 Ranch in Early Spring - panoramio | Tomofumi Sato | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:%E9%9B%AA%E8%9E%8D%E3%81%91%E3%81%AE%E7%89%A7%E9%87%8E_Ranch_in_Early_Spring_-_panoramio.jpg | 雪解けの牧野 |
| 67 | 霞始靆 | Spring Haze 2 | halfrain | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Spring_Haze_2.jpg | かすむ海と日 |
| 68 | 草木萌動 | 2023-03-31 16 46 16 Green-leaved Japanese Maple buds expanding in early spring along Aquetong Lane in the Mountainview section of Ewing Township, Mercer County, New Jersey | Famartin | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:2023-03-31_16_46_16_Green-leaved_Japanese_Maple_buds_expanding_in_early_spring_along_Aquetong_Lane_in_the_Mountainview_section_of_Ewing_Township,_Mercer_County,_New_Jersey.jpg | 芽吹くモミジ |
| 69 | 蟄虫啓戸 | Japan Alps at Spring (skyseeker) 001 | Kazuhiko Teramoto from JAPAN | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Japan_Alps_at_Spring_(skyseeker)_001.jpg | 春の日本アルプス。残る雪 |
| 70 | 桃始笑 | Cherry and peach blossoms at rinrin road - panoramio | Toshihiro Matsui | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Cherry_and_peach_blossoms_at_rinrin_road_-_panoramio.jpg | 桃と桜の並木（りんりんロード） |
| 71 | 菜虫化蝶 | 桜と菜の花と青空と (Cherry blossoms and Rape seeds under Blue sky) 06 Apr, 2014 - panoramio | Hiroaki Kaneko | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:%E6%A1%9C%E3%81%A8%E8%8F%9C%E3%81%AE%E8%8A%B1%E3%81%A8%E9%9D%92%E7%A9%BA%E3%81%A8_(Cherry_blossoms_and_Rape_seeds_under_Blue_sky)_06_Apr,_2014_-_panoramio.jpg | 菜の花と桜 |
