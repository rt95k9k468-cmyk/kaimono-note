/* =========================================================
   くらしノート — 食品成分（基本食品）と、書いた一行の読み取り
   =========================================================

   ここに置くのは「基本食品」だけです。ご飯、鶏むね肉、卵、牛乳——だいたい
   どこで買っても中身が同じもの。値は日本食品標準成分表2020年版（八訂）を
   もとにした**可食部100gあたりの概数**で、小数第一位まで丸めてあります。

   概数だと断っておくのは大事なことです。同じ「鶏むね肉」でも部位の取り方で
   1割は動きますし、炊いたご飯は水加減で変わります。ここの数字は
   「毎回1gずつ量るかわりに、だいたいの線を引く」ためのもので、
   検査値ではありません。だからこの表の値は**いつでも直せる**ようにしてあり、
   直した値はその人の食品（kind: "user"）として保存されます。

   市販商品（コンビニのおにぎり、特定メーカーのヨーグルト）はここには
   入れません。あれは商品ごとに違い、リニューアルで変わり、いずれ
   バーコードから引くものなので、別の入れ物（kind: "product"）にします。 */
(function () {
  "use strict";

  const KN = window.KN;
  const { foldKana } = KN.util;

  /* 100gあたり [kcal, たんぱく質g, 脂質g, 炭水化物g]。
     炭水化物は差引き法の総量——食物繊維も含んだ、いわゆる「炭水化物」です
     （糖質ではありません）。市販の栄養成分表示と同じ土俵に乗せるため。 */
  const F = (id, name, cat, kcal, p, f, c, extra) =>
    Object.assign({ id: "f-" + id, name, cat, kcal, p, f, c, kind: "base" }, extra || {});

  /* unit: 「1個」「1枚」で数えるものの、1つあたりのグラム（可食部）。
     ここが空の食品は、グラムでしか数えられません——「レタス1個」と言われて
     も、それが何グラムかは人によって違いすぎるので。 */

  const FOODS = [
    /* ---------------- 主食 ---------------- */
    F("gohan",      "ご飯",              "shushoku", 156, 2.0,  0.3, 37.1, { units: { 杯: 150, 膳: 150 } }),
    F("gohan-genmai", "玄米ご飯",        "shushoku", 152, 2.8,  1.0, 35.6, { units: { 杯: 150 } }),
    F("okayu",      "おかゆ",            "shushoku",  65, 1.1,  0.1, 15.7, { units: { 杯: 220 } }),
    F("mochi",      "もち",              "shushoku", 223, 4.0,  0.6, 50.8, { units: { 個: 50, 切れ: 50 } }),
    F("shokupan",   "食パン",            "shushoku", 248, 8.9,  4.1, 46.4, { units: { 枚: 60 } }),
    F("roll-pan",   "ロールパン",        "shushoku", 309, 10.1, 9.0, 48.6, { units: { 個: 30 } }),
    F("croissant",  "クロワッサン",      "shushoku", 438, 7.9, 26.8, 43.9, { units: { 個: 40 } }),
    F("udon",       "うどん（ゆで）",    "shushoku",  95, 2.6,  0.4, 21.6, { units: { 玉: 230, 袋: 230 } }),
    F("soba",       "そば（ゆで）",      "shushoku", 130, 4.8,  1.0, 26.0, { units: { 玉: 180 } }),
    F("somen",      "そうめん（ゆで）",  "shushoku", 114, 3.5,  0.4, 25.8),
    F("pasta",      "スパゲッティ（ゆで）", "shushoku", 150, 5.8, 0.9, 32.2),
    F("pasta-dry",  "スパゲッティ（乾）",   "shushoku", 347, 12.9, 1.8, 73.1),
    F("chuka-men",  "中華めん（ゆで）",  "shushoku", 133, 4.9,  0.6, 27.9, { units: { 玉: 200 } }),
    F("ramen-inst", "即席中華めん（油揚げ）", "shushoku", 458, 10.1, 19.1, 61.4, { units: { 袋: 100, 個: 100 } }),
    F("cornflakes", "コーンフレーク",    "shushoku", 380, 7.8,  1.7, 83.6),
    F("oatmeal",    "オートミール",      "shushoku", 350, 13.7, 5.7, 69.1),

    /* ---------------- 肉 ---------------- */
    F("toriMuneNP", "鶏むね肉（皮なし）", "niku", 105, 23.3, 1.9, 0.1),
    F("toriMune",   "鶏むね肉（皮つき）", "niku", 133, 21.3, 5.9, 0.1),
    F("toriMomoNP", "鶏もも肉（皮なし）", "niku", 113, 19.0, 5.0, 0.0),
    F("toriMomo",   "鶏もも肉（皮つき）", "niku", 190, 16.6, 14.2, 0.0),
    F("sasami",     "ささみ",            "niku",  98, 23.9, 0.8, 0.1, { units: { 本: 45 } }),
    F("tebasaki",   "手羽先",            "niku", 207, 17.4, 14.6, 0.0, { units: { 本: 35 } }),
    F("toriHikiniku", "鶏ひき肉",        "niku", 171, 17.5, 12.0, 0.0),
    F("butaRosu",   "豚ロース",          "niku", 248, 19.3, 19.2, 0.2),
    F("butaBara",   "豚バラ肉",          "niku", 366, 14.4, 35.4, 0.1),
    F("butaMomo",   "豚もも肉",          "niku", 171, 20.5, 10.2, 0.2),
    F("butaHire",   "豚ヒレ肉",          "niku", 118, 22.2, 3.7,  0.3),
    F("butaHiki",   "豚ひき肉",          "niku", 209, 17.7, 17.2, 0.1),
    F("gyuMomo",    "牛もも肉（輸入）",  "niku", 148, 19.6, 8.6,  0.4),
    F("gyuKata",    "牛肩ロース（輸入）", "niku", 221, 17.9, 17.4, 0.1),
    F("gyuBara",    "牛バラ肉（輸入）",  "niku", 338, 14.4, 32.9, 0.2),
    F("gyuHiki",    "牛ひき肉",          "niku", 251, 17.1, 21.1, 0.3),
    F("aibiki",     "合いびき肉",        "niku", 230, 17.4, 19.2, 0.2),
    F("ham",        "ロースハム",        "niku", 211, 18.6, 14.5, 2.0, { units: { 枚: 20 } }),
    F("bacon",      "ベーコン",          "niku", 400, 12.9, 39.1, 0.3, { units: { 枚: 17 } }),
    F("wiener",     "ウインナー",        "niku", 319, 11.5, 30.6, 3.3, { units: { 本: 20 } }),
    F("sasami-jerky", "サラダチキン",    "niku", 105, 21.7, 1.2,  1.0, { units: { 個: 110, パック: 110 } }),

    /* ---------------- 魚 ---------------- */
    F("sake",       "鮭",                "sakana", 124, 22.3, 4.1, 0.1, { units: { 切れ: 80 } }),
    F("saba",       "さば",              "sakana", 211, 20.6, 16.8, 0.3, { units: { 切れ: 80 } }),
    F("sabaKan",    "さば水煮缶",        "sakana", 174, 20.9, 10.7, 0.2, { units: { 缶: 190 } }),
    F("sanma",      "さんま",            "sakana", 287, 18.1, 25.6, 0.1, { units: { 尾: 100 } }),
    F("aji",        "あじ",              "sakana", 112, 19.7, 4.5, 0.1, { units: { 尾: 70 } }),
    F("buri",       "ぶり",              "sakana", 222, 21.4, 17.6, 0.3, { units: { 切れ: 80 } }),
    F("maguro",     "まぐろ赤身",        "sakana", 115, 26.4, 1.4, 0.1),
    F("katsuo",     "かつお",            "sakana", 108, 25.8, 0.5, 0.1),
    F("tara",       "たら",              "sakana",  72, 17.6, 0.2, 0.1, { units: { 切れ: 80 } }),
    F("ebi",        "えび",              "sakana",  82, 19.6, 0.6, 0.3, { units: { 尾: 15 } }),
    F("ika",        "いか",              "sakana",  76, 17.9, 0.8, 0.1),
    F("tuna-water", "ツナ缶（水煮）",    "sakana",  70, 16.0, 0.7, 0.2, { units: { 缶: 70 } }),
    F("tuna-oil",   "ツナ缶（油漬）",    "sakana", 265, 17.7, 21.7, 0.1, { units: { 缶: 70 } }),
    F("shirasu",    "しらす干し",        "sakana", 113, 24.5, 2.1, 0.1),
    F("chikuwa",    "ちくわ",            "sakana", 119, 12.2, 2.0, 13.5, { units: { 本: 30 } }),
    F("kamaboko",   "かまぼこ",          "sakana",  93, 12.0, 0.9, 9.7),

    /* ---------------- 卵・豆・乳 ---------------- */
    F("tamago",     "卵",                "tamago", 142, 12.2, 10.2, 0.4, { units: { 個: 60 } }),
    F("shiromi",    "卵白",              "tamago",  44,  9.5,  0.0, 0.4, { units: { 個: 35 } }),
    F("kimi",       "卵黄",              "tamago", 336, 16.5, 34.3, 0.2, { units: { 個: 17 } }),
    F("momen",      "木綿豆腐",          "mame",    73,  7.0,  4.9, 1.5, { units: { 丁: 300, パック: 150 } }),
    F("kinugoshi",  "絹ごし豆腐",        "mame",    56,  5.3,  3.5, 2.0, { units: { 丁: 300, パック: 150 } }),
    F("natto",      "納豆",              "mame",   184, 16.5, 10.0, 12.1, { units: { パック: 45 } }),
    F("aburaage",   "油揚げ",            "mame",   377, 23.4, 34.4, 0.4, { units: { 枚: 30 } }),
    F("atsuage",    "厚揚げ",            "mame",   143, 10.7, 11.3, 0.9, { units: { 枚: 120 } }),
    F("edamame",    "枝豆（ゆで）",      "mame",   118, 11.5,  6.1, 8.9),
    F("hiyayakko",  "きなこ",            "mame",   451, 36.7, 25.7, 28.5),
    F("gyunyu",     "牛乳",              "nyu",     61,  3.3,  3.8, 4.8, { ml: 1.03, units: { 杯: 200, 本: 200 } }),
    F("teishibo",   "低脂肪牛乳",        "nyu",     42,  3.8,  1.0, 5.5, { ml: 1.03, units: { 杯: 200 } }),
    F("tonyu",      "豆乳（無調整）",    "nyu",     44,  3.6,  2.0, 3.1, { ml: 1.03, units: { 杯: 200 } }),
    F("tonyu-choi", "調製豆乳",          "nyu",     63,  3.2,  3.6, 4.8, { ml: 1.03, units: { 杯: 200 } }),
    F("yogurt",     "ヨーグルト（無糖）", "nyu",     56,  3.6,  3.0, 4.9, { units: { 個: 100, カップ: 100 } }),
    F("yogurt-greek", "ギリシャヨーグルト", "nyu",   99, 10.2,  0.2, 12.0, { units: { 個: 100 } }),
    F("cheese",     "プロセスチーズ",    "nyu",    313, 22.7, 26.0, 1.3, { units: { 枚: 18, 個: 18 } }),
    F("camembert",  "カマンベールチーズ", "nyu",    291, 19.1, 24.7, 0.9),
    F("butter",     "バター",            "nyu",    700,  0.6, 81.0, 0.2, { units: { 個: 8 } }),

    /* ---------------- 野菜 ---------------- */
    F("cabbage",    "キャベツ",          "yasai",  21, 1.3, 0.2, 5.2),
    F("lettuce",    "レタス",            "yasai",  11, 0.6, 0.1, 2.8),
    F("tomato",     "トマト",            "yasai",  20, 0.7, 0.1, 4.7, { units: { 個: 150 } }),
    F("mini-tomato", "ミニトマト",       "yasai",  30, 1.1, 0.1, 7.2, { units: { 個: 15 } }),
    F("kyuri",      "きゅうり",          "yasai",  13, 1.0, 0.1, 3.0, { units: { 本: 100 } }),
    F("ninjin",     "にんじん",          "yasai",  35, 0.7, 0.2, 9.3, { units: { 本: 150 } }),
    F("tamanegi",   "玉ねぎ",            "yasai",  33, 1.0, 0.1, 8.4, { units: { 個: 200 } }),
    F("jagaimo",    "じゃがいも",        "yasai",  59, 1.8, 0.1, 17.3, { units: { 個: 130 } }),
    F("satsumaimo", "さつまいも",        "yasai", 126, 1.2, 0.2, 31.9, { units: { 本: 200 } }),
    F("daikon",     "大根",              "yasai",  15, 0.4, 0.1, 4.1),
    F("hakusai",    "白菜",              "yasai",  13, 0.8, 0.1, 3.2),
    F("horenso",    "ほうれん草",        "yasai",  18, 2.2, 0.4, 3.1, { units: { 束: 200 } }),
    F("komatsuna",  "小松菜",            "yasai",  13, 1.5, 0.2, 2.4, { units: { 束: 200 } }),
    F("burokkori",  "ブロッコリー",      "yasai",  37, 5.4, 0.6, 6.6),
    F("piman",      "ピーマン",          "yasai",  20, 0.9, 0.2, 5.1, { units: { 個: 35 } }),
    F("nasu",       "なす",              "yasai",  18, 1.1, 0.1, 5.1, { units: { 本: 80 } }),
    F("kabocha",    "かぼちゃ",          "yasai",  78, 1.9, 0.3, 20.6),
    F("moyashi",    "もやし",            "yasai",  15, 1.7, 0.1, 2.6, { units: { 袋: 200 } }),
    F("negi",       "ねぎ",              "yasai",  35, 1.4, 0.1, 8.3, { units: { 本: 100 } }),
    F("goboh",      "ごぼう",            "yasai",  58, 1.8, 0.1, 15.4),
    F("renkon",     "れんこん",          "yasai",  66, 1.9, 0.1, 15.5),
    F("shiitake",   "しいたけ",          "yasai",  25, 3.1, 0.3, 6.4, { units: { 個: 15 } }),
    F("enoki",      "えのき",            "yasai",  34, 2.7, 0.2, 7.6, { units: { 袋: 100 } }),
    F("shimeji",    "しめじ",            "yasai",  26, 2.7, 0.5, 4.8, { units: { 袋: 100 } }),
    F("wakame",     "わかめ（生）",      "yasai",  24, 1.9, 0.2, 5.6),
    F("hijiki",     "ひじき（乾）",      "yasai", 180, 9.2, 3.2, 58.4),
    F("nori",       "焼きのり",          "yasai", 297, 41.4, 3.7, 44.3, { units: { 枚: 3 } }),
    F("kimchi",     "キムチ",            "yasai",  27, 2.3, 0.1, 5.4),

    /* ---------------- くだもの ---------------- */
    F("banana",     "バナナ",            "kudamono",  93, 1.1, 0.2, 22.5, { units: { 本: 90 } }),
    F("ringo",      "りんご",            "kudamono",  56, 0.2, 0.3, 16.2, { units: { 個: 250 } }),
    F("mikan",      "みかん",            "kudamono",  49, 0.7, 0.1, 12.0, { units: { 個: 80 } }),
    F("ichigo",     "いちご",            "kudamono",  31, 0.9, 0.1, 8.5, { units: { 個: 15 } }),
    F("budou",      "ぶどう",            "kudamono",  58, 0.4, 0.1, 15.7),
    F("kiwi",       "キウイ",            "kudamono",  51, 1.0, 0.2, 13.4, { units: { 個: 85 } }),
    F("nashi",      "なし",              "kudamono",  38, 0.3, 0.1, 11.3, { units: { 個: 250 } }),
    F("momo",       "もも",              "kudamono",  38, 0.6, 0.1, 10.2, { units: { 個: 170 } }),
    F("suika",      "すいか",            "kudamono",  41, 0.6, 0.1, 9.5),
    F("avocado",    "アボカド",          "kudamono", 176, 2.1, 17.5, 7.9, { units: { 個: 140 } }),
    F("blueberry",  "ブルーベリー",      "kudamono",  48, 0.5, 0.1, 12.9),

    /* ---------------- 調味料・油 ---------------- */
    F("abura",      "サラダ油",          "chomi",  886, 0.0, 100.0, 0.0, { units: { 大さじ: 12, 小さじ: 4 } }),
    F("olive",      "オリーブオイル",    "chomi",  894, 0.0, 100.0, 0.0, { units: { 大さじ: 12, 小さじ: 4 } }),
    F("goma-abura", "ごま油",            "chomi",  890, 0.0, 100.0, 0.0, { units: { 大さじ: 12, 小さじ: 4 } }),
    F("mayo",       "マヨネーズ",        "chomi",  668, 1.4, 72.5, 4.5, { units: { 大さじ: 12, 小さじ: 4 } }),
    F("ketchup",    "ケチャップ",        "chomi",  106, 1.6, 0.2, 27.6, { units: { 大さじ: 15, 小さじ: 5 } }),
    F("shoyu",      "しょうゆ",          "chomi",   77, 7.7, 0.0, 7.9, { units: { 大さじ: 18, 小さじ: 6 } }),
    F("miso",       "みそ",              "chomi",  182, 12.5, 6.0, 21.9, { units: { 大さじ: 18, 小さじ: 6 } }),
    F("sato",       "砂糖",              "chomi",  391, 0.0, 0.0, 99.3, { units: { 大さじ: 9, 小さじ: 3 } }),
    F("mirin",      "みりん",            "chomi",  241, 0.3, 0.0, 43.2, { units: { 大さじ: 18, 小さじ: 6 } }),
    F("sake-chomi", "料理酒",            "chomi",  109, 0.4, 0.0, 4.9, { units: { 大さじ: 15, 小さじ: 5 } }),
    F("su",         "酢",                "chomi",   37, 0.1, 0.0, 2.4, { units: { 大さじ: 15, 小さじ: 5 } }),
    F("dressing",   "ドレッシング（和風）", "chomi", 179, 3.1, 14.5, 9.0, { units: { 大さじ: 15 } }),
    F("men-tsuyu",  "めんつゆ（ストレート）", "chomi", 44, 2.2, 0.0, 8.7),
    F("curry-roux", "カレールウ",        "chomi",  474, 6.5, 34.1, 44.7, { units: { 皿: 20 } }),

    /* ---------------- 飲みもの ---------------- */
    F("mizu",       "水",                "nomi",     0, 0.0, 0.0, 0.0, { ml: 1.0, units: { 杯: 200 } }),
    F("ocha",       "お茶",              "nomi",     0, 0.0, 0.0, 0.1, { ml: 1.0, units: { 杯: 200 } }),
    F("coffee",     "コーヒー（無糖）",  "nomi",     4, 0.2, 0.0, 0.7, { ml: 1.0, units: { 杯: 150 } }),
    F("cafe-latte", "カフェラテ",        "nomi",    38, 2.1, 2.3, 3.0, { ml: 1.02, units: { 杯: 200 } }),
    F("orange-j",   "オレンジジュース",  "nomi",    42, 0.7, 0.1, 10.7, { ml: 1.04, units: { 杯: 200 } }),
    F("cola",       "コーラ",            "nomi",    46, 0.1, 0.0, 11.4, { ml: 1.04, units: { 本: 500, 杯: 200 } }),
    F("sports-d",   "スポーツドリンク",  "nomi",    21, 0.0, 0.0, 5.1, { ml: 1.02, units: { 本: 500 } }),
    F("beer",       "ビール",            "nomi",    39, 0.3, 0.0, 3.1, { ml: 1.01, units: { 本: 350, 缶: 350, 杯: 350 } }),
    F("highball",   "ハイボール",        "nomi",    50, 0.0, 0.0, 0.0, { ml: 1.0, units: { 缶: 350, 杯: 350 } }),
    F("chuhai",     "チューハイ",        "nomi",    51, 0.0, 0.0, 3.4, { ml: 1.01, units: { 缶: 350 } }),
    F("nihonshu",   "日本酒",            "nomi",   107, 0.4, 0.0, 4.9, { ml: 1.0, units: { 合: 180, 杯: 180 } }),
    F("wine-red",   "赤ワイン",          "nomi",    68, 0.2, 0.0, 1.5, { ml: 0.99, units: { 杯: 120 } }),
    F("shochu",     "焼酎",              "nomi",   146, 0.0, 0.0, 0.0, { ml: 0.97, units: { 杯: 100 } }),
    F("whisky",     "ウイスキー",        "nomi",   234, 0.0, 0.0, 0.0, { ml: 0.95, units: { 杯: 30 } }),

    /* ---------------- おかず・料理 ---------------- */
    F("misoshiru",  "みそ汁",            "ryori",   36, 2.2, 1.2, 4.2, { ml: 1.0, units: { 杯: 200, 椀: 200 } }),
    F("karaage",    "からあげ",          "ryori",  290, 16.6, 18.1, 13.3, { units: { 個: 25 } }),
    F("tonkatsu",   "とんかつ",          "ryori",  429, 22.0, 30.0, 14.4, { units: { 枚: 130 } }),
    F("korokke",    "コロッケ",          "ryori",  226, 5.3, 12.6, 23.6, { units: { 個: 70 } }),
    F("gyoza",      "餃子",              "ryori",  209, 6.9, 11.3, 21.0, { units: { 個: 25 } }),
    F("hamburg",    "ハンバーグ",        "ryori",  223, 13.4, 13.4, 11.2, { units: { 個: 120 } }),
    F("omuretsu",   "オムレツ",          "ryori",  186, 10.4, 14.6, 1.4),
    F("tamagoyaki", "卵焼き",            "ryori",  146, 10.5, 9.2, 4.8, { units: { 切れ: 30 } }),
    F("curry-rice", "カレーライス",      "ryori",  130, 3.4, 3.8, 20.5, { units: { 皿: 450 } }),
    F("gyudon",     "牛丼",              "ryori",  148, 5.6, 4.7, 20.7, { units: { 杯: 400 } }),
    F("ramen",      "ラーメン（醤油）",  "ryori",   57, 2.6, 1.5, 8.4, { units: { 杯: 700 } }),
    F("yakisoba",   "焼きそば",          "ryori",  185, 5.1, 6.1, 27.0, { units: { 皿: 250 } }),
    F("chahan",     "チャーハン",        "ryori",  188, 4.8, 6.6, 26.6, { units: { 皿: 300 } }),
    F("onigiri",    "おにぎり",          "ryori",  170, 3.1, 0.5, 37.4, { units: { 個: 110 } }),
    F("sandwich",   "サンドイッチ",      "ryori",  230, 9.0, 10.4, 25.0, { units: { 個: 150 } }),
    F("pizza",      "ピザ",              "ryori",  268, 11.0, 11.0, 30.5, { units: { 枚: 100, 切れ: 100 } }),
    F("salad",      "サラダ（野菜のみ）", "ryori",   18, 0.9, 0.1, 3.8, { units: { 皿: 100 } }),
    F("nikujaga",   "肉じゃが",          "ryori",  103, 4.3, 3.4, 13.6, { units: { 皿: 200 } }),
    F("gratin",     "グラタン",          "ryori",  128, 5.3, 6.4, 12.1, { units: { 皿: 250 } }),
    F("stew",       "シチュー",          "ryori",   93, 4.0, 4.6, 8.8, { units: { 皿: 250 } }),
    F("oden",       "おでん",            "ryori",   70, 6.0, 2.5, 6.0, { units: { 皿: 300 } }),
    F("sushi",      "にぎり寿司",        "ryori",  145, 8.0, 1.0, 25.0, { units: { 貫: 25, 個: 25 } }),

    /* ---------------- 間食 ---------------- */
    F("chocolate",  "チョコレート",      "kanshoku", 550, 6.9, 34.1, 55.8, { units: { 枚: 50, 個: 5 } }),
    F("potato-chip", "ポテトチップス",   "kanshoku", 541, 4.7, 35.2, 54.7, { units: { 袋: 60 } }),
    F("senbei",     "せんべい",          "kanshoku", 373, 7.3, 1.0, 83.1, { units: { 枚: 20 } }),
    F("cookie",     "クッキー",          "kanshoku", 512, 5.4, 27.6, 62.0, { units: { 枚: 10 } }),
    F("shortcake",  "ショートケーキ",    "kanshoku", 314, 4.4, 14.7, 41.7, { units: { 個: 110 } }),
    F("purin",      "プリン",            "kanshoku", 116, 5.5, 5.5, 14.0, { units: { 個: 100 } }),
    F("ice",        "アイスクリーム",    "kanshoku", 178, 3.9, 8.0, 23.2, { units: { 個: 100 } }),
    F("donut",      "ドーナツ",          "kanshoku", 375, 7.2, 20.4, 42.0, { units: { 個: 60 } }),
    F("anpan",      "あんぱん",          "kanshoku", 253, 6.8, 3.6, 50.2, { units: { 個: 100 } }),
    F("melonpan",   "メロンパン",        "kanshoku", 349, 8.0, 10.5, 56.2, { units: { 個: 90 } }),
    F("daifuku",    "大福",              "kanshoku", 223, 4.6, 0.5, 50.3, { units: { 個: 70 } }),
    F("wagashi",    "どら焼き",          "kanshoku", 292, 6.6, 3.2, 59.9, { units: { 個: 70 } }),
    F("nuts",       "ミックスナッツ",    "kanshoku", 607, 20.0, 52.0, 20.0, { units: { 袋: 25 } }),
    F("almond",     "アーモンド",        "kanshoku", 609, 19.6, 51.8, 20.9, { units: { 個: 1 } }),
    F("protein-bar", "プロテインバー",   "kanshoku", 400, 20.0, 18.0, 40.0, { units: { 本: 40 } }),
    F("protein",    "プロテイン（粉）",  "kanshoku", 380, 75.0, 5.0, 8.0, { units: { 杯: 30, 回: 30 } }),
  ];

  /* 呼び名。表の名前で書く人はいないので——「鶏むね」「ごはん」「たまご」で
     引けないと、この機能は最初の一行で見放されます。 */
  const ALIASES = {
    "f-gohan": ["ごはん", "白米", "米", "ライス", "ご飯茶碗"],
    "f-gohan-genmai": ["玄米"],
    "f-shokupan": ["パン", "トースト", "食パン6枚切り"],
    "f-toriMuneNP": ["鶏むね", "とりむね", "鶏胸肉", "むね肉", "鶏むね肉"],
    "f-toriMomo": ["鶏もも", "とりもも", "もも肉", "鶏もも肉"],
    "f-sasami": ["鶏ささみ", "ササミ"],
    "f-butaBara": ["豚バラ", "バラ肉"],
    "f-butaRosu": ["豚ロース", "豚肉"],
    "f-butaHiki": ["豚挽き肉", "豚ミンチ"],
    "f-gyuHiki": ["牛挽き肉", "牛ミンチ"],
    "f-aibiki": ["合挽き肉", "合いびき", "ひき肉", "挽き肉", "ミンチ"],
    "f-tamago": ["たまご", "玉子", "鶏卵", "生卵", "ゆで卵"],
    "f-gyunyu": ["ミルク", "牛乳コップ"],
    "f-natto": ["なっとう"],
    "f-momen": ["豆腐", "とうふ"],
    "f-sake": ["さけ", "しゃけ", "サーモン", "焼き鮭", "塩鮭"],
    "f-maguro": ["まぐろ", "マグロ", "刺身"],
    "f-yogurt": ["ヨーグルト"],
    "f-cheese": ["チーズ", "スライスチーズ"],
    "f-banana": ["ばなな"],
    "f-jagaimo": ["ジャガイモ", "馬鈴薯", "ポテト"],
    "f-tamanegi": ["たまねぎ", "オニオン"],
    "f-ninjin": ["人参", "にんじん"],
    "f-cabbage": ["きゃべつ"],
    "f-misoshiru": ["味噌汁", "みそしる", "お味噌汁"],
    "f-karaage": ["唐揚げ", "から揚げ", "鶏の唐揚げ"],
    "f-ramen": ["らーめん", "中華そば"],
    "f-curry-rice": ["カレー"],
    "f-udon": ["うどん"],
    "f-soba": ["そば", "蕎麦"],
    "f-pasta": ["パスタ", "スパゲティ"],
    "f-ramen-inst": ["カップ麺", "インスタントラーメン", "袋麺"],
    "f-onigiri": ["おむすび", "塩むすび"],
    "f-beer": ["ビール缶", "生ビール"],
    "f-salad": ["サラダ", "野菜サラダ"],
    "f-protein": ["プロテイン", "ホエイプロテイン"],
    "f-sasami-jerky": ["サラダチキン"],
    "f-abura": ["油", "サラダ油", "炒め油"],
  };

  const CATS = {
    shushoku: "主食",  niku: "肉",       sakana: "魚",     tamago: "卵",
    mame: "豆・大豆",  nyu: "乳製品",    yasai: "野菜",    kudamono: "くだもの",
    chomi: "調味料",   nomi: "飲みもの", ryori: "料理",    kanshoku: "間食",
  };

  /* ---------------- 引き当て ---------------- */

  const byId = new Map(FOODS.map((f) => [f.id, f]));
  const index = new Map();   // 畳んだ呼び名 → 食品

  function put(key, food) {
    const k = foldKana(String(key || "").trim());
    if (!k) return;
    // 先に入れたほうが勝ち。表の名前 → 別名の順に入れるので、
    // 「豆腐」で引いたときに油揚げが出てくるようなことにはなりません。
    if (!index.has(k)) index.set(k, food);
  }

  FOODS.forEach((f) => {
    put(f.name, f);
    // 「ご飯（150g）」のような括弧書きは、括弧の前だけでも引けるように
    const bare = f.name.replace(/[（(].*$/, "").trim();
    if (bare && bare !== f.name) put(bare, f);
  });
  Object.keys(ALIASES).forEach((id) => {
    const f = byId.get(id);
    if (f) ALIASES[id].forEach((a) => put(a, f));
  });

  /** 名前から基本食品を引く。ユーザーの食品は store 側で先に見ます。 */
  function lookup(name) {
    const k = foldKana(String(name || "").trim());
    if (!k) return null;
    if (index.has(k)) return index.get(k);
    /* 完全一致で駄目なら、いちばん長く一致する見出しを探します。
       「鶏むね肉のソテー」→「鶏むね肉」。短い見出しから先に当たると
       「肉」で何にでも当たってしまうので、長いものから。 */
    let best = null;
    index.forEach((food, key) => {
      if (key.length < 2) return;
      if (k.includes(key) && (!best || key.length > best.key.length)) best = { key, food };
    });
    return best ? best.food : null;
  }

  /** 探すための一覧（前方一致を先、部分一致を後）。 */
  function search(query, limit) {
    const k = foldKana(String(query || "").trim());
    if (!k) return FOODS.slice(0, limit || 20);
    const head = [], mid = [];
    FOODS.forEach((f) => {
      const keys = [f.name].concat(ALIASES[f.id] || []).map(foldKana);
      if (keys.some((x) => x.startsWith(k))) head.push(f);
      else if (keys.some((x) => x.includes(k))) mid.push(f);
    });
    return head.concat(mid).slice(0, limit || 20);
  }

  /* ---------------- 一行の読み取り ---------------- */

  const UNIT_WORDS = [
    "g", "ｇ", "グラム", "kg", "ml", "ｍｌ", "cc", "l", "リットル",
    "個", "こ", "枚", "本", "杯", "膳", "椀", "皿", "袋", "缶", "パック",
    "切れ", "切", "丁", "尾", "玉", "束", "貫", "合", "回", "大さじ", "小さじ", "カップ",
  ];

  const NUM = "(\\d+(?:[.．]\\d+)?|[０-９]+(?:[.．][０-９]+)?|半|[一二三四五六七八九十]+)";

  function toNumber(raw) {
    const s = String(raw).replace(/[０-９]/g, (c) => "0123456789"[c.charCodeAt(0) - 0xff10])
      .replace(/．/g, ".");
    if (s === "半") return 0.5;
    if (/^\d/.test(s)) return parseFloat(s);
    const KAN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (s === "十") return 10;
    if (/^十./.test(s)) return 10 + (KAN[s[1]] || 0);
    if (/^.十$/.test(s)) return (KAN[s[0]] || 0) * 10;
    if (/^.十.$/.test(s)) return (KAN[s[0]] || 0) * 10 + (KAN[s[2]] || 0);
    return KAN[s] || null;
  }

  const UNIT_RE = new RegExp(
    "^(.*?)\\s*" + NUM + "\\s*(" + UNIT_WORDS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\s*$"
  );
  /* 「大さじ1」のように、数のほうが後ろに来る書き方も通します。 */
  const UNIT_RE_PRE = new RegExp(
    "^(.*?)\\s*(大さじ|小さじ|カップ)\\s*" + NUM + "\\s*$"
  );

  /**
   * 「ご飯150g」「卵2個」「オリーブオイル大さじ1」を、名前と量に割ります。
   * 量が書いていなければ qty は null——そのときは 1食ぶんの目安を当てます。
   */
  function parseLine(text) {
    const line = String(text || "").trim().replace(/[、,]\s*$/, "");
    if (!line) return null;

    let m = UNIT_RE_PRE.exec(line);
    if (m) return { name: m[1].trim(), qty: toNumber(m[3]), unit: m[2] };

    m = UNIT_RE.exec(line);
    if (m) return { name: m[1].trim(), qty: toNumber(m[2]), unit: normalizeUnit(m[3]) };

    // 単位なしの数だけ（「卵2」）は「個」とみなします。
    m = new RegExp("^(.*?)\\s*" + NUM + "\\s*$").exec(line);
    if (m && m[1].trim()) return { name: m[1].trim(), qty: toNumber(m[2]), unit: "個" };

    return { name: line, qty: null, unit: null };
  }

  function normalizeUnit(u) {
    const map = { "ｇ": "g", "グラム": "g", "ｍｌ": "ml", "cc": "ml", "リットル": "l", "こ": "個", "切": "切れ" };
    return map[u] || u;
  }

  /**
   * その食品を qty×unit だけ食べたときのグラム数。
   * 引けなければ null——分からないものを 100g と決めつけると、
   * 一日の合計がしずかに嘘になります。
   */
  function gramsOf(food, qty, unit) {
    if (!food) return null;
    if (qty == null) return defaultServing(food);
    switch (unit) {
      case "g":  return qty;
      case "kg": return qty * 1000;
      case "ml": return qty * (food.ml || 1);
      case "l":  return qty * 1000 * (food.ml || 1);
      default: break;
    }
    const units = food.units || {};
    if (unit && units[unit] != null) return qty * units[unit];
    // 単位は書いてあるが、この食品はその数え方を知らない
    if (unit) return null;
    return qty * (defaultServing(food) || 100);
  }

  /** 量を書かなかったときの一食ぶん。数えられるものは1つぶん、あとは100g。 */
  function defaultServing(food) {
    const units = food.units || {};
    const order = ["杯", "膳", "個", "枚", "本", "パック", "丁", "切れ", "袋", "皿", "缶", "尾", "玉", "束", "椀", "貫"];
    for (const u of order) if (units[u] != null) return units[u];
    return 100;
  }

  /** 100gあたりの値 → grams ぶんの値。 */
  function nutrientsOf(food, grams) {
    const r = (grams || 0) / 100;
    return {
      kcal: Math.round(food.kcal * r),
      p: Math.round(food.p * r * 10) / 10,
      f: Math.round(food.f * r * 10) / 10,
      c: Math.round(food.c * r * 10) / 10,
    };
  }

  KN.foodData = {
    FOODS, CATS, byId: (id) => byId.get(id) || null,
    lookup, search, parseLine, gramsOf, defaultServing, nutrientsOf, normalizeUnit,
    /** 表そのものの出どころ。画面にもこの一文を出します。 */
    SOURCE: "日本食品標準成分表2020年版（八訂）をもとにした概数",
  };
})();
