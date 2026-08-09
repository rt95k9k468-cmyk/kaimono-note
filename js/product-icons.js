/* =========================================================
   かいものノート — drawn product icons

   Emoji cover food well and household goods badly. There is no 洗剤 emoji, so
   洗剤・柔軟剤・漂白剤・シャンプー・ボディソープ・化粧水 all landed on 🧴,
   the lotion bottle — six different things, one picture, which is no better
   than no picture. Likewise トイレットペーパー・ティッシュ・キッチンペーパー
   all landed on 🧻.

   These are drawn instead: flat shapes on the same 24×24 grid, sized and
   coloured to sit beside emoji rather than fight them. They ship inside the
   app, so they cost nothing and work with no signal — same as the emoji they
   sit next to. Silhouette carries the meaning at 19px, colour only separates
   things that genuinely are the same shape (a softener jug really does look
   like a detergent jug).
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* Squeeze bottle, pump bottle, jug, tube, box, roll — the silhouettes are
     what tell them apart. Each is a whole <svg> so a caller can drop it
     straight in where an emoji would have gone. */
  const S = (body) =>
    `<svg class="p-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;

  /** A jug with a handle — the laundry-detergent silhouette, in any colour. */
  const jug = (light, dark, label) => S(`
    <rect x="5.2" y="3.4" width="5.4" height="3.8" rx="1.2" fill="${dark}"/>
    <path d="M4 9.6A2.6 2.6 0 0 1 6.6 7h9.8A2.6 2.6 0 0 1 19 9.6v9.8A2.6 2.6 0 0 1 16.4 22H6.6A2.6 2.6 0 0 1 4 19.4z" fill="${light}"/>
    <path d="M19 11.6h1.2a3.2 3.2 0 0 1 0 6.4H19v-2h1.2a1.2 1.2 0 0 0 0-2.4H19z" fill="${light}"/>
    <rect x="6.2" y="12.6" width="9" height="6" rx="1.2" fill="#ffffff" opacity=".92"/>
    ${label || ""}
  `);

  /** A tube with a cap — toothpaste, face wash, sunscreen. */
  const tube = (light, dark, mark) => S(`
    <rect x="10.2" y="2" width="3.6" height="2.8" rx="1" fill="${dark}"/>
    <rect x="10.9" y="4.6" width="2.2" height="1.6" fill="${dark}"/>
    <path d="M9.1 6.1h5.8l1.4 12.7a2.3 2.3 0 0 1-2.3 2.5H10a2.3 2.3 0 0 1-2.3-2.5z" fill="${light}"/>
    <path d="M8.4 12.4h7.2l.3 2.8H8.1z" fill="#ffffff" opacity=".9"/>
    ${mark || ""}
  `);

  /** A pump bottle — shampoo and everything shaped like it. */
  const pump = (light, dark) => S(`
    <rect x="8.2" y="2.9" width="4.8" height="1.9" rx=".95" fill="${dark}"/>
    <rect x="11.4" y="4.4" width="1.9" height="2.8" fill="${dark}"/>
    <path d="M6.8 10.5c0-1.7 1-3.2 2.5-3.9h5.4c1.5.7 2.5 2.2 2.5 3.9V20a2 2 0 0 1-2 2H8.8a2 2 0 0 1-2-2z" fill="${light}"/>
    <rect x="8.4" y="12.2" width="7.2" height="5.6" rx="1" fill="#ffffff" opacity=".92"/>
  `);

  /** A squat bottle — toner, milky lotion. */
  const flask = (light, dark) => S(`
    <rect x="9.6" y="2.6" width="4.8" height="3" rx="1" fill="${dark}"/>
    <rect x="10.7" y="5.4" width="2.6" height="1.7" fill="${dark}"/>
    <rect x="6.4" y="7" width="11.2" height="15" rx="2.6" fill="${light}"/>
    <rect x="8" y="12" width="8" height="5.6" rx="1" fill="#ffffff" opacity=".9"/>
  `);

  /** A flat carton with a cutting edge — cling film, foil, baking paper. */
  const carton = (light, dark) => S(`
    <rect x="3" y="7" width="18" height="9.4" rx="1.8" fill="${light}"/>
    <path d="M4.8 7h14.4A1.8 1.8 0 0 1 21 8.8v1.9H3V8.8A1.8 1.8 0 0 1 4.8 7z" fill="${dark}" opacity=".5"/>
    <path d="M3 16.4l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5l0.75 1.5l0.75 -1.5Z" fill="${dark}"/>
  `);

  const PAPER      = "#cbdde8";
  const PAPER_LITE = "#e9f2f7";
  const PAPER_DARK = "#9dbccd";

  const ICONS = {
    /* --- 洗剤まわり --- */
    dishSoap: S(`
      <rect x="9.8" y="2" width="4.4" height="2.7" rx=".9" fill="#3f9440"/>
      <rect x="10.7" y="4.5" width="2.6" height="2" fill="#5cb85c"/>
      <path d="M7 10.6c0-2 1.1-3.7 2.9-4.5h4.2c1.8.8 2.9 2.5 2.9 4.5V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#5cb85c"/>
      <rect x="8.7" y="12.2" width="6.6" height="5.4" rx="1" fill="#ffffff" opacity=".92"/>
      <circle cx="19.6" cy="5.4" r="1.9" fill="#a9dcf3"/>
      <circle cx="21" cy="9.6" r="1.1" fill="#a9dcf3"/>
    `),
    laundry:  jug("#4a90d9", "#2f6fb0"),
    softener: jug("#ec7fa4", "#c85a80",
      `<circle cx="10.7" cy="15.6" r="1.5" fill="#ec7fa4"/>
       <circle cx="10.7" cy="12.9" r="1.15" fill="#f7b3cb"/>
       <circle cx="13" cy="14.2" r="1.15" fill="#f7b3cb"/>
       <circle cx="12.1" cy="17.1" r="1.15" fill="#f7b3cb"/>
       <circle cx="9.3" cy="17.1" r="1.15" fill="#f7b3cb"/>
       <circle cx="8.4" cy="14.2" r="1.15" fill="#f7b3cb"/>`),
    bleach:   jug("#8fc4e8", "#5d9ac4",
      `<path d="M10.7 13.4c1.4 1.6 2.1 2.7 2.1 3.5a2.1 2.1 0 0 1-4.2 0c0-.8.7-1.9 2.1-3.5z" fill="#4a90d9"/>
       <path d="M13.9 15.9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="#4a90d9"/>`),

    /* --- 体を洗うもの --- */
    shampoo:   pump("#2fb3a6", "#1d8d82"),
    rinse:     pump("#9b7ede", "#7457b8"),
    bodySoap:  pump("#f0913f", "#c9701f"),
    handSoap:  pump("#4a90d9", "#2f6fb0"),
    soapBar: S(`
      <rect x="2.8" y="9.6" width="15" height="9.2" rx="2.8" fill="#f0cfdd"/>
      <path d="M5.6 9.6h9.4a2.8 2.8 0 0 1 2.8 2.8H2.8a2.8 2.8 0 0 1 2.8-2.8z" fill="#ffffff" opacity=".75"/>
      <circle cx="19.6" cy="7.4" r="2.1" fill="#bfe4f2"/>
      <circle cx="16.4" cy="4.6" r="1.35" fill="#bfe4f2"/>
      <circle cx="21.4" cy="11.9" r="1.15" fill="#bfe4f2"/>
    `),

    /* --- チューブもの --- */
    toothpaste: tube("#63b8e0", "#3d8fba",
      `<rect x="8.2" y="15.2" width="7.6" height="1.5" fill="#e0574d" opacity=".85"/>`),
    faceWash:   tube("#7cc47f", "#4d9b52"),
    sunscreen:  tube("#f2c14e", "#d7a12d",
      `<circle cx="12" cy="18.4" r="1.9" fill="#ef8f4a"/>`),

    /* --- 紙もの --- */
    toiletRoll: S(`
      <rect x="4.6" y="7.2" width="14.8" height="12.6" rx="3.2" fill="${PAPER}"/>
      <ellipse cx="12" cy="7.4" rx="7.4" ry="2.7" fill="${PAPER_LITE}"/>
      <ellipse cx="12" cy="7.4" rx="2.6" ry=".95" fill="#d3a86e"/>
      <path d="M19.4 12.4c1.5.4 2.4 1.2 2.4 2.1v5.1a1.2 1.2 0 0 1-2.4 0z" fill="${PAPER_LITE}"/>
      <path d="M19.4 12.4c1.5.4 2.4 1.2 2.4 2.1H19.4z" fill="${PAPER_DARK}" opacity=".5"/>
    `),
    tissue: S(`
      <path d="M9.6 4.4h4.8l-.6 4.8H10.2z" fill="${PAPER_LITE}"/>
      <path d="M9.6 4.4h4.8l-.15 1.2h-4.5z" fill="${PAPER_DARK}" opacity=".45"/>
      <rect x="3.2" y="8.8" width="17.6" height="11" rx="2.4" fill="#6fb1d8"/>
      <ellipse cx="12" cy="10.2" rx="4.6" ry="1.35" fill="#3c7fa8"/>
      <rect x="3.2" y="15" width="17.6" height="2.2" fill="#5aa0cb"/>
    `),
    kitchenRoll: S(`
      <rect x="6.6" y="3.6" width="10.8" height="16.8" rx="2.6" fill="${PAPER}"/>
      <rect x="6.6" y="12.4" width="10.8" height="2.4" fill="#6fb1d8"/>
      <ellipse cx="12" cy="3.9" rx="5.4" ry="2" fill="${PAPER_LITE}"/>
      <ellipse cx="12" cy="3.9" rx="1.9" ry=".7" fill="#d3a86e"/>
      <path d="M17.4 13.4c1.5.4 2.4 1.2 2.4 2.1v4.2a1.2 1.2 0 0 1-2.4 0z" fill="${PAPER_LITE}"/>
    `),

    /* --- 台所と掃除 --- */
    wrap: carton("#ef8f4a", "#c9701f"),
    foil: carton("#b8c3c9", "#8b989f"),
    sponge: S(`
      <rect x="3" y="9.2" width="18" height="9.6" rx="2.2" fill="#f2c14e"/>
      <path d="M5.2 9.2h13.6A2.2 2.2 0 0 1 21 11.4v1.3H3v-1.3a2.2 2.2 0 0 1 2.2-2.2z" fill="#5cb85c"/>
      <circle cx="7.4" cy="15.6" r="1.05" fill="#d7a12d"/>
      <circle cx="12" cy="16.6" r=".85" fill="#d7a12d"/>
      <circle cx="16.5" cy="15.2" r="1" fill="#d7a12d"/>
    `),
    trashBag: S(`
      <circle cx="12" cy="5.4" r="1.7" fill="#6d7a72"/>
      <path d="M9.2 7.2C7.8 6.2 8.1 4.4 9.7 4c.7-.2 1.3 0 1.7.6M14.8 7.2c1.4-1 1.1-2.8-.5-3.2-.7-.2-1.3 0-1.7.6"
            stroke="#6d7a72" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.6 7.4h6.8l1.9 11.3a2.6 2.6 0 0 1-2.6 3H9.3a2.6 2.6 0 0 1-2.6-3z" fill="#5a655e"/>
      <path d="M10.4 10.6l-.9 8.4" stroke="#7d8a83" stroke-width="1.2" stroke-linecap="round"/>
    `),

    /* --- 身につけるもの --- */
    mask: S(`
      <path d="M4.9 9.2 2.4 7.4M19.1 9.2l2.5-1.8" stroke="#8d968f" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M4.6 8.6h14.8v4.6c0 3.4-3.3 6.2-7.4 6.2s-7.4-2.8-7.4-6.2z" fill="#dcebf4"/>
      <path d="M4.6 11.4h14.8M4.9 14.2h14.2" stroke="#a9c9dc" stroke-width="1.3" stroke-linecap="round"/>
    `),
    toner: flask("#ec7fa4", "#c85a80"),
    milkyLotion: flask("#e9dcc8", "#c4b193"),
  };

  /* Keywords, folded, longest first — the same rule the emoji table uses, so
     「洗濯洗剤」 beats 「洗剤」 and 「食器用洗剤」 beats both. */
  const KEYS = [
    ["dishSoap",   ["食器用洗剤", "台所用洗剤", "食器洗剤", "洗剤", "じょいー", "きゅきゅっと"]],
    ["laundry",    ["洗濯洗剤", "洗たく洗剤", "衣料用洗剤", "洗濯用洗剤", "あたっく", "あり-る"]],
    ["softener",   ["柔軟剤", "じゅうなんざい", "そふらん", "はみんぐ"]],
    ["bleach",     ["漂白剤", "ひょうはくざい", "はいたー", "きっちんはいたー", "わいどはいたー"]],

    ["shampoo",    ["しゃんぷー"]],
    ["rinse",      ["りんす", "こんでぃしょなー", "とりーとめんと"]],
    ["bodySoap",   ["ぼでぃそーぷ", "ぼでぃーそーぷ"]],
    ["handSoap",   ["はんどそーぷ", "除菌ジェル", "消毒液"]],
    ["soapBar",    ["石鹸", "石けん", "せっけん", "固形石鹸"]],

    ["toothpaste", ["歯磨き粉", "歯みがき粉", "はみがき粉", "歯磨き", "はみがき"]],
    ["faceWash",   ["洗顔", "せんがん", "洗顔フォーム", "くれんじんぐ"]],
    ["sunscreen",  ["日焼け止め", "ひやけどめ", "日やけ止め"]],

    ["toiletRoll",  ["といれっとぺーぱー", "トイレットペーパー", "トイレぺーぱー", "トイレ紙"]],
    ["tissue",      ["てぃっしゅ", "ぼっくすてぃっしゅ", "はなかみ", "鼻紙"]],
    ["kitchenRoll", ["きっちんぺーぱー", "きっちんたおる", "ぺーぱーたおる"]],

    ["wrap",     ["らっぷ", "さらんらっぷ", "くれらっぷ", "くっきんぐしーと", "くっきんぐぺーぱー"]],
    ["foil",     ["あるみほいる", "ほいる", "あるみはく"]],
    ["sponge",   ["すぽんじ", "たわし", "食器用すぽんじ"]],
    ["trashBag", ["ごみ袋", "ゴミ袋", "ごみぶくろ", "ぽりぶくろ", "ぽり袋"]],

    ["mask",        ["ますく", "ふどうふますく", "不織布マスク"]],
    ["toner",       ["化粧水", "けしょうすい", "ろーしょん"]],
    ["milkyLotion", ["乳液", "にゅうえき", "くりーむ", "はんどくりーむ"]],
  ];

  const FLAT = KEYS
    .flatMap(([name, words]) => words.map((w) => [KN.util.foldKana(w), name]))
    .sort((a, b) => b[0].length - a[0].length);

  /** Drawn icon for a product name, as raw SVG — or "" when none fits. */
  function find(name) {
    const n = KN.util.foldKana(String(name || ""));
    if (!n) return "";
    for (const [key, icon] of FLAT) if (n.includes(key)) return ICONS[icon];
    return "";
  }

  KN.productIcons = { find, ICONS };
})();
