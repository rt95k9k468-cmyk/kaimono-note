/* =========================================================
   くらしノート — 季節の絵（3.0 の E1。docs/roadmap-3.0.md・docs/daily.md の「季節の絵」）

   daily の紙の後ろと、ノートの地に一枚。**色と光の層が、いつも土台**：
   1. 候ごとの色（下地）。絵が無い・読めない・オフラインでまだ持っていない日でも、色だけは候ごとに変わる。
   2. 絵をごく薄く。読めてから重ねる。NN は春分の初候から数えた候の番号 00〜71（js/season.js の `k`）。
      - daily：写真 `img/season-photo/kNN.webp`（Wikimedia Commons。`PHOTO`）
      - ノート：浮世絵 `img/season/kNN.webp`（歌川広重『名所江戸百景』、国立国会図書館・NDL イメージバンク。`ART`）
      2026年10月7日、利用者が同じ日で並べて見比べて、daily を写真に、広重をノートへ移した。

   どちらも72候すべてに一枚ずつ。出どころは `PHOTO`・`ART` と docs/season-art.md の二つの表。
   出どころの分からない絵は置かない。直リンクはしない（同じ配信元の img/ から）。

   色は二十四節気の淡い色（`SEKKI_C`）。絵の平均の色は使わない——浮世絵の平均はどれも紙のくすんだ灰色で季節の色に
   ならず、夜の絵では見出しの字が沈む（2026年10月6日に72枚を測って決めた。docs/season-art.md）。

   通信：絵は前もって72枚を読まない。今の候と次の候だけ、手の空いたとき（requestIdleCallback）に。
   sw.js が img/season/・img/season-photo/ を別の名前のキャッシュ（kurashi-season-…）に覚える（版のキャッシュに入れると、
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

  /* 候の番号 → { file, title, author, license, url, why }（docs/season-art.md の「写真の表」と同じ中身。Wikimedia Commons）。
     CC BY／BY-SA は作者・ライセンス・URL の表示が要る（設定 → daily →「写真の出典」）。 */
  const PHOTO = {
    0: { file: "img/season-photo/k00.webp", title: "Passer montanus saturatus (flocks)", author: "Alpsdake", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Passer_montanus_saturatus_(flocks).jpg", why: "枝に群れるスズメ" },
    1: { file: "img/season-photo/k01.webp", title: "Cherry blossoms (Somei Yoshino), Nagai Botanical Garden, April 2026 -1488", author: "Laitche", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Cherry_blossoms_(Somei_Yoshino),_Nagai_Botanical_Garden,_April_2026_-1488.jpg", why: "咲いたソメイヨシノ（長居植物園）" },
    2: { file: "img/season-photo/k02.webp", title: "Thunder @ Kasai Rinkai Park", author: "Masahiro Hayata from Tokyo, Japan", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Thunder_@_Kasai_Rinkai_Park.jpg", why: "街の向こうに落ちる雷（葛西臨海公園）" },
    3: { file: "img/season-photo/k03.webp", title: "Barn Swallow nest in Japan", author: "Kuribo", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Barn_Swallow_nest_in_Japan.jpg", why: "巣のツバメのひな" },
    4: { file: "img/season-photo/k04.webp", title: "Swans on the rice field after harvest, photographed at Kitaakita, Japan 20201108b", author: "掬茶", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Swans_on_the_rice_field_after_harvest,_photographed_at_Kitaakita,_Japan_20201108b.jpg", why: "刈田の白鳥（北秋田）。北へ帰る渡り鳥" },
    5: { file: "img/season-photo/k05.webp", title: "香川県丸亀市 虹と飯野山 rainbow and Mount Iino 4 - panoramio", author: "iPhone修理/カスタマイズパーツ販売…", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:%E9%A6%99%E5%B7%9D%E7%9C%8C%E4%B8%B8%E4%BA%80%E5%B8%82_%E8%99%B9%E3%81%A8%E9%A3%AF%E9%87%8E%E5%B1%B1_rainbow_and_Mount_Iino_4_-_panoramio.jpg", why: "飯野山にかかる虹（香川）" },
    6: { file: "img/season-photo/k06.webp", title: "巨椋池排水機場水場 01", author: "おいでやす千年の都", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:%E5%B7%A8%E6%A4%8B%E6%B1%A0%E6%8E%92%E6%B0%B4%E6%A9%9F%E5%A0%B4%E6%B0%B4%E5%A0%B4_01.jpg", why: "葦の茂る水場（巨椋池）" },
    7: { file: "img/season-photo/k07.webp", title: "A raising of seedling box of the rice,ikubyoubako,katori-city,japan", author: "katorisi", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:A_raising_of_seedling_box_of_the_rice,ikubyoubako,katori-city,japan.JPG", why: "育苗箱の稲の苗（香取）" },
    8: { file: "img/season-photo/k08.webp", title: "Peonies - Ueno Tōshō-gū Peony Garden - DSC01885", author: "Daderot", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Peonies_-_Ueno_T%C5%8Dsh%C5%8D-g%C5%AB_Peony_Garden_-_DSC01885.JPG", why: "牡丹（上野東照宮）" },
    9: { file: "img/season-photo/k09.webp", title: "Rice transplanter working in a paddy field, Kameoka - May 19, 2005", author: "Peggy (Pei-Yi) Chen", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Rice_transplanter_working_in_a_paddy_field,_Kameoka_-_May_19,_2005.jpg", why: "5月の田植え（亀岡）。蛙の鳴く水田" },
    10: { file: "img/season-photo/k10.webp", title: "Fresh green Echigo Komagatake (Ginzandaira, Uonuma City) Niigata,Japan (51298942135)", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Fresh_green_Echigo_Komagatake_(Ginzandaira,_Uonuma_City)_Niigata,Japan_(51298942135).jpg", why: "新緑の越後駒ヶ岳" },
    11: { file: "img/season-photo/k11.webp", title: "Japan The Bamboo Forest (13914447656)", author: "Yiannis Theologos Michellis", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Japan_The_Bamboo_Forest_(13914447656).jpg", why: "竹林（嵐山）" },
    12: { file: "img/season-photo/k12.webp", title: "Wild silkworm mulberry - Kanagawa Japan - 2024 June 7", author: "Nesnad", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Wild_silkworm_mulberry_-_Kanagawa_Japan_-_2024_June_7.jpeg", why: "桑の若木（神奈川）" },
    13: { file: "img/season-photo/k13.webp", title: "Safflower field in Kahoku, Yamagata (1)", author: "掬茶", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Safflower_field_in_Kahoku,_Yamagata_(1).jpg", why: "紅花の畑（山形・河北）" },
    14: { file: "img/season-photo/k14.webp", title: "Wheat field near Satsukibashi Bridge", author: "そらみみ", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Wheat_field_near_Satsukibashi_Bridge.jpg", why: "実った麦の畑" },
    15: { file: "img/season-photo/k15.webp", title: "Japanese Praying Mantis (6453486763)", author: "Maarten Heerlien from Voorschoten, The Netherlands", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Japanese_Praying_Mantis_(6453486763).jpg", why: "カマキリ" },
    16: { file: "img/season-photo/k16.webp", title: "Luciola cruciata on the grass - 8", author: "Kyu3a", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Luciola_cruciata_on_the_grass_-_8.jpg", why: "草にとまるゲンジボタル" },
    17: { file: "img/season-photo/k17.webp", title: "Wakasa town Fukui Ume ac (1)", author: "Asturio Cantabrio", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Wakasa_town_Fukui_Ume_ac_(1).jpg", why: "梅林（福井・若狭）。実のなる梅" },
    18: { file: "img/season-photo/k18.webp", title: "Prunella vulgaris subsp. asiatica (Mount Ibuki)", author: "Alpsdake", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Prunella_vulgaris_subsp._asiatica_(Mount_Ibuki).JPG", why: "ウツボグサ（伊吹山）" },
    19: { file: "img/season-photo/k19.webp", title: "Suigo Itako Ayame Garden 07", author: "Σ64", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Suigo_Itako_Ayame_Garden_07.jpg", why: "あやめ園（潮来）" },
    20: { file: "img/season-photo/k20.webp", title: "Saururus chinensis (Imo Wetland)", author: "Alpsdake", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Saururus_chinensis_(Imo_Wetland).jpg", why: "ハンゲショウ（伊茂湿原）" },
    21: { file: "img/season-photo/k21.webp", title: "Rice paddy fields near Tamamura Station Ibaraki Japan 20080715", author: "LERK", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Rice_paddy_fields_near_Tamamura_Station_Ibaraki_Japan_20080715.jpg", why: "7月の青い田（茨城）" },
    22: { file: "img/season-photo/k22.webp", title: "View of the Five-storied Pagoda from the Lotus Pond, Tō-ji Temple, Kyoto, 20240821 1015 5226", author: "Jakub Hałun", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:View_of_the_Five-storied_Pagoda_from_the_Lotus_Pond,_T%C5%8D-ji_Temple,_Kyoto,_20240821_1015_5226.jpg", why: "東寺の蓮池と五重塔" },
    23: { file: "img/season-photo/k23.webp", title: "Accipiter gularis from iNaturalist photo 297299807", author: "mami_t_t", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Accipiter_gularis_from_iNaturalist_photo_297299807.jpg", why: "木にとまるツミ（小さな鷹）" },
    24: { file: "img/season-photo/k24.webp", title: "Paulownia tomentosa4", author: "KENPEI", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Paulownia_tomentosa4.jpg", why: "キリの実" },
    25: { file: "img/season-photo/k25.webp", title: "Forest in Yakushima 55", author: "Σ64", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Forest_in_Yakushima_55.jpg", why: "屋久島の森。蒸す夏の森" },
    26: { file: "img/season-photo/k26.webp", title: "Cumulonimbus cloud in Japan 1", author: "Hyougushi", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Cumulonimbus_cloud_in_Japan_1.jpg", why: "夏の積乱雲" },
    27: { file: "img/season-photo/k27.webp", title: "Paddy field in Wakayama City, Wakayama Prefecture; August 2016 (01)", author: "jinkemoole", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Paddy_field_in_Wakayama_City,_Wakayama_Prefecture;_August_2016_(01).jpg", why: "8月の田と里（和歌山）" },
    28: { file: "img/season-photo/k28.webp", title: "Evening cicada (Tanna japonensis) (20037878650)", author: "harum.koh from Kobe city, Japan", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Evening_cicada_(Tanna_japonensis)_(20037878650).jpg", why: "木にとまるヒグラシ" },
    29: { file: "img/season-photo/k29.webp", title: "Dense fog creeping up the slopes of Mt. Fuji (6155482477)", author: "Maarten Heerlien from Voorschoten, The Netherlands", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Dense_fog_creeping_up_the_slopes_of_Mt._Fuji_(6155482477).jpg", why: "富士の斜面をのぼる濃い霧" },
    30: { file: "img/season-photo/k30.webp", title: "Cotton boll nearly ready for harvest", author: "Michael Bass-Deschenes(Commons User Mike Bass-Deschênes)", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Cotton_boll_nearly_ready_for_harvest.jpg", why: "はじけた綿の実" },
    31: { file: "img/season-photo/k31.webp", title: "Morning view of the pond at Oizumi Ryokuchi, September 2024 - 0644", author: "Laitche", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Morning_view_of_the_pond_at_Oizumi_Ryokuchi,_September_2024_-_0644.jpg", why: "9月の朝の池（大泉緑地）" },
    32: { file: "img/season-photo/k32.webp", title: "Rice Fields Before Harvest in Autumn Hokkaido Japan", author: "Sgroey", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Rice_Fields_Before_Harvest_in_Autumn_Hokkaido_Japan.jpg", why: "実った稲の田（北海道）" },
    33: { file: "img/season-photo/k33.webp", title: "A morning dew (15416014226)", author: "Raita Futo from Tokyo, Japan", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:A_morning_dew_(15416014226).jpg", why: "草の朝露" },
    34: { file: "img/season-photo/k34.webp", title: "Japanese Pied Wagtail in Sakai, Osaka, February 2016", author: "Laitche", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Japanese_Pied_Wagtail_in_Sakai,_Osaka,_February_2016.jpg", why: "ハクセキレイ（堺）" },
    35: { file: "img/season-photo/k35.webp", title: "高原の秋空（Autumn sky of plateau） - panoramio", author: "pakku", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:%E9%AB%98%E5%8E%9F%E3%81%AE%E7%A7%8B%E7%A9%BA%EF%BC%88Autumn_sky_of_plateau%EF%BC%89_-_panoramio.jpg", why: "高原の秋空と色づく木" },
    36: { file: "img/season-photo/k36.webp", title: "Lycoris radiata - Kinchakuda Plateau, Hidaka, Saitama", author: "Kakidai", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Lycoris_radiata_-_Kinchakuda_Plateau,_Hidaka,_Saitama.jpg", why: "ヒガンバナ（巾着田）。秋分のころの花" },
    37: { file: "img/season-photo/k37.webp", title: "Japan, countryside in autumn 2", author: "Marie-Sophie Mejan", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Japan,_countryside_in_autumn_2.jpg", why: "秋の里と茅葺きの家" },
    38: { file: "img/season-photo/k38.webp", title: "Rice fields and Kashima line during the harvest season,Katori city,Japan", author: "Katorisi", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Rice_fields_and_Kashima_line_during_the_harvest_season,Katori_city,Japan.jpg", why: "刈り入れのころの田（香取）" },
    39: { file: "img/season-photo/k39.webp", title: "Anser fabalis middendorffii in flight", author: "Alpsdake", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Anser_fabalis_middendorffii_in_flight.jpg", why: "飛ぶヒシクイ（雁）" },
    40: { file: "img/season-photo/k40.webp", title: "Chrysanthemum November 2007 Osaka Japan", author: "Laitche", license: "Public domain", url: "https://commons.wikimedia.org/wiki/File:Chrysanthemum_November_2007_Osaka_Japan.jpg", why: "菊（大阪・11月）" },
    41: { file: "img/season-photo/k41.webp", title: "Susuki IMG 3515", author: "雑用部", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Susuki_IMG_3515.jpg", why: "ススキ" },
    42: { file: "img/season-photo/k42.webp", title: "Collinsonia japonica (frost columns s4)", author: "Alpsdake", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Collinsonia_japonica_(frost_columns_s4).jpg", why: "霜柱（シモバシラの茎）" },
    43: { file: "img/season-photo/k43.webp", title: "Togetsu bridge and Arashiyama hills under the rain (Kyoto, Japan) (3262583370)", author: "KimonBerlin", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Togetsu_bridge_and_Arashiyama_hills_under_the_rain_(Kyoto,_Japan)_(3262583370).jpg", why: "雨の渡月橋と嵐山" },
    44: { file: "img/season-photo/k44.webp", title: "Japanese maple leaves in autumn in Japan 2011 4 (7024866637)", author: "Yiannis Theologos Michellis", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Japanese_maple_leaves_in_autumn_in_Japan_2011_4_(7024866637).jpg", why: "色づいたモミジ" },
    45: { file: "img/season-photo/k45.webp", title: "Sasanqua camellia (Camellia sasanqua) (22407381836)", author: "harum.koh from Kobe city, Japan", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Sasanqua_camellia_(Camellia_sasanqua)_(22407381836).jpg", why: "サザンカ（神戸）" },
    46: { file: "img/season-photo/k46.webp", title: "Field with frost, Kurokawa, Aso, Kumamoto - Jan 31, 2013", author: "迷惘的人生", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Field_with_frost,_Kurokawa,_Aso,_Kumamoto_-_Jan_31,_2013.jpg", why: "霜の降りた畑（阿蘇）" },
    47: { file: "img/season-photo/k47.webp", title: "Flower of Narcissus tazetta at Nagai Park, January 2024 - 1393", author: "Laitche", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Flower_of_Narcissus_tazetta_at_Nagai_Park,_January_2024_-_1393.jpg", why: "スイセン（長居公園・1月）" },
    48: { file: "img/season-photo/k48.webp", title: "初冬の旭岳（Mt.Asahidake of the early winter） - panoramio", author: "pakku", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:%E5%88%9D%E5%86%AC%E3%81%AE%E6%97%AD%E5%B2%B3%EF%BC%88Mt.Asahidake_of_the_early_winter%EF%BC%89_-_panoramio.jpg", why: "初冬の旭岳。虹の出ない冬空" },
    49: { file: "img/season-photo/k49.webp", title: "Fallen Leaves - Flickr - Yoshikazu TAKADA", author: "Yoshikazu TAKADA from Tokyo, Japan", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Fallen_Leaves_-_Flickr_-_Yoshikazu_TAKADA.jpg", why: "散り敷いた落ち葉" },
    50: { file: "img/season-photo/k50.webp", title: "Citrus tachibana, Kofuku-ji Nanendo", author: "Degueulasse", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Citrus_tachibana,_Kofuku-ji_Nanendo.JPG", why: "タチバナの実（興福寺南円堂）" },
    51: { file: "img/season-photo/k51.webp", title: "Hakkoda snow fields (51886442341)", author: "Raita Futo from Tokyo, Japan", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Hakkoda_snow_fields_(51886442341).jpg", why: "八甲田の雪原" },
    52: { file: "img/season-photo/k52.webp", title: "Snow forest in the Hokuou-no-mori Park 20250111b", author: "掬茶", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Snow_forest_in_the_Hokuou-no-mori_Park_20250111b.jpg", why: "雪の林と野（北欧の森公園）" },
    53: { file: "img/season-photo/k53.webp", title: "Chum salmon (Oncorhynchus keta) 121523", author: "Chris Light", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Chum_salmon_(Oncorhynchus_keta)_121523.jpg", why: "シロザケの上る川" },
    54: { file: "img/season-photo/k54.webp", title: "Citrus junos1", author: "KENPEI", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Citrus_junos1.jpg", why: "ユズの木。冬至の柚子" },
    55: { file: "img/season-photo/k55.webp", title: "Sika deer in Nara 06", author: "Dariusz Jemielniak (\"Pundit\")", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Sika_deer_in_Nara_06.jpg", why: "奈良のシカ" },
    56: { file: "img/season-photo/k56.webp", title: "美作滝尾駅と青々とした小麦畑 (50153837741)", author: "津山市立図書館 Public Library of Tsuyama", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:%E7%BE%8E%E4%BD%9C%E6%BB%9D%E5%B0%BE%E9%A7%85%E3%81%A8%E9%9D%92%E3%80%85%E3%81%A8%E3%81%97%E3%81%9F%E5%B0%8F%E9%BA%A6%E7%95%91_(50153837741).jpg", why: "青い小麦の畑（美作滝尾）" },
    57: { file: "img/season-photo/k57.webp", title: "Oenanthe javanica1", author: "KENPEI", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Oenanthe_javanica1.jpg", why: "セリ" },
    58: { file: "img/season-photo/k58.webp", title: "Hokkaido Jingu, stream during the winter with heavy snow", author: "bryan...", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Hokkaido_Jingu,_stream_during_the_winter_with_heavy_snow.jpg", why: "雪の中を流れる小川（北海道神宮）" },
    59: { file: "img/season-photo/k59.webp", title: "Phasianus versicolor in Japan", author: "Alpsdake", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Phasianus_versicolor_in_Japan.JPG", why: "キジ" },
    60: { file: "img/season-photo/k60.webp", title: "フキノトウの雌株20080407", author: "あおもりくま（Aomorikuma）", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:%E3%83%95%E3%82%AD%E3%83%8E%E3%83%88%E3%82%A6%E3%81%AE%E9%9B%8C%E6%A0%AA20080407.JPG", why: "フキノトウ" },
    61: { file: "img/season-photo/k61.webp", title: "Frozen Lake Onuma (Nanae, Hokkaido) in winter 20260118e", author: "掬茶", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Frozen_Lake_Onuma_(Nanae,_Hokkaido)_in_winter_20260118e.jpg", why: "凍った大沼（北海道）" },
    62: { file: "img/season-photo/k62.webp", title: "Isonokami Jingu chickens, messengers of god-4", author: "Immanuelle", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Isonokami_Jingu_chickens,_messengers_of_god-4.jpg", why: "石上神宮の鶏" },
    63: { file: "img/season-photo/k63.webp", title: "Hokkaido-Drift ice, Shiretoko Peninsula-xl", author: "kkawamura", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Hokkaido-Drift_ice,_Shiretoko_Peninsula-xl.jpg", why: "知床の流氷" },
    64: { file: "img/season-photo/k64.webp", title: "Japanese bush warbler（Horornis diphone）ウグイス", author: "Ken Ishigaki", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Japanese_bush_warbler%EF%BC%88Horornis_diphone%EF%BC%89%E3%82%A6%E3%82%B0%E3%82%A4%E3%82%B9.jpg", why: "ウグイス" },
    65: { file: "img/season-photo/k65.webp", title: "Ice fishing on Lake Onuma", author: "掬茶", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Ice_fishing_on_Lake_Onuma.jpg", why: "氷上のワカサギ釣り（大沼）" },
    66: { file: "img/season-photo/k66.webp", title: "雪融けの牧野 Ranch in Early Spring - panoramio", author: "Tomofumi Sato", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:%E9%9B%AA%E8%9E%8D%E3%81%91%E3%81%AE%E7%89%A7%E9%87%8E_Ranch_in_Early_Spring_-_panoramio.jpg", why: "雪解けの牧野" },
    67: { file: "img/season-photo/k67.webp", title: "Spring Haze 2", author: "halfrain", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Spring_Haze_2.jpg", why: "かすむ海と日" },
    68: { file: "img/season-photo/k68.webp", title: "2023-03-31 16 46 16 Green-leaved Japanese Maple buds expanding in early spring along Aquetong Lane in the Mountainview section of Ewing Township, Mercer County, New Jersey", author: "Famartin", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:2023-03-31_16_46_16_Green-leaved_Japanese_Maple_buds_expanding_in_early_spring_along_Aquetong_Lane_in_the_Mountainview_section_of_Ewing_Township,_Mercer_County,_New_Jersey.jpg", why: "芽吹くモミジ" },
    69: { file: "img/season-photo/k69.webp", title: "Japan Alps at Spring (skyseeker) 001", author: "Kazuhiko Teramoto from JAPAN", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Japan_Alps_at_Spring_(skyseeker)_001.jpg", why: "春の日本アルプス。残る雪" },
    70: { file: "img/season-photo/k70.webp", title: "Cherry and peach blossoms at rinrin road - panoramio", author: "Toshihiro Matsui", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Cherry_and_peach_blossoms_at_rinrin_road_-_panoramio.jpg", why: "桃と桜の並木（りんりんロード）" },
    71: { file: "img/season-photo/k71.webp", title: "桜と菜の花と青空と (Cherry blossoms and Rape seeds under Blue sky) 06 Apr, 2014 - panoramio", author: "Hiroaki Kaneko", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:%E6%A1%9C%E3%81%A8%E8%8F%9C%E3%81%AE%E8%8A%B1%E3%81%A8%E9%9D%92%E7%A9%BA%E3%81%A8_(Cherry_blossoms_and_Rape_seeds_under_Blue_sky)_06_Apr,_2014_-_panoramio.jpg", why: "菜の花と桜" },
  };

  const fileOf = (k) => `img/season/k${String(k).padStart(2, "0")}.webp`;
  /* どの画面に、どの一揃いを敷くか（2026年10月7日、利用者が見比べて選んだ）。daily は写真、ノートは広重。
     切るスイッチも画面ごと（既定は入。`!== false` なので、足す前の設定もそのまま入）。 */
  const WHERE = {
    daily: { set: () => PHOTO, key: "seasonArt" },
    notes: { set: () => ART, key: "notesSeasonArt" },
  };
  const placeOf = (where) => WHERE[where] || WHERE.daily;
  const on = (where) => KN.store.get().settings[placeOf(where).key] !== false;
  const kOf = (day) => { const s = KN.season && KN.season.of(day); return s ? s.k : null; };

  /* 読めた絵（URL → 縦横の比 高さ/幅）。同じ絵を何度も読みに行かない。比は幕の閉じる高さに使う（css の --season-ar）。 */
  const loaded = new Map();
  const failed = new Set();
  function preload(a, done) {
    if (!a || !a.file) return;
    const url = a.file;
    if (loaded.has(url)) { if (done) done(url); return; }
    if (failed.has(url)) return;
    const img = new Image();
    img.onload = () => { loaded.set(url, img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.67); if (done) done(url); };
    img.onerror = () => { failed.add(url); };
    img.src = url;
  }

  /**
   * 画面（daily の `#screen-archive`・ノートの `#screen-notes`）に、その日の候の色と絵を敷く。
   * カスタムプロパティは :root ではなくこの画面に書く（docs/traps.md）。設定で切ってあれば外す。
   * @param {string} where "daily"（写真）か "notes"（広重）
   */
  function apply(el, day, where) {
    if (!el) return;
    if (!on(where)) {
      el.removeAttribute("data-season");
      el.removeAttribute("data-season-img");
      return;
    }
    const k = kOf(day);
    if (k == null) return;
    const set = placeOf(where).set();
    el.setAttribute("data-season", String(k));
    KN.util.setVar(el, "--season-c", colorOf(k));
    const a = set[k];
    if (!a || !a.file) { el.removeAttribute("data-season-img"); el.style.removeProperty("--season-img"); }
    else {
      /* まだ読めていない絵なら、前の候の絵を残さない（読めるまで色だけ。オフラインで持っていない日も） */
      if (!loaded.has(a.file)) { el.removeAttribute("data-season-img"); el.style.removeProperty("--season-img"); }
      preload(a, (url) => {
        if (el.getAttribute("data-season") !== String(k)) return;   // 読んでいるあいだに日が移った
        /* 絶対の URL で書く。カスタムプロパティの相対 URL は、var() を使う css/screens.css から解決され
           css/img/season/… を探して 404 になる（10/6 まで絵は一度も出ていなかった）。 */
        el.style.setProperty("--season-img", `url("${new URL(url, document.baseURI).href}")`);
        KN.util.setVar(el, "--season-ar", loaded.get(url).toFixed(3));
        el.setAttribute("data-season-img", "");
      });
    }
    /* 次の候も、手の空いたときに覚えておく（オフラインで日をまたいでも、絵が待っている）。 */
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => preload(set[(k + 1) % 72]));
  }

  /** 出典の一覧（設定の奥）。絵のある候だけ。daily は写真、notes は広重。 */
  function credits(where) {
    const set = placeOf(where).set();
    return Object.keys(set).map(Number).sort((a, b) => a - b).map((k) => ({ k, kou: KN.season.KOU[k][0], ...set[k] }));
  }

  KN.seasonArt = { apply, colorOf, credits, fileOf, ART, PHOTO, SEKKI_C, SOURCE };
})();
