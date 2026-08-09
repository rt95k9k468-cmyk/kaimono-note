/* =========================================================
   かいものノート — drawn product icons

   Every product mark in the app is drawn here. Emoji were the starting point
   and they were good at food and bad at everything else: there is no 洗剤
   emoji, so 洗剤・柔軟剤・漂白剤・シャンプー・ボディソープ・化粧水 all landed
   on 🧴, and トイレットペーパー・ティッシュ・キッチンペーパー all landed on
   🧻. Six things, one picture. Drawing them fixed that corner and left the
   list half emoji and half vector, which looked exactly like what it was.

   So the whole set is drawn now. It costs nothing at runtime — the shapes ship
   inside the app and need no network — and it is no longer limited to what
   Apple happens to have shipped a glyph for: 洗濯洗剤 can be a different
   picture from 食器用洗剤 because someone drew both.

   How they are built
   ------------------
   Everything sits on the same 24×24 grid, in flat fills with no strokes, and
   keeps its ink inside roughly x,y ∈ [2, 22] so a row of them lines up.
   Silhouette carries the meaning at 19px; colour only separates things that
   genuinely are the same shape (a softener jug really does look like a
   detergent jug). Most icons are one call to a shared silhouette below —
   bottle, jug, tube, can, carton, bowl, bag, box, round — which is what keeps
   seventy-odd of them consistent with each other and short enough to read.
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const S = (body) =>
    `<svg class="p-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;

  /* A soft highlight, used on anything rounded so it does not read as a flat
     disc. Always the same place, so the light in the set comes from one side. */
  const SHINE = '<ellipse cx="9.2" cy="10.6" rx="2.3" ry="1.5" fill="#ffffff" opacity=".3" transform="rotate(-32 9.2 10.6)"/>';

  const LEAF = '<path d="M12.6 6.4c.6-1.9 2-2.9 4.2-3-.2 2.2-1.5 3.3-4.2 3z" fill="#5f9c46"/>';
  const STALK = '<rect x="11.2" y="3.6" width="1.6" height="3.4" rx=".8" fill="#7a5a3a"/>';

  /* ---------------- silhouettes ---------------- */

  /** A round fruit or vegetable. */
  const round = (fill, top) => S(`
    <circle cx="12" cy="13.8" r="7.9" fill="${fill}"/>
    ${SHINE}
    ${top || ""}
  `);

  /** A jug with a handle — the laundry-detergent shape. */
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
  const cutBox = (light, dark) => S(`
    <rect x="3" y="7" width="18" height="9.4" rx="1.8" fill="${light}"/>
    <path d="M4.8 7h14.4A1.8 1.8 0 0 1 21 8.8v1.9H3V8.8A1.8 1.8 0 0 1 4.8 7z" fill="${dark}" opacity=".5"/>
    <path d="M3 16.4l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5l.75 1.5l.75 -1.5Z" fill="${dark}"/>
  `);

  /** A drinks bottle: shoulders, a neck and a cap. */
  const bottle = (light, dark, label) => S(`
    <rect x="10" y="2" width="4" height="2.6" rx=".7" fill="${dark}"/>
    <path d="M10.2 4.6h3.6v2.1c1.9 1 3 2.7 3 4.7V19.6A2.4 2.4 0 0 1 14.4 22H9.6a2.4 2.4 0 0 1-2.4-2.4V11.4c0-2 1.1-3.7 3-4.7z" fill="${light}"/>
    <rect x="7.6" y="12.6" width="8.8" height="5" rx=".8" fill="#ffffff" opacity="${label === false ? "0" : ".85"}"/>
  `);

  /** A drinks can, with a tab. */
  const can = (light, dark, band) => S(`
    <rect x="6.6" y="3" width="10.8" height="18" rx="2.2" fill="${light}"/>
    <path d="M8.8 3h6.4A2.2 2.2 0 0 1 17.4 5.2v.6H6.6v-.6A2.2 2.2 0 0 1 8.8 3z" fill="${dark}"/>
    <rect x="6.6" y="10.2" width="10.8" height="4.4" fill="${band || dark}" opacity=".85"/>
  `);

  /** A gable-top carton — milk, juice. */
  const carton = (light, dark, band) => S(`
    <path d="M12 2.2 18.4 6v13.4A2.6 2.6 0 0 1 15.8 22H8.2a2.6 2.6 0 0 1-2.6-2.6V6z" fill="${light}"/>
    <path d="M12 2.2 18.4 6H5.6z" fill="${dark}"/>
    <rect x="5.6" y="12" width="12.8" height="4.4" fill="${band || dark}" opacity=".8"/>
  `);

  /** A bowl of something hot. */
  const bowl = (fill, inside) => S(`
    ${inside || ""}
    <path d="M3 12.4h18c0 4.6-3.1 7.8-7.2 7.8h-3.6C6.1 20.2 3 17 3 12.4z" fill="${fill}"/>
    <rect x="2.2" y="11" width="19.6" height="2.4" rx="1.2" fill="${fill}"/>
    <path d="M4.6 15.4h14.8c-.9 2.2-2.8 3.6-5.6 3.6h-3.6c-2.8 0-4.7-1.4-5.6-3.6z" fill="#ffffff" opacity=".18"/>
  `);

  /** A paper bag, folded at the top. */
  const bag = (light, dark, mark) => S(`
    <path d="M5.4 7.4h13.2v11.8A2.8 2.8 0 0 1 15.8 22H8.2a2.8 2.8 0 0 1-2.8-2.8z" fill="${light}"/>
    <path d="M5.4 7.4 7 4.2h10l1.6 3.2z" fill="${dark}"/>
    ${mark || ""}
  `);

  /** A cardboard box, seen straight on. */
  const box = (light, dark, mark) => S(`
    <rect x="3.4" y="5.6" width="17.2" height="14.4" rx="2" fill="${light}"/>
    <rect x="3.4" y="5.6" width="17.2" height="4" rx="2" fill="${dark}"/>
    ${mark || ""}
  `);

  /** A stubby jar with a screw lid. */
  const jar = (light, lid, mark) => S(`
    <rect x="7.4" y="2.8" width="9.2" height="3.4" rx="1.1" fill="${lid}"/>
    <rect x="5.8" y="6" width="12.4" height="15.6" rx="2.6" fill="${light}"/>
    <rect x="7.4" y="11" width="9.2" height="6" rx="1" fill="#ffffff" opacity=".85"/>
    ${mark || ""}
  `);

  /** A tinned can, lying with its lid towards you. */
  const tin = (light, dark) => S(`
    <rect x="4.6" y="6.4" width="14.8" height="13.4" rx="2" fill="${light}"/>
    <ellipse cx="12" cy="6.8" rx="7.4" ry="2.4" fill="${dark}"/>
    <ellipse cx="12" cy="6.8" rx="4.6" ry="1.3" fill="${light}" opacity=".55"/>
    <rect x="4.6" y="11.4" width="14.8" height="4.6" fill="#ffffff" opacity=".8"/>
  `);

  /** A drinking glass or cup, filled. */
  const glass = (fill, foam) => S(`
    <path d="M6.2 5.4h11.6l-1.3 14.2A2.6 2.6 0 0 1 13.9 22h-3.8a2.6 2.6 0 0 1-2.6-2.4z" fill="#dbe6ec" opacity=".55"/>
    <path d="M7.1 9h9.8l-1 10.5a1.6 1.6 0 0 1-1.6 1.5h-4.6a1.6 1.6 0 0 1-1.6-1.5z" fill="${fill}"/>
    ${foam || ""}
  `);

  /* ---------------- palette ---------------- */

  const PAPER      = "#cbdde8";
  const PAPER_LITE = "#e9f2f7";
  const PAPER_DARK = "#9dbccd";
  const GREEN      = "#5cb85c";
  const GREEN_D    = "#3f9440";
  const CREAM      = "#f2e4c4";
  const BROWN      = "#b5793f";
  const BROWN_D    = "#8c5a2b";

  const ICONS = {

    /* ================= 洗剤・掃除 ================= */
    dishSoap: S(`
      <rect x="9.8" y="2" width="4.4" height="2.7" rx=".9" fill="${GREEN_D}"/>
      <rect x="10.7" y="4.5" width="2.6" height="2" fill="${GREEN}"/>
      <path d="M7 10.6c0-2 1.1-3.7 2.9-4.5h4.2c1.8.8 2.9 2.5 2.9 4.5V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="${GREEN}"/>
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
    bleach: jug("#8fc4e8", "#5d9ac4",
      `<path d="M10.7 13.4c1.4 1.6 2.1 2.7 2.1 3.5a2.1 2.1 0 0 1-4.2 0c0-.8.7-1.9 2.1-3.5z" fill="#4a90d9"/>
       <path d="M13.9 15.9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="#4a90d9"/>`),

    shampoo:  pump("#2fb3a6", "#1d8d82"),
    rinse:    pump("#9b7ede", "#7457b8"),
    bodySoap: pump("#f0913f", "#c9701f"),
    handSoap: pump("#4a90d9", "#2f6fb0"),
    soapBar: S(`
      <rect x="2.8" y="9.6" width="15" height="9.2" rx="2.8" fill="#f0cfdd"/>
      <path d="M5.6 9.6h9.4a2.8 2.8 0 0 1 2.8 2.8H2.8a2.8 2.8 0 0 1 2.8-2.8z" fill="#ffffff" opacity=".75"/>
      <circle cx="19.6" cy="7.4" r="2.1" fill="#bfe4f2"/>
      <circle cx="16.4" cy="4.6" r="1.35" fill="#bfe4f2"/>
      <circle cx="21.4" cy="11.9" r="1.15" fill="#bfe4f2"/>
    `),

    toothpaste: tube("#63b8e0", "#3d8fba",
      `<rect x="8.2" y="15.2" width="7.6" height="1.5" fill="#e0574d" opacity=".85"/>`),
    faceWash:  tube("#7cc47f", "#4d9b52"),
    sunscreen: tube("#f2c14e", "#d7a12d", `<circle cx="12" cy="18.4" r="1.9" fill="#ef8f4a"/>`),

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

    wrap: cutBox("#ef8f4a", "#c9701f"),
    foil: cutBox("#b8c3c9", "#8b989f"),
    sponge: S(`
      <rect x="3" y="9.2" width="18" height="9.6" rx="2.2" fill="#f2c14e"/>
      <path d="M5.2 9.2h13.6A2.2 2.2 0 0 1 21 11.4v1.3H3v-1.3a2.2 2.2 0 0 1 2.2-2.2z" fill="${GREEN}"/>
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
    broom: S(`
      <rect x="11" y="2.4" width="2" height="10" rx="1" fill="#a9752f"/>
      <path d="M7.4 12.4h9.2l1.4 3H6z" fill="#e0a94f"/>
      <path d="M6 15.4h12l-1.2 6H7.2z" fill="#f2c14e"/>
      <path d="M9.6 15.4v6M12 15.4v6M14.4 15.4v6" stroke="#d7a12d" stroke-width="1.1"/>
    `),

    mask: S(`
      <path d="M4.9 9.2 2.4 7.4M19.1 9.2l2.5-1.8" stroke="#8d968f" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M4.6 8.6h14.8v4.6c0 3.4-3.3 6.2-7.4 6.2s-7.4-2.8-7.4-6.2z" fill="#dcebf4"/>
      <path d="M4.6 11.4h14.8M4.9 14.2h14.2" stroke="#a9c9dc" stroke-width="1.3" stroke-linecap="round"/>
    `),
    toner:       flask("#ec7fa4", "#c85a80"),
    milkyLotion: flask("#e9dcc8", "#c4b193"),
    toothbrush: S(`
      <rect x="3.4" y="14.6" width="14" height="3" rx="1.5" fill="#4a90d9" transform="rotate(-16 3.4 14.6)"/>
      <path d="M16.4 6.6h4.4v2.6h-4.4z" fill="#eef3f6" transform="rotate(-16 16.4 6.6)"/>
      <path d="M16.9 4.6v2.2M18.2 4.9v2.2M19.5 5.2v2.2" stroke="#cfdde5" stroke-width="1.2" stroke-linecap="round"/>
    `),
    diaper: S(`
      <path d="M4 5.4c2.6-.9 5.3-1.4 8-1.4s5.4.5 8 1.4c-1.6 2-2.4 4.2-2.4 6.6s.8 4.6 2.4 6.6c-2.6.9-5.3 1.4-8 1.4s-5.4-.5-8-1.4c1.6-2 2.4-4.2 2.4-6.6S5.6 7.4 4 5.4z" fill="#f2f6f8"/>
      <path d="M4 5.4c2.6-.9 5.3-1.4 8-1.4s5.4.5 8 1.4c-.5.6-.9 1.3-1.3 2-2.2-.7-4.4-1-6.7-1s-4.5.3-6.7 1c-.4-.7-.8-1.4-1.3-2z" fill="#8fc9e4"/>
      <circle cx="12" cy="12" r="2.1" fill="#f7c9d9"/>
    `),
    battery: S(`
      <rect x="4.6" y="8.4" width="14" height="9" rx="2" fill="#5a655e"/>
      <rect x="18.6" y="10.8" width="2.4" height="4.2" rx="1" fill="#5a655e"/>
      <rect x="6.2" y="10" width="7.4" height="5.8" rx="1" fill="#8fd45f"/>
    `),
    bulb: S(`
      <path d="M12 2.4a6.6 6.6 0 0 1 4 11.8v2.2H8v-2.2A6.6 6.6 0 0 1 12 2.4z" fill="#f7d668"/>
      <rect x="8.4" y="16.8" width="7.2" height="2" rx=".8" fill="#a9b3ad"/>
      <rect x="9.4" y="19.2" width="5.2" height="2.4" rx="1.2" fill="#8d968f"/>
    `),
    socks: S(`
      <path d="M6.4 2.8h4.8v9.4c0 1.2.5 1.8 1.8 2.4l3.4 1.6a3.4 3.4 0 0 1-3 6.1l-4.6-2.2c-2.4-1.2-4.2-3-4.2-6.2V6.4a3.6 3.6 0 0 1 1.8-3.6z" fill="#7ba7d4"/>
      <path d="M6.4 2.8h4.8v3H4.8a3.6 3.6 0 0 1 1.6-3z" fill="#4a7fb5"/>
    `),
    petFood: S(`
      <path d="M4.4 8h15.2l-1.5 11.5A2.8 2.8 0 0 1 15.3 22H8.7a2.8 2.8 0 0 1-2.8-2.5z" fill="#b5793f"/>
      <path d="M4.4 8 6 4.6h12L19.6 8z" fill="#8c5a2b"/>
      <circle cx="9.6" cy="14.4" r="1.5" fill="#f0d3a6"/>
      <circle cx="14.4" cy="13.4" r="1.5" fill="#f0d3a6"/>
      <circle cx="12" cy="17.6" r="1.5" fill="#f0d3a6"/>
    `),

    /* ================= 薬・衛生 ================= */
    medicine: S(`
      <rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" fill="#e0574d" transform="rotate(-28 12 12)"/>
      <path d="M12 5.2 5.4 15.4a3.4 3.4 0 0 0 5.7 3.7L17.6 8.9z" fill="#f2f5f3"/>
      <path d="M9.9 8.2 6.1 14a3.4 3.4 0 0 0 0 0z" fill="#ffffff" opacity=".4"/>
    `),
    plaster: S(`
      <rect x="2.4" y="9" width="19.2" height="6" rx="3" fill="#f0c48a" transform="rotate(-32 12 12)"/>
      <rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1.4" fill="#f7dcb8" transform="rotate(-32 12 12)"/>
      <circle cx="10.6" cy="12.7" r=".6" fill="#d9a465"/>
      <circle cx="13.4" cy="11.3" r=".6" fill="#d9a465"/>
      <circle cx="12" cy="14" r=".6" fill="#d9a465"/>
    `),
    thermometer: S(`
      <rect x="10.6" y="2.6" width="2.8" height="14" rx="1.4" fill="#eef3f6"/>
      <rect x="11.4" y="7" width="1.2" height="9.6" fill="#e0574d"/>
      <circle cx="12" cy="18.4" r="3.4" fill="#e0574d"/>
      <path d="M14.4 5.4h2M14.4 8h2M14.4 10.6h2" stroke="#b9c6cd" stroke-width="1.1" stroke-linecap="round"/>
    `),

    /* ================= 乳製品・卵 ================= */
    milk: carton("#f3f7fa", "#5b9bd5", "#5b9bd5"),
    soyMilk: carton("#f5efdf", "#c9a45c", "#c9a45c"),
    egg: S(`
      <path d="M12 2.6c3.9 0 6.9 5.6 6.9 10.1a6.9 6.9 0 0 1-13.8 0C5.1 8.2 8.1 2.6 12 2.6z" fill="#f7ecd2"/>
      <ellipse cx="9.4" cy="10" rx="1.9" ry="1.3" fill="#ffffff" opacity=".7" transform="rotate(-30 9.4 10)"/>
    `),
    cheese: S(`
      <path d="M3 10.6 19.6 5.6a1.6 1.6 0 0 1 2 1.5v9.3a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 16.4z" fill="#f2c14e"/>
      <path d="M3 10.6 19.6 5.6a1.6 1.6 0 0 1 2 1.5v1.5L3 12.9z" fill="#e8ae2f"/>
      <circle cx="7.8" cy="14.6" r="1.4" fill="#e0a01f"/>
      <circle cx="13" cy="13.6" r="1.05" fill="#e0a01f"/>
      <circle cx="17.4" cy="15" r="1.2" fill="#e0a01f"/>
    `),
    butter: S(`
      <path d="M3.4 11.4 8 7.2h12.6v9.2a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" fill="#f7e08a"/>
      <path d="M3.4 11.4 8 7.2h12.6l-4.4 4.2z" fill="#f2cf5c"/>
      <rect x="6.2" y="13" width="7.4" height="3.2" rx=".8" fill="#ffffff" opacity=".55"/>
    `),
    yogurt: S(`
      <path d="M5.6 7.4h12.8l-1.2 12A2.8 2.8 0 0 1 14.4 22H9.6a2.8 2.8 0 0 1-2.8-2.6z" fill="#f7f9fa"/>
      <rect x="4.8" y="4.6" width="14.4" height="3.2" rx="1.2" fill="#8fbfe0"/>
      <rect x="7.4" y="11.6" width="9.2" height="5" rx="1" fill="#ec7fa4" opacity=".8"/>
    `),
    iceCream: S(`
      <rect x="11.2" y="14" width="1.6" height="7.6" rx=".8" fill="#c9a45c"/>
      <rect x="6.4" y="2.4" width="11.2" height="13.4" rx="4.4" fill="#f2c9d8"/>
      <path d="M6.4 6.8h11.2v2.6H6.4z" fill="#b5793f" opacity=".55"/>
    `),
    pudding: S(`
      <path d="M4.6 10.4h14.8c0 5.6-2.7 9.4-7.4 9.4S4.6 16 4.6 10.4z" fill="#f2d07a"/>
      <path d="M6.4 6.6h11.2c1 0 1.8.8 1.8 1.8v2.4c0 .6-.5 1-1 1H5.6c-.6 0-1-.4-1-1V8.4c0-1 .8-1.8 1.8-1.8z" fill="#b5793f"/>
      <path d="M8.4 16.2c1 1.2 2.2 1.8 3.6 1.8" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
    `),

    /* ================= 野菜 ================= */
    /* Not `round` with a leaf like the apple — same red, same circle, and the
       two came out byte-identical. A tomato wears a calyx, so it gets one. */
    tomato: S(`
      <circle cx="12" cy="14" r="7.8" fill="#e0453a"/>
      ${SHINE}
      <rect x="11.3" y="4.4" width="1.4" height="3.4" rx=".7" fill="#4f8a3a"/>
      <path d="M12 8.6c-2-.2-3.5-1.1-4.5-2.7 2.3-.4 3.8.3 4.5 2.7zM12 8.6c2-.2 3.5-1.1 4.5-2.7-2.3-.4-3.8.3-4.5 2.7zM12 8.8c-.7-1.9-.4-3.3.8-4.6 1 1.8.7 3.3-.8 4.6z" fill="#5f9c46"/>
    `),
    cucumber: S(`
      <rect x="3.4" y="9" width="17.2" height="6" rx="3" fill="#4d9b52" transform="rotate(-28 12 12)"/>
      <rect x="6" y="10.6" width="12" height="1.6" rx=".8" fill="#7cc47f" transform="rotate(-28 12 12)"/>
    `),
    cabbage: S(`
      <circle cx="12" cy="13" r="8.6" fill="#8fce7c"/>
      <path d="M12 4.4c-3.4 2.6-5.2 5.5-5.2 8.6s1.8 6 5.2 8.6M12 4.4c3.4 2.6 5.2 5.5 5.2 8.6s-1.8 6-5.2 8.6" fill="none" stroke="#6fb35e" stroke-width="1.3"/>
      <path d="M3.5 13.4h17" stroke="#6fb35e" stroke-width="1.2" opacity=".55"/>
      <path d="M9.6 3.7c1.6-1.8 3.6-2 5.8-.9-1.3 2.2-3.3 2.8-5.8.9z" fill="#5f9c46"/>
    `),
    onion: S(`
      <path d="M12 3.4c.6 2.6 1.4 4 2.8 5.2 2.6 2.2 4 4.2 4 6.6 0 3.7-3 6.4-6.8 6.4S5.2 18.9 5.2 15.2c0-2.4 1.4-4.4 4-6.6C10.6 7.4 11.4 6 12 3.4z" fill="#dbb287"/>
      <path d="M12 4.6c-.7 3.4-1.6 6.2-1.6 9.4 0 2.9.5 5.3 1.6 7.5 1.1-2.2 1.6-4.6 1.6-7.5 0-3.2-.9-6-1.6-9.4z" fill="#f2ddc0"/>
      <path d="M8.6 9.6c-.9 2.3-1.4 4.2-1.4 5.8M15.4 9.6c.9 2.3 1.4 4.2 1.4 5.8" stroke="#c99a6c" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <path d="M11.5 3.6 9.4 1.4M12.5 3.6l2.1-2.2" stroke="#8fce7c" stroke-width="1.5" stroke-linecap="round"/>
    `),
    carrot: S(`
      <path d="M15.6 7.2 8.4 20.6a1.4 1.4 0 0 1-2.5-.1L3.6 15.2z" fill="#ef8f4a" transform="rotate(18 12 12)"/>
      <path d="M15.8 7.4c1.6-2.4 3.4-3.6 5.6-3.8-.4 2.4-1.6 4-3.6 5" fill="#5f9c46"/>
      <path d="M15.6 7.2c-.6-2.6-.2-4.4 1.2-6 1 2 1.2 3.8.4 5.6" fill="#7cc47f"/>
    `),
    potato: S(`
      <path d="M6.4 6.4c3.4-2.6 8-2.4 10.8.4 3 3 3 8-.2 10.8-3.2 2.8-8 2.4-10.8-.8-2.6-3-2.6-7.6.2-10.4z" fill="#d3a86e"/>
      <ellipse cx="9.4" cy="10.4" rx="1.4" ry="1" fill="#b5793f" opacity=".5"/>
      <ellipse cx="14.6" cy="14.6" rx="1.2" ry=".9" fill="#b5793f" opacity=".5"/>
      <ellipse cx="13.4" cy="9" rx=".9" ry=".7" fill="#b5793f" opacity=".5"/>
    `),
    sweetPotato: S(`
      <path d="M4.6 15.6C4.6 9.4 9 4.4 14.4 4.4c2.8 0 5 2 5 4.8 0 6-4.4 10.6-9.8 10.6-2.8 0-5-1.8-5-4.2z" fill="#b06fa8"/>
      <path d="M8.6 12.4c1.6-3 4-5 6.8-5.6" stroke="#d9a1d2" stroke-width="1.4" stroke-linecap="round"/>
    `),
    mushroom: S(`
      <path d="M12 3.2c5 0 8.6 3.4 8.6 6.8 0 1-.8 1.8-1.8 1.8H5.2c-1 0-1.8-.8-1.8-1.8 0-3.4 3.6-6.8 8.6-6.8z" fill="#b5793f"/>
      <path d="M9.2 11.8h5.6v6.6a2.8 2.8 0 0 1-5.6 0z" fill="#f0e2cc"/>
      <circle cx="8.6" cy="7.6" r="1.3" fill="#d3a86e"/>
      <circle cx="14.6" cy="6.8" r="1" fill="#d3a86e"/>
    `),
    corn: S(`
      <path d="M12 2.6c3.4 0 5.8 3.6 5.8 8.6S15.4 21 12 21s-5.8-4.8-5.8-9.8S8.6 2.6 12 2.6z" fill="#f2c14e"/>
      <path d="M9.4 6.6v11M12 5.4v13.2M14.6 6.6v11" stroke="#dba82f" stroke-width="1.1"/>
      <path d="M6.2 12.4c-2.2-1.2-3.4-3-3.6-5.4 2.6.2 4.4 1.4 5.4 3.6" fill="#7cc47f"/>
    `),
    eggplant: S(`
      <path d="M17.6 8.4c2.4 3.4 1.4 8-2.2 10.6s-8.2 2-10.2-1.2c3.4.4 6.4-.6 8.6-2.8s3.2-4.6 3.8-6.6z" fill="#8e6bb5"/>
      <path d="M18 8c-.8-1.4-.6-2.8.6-4 1.4 1 2 2.4 1.6 4z" fill="#7cc47f"/>
      <path d="M14.6 7.2c1.4-.4 2.6-.2 3.6.8-.8 1.2-2 1.6-3.6 1.2z" fill="#5f9c46"/>
    `),
    pepper: S(`
      <path d="M6 10.4c0-2.6 2.6-4.4 6-4.4s6 1.8 6 4.4v4.4c0 3.4-2.6 5.6-6 5.6s-6-2.2-6-5.6z" fill="#6cbb5c"/>
      <path d="M9.6 7.4v11.6M14.4 7.4v11.6" stroke="#4d9b52" stroke-width="1.1"/>
      <rect x="11" y="2.8" width="2" height="3.8" rx="1" fill="#4d9b52"/>
    `),
    broccoli: S(`
      <rect x="10.4" y="12" width="3.2" height="9" rx="1.4" fill="#a9d18e"/>
      <circle cx="8.2" cy="9.6" r="4" fill="#4d9b52"/>
      <circle cx="15.6" cy="9.8" r="3.8" fill="#4d9b52"/>
      <circle cx="12" cy="6.8" r="4.2" fill="#5faa5c"/>
    `),
    salad: S(`
      <path d="M2.8 12.6h18.4c0 4.6-3.2 7.6-7.4 7.6h-3.6c-4.2 0-7.4-3-7.4-7.6z" fill="#eef3f6"/>
      <rect x="2" y="11.2" width="20" height="2.4" rx="1.2" fill="#dbe6ec"/>
      <circle cx="8" cy="9.2" r="3" fill="#6cbb5c"/>
      <circle cx="13.6" cy="8.4" r="3.4" fill="#8fce7c"/>
      <circle cx="17.4" cy="10" r="2.2" fill="#e0574d"/>
    `),
    garlic: S(`
      <path d="M12 4c.6 2.4 1.4 3.6 2.8 4.8 2.4 2 3.6 3.9 3.6 6.2 0 3.6-2.9 6.4-6.4 6.4S5.6 18.6 5.6 15c0-2.3 1.2-4.2 3.6-6.2C10.6 7.6 11.4 6.4 12 4z" fill="#f2ecdf"/>
      <path d="M12 6c-.5 3.4-1.4 6.2-1.4 9.4 0 2.4.4 4.4 1.4 6.1 1-1.7 1.4-3.7 1.4-6.1 0-3.2-.9-6-1.4-9.4z" fill="#e2d8c6"/>
      <path d="M8.6 10c-.8 2.2-1.2 4-1.2 5.4M15.4 10c.8 2.2 1.2 4 1.2 5.4" stroke="#ddd2bd" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M12 4.2c-.4-1.6 0-2.7 1.3-3.5.4 1.5.1 2.7-1.3 3.5z" fill="#a9d18e"/>
    `),
    avocado: S(`
      <path d="M12 2.8c4 0 7 4 7 8.4 0 5.6-3.2 9.8-7 9.8s-7-4.2-7-9.8c0-4.4 3-8.4 7-8.4z" fill="#5f9c46"/>
      <path d="M12 5.6c2.6 0 4.6 2.8 4.6 6 0 4-2.2 7.2-4.6 7.2s-4.6-3.2-4.6-7.2c0-3.2 2-6 4.6-6z" fill="#d7e8a4"/>
      <circle cx="12" cy="13.4" r="3.2" fill="#a9752f"/>
    `),
    beans: S(`
      <ellipse cx="8" cy="9.4" rx="4.4" ry="3.2" fill="#8fce7c" transform="rotate(-28 8 9.4)"/>
      <ellipse cx="15.4" cy="13" rx="4.4" ry="3.2" fill="#6cbb5c" transform="rotate(-28 15.4 13)"/>
      <ellipse cx="9.6" cy="17.4" rx="4.4" ry="3.2" fill="#a9d18e" transform="rotate(-28 9.6 17.4)"/>
    `),

    /* ================= 果物 ================= */
    apple: round("#e0574d", `${LEAF}${STALK}`),
    banana: S(`
      <path d="M4.6 6.6c.6 7 4.8 11.6 11.6 12.6 2.4.4 3.8-.6 4-2.4-4.4-.6-7.8-2.4-10-5.4C8.6 9 7.6 7.2 7.4 5.4z" fill="#f2c94c"/>
      <path d="M4.6 6.6 6.2 4l1.2 1.4z" fill="#8c5a2b"/>
      <path d="M16.2 19.2c1.6.2 2.8-.2 3.4-1.2l1.4 1z" fill="#8c5a2b"/>
    `),
    orange: round("#ef8f4a", `${LEAF}${STALK}`),
    strawberry: S(`
      <path d="M12 8c4.2 0 7 2.4 7 5.4 0 3.6-3.4 8.2-7 8.2s-7-4.6-7-8.2C5 10.4 7.8 8 12 8z" fill="#e0574d"/>
      <path d="M6.4 6.6h11.2c-.6 1.6-2 2.6-4 2.8L12 11 9.8 9.4c-1.8-.2-3-1.2-3.4-2.8z" fill="#5f9c46"/>
      <rect x="11.3" y="3.4" width="1.4" height="3.4" rx=".7" fill="#5f9c46"/>
      <circle cx="9.4" cy="13" r=".7" fill="#ffe0b8"/>
      <circle cx="13.6" cy="12.2" r=".7" fill="#ffe0b8"/>
      <circle cx="12" cy="16" r=".7" fill="#ffe0b8"/>
      <circle cx="15" cy="16" r=".7" fill="#ffe0b8"/>
    `),
    grape: S(`
      <rect x="11.3" y="2.4" width="1.4" height="3.4" rx=".7" fill="#7a5a3a"/>
      <path d="M13 5.6c1.4-1.8 3-2.6 5-2.4-.4 2.2-1.8 3.2-5 2.4z" fill="#5f9c46"/>
      <circle cx="8.4" cy="10" r="2.7" fill="#9b7ede"/>
      <circle cx="15.6" cy="10" r="2.7" fill="#9b7ede"/>
      <circle cx="12" cy="12.6" r="2.7" fill="#8e6bb5"/>
      <circle cx="8.4" cy="15.2" r="2.7" fill="#9b7ede"/>
      <circle cx="15.6" cy="15.2" r="2.7" fill="#9b7ede"/>
      <circle cx="12" cy="18" r="2.7" fill="#8e6bb5"/>
    `),
    peach: round("#f2a1a6", `${LEAF}${STALK}`),
    watermelon: S(`
      <path d="M2.4 8.2h19.2c0 7-4.3 12.4-9.6 12.4S2.4 15.2 2.4 8.2z" fill="#e0574d"/>
      <path d="M2.4 8.2h19.2c0-1.4-.1-2.4-.3-3.2H2.7c-.2.8-.3 1.8-.3 3.2z" fill="#5f9c46"/>
      <circle cx="9" cy="12" r=".8" fill="#3b2a1c"/>
      <circle cx="14.4" cy="11.4" r=".8" fill="#3b2a1c"/>
      <circle cx="12" cy="15.6" r=".8" fill="#3b2a1c"/>
    `),
    pear: S(`
      <path d="M12 6.4c2.4 0 3.4 2.2 4.2 4.2.8 2 2 3.6 2 5.6 0 3.2-2.8 5.4-6.2 5.4s-6.2-2.2-6.2-5.4c0-2 1.2-3.6 2-5.6.8-2 1.8-4.2 4.2-4.2z" fill="#c8d95c"/>
      <rect x="11.3" y="2.6" width="1.4" height="4" rx=".7" fill="#7a5a3a"/>
      <path d="M12.6 5c1-1.6 2.4-2.4 4.2-2.4-.2 1.9-1.4 2.8-4.2 2.4z" fill="#5f9c46"/>
    `),
    pineapple: S(`
      <path d="M12 8.2c3.6 0 6.2 2.6 6.2 6.2S15.6 21.4 12 21.4s-6.2-3.4-6.2-7S8.4 8.2 12 8.2z" fill="#e8ae2f"/>
      <path d="M8.4 10.4 12 14M15.6 10.4 12 14M8.4 17.6 12 14M15.6 17.6 12 14" stroke="#c98a12" stroke-width="1.2"/>
      <path d="M12 8.2c-1.4-2.4-1.4-4.4 0-6 1.4 1.6 1.4 3.6 0 6z" fill="#5f9c46"/>
      <path d="M12 8.4c-2-1.6-3.2-3.2-3.4-5 2.2.4 3.6 1.8 3.4 5z" fill="#6cbb5c"/>
      <path d="M12 8.4c2-1.6 3.2-3.2 3.4-5-2.2.4-3.6 1.8-3.4 5z" fill="#6cbb5c"/>
    `),
    kiwi: S(`
      <circle cx="12" cy="12" r="9" fill="#8c5a2b"/>
      <circle cx="12" cy="12" r="7" fill="#8fce7c"/>
      <circle cx="12" cy="12" r="2.8" fill="#f2ecdf"/>
      <circle cx="12" cy="7.6" r=".55" fill="#2b2b2b"/>
      <circle cx="12" cy="16.4" r=".55" fill="#2b2b2b"/>
      <circle cx="7.6" cy="12" r=".55" fill="#2b2b2b"/>
      <circle cx="16.4" cy="12" r=".55" fill="#2b2b2b"/>
      <circle cx="8.9" cy="8.9" r=".55" fill="#2b2b2b"/>
      <circle cx="15.1" cy="15.1" r=".55" fill="#2b2b2b"/>
      <circle cx="15.1" cy="8.9" r=".55" fill="#2b2b2b"/>
      <circle cx="8.9" cy="15.1" r=".55" fill="#2b2b2b"/>
    `),
    melon: round("#c8d95c", `${LEAF}${STALK}`),
    lemon: S(`
      <ellipse cx="12" cy="12.6" rx="8.6" ry="6.4" fill="#f2d94e" transform="rotate(-20 12 12.6)"/>
      <path d="M3.8 15.6c-1.4.4-2.2.2-2.6-.6 1-.5 1.9-.5 2.6.6z" fill="#e8c62f"/>
      <path d="M20.2 9.6c1.4-.4 2.2-.2 2.6.6-1 .5-1.9.5-2.6-.6z" fill="#e8c62f"/>
      ${SHINE}
    `),

    /* ================= 肉・魚 ================= */
    meat: S(`
      <path d="M4.6 9c1-3.6 4.4-6 8.4-6 4.4 0 7 2.6 7 6.4 0 4.6-3.4 8-7.4 9.6-3.4 1.4-6.6.4-7.8-2.6-1-2.4-.8-5 -.2-7.4z" fill="#d9645c"/>
      <path d="M8.6 10.2c1.4-2 3.4-3 5.8-2.8 2 .2 3 1.4 3 3 0 2.6-2 4.6-4.6 5.6-2.2.8-4.2.2-4.8-1.6-.4-1.4-.2-2.8.6-4.2z" fill="#f2a1a6"/>
      <path d="M18.6 4.6c1.8.6 2.8 1.8 2.8 3.4s-1 2.6-2.6 2.8c.4-2.2.2-4.2-.2-6.2z" fill="#f7ecd2"/>
    `),
    chicken: S(`
      <path d="M10.6 13.6 5.2 19" stroke="#f2ecdf" stroke-width="4" stroke-linecap="round"/>
      <circle cx="4.2" cy="18.2" r="2.2" fill="#f2ecdf"/>
      <circle cx="5.8" cy="19.8" r="2.2" fill="#f2ecdf"/>
      <path d="M19.4 4.6c2.7 2.7 2.7 7.1 0 9.8s-7.1 2.7-9.8 0-2.7-7.1 0-9.8 7.1-2.7 9.8 0z" fill="#c9713f"/>
      <path d="M17.1 6.9c1.4 1.4 1.4 3.8 0 5.2s-3.8 1.4-5.2 0-1.4-3.8 0-5.2 3.8-1.4 5.2 0z" fill="#e09055"/>
    `),
    bacon: S(`
      <path d="M2.6 8.2c3-2.6 5.6.4 8.6-1.8s5.4.8 8.4-1.4l2 3.4c-3 2.2-5.4-.8-8.4 1.4S8 8.4 5 11z" fill="#e0574d"/>
      <path d="M2.6 13.2c3-2.6 5.6.4 8.6-1.8s5.4.8 8.4-1.4l2 3.4c-3 2.2-5.4-.8-8.4 1.4s-5.2-1.4-8.2 1.2z" fill="#f2a1a6"/>
      <path d="M2.6 18.2c3-2.6 5.6.4 8.6-1.8s5.4.8 8.4-1.4l2 3.4c-3 2.2-5.4-.8-8.4 1.4s-5.2-1.4-8.2 1.2z" fill="#e0574d"/>
    `),
    sausage: S(`
      <rect x="2.4" y="6" width="19.2" height="5.2" rx="2.6" fill="#c9713f" transform="rotate(-8 12 8.6)"/>
      <rect x="2.4" y="13.4" width="19.2" height="5.2" rx="2.6" fill="#d9834f" transform="rotate(8 12 16)"/>
    `),
    ham: S(`
      <circle cx="12" cy="12" r="9" fill="#f2a1a6"/>
      <circle cx="12" cy="12" r="6.4" fill="#e0798b"/>
      <circle cx="9.6" cy="10.4" r="1.5" fill="#f7e2e2"/>
      <circle cx="14" cy="13.6" r="1.2" fill="#f7e2e2"/>
    `),
    fish: S(`
      <path d="M2.6 12c3-4.2 6.8-6.2 11.2-6.2 3.6 0 6.2 2.2 7.6 6.2-1.4 4-4 6.2-7.6 6.2-4.4 0-8.2-2-11.2-6.2z" fill="#7bb8d4"/>
      <path d="M2.6 12c1.2-1.6 2.4-3 3.8-4-.6 2.6-.6 5.4 0 8-1.4-1-2.6-2.4-3.8-4z" fill="#4f8fb0"/>
      <circle cx="16.6" cy="10.6" r="1.3" fill="#2b3b42"/>
      <path d="M12.4 15.4c1.8 1 3.6 1 5.4 0" stroke="#4f8fb0" stroke-width="1.2" stroke-linecap="round"/>
    `),
    sushi: S(`
      <rect x="4.4" y="12.4" width="15.2" height="7.4" rx="3.4" fill="#f7f4ee"/>
      <path d="M4.6 15.4h14.8" stroke="#e6e0d4" stroke-width="1.1"/>
      <path d="M3.6 11.4c0-1.9 3.8-3.5 8.4-3.5s8.4 1.6 8.4 3.5v.5c0 1.3-1 2.2-2.4 2.2H6c-1.4 0-2.4-.9-2.4-2.2z" fill="#ef8272"/>
      <path d="M5.8 10.4c3.9-1.1 8.5-1.1 12.4 0" stroke="#ffffff" stroke-width="1.1" opacity=".65" fill="none"/>
    `),
    shrimp: S(`
      <path d="M18.4 5.6c2.4 3 2 7.6-1 10.4-3.4 3.2-8.6 3-11.4-.4 3.4.6 6.2-.4 8.4-2.6 2-2 3.2-4.6 4-7.4z" fill="#ef8f4a"/>
      <path d="M6 15.6c-1.6.8-2.8.6-3.6-.8 1.4-.8 2.6-.6 3.6.8z" fill="#e0574d"/>
      <path d="M18.4 5.4c1-1.6 2.2-2.2 3.6-1.8-.4 1.6-1.4 2.4-3.6 1.8z" fill="#e0574d"/>
      <circle cx="15.8" cy="8.6" r="1" fill="#ffffff"/>
    `),
    squid: S(`
      <path d="M12 2.4c3.2 0 5.4 2.4 5.4 5.8 0 2.6-.8 4.6-2 6.2H8.6c-1.2-1.6-2-3.6-2-6.2 0-3.4 2.2-5.8 5.4-5.8z" fill="#f2dfe4"/>
      <path d="M8.8 14.4h1.8l-.6 6.8-1.8-.4zM11.4 14.4h1.6l.4 7h-1.8zM14.2 14.4H16l1.2 6.6-1.8.4z" fill="#eccdd6"/>
      <circle cx="10" cy="8.4" r="1.1" fill="#3b2a1c"/>
      <circle cx="14" cy="8.4" r="1.1" fill="#3b2a1c"/>
    `),
    octopus: S(`
      <path d="M12 2.6c4 0 6.8 3 6.8 7 0 2.6-.8 4.6-2 6H7.2c-1.2-1.4-2-3.4-2-6 0-4 2.8-7 6.8-7z" fill="#e0798b"/>
      <path d="M6.6 15.6c-.6 2.4-1.8 3.8-3.6 4.2.4-2.4 1.6-3.8 3.6-4.2zM9.6 15.6c-.2 2.6-1 4.4-2.4 5.4-.4-2.6.2-4.4 2.4-5.4zM14.4 15.6c.2 2.6 1 4.4 2.4 5.4.4-2.6-.2-4.4-2.4-5.4zM17.4 15.6c.6 2.4 1.8 3.8 3.6 4.2-.4-2.4-1.6-3.8-3.6-4.2z" fill="#d9647c"/>
      <circle cx="9.8" cy="9" r="1.2" fill="#3b2a1c"/>
      <circle cx="14.2" cy="9" r="1.2" fill="#3b2a1c"/>
    `),
    shellfish: S(`
      <path d="M12 19.6C6.6 19.6 2.6 15.4 2.6 10.4c0-3 2.2-5.4 5-5.4 1.8 0 3.2.8 4.4 2.2 1.2-1.4 2.6-2.2 4.4-2.2 2.8 0 5 2.4 5 5.4 0 5-4 9.2-9.4 9.2z" fill="#e6b98f"/>
      <path d="M12 7.2v12.4M7.4 6c-1 3.6-.6 7.2 1.4 10.6M16.6 6c1 3.6.6 7.2-1.4 10.6" stroke="#c99a6c" stroke-width="1.2"/>
    `),

    /* ================= 主食 ================= */
    rice: S(`
      <path d="M5.4 11c.6-3.5 3.2-5.6 6.6-5.6s6 2.1 6.6 5.6z" fill="#ffffff"/>
      <path d="M8.4 8.2c.9-1 2.1-1.5 3.6-1.5" stroke="#e2e9ec" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M3 12.9h18c0 4.7-3.1 7.9-7.2 7.9h-3.6C6.1 20.8 3 17.6 3 12.9z" fill="#7bb0d6"/>
      <rect x="2.2" y="10.9" width="19.6" height="2.4" rx="1.2" fill="#5b9bd5"/>
      <path d="M4.9 15.8h14.2c-.9 2.4-2.8 3.8-5.5 3.8h-3.2c-2.7 0-4.6-1.4-5.5-3.8z" fill="#ffffff" opacity=".22"/>
    `),
    bread: S(`
      <path d="M4.4 10.4c0-4 3.2-6.8 7.6-6.8s7.6 2.8 7.6 6.8v8.4A2.2 2.2 0 0 1 17.4 21H6.6a2.2 2.2 0 0 1-2.2-2.2z" fill="#e0a94f"/>
      <path d="M6.4 11.2c0-2.9 2.3-4.9 5.6-4.9s5.6 2 5.6 4.9v7.4a1.4 1.4 0 0 1-1.4 1.4H7.8a1.4 1.4 0 0 1-1.4-1.4z" fill="#f7ecd2"/>
    `),
    croissant: S(`
      <path d="M3 16.2c0-6 4.2-10.4 9.6-10.4 4.4 0 7.6 2.8 8.4 7-3-2-6-2.4-9-1.2 2.2.4 3.8 1.6 4.8 3.6-3-1-5.8-.6-8.4 1.2-1.4 1-3 1.4-4.4 1-.6-.2-1-.6-1-1.2z" fill="#e0a94f"/>
      <path d="M8.8 10.4c1.8 1.4 2.8 3.4 3 6M13.2 8.4c1.4 1.6 2.2 3.4 2.4 5.6" stroke="#c98a12" stroke-width="1.2" stroke-linecap="round"/>
    `),
    noodles: bowl("#d9645c",
      `<path d="M6.2 10.8c0-3.4 2.6-5.6 5.8-5.6s5.8 2.2 5.8 5.6z" fill="#f2d07a"/>
       <path d="M8 6.4c-.6-1.6-.2-2.8 1.2-3.6.6 1.6.2 2.8-1.2 3.6zM12 5.8c-.8-1.6-.6-2.8.6-3.8.8 1.4.6 2.8-.6 3.8z" fill="#dbe6ec" opacity=".8"/>`),
    pasta: S(`
      <path d="M2.6 14.4h18.8c0 3.6-2.6 6-6.4 6h-6c-3.8 0-6.4-2.4-6.4-6z" fill="#eef3f6"/>
      <rect x="1.8" y="13" width="20.4" height="2.4" rx="1.2" fill="#dbe6ec"/>
      <path d="M5.6 13c1.6-3.4 4-5.2 7.2-5.2 2.6 0 4.4 1 5.6 2.8-2.4-.6-4.4 0-6 1.6-1 1-1.6 1.6-2.2 .8z" fill="#f2d07a"/>
      <circle cx="14.6" cy="10.6" r="1.6" fill="#e0574d"/>
      <circle cx="9.4" cy="11.6" r="1.3" fill="#e0574d"/>
    `),
    pot: S(`
      <path d="M3.4 9.6h17.2v6.6A4.4 4.4 0 0 1 16.2 20.6H7.8a4.4 4.4 0 0 1-4.4-4.4z" fill="#e0574d"/>
      <rect x="2.2" y="8" width="19.6" height="2.6" rx="1.3" fill="#c9463d"/>
      <rect x="10.6" y="5" width="2.8" height="2.6" rx="1.2" fill="#c9463d"/>
      <path d="M5.6 15.6h12.8c-.6 2-2.2 3.2-4.6 3.2h-3.6c-2.4 0-4-1.2-4.6-3.2z" fill="#ffffff" opacity=".2"/>
    `),
    curry: S(`
      <ellipse cx="12" cy="15.4" rx="10" ry="5.4" fill="#eef3f6"/>
      <ellipse cx="12" cy="14.6" rx="8" ry="4.2" fill="#f7f4ee"/>
      <path d="M12 10.4c3.8 0 6.8 1.8 6.8 4.2s-3 4.2-6.8 4.2z" fill="#c9713f"/>
      <circle cx="15.6" cy="14" r="1.1" fill="#e0a94f"/>
      <circle cx="14.6" cy="16.6" r=".9" fill="#8fce7c"/>
    `),
    dumpling: S(`
      <path d="M3.6 14.6c0-4 3.8-7 8.4-7s8.4 3 8.4 7c0 1.6-1 2.6-2.6 2.6H6.2c-1.6 0-2.6-1-2.6-2.6z" fill="#efe0bc"/>
      <path d="M4.6 17.2h14.8c-.4 1.7-1.6 2.7-3.4 2.7H8c-1.8 0-3-1-3.4-2.7z" fill="#dcc79a"/>
      <path d="M7.4 9.4c1 1.6 1 3.2 0 4.8M11.2 8.2c1 1.8 1 3.8 0 5.8M15 9.4c1 1.6 1 3.2 0 4.8" stroke="#c9b083" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    `),
    bento: S(`
      <rect x="2.6" y="6" width="18.8" height="13" rx="2.4" fill="#c9463d"/>
      <rect x="4.4" y="7.8" width="15.2" height="9.4" rx="1.4" fill="#f7f4ee"/>
      <rect x="4.4" y="7.8" width="6.4" height="9.4" rx="1.4" fill="#ffffff"/>
      <circle cx="7.6" cy="12.4" r="1.6" fill="#e0574d"/>
      <rect x="12" y="9.6" width="6.4" height="2.6" rx="1" fill="#e0a94f"/>
      <rect x="12" y="13.2" width="6.4" height="2.6" rx="1" fill="#8fce7c"/>
    `),
    frozen: S(`
      <path d="M12 2.4v19.2M3.7 7.2l16.6 9.6M20.3 7.2 3.7 16.8" stroke="#7bc8ee" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M9.4 5.2 12 7.8l2.6-2.6M9.4 18.8 12 16.2l2.6 2.6" stroke="#7bc8ee" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    `),

    /* ================= 調味料・粉 ================= */
    salt: S(`
      <path d="M7 9.6h10l.9 9.4a2.6 2.6 0 0 1-2.6 2.8H8.7a2.6 2.6 0 0 1-2.6-2.8z" fill="#f2f5f3"/>
      <path d="M7.6 4.6h8.8c.8 0 1.4.6 1.4 1.4v3.6H6.2V6c0-.8.6-1.4 1.4-1.4z" fill="#a9b3ad"/>
      <circle cx="10.2" cy="6.6" r=".7" fill="#5a655e"/>
      <circle cx="13.8" cy="6.6" r=".7" fill="#5a655e"/>
      <circle cx="12" cy="8" r=".7" fill="#5a655e"/>
    `),
    sauceBottle: bottle("#7a4a2a", "#4a2c18"),
    ketchup: S(`
      <path d="M9.4 2.4h5.2v2.6l1.6 2.4c.8 1.2 1.2 2.4 1.2 3.8v8.2A2.6 2.6 0 0 1 14.8 22H9.2a2.6 2.6 0 0 1-2.6-2.6V11.2c0-1.4.4-2.6 1.2-3.8l1.6-2.4z" fill="#d94a3f"/>
      <rect x="7.6" y="12.4" width="8.8" height="5.2" rx="1" fill="#ffffff" opacity=".85"/>
    `),
    mayo: S(`
      <path d="M9.4 2.4h5.2v2.6l1.6 2.4c.8 1.2 1.2 2.4 1.2 3.8v8.2A2.6 2.6 0 0 1 14.8 22H9.2a2.6 2.6 0 0 1-2.6-2.6V11.2c0-1.4.4-2.6 1.2-3.8l1.6-2.4z" fill="#f2f0e4"/>
      <rect x="7.6" y="12.4" width="8.8" height="5.2" rx="1" fill="#4a90d9" opacity=".75"/>
    `),
    tin: tin("#c9cfd3", "#9aa4aa"),
    oil: bottle("#e8c15c", "#c9963a"),
    flour: bag("#efe3c9", "#d3bc8e",
      `<rect x="7.8" y="11" width="8.4" height="5.6" rx="1" fill="#ffffff" opacity=".85"/>
       <path d="M9.4 13h5.2M9.4 15h3.4" stroke="#c9b083" stroke-width="1.1" stroke-linecap="round"/>`),
    honey: jar("#e8a72f", "#a9752f",
      `<path d="M12 12.4c1.2 1.4 1.8 2.4 1.8 3.1a1.8 1.8 0 0 1-3.6 0c0-.7.6-1.7 1.8-3.1z" fill="#c98a12"/>`),
    miso: S(`
      <path d="M5.4 8.4h13.2l-1 11.2A2.6 2.6 0 0 1 15 22H9a2.6 2.6 0 0 1-2.6-2.4z" fill="#e0cfa4"/>
      <rect x="4.4" y="5.4" width="15.2" height="3.4" rx="1.2" fill="#a9752f"/>
      <path d="M7.4 12.4h9.2l-.6 6.2a1.4 1.4 0 0 1-1.4 1.2h-5.2a1.4 1.4 0 0 1-1.4-1.2z" fill="#a9752f"/>
    `),
    vinegar: bottle("#d9e2c4", "#a9b58e"),

    /* ================= 菓子 ================= */
    chocolate: S(`
      <rect x="3.4" y="5.4" width="17.2" height="13.2" rx="1.8" fill="#7a4a2a"/>
      <path d="M3.4 5.4h17.2v2.2H3.4z" fill="#9b6136"/>
      <path d="M8.8 7.6v11M14 7.6v11M3.4 11.4h17.2M3.4 15h17.2" stroke="#5c3620" stroke-width="1.1"/>
    `),
    cookie: S(`
      <circle cx="12" cy="12" r="9" fill="#e0a94f"/>
      <circle cx="9.2" cy="9.6" r="1.5" fill="#6b3f20"/>
      <circle cx="15" cy="10.6" r="1.2" fill="#6b3f20"/>
      <circle cx="11.6" cy="15" r="1.4" fill="#6b3f20"/>
      <circle cx="16" cy="15.2" r="1" fill="#6b3f20"/>
    `),
    riceCracker: S(`
      <circle cx="12" cy="12" r="9" fill="#e8c98a"/>
      <path d="M6.4 5.6h11.2c1.2 1.2 2 2.6 2.4 4.2H4c.4-1.6 1.2-3 2.4-4.2z" fill="#3f5b4a"/>
      <path d="M4 9.8h16c.2.7.3 1.4.3 2.2H3.7c0-.8.1-1.5.3-2.2z" fill="#3f5b4a" opacity="0"/>
      <path d="M3.6 10.8h16.8v3.2H3.6z" fill="#3f5b4a"/>
    `),
    candy: S(`
      <circle cx="12" cy="12" r="5.4" fill="#ec7fa4"/>
      <path d="M6.8 10.2 2.4 7.4v9.2l4.4-2.8z" fill="#f7b3cb"/>
      <path d="M17.2 10.2 21.6 7.4v9.2l-4.4-2.8z" fill="#f7b3cb"/>
      <circle cx="10.2" cy="10.2" r="1.5" fill="#ffffff" opacity=".55"/>
    `),
    chips: bag("#f0913f", "#c9701f",
      `<ellipse cx="12" cy="14" rx="4.4" ry="3.4" fill="#f7d68e"/>
       <ellipse cx="12" cy="14" rx="2.4" ry="1.8" fill="#e8ae2f"/>`),
    cake: S(`
      <path d="M4 12.4h16v5.2A2.4 2.4 0 0 1 17.6 20H6.4A2.4 2.4 0 0 1 4 17.6z" fill="#f7ecd2"/>
      <path d="M4 12.4h16v-1.6c0-1-.8-1.8-1.8-1.8H5.8c-1 0-1.8.8-1.8 1.8z" fill="#f2a1a6"/>
      <path d="M4 15.2h16" stroke="#e0cfa4" stroke-width="1.2"/>
      <circle cx="12" cy="6.6" r="2" fill="#e0574d"/>
      <path d="M11.4 8.4h1.2v.8h-1.2z" fill="#5f9c46"/>
    `),
    nuts: S(`
      <ellipse cx="8.4" cy="10" rx="4" ry="5" fill="#c9713f" transform="rotate(-22 8.4 10)"/>
      <ellipse cx="15" cy="12.4" rx="4" ry="5" fill="#d9834f" transform="rotate(18 15 12.4)"/>
      <ellipse cx="10.4" cy="17.4" rx="3.6" ry="4.4" fill="#b5793f" transform="rotate(-8 10.4 17.4)"/>
    `),

    /* ================= 飲みもの ================= */
    water: bottle("#cfe7f2", "#7bb8d4"),
    tea: S(`
      <path d="M4.4 8.6h13.2v5.6c0 3.4-2.6 5.8-6.6 5.8s-6.6-2.4-6.6-5.8z" fill="#f2f5f3"/>
      <path d="M6.2 10.4h9.6v3.6c0 2.4-1.8 4-4.8 4s-4.8-1.6-4.8-4z" fill="#8cae5c"/>
      <path d="M17.8 10.6h1.4a2.8 2.8 0 0 1 0 5.6h-1.4v-2h1.4a.8.8 0 0 0 0-1.6h-1.4z" fill="#f2f5f3"/>
      <path d="M9 5.4c-.6-1.4-.4-2.4.8-3.2.6 1.4.4 2.4-.8 3.2zM13 5.4c-.6-1.4-.4-2.4.8-3.2.6 1.4.4 2.4-.8 3.2z" fill="#c9d6cf"/>
    `),
    coffee: S(`
      <path d="M3.6 7.4h13.6v6.8c0 3.6-2.8 6.2-6.8 6.2s-6.8-2.6-6.8-6.2z" fill="#f7f4ee"/>
      <path d="M5.4 9.2h10v4.6c0 2.6-2 4.4-5 4.4s-5-1.8-5-4.4z" fill="#7a4a2a"/>
      <path d="M17.4 9.4h1.6a3 3 0 0 1 0 6h-1.6v-2.1h1.6a.9.9 0 0 0 0-1.8h-1.6z" fill="#f7f4ee"/>
      <path d="M8 5.2c-.7-1.5-.5-2.6.8-3.4.7 1.5.5 2.6-.8 3.4zM12.2 5.2c-.7-1.5-.5-2.6.8-3.4.7 1.5.5 2.6-.8 3.4z" fill="#cfd8d2"/>
    `),
    juice: carton("#f7d68e", "#ef8f4a", "#ef8f4a"),
    soda: can("#d94a3f", "#a3352d"),
    beer: glass("#e8ae2f",
      `<path d="M7.1 9h9.8l-.2 2.4c-1.4-1-2.8-1-4.2 0-1.6 1-3.2 1-5.6-.6z" fill="#f7f4ee"/>
       <circle cx="9" cy="7" r="1.6" fill="#f7f4ee"/>
       <circle cx="12.6" cy="5.8" r="2" fill="#f7f4ee"/>
       <circle cx="16" cy="7.2" r="1.4" fill="#f7f4ee"/>`),
    sake: S(`
      <path d="M9.8 2.6h4.4v3.6l2 3.2c.7 1.2 1 2.3 1 3.6v6a2.8 2.8 0 0 1-2.8 3H9.6a2.8 2.8 0 0 1-2.8-3v-6c0-1.3.3-2.4 1-3.6l2-3.2z" fill="#4f7c52"/>
      <rect x="7.6" y="13" width="8.8" height="5.6" rx="1" fill="#f7f4ee"/>
      <path d="M12 14.2c1.4 0 2.4.9 2.4 2s-1 2-2.4 2-2.4-.9-2.4-2 1-2 2.4-2z" fill="#c9463d"/>
    `),
    wine: S(`
      <path d="M7.4 2.6h9.2v6.2c0 2.9-1.7 5-3.8 5.5v5.1h2.8a1.3 1.3 0 0 1 0 2.6H8.4a1.3 1.3 0 0 1 0-2.6h2.8v-5.1c-2.1-.5-3.8-2.6-3.8-5.5z" fill="#c3d2da"/>
      <path d="M7.4 6.4h9.2v2.4c0 2.9-1.8 5-4.6 5s-4.6-2.1-4.6-5z" fill="#8e3350"/>
      <path d="M8.6 3.6h2.2v5.2H8.6z" fill="#ffffff" opacity=".45"/>
    `),

    /* ================= まとまりを表す絵 =================
       ある品物そのものではなく、そのくくり全体を指す絵。名前からは何も分か
       らなかった品物が、せめて自分のカテゴリの絵を借りられるように置いてある
       ——「コンソメ」が調味料だと分かっているなら、無地の箱よりは塩の容器の
       ほうがずっと近い。 */
    groceries: S(`
      <path d="M2.6 9.4h18.8l-1.7 9.4A3 3 0 0 1 16.7 21.4H7.3a3 3 0 0 1-3-2.6z" fill="#c9713f"/>
      <rect x="1.8" y="7.8" width="20.4" height="2.6" rx="1.3" fill="#a9752f"/>
      <path d="M7.6 7.8 9.4 3.2M16.4 7.8 14.6 3.2" stroke="#a9752f" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="8.6" cy="13.6" r="2.2" fill="#6cbb5c"/>
      <circle cx="13.6" cy="13" r="2.4" fill="#e0574d"/>
      <circle cx="17" cy="15.4" r="1.8" fill="#f2c14e"/>
    `),
    household: S(`
      <path d="M12.6 3.4h4.2v2.2h-4.2z" fill="#6d7a72"/>
      <path d="M6.6 6.6h6.4l3.4 2.6-3.4 2.6H6.6z" fill="#8d968f" opacity="0"/>
      <rect x="12.4" y="5.4" width="2" height="3" fill="#6d7a72"/>
      <path d="M8 11c0-1.9 1.1-3.5 2.8-4.2h5.6c1.7.7 2.8 2.3 2.8 4.2v8.6a2.2 2.2 0 0 1-2.2 2.2h-6.8A2.2 2.2 0 0 1 8 19.6z" fill="#7aa8d4"/>
      <rect x="9.6" y="12.6" width="7.6" height="5.4" rx="1" fill="#ffffff" opacity=".9"/>
      <path d="M12.6 4.4 8.2 2.6v3.6z" fill="#6d7a72"/>
      <circle cx="20.4" cy="4.6" r="1.5" fill="#a9dcf3"/>
      <circle cx="21.4" cy="8" r="1" fill="#a9dcf3"/>
    `),
    baby: S(`
      <path d="M9.6 2.6h4.8v2.2H9.6z" fill="#f2b9c9"/>
      <path d="M8.4 8.4c0-1.9 1.1-3.1 2.4-3.6h2.4c1.3.5 2.4 1.7 2.4 3.6v11.2a2.2 2.2 0 0 1-2.2 2.2h-2.8a2.2 2.2 0 0 1-2.2-2.2z" fill="#f7f4ee"/>
      <path d="M8.4 12.4h7.2v4.6H8.4z" fill="#f2b9c9"/>
      <path d="M10.4 1c.5-.7 1-1 1.6-1s1.1.3 1.6 1z" fill="#f2b9c9"/>
      <path d="M9.8 2.6h4.4l.6-1.6H9.2z" fill="#e88fa9"/>
    `),
    drink: S(`
      <path d="M5.4 7.6h13.2l-1.5 12A2.8 2.8 0 0 1 14.4 22H9.6a2.8 2.8 0 0 1-2.7-2.4z" fill="#8fd0e0"/>
      <rect x="4.4" y="5.4" width="15.2" height="2.6" rx="1.3" fill="#4fb3c4"/>
      <path d="M14.4 5.4 17.8 1.6l1.4 1.2-2.6 2.6z" fill="#e0574d"/>
      <path d="M6.6 12.2h10.8l-.5 4H7.1z" fill="#ffffff" opacity=".35"/>
    `),

    /* ================= その他 ================= */
    package: box("#d3a86e", "#b5793f",
      `<path d="M11 9.6h2v10.4h-2z" fill="#b5793f" opacity=".5"/>`),
  };

  /* ---------------- what each icon answers to ---------------- */

  /* Folded to hiragana, so each word is listed once and カタカナ・ひらがな・
     半角 spellings all land on it; kanji fold to themselves. Sorted longest
     first below, so 「洗濯洗剤」 beats 「洗剤」 and 「鶏もも肉」 never reaches
     「桃」. */
  const KEYS = [
    /* 洗剤・掃除 */
    ["dishSoap",   ["食器用洗剤", "台所用洗剤", "食器洗剤", "洗剤", "きゅきゅっと", "じょい"]],
    ["laundry",    ["洗濯洗剤", "洗たく洗剤", "衣料用洗剤", "洗濯用洗剤", "あたっく", "洗濯"]],
    ["softener",   ["柔軟剤", "じゅうなんざい", "そふらん", "はみんぐ"]],
    ["bleach",     ["漂白剤", "ひょうはくざい", "はいたー", "除菌"]],
    ["shampoo",    ["しゃんぷー"]],
    ["rinse",      ["りんす", "こんでぃしょなー", "とりーとめんと"]],
    ["bodySoap",   ["ぼでぃそーぷ", "ぼでぃーそーぷ"]],
    ["handSoap",   ["はんどそーぷ", "消毒液", "消毒"]],
    ["soapBar",    ["石鹸", "石けん", "せっけん", "そーぷ"]],
    ["toothpaste", ["歯磨き粉", "歯みがき粉", "はみがき粉", "歯磨き", "はみがき"]],
    ["toothbrush", ["歯ぶらし", "はぶらし", "歯ブラシ"]],
    ["faceWash",   ["洗顔", "せんがん", "くれんじんぐ"]],
    ["sunscreen",  ["日焼け止め", "ひやけどめ", "日やけ止め"]],
    ["toiletRoll",  ["といれっとぺーぱー", "といれぺーぱー", "といれ紙"]],
    ["tissue",      ["てぃっしゅ", "はなかみ", "鼻紙"]],
    ["kitchenRoll", ["きっちんぺーぱー", "きっちんたおる", "ぺーぱーたおる"]],
    ["wrap",     ["らっぷ", "くっきんぐしーと", "くっきんぐぺーぱー"]],
    ["foil",     ["あるみほいる", "ほいる", "あるみはく"]],
    ["sponge",   ["すぽんじ", "たわし"]],
    ["trashBag", ["ごみ袋", "ごみぶくろ", "ぽりぶくろ", "ぽり袋"]],
    ["broom",    ["掃除", "そうじ", "ほうき", "わいぱー", "くいっくる", "もっぷ"]],
    ["mask",        ["ますく", "不織布"]],
    ["toner",       ["化粧水", "けしょうすい", "ろーしょん", "化粧"]],
    ["milkyLotion", ["乳液", "にゅうえき", "くりーむ"]],
    ["diaper",   ["おむつ", "おしりふき", "生理用品", "なぷきん"]],
    ["battery",  ["電池", "でんち", "乾電池"]],
    ["bulb",     ["電球", "でんきゅう", "らいと"]],
    ["socks",    ["靴下", "くつした", "たおる", "したぎ", "下着"]],
    ["petFood",  ["どっぐふーど", "きゃっとふーど", "ぺっとふーど", "猫砂", "ねこ砂", "ぺっと"]],

    /* くくりを指す言い方。品物の名前としては当たらないが、カテゴリの名前と
       しては当たる——これがあるので、名前の分からない品物もカテゴリの絵を
       借りられる。 */
    ["groceries", ["食材", "食料品", "食料", "食品", "生鮮"]],
    ["household", ["日用品", "雑貨", "消耗品"]],
    ["baby",      ["赤ちゃん", "べびー", "乳児", "育児"]],

    /* 薬・衛生 */
    ["medicine",    ["薬", "くすり", "さぷり", "びたみん", "錠剤"]],
    ["plaster",     ["絆創膏", "ばんそうこう", "湿布", "しっぷ"]],
    ["thermometer", ["体温計", "たいおんけい"]],

    /* 乳製品・卵 */
    ["milk",    ["牛乳", "ぎゅうにゅう", "みるく"]],
    ["soyMilk", ["豆乳", "とうにゅう"]],
    ["egg",     ["卵", "たまご", "玉子"]],
    ["cheese",  ["ちーず"]],
    ["butter",  ["ばたー", "まーがりん"]],
    ["yogurt",  ["よーぐると", "しりある", "ぐらのーら"]],
    ["iceCream",["あいす", "あいすくりーむ"]],
    ["pudding", ["ぷりん", "ぜりー"]],

    /* 野菜 */
    ["tomato",  ["とまと"]],
    ["cucumber",["きゅうり", "胡瓜"]],
    ["cabbage", ["きゃべつ", "白菜", "はくさい", "れたす", "ほうれん草", "ほうれんそう", "小松菜", "こまつな", "水菜", "みずな", "にら", "春菊", "青梗菜", "ちんげん菜"]],
    ["onion",   ["玉ねぎ", "たまねぎ", "玉葱", "ねぎ", "長ねぎ", "長葱", "万能ねぎ"]],
    ["carrot",  ["にんじん", "人参", "きゃろっと"]],
    ["potato",  ["じゃがいも", "馬鈴薯", "ぽてと", "里芋", "さといも", "長芋"]],
    ["sweetPotato", ["さつまいも", "薩摩芋", "焼き芋"]],
    ["mushroom",["きのこ", "しめじ", "えのき", "まいたけ", "舞茸", "しいたけ", "椎茸", "えりんぎ", "なめこ", "まっしゅるーむ"]],
    ["corn",    ["とうもろこし", "こーん"]],
    ["eggplant",["なす", "茄子"]],
    ["pepper",  ["ぴーまん", "ぱぷりか", "ししとう"]],
    ["broccoli",["ぶろっこりー", "かりふらわー", "あすぱら"]],
    ["salad",   ["さらだ", "かっとやさい", "野菜"]],
    ["garlic",  ["にんにく", "がーりっく", "しょうが", "生姜"]],
    ["avocado", ["あぼかど"]],
    ["beans",   ["大豆", "だいず", "枝豆", "えだまめ", "もやし", "豆", "いんげん"]],

    /* 果物 */
    ["apple",     ["りんご", "林檎", "あっぷる"]],
    ["banana",    ["ばなな"]],
    ["orange",    ["みかん", "蜜柑", "おれんじ", "ぐれーぷふるーつ"]],
    ["strawberry",["いちご", "苺", "すとろべりー"]],
    ["grape",     ["ぶどう", "葡萄", "ますかっと"]],
    ["peach",     ["桃", "ぴーち"]],
    ["watermelon",["すいか", "西瓜"]],
    ["pear",      ["梨", "らふらんす"]],
    ["pineapple", ["ぱいなっぷる"]],
    ["kiwi",      ["きうい"]],
    ["melon",     ["めろん"]],
    ["lemon",     ["れもん", "らいむ", "ゆず", "柚子"]],

    /* 肉・魚 */
    ["meat",     ["肉", "にく", "牛肉", "豚肉", "ぎゅうにく", "ぶたにく", "すてーき", "ひき肉", "みんち", "挽肉", "しゃぶしゃぶ", "焼肉", "牛", "豚"]],
    ["chicken",  ["鶏", "鶏肉", "とり肉", "とりにく", "もも肉", "むね肉", "手羽", "からあげ", "唐揚げ", "ちきん", "ささみ"]],
    ["bacon",    ["べーこん"]],
    ["sausage",  ["そーせーじ", "ういんなー", "ふらんく"]],
    ["ham",      ["はむ"]],
    ["fish",     ["魚", "さかな", "鮭", "しゃけ", "さば", "鯖", "鰺", "あじ", "ぶり", "鰤", "鱈", "たら", "ひらめ", "白身魚", "切り身", "ししゃも", "干物", "さんま", "秋刀魚"]],
    ["sushi",    ["刺身", "さしみ", "寿司", "すし", "まぐろ", "鮪", "ねぎとろ", "さーもん"]],
    ["shrimp",   ["えび", "海老"]],
    ["squid",    ["いか", "烏賊"]],
    ["octopus",  ["たこ", "蛸"]],
    ["shellfish",["あさり", "しじみ", "ほたて", "帆立", "牡蠣", "貝"]],

    /* 主食 */
    ["rice",     ["米", "こめ", "ごはん", "ご飯", "らいす", "無洗米", "ぱっくご飯"]],
    ["bread",    ["ぱん", "食パン", "しょくぱん", "ぶれっど", "ろーるぱん"]],
    ["croissant",["くろわっさん", "でにっしゅ", "べーぐる"]],
    ["noodles",  ["らーめん", "中華麺", "かっぷ麺", "かっぷらーめん", "そば", "うどん", "そうめん", "焼きそば", "麺"]],
    ["pasta",    ["ぱすた", "すぱげってぃ", "まかろに"]],
    ["pot",      ["鍋", "おでん", "しちゅー", "すーぷ"]],
    ["curry",    ["かれー", "はやしらいす"]],
    ["dumpling", ["餃子", "ぎょうざ", "しゅうまい", "焼売", "春巻", "肉まん"]],
    ["bento",    ["弁当", "べんとう", "惣菜", "そうざい", "おにぎり"]],
    ["frozen",   ["冷凍", "れいとう", "氷", "こおり", "冷蔵"]],

    /* 調味料・粉 */
    ["salt",        ["塩", "しお", "胡椒", "こしょう", "砂糖", "さとう", "調味料", "だし", "出汁"]],
    ["sauceBottle", ["醤油", "しょうゆ", "そーす", "ぽん酢", "めんつゆ", "つゆ"]],
    ["ketchup",     ["けちゃっぷ"]],
    ["mayo",        ["まよねーず", "どれっしんぐ"]],
    ["tin",         ["缶詰", "かんづめ", "つな缶", "とまと缶", "れとると", "缶"]],
    ["oil",         ["油", "あぶら", "さらだ油", "おりーぶおいる", "ごま油"]],
    ["flour",       ["小麦粉", "こむぎこ", "薄力粉", "強力粉", "片栗粉", "ぱん粉", "ほっとけーきみっくす", "粉"]],
    ["honey",       ["はちみつ", "蜂蜜", "じゃむ"]],
    ["miso",        ["味噌", "みそ"]],
    ["vinegar",     ["酢", "みりん", "味醂", "料理酒"]],

    /* 菓子 */
    ["chocolate",  ["ちょこ", "ちょこれーと"]],
    ["cookie",     ["くっきー", "びすけっと", "お菓子", "おかし", "菓子"]],
    ["riceCracker",["せんべい", "煎餅", "おかき"]],
    ["candy",      ["飴", "あめ", "きゃんでぃ", "ぐみ", "がむ"]],
    ["chips",      ["ぽっぷこーん", "すなっく", "ぽてとちっぷす", "ぽてち"]],
    ["cake",       ["けーき", "まふぃん", "どーなつ", "しゅーくりーむ"]],
    ["nuts",       ["なっつ", "あーもんど", "ぴーなっつ"]],

    /* 飲みもの */
    ["water",  ["水", "みず", "みねらるうぉーたー", "天然水", "炭酸水"]],
    ["drink",  ["飲みもの", "飲み物", "飲物", "飲料", "どりんく"]],
    ["tea",    ["お茶", "おちゃ", "茶", "緑茶", "麦茶", "紅茶", "ほうじ茶"]],
    ["coffee", ["こーひー", "珈琲", "かふぇおれ"]],
    ["juice",  ["じゅーす", "野菜じゅーす"]],
    ["soda",   ["こーら", "炭酸", "さいだー", "すぽーつどりんく", "清涼飲料"]],
    ["beer",   ["びーる", "発泡酒", "ちゅーはい", "はいぼーる"]],
    ["sake",   ["酒", "日本酒", "焼酎"]],
    ["wine",   ["わいん"]],
  ];

  const FLAT = KEYS
    .flatMap(([name, words]) => words.map((w) => [KN.util.foldKana(w), name]))
    .sort((a, b) => b[0].length - a[0].length);

  /** Drawn icon for a product name, as raw SVG — or "" when nothing fits. */
  function find(name) {
    const n = KN.util.foldKana(String(name || ""));
    if (!n) return "";
    for (const [key, icon] of FLAT) if (n.includes(key)) return ICONS[icon];
    return "";
  }

  /** Nothing matched the name: a plain package, painted in whatever colour the
   *  category uses, so the row still belongs to a group by sight. */
  const fallback = (tint) => S(`
    <rect x="3.4" y="5.6" width="17.2" height="14.4" rx="2" fill="${tint || "#b9c3be"}"/>
    <rect x="3.4" y="5.6" width="17.2" height="4.2" rx="2" fill="#000000" opacity=".17"/>
    <rect x="10.9" y="9.8" width="2.2" height="10.2" fill="#000000" opacity=".13"/>
  `);

  KN.productIcons = { find, fallback, ICONS };
})();
