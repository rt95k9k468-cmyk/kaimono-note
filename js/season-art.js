/* =========================================================
   くらしノート — 季節の絵（3.0 の E1。docs/roadmap-3.0.md・docs/daily.md の「季節の絵」）

   daily の紙の後ろに一枚。**色と光の層が、いつも土台**：
   1. 候ごとの色（下地）。絵が無い・読めない・オフラインでまだ持っていない日でも、色だけは候ごとに変わる。
   2. 絵（パブリックドメインの浮世絵をごく薄く）。`img/season/kNN.webp`（NN は春分の初候から数えた候の番号
      00〜71。js/season.js の `k`）。読めてから重ねる。

   絵は72候すべてに一枚ずつ（2026年10月6日）。歌川広重『名所江戸百景』（国立国会図書館・NDL イメージバンク、
   パブリックドメイン）を、四季の部に沿って候へ割り当てた。出どころは `ART` と docs/season-art.md の表。
   出どころの分からない絵は置かない。直リンクはしない（同じ配信元の img/season/ から）。

   色は二十四節気の淡い色（`SEKKI_C`）。絵の平均の色は使わない——浮世絵の平均はどれも紙のくすんだ灰色で季節の色に
   ならず、夜の絵では見出しの字が沈む（2026年10月6日に72枚を測って決めた。docs/season-art.md）。

   通信：絵は前もって72枚を読まない。今の候と次の候だけ、手の空いたとき（requestIdleCallback）に。
   sw.js が img/season/ を別の名前のキャッシュ（kurashi-season-…）に覚える（版のキャッシュに入れると、
   出すたびに消える）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  /* 二十四節気の下地の色（春分から）。字の読みやすさは tests/season-art.js が見張る。 */
  const SEKKI_C = [
    "#f3c6d3", "#e9d4e6", "#cfe3c5", "#bfe0c9", "#d9e7b0", "#b9d8d0",   // 春分 清明 穀雨 立夏 小満 芒種
    "#b7d3e8", "#a9d6e0", "#f2d7a7", "#e9dcae", "#e7cf9f", "#d6dfe6",   // 夏至 小暑 大暑 立秋 処暑 白露
    "#e8c9a8", "#e3b9a0", "#d9c2b0", "#cfcbc0", "#d5d9de", "#cdd6e3",   // 秋分 寒露 霜降 立冬 小雪 大雪
    "#c9cfdc", "#d7d3cf", "#dcdde6", "#ead5d9", "#d3e0d8", "#dbe5c7",   // 冬至 小寒 大寒 立春 雨水 啓蟄
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  /** 候 k（0〜71）の下地の色。節気の色を、次の節気へ三分の一ずつ寄せる。 */
  function colorOf(k) {
    const s = Math.floor(k / 3), part = k % 3;
    const c0 = hex(SEKKI_C[s]), c1 = hex(SEKKI_C[(s + 1) % 24]);
    return toHex(c0.map((v, i) => v + (c1[i] - v) * (part / 3)));
  }

  /* 出典の書き方は NDL イメージバンクの求めるとおり（設定の「絵の出典」の頭に一度）。 */
  const SOURCE = "出典：国立国会図書館「NDLイメージバンク」(https://www.ndl.go.jp/imagebank)";

  /* 候の番号 → { file, title, author, holder, url, why }（docs/season-art.md の表と同じ中身）。
     25（赤坂桐畑雨中夕けい、安政6年）は初代の没後に二代が描いた一枚（NDL の表記は「広重」）。 */
  const ART = {
    0: { file: "img/season/k00.webp", title: "名所江戸百景 日暮里寺院の林泉", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312250", why: "春の部。寺の庭の桜" },
    1: { file: "img/season/k01.webp", title: "名所江戸百景 上野清水堂不忍ノ池", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312247", why: "上野の桜" },
    2: { file: "img/season/k02.webp", title: "名所江戸百景 王子音無川堰〔タイ〕世俗大滝ト唱", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312255", why: "春の部。せきを落ちる水の音" },
    3: { file: "img/season/k03.webp", title: "名所江戸百景 吾妻橋金竜山遠望", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312274", why: "春の部。吾妻橋と隅田川" },
    4: { file: "img/season/k04.webp", title: "名所江戸百景 墨田河橋場の渡かわら竈", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312273", why: "春の部。隅田川の渡しと瓦竈" },
    5: { file: "img/season/k05.webp", title: "名所江戸百景 高輪うしまち", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312317", why: "虹の出る一枚（秋の部から借りる）" },
    6: { file: "img/season/k06.webp", title: "名所江戸百景 四ツ木通用水引ふね", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312269", why: "春の部。水辺の用水" },
    7: { file: "img/season/k07.webp", title: "名所江戸百景 玉川堤の花", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312277", why: "玉川堤の花。春の終わり" },
    8: { file: "img/season/k08.webp", title: "名所江戸百景 千駄木団子坂花屋敷", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312252", why: "花屋敷。春の花の庭" },
    9: { file: "img/season/k09.webp", title: "名所江戸百景 日本橋江戸ばし", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312278", why: "夏の部の初め。初鰹の日本橋" },
    10: { file: "img/season/k10.webp", title: "名所江戸百景 水道橋駿河台", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312283", why: "端午の鯉のぼり" },
    11: { file: "img/season/k11.webp", title: "名所江戸百景 亀戸天神境内", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312301", why: "亀戸天神の藤" },
    12: { file: "img/season/k12.webp", title: "名所江戸百景 鎧の渡し小網町", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312281", why: "夏の部。小網町の渡し" },
    13: { file: "img/season/k13.webp", title: "名所江戸百景 綾瀬川鐘か淵", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312299", why: "夏の部。綾瀬川の合歓の花" },
    14: { file: "img/season/k14.webp", title: "名所江戸百景 八ツ見のはし", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312280", why: "夏の部。八ツ見のはし" },
    15: { file: "img/season/k15.webp", title: "名所江戸百景 王子不動之滝", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312284", why: "夏の部。王子の滝" },
    16: { file: "img/season/k16.webp", title: "名所江戸百景 駒形堂吾嬬橋", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312298", why: "夏の部。駒形堂のほととぎす" },
    17: { file: "img/season/k17.webp", title: "名所江戸百景 昌平橋聖堂神田川", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312282", why: "雨の昌平橋（梅雨のころ）" },
    18: { file: "img/season/k18.webp", title: "名所江戸百景 増上寺塔赤羽根", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312289", why: "夏の部。増上寺の塔" },
    19: { file: "img/season/k19.webp", title: "名所江戸百景 堀切の花菖蒲", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312300", why: "堀切の花菖蒲" },
    20: { file: "img/season/k20.webp", title: "名所江戸百景 外桜田弁慶堀糀町", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312290", why: "夏の部。弁慶堀" },
    21: { file: "img/season/k21.webp", title: "名所江戸百景 糀町一丁目山王祭ねり込", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312286", why: "山王祭。夏の祭り" },
    22: { file: "img/season/k22.webp", title: "名所江戸百景 角筈熊野十二社俗称十二そう", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312285", why: "夏の部。十二社の池" },
    23: { file: "img/season/k23.webp", title: "名所江戸百景 佃じま住吉の祭", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312291", why: "佃島住吉の祭り。夏の祭り" },
    24: { file: "img/season/k24.webp", title: "名所江戸百景 赤坂桐畑", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312287", why: "赤坂の桐畑" },
    25: { file: "img/season/k25.webp", title: "名所江戸百景 赤坂桐畑雨中夕けい", author: "二代 歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312288", why: "雨の桐畑。蒸す夏の夕" },
    26: { file: "img/season/k26.webp", title: "名所江戸百景 大はしあたけの夕立", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312294", why: "大はしの夕立" },
    27: { file: "img/season/k27.webp", title: "名所江戸百景 市中繁栄七夕祭", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312309", why: "七夕。秋の部の初め" },
    28: { file: "img/season/k28.webp", title: "名所江戸百景 目黒爺々が茶屋", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312320", why: "秋の部。目黒の茶屋" },
    29: { file: "img/season/k29.webp", title: "名所江戸百景 にい宿のわたし", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312329", why: "秋の部。にい宿の渡し" },
    30: { file: "img/season/k30.webp", title: "名所江戸百景 神田紺屋町", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312311", why: "紺屋町の染め布（木綿）" },
    31: { file: "img/season/k31.webp", title: "名所江戸百景 紀の国坂赤坂溜池遠景", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312321", why: "秋の部。紀の国坂" },
    32: { file: "img/season/k32.webp", title: "名所江戸百景 木母寺内川御前栽畑", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312328", why: "秋の部。御前栽畑" },
    33: { file: "img/season/k33.webp", title: "名所江戸百景 井の頭の池弁天の社", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312323", why: "秋の部。井の頭の池" },
    34: { file: "img/season/k34.webp", title: "名所江戸百景 品川すさき", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312319", why: "秋の部。品川の洲崎" },
    35: { file: "img/season/k35.webp", title: "名所江戸百景 金杉橋芝浦", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312316", why: "秋の部。金杉橋" },
    36: { file: "img/season/k36.webp", title: "名所江戸百景 月の岬", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312318", why: "月見の座敷。仲秋の月" },
    37: { file: "img/season/k37.webp", title: "名所江戸百景 上野山内月のまつ", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312325", why: "秋の部。上野の月の松" },
    38: { file: "img/season/k38.webp", title: "名所江戸百景 王子滝の川", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312324", why: "秋の部。王子滝の川" },
    39: { file: "img/season/k39.webp", title: "名所江戸百景 鴻の台とね川風景", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312331", why: "題の「鴻」。鴻の台" },
    40: { file: "img/season/k40.webp", title: "名所江戸百景 請地秋葉の境内", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312327", why: "秋の部。秋葉の境内" },
    41: { file: "img/season/k41.webp", title: "名所江戸百景 猿わか町よるの景", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312326", why: "秋の夜の猿若町" },
    42: { file: "img/season/k42.webp", title: "名所江戸百景 堀江ねこざね", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312332", why: "秋の部。堀江ねこざね" },
    43: { file: "img/season/k43.webp", title: "名所江戸百景 小奈木川五本まつ", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312333", why: "秋の部。小奈木川" },
    44: { file: "img/season/k44.webp", title: "名所江戸百景 真間の紅葉手古那の社継はし", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312330", why: "真間の紅葉" },
    45: { file: "img/season/k45.webp", title: "名所江戸百景 せき口上水端はせを庵椿やま", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312275", why: "題の「椿」。椿やま（春の部から借りる）" },
    46: { file: "img/season/k46.webp", title: "名所江戸百景 浅草田甫酉の町詣", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312337", why: "酉の町詣。冬の部の初め" },
    47: { file: "img/season/k47.webp", title: "名所江戸百景 よし原日本堤", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312336", why: "冬の部。よし原日本堤" },
    48: { file: "img/season/k48.webp", title: "名所江戸百景 小梅堤", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312340", why: "冬の部。小梅堤" },
    49: { file: "img/season/k49.webp", title: "名所江戸百景 千住の大はし", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312339", why: "冬の部。千住の大はし" },
    50: { file: "img/season/k50.webp", title: "名所江戸百景 御厩河岸", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312341", why: "冬の部。御厩河岸" },
    51: { file: "img/season/k51.webp", title: "名所江戸百景 浅草金竜山", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312335", why: "雪の浅草金竜山" },
    52: { file: "img/season/k52.webp", title: "名所江戸百景 深川木場", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312342", why: "冬の部。深川木場" },
    53: { file: "img/season/k53.webp", title: "名所江戸百景 南品川鮫洲海岸", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312345", why: "冬の部。鮫洲の海苔ひび" },
    54: { file: "img/season/k54.webp", title: "名所江戸百景 千束の池袈裟懸松", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312346", why: "冬の部。千束の池" },
    55: { file: "img/season/k55.webp", title: "名所江戸百景 蓑輪金杉三河しま", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312338", why: "冬の部。三河しまの鶴" },
    56: { file: "img/season/k56.webp", title: "名所江戸百景 目黒太鼓橋夕日の岡", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312347", why: "冬の部。目黒太鼓橋" },
    57: { file: "img/season/k57.webp", title: "名所江戸百景 虎の門外あふひ坂", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312349", why: "冬の部。寒参りのあふひ坂" },
    58: { file: "img/season/k58.webp", title: "名所江戸百景 芝うらの風景", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312344", why: "冬の部。芝浦の海と鳥" },
    59: { file: "img/season/k59.webp", title: "名所江戸百景 深川洲崎十万坪", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312343", why: "冬の部。雪原の上を飛ぶ鷲" },
    60: { file: "img/season/k60.webp", title: "名所江戸百景 愛宕下藪小路", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312348", why: "冬の部。愛宕下藪小路" },
    61: { file: "img/season/k61.webp", title: "名所江戸百景 びくにはし雪中", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312350", why: "雪のびくにはし" },
    62: { file: "img/season/k62.webp", title: "名所江戸百景 王子装束ゑの木大晦日の狐火", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312354", why: "大晦日の狐火。冬の部の終わり" },
    63: { file: "img/season/k63.webp", title: "名所江戸百景 日本橋雪晴", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312237", why: "春の部の初め。日本橋雪晴" },
    64: { file: "img/season/k64.webp", title: "名所江戸百景 馬喰町初音の馬場", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312242", why: "題の「初音」（鶯の初鳴き）" },
    65: { file: "img/season/k65.webp", title: "名所江戸百景 永代橋佃しま", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312240", why: "春の部。佃島の夜の漁" },
    66: { file: "img/season/k66.webp", title: "名所江戸百景 亀戸梅屋舗", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312266", why: "亀戸の梅" },
    67: { file: "img/season/k67.webp", title: "名所江戸百景 霞かせき", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312238", why: "題の「霞」" },
    68: { file: "img/season/k68.webp", title: "名所江戸百景 柳しま", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312268", why: "題の「柳」" },
    69: { file: "img/season/k69.webp", title: "名所江戸百景 神田明神曙之景", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312246", why: "神田明神の曙" },
    70: { file: "img/season/k70.webp", title: "名所江戸百景 蒲田の梅園", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312263", why: "蒲田の梅園" },
    71: { file: "img/season/k71.webp", title: "名所江戸百景 飛鳥山北の眺望", author: "歌川広重", holder: "国立国会図書館", url: "https://dl.ndl.go.jp/pid/1312253", why: "春の部。飛鳥山の眺め" },
  };

  const fileOf = (k) => `img/season/k${String(k).padStart(2, "0")}.webp`;
  const on = () => KN.store.get().settings.seasonArt !== false;
  const kOf = (day) => { const s = KN.season && KN.season.of(day); return s ? s.k : null; };

  /* 読めた絵（URL）。同じ絵を何度も読みに行かない。 */
  const loaded = new Set();
  const failed = new Set();
  function preload(k, done) {
    const a = ART[k];
    if (!a || !a.file) return;
    const url = a.file;
    if (loaded.has(url)) { if (done) done(url); return; }
    if (failed.has(url)) return;
    const img = new Image();
    img.onload = () => { loaded.add(url); if (done) done(url); };
    img.onerror = () => { failed.add(url); };
    img.src = url;
  }

  /**
   * 画面（daily の `#screen-archive`）に、その日の候の色と絵を敷く。カスタムプロパティは :root ではなく
   * この画面に書く（docs/traps.md）。設定で切ってあれば外す。
   */
  function apply(el, day) {
    if (!el) return;
    if (!on()) {
      el.removeAttribute("data-season");
      el.removeAttribute("data-season-img");
      return;
    }
    const k = kOf(day);
    if (k == null) return;
    el.setAttribute("data-season", String(k));
    KN.util.setVar(el, "--season-c", colorOf(k));
    const a = ART[k];
    if (!a || !a.file) { el.removeAttribute("data-season-img"); el.style.removeProperty("--season-img"); }
    else {
      /* まだ読めていない絵なら、前の候の絵を残さない（読めるまで色だけ。オフラインで持っていない日も） */
      if (!loaded.has(a.file)) { el.removeAttribute("data-season-img"); el.style.removeProperty("--season-img"); }
      preload(k, (url) => {
        if (el.getAttribute("data-season") !== String(k)) return;   // 読んでいるあいだに日が移った
        /* 絶対の URL で書く。カスタムプロパティの相対 URL は、var() を使う css/screens.css から解決され
           css/img/season/… を探して 404 になる（10/6 まで絵は一度も出ていなかった）。 */
        el.style.setProperty("--season-img", `url("${new URL(url, document.baseURI).href}")`);
        el.setAttribute("data-season-img", "");
      });
    }
    /* 次の候も、手の空いたときに覚えておく（オフラインで日をまたいでも、絵が待っている）。 */
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => preload((k + 1) % 72));
  }

  /** 出典の一覧（設定の奥）。絵のある候だけ。 */
  function credits() {
    return Object.keys(ART).map(Number).sort((a, b) => a - b).map((k) => ({ k, kou: KN.season.KOU[k][0], ...ART[k] }));
  }

  KN.seasonArt = { apply, colorOf, credits, fileOf, ART, SEKKI_C, SOURCE };
})();
