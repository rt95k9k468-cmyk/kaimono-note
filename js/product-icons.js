/* =========================================================
   くらしノート — drawn product icons

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

  /* ---- more silhouettes, for the second and larger half of the set ---- */

  /** A leafy head — lettuce, spinach, chinese cabbage. */
  const leafy = (dark, light) => S(`
    <path d="M12 3.2c4.6 0 7.6 3 7.6 7.6 0 5.4-3.2 9.4-7.6 9.4s-7.6-4-7.6-9.4c0-4.6 3-7.6 7.6-7.6z" fill="${dark}"/>
    <path d="M12 5.4c2.9 0 4.8 2.1 4.8 5.4 0 4-2 7.2-4.8 7.2s-4.8-3.2-4.8-7.2c0-3.3 1.9-5.4 4.8-5.4z" fill="${light}"/>
    <rect x="11.2" y="8" width="1.6" height="10" rx=".8" fill="${dark}" opacity=".45"/>
  `);

  /** A long stalk with a bulb — spring onion, leek, asparagus. */
  const stalk = (stem, tip) => S(`
    <path d="M11 2.6h2c.5 0 .9.4.9.9v9.1h-3.8V3.5c0-.5.4-.9.9-.9z" fill="${tip}"/>
    <path d="M12 12.2c2.4 0 3.9 1.7 3.9 4.3S14.4 21.8 12 21.8 8.1 19.1 8.1 16.5s1.5-4.3 3.9-4.3z" fill="${stem}"/>
    <rect x="11.4" y="13.4" width="1.2" height="7" rx=".6" fill="#ffffff" opacity=".4"/>
  `);

  /** A long root — daikon, burdock, yam. */
  const root = (body, tops) => S(`
    <path d="M12 6.4c2.3 0 3.7 1.6 3.7 4.4 0 4.6-1.6 10.6-3.7 10.6S8.3 15.4 8.3 10.8c0-2.8 1.4-4.4 3.7-4.4z" fill="${body}"/>
    <path d="M12 6.6 8.4 2.8c2.2-.5 3.3.3 3.6 2 .3-1.7 1.4-2.5 3.6-2z" fill="${tops}"/>
    <rect x="11.4" y="9" width="1.2" height="8.4" rx=".6" fill="#ffffff" opacity=".35"/>
  `);

  /** A little cluster of berries. */
  const berries = (fill, dark) => S(`
    <path d="M12.6 5.6c.5-1.6 1.8-2.5 3.6-2.6-.2 1.9-1.4 2.8-3.6 2.6z" fill="#5f9c46"/>
    <circle cx="8.6" cy="11.4" r="4" fill="${fill}"/>
    <circle cx="15.6" cy="12.4" r="4" fill="${dark}"/>
    <circle cx="11.8" cy="17" r="4.2" fill="${fill}"/>
    <circle cx="7.4" cy="10" r="1.1" fill="#ffffff" opacity=".4"/>
  `);

  /** A small flat packet — stock, seasoning, a single serving. */
  const sachet = (light, dark, mark) => S(`
    <path d="M4.6 5.2h14.8v13.6H4.6z" fill="${light}"/>
    <path d="M4.6 5.2h14.8v2.6H4.6zM4.6 16.2h14.8v2.6H4.6z" fill="${dark}"/>
    <path d="M4.6 18.8l1.2 1.4 1.2-1.4 1.2 1.4 1.2-1.4 1.2 1.4 1.2-1.4 1.2 1.4 1.2-1.4 1.2 1.4 1.2-1.4 1.2 1.4 1.2-1.4z" fill="${dark}" opacity=".7"/>
    ${mark || ""}
  `);

  /** A small squeeze tube — wasabi, ginger, garlic paste. */
  const miniTube = (light, dark) => S(`
    <rect x="10.6" y="2.4" width="2.8" height="2.4" rx=".8" fill="${dark}"/>
    <path d="M9 5h6l1.1 12.5a2.2 2.2 0 0 1-2.2 2.4h-3.8a2.2 2.2 0 0 1-2.2-2.4z" fill="${light}"/>
    <rect x="8.9" y="10.6" width="6.2" height="2.6" fill="#ffffff" opacity=".85"/>
  `);

  /** A trigger spray — cleaners, air freshener, styling spray. */
  const spray = (light, dark) => S(`
    <path d="M13 2.4h4.4a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H13z" fill="${dark}"/>
    <path d="M9.4 5.4h4.2v2.2H9.4z" fill="${dark}"/>
    <path d="M7.2 11c0-1.9 1.1-3.5 2.8-4.2h3.6c1.7.7 2.8 2.3 2.8 4.2v8.6a2.4 2.4 0 0 1-2.4 2.4H9.6a2.4 2.4 0 0 1-2.4-2.4z" fill="${light}"/>
    <rect x="8.6" y="13" width="6.8" height="5" rx="1" fill="#ffffff" opacity=".9"/>
    <path d="M7.4 6.6 4.6 4.4v4.4z" fill="${dark}" opacity=".8"/>
  `);

  /** A refill pouch, with a spout in one corner. */
  const pouch = (light, dark, mark) => S(`
    <path d="M15.6 3.4h2.2v2.2h-2.2z" fill="${dark}"/>
    <path d="M5.6 5.6h12.8a1 1 0 0 1 1 1v12.6a2.8 2.8 0 0 1-2.8 2.8H7.4a2.8 2.8 0 0 1-2.8-2.8V6.6a1 1 0 0 1 1-1z" fill="${light}"/>
    <rect x="6.8" y="11" width="10.4" height="5.4" rx="1" fill="#ffffff" opacity=".9"/>
    ${mark || ""}
  `);

  /** A cup with a lid — instant noodles, takeaway coffee. */
  const cupLid = (light, dark, band) => S(`
    <path d="M6 8h12l-1.2 11.6A2.6 2.6 0 0 1 14.2 22H9.8a2.6 2.6 0 0 1-2.6-2.4z" fill="${light}"/>
    <rect x="4.8" y="4.8" width="14.4" height="3.4" rx="1.5" fill="${dark}"/>
    <rect x="6.6" y="12" width="10.8" height="3.6" fill="${band || dark}" opacity=".75"/>
  `);

  /** A wrapped bar — chocolate, cereal bar, jerky. */
  const barWrap = (light, dark) => S(`
    <path d="M6.8 4.6h10.4v14.8H6.8z" fill="${light}"/>
    <path d="M6.8 4.6h10.4v2.8H6.8zM6.8 16.6h10.4v2.8H6.8z" fill="${dark}"/>
    <path d="M6.8 4.6 4.6 2.8v3.4zM17.2 19.4l2.2 1.8v-3.4z" fill="${dark}" opacity=".75"/>
    <rect x="8.6" y="9" width="6.8" height="5.6" rx=".8" fill="#ffffff" opacity=".8"/>
  `);

  /** A blister sheet of tablets. */
  const blister = (pill) => S(`
    <rect x="3.6" y="6.4" width="16.8" height="11.2" rx="1.8" fill="#dfe7ec"/>
    <rect x="3.6" y="6.4" width="16.8" height="11.2" rx="1.8" fill="#ffffff" opacity=".45"/>
    <circle cx="8" cy="10" r="1.7" fill="${pill}"/><circle cx="12" cy="10" r="1.7" fill="${pill}"/>
    <circle cx="16" cy="10" r="1.7" fill="${pill}"/><circle cx="8" cy="14" r="1.7" fill="${pill}"/>
    <circle cx="12" cy="14" r="1.7" fill="${pill}"/><circle cx="16" cy="14" r="1.7" fill="${pill}"/>
  `);

  /** A folded cloth — towels, dusters, flannels. */
  const cloth = (light, dark) => S(`
    <rect x="3.2" y="6" width="17.6" height="12.6" rx="2.2" fill="${light}"/>
    <rect x="3.2" y="9.4" width="17.6" height="1.8" fill="${dark}" opacity=".6"/>
    <rect x="3.2" y="13" width="17.6" height="1.8" fill="${dark}" opacity=".6"/>
    <path d="M3.2 6h17.6v2.2H3.2z" fill="${dark}" opacity=".35"/>
  `);

  /** A plate with something on it. */
  const plate = (food) => S(`
    ${food || ""}
    <path d="M2.6 14.6h18.8c0 3.1-2.4 5.2-6 5.2H8.6c-3.6 0-6-2.1-6-5.2z" fill="#e2e9ee"/>
    <rect x="2" y="13.4" width="20" height="2" rx="1" fill="#f2f6f8"/>
  `);

  /** A stack of slices — sliced cheese, ham, bread. */
  const slices = (light, dark) => S(`
    <rect x="4" y="10.6" width="16" height="8.4" rx="1.8" fill="${dark}"/>
    <rect x="4" y="8.2" width="16" height="8.4" rx="1.8" fill="${light}"/>
    <rect x="4" y="5.8" width="16" height="8.4" rx="1.8" fill="${dark}" opacity=".55"/>
    <rect x="4" y="5.8" width="16" height="8.4" rx="1.8" fill="${light}" opacity=".65"/>
  `);

  /** Something on a skewer. */
  const skewer = (fill, dark) => S(`
    <rect x="11.2" y="2.4" width="1.6" height="19.2" rx=".8" fill="#c9a06a"/>
    <rect x="6.6" y="4.4" width="10.8" height="4.6" rx="2.3" fill="${fill}"/>
    <rect x="6.6" y="10" width="10.8" height="4.6" rx="2.3" fill="${dark}"/>
    <rect x="6.6" y="15.6" width="10.8" height="4.6" rx="2.3" fill="${fill}"/>
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

    /* 保存袋: the zip is the whole picture. */
    zipBag: S(`
      <path d="M5 6.8h14v12.6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="#b3d3e4"/>
      <rect x="4.2" y="3.8" width="15.6" height="3.4" rx="1.2" fill="#5f96bb"/>
      <rect x="5.8" y="5.1" width="12.4" height="1" rx=".5" fill="#ffffff" opacity=".9"/>
      <rect x="7.4" y="10.4" width="9.2" height="6.4" rx="1" fill="#ffffff" opacity=".55"/>
    `),

    razor: S(`
      <rect x="10.6" y="9.4" width="2.8" height="11.8" rx="1.4" fill="#5f7f9c"/>
      <rect x="10.6" y="15.4" width="2.8" height="2.2" fill="#4a6379"/>
      <path d="M6.4 4.2h11.2a1.4 1.4 0 0 1 1.4 1.4v3.4a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 9V5.6a1.4 1.4 0 0 1 1.4-1.4z" fill="#7fb3d5"/>
      <rect x="5" y="7.9" width="14" height="1.5" fill="#dfe7ec"/>
    `),

    cottonSwab: S(`
      <rect x="7.9" y="6.6" width="1.1" height="5.2" fill="#c4bda9"/>
      <rect x="11.45" y="5.8" width="1.1" height="6" fill="#c4bda9"/>
      <rect x="15" y="6.6" width="1.1" height="5.2" fill="#c4bda9"/>
      <circle cx="8.45" cy="6.4" r="1.7" fill="#f4f1e6"/>
      <circle cx="12" cy="5.6" r="1.7" fill="#f4f1e6"/>
      <circle cx="15.55" cy="6.4" r="1.7" fill="#f4f1e6"/>
      <rect x="5.4" y="10.6" width="13.2" height="10.2" rx="1.8" fill="#7fb3d5"/>
      <rect x="5.4" y="10.6" width="13.2" height="2.8" rx="1.4" fill="#5f96bb"/>
    `),

    /* 消臭剤: the gel pot, with the smell going the right way for once. */
    deodorant: S(`
      <path d="M6.4 10.6h11.2v8.2A2.4 2.4 0 0 1 15.2 21.2H8.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#cbdde8"/>
      <rect x="5.4" y="8.6" width="13.2" height="2.6" rx="1.2" fill="#7fb3d5"/>
      <path d="M8.4 13.2h7.2v4.4a1.6 1.6 0 0 1-1.6 1.6h-4a1.6 1.6 0 0 1-1.6-1.6z" fill="#8fd0c4"/>
      <rect x="8.9" y="2.6" width="1.4" height="4.4" rx=".7" fill="#9dbccd" transform="rotate(-16 9.6 4.8)"/>
      <rect x="13.7" y="2.6" width="1.4" height="4.4" rx=".7" fill="#9dbccd" transform="rotate(16 14.4 4.8)"/>
    `),

    /* 蚊取り線香. Nothing else in a Japanese cupboard is a green spiral. */
    insect: S(`
      <path d="M12 3.2A8.8 8.8 0 1 1 3.2 12 8.81 8.81 0 0 1 12 3.2zm0 2.5A6.3 6.3 0 1 0 18.3 12 6.3 6.3 0 0 0 12 5.7z" fill="#5cb85c"/>
      <path d="M12 7.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2.3A2.2 2.2 0 1 0 14.2 12 2.2 2.2 0 0 0 12 9.8z" fill="#3f9440"/>
      <circle cx="12" cy="12" r="1.1" fill="#5cb85c"/>
    `),

    stationery: S(`
      <rect x="3.6" y="4.6" width="11.6" height="15.4" rx="1.6" fill="#f7f4ea"/>
      <rect x="3.6" y="4.6" width="2.6" height="15.4" rx="1.3" fill="#5f96bb"/>
      <rect x="7.8" y="8.4" width="5.4" height="1.3" rx=".65" fill="#cfd9e0"/>
      <rect x="7.8" y="11.4" width="5.4" height="1.3" rx=".65" fill="#cfd9e0"/>
      <path d="M18.4 4.4 20.6 6l-6.5 8.9-2.7.9.5-2.8z" fill="#e0a94f"/>
      <path d="M11.9 15.1l-.5 2.8 2.7-.9z" fill="#3f3a2f"/>
    `),

    cream: carton("#fbf7ec", "#e0574d", "#e0574d"),

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

    /* ================= 大豆製品・和のもの ================= */

    /* The styrofoam tray with its lid still on. Beans are what says 納豆
       rather than 豆腐 — same tray, quite different contents. */
    natto: S(`
      <rect x="3.6" y="8.2" width="16.8" height="10.4" rx="1.6" fill="#f4f1ea"/>
      <rect x="5.6" y="10" width="12.8" height="6.8" rx="1" fill="#8c5a2b"/>
      <circle cx="8.4" cy="12.4" r="1.1" fill="#b5793f"/>
      <circle cx="11.8" cy="14.2" r="1.1" fill="#b5793f"/>
      <circle cx="15.2" cy="12.1" r="1.1" fill="#c08a4c"/>
      <circle cx="16.2" cy="14.8" r=".9" fill="#b5793f"/>
      <rect x="2.8" y="5.4" width="18.4" height="3" rx="1.2" fill="#c9463d"/>
    `),

    /* The block, sitting in its water. Almost white, so the tray behind it
       carries the shape — a white square on a white card is nothing. */
    tofu: S(`
      <rect x="2.8" y="7" width="18.4" height="12.4" rx="2" fill="#8fbdd4"/>
      <rect x="4.4" y="8.6" width="15.2" height="9.2" rx="1.2" fill="#cfe4ee"/>
      <rect x="6" y="5.4" width="12" height="11.8" rx="1.2" fill="#e2ddcb"/>
      <rect x="6" y="5.4" width="12" height="8.6" rx="1.2" fill="#fdfcf5"/>
    `),

    /* 海苔: sheets, stacked slightly out of true. */
    nori: S(`
      <rect x="5" y="6.8" width="15" height="11.4" rx=".8" fill="#41604f"/>
      <rect x="4" y="5.8" width="15" height="11.4" rx=".8" fill="#2b4237"/>
      <path d="M6 8h11v1.3H6zM6 10.8h11v1.3H6zM6 13.6h11v1.3H6z" fill="#ffffff" opacity=".1"/>
    `),

    konjac: S(`
      <rect x="3.6" y="7.8" width="16.8" height="9.2" rx="2.2" fill="#bfb49b"/>
      <rect x="3.6" y="7.8" width="16.8" height="3" rx="2.2" fill="#cec5af"/>
      <circle cx="7.6" cy="13.2" r=".85" fill="#6f6552"/>
      <circle cx="11.4" cy="14.6" r=".7" fill="#6f6552"/>
      <circle cx="14.8" cy="12.6" r=".85" fill="#6f6552"/>
      <circle cx="17.2" cy="14.8" r=".6" fill="#6f6552"/>
    `),

    /* かまぼこ on its board: the pink rim is the whole recognition. */
    fishCake: S(`
      <path d="M5 16.4a7 7 0 0 1 14 0z" fill="#fbfaf3"/>
      <path d="M5 16.4a7 7 0 0 1 14 0h-1.9a5.1 5.1 0 0 0-10.2 0z" fill="#f0929c"/>
      <rect x="2.8" y="16.4" width="18.4" height="3.2" rx="1.3" fill="#c9a45c"/>
    `),

    pickles: jar("#e8dfc4", "#c9463d",
      `<path d="M8 12.2c1.4-.7 2.6.3 4-.1s2.6-1 4 .3v3.4c-1.4-.8-2.6.2-4 .6s-2.6-.6-4-.2z" fill="#d9552f"/>
       <circle cx="10.2" cy="14.8" r=".7" fill="#8fce7c"/>
       <circle cx="14.4" cy="13.6" r=".6" fill="#8fce7c"/>`),

    mochi: S(`
      <ellipse cx="12" cy="16.4" rx="7.8" ry="4.6" fill="#d4c9a8"/>
      <ellipse cx="12" cy="15.4" rx="7.8" ry="3.8" fill="#fdfcf5"/>
      <ellipse cx="12" cy="10.2" rx="5.6" ry="3.6" fill="#d4c9a8"/>
      <ellipse cx="12" cy="9.4" rx="5.6" ry="3" fill="#fdfcf5"/>
      <ellipse cx="9.8" cy="8.4" rx="1.8" ry=".9" fill="#ffffff"/>
    `),

    /* だしパック・鰹節: the paper sachet with flakes showing through. */
    dashiPack: S(`
      <rect x="4.8" y="5.2" width="14.4" height="15.6" rx="1.4" fill="#efe6d2"/>
      <rect x="4.8" y="5.2" width="14.4" height="3" rx="1.4" fill="#8c5a2b"/>
      <rect x="7.2" y="10.2" width="9.6" height="1.5" rx=".75" fill="#a9752f"/>
      <circle cx="9.4" cy="15.2" r="1.1" fill="#c9a45c"/>
      <circle cx="13.2" cy="16.8" r="1" fill="#c9a45c"/>
      <circle cx="15.4" cy="14.4" r=".85" fill="#d4b478"/>
    `),

    /* ふりかけ: the foil sachet, and what makes it worth buying showing
       through the window. */
    furikake: S(`
      <rect x="4.8" y="6.4" width="14.4" height="14.4" rx="1.3" fill="#5c8f6f"/>
      <rect x="4" y="3.6" width="16" height="3.2" rx=".8" fill="#3f5b4a"/>
      <rect x="6.6" y="10" width="10.8" height="7.4" rx="1" fill="#f7f4ea"/>
      <circle cx="9" cy="12.4" r=".8" fill="#e0574d"/>
      <circle cx="12.4" cy="13.8" r=".7" fill="#3f5b4a"/>
      <circle cx="15" cy="11.9" r=".7" fill="#e0a94f"/>
      <circle cx="10.6" cy="15.6" r=".6" fill="#e0a94f"/>
      <circle cx="14.2" cy="15.4" r=".6" fill="#e0574d"/>
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

    /* ================= 野菜（続き） =================
       The first pass put four leaves under one cabbage and every root under
       one carrot, which is fine until the list is long enough that half of it
       is the same picture. These are the ones worth telling apart in an
       aisle. */
    lettuce:    leafy("#7ab648", "#b7dd8c"),
    chineseCabbage: leafy("#cfe08a", "#f0f3c8"),
    spinach: S(`
      <path d="M12 21.4V9" stroke="#3f7a2e" stroke-width="1.6" fill="none"/>
      <path d="M11.6 12.4C8.4 12.4 6 10.2 5.6 6.4c3.8.2 6 2.4 6 6z" fill="#4e9636"/>
      <path d="M12.4 12.4c3.2 0 5.6-2.2 6-6-3.8.2-6 2.4-6 6z" fill="#5faa42"/>
      <path d="M11.6 17.2c-2.6 0-4.6-1.8-5-4.8 3.1.2 5 1.9 5 4.8z" fill="#4e9636"/>
      <path d="M12.4 17.2c2.6 0 4.6-1.8 5-4.8-3.1.2-5 1.9-5 4.8z" fill="#5faa42"/>
    `),
    springOnion: stalk("#f2f4e6", "#4e9636"),
    asparagus:   stalk("#79b44e", "#4e8f34"),
    celery:      stalk("#c3dd8e", "#6ea63e"),
    daikon:      root("#f4f6f0", "#5faa42"),
    burdock:     root("#a5794a", "#5faa42"),
    turnip: S(`
      <path d="M12 8.6c3 0 4.9 2.2 4.9 5.4S15 21 12 21s-4.9-3.8-4.9-7 1.9-5.4 4.9-5.4z" fill="#f4f6f0"/>
      <path d="M11.4 8.8 8 3.4c2.5.1 3.6 1.4 3.4 3.6.6-2.1 1.9-3 4-2.6z" fill="#5faa42"/>
    `),
    lotusRoot: S(`
      <circle cx="12" cy="12.6" r="8.4" fill="#f0e6d2"/>
      <circle cx="12" cy="12.6" r="6.6" fill="#faf3e4"/>
      <circle cx="12" cy="7.6" r="1.5" fill="#e0d0b0"/><circle cx="16.4" cy="10.6" r="1.5" fill="#e0d0b0"/>
      <circle cx="14.8" cy="15.8" r="1.5" fill="#e0d0b0"/><circle cx="9.2" cy="15.8" r="1.5" fill="#e0d0b0"/>
      <circle cx="7.6" cy="10.6" r="1.5" fill="#e0d0b0"/><circle cx="12" cy="12.8" r="1.5" fill="#e0d0b0"/>
    `),
    pumpkin: S(`
      <ellipse cx="12" cy="14" rx="8.4" ry="7" fill="#2f7a3e"/>
      <ellipse cx="12" cy="14" rx="4.4" ry="7" fill="#3e9450"/>
      <ellipse cx="6.4" cy="14" rx="2.6" ry="6.2" fill="#3e9450"/>
      <ellipse cx="17.6" cy="14" rx="2.6" ry="6.2" fill="#3e9450"/>
      <rect x="11.2" y="3.6" width="1.8" height="3.8" rx=".9" fill="#7a5a3a"/>
    `),
    zucchini: S(`
      <path d="M6.4 18.4c-1.4-1.4-1-3.6 1.2-5.8l5.6-5.6c2.2-2.2 4.4-2.6 5.8-1.2s1 3.6-1.2 5.8l-5.6 5.6c-2.2 2.2-4.4 2.6-5.8 1.2z" fill="#3f8c46"/>
      <path d="M9 15.8 15.8 9" stroke="#5faa42" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M18.6 5.8 20.4 4" stroke="#4e8f34" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `),
    okra: S(`
      <path d="M12 3.4c1 0 1.6.6 1.6 1.8v1.2c1.4.7 2.2 2 2.2 3.8 0 4-1.8 10.4-3.8 10.4S8.2 14.2 8.2 10.2c0-1.8.8-3.1 2.2-3.8V5.2c0-1.2.6-1.8 1.6-1.8z" fill="#4e9636"/>
      <path d="M12 8.2c.6 0 1 3 1 5.6s-.4 4.6-1 4.6-1-2-1-4.6.4-5.6 1-5.6z" fill="#65ad4a"/>
    `),
    sprout: S(`
      <path d="M11.2 21.4V10.6h1.6v10.8z" fill="#e8efd8"/>
      <path d="M11.4 11.6C8.2 11.2 6.2 9 6 5.4c3.6.4 5.4 2.4 5.4 6.2z" fill="#5faa42"/>
      <path d="M12.6 11.6c3.2-.4 5.2-2.6 5.4-6.2-3.6.4-5.4 2.4-5.4 6.2z" fill="#7ac25a"/>
      <ellipse cx="12" cy="21" rx="5" ry="1" fill="#d8e2c4"/>
    `),
    herb: S(`
      <path d="M12 21.4V8.6" stroke="#3f7a2e" stroke-width="1.5" fill="none"/>
      <ellipse cx="8.4" cy="8.4" rx="3.5" ry="2.4" fill="#4e9636" transform="rotate(-28 8.4 8.4)"/>
      <ellipse cx="15.6" cy="9.6" rx="3.5" ry="2.4" fill="#5faa42" transform="rotate(28 15.6 9.6)"/>
      <ellipse cx="12" cy="4.8" rx="3" ry="2.2" fill="#65ad4a"/>
    `),
    bambooShoot: S(`
      <path d="M12 2.6c3.4 3.4 5.2 8 5.2 13.4 0 3.4-1.9 5.4-5.2 5.4s-5.2-2-5.2-5.4c0-5.4 1.8-10 5.2-13.4z" fill="#e5d5a8"/>
      <path d="M12 6.2c1.8 2.6 2.8 5.8 2.8 9.4 0 2.4-1 3.8-2.8 3.8s-2.8-1.4-2.8-3.8c0-3.6 1-6.8 2.8-9.4z" fill="#f3e8c6"/>
      <path d="M9.6 9.4c1.4-.4 2.6-.4 4 0M9 13.4c1.8-.5 3.4-.5 5.2 0" stroke="#d8c496" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),
    chili: S(`
      <path d="M12.6 5.6c.6-1.7 1.9-2.6 3.8-2.6-.2 2-1.4 2.9-3.8 2.6z" fill="#5f9c46"/>
      <path d="M12 5.6c3.6 0 6.4 3 6.4 7 0 5.2-3.6 9-8 9-2 0-3.4-1-3.4-2.4 0-1.2.9-2 2.3-2 2.6 0 4.5-2 4.5-5 0-2.4-1-4-2.6-4.8z" fill="#d34a3a"/>
    `),
    ginger: S(`
      <path d="M9.4 21c-2.2 0-3.6-1.6-3.6-4 0-3 1.6-5 4-5 .6 0 1.1.1 1.6.3-.6-1.4-.4-2.8.6-4.2 1.4-2 3.4-2.6 5-1.4 1.4 1 1.6 3 .4 4.8-.6.9-1.4 1.5-2.3 1.8 1.4.7 2.2 2 2.2 3.8 0 2.4-1.6 4-4 4z" fill="#d9ab68"/>
      <path d="M10.4 14.6c1.6 0 2.6 1 2.6 2.6s-1 2.6-2.6 2.6-2.6-1-2.6-2.6 1-2.6 2.6-2.6z" fill="#e8c68e" opacity=".7"/>
    `),
    yam: root("#e8d5b0", "#5faa42"),
    peas: S(`
      <path d="M5.6 10.4c0-2.6 2.4-4.6 6.4-4.6s6.4 2 6.4 4.6-2.4 6.6-6.4 6.6-6.4-4-6.4-6.6z" fill="#5faa42"/>
      <path d="M6.8 10.6c0-1.8 2-3.2 5.2-3.2s5.2 1.4 5.2 3.2-2 5.2-5.2 5.2-5.2-3.4-5.2-5.2z" fill="#7ac25a"/>
      <circle cx="9" cy="11" r="1.7" fill="#4e9636"/><circle cx="12" cy="11.6" r="1.7" fill="#4e9636"/>
      <circle cx="15" cy="11" r="1.7" fill="#4e9636"/>
    `),

    /* ================= 果物（続き） ================= */
    cherry: S(`
      <path d="M12 4.4c2.4 1.6 3.6 4 3.6 7.4h-1.4c0-2.8-.8-4.8-2.2-6z" fill="#5f9c46"/>
      <path d="M12 4.4c-2.4 1.6-3.6 4-3.6 7.4h1.4c0-2.8.8-4.8 2.2-6z" fill="#5f9c46"/>
      <circle cx="7.6" cy="16.2" r="4.4" fill="#d3384a"/>
      <circle cx="16.4" cy="16.2" r="4.4" fill="#b82c3c"/>
      <circle cx="6.2" cy="14.6" r="1.2" fill="#ffffff" opacity=".38"/>
    `),
    blueberry: berries("#5a7fd4", "#3f5ea8"),
    raspberry: berries("#e0526e", "#b8384f"),
    mango: S(`
      <path d="M14.6 4.6c3.6 1.2 5.6 4.2 5.6 8 0 5.2-3.8 8.8-8.6 8.8-3.6 0-6-2-6-5 0-4 2.2-7.2 6-9.4 1.2-.7 2.2-1.4 3-2.4z" fill="#f0a12e"/>
      <path d="M13.4 8c2 1.4 3 3.4 3 6 0 3-1.8 4.8-4.4 4.8-1.4 0-2.2-.7-2.2-1.8 0-2.4 1.2-6 3.6-9z" fill="#f6c05a"/>
      <path d="M14.6 4.6c1-1.2 2.4-1.7 4.2-1.6-.3 2-1.6 3-4.2 3z" fill="#5f9c46"/>
    `),
    persimmon: S(`
      <circle cx="12" cy="14.4" r="7.4" fill="#e8802e"/>
      ${SHINE}
      <path d="M8 7.4h8v1.6H8z" fill="#4e8f34" opacity="0"/>
      <path d="M12 5.4c-.9 2.2-2.6 3.2-5.2 3 .2-2.4 1.9-3.4 5.2-3zM12 5.4c.9 2.2 2.6 3.2 5.2 3-.2-2.4-1.9-3.4-5.2-3z" fill="#4e8f34"/>
      <rect x="11.3" y="3" width="1.4" height="2.8" rx=".7" fill="#7a5a3a"/>
    `),
    fig: S(`
      <path d="M12 6.6c4 0 6.8 3.2 6.8 7.4S15.4 21.6 12 21.6s-6.8-3.4-6.8-7.6S8 6.6 12 6.6z" fill="#7e4a76"/>
      <path d="M12 10c2 0 3.4 1.8 3.4 4.2S14 18.4 12 18.4s-3.4-1.8-3.4-4.2S10 10 12 10z" fill="#c76f8e" opacity=".6"/>
      <path d="M12 6.8c-1-2.2-2.8-3.2-5.4-3 .3 2.4 2 3.4 5.4 3zM12 6.8c1-2.2 2.8-3.2 5.4-3-.3 2.4-2 3.4-5.4 3z" fill="#4e8f34"/>
    `),
    chestnut: S(`
      <path d="M12 4.6c4.6 0 7.8 3.2 7.8 7.6 0 4-2.8 6.6-7.8 6.6s-7.8-2.6-7.8-6.6c0-4.4 3.2-7.6 7.8-7.6z" fill="#8c5a2b"/>
      <path d="M12 7.4c3 0 5 1.8 5 4.6 0 2.4-1.8 3.8-5 3.8s-5-1.4-5-3.8c0-2.8 2-4.6 5-4.6z" fill="#b5793f" opacity=".7"/>
      <path d="M4.6 18.2h14.8v2H4.6z" fill="#6b4420"/>
      <rect x="11.3" y="2.6" width="1.4" height="2.6" rx=".7" fill="#6b4420"/>
    `),
    driedFruit: bag("#d9a659", "#b5793f",
      `<circle cx="9.6" cy="14" r="1.7" fill="#8c4a5a"/><circle cx="13.6" cy="13" r="1.7" fill="#c2703a"/>
       <circle cx="12" cy="17" r="1.7" fill="#8c4a5a"/>`),

    /* ================= 肉・魚（続き） ================= */
    steak: S(`
      <path d="M4.4 12.4c0-4 3.4-6.6 8.2-6.6 4.6 0 7 2 7 5 0 3.8-3.4 7.4-8.6 7.4-4.2 0-6.6-2.2-6.6-5.8z" fill="#c2523f"/>
      <path d="M7.2 12.6c0-2.2 2.2-3.8 5.4-3.8 2.8 0 4.4 1.2 4.4 3 0 2.2-2.2 4.4-5.6 4.4-2.6 0-4.2-1.4-4.2-3.6z" fill="#e07f66"/>
      <path d="M16.4 6.6c2 .6 3.2 1.8 3.2 3.4 0 1-.4 1.9-1.1 2.6-.2-2.6-1-4.6-2.1-6z" fill="#f2e0c8"/>
    `),
    minced: S(`
      <path d="M4.6 15.4c0-3.4 3.2-5.6 7.4-5.6s7.4 2.2 7.4 5.6c0 2.8-2.6 4.6-7.4 4.6s-7.4-1.8-7.4-4.6z" fill="#cf6552"/>
      <path d="M6.4 8.4c0-1 .8-1.6 1.8-1.6s1.8.6 1.8 1.6-.8 2-1.8 2-1.8-1-1.8-2zM10.4 6.4c0-1 .8-1.6 1.8-1.6s1.8.6 1.8 1.6-.8 2-1.8 2-1.8-1-1.8-2zM14.2 8.4c0-1 .8-1.6 1.8-1.6s1.8.6 1.8 1.6-.8 2-1.8 2-1.8-1-1.8-2z" fill="#e08a76"/>
    `),
    hamburgSteak: S(`
      <ellipse cx="12" cy="14.6" rx="8.2" ry="5.4" fill="#8c4a2b"/>
      <ellipse cx="12" cy="13.4" rx="8.2" ry="5.4" fill="#a85c33"/>
      <path d="M8 12.2c1.6-1 3.6-1.4 6-1.2" stroke="#c2793f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M12 6.6c2.4 0 3.6 1 3.6 2.4H8.4c0-1.4 1.2-2.4 3.6-2.4z" fill="#e0a04c" opacity=".8"/>
    `),
    meatball: S(`
      <circle cx="7.6" cy="15" r="4.2" fill="#a85c33"/>
      <circle cx="16.2" cy="15" r="4.2" fill="#a85c33"/>
      <circle cx="12" cy="9.4" r="4.2" fill="#c2703a"/>
      <circle cx="10.6" cy="8" r="1.2" fill="#ffffff" opacity=".3"/>
    `),
    yakitori: skewer("#c2793f", "#8c4a2b"),
    liver: S(`
      <path d="M5.2 12c0-3.6 3-6 7.4-6 4.2 0 6.8 2 6.8 5.2 0 4.2-3.6 7.8-8 7.8-3.8 0-6.2-2.6-6.2-7z" fill="#8c3a4a"/>
      <path d="M8 12.4c0-2 1.8-3.4 4.4-3.4 2.2 0 3.6 1 3.6 2.6 0 2-1.8 4-4.6 4-2.2 0-3.4-1.2-3.4-3.2z" fill="#a84f5e" opacity=".8"/>
    `),
    lamb: S(`
      <path d="M6 14.6c0-3.6 2.8-6 7-6s7 2.4 7 6-2.8 5.6-7 5.6-7-2-7-5.6z" fill="#c2523f"/>
      <path d="M8.6 14.6c0-2 1.8-3.4 4.4-3.4s4.4 1.4 4.4 3.4-1.8 3.2-4.4 3.2-4.4-1.2-4.4-3.2z" fill="#e07f66"/>
      <path d="M6.4 13.4 3 6.4c2.6-.4 4.2.8 4.8 3.6z" fill="#f2e8d8"/>
    `),
    tuna: tin("#5f8fbf", "#3f6b96"),
    mentaiko: S(`
      <path d="M4.6 13.6c0-2.6 3-4.4 7.4-4.4s7.4 1.8 7.4 4.4-3 5.4-7.4 5.4-7.4-2.8-7.4-5.4z" fill="#e0607a"/>
      <path d="M6.6 13.6c0-1.6 2.2-2.8 5.4-2.8s5.4 1.2 5.4 2.8-2.2 3.6-5.4 3.6-5.4-2-5.4-3.6z" fill="#f0899c" opacity=".8"/>
      <circle cx="9.4" cy="13.4" r=".7" fill="#c24460"/><circle cx="12" cy="14.4" r=".7" fill="#c24460"/>
      <circle cx="14.6" cy="13.4" r=".7" fill="#c24460"/>
    `),
    roe: S(`
      <path d="M4.8 14.4c0-3 3.2-5.2 7.2-5.2s7.2 2.2 7.2 5.2-3.2 5.4-7.2 5.4-7.2-2.4-7.2-5.4z" fill="#e8813a"/>
      <circle cx="8.4" cy="13.4" r="1.7" fill="#f2a45c"/><circle cx="12" cy="12.8" r="1.7" fill="#f2a45c"/>
      <circle cx="15.6" cy="13.4" r="1.7" fill="#f2a45c"/><circle cx="10.2" cy="16.4" r="1.7" fill="#f2a45c"/>
      <circle cx="13.8" cy="16.4" r="1.7" fill="#f2a45c"/>
    `),
    eel: S(`
      <path d="M3.4 9.6h17.2v8.8H3.4z" fill="#6b3f22"/>
      <path d="M3.4 9.6h17.2v2.4H3.4z" fill="#8c5a2b"/>
      <path d="M5.6 13.4h12.8M5.6 15.8h12.8" stroke="#4a2a14" stroke-width="1" fill="none" opacity=".5"/>
      <path d="M3.4 9.6h17.2v.9H3.4z" fill="#c2793f" opacity=".7"/>
    `),
    crab: S(`
      <ellipse cx="12" cy="13.6" rx="6.4" ry="4.6" fill="#e0603f"/>
      <path d="M5.6 11.4 2.6 8.2l1.6-1.6 3.2 3zM18.4 11.4l3-3.2-1.6-1.6-3.2 3z" fill="#e0603f"/>
      <path d="M3.4 6.2c1.4-1 2.6-.8 3.6.6-1.4 1-2.6.8-3.6-.6zM20.6 6.2c-1.4-1-2.6-.8-3.6.6 1.4 1 2.6.8 3.6-.6z" fill="#c24a2e"/>
      <path d="M7.4 18 6 21M12 18.4V21.6M16.6 18l1.4 3" stroke="#c24a2e" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="10" cy="12.2" r=".9" fill="#ffffff" opacity=".5"/>
    `),
    shirasu: S(`
      <path d="M4 14c0-2.4 3.6-4 8-4s8 1.6 8 4-3.6 4.4-8 4.4-8-2-8-4.4z" fill="#eef2f4"/>
      <path d="M7 13.4c1.4-.6 3-.6 4.4 0M9 16c1.4-.6 3-.6 4.4 0M12.4 12.4c1.2-.5 2.6-.5 3.8 0" stroke="#b7c6cf" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),
    katsuobushi: bag("#e2d0b4", "#c2a578",
      `<path d="M8.6 12.6c1.6.6 3 .6 4.6 0M8.6 15.4c1.6.6 3 .6 4.6 0M11 14c1.6.6 3 .6 4.6 0" stroke="#a8804c" stroke-width="1" fill="none" stroke-linecap="round"/>`),

    /* ================= パン・主食（続き） ================= */
    baguette: S(`
      <path d="M4.6 18.6c-1.2-1.2-.9-3.2 1-5.1l7.3-7.3c1.9-1.9 3.9-2.2 5.1-1s.9 3.2-1 5.1l-7.3 7.3c-1.9 1.9-3.9 2.2-5.1 1z" fill="#d3a05a"/>
      <path d="M8.4 12.4l1.8 1.8M10.8 10l1.8 1.8M13.2 7.6 15 9.4" stroke="#f0d6a8" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `),
    sandwich: S(`
      <path d="M3.4 17.6 12 5.4l8.6 12.2z" fill="#f0dcb2"/>
      <path d="M6.4 15.6 12 7.6l5.6 8z" fill="#f7ecd2"/>
      <path d="M6.9 14.8h10.2l1 1.4H5.9z" fill="#7ac25a"/>
      <path d="M8.2 12.8h7.6l.9 1.3H7.3z" fill="#e0725c"/>
    `),
    toast: S(`
      <path d="M6.2 6.6c0-2 2.4-3.4 5.8-3.4s5.8 1.4 5.8 3.4v11.8A2.6 2.6 0 0 1 15.2 21H8.8a2.6 2.6 0 0 1-2.6-2.6z" fill="#f0d6a2"/>
      <path d="M7.6 8.4c0-1.4 1.8-2.4 4.4-2.4s4.4 1 4.4 2.4v9.4c0 .8-.6 1.4-1.4 1.4H9c-.8 0-1.4-.6-1.4-1.4z" fill="#f9ecd2"/>
      <rect x="9.4" y="9.6" width="5.2" height="3.6" rx=".8" fill="#e8c063"/>
    `),
    bagel: S(`
      <circle cx="12" cy="12.8" r="8.4" fill="#c98f4e"/>
      <circle cx="12" cy="12.8" r="6.6" fill="#e0ab6a"/>
      <circle cx="12" cy="12.8" r="2.6" fill="#f4f6f0"/>
      <circle cx="9" cy="8.4" r=".8" fill="#f2e2c0"/><circle cx="15.4" cy="9.4" r=".8" fill="#f2e2c0"/>
      <circle cx="14.6" cy="16.6" r=".8" fill="#f2e2c0"/><circle cx="8.4" cy="15.4" r=".8" fill="#f2e2c0"/>
    `),
    sweetBun: S(`
      <ellipse cx="12" cy="13.6" rx="8.4" ry="6.6" fill="#d9a259"/>
      <ellipse cx="12" cy="12.4" rx="8.4" ry="6.6" fill="#eec489"/>
      <ellipse cx="9.4" cy="10" rx="2.4" ry="1.5" fill="#f9e5c4" opacity=".8" transform="rotate(-22 9.4 10)"/>
      <circle cx="12" cy="12.6" r="1.5" fill="#8c5a2b" opacity=".55"/>
    `),
    melonBun: S(`
      <circle cx="12" cy="12.4" r="8.2" fill="#f0da96"/>
      <path d="M4.4 10.4h15.2M4.4 15.4h15.2M9 5.2v15.6M15 5.2v15.6" stroke="#cfae5c" stroke-width="1.1" fill="none"/>
    `),
    pizza: S(`
      <path d="M12 3.2 21.4 19c-2.6 1.6-5.9 2.4-9.4 2.4S5.2 20.6 2.6 19z" fill="#f0c86a"/>
      <path d="M12 6.4 19 18.4c-2 1.1-4.4 1.7-7 1.7s-5-.6-7-1.7z" fill="#e8a03e"/>
      <circle cx="12" cy="12.4" r="1.6" fill="#d34a3a"/><circle cx="8.6" cy="16.4" r="1.6" fill="#d34a3a"/>
      <circle cx="15.4" cy="16.4" r="1.6" fill="#d34a3a"/>
    `),
    burger: S(`
      <path d="M4.2 9.8c0-3.4 3.3-5.6 7.8-5.6s7.8 2.2 7.8 5.6z" fill="#e0a45c"/>
      <rect x="3.6" y="10" width="16.8" height="2.4" rx="1.2" fill="#7ac25a"/>
      <rect x="4" y="12.2" width="16" height="3.4" rx="1.4" fill="#a85c33"/>
      <path d="M4.2 15.6h15.6c0 2.6-2.8 4.2-7.8 4.2s-7.8-1.6-7.8-4.2z" fill="#e0a45c"/>
      <circle cx="8.6" cy="7.6" r=".7" fill="#f9e5c4"/><circle cx="12.4" cy="6.8" r=".7" fill="#f9e5c4"/>
      <circle cx="15.8" cy="7.8" r=".7" fill="#f9e5c4"/>
    `),
    hotdog: S(`
      <path d="M3.2 15.4c0-2.6 3.9-4.4 8.8-4.4s8.8 1.8 8.8 4.4-3.9 4.6-8.8 4.6-8.8-2-8.8-4.6z" fill="#e0a45c"/>
      <path d="M5 14.6c0-1.6 3.1-2.8 7-2.8s7 1.2 7 2.8-3.1 3-7 3-7-1.4-7-3z" fill="#c2523f"/>
      <path d="M6 12.6c1.6 1.4 3.2 2.2 5 2.4M10 11.8c1.6 1.4 3.2 2.2 5 2.4" stroke="#f0c020" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),
    cereal: box("#e0603f", "#b8402a",
      `<circle cx="8.8" cy="14.6" r="1.5" fill="#f0d6a2"/><circle cx="12" cy="16" r="1.5" fill="#f0d6a2"/>
       <circle cx="15.2" cy="14.6" r="1.5" fill="#f0d6a2"/><circle cx="11.6" cy="12.8" r="1.5" fill="#f0d6a2"/>`),
    pancake: S(`
      <ellipse cx="12" cy="17" rx="8" ry="3" fill="#c98f4e"/>
      <ellipse cx="12" cy="14.6" rx="8" ry="3" fill="#e0ab6a"/>
      <ellipse cx="12" cy="12.2" rx="8" ry="3" fill="#eec489"/>
      <rect x="10.2" y="8.4" width="3.6" height="2.6" rx=".8" fill="#f0d873"/>
    `),
    onigiri: S(`
      <path d="M12 3.6c1 0 1.8.5 2.4 1.5l6 10.4c1.2 2.1.1 4.1-2.4 4.1H6c-2.5 0-3.6-2-2.4-4.1l6-10.4c.6-1 1.4-1.5 2.4-1.5z" fill="#f7f9f6"/>
      <path d="M7.6 14.6h8.8v5.1H7.6z" fill="#2f4a3a"/>
      <circle cx="10.4" cy="9.4" r=".8" fill="#e0d4c0"/>
    `),
    cupNoodle: cupLid("#e8dcc8", "#c2402e", "#d3623a"),

    /* ================= 調味料（続き） ================= */
    wasabi:      miniTube("#7ac25a", "#4e8f34"),
    gingerTube:  miniTube("#e8c063", "#c29a34"),
    garlicTube:  miniTube("#f2ecd8", "#c9bd94"),
    mustard:     miniTube("#f0c832", "#c99a12"),
    karashi:     miniTube("#e8a83a", "#bd7d1c"),
    chiliOil:    bottle("#d34a3a", "#a8322a"),
    sesameOil:   bottle("#c9903a", "#9c6a1e"),
    fishSauce:   bottle("#b5834a", "#8c5f2a"),
    balsamic:    bottle("#5a3a4a", "#3f2634"),
    tabasco:     bottle("#d34a3a", "#7a2a20"),
    doubanjiang: jar("#c2402e", "#8c2a1e",
      `<circle cx="9.8" cy="13.4" r=".8" fill="#8c2a1e"/><circle cx="12.6" cy="14.4" r=".8" fill="#8c2a1e"/>
       <circle cx="14.4" cy="12.8" r=".8" fill="#8c2a1e"/><circle cx="11" cy="15.6" r=".8" fill="#8c2a1e"/>`),
    gochujang:   jar("#d34a3a", "#9c2f22"),
    curryRoux: box("#c9722a", "#9c521c",
      `<path d="M7.4 11.6h9.2v6.8H7.4z" fill="#e8a45c"/><path d="M7.4 15h9.2M12 11.6v6.8" stroke="#c9722a" stroke-width="1.1" fill="none"/>`),
    spice: S(`
      <rect x="8.6" y="2.6" width="6.8" height="2.6" rx=".9" fill="#8c5a2b"/>
      <rect x="7.4" y="5" width="9.2" height="16.4" rx="2" fill="#e8d0a2"/>
      <rect x="7.4" y="5" width="9.2" height="2.6" fill="#c9a56a"/>
      <rect x="8.8" y="9.6" width="6.4" height="8.6" rx=".8" fill="#c9722a" opacity=".65"/>
      <circle cx="10.4" cy="3.6" r=".5" fill="#5a3a1c"/><circle cx="12" cy="3.6" r=".5" fill="#5a3a1c"/>
      <circle cx="13.6" cy="3.6" r=".5" fill="#5a3a1c"/>
    `),
    consomme: box("#e0a83a", "#b57f18",
      `<rect x="8" y="12" width="3.4" height="3.4" rx=".6" fill="#8c5a2b"/><rect x="12.6" y="12" width="3.4" height="3.4" rx=".6" fill="#8c5a2b"/>`),
    stockPack: sachet("#e8dcc0", "#c2a578"),
    yeast:     sachet("#f0e4d0", "#c9ab7a"),

    /* ================= 乳製品（続き） ================= */
    slicedCheese: slices("#f5cf5e", "#e0ab2e"),
    pizzaCheese:  bag("#f7e3a2", "#e0c063",
      `<path d="M8.4 12.6h7.2v1.4H8.4zM9 15.2h6.4v1.4H9z" fill="#e8b93a"/>`),
    creamCheese: S(`
      <path d="M4.4 8.6h15.2v10.2A2.4 2.4 0 0 1 17.2 21H6.8a2.4 2.4 0 0 1-2.4-2.2z" fill="#f7f2e4"/>
      <path d="M4.4 8.6 6.6 4.4h10.8l2.2 4.2z" fill="#7fc4dd"/>
      <rect x="7.4" y="12" width="9.2" height="4.6" rx="1" fill="#ffffff" opacity=".85"/>
    `),
    camembert: S(`
      <circle cx="12" cy="13" r="8.2" fill="#e0d6b8"/>
      <circle cx="12" cy="12.4" r="8.2" fill="#f9f4e4"/>
      <path d="M12 4.8a8.2 8.2 0 0 1 7.1 12.3L12 13z" fill="#f0e0b0"/>
    `),
    margarine: S(`
      <rect x="4" y="8.4" width="16" height="10.6" rx="2" fill="#f5d872"/>
      <rect x="4" y="8.4" width="16" height="3.4" rx="2" fill="#f0c63a"/>
      <rect x="6.8" y="13" width="10.4" height="3.6" rx="1" fill="#ffffff" opacity=".8"/>
    `),
    condensedMilk: S(`
      <rect x="9.4" y="2.4" width="5.2" height="2.6" rx=".9" fill="#e0e6ea"/>
      <path d="M7 8.4c0-1.6 1-3 2.6-3.6h4.8c1.6.6 2.6 2 2.6 3.6v11.2A2.4 2.4 0 0 1 14.6 22H9.4A2.4 2.4 0 0 1 7 19.6z" fill="#f2f6f8"/>
      <rect x="8.2" y="11" width="7.6" height="6" rx="1" fill="#f0d873"/>
    `),
    drinkYogurt: carton("#f7f4ec", "#d3a0bd", "#e8c0d4"),

    /* ================= 菓子（続き） ================= */
    gummy: bag("#e0526e", "#b8384f",
      `<path d="M9 13.6c0-1.2 1-2 2.2-2h.4c1.2 0 2.2.8 2.2 2v2.6c0 1.2-1 2-2.2 2h-.4c-1.2 0-2.2-.8-2.2-2z" fill="#f2b0c0"/>`),
    marshmallow: S(`
      <rect x="4.4" y="9.4" width="7" height="7" rx="2.6" fill="#eceeec"/>
      <rect x="4.4" y="9" width="7" height="7" rx="2.6" fill="#ffffff"/>
      <rect x="12.6" y="9.4" width="7" height="7" rx="2.6" fill="#f7d3de"/>
      <rect x="8.4" y="14" width="7" height="7" rx="2.6" fill="#f4f7f8"/>
    `),
    caramel: S(`
      <rect x="5" y="8.6" width="6.4" height="6.4" rx="1.2" fill="#c9803a" transform="rotate(-12 8.2 11.8)"/>
      <rect x="11.4" y="11" width="6.4" height="6.4" rx="1.2" fill="#a8622a" transform="rotate(14 14.6 14.2)"/>
      <rect x="9.6" y="4.6" width="6.4" height="6.4" rx="1.2" fill="#e0a45c" transform="rotate(6 12.8 7.8)"/>
    `),
    jelly: S(`
      <path d="M7 6.4h10l-1 12.2A2.6 2.6 0 0 1 13.4 21h-2.8a2.6 2.6 0 0 1-2.6-2.4z" fill="#e0607a" opacity=".85"/>
      <rect x="5.8" y="4.2" width="12.4" height="2.6" rx="1.2" fill="#c2c9cd"/>
      <ellipse cx="10" cy="10.6" rx="1.4" ry="1" fill="#ffffff" opacity=".45"/>
    `),
    dorayaki: S(`
      <ellipse cx="12" cy="15" rx="8.2" ry="4" fill="#c98f4e"/>
      <rect x="3.8" y="11.4" width="16.4" height="3.6" fill="#7e4a3a"/>
      <ellipse cx="12" cy="11.4" rx="8.2" ry="4" fill="#e0ab6a"/>
      <ellipse cx="9.6" cy="9.8" rx="2.2" ry="1.2" fill="#f2cf9a" opacity=".7" transform="rotate(-14 9.6 9.8)"/>
    `),
    daifuku: S(`
      <ellipse cx="12" cy="13.4" rx="8.4" ry="6.6" fill="#e0e4e0"/>
      <ellipse cx="12" cy="12.8" rx="8.4" ry="6.6" fill="#ffffff"/>
      <ellipse cx="9.4" cy="10.6" rx="2.4" ry="1.4" fill="#f2f0ec" opacity=".9" transform="rotate(-22 9.4 10.6)"/>
      <ellipse cx="12" cy="14.6" rx="3.4" ry="2.4" fill="#c98fb0" opacity=".35"/>
    `),
    dango: S(`
      <rect x="11.2" y="2.4" width="1.6" height="19.2" rx=".8" fill="#c9a06a"/>
      <circle cx="12" cy="6.6" r="3.6" fill="#f7f4ec"/>
      <circle cx="12" cy="12.6" r="3.6" fill="#e0c9a2"/>
      <circle cx="12" cy="18.6" r="3.6" fill="#bcd390"/>
    `),
    manju: S(`
      <path d="M12 6c4.6 0 7.8 2.8 7.8 6.8 0 3.6-2.8 5.8-7.8 5.8s-7.8-2.2-7.8-5.8C4.2 8.8 7.4 6 12 6z" fill="#f0e0c2"/>
      <path d="M4.4 18h15.2v1.8H4.4z" fill="#d9c49c"/>
      <circle cx="12" cy="10.6" r="1.8" fill="#c2503a" opacity=".7"/>
    `),
    castella: S(`
      <path d="M4 8.4h16v9.4A2.2 2.2 0 0 1 17.8 20H6.2A2.2 2.2 0 0 1 4 17.8z" fill="#f0d68e"/>
      <rect x="4" y="16.6" width="16" height="3.4" rx="1" fill="#8c5a2b"/>
      <path d="M4 8.4h16v1.6H4z" fill="#e0bd63"/>
      <circle cx="8.4" cy="12.4" r=".7" fill="#e8cb84"/><circle cx="12.4" cy="13.4" r=".7" fill="#e8cb84"/>
      <circle cx="16" cy="12" r=".7" fill="#e8cb84"/>
    `),
    cracker: S(`
      <rect x="3.4" y="6" width="10.4" height="10.4" rx="1.6" fill="#e8c47e" transform="rotate(-10 8.6 11.2)"/>
      <rect x="10.4" y="8.4" width="10.4" height="10.4" rx="1.6" fill="#f0d69a" transform="rotate(9 15.6 13.6)"/>
      <circle cx="13.6" cy="11.6" r=".7" fill="#c9a05c"/><circle cx="17.2" cy="13" r=".7" fill="#c9a05c"/>
      <circle cx="15" cy="15.6" r=".7" fill="#c9a05c"/>
    `),
    pocky: S(`
      <rect x="4.6" y="4.6" width="14.8" height="16" rx="1.6" fill="#d3486a"/>
      <rect x="4.6" y="4.6" width="14.8" height="3.6" rx="1.6" fill="#b02f52"/>
      <rect x="7.4" y="10" width="1.8" height="8" rx=".9" fill="#f0dcb2"/>
      <rect x="11.1" y="10" width="1.8" height="8" rx=".9" fill="#f0dcb2"/>
      <rect x="14.8" y="10" width="1.8" height="8" rx=".9" fill="#f0dcb2"/>
      <rect x="7.4" y="10" width="1.8" height="5" rx=".9" fill="#8c5a2b"/>
      <rect x="11.1" y="10" width="1.8" height="5" rx=".9" fill="#8c5a2b"/>
      <rect x="14.8" y="10" width="1.8" height="5" rx=".9" fill="#8c5a2b"/>
    `),
    gum: S(`
      <rect x="6.4" y="3.6" width="11.2" height="16.8" rx="1.6" fill="#4fb3a8"/>
      <rect x="6.4" y="3.6" width="11.2" height="4.4" rx="1.6" fill="#2f8f86"/>
      <rect x="8.4" y="10" width="7.2" height="7.4" rx="1" fill="#ffffff" opacity=".85"/>
    `),
    dryFood: bag("#c9a06a", "#a8804c",
      `<path d="M8.6 13.6c1.8-.8 3.4-.8 5.2 0M9.4 16.4c1.8-.8 3.4-.8 5.2 0" stroke="#8c5a2b" stroke-width="1.1" fill="none" stroke-linecap="round"/>`),

    /* ================= 掃除・洗濯（続き） ================= */
    cleanerSpray: spray("#7fc4dd", "#3f8fb0"),
    kitchenSpray: spray("#8fd07a", "#4e9636"),
    bathCleaner:  spray("#a9a2e0", "#6f66b8"),
    toiletCleaner: S(`
      <path d="M8.6 2.6h6.8l-.5 3.4H9.1z" fill="#4a90d9"/>
      <path d="M7.8 8.4c0-1.6.9-3 2.4-3.6h3.6c1.5.6 2.4 2 2.4 3.6 0 1.4-.5 2.4-1.6 3.6l-2 2.2v6.4a2.2 2.2 0 0 1-2.2 2.2 2.2 2.2 0 0 1-2.2-2.2v-6.4l-1.9-2.2c-1-1.2-1.5-2.2-1.5-3.6z" fill="#5fa8dd" opacity="0"/>
      <path d="M9.6 6h4.8c1.5.8 2.4 2.2 2.4 3.9v9.7A2.4 2.4 0 0 1 14.4 22H9.6a2.4 2.4 0 0 1-2.4-2.4V9.9c0-1.7.9-3.1 2.4-3.9z" fill="#5fa8dd"/>
      <rect x="8.6" y="12.4" width="6.8" height="5" rx="1" fill="#ffffff" opacity=".9"/>
    `),
    mold: spray("#e0e6ea", "#4a90d9"),
    pipeCleaner: jug("#3f7ac4", "#2a5d9c"),
    cleanser: S(`
      <rect x="6.6" y="3.4" width="10.8" height="2.6" rx="1" fill="#3f8fb0"/>
      <rect x="5.8" y="5.6" width="12.4" height="16" rx="2.2" fill="#8fd0e0"/>
      <rect x="7.4" y="10.6" width="9.2" height="6.4" rx="1" fill="#ffffff" opacity=".9"/>
      <circle cx="9.4" cy="4.6" r=".5" fill="#2f6f8c"/><circle cx="12" cy="4.6" r=".5" fill="#2f6f8c"/>
      <circle cx="14.6" cy="4.6" r=".5" fill="#2f6f8c"/>
    `),
    wipes: S(`
      <rect x="3.2" y="6.6" width="17.6" height="12.4" rx="2.4" fill="#7fc4dd"/>
      <rect x="7.4" y="4.4" width="9.2" height="4.4" rx="1.6" fill="#5aa8c4"/>
      <path d="M9.6 5.6h4.8c.6 1.6-.2 2.6-2.4 2.6s-3-1-2.4-2.6z" fill="#ffffff"/>
      <rect x="5.6" y="12.6" width="12.8" height="4.2" rx="1" fill="#ffffff" opacity=".85"/>
    `),
    rubberGloves: S(`
      <path d="M6.4 21.6a1.8 1.8 0 0 1-1.8-1.8v-6.6c0-1 .3-1.8.9-2.6l.8-1V4.8a1.4 1.4 0 0 1 2.8 0v3.4h.6V3.6a1.4 1.4 0 0 1 2.8 0v4.6h.6V4.4a1.4 1.4 0 0 1 2.8 0v3.8h.6V6.6a1.4 1.4 0 0 1 2.8 0v7.6c0 3.6-1.6 5.8-4.4 7.4z" fill="#f0899c"/>
      <path d="M5 17.4h12.4c-.5 1.8-1.6 3.2-3.4 4.2H6.4A1.8 1.8 0 0 1 4.6 19.8v-1.4z" fill="#d3627a" opacity=".5"/>
    `),
    scrubBrush: S(`
      <rect x="3.6" y="8.4" width="16.8" height="5" rx="2" fill="#c9803a"/>
      <path d="M4.6 13.4h1.6v5.2H4.6zM7.4 13.4H9v5.2H7.4zM10.2 13.4h1.6v5.2h-1.6zM13 13.4h1.6v5.2H13zM15.8 13.4h1.6v5.2h-1.6zM18.6 13.4h1.2v5.2h-1.2z" fill="#e8d0a2"/>
      <rect x="3.6" y="8.4" width="16.8" height="1.8" rx=".9" fill="#a8622a"/>
    `),
    bucket: S(`
      <path d="M4.6 8.4h14.8l-1.6 11.2a2.4 2.4 0 0 1-2.4 2H8.6a2.4 2.4 0 0 1-2.4-2z" fill="#5aa8c4"/>
      <rect x="3.4" y="6.2" width="17.2" height="2.6" rx="1.3" fill="#3f8fb0"/>
      <path d="M6.6 6.2c0-3 2.4-4.6 5.4-4.6s5.4 1.6 5.4 4.6" stroke="#3f8fb0" stroke-width="1.5" fill="none"/>
    `),
    mop: S(`
      <rect x="11.1" y="2.2" width="1.8" height="11" rx=".9" fill="#a8804c"/>
      <path d="M5.6 13h12.8v2.4H5.6z" fill="#4a90d9"/>
      <path d="M6.2 15.4h1.5l-.4 6h-1.5zM9 15.4h1.5l-.3 6H8.7zM11.8 15.4h1.5l-.2 6h-1.5zM14.6 15.4h1.5l-.1 6h-1.5zM17.2 15.4h1.4l.1 6h-1.4z" fill="#8fc4e8"/>
    `),
    vacuum: S(`
      <path d="M5.4 20.4c-1.6 0-2.8-1.2-2.8-2.8V13c0-2.8 2-4.6 5-4.6h4.2c3.4 0 5.6 2 5.6 5.2v3.8c0 1.8-1.2 3-3 3z" fill="#5a6f7a"/>
      <circle cx="7.6" cy="20" r="2.2" fill="#3f4f5a"/>
      <circle cx="16.2" cy="20" r="2.2" fill="#3f4f5a"/>
      <path d="M14.4 8.4V5.2c0-1.4 1-2.4 2.4-2.4h2.6v2.6h-2.4v3z" fill="#8fa0aa"/>
      <rect x="6.4" y="11.4" width="7" height="3.4" rx="1" fill="#8fd0e0" opacity=".8"/>
    `),
    laundryNet: S(`
      <circle cx="12" cy="12.6" r="8.4" fill="#dfe7ec"/>
      <circle cx="12" cy="12.6" r="8.4" fill="none" stroke="#a8b8c2" stroke-width="1.2"/>
      <path d="M6 8.4h12M4.6 12.6h14.8M6 16.8h12M8.4 5.4v14.4M12 4.2v16.8M15.6 5.4v14.4" stroke="#a8b8c2" stroke-width=".9" fill="none"/>
    `),
    hanger: S(`
      <path d="M12 3.4c1.8 0 3 1.1 3 2.7 0 1.3-.8 2.2-2.2 2.6v1.5h-1.6V7.5c1.4-.1 2.2-.6 2.2-1.4 0-.7-.6-1.1-1.4-1.1s-1.4.5-1.4 1.3H8.8c0-1.7 1.3-2.9 3.2-2.9z" fill="#8c9aa4"/>
      <path d="M12 9.6 21 17c.9.7.4 2.1-.7 2.1H3.7c-1.1 0-1.6-1.4-.7-2.1z" fill="#a8b8c2"/>
    `),
    clothespin: S(`
      <path d="M7.6 3.2h3.2l1.6 8.4-1.2 9.2H7.4L6 11.6z" fill="#f0899c" transform="rotate(-8 9.2 12)"/>
      <path d="M13.2 3.2h3.2L18 11.6l-1.4 9.2h-3.8l-1.2-9.2z" fill="#7fc4dd" transform="rotate(8 14.8 12)"/>
      <rect x="8.6" y="10.4" width="7" height="2" rx="1" fill="#b0bcc4"/>
    `),
    dishcloth: cloth("#eef3f5", "#a8c4d0"),
    paperPlate: S(`
      <circle cx="12" cy="12.6" r="9" fill="#dbe4e8"/>
      <circle cx="12" cy="12.6" r="7.6" fill="#f7fafb"/>
      <circle cx="12" cy="12.6" r="4.6" fill="none" stroke="#dbe4e8" stroke-width="1.3"/>
    `),
    paperCup: S(`
      <path d="M6 5.4h12l-1.4 13.4A2.6 2.6 0 0 1 14 21.2h-4a2.6 2.6 0 0 1-2.6-2.4z" fill="#f2f6f8"/>
      <rect x="5.4" y="4" width="13.2" height="2.4" rx="1.2" fill="#dbe4e8"/>
      <rect x="6.4" y="10" width="11.2" height="3" fill="#8fd0e0" opacity=".7"/>
    `),
    chopsticks: S(`
      <rect x="8.4" y="2.4" width="1.8" height="19.2" rx=".9" fill="#d9b47e" transform="rotate(-6 9.3 12)"/>
      <rect x="13.8" y="2.4" width="1.8" height="19.2" rx=".9" fill="#c9a06a" transform="rotate(6 14.7 12)"/>
      <rect x="6.4" y="3" width="11.2" height="3.4" rx="1.2" fill="#c2503a" opacity=".85"/>
    `),
    straw: S(`
      <path d="M9.6 21.4 14.6 4.6" stroke="#e0526e" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M14.6 4.6 18 2.2" stroke="#e0526e" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M10.6 17.8l4.4-11.4" stroke="#ffffff" stroke-width="1" fill="none" opacity=".5"/>
    `),
    toothpick: S(`
      <path d="M8 8.6h8l-.9 11.2a2 2 0 0 1-2 1.8h-2.2a2 2 0 0 1-2-1.8z" fill="#dfe7ec"/>
      <rect x="9" y="2.2" width="1" height="7" rx=".5" fill="#d9b47e" transform="rotate(-9 9.5 5.7)"/>
      <rect x="11.5" y="1.8" width="1" height="7.4" rx=".5" fill="#c9a06a"/>
      <rect x="14" y="2.2" width="1" height="7" rx=".5" fill="#d9b47e" transform="rotate(9 14.5 5.7)"/>
    `),
    container: S(`
      <path d="M4.6 9.4h14.8v9.4A2.6 2.6 0 0 1 16.8 21.4H7.2a2.6 2.6 0 0 1-2.6-2.6z" fill="#cfe4ee" opacity=".9"/>
      <rect x="3.2" y="6.6" width="17.6" height="3.2" rx="1.4" fill="#4fb3c4"/>
      <rect x="6.6" y="12.4" width="10.8" height="4" rx="1" fill="#ffffff" opacity=".6"/>
    `),
    dryingAgent: sachet("#e4eaee", "#a8b8c2"),
    detergentPod: S(`
      <rect x="3.6" y="6.4" width="16.8" height="13.6" rx="2.4" fill="#4a90d9"/>
      <rect x="3.6" y="6.4" width="16.8" height="4" rx="2.4" fill="#2f6fb0"/>
      <circle cx="9" cy="14.4" r="2.4" fill="#8fd0e0"/>
      <circle cx="15" cy="14.4" r="2.4" fill="#f0899c"/>
    `),

    /* ================= 衛生・美容（続き） ================= */
    serum:      flask("#f0d3a2", "#c9a86a"),
    lipBalm: S(`
      <rect x="9.6" y="2.6" width="4.8" height="6.4" rx="1.6" fill="#e0526e"/>
      <rect x="8.6" y="8.6" width="6.8" height="12.8" rx="1.8" fill="#c2c9cd"/>
      <rect x="8.6" y="8.6" width="6.8" height="2.6" rx="1" fill="#8c9aa4"/>
    `),
    lipstick: S(`
      <path d="M9.4 3.2c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1v6.4H9.4z" fill="#d3384a"/>
      <rect x="8.4" y="9.4" width="7.2" height="3" rx="1" fill="#e0c063"/>
      <rect x="8.8" y="12.2" width="6.4" height="9.2" rx="1.4" fill="#3f4f5a"/>
    `),
    foundation: S(`
      <rect x="9.6" y="2.4" width="4.8" height="3" rx="1" fill="#8c9aa4"/>
      <path d="M7 9.4c0-1.8 1-3.3 2.6-4h4.8c1.6.7 2.6 2.2 2.6 4v10.2A2.4 2.4 0 0 1 14.6 22H9.4A2.4 2.4 0 0 1 7 19.6z" fill="#e8c0a2"/>
      <rect x="8.4" y="12.4" width="7.2" height="5" rx="1" fill="#ffffff" opacity=".8"/>
    `),
    mascara: S(`
      <rect x="10.2" y="2.2" width="3.6" height="8.4" rx="1.2" fill="#3f4f5a"/>
      <rect x="9.4" y="10.4" width="5.2" height="11.2" rx="1.8" fill="#5a6f7a"/>
      <rect x="9.4" y="10.4" width="5.2" height="2.4" rx="1" fill="#3f4f5a"/>
    `),
    makeupRemover: pump("#f0c0d0", "#c98fa8"),
    cottonPad: S(`
      <circle cx="12" cy="12.6" r="8.4" fill="#e4eaee"/>
      <circle cx="12" cy="12.6" r="6.8" fill="#fbfdfd"/>
      <circle cx="12" cy="12.6" r="3.4" fill="none" stroke="#e4eaee" stroke-width="1.4"/>
    `),
    nailClipper: S(`
      <path d="M6.4 8.4h11.2l1.4 4.4-1.4 4.4H6.4L5 12.8z" fill="#c2c9cd"/>
      <rect x="8.6" y="4.4" width="6.8" height="4.4" rx="1.4" fill="#8c9aa4"/>
      <rect x="6.4" y="11.8" width="11.2" height="1.8" fill="#8c9aa4"/>
    `),
    hairOil:   flask("#e8c063", "#c29a34"),
    hairSpray: spray("#c9a2e0", "#8f6fc4"),
    hairWax: jar("#f0e0c2", "#c9a56a"),
    comb: S(`
      <rect x="3.4" y="5.6" width="17.2" height="4.2" rx="1.6" fill="#5a6f7a"/>
      <path d="M4.6 9.8h1.2v8.6H4.6zM7.4 9.8h1.2v8.6H7.4zM10.2 9.8h1.2v8.6h-1.2zM13 9.8h1.2v8.6H13zM15.8 9.8H17v8.6h-1.2zM18.4 9.8h1.2v8.6h-1.2z" fill="#8c9aa4"/>
    `),
    hairTie: S(`
      <circle cx="12" cy="12.6" r="7.4" fill="none" stroke="#e0526e" stroke-width="3.4"/>
      <circle cx="12" cy="12.6" r="7.4" fill="none" stroke="#f0899c" stroke-width="1.2"/>
    `),
    floss: S(`
      <circle cx="12" cy="12.6" r="8.4" fill="#4fb3c4"/>
      <circle cx="12" cy="12.6" r="4.6" fill="#ffffff"/>
      <circle cx="12" cy="12.6" r="1.6" fill="#4fb3c4"/>
      <path d="M20.2 10.4 22 6.6" stroke="#ffffff" stroke-width="1.2" fill="none"/>
    `),
    mouthwash: S(`
      <rect x="9.6" y="2.2" width="4.8" height="2.6" rx=".9" fill="#3f8fb0"/>
      <path d="M8 6.4h8c1.4.9 2.2 2.4 2.2 4.2v8.6A2.6 2.6 0 0 1 15.6 22H8.4a2.6 2.6 0 0 1-2.6-2.8V10.6c0-1.8.8-3.3 2.2-4.2z" fill="#7fc4dd"/>
      <rect x="7.4" y="11.6" width="9.2" height="5.6" rx="1" fill="#ffffff" opacity=".9"/>
      <rect x="9.4" y="4.6" width="5.2" height="2" fill="#3f8fb0"/>
    `),
    bathSalt: sachet("#c9a2e0", "#8f6fc4",
      `<circle cx="12" cy="12" r="2.6" fill="#ffffff" opacity=".55"/>`),
    towel: cloth("#a9d8e8", "#5aa8c4"),
    perfume: S(`
      <rect x="10.4" y="2.2" width="3.2" height="2.8" rx=".8" fill="#c9a06a"/>
      <rect x="10.9" y="4.6" width="2.2" height="2.2" fill="#c9a06a"/>
      <path d="M7.4 10.4c0-1.8 1-3.2 2.6-3.8h4c1.6.6 2.6 2 2.6 3.8v8.8A2.6 2.6 0 0 1 14 21.8h-4a2.6 2.6 0 0 1-2.6-2.6z" fill="#f0c0a2"/>
      <rect x="8.8" y="12.4" width="6.4" height="4.4" rx="1" fill="#ffffff" opacity=".65"/>
    `),
    handCream: tube("#f0c0d0", "#c98fa8"),
    babyWipes: S(`
      <rect x="3.2" y="7.4" width="17.6" height="11.6" rx="2.4" fill="#f7d3de"/>
      <rect x="7.4" y="5.2" width="9.2" height="4.4" rx="1.6" fill="#e0a8bd"/>
      <path d="M9.6 6.4h4.8c.6 1.6-.2 2.6-2.4 2.6s-3-1-2.4-2.6z" fill="#ffffff"/>
    `),

    /* ================= 薬・健康（続き） ================= */
    pillSheet:  blister("#e0603f"),
    coldMedicine: box("#e0603f", "#b8402a",
      `<rect x="8.4" y="12" width="7.2" height="5.4" rx="1" fill="#ffffff" opacity=".9"/>
       <path d="M11.2 13.2h1.6v3h-1.6zM10.2 14.2h3.6v1h-3.6z" fill="#e0603f"/>`),
    stomachMedicine: box("#4fb3a8", "#2f8f86",
      `<rect x="8.4" y="12" width="7.2" height="5.4" rx="1" fill="#ffffff" opacity=".9"/>`),
    eyeDrops: S(`
      <rect x="10" y="2" width="4" height="3.4" rx="1.1" fill="#4a90d9"/>
      <path d="M8.6 6.4h6.8l1 12.6A2.6 2.6 0 0 1 13.8 22h-3.6a2.6 2.6 0 0 1-2.6-3z" fill="#8fd0e0"/>
      <rect x="8" y="11.6" width="8" height="4.6" rx=".9" fill="#ffffff" opacity=".9"/>
    `),
    supplement: S(`
      <rect x="7.6" y="2.6" width="8.8" height="3" rx="1" fill="#e0a83a"/>
      <rect x="6.4" y="5.4" width="11.2" height="16.2" rx="2.4" fill="#f0c86a"/>
      <rect x="8" y="10.4" width="8" height="6.6" rx="1" fill="#ffffff" opacity=".9"/>
      <circle cx="12" cy="13.6" r="1.7" fill="#e0a83a"/>
    `),
    ointment: tube("#e8e0d0", "#b8ac94"),
    bandage: S(`
      <rect x="3.6" y="9.6" width="16.8" height="5.4" rx="2.6" fill="#f0dcb2"/>
      <rect x="3.6" y="9.6" width="4.4" height="5.4" rx="2.6" fill="#e0c48e"/>
      <rect x="16" y="9.6" width="4.4" height="5.4" rx="2.6" fill="#e0c48e"/>
      <circle cx="9.6" cy="11.4" r=".55" fill="#c9a86a"/><circle cx="12" cy="11.4" r=".55" fill="#c9a86a"/>
      <circle cx="14.4" cy="11.4" r=".55" fill="#c9a86a"/><circle cx="9.6" cy="13.4" r=".55" fill="#c9a86a"/>
      <circle cx="12" cy="13.4" r=".55" fill="#c9a86a"/><circle cx="14.4" cy="13.4" r=".55" fill="#c9a86a"/>
    `),
    disinfectant: pump("#8fd0e0", "#4a90d9"),
    throatCandy: bag("#e8c063", "#c29a34",
      `<circle cx="10.4" cy="14.4" r="2" fill="#f2e0a2"/><circle cx="14" cy="15.6" r="2" fill="#f2e0a2"/>`),
    heatPad: sachet("#e0a83a", "#b57f18",
      `<path d="M12 9.8c1.6 1.8 2.4 3.2 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1 .8-2.4 2.4-4.2z" fill="#e0603f"/>`),
    testKit: S(`
      <rect x="3.6" y="8.4" width="16.8" height="7.4" rx="2" fill="#f2f6f8"/>
      <rect x="3.6" y="8.4" width="16.8" height="7.4" rx="2" fill="none" stroke="#dbe4e8" stroke-width="1.2"/>
      <rect x="6" y="10.6" width="4.4" height="3" rx=".8" fill="#c2c9cd"/>
      <rect x="13" y="11.4" width="1.4" height="1.4" fill="#e0526e"/>
      <rect x="15.6" y="11.4" width="1.4" height="1.4" fill="#e0526e"/>
    `),

    /* ================= 飲みもの（続き） ================= */
    cocoa:      cupLid("#8c5a2b", "#6b4420", "#a8703a"),
    matcha:     can("#4e9636", "#356f26", "#65ad4a"),
    oolong:     bottle("#8c6a3a", "#6b4a22"),
    milkTea:    bottle("#d9b47e", "#b08c56"),
    latte:      cupLid("#e8dcc8", "#8c5a2b", "#c9a06a"),
    energyDrink: can("#e0a83a", "#b57f18", "#3f4f5a"),
    tonic: S(`
      <rect x="10.2" y="1.8" width="3.6" height="2.4" rx=".8" fill="#c9a06a"/>
      <path d="M9.6 4.2h4.8v2.2c1.5.8 2.4 2.2 2.4 4v9.2A2.4 2.4 0 0 1 14.4 22H9.6a2.4 2.4 0 0 1-2.4-2.4v-9.2c0-1.8.9-3.2 2.4-4z" fill="#8c5a2b"/>
      <rect x="7.6" y="12" width="8.8" height="4.6" rx=".8" fill="#f0d873"/>
    `),
    protein: S(`
      <rect x="7.4" y="2.4" width="9.2" height="3" rx="1" fill="#3f4f5a"/>
      <rect x="5.6" y="5.2" width="12.8" height="16.4" rx="2.6" fill="#5a6f7a"/>
      <rect x="7.2" y="10" width="9.6" height="7" rx="1.2" fill="#ffffff" opacity=".9"/>
      <path d="M9.4 12.4h5.2v1.6H9.4zM10.4 15h3.2v1.2h-3.2z" fill="#5a6f7a" opacity=".7"/>
    `),
    whisky: S(`
      <rect x="9.8" y="1.8" width="4.4" height="2.6" rx=".8" fill="#3f2a1a"/>
      <path d="M9.4 4.4h5.2v3.2c2.1 1 3.4 2.8 3.4 5v7.4A2.4 2.4 0 0 1 15.6 22H8.4A2.4 2.4 0 0 1 6 19.6v-7.4c0-2.2 1.3-4 3.4-5z" fill="#a8703a"/>
      <rect x="7" y="12.4" width="10" height="5.2" rx=".9" fill="#f0e0c2" opacity=".9"/>
    `),
    plum: S(`
      <rect x="9.4" y="2" width="5.2" height="3" rx="1" fill="#8c5a2b"/>
      <path d="M7.4 6.4h9.2c1.2 1 1.9 2.4 1.9 4.1v8.9A2.6 2.6 0 0 1 15.9 22H8.1a2.6 2.6 0 0 1-2.6-2.6v-8.9c0-1.7.7-3.1 1.9-4.1z" fill="#c9803a" opacity=".92"/>
      <circle cx="12" cy="15.6" r="2.4" fill="#8c3a4a"/>
      <rect x="7.4" y="9.6" width="9.2" height="2.4" fill="#f2e0c0" opacity=".8"/>
    `),
    cocktail: S(`
      <path d="M3.6 5.4h16.8L13 13.6v5.6h3.4v2H7.6v-2H11v-5.6z" fill="#dbe6ec" opacity=".6"/>
      <path d="M6.4 6.8h11.2L12.6 12.6h-1.2z" fill="#f0899c"/>
      <circle cx="16.6" cy="4.4" r="2" fill="#7ac25a"/>
    `),
    smoothie: S(`
      <path d="M6.6 6.4h10.8l-1.2 13A2.6 2.6 0 0 1 13.6 22h-3.2a2.6 2.6 0 0 1-2.6-2.6z" fill="#e0899c"/>
      <path d="M6.2 4.4h11.6a1 1 0 0 1 1 1.1l-.1 1H5.3l-.1-1a1 1 0 0 1 1-1.1z" fill="#c96f88"/>
      <path d="M13.4 4.4 16 1.6" stroke="#7ac25a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    `),

    /* ================= キッチン・食卓 ================= */
    pan: S(`
      <ellipse cx="10.4" cy="13.6" rx="7.8" ry="5.4" fill="#5a6f7a"/>
      <ellipse cx="10.4" cy="12.6" rx="6.2" ry="4.2" fill="#3f4f5a"/>
      <rect x="17.4" y="11.4" width="5.6" height="2.4" rx="1.2" fill="#8c5a2b"/>
    `),
    kettle: S(`
      <path d="M6 10.4h11.4v7.4A3.2 3.2 0 0 1 14.2 21H9.2A3.2 3.2 0 0 1 6 17.8z" fill="#8c9aa4"/>
      <rect x="5.2" y="8.4" width="13" height="2.4" rx="1.2" fill="#5a6f7a"/>
      <path d="M17.4 12.6h1.6a2.6 2.6 0 0 1 0 5.2h-1.6v-2h1.6a.6.6 0 0 0 0-1.2h-1.6z" fill="#8c9aa4"/>
      <path d="M9.6 8.4c0-2 1-3 2.4-3s2.4 1 2.4 3" stroke="#5a6f7a" stroke-width="1.6" fill="none"/>
    `),
    cutlery: S(`
      <path d="M6.6 2.6v6.2c0 .9.6 1.6 1.4 1.8v10.8h1.6V10.6c.8-.2 1.4-.9 1.4-1.8V2.6H9.8v4.6H9V2.6H7.8v4.6H7V2.6z" fill="#8c9aa4"/>
      <path d="M15.4 2.6c1.6 0 2.6 1.8 2.6 4.6 0 2.2-.7 3.8-1.8 4.3v9.9h-1.6v-9.9c-1.1-.5-1.8-2.1-1.8-4.3 0-2.8 1-4.6 2.6-4.6z" fill="#a8b8c2"/>
    `),
    riceCooker: S(`
      <path d="M4 12.4h16v5.2A3.4 3.4 0 0 1 16.6 21H7.4A3.4 3.4 0 0 1 4 17.6z" fill="#c2c9cd"/>
      <rect x="3.2" y="9.6" width="17.6" height="3.2" rx="1.5" fill="#8c9aa4"/>
      <rect x="7.4" y="14.4" width="9.2" height="3.4" rx="1" fill="#3f4f5a"/>
      <rect x="10.4" y="7" width="3.2" height="2.8" rx="1" fill="#8c9aa4"/>
    `),
    trashCan: S(`
      <path d="M5.6 7.6h12.8l-1.2 12.2a2.4 2.4 0 0 1-2.4 2.2H9.2a2.4 2.4 0 0 1-2.4-2.2z" fill="#8c9aa4"/>
      <rect x="4.2" y="5.4" width="15.6" height="2.4" rx="1.2" fill="#5a6f7a"/>
      <rect x="9.6" y="3.2" width="4.8" height="2.2" rx="1" fill="#5a6f7a"/>
      <path d="M9.6 10.6v8M12 10.6v8M14.4 10.6v8" stroke="#6f8189" stroke-width="1.1" fill="none"/>
    `),
    apron: S(`
      <path d="M9.6 2.6h4.8v1.4c0 1.2-1 2-2.4 2s-2.4-.8-2.4-2z" fill="#e0899c"/>
      <path d="M8.4 5.4h7.2c2.4 1 3.6 3 3.6 6v7.8a2.8 2.8 0 0 1-2.8 2.8H7.6a2.8 2.8 0 0 1-2.8-2.8v-7.8c0-3 1.2-5 3.6-6z" fill="#f0a4b4"/>
      <rect x="8.4" y="12.6" width="7.2" height="4.6" rx="1" fill="#ffffff" opacity=".55"/>
    `),

    /* ================= 文具・道具 ================= */
    pen: S(`
      <path d="M6.2 21.4 4.6 17l11.6-11.6 3 3z" fill="#4a90d9"/>
      <path d="M16.2 5.4 18 3.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-1.8 1.8z" fill="#8c9aa4"/>
      <path d="M4.6 17 3 21.8l3.2-.4z" fill="#3f4f5a"/>
    `),
    notebook: S(`
      <rect x="5" y="3.4" width="14.4" height="17.2" rx="1.8" fill="#f2f6f8"/>
      <rect x="4.2" y="3.4" width="3.2" height="17.2" rx="1.4" fill="#4a90d9"/>
      <path d="M9.4 8h7.6M9.4 11.4h7.6M9.4 14.8h5.2" stroke="#c2c9cd" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    eraser: S(`
      <rect x="4" y="8.4" width="16" height="8.4" rx="1.6" fill="#f7f2e4"/>
      <rect x="4" y="8.4" width="9" height="8.4" rx="1.6" fill="#4a90d9"/>
      <rect x="12.4" y="8.4" width="1.6" height="8.4" fill="#dfe7ec"/>
    `),
    tape: S(`
      <circle cx="12" cy="12.6" r="8.4" fill="#f0d873" opacity=".85"/>
      <circle cx="12" cy="12.6" r="3.4" fill="#ffffff"/>
      <path d="M20.4 12.6 22 16.4l-3.6-.6z" fill="#f0d873"/>
    `),
    glue: S(`
      <rect x="9.4" y="2.2" width="5.2" height="3.4" rx="1.1" fill="#f0c832"/>
      <rect x="7.6" y="5.4" width="8.8" height="16.2" rx="2" fill="#f7e9a2"/>
      <rect x="7.6" y="5.4" width="8.8" height="2.6" fill="#e0c063"/>
      <rect x="9" y="10.6" width="6" height="6.4" rx=".9" fill="#ffffff" opacity=".85"/>
    `),
    scissors: S(`
      <path d="M6.4 4.4 17.6 17M17.6 4.4 6.4 17" stroke="#8c9aa4" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="6.6" cy="18.6" r="2.6" fill="none" stroke="#e0603f" stroke-width="1.8"/>
      <circle cx="17.4" cy="18.6" r="2.6" fill="none" stroke="#e0603f" stroke-width="1.8"/>
    `),
    envelope: S(`
      <rect x="3" y="6.4" width="18" height="12.2" rx="1.8" fill="#f7f2e4"/>
      <path d="M3.4 7.4 12 13.6l8.6-6.2" stroke="#c9bda2" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `),
    charger: S(`
      <rect x="7.4" y="3.4" width="9.2" height="9.2" rx="2" fill="#f2f6f8"/>
      <rect x="7.4" y="3.4" width="9.2" height="9.2" rx="2" fill="none" stroke="#c2c9cd" stroke-width="1.2"/>
      <rect x="10" y="6.4" width="1.4" height="3.4" rx=".7" fill="#5a6f7a"/>
      <rect x="12.6" y="6.4" width="1.4" height="3.4" rx=".7" fill="#5a6f7a"/>
      <path d="M12 12.6v4.6c0 1.6 1.2 2.6 3 2.6h2.4" stroke="#8c9aa4" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `),
    earphone: S(`
      <path d="M5.4 12.4a6.6 6.6 0 0 1 13.2 0v4.4h-2.4v-4.4a4.2 4.2 0 0 0-8.4 0v4.4H5.4z" fill="#8c9aa4"/>
      <rect x="3.6" y="14.4" width="4.2" height="6.6" rx="2" fill="#5a6f7a"/>
      <rect x="16.2" y="14.4" width="4.2" height="6.6" rx="2" fill="#5a6f7a"/>
    `),
    umbrella: S(`
      <path d="M2.6 13c0-5.2 4.2-9.4 9.4-9.4S21.4 7.8 21.4 13z" fill="#4a90d9"/>
      <path d="M2.6 13c1.6 0 2.6-.9 3.1-2.6.5 1.7 1.5 2.6 3.1 2.6s2.6-.9 3.1-2.6c.5 1.7 1.5 2.6 3.1 2.6s2.6-.9 3.1-2.6c.5 1.7 1.5 2.6 3.1 2.6" fill="#7fb8e8" opacity=".55"/>
      <path d="M11.2 13v5.6c0 1.4.9 2.2 2.2 2.2s2.2-.8 2.2-2.2" stroke="#8c9aa4" stroke-width="1.6" fill="none"/>
    `),

    /* ================= 衣類・その他 ================= */
    tshirt: S(`
      <path d="M8.6 4.4h6.8l5 2.6-1.8 4-2.4-1v11a1.4 1.4 0 0 1-1.4 1.4H9.2a1.4 1.4 0 0 1-1.4-1.4V10l-2.4 1-1.8-4z" fill="#7fc4dd"/>
      <path d="M9.6 4.4h4.8c0 1.5-1 2.4-2.4 2.4S9.6 5.9 9.6 4.4z" fill="#5aa8c4"/>
    `),
    underwear: S(`
      <path d="M4 7.6h16v3.6c0 5-2.4 9.4-4.6 9.4-1.4 0-2.2-1.6-3.4-4.6-1.2 3-2 4.6-3.4 4.6C6.4 20.6 4 16.2 4 11.2z" fill="#a9c4d8"/>
      <rect x="4" y="7.6" width="16" height="2.2" fill="#7fa4bd"/>
    `),
    slippers: S(`
      <path d="M3.4 12.4c0-2.4 1.4-3.8 3.6-3.8s3.6 1.4 3.6 3.8v5.4c0 2-1.2 3.2-3.2 3.2s-3.2-1.2-3.2-3.2z" fill="#e0899c"/>
      <path d="M13.4 12.4c0-2.4 1.4-3.8 3.6-3.8s3.6 1.4 3.6 3.8v5.4c0 2-1.2 3.2-3.2 3.2s-3.2-1.2-3.2-3.2z" fill="#e0899c"/>
      <path d="M3.6 12.4h7.2v2.4H3.6zM13.6 12.4h7.2v2.4h-7.2z" fill="#c96f88"/>
    `),
    catLitter: bag("#c9d4da", "#8fa4b0",
      `<circle cx="10" cy="14.4" r="1.4" fill="#8fa4b0"/><circle cx="13.4" cy="15.6" r="1.4" fill="#8fa4b0"/>
       <circle cx="12.4" cy="12.4" r="1.4" fill="#8fa4b0"/>`),
    petSheet: S(`
      <rect x="3.4" y="6.4" width="17.2" height="12.2" rx="2" fill="#f2f6f8"/>
      <rect x="3.4" y="6.4" width="17.2" height="12.2" rx="2" fill="none" stroke="#dbe4e8" stroke-width="1.2"/>
      <rect x="6" y="9" width="12" height="7" rx="1.2" fill="#8fd0e0" opacity=".55"/>
    `),
    flower: S(`
      <path d="M11.2 21.4V11h1.6v10.4z" fill="#4e9636"/>
      <path d="M12.8 15.4c2.4-.6 3.8-2.2 4.2-4.8-2.6.4-4 2-4.2 4.8z" fill="#5faa42"/>
      <circle cx="12" cy="7.4" r="2.4" fill="#f0c832"/>
      <circle cx="12" cy="3.4" r="2.6" fill="#e0899c"/><circle cx="12" cy="11.4" r="2.6" fill="#e0899c"/>
      <circle cx="8" cy="7.4" r="2.6" fill="#e0899c"/><circle cx="16" cy="7.4" r="2.6" fill="#e0899c"/>
      <circle cx="12" cy="7.4" r="2.4" fill="#f0c832"/>
    `),
    plant: S(`
      <path d="M7.4 13.6h9.2l-1 6.4a2.2 2.2 0 0 1-2.2 1.8h-2.8a2.2 2.2 0 0 1-2.2-1.8z" fill="#c9803a"/>
      <rect x="6.4" y="11.6" width="11.2" height="2.6" rx="1.1" fill="#a8622a"/>
      <path d="M11.2 11.6V6.4h1.6v5.2z" fill="#4e9636"/>
      <path d="M11.4 8.4c-2.6-.2-4.2-1.8-4.6-4.6 3 .2 4.6 1.8 4.6 4.6zM12.6 9.4c2.6-.2 4.2-1.8 4.6-4.6-3 .2-4.6 1.8-4.6 4.6z" fill="#5faa42"/>
    `),
    lightBattery: S(`
      <rect x="7.4" y="4.4" width="9.2" height="16" rx="1.6" fill="#3f4f5a"/>
      <rect x="9.6" y="2.6" width="4.8" height="2.2" rx=".9" fill="#c2c9cd"/>
      <rect x="7.4" y="9.6" width="9.2" height="5.4" fill="#f0c832"/>
      <path d="M12.6 10.4 10 13.4h1.8l-.4 2.4 2.6-3.2h-1.8z" fill="#3f4f5a"/>
    `),

    /* ================= 野菜・果物（さらに） ================= */
    cauliflower: S(`
      <path d="M12 4.4c4.4 0 7.2 2.6 7.2 6.4 0 3.4-2.8 5.4-7.2 5.4s-7.2-2-7.2-5.4c0-3.8 2.8-6.4 7.2-6.4z" fill="#f4f2e2"/>
      <circle cx="9" cy="9.4" r="2.2" fill="#fbfaf2"/><circle cx="12.6" cy="8.2" r="2.4" fill="#fbfaf2"/>
      <circle cx="15.4" cy="10.4" r="2.2" fill="#fbfaf2"/><circle cx="11" cy="12" r="2.2" fill="#fbfaf2"/>
      <path d="M6.4 15.6h11.2c-.6 3.2-2.4 4.8-5.6 4.8s-5-1.6-5.6-4.8z" fill="#7ac25a"/>
    `),
    bittergourd: S(`
      <path d="M12 3.4c1 0 1.6.7 1.6 2v1c2.4 1.4 3.6 4 3.6 7.6 0 4.6-2 7.6-5.2 7.6s-5.2-3-5.2-7.6c0-3.6 1.2-6.2 3.6-7.6v-1c0-1.3.6-2 1.6-2z" fill="#4e9636"/>
      <path d="M9.4 8.4c.6 2.6.6 6 0 9.4M12 7.6c.6 2.8.6 6.6 0 10M14.6 8.4c-.6 2.6-.6 6 0 9.4" stroke="#7ac25a" stroke-width="1.2" fill="none"/>
    `),
    edamame: S(`
      <path d="M6.4 16.4c-1.6-1.6-1.2-4.2 1.4-6.8l3.4-3.4c2.6-2.6 5.2-3 6.8-1.4s1.2 4.2-1.4 6.8l-3.4 3.4c-2.6 2.6-5.2 3-6.8 1.4z" fill="#7ac25a"/>
      <circle cx="9.4" cy="13.4" r="1.7" fill="#4e9636"/>
      <circle cx="12" cy="10.8" r="1.7" fill="#4e9636"/>
      <circle cx="14.6" cy="8.2" r="1.7" fill="#4e9636"/>
    `),
    shiso: S(`
      <path d="M12 21V12" stroke="#3f7a2e" stroke-width="1.5" fill="none"/>
      <path d="M12 12c-4.6 0-7.4-3-7.4-8 5 .4 7.4 3 7.4 8z" fill="#4e9636"/>
      <path d="M12 12c4.6 0 7.4-3 7.4-8-5 .4-7.4 3-7.4 8z" fill="#5faa42"/>
      <path d="M6.6 5.6 12 11.4M17.4 5.6 12 11.4" stroke="#3f7a2e" stroke-width=".9" fill="none"/>
    `),
    parsley: S(`
      <path d="M12 21.4V11" stroke="#3f7a2e" stroke-width="1.5" fill="none"/>
      <circle cx="8.4" cy="9" r="2.8" fill="#4e9636"/><circle cx="15.6" cy="9" r="2.8" fill="#4e9636"/>
      <circle cx="12" cy="5.4" r="3" fill="#5faa42"/><circle cx="12" cy="10.6" r="2.8" fill="#5faa42"/>
    `),
    myoga: S(`
      <path d="M12 4.4c2.6 0 4.2 2.2 4.2 6 0 5.4-1.8 11-4.2 11s-4.2-5.6-4.2-11c0-3.8 1.6-6 4.2-6z" fill="#e0899c"/>
      <path d="M12 6.4c1.4 0 2.2 1.6 2.2 4.4 0 4-1 8.2-2.2 8.2s-2.2-4.2-2.2-8.2c0-2.8.8-4.4 2.2-4.4z" fill="#f0b0bd" opacity=".8"/>
      <path d="M12 4.6c-.6-1.4-1.8-2-3.6-1.8.3 1.7 1.5 2.4 3.6 1.8z" fill="#5faa42"/>
    `),
    snapPeas: S(`
      <path d="M5.6 15.6c-1.4-1.4-.8-3.8 1.6-6.2l2.6-2.6c2.4-2.4 4.8-3 6.2-1.6s.8 3.8-1.6 6.2l-2.6 2.6c-2.4 2.4-4.8 3-6.2 1.6z" fill="#8fd07a"/>
      <path d="M7.6 13.6 15 6.2" stroke="#5faa42" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),
    papaya: S(`
      <path d="M12 5.6c3.6 0 6.2 3.2 6.2 8s-2.6 8-6.2 8-6.2-3.2-6.2-8 2.6-8 6.2-8z" fill="#e8a03e"/>
      <path d="M12 9c1.8 0 3 2.2 3 4.6s-1.2 4.6-3 4.6-3-2.2-3-4.6S10.2 9 12 9z" fill="#e0603f" opacity=".7"/>
      <circle cx="11.4" cy="13" r=".6" fill="#3f2a1a"/><circle cx="12.6" cy="14.6" r=".6" fill="#3f2a1a"/>
    `),
    pomegranate: S(`
      <circle cx="12" cy="14" r="7.6" fill="#c2402e"/>
      <circle cx="9.6" cy="13" r="1.5" fill="#e0603f"/><circle cx="13.4" cy="12.2" r="1.5" fill="#e0603f"/>
      <circle cx="12.4" cy="16" r="1.5" fill="#e0603f"/><circle cx="15.4" cy="15.4" r="1.5" fill="#e0603f"/>
      <path d="M10.4 6.4h3.2l.6-3-2.2 1.4-2.2-1.4z" fill="#8c2a1e"/>
    `),
    loquat: S(`
      <circle cx="8.6" cy="15.4" r="4.4" fill="#e8a03e"/>
      <circle cx="15.6" cy="14.4" r="4.4" fill="#f0b45c"/>
      <path d="M8.6 11 9.4 6M15.6 10 15 5.4" stroke="#7a5a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M9.4 6c1.6-1.6 3.2-2 5.6-1.4-1.4 2.2-3.2 2.8-5.6 1.4z" fill="#5f9c46"/>
    `),
    dragonFruit: S(`
      <ellipse cx="12" cy="13.6" rx="6.6" ry="7.6" fill="#d3486a"/>
      <path d="M5.6 10.4c-1.6-1-2.2-2.4-1.8-4.2 2 .4 3.2 1.6 3.4 3.6zM18.4 10.4c1.6-1 2.2-2.4 1.8-4.2-2 .4-3.2 1.6-3.4 3.6zM5.4 16.4c-1.6.6-2.8.2-3.6-1.4 1.8-1 3.2-.8 4.2.6zM18.6 16.4c1.6.6 2.8.2 3.6-1.4-1.8-1-3.2-.8-4.2.6z" fill="#7ac25a"/>
      <ellipse cx="10" cy="10.6" rx="1.6" ry="1.1" fill="#ffffff" opacity=".35"/>
    `),

    /* ================= 惣菜・冷凍・乾物 ================= */
    tempura: S(`
      <path d="M4.6 15.6c0-3.4 3.3-5.6 7.4-5.6s7.4 2.2 7.4 5.6-3.3 5-7.4 5-7.4-1.6-7.4-5z" fill="#e0ab5c"/>
      <path d="M12 10c-1-2.6-1-4.6 0-6 1 1.4 1 3.4 0 6z" fill="#e0603f"/>
      <circle cx="8.4" cy="13.6" r="1.4" fill="#f0cd8e"/><circle cx="12.4" cy="15.4" r="1.4" fill="#f0cd8e"/>
      <circle cx="15.6" cy="13.4" r="1.4" fill="#f0cd8e"/>
    `),
    croquette: S(`
      <ellipse cx="12" cy="14" rx="8.2" ry="5.6" fill="#c9803a"/>
      <ellipse cx="12" cy="13" rx="8.2" ry="5.6" fill="#e0ab5c"/>
      <circle cx="8.6" cy="12" r=".8" fill="#f2cf9a"/><circle cx="12.4" cy="13.6" r=".8" fill="#f2cf9a"/>
      <circle cx="15.6" cy="11.6" r=".8" fill="#f2cf9a"/><circle cx="10.4" cy="15" r=".8" fill="#f2cf9a"/>
    `),
    friedFood: S(`
      <circle cx="8.4" cy="14.6" r="4.4" fill="#d9a04c"/>
      <circle cx="15.6" cy="15.4" r="4" fill="#e0ab5c"/>
      <circle cx="12.4" cy="9.6" r="4.2" fill="#eec489"/>
      <circle cx="7" cy="13" r=".8" fill="#f2cf9a"/><circle cx="14.6" cy="14.4" r=".8" fill="#f2cf9a"/>
    `),
    gratin: S(`
      <path d="M3.6 11.4h16.8v4.8c0 2.4-1.8 4-4.6 4H8.2c-2.8 0-4.6-1.6-4.6-4z" fill="#e0ab5c"/>
      <ellipse cx="12" cy="11.4" rx="8.4" ry="3.4" fill="#f0cd8e"/>
      <ellipse cx="12" cy="11.2" rx="6.2" ry="2.2" fill="#f7e2b4"/>
      <path d="M2.4 12.4h1.4v3.4H2.4zM20.2 12.4h1.4v3.4h-1.4z" fill="#c2c9cd"/>
    `),
    omelette: S(`
      <path d="M4.6 11.6c0-2.6 3.3-4.4 7.4-4.4s7.4 1.8 7.4 4.4v3.2c0 2.4-3.3 4-7.4 4s-7.4-1.6-7.4-4z" fill="#f0c832"/>
      <path d="M4.6 12.8c1.6 1.2 4 1.9 7.4 1.9s5.8-.7 7.4-1.9" stroke="#e0a83a" stroke-width="1.2" fill="none"/>
      <path d="M6.4 15.6c1.6 1 3.4 1.5 5.6 1.5s4-.5 5.6-1.5" stroke="#e0a83a" stroke-width="1.2" fill="none"/>
    `),
    saladChicken: pouch("#eef3f5", "#a8c4d0",
      `<path d="M9 13c1.6-.8 3.2-.8 4.8 0M9.4 15c1.6-.8 3.2-.8 4.8 0" stroke="#c2c9cd" stroke-width="1.1" fill="none" stroke-linecap="round"/>`),
    grilledFish: S(`
      <path d="M3.4 13.6c2.6-3 6-4.6 10.2-4.6 3.4 0 5.6 1.5 6.6 4.6-1 3.1-3.2 4.6-6.6 4.6-4.2 0-7.6-1.6-10.2-4.6z" fill="#c9a06a"/>
      <path d="M6.6 13.6c2-1.8 4.4-2.8 7-2.8 2.2 0 3.7.9 4.4 2.8-.7 1.9-2.2 2.8-4.4 2.8-2.6 0-5-1-7-2.8z" fill="#e0c49a"/>
      <path d="M4.6 10.4 8 13.6l-3.4 3.2z" fill="#a8804c"/>
      <rect x="11.2" y="2.6" width="1.6" height="17" rx=".8" fill="#c9a06a" opacity="0"/>
    `),
    frozenGyoza: box("#5aa8c4", "#3f8fb0",
      `<path d="M7.6 15.4c0-1.6 2-2.6 4.4-2.6s4.4 1 4.4 2.6-2 2.4-4.4 2.4-4.4-.8-4.4-2.4z" fill="#f0dcb2"/>`),
    icePop: S(`
      <path d="M7 4.4h10v10.2c0 2.6-2 4.2-5 4.2s-5-1.6-5-4.2z" fill="#7fc4dd"/>
      <path d="M7 4.4h10v3.6H7z" fill="#e0526e"/>
      <rect x="11.1" y="18.4" width="1.8" height="4.2" rx=".9" fill="#c9a06a"/>
    `),
    shavedIce: S(`
      <path d="M12 3.6c4.4 2.8 7 6 7 8.6 0 2.4-2.4 3.6-7 3.6s-7-1.2-7-3.6c0-2.6 2.6-5.8 7-8.6z" fill="#f7fbfd"/>
      <path d="M12 3.6c2.6 1.7 4.6 3.6 5.8 5.4-1.6.8-3.6 1.2-5.8 1.2s-4.2-.4-5.8-1.2c1.2-1.8 3.2-3.7 5.8-5.4z" fill="#e0607a" opacity=".7"/>
      <path d="M6.6 15.4h10.8l-1 3.6A2.4 2.4 0 0 1 14.1 21h-4.2a2.4 2.4 0 0 1-2.3-2z" fill="#dfe7ec"/>
    `),
    driedShiitake: bag("#d9c0a2", "#a8804c",
      `<circle cx="10.4" cy="14" r="2.2" fill="#8c5a2b"/><circle cx="14" cy="15.4" r="2" fill="#8c5a2b"/>`),
    koyaTofu: S(`
      <rect x="4.4" y="7.4" width="7" height="7" rx="1" fill="#e8d8b4" transform="rotate(-6 7.9 10.9)"/>
      <rect x="11" y="9.6" width="7" height="7" rx="1" fill="#f0e2c4" transform="rotate(7 14.5 13.1)"/>
      <rect x="7.4" y="13.6" width="7" height="7" rx="1" fill="#e0cfa8" transform="rotate(-3 10.9 17.1)"/>
    `),
    fu: S(`
      <circle cx="8.4" cy="10.4" r="3.4" fill="#f2e8d2"/>
      <circle cx="15.4" cy="11.4" r="3.4" fill="#f7f0e0"/>
      <circle cx="11.4" cy="16" r="3.4" fill="#f2e8d2"/>
      <circle cx="8.4" cy="10.4" r="1.2" fill="#e0d0b0"/><circle cx="15.4" cy="11.4" r="1.2" fill="#e0d0b0"/>
      <circle cx="11.4" cy="16" r="1.2" fill="#e0d0b0"/>
    `),
    cannedFruit: tin("#f0b45c", "#c9803a"),
    cannedCorn:  tin("#f0d873", "#c9a534"),
    cannedFish:  tin("#8fa4b0", "#5a7f96"),

    /* ================= ベビー ================= */
    formula: S(`
      <rect x="5.4" y="6" width="13.2" height="15.4" rx="2.2" fill="#f7d3de"/>
      <rect x="4.6" y="3.6" width="14.8" height="2.8" rx="1.3" fill="#e0a8bd"/>
      <rect x="7.4" y="11" width="9.2" height="6" rx="1.2" fill="#ffffff" opacity=".9"/>
      <circle cx="12" cy="14" r="1.8" fill="#f0c0d0"/>
    `),
    babyFood: jar("#f7e0c2", "#e8a03e"),
    babyBottle: S(`
      <path d="M9.4 2.4h5.2v2.2H9.4z" fill="#f0c0d0"/>
      <path d="M10.2 4.6h3.6c.5 1 .2 1.8-1.8 1.8s-2.3-.8-1.8-1.8z" fill="#f7d3de"/>
      <path d="M7.6 8.4c0-1.4.9-2.4 2.2-2.8h4.4c1.3.4 2.2 1.4 2.2 2.8v11A2.6 2.6 0 0 1 13.8 22h-3.6a2.6 2.6 0 0 1-2.6-2.6z" fill="#e0eef4"/>
      <path d="M8.8 11.4h2M8.8 14h2M8.8 16.6h2" stroke="#a8c4d0" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),

    /* ================= キッチン道具 ================= */
    knife: S(`
      <path d="M4.4 13.6 15.6 3.4c1 .8 1.4 2 1.4 3.6 0 3.2-2 6-5.6 8.4z" fill="#c2c9cd"/>
      <rect x="14.4" y="14.6" width="6.4" height="2.8" rx="1.2" fill="#8c5a2b" transform="rotate(-42 17.6 16)"/>
    `),
    cuttingBoard: S(`
      <rect x="3.4" y="4.4" width="15.2" height="16.2" rx="2.2" fill="#e0c49a"/>
      <rect x="18" y="8.4" width="2.6" height="8.2" rx="1.3" fill="#c9a06a"/>
      <path d="M6.4 8.4h9.2M6.4 12h9.2M6.4 15.6h6" stroke="#c9a06a" stroke-width="1" fill="none" stroke-linecap="round"/>
    `),
    strainer: S(`
      <path d="M3.4 11.4h17.2c0 5-3.4 8.4-8.6 8.4S3.4 16.4 3.4 11.4z" fill="#c2c9cd"/>
      <circle cx="8.4" cy="14" r=".8" fill="#8c9aa4"/><circle cx="12" cy="15.4" r=".8" fill="#8c9aa4"/>
      <circle cx="15.6" cy="14" r=".8" fill="#8c9aa4"/><circle cx="10.4" cy="17.4" r=".8" fill="#8c9aa4"/>
      <circle cx="13.8" cy="17.4" r=".8" fill="#8c9aa4"/>
      <rect x="2.4" y="10" width="19.2" height="2" rx="1" fill="#8c9aa4"/>
    `),
    measuringCup: S(`
      <path d="M6 6.4h10.4l-1 12.6A2.6 2.6 0 0 1 12.8 21.4h-3.2a2.6 2.6 0 0 1-2.6-2.4z" fill="#dbe6ec" opacity=".7"/>
      <path d="M16.4 9.6h1.4a2.4 2.4 0 0 1 0 4.8h-1.8" stroke="#8c9aa4" stroke-width="1.5" fill="none"/>
      <path d="M8 10.6h4M8 13.6h4M8 16.6h3" stroke="#8c9aa4" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),
    peeler: S(`
      <path d="M8.6 3.4h6.8c1 0 1.6.8 1.4 1.8l-1.6 7.6H8.8L7.2 5.2c-.2-1 .4-1.8 1.4-1.8z" fill="#c2c9cd"/>
      <rect x="9.2" y="12.4" width="5.6" height="8.4" rx="2.4" fill="#e0603f"/>
      <rect x="8.6" y="6.6" width="6.8" height="1.8" rx=".9" fill="#8c9aa4"/>
    `),

    /* ================= 掃除・洗濯（さらに） ================= */
    bakingSoda: box("#f2f6f8", "#c2c9cd",
      `<rect x="8.4" y="12" width="7.2" height="5.4" rx="1" fill="#8fd0e0" opacity=".6"/>`),
    citricAcid: box("#f7ecd2", "#e0c063",
      `<circle cx="12" cy="14.4" r="2.6" fill="#f0d873"/>`),
    floorWipes: S(`
      <rect x="3.2" y="8.4" width="17.6" height="9.6" rx="2" fill="#8fd0e0"/>
      <rect x="3.2" y="8.4" width="17.6" height="3" rx="2" fill="#4fb3c4"/>
      <path d="M6.4 13.4h11.2M6.4 15.6h8.4" stroke="#ffffff" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    floorWiper: S(`
      <rect x="11.1" y="2.2" width="1.8" height="12" rx=".9" fill="#8c9aa4"/>
      <path d="M4.4 14.2h15.2a1.4 1.4 0 0 1 1.4 1.4v2.2a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 17.8v-2.2a1.4 1.4 0 0 1 1.4-1.4z" fill="#4fb3c4"/>
      <rect x="3" y="19" width="18" height="2.2" rx="1" fill="#dfe7ec"/>
    `),
    refillPouch: pouch("#4a90d9", "#2f6fb0"),
    refillPouchGreen: pouch("#5cb85c", "#3f9440"),

    /* ================= 文具（さらに） ================= */
    stickyNote: S(`
      <rect x="4.4" y="5.4" width="15.2" height="14.4" rx="1.4" fill="#f0d873"/>
      <path d="M14.4 19.8h5.2l-5.2-5.2z" fill="#e0c063"/>
      <path d="M7.4 9.4h9.2M7.4 12.4h7.6" stroke="#c9a534" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    fileFolder: S(`
      <path d="M3.4 6.4h6.2l1.8 2.2h9.2v9.6A2.4 2.4 0 0 1 18.2 20.6H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#e0a83a"/>
      <path d="M3.4 10.4h17.2v7.8A2.4 2.4 0 0 1 18.2 20.6H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#f0c86a"/>
    `),
    ruler: S(`
      <rect x="2.6" y="9" width="18.8" height="6" rx="1.2" fill="#8fd0e0" opacity=".85"/>
      <path d="M5.6 9v3M8.2 9v2M10.8 9v3M13.4 9v2M16 9v3M18.6 9v2" stroke="#3f8fb0" stroke-width="1.1" fill="none"/>
    `),
    stapler: S(`
      <path d="M3.6 15.4h16.8v2.4A1.4 1.4 0 0 1 19 19.2H5A1.4 1.4 0 0 1 3.6 17.8z" fill="#5a6f7a"/>
      <path d="M4.6 8.4h13.8a2 2 0 0 1 2 2v4.4H4.6z" fill="#e0603f"/>
      <path d="M6.4 10.6h11.2v2.2H6.4z" fill="#c2402e"/>
    `),

    /* ================= 麺・粉もの（さらに） ================= */
    soba: bowl("#4a3a2a",
      `<path d="M6.4 9.4c1.6-1.4 3.4-2.2 5.6-2.2s4 .8 5.6 2.2" stroke="#8c6a4a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
       <path d="M7.6 11.4c1.4-1 2.8-1.6 4.4-1.6s3 .6 4.4 1.6" stroke="#a8804c" stroke-width="1.3" fill="none" stroke-linecap="round"/>`),
    udon: bowl("#e8dcc8",
      `<path d="M6.6 9.6c1.6-1.5 3.4-2.3 5.4-2.3s3.8.8 5.4 2.3" stroke="#f7f2e4" stroke-width="1.8" fill="none" stroke-linecap="round"/>
       <path d="M7.8 11.4c1.3-1 2.7-1.5 4.2-1.5s2.9.5 4.2 1.5" stroke="#f7f2e4" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
    somen: S(`
      <rect x="4.4" y="5.4" width="15.2" height="13.2" rx="2" fill="#f7f2e4"/>
      <rect x="4.4" y="5.4" width="15.2" height="13.2" rx="2" fill="none" stroke="#e0d4c0" stroke-width="1.2"/>
      <path d="M7.4 8.4v7.6M9.4 8.4v7.6M11.4 8.4v7.6M13.4 8.4v7.6M15.4 8.4v7.6" stroke="#e8dcc8" stroke-width="1.3" fill="none"/>
      <rect x="4.4" y="10.4" width="15.2" height="3" fill="#e0603f" opacity=".85"/>
    `),
    yakisoba: S(`
      <path d="M3.6 12.4h16.8v3.4c0 2.6-2.4 4.2-6 4.2h-4.8c-3.6 0-6-1.6-6-4.2z" fill="#c9803a"/>
      <path d="M5.6 11.4c1.8-1.4 3.9-2.1 6.4-2.1s4.6.7 6.4 2.1" stroke="#e0ab5c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M7 9.4c1.5-1.1 3.2-1.7 5-1.7s3.5.6 5 1.7" stroke="#e0ab5c" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <rect x="9.4" y="13" width="5.2" height="1.6" rx=".6" fill="#7ac25a"/>
    `),
    pastaSauce: jar("#c2402e", "#8c2a1e"),
    ramenSoup:  sachet("#c9803a", "#8c5a2b"),
    okonomiyaki: S(`
      <ellipse cx="12" cy="13.4" rx="8.4" ry="6.4" fill="#c9803a"/>
      <ellipse cx="12" cy="12.6" rx="8.4" ry="6.4" fill="#d9a259"/>
      <path d="M6.4 11.6c1.8-.8 3.8-1.2 5.6-1.2s3.8.4 5.6 1.2" stroke="#8c5a2b" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M7 14.4c1.6-.7 3.4-1 5-1s3.4.3 5 1" stroke="#e0c063" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),
    takoyaki: S(`
      <circle cx="8" cy="10.4" r="3.6" fill="#c9803a"/><circle cx="16" cy="10.4" r="3.6" fill="#c9803a"/>
      <circle cx="12" cy="16.4" r="3.6" fill="#c9803a"/>
      <circle cx="8" cy="9.8" r="3.6" fill="#d9a259"/><circle cx="16" cy="9.8" r="3.6" fill="#d9a259"/>
      <circle cx="12" cy="15.8" r="3.6" fill="#d9a259"/>
      <path d="M6 8.6c1.4-.6 2.6-.6 4 0M14 8.6c1.4-.6 2.6-.6 4 0M10 14.6c1.4-.6 2.6-.6 4 0" stroke="#8c5a2b" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),

    /* ================= 魚・練り物（さらに） ================= */
    seaUrchin: S(`
      <circle cx="12" cy="13" r="5" fill="#3f2a2a"/>
      <path d="M12 3.6v4M12 18.4v4M3.6 13h4M16.4 13h4M6 7 8.8 9.8M15.2 16.2 18 19M18 7l-2.8 2.8M8.8 16.2 6 19" stroke="#3f2a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="13" r="2.6" fill="#e8a03e"/>
    `),
    scallop: S(`
      <path d="M12 20.4c-4.6 0-8.4-4-8.4-9 0-1.4 1-2.4 2.4-2.4h12c1.4 0 2.4 1 2.4 2.4 0 5-3.8 9-8.4 9z" fill="#f0dcb2"/>
      <path d="M12 20.4 8 9M12 20.4 16 9M12 20.4V9" stroke="#d9c096" stroke-width="1.2" fill="none"/>
      <path d="M10 9c0-2.6.7-4 2-4s2 1.4 2 4z" fill="#e0c49a"/>
    `),
    kamaboko: S(`
      <path d="M4.4 18.4v-6c0-3.6 3.1-6 7.6-6s7.6 2.4 7.6 6v6z" fill="#f7f4ec"/>
      <path d="M4.4 12.4c0-3.6 3.1-6 7.6-6s7.6 2.4 7.6 6z" fill="#e0607a"/>
      <rect x="3.4" y="18.4" width="17.2" height="2.4" rx="1" fill="#c9a06a"/>
    `),
    chikuwa: S(`
      <path d="M3.6 12.4c0-2.2 1.4-3.6 3.4-3.6h10c2 0 3.4 1.4 3.4 3.6s-1.4 3.6-3.4 3.6H7c-2 0-3.4-1.4-3.4-3.6z" fill="#e0c49a"/>
      <ellipse cx="7" cy="12.4" rx="2.2" ry="3.6" fill="#f2e4cc"/>
      <ellipse cx="7" cy="12.4" rx="1" ry="1.8" fill="#c9a06a"/>
      <path d="M11 9.4c-.6 2-.6 4 0 6M15 9.4c-.6 2-.6 4 0 6" stroke="#c9a06a" stroke-width="1.1" fill="none"/>
    `),

    /* ================= 飲みもの（さらに） ================= */
    aojiru:     sachet("#4e9636", "#356f26"),
    amazake:    bottle("#f2ecdc", "#d9c9a8"),
    lactic:     bottle("#f7f4ec", "#c2c9cd"),
    teaBag: S(`
      <path d="M8.4 8.4h7.2l1.4 9.4a2.2 2.2 0 0 1-2.2 2.6H9.2A2.2 2.2 0 0 1 7 17.8z" fill="#c9a06a"/>
      <path d="M12 8.4V4.2h4.4" stroke="#a8804c" stroke-width="1.2" fill="none"/>
      <rect x="16" y="2.6" width="4.4" height="3.2" rx=".9" fill="#e0603f"/>
    `),
    barleyTea:  bottle("#a8703a", "#7a4a1e"),

    /* ================= 衛生・その他（さらに） ================= */
    bodyTowel: S(`
      <path d="M4.4 6.4c4.4 1.6 8.4 1.6 12.8 0l2.4 4.4c-4.8 2.4-9.6 3.6-14.4 3.6z" fill="#8fd0e0"/>
      <path d="M5.2 14.4c4.8 0 9.6-1.2 14.4-3.6l-1 4.6c-4.4 2.4-8.8 3.6-13.2 3.6z" fill="#7fc4dd"/>
    `),
    interdental: S(`
      <rect x="10.8" y="4.4" width="2.4" height="14.6" rx="1.2" fill="#4fb3c4"/>
      <path d="M12 4.4V2M9.6 6.4h4.8M9.6 8.4h4.8M9.6 10.4h4.8M9.6 12.4h4.8" stroke="#8fd0e0" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <rect x="9.4" y="18.4" width="5.2" height="3.4" rx="1.4" fill="#3f8fb0"/>
    `),
    contactSolution: S(`
      <rect x="9.6" y="2.2" width="4.8" height="3" rx="1" fill="#4a90d9"/>
      <path d="M7.4 8.4c0-1.6 1-3 2.6-3.6h4c1.6.6 2.6 2 2.6 3.6v11.2A2.4 2.4 0 0 1 14.2 22H9.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#8fd0e0"/>
      <rect x="8.6" y="11.4" width="6.8" height="5.4" rx="1" fill="#ffffff" opacity=".9"/>
      <circle cx="12" cy="14.1" r="1.6" fill="none" stroke="#4a90d9" stroke-width="1.2"/>
    `),
    handWarmerBox: box("#e0603f", "#b8402a",
      `<circle cx="12" cy="14.4" r="2.8" fill="#f0c832"/>`),
    gloves: S(`
      <path d="M7.6 21.4a2 2 0 0 1-2-2v-5.6c0-.9.2-1.6.8-2.3l.6-.8V5.6a1.3 1.3 0 0 1 2.6 0v3h.6V4.4a1.3 1.3 0 0 1 2.6 0V8.6h.6V5.2a1.3 1.3 0 0 1 2.6 0v3.4h.6V7.2a1.3 1.3 0 0 1 2.6 0v7c0 3.4-1.5 5.6-4.2 7.2z" fill="#5a6f7a"/>
      <path d="M5.8 17.4h12c-.4 1.6-1.4 3-3.2 4h-7a2 2 0 0 1-2-2z" fill="#3f4f5a" opacity=".5"/>
    `),
    shoeCare: S(`
      <path d="M3.4 15.4c0-2.6 1.6-4 4.4-4h3.4l3.6 2.4h4.4a2.4 2.4 0 0 1 2.4 2.4v1.4a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#6b4420"/>
      <path d="M3.4 17.4h17.2v.4a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#4a2c12"/>
      <path d="M7.4 11.4h3.8l1.4 1H7.4z" fill="#8c5a2b"/>
    `),
    airFreshener: S(`
      <path d="M8.4 8.4h7.2c1.4 1 2.2 2.5 2.2 4.4v6.4A2.6 2.6 0 0 1 15.2 22H8.8a2.6 2.6 0 0 1-2.6-2.8v-6.4c0-1.9.8-3.4 2.2-4.4z" fill="#c9a2e0"/>
      <rect x="9.6" y="4.4" width="4.8" height="4.2" rx="1.4" fill="#8f6fc4"/>
      <rect x="8" y="12.6" width="8" height="5" rx="1" fill="#ffffff" opacity=".85"/>
      <path d="M12 4.4V2M9 5 7.4 3.4M15 5l1.6-1.6" stroke="#8f6fc4" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),

    /* ================= その他の食品 ================= */
    peanutButter: jar("#c9803a", "#8c5a2b"),
    marmalade:    jar("#f0a12e", "#c9722a"),
    syrup: S(`
      <rect x="9.8" y="2.2" width="4.4" height="2.6" rx=".8" fill="#6b4420"/>
      <path d="M8 5.4h8c1.2 1 1.9 2.4 1.9 4.1v9.9A2.6 2.6 0 0 1 15.3 22H8.7a2.6 2.6 0 0 1-2.6-2.6V9.5c0-1.7.7-3.1 1.9-4.1z" fill="#8c5a2b"/>
      <path d="M6.1 12.4h11.8v3.2H6.1z" fill="#f0dcb2" opacity=".9"/>
      <path d="M12 16.6c1.2 1.4 1.8 2.4 1.8 3.1a1.8 1.8 0 0 1-3.6 0c0-.7.6-1.7 1.8-3.1z" fill="#c9803a" opacity="0"/>
    `),
    coffeeBeans: bag("#6b4420", "#4a2c12",
      `<ellipse cx="10" cy="14" rx="1.8" ry="2.4" fill="#a8703a" transform="rotate(-24 10 14)"/>
       <ellipse cx="13.8" cy="15.4" rx="1.8" ry="2.4" fill="#a8703a" transform="rotate(18 13.8 15.4)"/>`),
    driedNoodle: S(`
      <path d="M6.4 4.4h11.2l-1 14.4A2.6 2.6 0 0 1 14 21.4h-4a2.6 2.6 0 0 1-2.6-2.6z" fill="#f0e4c8"/>
      <path d="M6.4 4.4h11.2v2.6H6.4z" fill="#e0603f"/>
      <path d="M8.4 9.4v8.4M10.4 9.4v8.4M12.4 9.4v8.4M14.4 9.4v8.4" stroke="#e0d0a8" stroke-width="1.1" fill="none"/>
    `),
    sesame: sachet("#e8dcc0", "#c2a578",
      `<ellipse cx="10.4" cy="12.4" rx="1" ry="1.4" fill="#8c6a3a"/>
       <ellipse cx="13" cy="13.4" rx="1" ry="1.4" fill="#8c6a3a"/>
       <ellipse cx="11.4" cy="15" rx="1" ry="1.4" fill="#8c6a3a"/>`),
    driedSeaweedSoup: sachet("#3f5f4a", "#2a4234"),
    instantSoup: cupLid("#f2ecdc", "#e0a83a", "#f0c86a"),

    /* ================= まだ足りていなかったもの ================= */
    radish: S(`
      <circle cx="12" cy="14.6" r="6.2" fill="#e0526e"/>
      <circle cx="12" cy="14.6" r="6.2" fill="#e8697f" opacity=".5"/>
      <path d="M11.4 8.6 8.6 3.4c2.4 0 3.5 1.2 3.4 3.4.5-2 1.8-2.8 3.8-2.4z" fill="#5faa42"/>
      <ellipse cx="9.6" cy="12.4" rx="1.5" ry="1" fill="#ffffff" opacity=".35"/>
    `),
    kale: leafy("#3f7a3a", "#6fa84e"),
    winterMelon: S(`
      <ellipse cx="12" cy="13.4" rx="7" ry="8" fill="#4e8f56"/>
      <ellipse cx="12" cy="13.4" rx="4.4" ry="7.4" fill="#6fa868" opacity=".6"/>
      <rect x="11.2" y="3.2" width="1.6" height="3" rx=".8" fill="#7a5a3a"/>
    `),
    apricot: S(`
      <circle cx="12" cy="14" r="7" fill="#f0a04c"/>
      <path d="M12 7v14" stroke="#e08a34" stroke-width="1.1" fill="none"/>
      ${SHINE}
      <path d="M12 7.2c-.7-1.8-2.2-2.6-4.4-2.4.3 2 1.7 2.9 4.4 2.4z" fill="#5f9c46"/>
    `),
    kumquat: S(`
      <circle cx="8.4" cy="14.4" r="4" fill="#f0a12e"/>
      <circle cx="15.6" cy="14.4" r="4" fill="#e8912a"/>
      <circle cx="12" cy="9.6" r="4" fill="#f0a12e"/>
      <path d="M12 5.6c-.5-1.4-1.6-2-3.4-1.9.3 1.6 1.4 2.2 3.4 1.9z" fill="#5f9c46"/>
    `),
    prosciutto: S(`
      <path d="M4.4 14c0-3 3.4-5 8-5s7.2 1.7 7.2 4.2c0 3.2-3.5 5.6-8 5.6-4.4 0-7.2-1.8-7.2-4.8z" fill="#e0899c"/>
      <path d="M6.6 13.8c1.6-1.4 3.6-2.2 6-2.2M7.6 16c1.8-1.4 3.8-2.2 6-2.2" stroke="#f7f2e4" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),
    roastBeef: S(`
      <ellipse cx="12" cy="13.4" rx="8" ry="6" fill="#a8394a"/>
      <ellipse cx="12" cy="13.4" rx="5.6" ry="4" fill="#c9536a"/>
      <ellipse cx="12" cy="13.4" rx="2.8" ry="1.8" fill="#e0899c"/>
    `),
    tsukune: skewer("#a8622a", "#8c4a2b"),
    hormone: S(`
      <path d="M5.6 12.4c0-3.2 2.6-5.4 6.4-5.4s6.4 2.2 6.4 5.4c0 4-3.2 7.4-6.4 7.4s-6.4-3.4-6.4-7.4z" fill="#e0a8a2"/>
      <circle cx="9.6" cy="12.4" r="1.8" fill="#f2d0cc"/><circle cx="14.4" cy="13.4" r="1.8" fill="#f2d0cc"/>
      <circle cx="11.8" cy="16" r="1.8" fill="#f2d0cc"/>
    `),
    shiroDashi: bottle("#e8d8b0", "#c2a578"),
    shioKoji:   jar("#f2ecdc", "#c9bd94"),
    springRoll: S(`
      <path d="M4.6 15.4c0-1.9 1.3-3.2 3.4-3.2h8c2.1 0 3.4 1.3 3.4 3.2s-1.3 3.4-3.4 3.4H8c-2.1 0-3.4-1.5-3.4-3.4z" fill="#d9a04c"/>
      <path d="M6 8.4c0-1.9 1.3-3.2 3.4-3.2h8c2.1 0 3.4 1.3 3.4 3.2s-1.3 3.4-3.4 3.4h-8C7.3 11.8 6 10.3 6 8.4z" fill="#e0ab5c"/>
      <path d="M18.4 6.6c.7.5 1 1.1 1 1.8s-.3 1.4-1 1.9" stroke="#c9803a" stroke-width="1.1" fill="none"/>
    `),
    potatoSalad: S(`
      <path d="M3.6 13.4h16.8c0 4.2-2.9 7-7.4 7h-2c-4.5 0-7.4-2.8-7.4-7z" fill="#f2f6f8"/>
      <path d="M5 11.4c1.6-2.4 3.9-3.6 7-3.6s5.4 1.2 7 3.6z" fill="#f0e0b0"/>
      <circle cx="9" cy="10.4" r="1.2" fill="#7ac25a"/><circle cx="14.4" cy="10.8" r="1.2" fill="#e0a83a"/>
      <rect x="2.6" y="12.4" width="18.8" height="2" rx="1" fill="#dfe7ec"/>
    `),
    saladPack: S(`
      <path d="M4.6 9.4h14.8v9.2a2.6 2.6 0 0 1-2.6 2.6H7.2a2.6 2.6 0 0 1-2.6-2.6z" fill="#dfeff2" opacity=".8"/>
      <rect x="3.4" y="6.6" width="17.2" height="3" rx="1.4" fill="#4fb3c4"/>
      <path d="M7 15.4c0-2 1.8-3.4 4-3.4s4 1.4 4 3.4-1.8 3.6-4 3.6-4-1.6-4-3.6z" fill="#7ac25a"/>
      <circle cx="15.4" cy="15.4" r="1.8" fill="#e0603f"/>
    `),
    oden: S(`
      <path d="M3.4 11.4h17.2c0 5.2-3.2 8.6-8.6 8.6S3.4 16.6 3.4 11.4z" fill="#e0d0a8"/>
      <rect x="2.6" y="10" width="18.8" height="2" rx="1" fill="#c9a06a"/>
      <circle cx="8.4" cy="14" r="2.2" fill="#f7f4ec"/>
      <rect x="11.6" y="11.8" width="4.4" height="4.4" rx="1" fill="#e8dcc0"/>
      <rect x="11" y="6.4" width="1.4" height="6" rx=".7" fill="#c9a06a"/>
    `),
    wafer: S(`
      <rect x="3.6" y="7.4" width="16.8" height="3.4" rx=".8" fill="#f0dcb2"/>
      <rect x="3.6" y="10.8" width="16.8" height="2.6" rx=".4" fill="#c9803a"/>
      <rect x="3.6" y="13.4" width="16.8" height="3.4" rx=".8" fill="#f0dcb2"/>
      <path d="M7.4 7.4v3.4M11.4 7.4v3.4M15.4 7.4v3.4M7.4 13.4v3.4M11.4 13.4v3.4M15.4 13.4v3.4" stroke="#e0c48e" stroke-width="1" fill="none"/>
    `),
    tart: S(`
      <path d="M3.6 13h16.8c0 3.6-2.6 6-6.6 6h-3.6c-4 0-6.6-2.4-6.6-6z" fill="#d9a04c"/>
      <path d="M4.6 12.4c0-2.6 3.3-4.4 7.4-4.4s7.4 1.8 7.4 4.4z" fill="#f0dcb2"/>
      <circle cx="9" cy="10.6" r="1.4" fill="#e0526e"/><circle cx="13" cy="10" r="1.4" fill="#7ac25a"/>
      <circle cx="16" cy="11" r="1.4" fill="#e0a83a"/>
    `),
    cerealBar: barWrap("#c9803a", "#8c5a2b"),
    chocoBar:  barWrap("#8c5a2b", "#5a3a1c"),
    popcorn: S(`
      <path d="M6.4 10.4h11.2l-1.2 9.4a2.4 2.4 0 0 1-2.4 2h-4a2.4 2.4 0 0 1-2.4-2z" fill="#e0603f"/>
      <path d="M7.4 10.4h9.2M9.4 10.4l-.4 11M14.6 10.4l.4 11" stroke="#f7f2e4" stroke-width="1.6" fill="none"/>
      <circle cx="8.6" cy="8" r="2.4" fill="#f7ecd2"/><circle cx="12" cy="6.4" r="2.6" fill="#f7ecd2"/>
      <circle cx="15.4" cy="8" r="2.4" fill="#f7ecd2"/>
    `),
    ramuneCandy: S(`
      <rect x="7.6" y="3.4" width="8.8" height="17.2" rx="1.6" fill="#8fd0e0"/>
      <rect x="7.6" y="3.4" width="8.8" height="3.6" rx="1.6" fill="#4fb3c4"/>
      <circle cx="12" cy="10.4" r="2" fill="#ffffff"/><circle cx="12" cy="15.4" r="2" fill="#ffffff"/>
    `),
    ecoBag: S(`
      <path d="M6 8.4h12v10.2A3.4 3.4 0 0 1 14.6 22H9.4A3.4 3.4 0 0 1 6 18.6z" fill="#4e9636"/>
      <path d="M8.6 8.4V6.6a3.4 3.4 0 0 1 6.8 0v1.8h-2V6.6a1.4 1.4 0 0 0-2.8 0v1.8z" fill="#356f26"/>
      <rect x="8" y="12.4" width="8" height="4" rx="1" fill="#ffffff" opacity=".5"/>
    `),
    coolerBag: S(`
      <path d="M4.4 8.4h15.2v10.2A2.8 2.8 0 0 1 16.8 21.4H7.2a2.8 2.8 0 0 1-2.8-2.8z" fill="#4a90d9"/>
      <rect x="3.6" y="6.4" width="16.8" height="2.6" rx="1.2" fill="#2f6fb0"/>
      <path d="M9 6.4V4.8a3 3 0 0 1 6 0v1.6" stroke="#2f6fb0" stroke-width="1.6" fill="none"/>
      <rect x="7.4" y="11.6" width="9.2" height="4.6" rx="1" fill="#ffffff" opacity=".65"/>
    `),
    drainNet: S(`
      <path d="M5.4 8.4h13.2l-1.4 9.8a2.6 2.6 0 0 1-2.6 2.2H9.4a2.6 2.6 0 0 1-2.6-2.2z" fill="#dfe7ec"/>
      <path d="M7 11.4h10M6.6 14.4h10.8M8 17.4h8M9.4 8.4l1 11.6M14.6 8.4l-1 11.6" stroke="#a8b8c2" stroke-width="1" fill="none"/>
      <rect x="4.6" y="6.4" width="14.8" height="2.4" rx="1.1" fill="#a8b8c2"/>
    `),
    mosquitoCoil: S(`
      <path d="M12 5.4a7.2 7.2 0 1 1-7.2 7.2 5.4 5.4 0 1 1 5.4-5.4 3.6 3.6 0 1 1-3.6 3.6" stroke="#4e9636" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M18.4 6.4 21 3.8" stroke="#c2c9cd" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    icePack: S(`
      <rect x="4.4" y="5.4" width="15.2" height="14.4" rx="3" fill="#8fd0e0"/>
      <rect x="4.4" y="5.4" width="15.2" height="14.4" rx="3" fill="none" stroke="#5aa8c4" stroke-width="1.2"/>
      <path d="M12 8.4v8.4M8.6 10.4l6.8 4.4M15.4 10.4l-6.8 4.4" stroke="#ffffff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `),
    calculator: S(`
      <rect x="5.4" y="2.6" width="13.2" height="18.8" rx="2.2" fill="#5a6f7a"/>
      <rect x="7.4" y="4.8" width="9.2" height="3.6" rx=".9" fill="#c9e0d0"/>
      <circle cx="8.6" cy="11.6" r="1.2" fill="#c2c9cd"/><circle cx="12" cy="11.6" r="1.2" fill="#c2c9cd"/>
      <circle cx="15.4" cy="11.6" r="1.2" fill="#c2c9cd"/><circle cx="8.6" cy="15" r="1.2" fill="#c2c9cd"/>
      <circle cx="12" cy="15" r="1.2" fill="#c2c9cd"/><circle cx="15.4" cy="15" r="1.2" fill="#e0603f"/>
      <circle cx="8.6" cy="18.4" r="1.2" fill="#c2c9cd"/><circle cx="12" cy="18.4" r="1.2" fill="#c2c9cd"/>
    `),
    cutter: S(`
      <path d="M3.4 15.6 15.6 3.4l5 5L8.4 20.6z" fill="#f0c832"/>
      <path d="M15.6 3.4 20.6 8.4 17.6 11.4 12.6 6.4z" fill="#c2c9cd"/>
      <path d="M6.4 12.6 11.4 17.6" stroke="#c9a534" stroke-width="1.4" fill="none"/>
    `),
    hat: S(`
      <path d="M3.4 16.4c0-1.2 1.4-2 3.6-2.4C7.4 8.6 9.4 5.6 12 5.6s4.6 3 5 8.4c2.2.4 3.6 1.2 3.6 2.4 0 1.6-3.9 2.6-8.6 2.6s-8.6-1-8.6-2.6z" fill="#e0c49a"/>
      <path d="M7 14c1.4 1.2 3.1 1.8 5 1.8s3.6-.6 5-1.8" stroke="#c9a06a" stroke-width="1.4" fill="none"/>
      <path d="M6.8 12.6h10.4v1.8H6.8z" fill="#c2523f" opacity=".8"/>
    `),
    pyjamas: S(`
      <path d="M7.6 3.4h8.8l3.4 2.6-2 3.4-2-1.2v11.4a1.4 1.4 0 0 1-1.4 1.4h-4.8a1.4 1.4 0 0 1-1.4-1.4V8.2l-2 1.2-2-3.4z" fill="#a9c4d8"/>
      <path d="M9 6.4h6M9 9.4h6M9 12.4h6M9 15.4h6" stroke="#7fa4bd" stroke-width="1" fill="none"/>
    `),

    /* ================= 家具・寝具 =================

       A shopping list is not only groceries: 「カーテン」「布団」「本棚」 are
       written down the same way, and until now every one of them came out as
       the same blank box. Furniture is drawn from the front, in wood or fabric
       colours, so the group reads as furniture at a glance and the shape says
       which piece. */
    chair: S(`
      <rect x="6.6" y="2.6" width="10.8" height="9" rx="1.6" fill="#c98f4f"/>
      <rect x="8.6" y="4.8" width="6.8" height="1.6" rx=".8" fill="#a8712f"/>
      <rect x="4.6" y="11.4" width="14.8" height="3.2" rx="1.3" fill="#b5793f"/>
      <rect x="6" y="14.4" width="2.2" height="6.8" rx="1" fill="#8c5a2b"/>
      <rect x="15.8" y="14.4" width="2.2" height="6.8" rx="1" fill="#8c5a2b"/>
    `),
    desk: S(`
      <rect x="2.6" y="6.8" width="18.8" height="2.8" rx="1.2" fill="#d3a86e"/>
      <rect x="4" y="9.6" width="8.6" height="5.8" rx="1" fill="#e0c49a"/>
      <rect x="5.6" y="11.8" width="5.4" height="1.2" rx=".6" fill="#b5793f"/>
      <rect x="4" y="15.4" width="2.2" height="5.8" rx="1" fill="#8c5a2b"/>
      <rect x="17.8" y="9.6" width="2.2" height="11.6" rx="1" fill="#8c5a2b"/>
    `),
    diningTable: S(`
      <ellipse cx="12" cy="8.4" rx="9.4" ry="3" fill="#d3a86e"/>
      <path d="M2.6 8.4h18.8v1.6a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z" fill="#b5793f"/>
      <rect x="11" y="11" width="2" height="8.8" fill="#8c5a2b"/>
      <rect x="7" y="19.4" width="10" height="2" rx="1" fill="#8c5a2b"/>
    `),
    sofa: S(`
      <rect x="4.8" y="5.2" width="14.4" height="6.6" rx="2" fill="#87abcb"/>
      <rect x="2.6" y="9" width="18.8" height="7.4" rx="2.2" fill="#6f93b5"/>
      <rect x="2.6" y="8.2" width="3.6" height="8.2" rx="1.7" fill="#5b7c9c"/>
      <rect x="17.8" y="8.2" width="3.6" height="8.2" rx="1.7" fill="#5b7c9c"/>
      <rect x="4.6" y="16.2" width="2" height="3" rx=".9" fill="#3f5a75"/>
      <rect x="17.4" y="16.2" width="2" height="3" rx=".9" fill="#3f5a75"/>
    `),
    bed: S(`
      <rect x="2.6" y="6.2" width="2.6" height="13.4" rx="1.2" fill="#8c5a2b"/>
      <rect x="18.8" y="10.4" width="2.6" height="9.2" rx="1.2" fill="#8c5a2b"/>
      <rect x="5.4" y="9.8" width="6" height="4" rx="1.8" fill="#f2f6f8"/>
      <rect x="4.4" y="13.2" width="15.6" height="2.8" rx="1.2" fill="#e9f2f7"/>
      <rect x="4.4" y="15.6" width="15.6" height="3" rx="1.3" fill="#9dbccd"/>
    `),
    /* Tufted, because a plain slab is a slab: the buttons are the one mark
       that says mattress rather than sheet, blanket or futon. */
    mattress: S(`
      <rect x="2.6" y="7.4" width="18.8" height="9.6" rx="2.4" fill="#f7fafc"/>
      <rect x="2.6" y="7.4" width="18.8" height="9.6" rx="2.4" fill="none" stroke="#cbdde8" stroke-width="1.2"/>
      <path d="M2.6 12.4h18.8" stroke="#cbdde8" stroke-width="1.2" fill="none"/>
      <circle cx="7" cy="9.9" r=".9" fill="#9dbccd"/><circle cx="12" cy="9.9" r=".9" fill="#9dbccd"/>
      <circle cx="17" cy="9.9" r=".9" fill="#9dbccd"/><circle cx="7" cy="14.9" r=".9" fill="#9dbccd"/>
      <circle cx="12" cy="14.9" r=".9" fill="#9dbccd"/><circle cx="17" cy="14.9" r=".9" fill="#9dbccd"/>
    `),
    futon: S(`
      <rect x="3.4" y="14" width="17.2" height="5.6" rx="2.2" fill="#cbdde8"/>
      <rect x="4.8" y="9.4" width="14.4" height="5" rx="2.2" fill="#f2f6f8"/>
      <rect x="6.2" y="5.2" width="11.6" height="4.6" rx="2.2" fill="#dfe9f0"/>
      <path d="M9.4 6.6h5M8 11.2h8M6.6 16.2h10.8" stroke="#9dbccd" stroke-width="1" fill="none" stroke-linecap="round"/>
    `),
    /* White on a white row is not a picture. Everything soft and pale in this
       group carries enough tint to have an outline of its own. */
    pillow: S(`
      <path d="M3.4 9.6c0-1.7 1.5-2.8 3.6-2.8h10c2.1 0 3.6 1.1 3.6 2.8v4.8c0 1.7-1.5 2.8-3.6 2.8H7c-2.1 0-3.6-1.1-3.6-2.8z" fill="#e4ecf1"/>
      <path d="M6.6 8.4c1.5 1.6 1.5 5.6 0 7.2M17.4 8.4c-1.5 1.6-1.5 5.6 0 7.2" stroke="#a9c4d8" stroke-width="1.4" fill="none"/>
    `),
    blanket: S(`
      <path d="M4 5.4h16v11.2a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 16.6z" fill="#c98fa0"/>
      <path d="M4 8.8h16v2.6H4z" fill="#a86e80"/>
      <path d="M5.2 19h13.6l-.6 1.8a5.6 5.6 0 0 1-1.4-1 5.6 5.6 0 0 1-2 1 5.6 5.6 0 0 1-2-1 5.6 5.6 0 0 1-2 1 5.6 5.6 0 0 1-2-1 5.6 5.6 0 0 1-2 1z" fill="#a86e80"/>
    `),
    /* A fitted sheet is the mattress wearing something: same slab, but skinned
       and gathered under at the corners. */
    bedSheet: S(`
      <path d="M3.4 7.4h17.2v7.8c0 3-1.8 4.8-4.6 4.8H8c-2.8 0-4.6-1.8-4.6-4.8z" fill="#a9c4d8"/>
      <path d="M3.4 7.4h17.2v2.6H3.4z" fill="#7fa4bd"/>
      <path d="M6 13.4c2.8 1.6 5.6 2.4 8.2 2.4 1.8 0 3.6-.4 5.4-1.2" stroke="#dfe9f0" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    bookshelf: S(`
      <rect x="3.4" y="3.2" width="17.2" height="17.6" rx="1.8" fill="#c9a06a"/>
      <rect x="5.2" y="5" width="13.6" height="5" fill="#f7efdc"/>
      <rect x="5.2" y="11.4" width="13.6" height="5" fill="#f7efdc"/>
      <rect x="6.2" y="5.6" width="1.8" height="3.8" fill="#c2523f"/>
      <rect x="8.4" y="5.6" width="1.8" height="3.8" fill="#4a90d9"/>
      <rect x="10.6" y="5.6" width="1.8" height="3.8" fill="#5cb85c"/>
      <rect x="6.2" y="12" width="1.8" height="3.8" fill="#e0a83a"/>
      <rect x="8.4" y="12" width="1.8" height="3.8" fill="#8c9aa4"/>
    `),
    shelfUnit: S(`
      <rect x="3.4" y="4" width="1.9" height="16.6" rx=".9" fill="#8c9aa4"/>
      <rect x="18.7" y="4" width="1.9" height="16.6" rx=".9" fill="#8c9aa4"/>
      <rect x="3.4" y="6" width="17.2" height="1.9" rx=".9" fill="#c2c9cd"/>
      <rect x="3.4" y="11.2" width="17.2" height="1.9" rx=".9" fill="#c2c9cd"/>
      <rect x="3.4" y="16.4" width="17.2" height="1.9" rx=".9" fill="#c2c9cd"/>
    `),
    chestDrawers: S(`
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="1.8" fill="#c98f4f"/>
      <rect x="5.4" y="5.4" width="13.2" height="4" rx=".8" fill="#e0c49a"/>
      <rect x="5.4" y="10" width="13.2" height="4" rx=".8" fill="#e0c49a"/>
      <rect x="5.4" y="14.6" width="13.2" height="4" rx=".8" fill="#e0c49a"/>
      <path d="M10.6 7.4h2.8M10.6 12h2.8M10.6 16.6h2.8" stroke="#8c5a2b" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    `),
    /* Square and lidded with a label patch — a bucket tapers, a bin does not,
       and the patch is what a storage case has that a rubbish bin never does. */
    storageBox: S(`
      <rect x="3.4" y="8.6" width="17.2" height="11.8" rx="1.8" fill="#a9c4d8"/>
      <rect x="2.6" y="5.8" width="18.8" height="3.2" rx="1.4" fill="#6f93b5"/>
      <path d="M5 4.4h4.4v1.6H5zM14.6 4.4H19v1.6h-4.4z" fill="#5b7c9c"/>
      <rect x="8.4" y="12.2" width="7.2" height="4.6" rx=".9" fill="#f7fafc" opacity=".9"/>
      <path d="M9.8 14h4.4M9.8 15.6h2.8" stroke="#8bb0cc" stroke-width="1" fill="none" stroke-linecap="round"/>
    `),
    rug: S(`
      <path d="M3 8.6h18l-1.6 9.2H4.6z" fill="#c26a5a"/>
      <path d="M3 8.6h18l-.36 2H3.36z" fill="#9c4d40"/>
      <path d="M6.4 12.6h11.2M6.1 15h11.8" stroke="#e0c49a" stroke-width="1.2" fill="none"/>
      <path d="M4.6 17.8h14.8l-.3 1.8H4.9z" fill="#e0c49a"/>
    `),
    curtain: S(`
      <rect x="2.6" y="3.2" width="18.8" height="1.9" rx=".9" fill="#8c9aa4"/>
      <path d="M4.2 5.1h5.6v13.6c0 1.5-1.2 2.5-2.8 2.5s-2.8-1-2.8-2.5z" fill="#9cc0a8"/>
      <path d="M14.2 5.1h5.6v13.6c0 1.5-1.2 2.5-2.8 2.5s-2.8-1-2.8-2.5z" fill="#7fa88c"/>
      <path d="M7 6.4v12.4M17 6.4v12.4" stroke="#6f9880" stroke-width="1" fill="none" opacity=".7"/>
    `),
    mirror: S(`
      <rect x="6.2" y="2.6" width="11.6" height="18.8" rx="5.8" fill="#8c9aa4"/>
      <rect x="7.9" y="4.3" width="8.2" height="15.4" rx="4.1" fill="#dbeaf2"/>
      <path d="M10 14.4 14.6 7.6" stroke="#ffffff" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    `),
    wallClock: S(`
      <circle cx="12" cy="12" r="9.2" fill="#f2f6f8"/>
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="#5a6f7a" stroke-width="1.8"/>
      <path d="M12 6.4V12l3.8 2.4" stroke="#3f4f5a" stroke-width="1.7" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="1.1" fill="#e0603f"/>
    `),
    deskLamp: S(`
      <path d="M8 4.2h8.6l3 6.6H5z" fill="#f0c832"/>
      <rect x="12.2" y="10.8" width="1.8" height="8.2" rx=".9" fill="#8c9aa4"/>
      <rect x="7.6" y="18.8" width="9.6" height="2.4" rx="1.2" fill="#5a6f7a"/>
      <ellipse cx="12.3" cy="11.4" rx="2.4" ry=".9" fill="#f7e6a0"/>
    `),
    ceilingLight: S(`
      <rect x="11.2" y="2.6" width="1.6" height="3.6" fill="#8c9aa4"/>
      <path d="M3.8 15c0-4.4 3.7-7.6 8.2-7.6s8.2 3.2 8.2 7.6z" fill="#f2f6f8"/>
      <rect x="3.4" y="14.8" width="17.2" height="2.6" rx="1.3" fill="#f0d873"/>
      <path d="M6.4 19.8h2.4M11 19.8h2M15.2 19.8h2.4" stroke="#f0c832" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    cushion: S(`
      <path d="M4.6 4.6c4.9-1 10-1 14.8 0 1 4.8 1 10 0 14.8-4.8 1-9.9 1-14.8 0-1-4.8-1-10 0-14.8z" fill="#d9a05a"/>
      <circle cx="12" cy="12" r="1.7" fill="#b57c3a"/>
    `),
    doormat: S(`
      <path d="M2.8 9h18.4l-1.4 8.6H4.2z" fill="#a8895f"/>
      <path d="M5.6 11.4h12.8M5.4 13.4h13.2M5.2 15.4h13.6" stroke="#846b46" stroke-width="1.1" fill="none"/>
    `),
    laundryBasket: S(`
      <path d="M5 8.4h14l-1.4 11a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z" fill="#e0c49a"/>
      <path d="M7 11h10M6.8 14h10.4M6.6 17h10.8" stroke="#c9a06a" stroke-width="1.2" fill="none"/>
      <rect x="3.6" y="6" width="16.8" height="2.5" rx="1.2" fill="#c9a06a"/>
    `),
    photoFrame: S(`
      <rect x="4.4" y="3.4" width="15.2" height="17.2" rx="1.6" fill="#c98f4f"/>
      <rect x="6.4" y="5.4" width="11.2" height="13.2" rx=".8" fill="#dbeaf2"/>
      <path d="M6.4 16.4 9.8 11.6l2.6 3 2.2-2 3 3.8z" fill="#7fa4bd"/>
      <circle cx="9" cy="8.8" r="1.4" fill="#f0d873"/>
    `),
    vase: S(`
      <path d="M9.2 4.4h5.6l-.9 3.6c2.6 1.4 4.1 3.7 4.1 6.5 0 3.7-2.6 6.1-6 6.1s-6-2.4-6-6.1c0-2.8 1.5-5.1 4.1-6.5z" fill="#7fb8c4"/>
      ${SHINE}
    `),
    kotatsu: S(`
      <rect x="2.6" y="7.4" width="18.8" height="2.4" rx="1" fill="#c98f4f"/>
      <path d="M4.4 9.8h15.2l1.4 8.4a1.6 1.6 0 0 1-1.6 1.9H4.6a1.6 1.6 0 0 1-1.6-1.9z" fill="#e0916a"/>
      <path d="M8.4 9.8 7.6 20.1M12 9.8v10.3M15.6 9.8l.8 10.3" stroke="#c2735a" stroke-width="1.1" fill="none"/>
      <rect x="4.6" y="13.4" width="14.8" height="1.6" fill="#c2735a"/>
    `),

    /* ================= 文房具 =================

       One ペン used to answer for 鉛筆・シャーペン・蛍光ペン・マジック alike,
       which is no help at all on a list where all four can appear at once.
       They are drawn apart here, and so is everything that lives in the same
       drawer. */
    pencil: S(`
      <path d="M7.4 20.8 5.6 16.4 15.8 6.2l4.4 1.8-10.2 10.2z" fill="#f0c832"/>
      <path d="m15.8 6.2 1.6-1.6a1.5 1.5 0 0 1 2.1 0l1.9 1.9a1.5 1.5 0 0 1 0 2.1l-1.2 1.2z" fill="#e0a83a"/>
      <path d="M5.6 16.4 3.4 21.6l5.2-2z" fill="#f2e4c4"/>
      <path d="M3.4 21.6 5 20.9l-.9-.9z" fill="#3f4f5a"/>
    `),
    mechanicalPencil: S(`
      <path d="M10.4 6.6h3.2v13.2a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1-1.6-1.6z" fill="#4a90d9"/>
      <path d="M10.4 3.6h3.2v3h-3.2z" fill="#3f4f5a"/>
      <path d="M11.6 1.9h.8v1.8h-.8z" fill="#8c9aa4"/>
      <rect x="14.2" y="7.4" width="1.4" height="4.6" rx=".7" fill="#8c9aa4"/>
      <path d="M10.4 19.8h3.2v1.6h-3.2z" fill="#c2c9cd"/>
    `),
    pencilLead: S(`
      <rect x="7.6" y="3.6" width="8.8" height="16.8" rx="1.6" fill="#3f4f5a"/>
      <rect x="7.6" y="3.6" width="8.8" height="4.4" rx="1.6" fill="#5a6f7a"/>
      <path d="M9.6 10h1v8.4h-1zM11.5 10h1v8.4h-1zM13.4 10h1v8.4h-1z" fill="#c2c9cd"/>
    `),
    marker: S(`
      <path d="M8.6 8.2h6.8v11.2a2 2 0 0 1-2 2h-2.8a2 2 0 0 1-2-2z" fill="#3f4f5a"/>
      <path d="M9.4 3.4h5.2v4.8H9.4z" fill="#c2402e"/>
      <path d="M10.6 1.8h2.8v1.8h-2.8z" fill="#8c9aa4"/>
      <rect x="9.4" y="12.4" width="5.2" height="2" fill="#c2c9cd"/>
    `),
    highlighter: S(`
      <path d="M8.4 2.8h7.2v9.4H8.4z" fill="#f0d873"/>
      <path d="M8.4 12.2h7.2l-1.6 3.4H10z" fill="#e6c95a"/>
      <path d="M10 15.6h4l1.4 4.6a1.4 1.4 0 0 1-1.4 1.6h-4a1.4 1.4 0 0 1-1.4-1.6z" fill="#f7e6a0"/>
      <rect x="8.4" y="5.6" width="7.2" height="1.8" fill="#e0a83a"/>
    `),
    crayon: S(`
      <path d="M4.2 21.2 3.4 8.6h4.4l-.8 12.6a1.4 1.4 0 0 1-2.8 0z" fill="#c2402e"/>
      <path d="M3.4 8.6 5.6 3.4l2.2 5.2z" fill="#e0603f"/>
      <path d="M12.2 21.2 11.4 8.6h4.4l-.8 12.6a1.4 1.4 0 0 1-2.8 0z" fill="#3f8fb0"/>
      <path d="M11.4 8.6 13.6 3.4l2.2 5.2z" fill="#4a90d9"/>
      <path d="M18.4 21.4 17.8 12h3.8l-.6 9.4a1.3 1.3 0 0 1-2.6 0z" fill="#3f9440"/>
      <path d="M17.8 12l1.9-4.4L21.6 12z" fill="#5cb85c"/>
    `),
    colorPencils: S(`
      <path d="M4.6 21 3.4 9.6l3.4-.6 3.2 11.2a1.6 1.6 0 0 1-1.2 1.9l-2 .4A1.6 1.6 0 0 1 4.6 21z" fill="#c2402e" transform="rotate(6 7 15)"/>
      <path d="M9.4 20.8 9 8.8h3.4l-.4 12a1.5 1.5 0 0 1-1.6 1.4 1.5 1.5 0 0 1-1.6-1.4z" fill="#f0c832"/>
      <path d="M9 8.8 10.7 3.6l1.7 5.2z" fill="#e0a83a"/>
      <path d="M14.6 20.4 15.9 8.6l3.4.6-1.8 11.6a1.5 1.5 0 0 1-1.8 1.2 1.5 1.5 0 0 1-1.1-1.6z" fill="#3f8fb0"/>
      <path d="m15.9 8.6 3-4.6 1.5 5.2z" fill="#4a90d9"/>
    `),
    paintSet: S(`
      <rect x="2.8" y="7.6" width="18.4" height="9.2" rx="1.8" fill="#8c9aa4"/>
      <circle cx="6.6" cy="12.2" r="2.4" fill="#c2402e"/>
      <circle cx="12" cy="12.2" r="2.4" fill="#f0c832"/>
      <circle cx="17.4" cy="12.2" r="2.4" fill="#4a90d9"/>
      <rect x="2.8" y="7.6" width="18.4" height="1.8" rx=".9" fill="#c2c9cd"/>
    `),
    paintBrush: S(`
      <rect x="10.8" y="2.6" width="2.4" height="11.4" rx="1.2" fill="#c9a06a"/>
      <rect x="9.8" y="13.4" width="4.4" height="3" rx=".8" fill="#8c9aa4"/>
      <path d="M9.8 16.2h4.4l-1.2 4.6a1.1 1.1 0 0 1-2 0z" fill="#3f4f5a"/>
    `),
    correctionTape: S(`
      <path d="M4.6 8.4h10.8a4.6 4.6 0 0 1 0 9.2H4.6a2.4 2.4 0 0 1-2.4-2.4v-4.4a2.4 2.4 0 0 1 2.4-2.4z" fill="#4fb3c4"/>
      <circle cx="14.4" cy="13" r="3.2" fill="#f2f6f8"/>
      <circle cx="14.4" cy="13" r="1.2" fill="#8c9aa4"/>
      <rect x="17.6" y="15" width="4.2" height="2.6" rx="1" fill="#ffffff"/>
      <rect x="17.6" y="15" width="4.2" height="2.6" rx="1" fill="none" stroke="#c2c9cd" stroke-width="1"/>
    `),
    paperClip: S(`
      <path d="M16.4 6.6v10.2a4.6 4.6 0 0 1-9.2 0V7.2a2.9 2.9 0 0 1 5.8 0v9a1.4 1.4 0 0 1-2.8 0V8.2" stroke="#8c9aa4" stroke-width="2" fill="none" stroke-linecap="round"/>
    `),
    binderClip: S(`
      <path d="M3.6 9.6h16.8v8.6a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z" fill="#3f4f5a"/>
      <path d="M6.6 9.4 8.8 3.6M17.4 9.4 15.2 3.6" stroke="#8c9aa4" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M3.6 9.6h16.8v2.4H3.6z" fill="#5a6f7a"/>
    `),
    pushPin: S(`
      <path d="M8.6 2.8h6.8v3.4l1.8 5.4H6.8l1.8-5.4z" fill="#c2402e"/>
      <path d="M6.8 11.6h10.4v1.8H6.8z" fill="#e0603f"/>
      <path d="M11.4 13.4h1.2v7.8h-1.2z" fill="#8c9aa4"/>
    `),
    rubberBand: S(`
      <ellipse cx="12" cy="12" rx="9" ry="6.4" fill="none" stroke="#f0c832" stroke-width="2.6" transform="rotate(-18 12 12)"/>
      <ellipse cx="12" cy="12" rx="5.6" ry="3.4" fill="none" stroke="#e0a83a" stroke-width="2" transform="rotate(22 12 12)"/>
    `),
    staples: S(`
      <path d="M4.6 17.4V9.2A4.6 4.6 0 0 1 9.2 4.6h5.6a4.6 4.6 0 0 1 4.6 4.6v8.2h-2.8V9.2a1.8 1.8 0 0 0-1.8-1.8H9.2a1.8 1.8 0 0 0-1.8 1.8v8.2z" fill="#8c9aa4"/>
      <path d="M4.6 17.4h14.8v2.6H4.6z" fill="#c2c9cd"/>
    `),
    holePunch: S(`
      <path d="M3.6 12.6h16.8v4.8a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z" fill="#3f8fb0"/>
      <path d="M6.4 6.4h11.2a2 2 0 0 1 2 2v4.2H4.4V8.4a2 2 0 0 1 2-2z" fill="#4a90d9"/>
      <circle cx="9" cy="9.4" r="1.5" fill="#f2f6f8"/>
      <circle cx="15" cy="9.4" r="1.5" fill="#f2f6f8"/>
    `),
    pencilCase: S(`
      <path d="M3.4 9.4h17.2v8.4a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#4a7fb5"/>
      <path d="M3.4 9.4h17.2v2.6H3.4z" fill="#3f6a99"/>
      <rect x="9.4" y="6.4" width="5.2" height="3.2" rx="1.4" fill="#f0c832"/>
      <circle cx="12" cy="8" r="1" fill="#8c5a2b"/>
    `),
    copyPaper: S(`
      <rect x="4.4" y="3.6" width="15.2" height="17.4" rx="1.2" fill="#f2f6f8"/>
      <rect x="4.4" y="3.6" width="15.2" height="17.4" rx="1.2" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <rect x="2.8" y="5.6" width="15.2" height="17.4" rx="1.2" fill="#ffffff" opacity="0"/>
      <path d="M7.4 8h9.2M7.4 11.4h9.2M7.4 14.8h9.2M7.4 18.2h5.6" stroke="#cbdde8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    looseLeaf: S(`
      <rect x="5.4" y="3.4" width="14.4" height="17.2" rx="1.4" fill="#f7fafc"/>
      <rect x="5.4" y="3.4" width="14.4" height="17.2" rx="1.4" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <circle cx="7.6" cy="7" r="1.1" fill="#cbdde8"/>
      <circle cx="7.6" cy="12" r="1.1" fill="#cbdde8"/>
      <circle cx="7.6" cy="17" r="1.1" fill="#cbdde8"/>
      <path d="M10.4 8.4h6.6M10.4 12h6.6M10.4 15.6h4.4" stroke="#cbdde8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    binder: S(`
      <rect x="4.4" y="3.4" width="15.2" height="17.2" rx="1.6" fill="#3f6a99"/>
      <rect x="7.6" y="3.4" width="12" height="17.2" fill="#f2f6f8"/>
      <rect x="17.6" y="3.4" width="2" height="17.2" fill="#3f6a99"/>
      <path d="M6 7.4a2.6 2.6 0 0 0 0 3.2M6 13.4a2.6 2.6 0 0 0 0 3.2" stroke="#c2c9cd" stroke-width="1.5" fill="none"/>
    `),
    letterPad: S(`
      <rect x="3.6" y="5.4" width="16.8" height="13.4" rx="1.2" fill="#f7fafc"/>
      <rect x="3.6" y="5.4" width="16.8" height="13.4" rx="1.2" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <path d="M6.4 9h11.2M6.4 12h11.2M6.4 15h7.6" stroke="#e6b0b8" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <path d="M3.6 5.4h16.8v1.8H3.6z" fill="#e6b0b8"/>
    `),
    postcard: S(`
      <rect x="2.8" y="6.4" width="18.4" height="11.6" rx="1.4" fill="#f7efdc"/>
      <rect x="2.8" y="6.4" width="18.4" height="11.6" rx="1.4" fill="none" stroke="#d9c9a4" stroke-width="1.1"/>
      <rect x="15.6" y="8.2" width="4" height="3.2" rx=".6" fill="#c2402e" opacity=".8"/>
      <path d="M5.4 9.6h7.4M5.4 12.2h7.4M5.4 14.8h9.6" stroke="#c9b48a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    `),
    postageStamp: S(`
      <path d="M4.4 5.4h15.2v13.2H4.4z" fill="#f2f6f8"/>
      <path d="M4.4 5.4h15.2v13.2H4.4z" fill="none" stroke="#c2c9cd" stroke-width="1.1" stroke-dasharray="1.6 1.2"/>
      <rect x="6.8" y="7.8" width="10.4" height="8.4" rx=".8" fill="#5aa8c4"/>
      <path d="M6.8 16.2 10.4 11.6l2.4 2.8 2-1.8 2.4 3.6z" fill="#3f8fb0"/>
    `),
    nameStamp: S(`
      <rect x="9" y="2.6" width="6" height="12.4" rx="1.4" fill="#3f4f5a"/>
      <rect x="7.8" y="15" width="8.4" height="2.6" rx=".8" fill="#8c9aa4"/>
      <rect x="8.6" y="17.6" width="6.8" height="3.4" rx="1" fill="#c2402e"/>
      <rect x="9.8" y="5.4" width="4.4" height="1.4" rx=".7" fill="#c2c9cd"/>
    `),
    inkPad: S(`
      <path d="M3.6 11.6h16.8v5.6a2.2 2.2 0 0 1-2.2 2.2H5.8a2.2 2.2 0 0 1-2.2-2.2z" fill="#3f4f5a"/>
      <path d="M4.6 6.6h14.8a1.8 1.8 0 0 1 1.8 1.8v3.2H2.8V8.4a1.8 1.8 0 0 1 1.8-1.8z" fill="#5a6f7a"/>
      <rect x="6" y="7.8" width="12" height="3" rx=".8" fill="#c2402e"/>
    `),
    memoPad: S(`
      <rect x="4.6" y="4.4" width="14.8" height="16.2" rx="1.4" fill="#f7fafc"/>
      <rect x="4.6" y="4.4" width="14.8" height="16.2" rx="1.4" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <rect x="4.6" y="4.4" width="14.8" height="3" rx="1.4" fill="#8c9aa4"/>
      <path d="M7.4 10h9.2M7.4 13.2h9.2M7.4 16.4h6" stroke="#cbdde8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    `),
    diary: S(`
      <rect x="4.4" y="3.2" width="15.2" height="17.6" rx="2" fill="#8c5a2b"/>
      <rect x="6.2" y="3.2" width="13.4" height="17.6" rx="1.6" fill="#a8712f"/>
      <path d="M16.8 3.2h2.8v17.6h-2.8z" fill="#8c5a2b"/>
      <rect x="8.4" y="7.4" width="7.4" height="1.4" rx=".7" fill="#e0c49a"/>
      <path d="M13.6 20.8v-4.4l1.8 1.4 1.8-1.4v4.4z" fill="#c2402e"/>
    `),
    calendarSheet: S(`
      <rect x="3.4" y="4.6" width="17.2" height="16" rx="1.8" fill="#f2f6f8"/>
      <rect x="3.4" y="4.6" width="17.2" height="4.4" rx="1.8" fill="#c2402e"/>
      <rect x="7" y="2.6" width="1.8" height="3.6" rx=".9" fill="#8c9aa4"/>
      <rect x="15.2" y="2.6" width="1.8" height="3.6" rx=".9" fill="#8c9aa4"/>
      <circle cx="8" cy="12.6" r="1.2" fill="#cbdde8"/><circle cx="12" cy="12.6" r="1.2" fill="#cbdde8"/>
      <circle cx="16" cy="12.6" r="1.2" fill="#cbdde8"/><circle cx="8" cy="16.6" r="1.2" fill="#cbdde8"/>
      <circle cx="12" cy="16.6" r="1.2" fill="#e0603f"/><circle cx="16" cy="16.6" r="1.2" fill="#cbdde8"/>
    `),
    whiteboard: S(`
      <rect x="2.6" y="4.4" width="18.8" height="12.6" rx="1.4" fill="#f7fafc"/>
      <rect x="2.6" y="4.4" width="18.8" height="12.6" rx="1.4" fill="none" stroke="#8c9aa4" stroke-width="1.6"/>
      <path d="M6 8.4h8M6 11.4h5.6" stroke="#4a90d9" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <rect x="7.4" y="14.4" width="5.6" height="1.6" rx=".8" fill="#c2402e"/>
      <path d="M8 17h2v3.6H8zM14 17h2v3.6h-2z" fill="#8c9aa4"/>
    `),
    magnetPin: S(`
      <path d="M5 18.6V11a7 7 0 0 1 14 0v7.6h-4.6V11a2.4 2.4 0 0 0-4.8 0v7.6z" fill="#c2402e"/>
      <path d="M5 18.6h4.6v2.6H5zM14.4 18.6H19v2.6h-4.6z" fill="#c2c9cd"/>
    `),
    labelSticker: S(`
      <rect x="3.4" y="4.6" width="17.2" height="15.2" rx="1.6" fill="#f7fafc"/>
      <rect x="3.4" y="4.6" width="17.2" height="15.2" rx="1.6" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <rect x="5.6" y="6.8" width="5.6" height="4.4" rx=".8" fill="#f0c832"/>
      <rect x="12.8" y="6.8" width="5.6" height="4.4" rx=".8" fill="#5cb85c"/>
      <rect x="5.6" y="13.2" width="5.6" height="4.4" rx=".8" fill="#4a90d9"/>
      <rect x="12.8" y="13.2" width="5.6" height="4.4" rx=".8" fill="#e0603f"/>
    `),
    sketchbook: S(`
      <rect x="3.6" y="4.4" width="16.8" height="15.6" rx="1.4" fill="#e6e0d2"/>
      <rect x="3.6" y="4.4" width="16.8" height="15.6" rx="1.4" fill="none" stroke="#c2b9a6" stroke-width="1.1"/>
      <path d="M6.4 3.2v3M9.4 3.2v3M12.4 3.2v3M15.4 3.2v3M18.4 3.2v3" stroke="#8c9aa4" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M6.6 16.6 10 12l2.6 3 2.4-2.2 2.6 3.8z" fill="#a8b8c2"/>
    `),
    protractor: S(`
      <path d="M3 16.4a9 9 0 0 1 18 0z" fill="#8fd0e0" opacity=".8"/>
      <path d="M3 16.4h18v1.8H3z" fill="#3f8fb0"/>
      <path d="M12 16.4V9.4M7.6 16.4l1.4-2.6M16.4 16.4l-1.4-2.6" stroke="#3f8fb0" stroke-width="1.1" fill="none"/>
    `),
    inkCartridge: S(`
      <rect x="6.4" y="4.4" width="11.2" height="14.4" rx="1.4" fill="#3f4f5a"/>
      <rect x="8" y="6.4" width="8" height="6" rx=".8" fill="#4a90d9"/>
      <rect x="9.6" y="18.8" width="4.8" height="2.4" rx=".8" fill="#8c9aa4"/>
      <rect x="8" y="14" width="8" height="1.6" rx=".8" fill="#c2c9cd"/>
    `),

    /* ================= キッチングッズ =================

       The tools, not the food. They share the pan's greys and the board's wood
       so the drawer looks like one drawer, and each keeps the one feature that
       names it: the ladle its bowl, the whisk its wires, the grater its teeth. */
    saucepan: S(`
      <path d="M3.4 9.6h11.2v6.2a3.4 3.4 0 0 1-3.4 3.4H6.8a3.4 3.4 0 0 1-3.4-3.4z" fill="#c2c9cd"/>
      <rect x="2.6" y="7.8" width="12.8" height="2.2" rx="1.1" fill="#8c9aa4"/>
      <rect x="15" y="9.6" width="6.4" height="2.2" rx="1.1" fill="#3f4f5a"/>
    `),
    pressureCooker: S(`
      <path d="M4 10.4h16v6a3.6 3.6 0 0 1-3.6 3.6H7.6A3.6 3.6 0 0 1 4 16.4z" fill="#a8b8c2"/>
      <rect x="3.2" y="8.2" width="17.6" height="2.4" rx="1.2" fill="#5a6f7a"/>
      <rect x="10.6" y="4.4" width="2.8" height="3.8" rx="1.2" fill="#3f4f5a"/>
      <circle cx="12" cy="4.2" r="1.6" fill="#8c9aa4"/>
      <rect x="4.6" y="12.8" width="6" height="1.8" rx=".9" fill="#8c9aa4"/>
    `),
    wok: S(`
      <path d="M2.6 10.4h16.8c0 5.2-3.6 8.8-8.4 8.8s-8.4-3.6-8.4-8.8z" fill="#5a6f7a"/>
      <path d="M4.6 11.4h12.8c-.4 3.6-3.2 6-6.4 6s-6-2.4-6.4-6z" fill="#3f4f5a"/>
      <path d="M19.2 9.2h2.4a1.3 1.3 0 0 1 0 2.6h-2.4z" fill="#8c5a2b"/>
    `),
    potLid: S(`
      <path d="M2.6 15.4c0-5 4.2-8.6 9.4-8.6s9.4 3.6 9.4 8.6z" fill="#c2c9cd"/>
      <rect x="2.6" y="15.2" width="18.8" height="2.4" rx="1.2" fill="#8c9aa4"/>
      <rect x="10.4" y="3.4" width="3.2" height="3.6" rx="1.4" fill="#3f4f5a"/>
    `),
    ladle: S(`
      <path d="M6 8.4a5 5 0 0 0 10 0z" fill="#c2c9cd"/>
      <path d="M6 7.2h10v1.6H6z" fill="#8c9aa4"/>
      <path d="M14.8 7.6V4.6a2 2 0 0 1 2-2h2.6" stroke="#8c9aa4" stroke-width="2" fill="none" stroke-linecap="round"/>
    `),
    turner: S(`
      <path d="M4.4 12.6 9.6 7.4a2 2 0 0 1 2.8 0l3.4 3.4a2 2 0 0 1 0 2.8l-5.2 5.2z" fill="#c2c9cd"/>
      <path d="M6.8 12.4 9 10.2M9 14.6l2.2-2.2M11.2 16.8l2.2-2.2" stroke="#8c9aa4" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <rect x="14.6" y="3.4" width="5.6" height="2.4" rx="1.2" fill="#3f4f5a" transform="rotate(45 17.4 4.6)"/>
    `),
    whisk: S(`
      <rect x="10.8" y="2.6" width="2.4" height="6.4" rx="1.2" fill="#3f4f5a"/>
      <path d="M12 9c-3 0-5 3-5 6.4 0 2.6 2 4.6 5 4.6s5-2 5-4.6C17 12 15 9 12 9z" fill="none" stroke="#c2c9cd" stroke-width="1.4"/>
      <path d="M12 9v11M9.4 9.8c-1.2 3-1.2 7 0 9.4M14.6 9.8c1.2 3 1.2 7 0 9.4" stroke="#8c9aa4" stroke-width="1.2" fill="none"/>
    `),
    tongs: S(`
      <path d="M9 3.4c-2.6 4-3.4 9-2.4 14.4l-2.8 1.4" stroke="#c2c9cd" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M15 3.4c2.6 4 3.4 9 2.4 14.4l2.8 1.4" stroke="#8c9aa4" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <rect x="9.4" y="2.6" width="5.2" height="2.2" rx="1.1" fill="#3f4f5a"/>
    `),
    grater: S(`
      <path d="M8 3.4h8l3.4 15.4a1.8 1.8 0 0 1-1.8 2.2H6.4a1.8 1.8 0 0 1-1.8-2.2z" fill="#c2c9cd"/>
      <path d="M9 8.4h6M8.6 11.4h6.8M8.2 14.4h7.6M7.8 17.4h8.4" stroke="#8c9aa4" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <rect x="8.6" y="2.4" width="6.8" height="2" rx="1" fill="#5a6f7a"/>
    `),
    rollingPin: S(`
      <rect x="5.4" y="9.6" width="13.2" height="4.8" rx="2.4" fill="#e0c49a"/>
      <rect x="2.4" y="11.2" width="3.6" height="1.6" rx=".8" fill="#c9a06a"/>
      <rect x="18" y="11.2" width="3.6" height="1.6" rx=".8" fill="#c9a06a"/>
    `),
    kitchenScissors: S(`
      <path d="M8.6 13 4.4 4.6l2.2-1 4.6 9.2z" fill="#c2c9cd"/>
      <path d="M15.4 13 19.6 4.6l-2.2-1-4.6 9.2z" fill="#8c9aa4"/>
      <path d="M12 12.4 8 20.4" stroke="#3f9440" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M12 12.4 16 20.4" stroke="#5cb85c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="12.4" r="1.4" fill="#5a6f7a"/>
    `),
    canOpener: S(`
      <path d="M4.6 6.4h10.8a2 2 0 0 1 2 2v1.8H4.6z" fill="#c2402e"/>
      <path d="M4.6 10.2h12.8v2.2a2 2 0 0 1-2 2H4.6z" fill="#e0603f"/>
      <circle cx="17.6" cy="12.6" r="3" fill="#c2c9cd"/>
      <circle cx="17.6" cy="12.6" r="1.1" fill="#5a6f7a"/>
      <path d="M4.6 14.4h3v6.2h-3z" fill="#8c9aa4"/>
    `),
    bottleOpener: S(`
      <path d="M6.6 3.4h10.8a2.4 2.4 0 0 1 2.4 2.4v3.4a2.4 2.4 0 0 1-2.4 2.4H6.6A2.4 2.4 0 0 1 4.2 9.2V5.8a2.4 2.4 0 0 1 2.4-2.4z" fill="#8c9aa4"/>
      <circle cx="8.8" cy="7.4" r="2.4" fill="#f7fafc"/>
      <path d="M10 11.6h4l-1 8.4a1 1 0 0 1-2 0z" fill="#5a6f7a"/>
    `),
    corkscrew: S(`
      <rect x="4.4" y="4.4" width="15.2" height="3" rx="1.5" fill="#8c5a2b"/>
      <rect x="10.8" y="7.4" width="2.4" height="3.4" fill="#8c9aa4"/>
      <path d="M12 10.8c2 .8 2 2.2 0 3s-2 2.2 0 3 2 2.2 0 3.4" stroke="#c2c9cd" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `),
    measuringSpoon: S(`
      <ellipse cx="7.4" cy="7.6" rx="4.4" ry="3.4" fill="#c2c9cd"/>
      <ellipse cx="7.4" cy="7.6" rx="2.8" ry="2" fill="#8c9aa4"/>
      <path d="M10.6 9.6 19 17.4" stroke="#8c9aa4" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="19.6" cy="18.2" r="2" fill="none" stroke="#8c9aa4" stroke-width="1.4"/>
    `),
    kitchenScale: S(`
      <path d="M3.4 12.4h17.2v5.4a2.2 2.2 0 0 1-2.2 2.2H5.6a2.2 2.2 0 0 1-2.2-2.2z" fill="#c2c9cd"/>
      <rect x="4.6" y="6.4" width="14.8" height="6" rx="1.6" fill="#f2f6f8"/>
      <rect x="4.6" y="6.4" width="14.8" height="6" rx="1.6" fill="none" stroke="#8c9aa4" stroke-width="1.2"/>
      <rect x="7.4" y="14.4" width="9.2" height="3" rx="1" fill="#3f4f5a"/>
      <path d="M8.6 9.4h6.8" stroke="#5a6f7a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    `),
    kitchenTimer: S(`
      <circle cx="12" cy="13.4" r="8" fill="#e0603f"/>
      <circle cx="12" cy="13.4" r="5.6" fill="#f7fafc"/>
      <path d="M12 9.6v3.8l2.6 1.8" stroke="#3f4f5a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <rect x="10.4" y="2.6" width="3.2" height="3.4" rx="1.4" fill="#8c9aa4"/>
    `),
    thermos: S(`
      <path d="M7 7.4h10v11.4a2.6 2.6 0 0 1-2.6 2.6H9.6A2.6 2.6 0 0 1 7 18.8z" fill="#5aa8c4"/>
      <rect x="7.8" y="4.4" width="8.4" height="3.2" rx="1.2" fill="#3f8fb0"/>
      <rect x="9.6" y="2.4" width="4.8" height="2.2" rx="1" fill="#5a6f7a"/>
      <rect x="8.4" y="11.4" width="7.2" height="3.4" rx="1" fill="#ffffff" opacity=".55"/>
    `),
    tumbler: S(`
      <path d="M7.4 5.4h9.2l-1.2 14a2.4 2.4 0 0 1-2.4 2.2h-2a2.4 2.4 0 0 1-2.4-2.2z" fill="#a8b8c2"/>
      <rect x="6.8" y="3.2" width="10.4" height="2.4" rx="1.2" fill="#5a6f7a"/>
      <path d="M9.2 9h5.6l-.4 5.4H9.6z" fill="#ffffff" opacity=".5"/>
    `),
    mug: S(`
      <path d="M4.6 7.4h11.2v9.2a3.4 3.4 0 0 1-3.4 3.4H8A3.4 3.4 0 0 1 4.6 16.6z" fill="#f2f6f8"/>
      <path d="M4.6 7.4h11.2v2.6H4.6z" fill="#4a90d9"/>
      <path d="M16 10h1.8a3.2 3.2 0 0 1 0 6.4H16v-2.2h1.8a1 1 0 0 0 0-2H16z" fill="#f2f6f8"/>
      <circle cx="10.2" cy="14" r="2.2" fill="#dbeaf2"/>
    `),
    glassCup: S(`
      <path d="M7.2 4.4h9.6l-1.4 15a2.4 2.4 0 0 1-2.4 2.2h-2a2.4 2.4 0 0 1-2.4-2.2z" fill="#dbeaf2" opacity=".85"/>
      <path d="M8.4 11.6h7.2l-.8 8a1.6 1.6 0 0 1-1.6 1.4h-2.4a1.6 1.6 0 0 1-1.6-1.4z" fill="#8fd0e0" opacity=".8"/>
    `),
    /* A 急須 holds its handle out to the side, not over the top — that one
       difference is what tells it apart from every western pot. */
    teapot: S(`
      <path d="M6.4 10.6h11.2v4.2a5.6 5.6 0 0 1-11.2 0z" fill="#7f8f6a"/>
      <rect x="5.4" y="8.6" width="13.2" height="2.2" rx="1.1" fill="#5f6f4a"/>
      <path d="M6.2 11.4 2.4 9.4l.5 4.6z" fill="#5f6f4a"/>
      <rect x="17.4" y="11.6" width="4.2" height="2.2" rx="1.1" fill="#5f6f4a"/>
      <rect x="10.4" y="6" width="3.2" height="2.6" rx="1.2" fill="#5f6f4a"/>
    `),
    teacup: S(`
      <path d="M6.6 8h10.8l-1.4 8.4a4 4 0 0 1-4 3.4h-.1a4 4 0 0 1-3.9-3.4z" fill="#eef2f5"/>
      <path d="M6.6 8h10.8l-.3 1.8H6.9z" fill="#6f93b5"/>
      <path d="M8.4 12.4h7.2l-.3 2H8.7z" fill="#cbdde8"/>
      <path d="M7.6 20.6h8.8" stroke="#9dbccd" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    `),
    riceBowl: S(`
      <path d="M4 10.6h16c0 5-3.6 8.6-8 8.6s-8-3.6-8-8.6z" fill="#f2f6f8"/>
      <path d="M4 10.6h16v1.8H4z" fill="#4a7fb5"/>
      <path d="M8.6 20.4h6.8" stroke="#9dbccd" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M6.6 13.8c1 2.4 3 3.8 5.4 3.8" stroke="#dbeaf2" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    plateDish: S(`
      <circle cx="12" cy="12.6" r="9.2" fill="#f2f6f8"/>
      <circle cx="12" cy="12.6" r="6.2" fill="#e4ecf1"/>
      <circle cx="12" cy="12.6" r="9.2" fill="none" stroke="#cbdde8" stroke-width="1.2"/>
      <path d="M8.6 8.6a5.6 5.6 0 0 0-2 2.6" stroke="#ffffff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    donburi: S(`
      <path d="M3.2 9.6h17.6c0 5.6-4 9.6-8.8 9.6S3.2 15.2 3.2 9.6z" fill="#3f4f5a"/>
      <path d="M3.2 9.6h17.6v2H3.2z" fill="#c2402e"/>
      <path d="M6.6 13.4h10.8" stroke="#8c9aa4" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M8.6 20.6h6.8" stroke="#5a6f7a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `),
    lunchBox: S(`
      <path d="M3.4 9.4h17.2v8.4a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#5cb85c"/>
      <rect x="2.6" y="6.6" width="18.8" height="3" rx="1.4" fill="#3f9440"/>
      <rect x="6" y="12" width="5" height="4.6" rx=".8" fill="#f7fafc" opacity=".8"/>
      <rect x="13" y="12" width="5" height="4.6" rx=".8" fill="#f7fafc" opacity=".55"/>
    `),
    dishRack: S(`
      <rect x="2.8" y="17.4" width="18.4" height="2.6" rx="1.2" fill="#8c9aa4"/>
      <path d="M5.4 17.4V8.6M9 17.4V8.6M12.6 17.4V8.6M16.2 17.4V8.6M19.8 17.4V8.6" stroke="#c2c9cd" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="7.2" cy="10" rx="3.4" ry="4.2" fill="#dbeaf2" opacity=".8"/>
      <ellipse cx="14.4" cy="10" rx="3.4" ry="4.2" fill="#eef4f7" opacity=".9"/>
    `),
    storageJar: S(`
      <path d="M6.4 8.4h11.2v9.4a3.4 3.4 0 0 1-3.4 3.4H9.8a3.4 3.4 0 0 1-3.4-3.4z" fill="#dbeaf2" opacity=".9"/>
      <rect x="5.6" y="5.4" width="12.8" height="3" rx="1.2" fill="#c9a06a"/>
      <rect x="8" y="11.4" width="8" height="4" rx=".8" fill="#ffffff" opacity=".7"/>
    `),
    iceTray: S(`
      <rect x="2.8" y="6.8" width="18.4" height="10.4" rx="2" fill="#8fd0e0"/>
      <rect x="4.6" y="8.6" width="4.6" height="3" rx=".8" fill="#f2f6f8"/>
      <rect x="9.8" y="8.6" width="4.6" height="3" rx=".8" fill="#f2f6f8"/>
      <rect x="15" y="8.6" width="4.6" height="3" rx=".8" fill="#f2f6f8"/>
      <rect x="4.6" y="12.4" width="4.6" height="3" rx=".8" fill="#dbeaf2"/>
      <rect x="9.8" y="12.4" width="4.6" height="3" rx=".8" fill="#dbeaf2"/>
      <rect x="15" y="12.4" width="4.6" height="3" rx=".8" fill="#dbeaf2"/>
    `),
    ricePaddle: S(`
      <path d="M12 2.6c3.2 0 5.4 2.6 5.4 6s-2.2 6.4-5.4 6.4-5.4-3-5.4-6.4 2.2-6 5.4-6z" fill="#f2f6f8"/>
      <path d="M10.6 14.6h2.8v5.4a1.4 1.4 0 0 1-2.8 0z" fill="#c2c9cd"/>
      <circle cx="10" cy="7.6" r=".9" fill="#dbeaf2"/>
      <circle cx="13.6" cy="9.4" r=".9" fill="#dbeaf2"/>
    `),
    ovenMitt: S(`
      <path d="M6.4 6.4c0-2.2 2-3.8 5.2-3.8s5.6 1.8 5.6 4.6c0 1.8-.8 3.2-2.4 4.4h1.8v4.6a2.6 2.6 0 0 1-2.6 2.6H9.4a2.6 2.6 0 0 1-2.6-2.6v-4.6h1.6C7 10.4 6.4 8.6 6.4 6.4z" fill="#c2523f"/>
      <path d="M6.8 17.4h10.4v2.2a2 2 0 0 1-2 2H8.8a2 2 0 0 1-2-2z" fill="#e0603f"/>
      <path d="M8.6 12h6.8" stroke="#a03f30" stroke-width="1.2" fill="none"/>
    `),

    /* ================= カトラリー ================= */
    spoon: S(`
      <ellipse cx="12" cy="7" rx="4" ry="4.6" fill="#c2c9cd"/>
      <ellipse cx="12" cy="6.8" rx="2.4" ry="3" fill="#a8b8c2"/>
      <path d="M10.8 11.4h2.4v9a1.2 1.2 0 0 1-2.4 0z" fill="#c2c9cd"/>
    `),
    fork: S(`
      <path d="M8 2.6v5.2M12 2.6v5.2M16 2.6v5.2" stroke="#a8b8c2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M6.6 7.4h10.8c0 2.6-1.6 4.4-4.2 4.8v8a1.2 1.2 0 0 1-2.4 0v-8c-2.6-.4-4.2-2.2-4.2-4.8z" fill="#c2c9cd"/>
    `),
    tableKnife: S(`
      <path d="M9.4 2.6c2.8 0 4.6 2.4 4.6 6.4 0 2.6-.8 4.6-2.4 5.6v6a1.2 1.2 0 0 1-2.4 0V2.6z" fill="#c2c9cd"/>
      <path d="M9.4 4.6c1.6.6 2.4 2.4 2.4 4.4" stroke="#a8b8c2" stroke-width="1.2" fill="none"/>
    `),
    /* Bowl deep, handle flat and straight out of its side. Angled away like a
       western spoon it came out looking like a magnifying glass. */
    renge: S(`
      <path d="M2.8 12.6c0-3.2 2.9-5.6 6.5-5.6s6.3 2.2 6.3 5c0 2.9-2.2 4.9-5.5 4.9H6a3.2 3.2 0 0 1-3.2-3.2z" fill="#eef4f7"/>
      <path d="M4.4 12.6h10.8c0 1.8-1.4 2.9-3.6 2.9H6.8a2.4 2.4 0 0 1-2.4-2.4z" fill="#a9c4d8"/>
      <path d="M15.4 8.6h5.4a1.3 1.3 0 0 1 0 2.6h-5.4z" fill="#cbdde8"/>
    `),
    chopstickPair: S(`
      <path d="M6.6 21.4 9.4 3.2l2.2.4-1.4 18z" fill="#8c5a2b"/>
      <path d="M13.4 21.4 12 3.6l2.2-.4L17 21.4z" fill="#a8712f"/>
      <path d="M9 5.6h1.9M13 5.6h1.9" stroke="#f0c832" stroke-width="1.1" fill="none"/>
    `),

    /* ================= 家電 =================

       Appliances are boxes, which is exactly the problem: a fridge, a washing
       machine and a microwave are all a rectangle with a door. What separates
       them is where the door and its window sit, so each keeps that and drops
       everything else. */
    microwave: S(`
      <rect x="2.6" y="6.4" width="18.8" height="11.2" rx="1.8" fill="#8c9aa4"/>
      <rect x="4.4" y="8.2" width="10.4" height="7.6" rx="1" fill="#3f4f5a"/>
      <rect x="5.6" y="9.4" width="8" height="5.2" rx=".6" fill="#5a6f7a"/>
      <rect x="16.2" y="8.2" width="3.4" height="2.6" rx=".6" fill="#c9e0d0"/>
      <circle cx="17.9" cy="14" r="1.5" fill="#c2c9cd"/>
    `),
    ovenToaster: S(`
      <rect x="2.6" y="7.4" width="18.8" height="10.4" rx="1.8" fill="#c2c9cd"/>
      <rect x="4.4" y="9.2" width="11.6" height="6.8" rx="1" fill="#3f4f5a"/>
      <path d="M5.6 13.4h9.2" stroke="#e0603f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M5.6 11.2h9.2" stroke="#e0603f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="18.6" cy="11" r="1.6" fill="#8c9aa4"/>
      <circle cx="18.6" cy="15.2" r="1.6" fill="#8c9aa4"/>
      <path d="M4.6 17.8h2v2.2h-2zM17.4 17.8h2v2.2h-2z" fill="#8c9aa4"/>
    `),
    fridge: S(`
      <rect x="5.4" y="2.6" width="13.2" height="18.8" rx="2" fill="#e4ecf1"/>
      <path d="M5.4 9.4h13.2v10a2 2 0 0 1-2 2H7.4a2 2 0 0 1-2-2z" fill="#f2f6f8"/>
      <rect x="5.4" y="8.8" width="13.2" height="1.2" fill="#c2c9cd"/>
      <rect x="15.4" y="5.4" width="1.6" height="2.6" rx=".8" fill="#8c9aa4"/>
      <rect x="15.4" y="11.4" width="1.6" height="4" rx=".8" fill="#8c9aa4"/>
    `),
    washingMachine: S(`
      <rect x="3.4" y="2.8" width="17.2" height="18.4" rx="2" fill="#e4ecf1"/>
      <rect x="3.4" y="2.8" width="17.2" height="4.2" rx="2" fill="#c2c9cd"/>
      <circle cx="12" cy="14.4" r="5.6" fill="#8c9aa4"/>
      <circle cx="12" cy="14.4" r="4" fill="#8fd0e0"/>
      <circle cx="17.6" cy="4.8" r="1.2" fill="#5a6f7a"/>
      <rect x="5.4" y="4" width="5.4" height="1.8" rx=".9" fill="#8c9aa4"/>
    `),
    /* Same box as the washer, so the drum has to say which one it is: warm
       instead of water, with the heat coming off the top. */
    clothesDryer: S(`
      <rect x="3.4" y="4.6" width="17.2" height="16.6" rx="2" fill="#e4ecf1"/>
      <rect x="3.4" y="4.6" width="17.2" height="3.8" rx="2" fill="#c2c9cd"/>
      <circle cx="12" cy="15" r="5.4" fill="#8c9aa4"/>
      <circle cx="12" cy="15" r="3.8" fill="#f7d8a0"/>
      <path d="M10.4 16.8c1.6-1 1.6-2.6 0-3.6M13.6 16.8c1.6-1 1.6-2.6 0-3.6" stroke="#e0a83a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M8 2.6c-1 1-1 1.8 0 2.8M13 2.6c-1 1-1 1.8 0 2.8" stroke="#c2c9cd" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <rect x="15.2" y="5.6" width="3.8" height="1.6" rx=".8" fill="#8c9aa4"/>
    `),
    hairDryer: S(`
      <path d="M3.4 8.4h9.2v7.2H3.4a3.6 3.6 0 0 1 0-7.2z" fill="#e0603f"/>
      <path d="M12.6 6.6h4a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-4z" fill="#c2402e"/>
      <path d="M9.4 15.6h3.2l1.4 5.4a1.2 1.2 0 0 1-1.2 1.4h-2.4a1.2 1.2 0 0 1-1.2-1.4z" fill="#c2402e"/>
      <rect x="18.6" y="9.4" width="2.4" height="5.2" rx="1.2" fill="#8c9aa4"/>
    `),
    iron: S(`
      <path d="M3.4 16.4c0-4.2 4-7.4 9.4-7.4h5.6a2.6 2.6 0 0 1 2.6 2.6v4.8z" fill="#c2c9cd"/>
      <path d="M3.4 16.4h17.6v2.2a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" fill="#8c9aa4"/>
      <path d="M8.4 8.8c0-2.4 1.6-4 4.4-4h5.6" stroke="#5a6f7a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `),
    electricFan: S(`
      <circle cx="12" cy="9.4" r="6.8" fill="none" stroke="#8c9aa4" stroke-width="1.4"/>
      <path d="M12 9.4c0-3 1-4.6 3-4.6s3 1.4 3 3-1.6 2.6-3.4 2.6zM12 9.4c-2.4 1.8-4.2 1.8-5.4.2s-.8-3.2.6-4 3 .4 3.8 2z" fill="#5aa8c4"/>
      <path d="M12 9.4c1 2.8.6 4.6-1.2 5.4s-3.2-.2-3.6-1.8 1-2.8 2.8-3.2z" fill="#3f8fb0"/>
      <circle cx="12" cy="9.4" r="1.6" fill="#5a6f7a"/>
      <rect x="11" y="16" width="2" height="3.4" fill="#8c9aa4"/>
      <rect x="7.4" y="19.2" width="9.2" height="2.2" rx="1.1" fill="#5a6f7a"/>
    `),
    heater: S(`
      <rect x="3.4" y="6.4" width="17.2" height="12.4" rx="2" fill="#5a6f7a"/>
      <rect x="5.4" y="8.4" width="13.2" height="6.4" rx="1" fill="#3f4f5a"/>
      <path d="M6.8 9.8h10.4M6.8 11.6h10.4M6.8 13.4h10.4" stroke="#e0603f" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="7" cy="16.8" r="1.1" fill="#f0c832"/>
      <path d="M5.4 19h2.4v2.2H5.4zM16.2 19h2.4v2.2h-2.4z" fill="#8c9aa4"/>
    `),
    airConditioner: S(`
      <rect x="2.6" y="5.4" width="18.8" height="7.4" rx="2.2" fill="#f2f6f8"/>
      <rect x="2.6" y="5.4" width="18.8" height="7.4" rx="2.2" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <rect x="4.4" y="10" width="15.2" height="2" rx="1" fill="#9dbccd"/>
      <path d="M8 15.4c0 1.6-1.6 2-1.6 3.6M12 15.4c0 1.6-1.6 2-1.6 3.6M16 15.4c0 1.6-1.6 2-1.6 3.6" stroke="#8fd0e0" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    `),
    humidifier: S(`
      <path d="M6.4 10.4h11.2v8.4a2.6 2.6 0 0 1-2.6 2.6H9a2.6 2.6 0 0 1-2.6-2.6z" fill="#dbeaf2"/>
      <rect x="7.6" y="7.6" width="8.8" height="3" rx="1.2" fill="#8c9aa4"/>
      <path d="M10.4 6.6c-1.2-1.4-1-2.6.4-3.8-.4 1.6.2 2.4 1.4 3M14 6.6c-1-1.2-.8-2.2.4-3.2-.4 1.4.2 2 1.2 2.6" fill="none" stroke="#8fd0e0" stroke-width="1.3" stroke-linecap="round"/>
      <rect x="8.6" y="13" width="6.8" height="4" rx="1" fill="#ffffff" opacity=".7"/>
    `),
    airPurifier: S(`
      <rect x="5.4" y="2.8" width="13.2" height="18.4" rx="2.4" fill="#e4ecf1"/>
      <rect x="7.2" y="5" width="9.6" height="6.4" rx="1" fill="#8fd0e0" opacity=".7"/>
      <path d="M7.2 14h9.6M7.2 16.2h9.6M7.2 18.4h9.6" stroke="#c2c9cd" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="8.2" r="2" fill="#5aa8c4"/>
    `),
    tv: S(`
      <rect x="2.6" y="4.4" width="18.8" height="12.4" rx="1.8" fill="#3f4f5a"/>
      <rect x="4.2" y="6" width="15.6" height="9.2" rx="1" fill="#5aa8c4"/>
      <path d="M4.2 15.2 9 9.6l3.2 3.6 2.6-2.2 5 4.2z" fill="#3f8fb0"/>
      <rect x="10.8" y="16.8" width="2.4" height="2.6" fill="#8c9aa4"/>
      <rect x="7" y="19.2" width="10" height="2" rx="1" fill="#5a6f7a"/>
    `),
    speaker: S(`
      <rect x="6.4" y="2.8" width="11.2" height="18.4" rx="2.2" fill="#5a6f7a"/>
      <circle cx="12" cy="15" r="3.8" fill="#3f4f5a"/>
      <circle cx="12" cy="15" r="1.6" fill="#8c9aa4"/>
      <circle cx="12" cy="7" r="2.2" fill="#3f4f5a"/>
    `),
    headphones: S(`
      <path d="M4.6 15.4V13a7.4 7.4 0 0 1 14.8 0v2.4" stroke="#3f4f5a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <rect x="2.8" y="13.6" width="4.4" height="7.4" rx="2.2" fill="#5a6f7a"/>
      <rect x="16.8" y="13.6" width="4.4" height="7.4" rx="2.2" fill="#5a6f7a"/>
    `),
    laptop: S(`
      <rect x="4.4" y="4.4" width="15.2" height="10.4" rx="1.4" fill="#5a6f7a"/>
      <rect x="5.8" y="5.8" width="12.4" height="7.6" rx=".8" fill="#8fd0e0"/>
      <path d="M2.6 15.4h18.8l-1 3a1.6 1.6 0 0 1-1.5 1H5.1a1.6 1.6 0 0 1-1.5-1z" fill="#c2c9cd"/>
      <rect x="9.6" y="16.4" width="4.8" height="1.2" rx=".6" fill="#8c9aa4"/>
    `),
    tablet: S(`
      <rect x="5.4" y="2.6" width="13.2" height="18.8" rx="2" fill="#3f4f5a"/>
      <rect x="6.8" y="4.6" width="10.4" height="14" rx="1" fill="#dbeaf2"/>
      <circle cx="12" cy="19.9" r=".9" fill="#8c9aa4"/>
    `),
    smartphone: S(`
      <rect x="7.4" y="2.4" width="9.2" height="19.2" rx="2" fill="#3f4f5a"/>
      <rect x="8.6" y="4.8" width="6.8" height="13.6" rx=".8" fill="#8fd0e0"/>
      <rect x="10.6" y="3.2" width="2.8" height=".9" rx=".45" fill="#8c9aa4"/>
      <circle cx="12" cy="19.9" r=".9" fill="#8c9aa4"/>
    `),
    printer: S(`
      <rect x="6.4" y="3.4" width="11.2" height="4.6" rx=".8" fill="#f2f6f8"/>
      <rect x="6.4" y="3.4" width="11.2" height="4.6" rx=".8" fill="none" stroke="#c2c9cd" stroke-width="1"/>
      <rect x="3.4" y="8" width="17.2" height="7.6" rx="1.8" fill="#8c9aa4"/>
      <rect x="6.4" y="15.4" width="11.2" height="5.2" rx=".8" fill="#f2f6f8"/>
      <rect x="6.4" y="15.4" width="11.2" height="5.2" rx=".8" fill="none" stroke="#c2c9cd" stroke-width="1"/>
      <circle cx="17.6" cy="10.4" r="1.1" fill="#5cb85c"/>
    `),
    router: S(`
      <path d="M3.4 15.4h17.2v3.4a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8z" fill="#3f4f5a"/>
      <circle cx="7" cy="17.4" r="1.1" fill="#5cb85c"/>
      <circle cx="10.4" cy="17.4" r="1.1" fill="#5cb85c"/>
      <path d="M8.6 11.4a5 5 0 0 1 6.8 0M6 8.4a9.2 9.2 0 0 1 12 0" stroke="#4a90d9" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="13.6" r="1.4" fill="#4a90d9"/>
    `),
    mouse: S(`
      <path d="M12 2.8c4 0 6.6 3 6.6 7.4v4.2c0 4.4-2.6 7.4-6.6 7.4s-6.6-3-6.6-7.4V10.2C5.4 5.8 8 2.8 12 2.8z" fill="#e4ecf1"/>
      <path d="M12 2.8c4 0 6.6 3 6.6 7.4H12z" fill="#c2c9cd"/>
      <rect x="11.2" y="5.4" width="1.6" height="3.6" rx=".8" fill="#8c9aa4"/>
    `),
    keyboardDevice: S(`
      <rect x="2.6" y="7.4" width="18.8" height="9.4" rx="1.8" fill="#5a6f7a"/>
      <rect x="4.6" y="9.4" width="2.2" height="2" rx=".5" fill="#c2c9cd"/>
      <rect x="7.8" y="9.4" width="2.2" height="2" rx=".5" fill="#c2c9cd"/>
      <rect x="11" y="9.4" width="2.2" height="2" rx=".5" fill="#c2c9cd"/>
      <rect x="14.2" y="9.4" width="2.2" height="2" rx=".5" fill="#c2c9cd"/>
      <rect x="17.4" y="9.4" width="2.2" height="2" rx=".5" fill="#c2c9cd"/>
      <rect x="4.6" y="12.6" width="14.8" height="2.2" rx=".8" fill="#c2c9cd"/>
    `),
    camera: S(`
      <path d="M8.6 5.4h6.8l1.2 2h3a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8V9.2a1.8 1.8 0 0 1 1.8-1.8h3z" fill="#5a6f7a"/>
      <circle cx="12" cy="13.4" r="4.2" fill="#3f4f5a"/>
      <circle cx="12" cy="13.4" r="2.4" fill="#8fd0e0"/>
      <circle cx="18.2" cy="10" r="1" fill="#f0c832"/>
    `),
    blender: S(`
      <path d="M7.4 3.4h9.2l-1 9.6H8.4z" fill="#dbeaf2" opacity=".9"/>
      <path d="M8.4 13h7.2v2.4H8.4z" fill="#8c9aa4"/>
      <path d="M6.6 15.4h10.8v3.4a2.6 2.6 0 0 1-2.6 2.6H9.2a2.6 2.6 0 0 1-2.6-2.6z" fill="#5a6f7a"/>
      <circle cx="15.4" cy="18.2" r="1.2" fill="#e0603f"/>
      <path d="M8.4 5.4h7l-.3 3h-6.4z" fill="#8fd0e0" opacity=".7"/>
    `),
    coffeeMaker: S(`
      <path d="M4.4 2.8h11.2a2 2 0 0 1 2 2v6.4H4.4z" fill="#5a6f7a"/>
      <path d="M4.4 11.2h13.2v7.4a2.6 2.6 0 0 1-2.6 2.6H7a2.6 2.6 0 0 1-2.6-2.6z" fill="#3f4f5a"/>
      <path d="M7 13.4h8.4v4.2a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 17.6z" fill="#8c5a2b"/>
      <rect x="18.4" y="5.4" width="2.6" height="4.4" rx="1" fill="#8c9aa4"/>
      <circle cx="15.2" cy="5.6" r="1.1" fill="#e0603f"/>
    `),
    electricKettle: S(`
      <path d="M6.4 8.4h11.2v8.2a3.4 3.4 0 0 1-3.4 3.4H9.8a3.4 3.4 0 0 1-3.4-3.4z" fill="#e4ecf1"/>
      <rect x="5.6" y="6.2" width="12.8" height="2.4" rx="1.2" fill="#8c9aa4"/>
      <path d="M17.8 10h1.6a2.6 2.6 0 0 1 0 5.2h-1.6v-2h1.6a.6.6 0 0 0 0-1.2h-1.6z" fill="#c2c9cd"/>
      <rect x="4.4" y="19.8" width="15.2" height="2" rx="1" fill="#5a6f7a"/>
      <rect x="10.4" y="4" width="3.2" height="2.4" rx="1" fill="#5a6f7a"/>
    `),
    hotplate: S(`
      <path d="M2.6 12.4h18.8v3.4a2 2 0 0 1-2 2H4.6a2 2 0 0 1-2-2z" fill="#3f4f5a"/>
      <rect x="4.4" y="7.4" width="15.2" height="5.2" rx="1.4" fill="#5a6f7a"/>
      <path d="M6.4 9.4h11.2" stroke="#e0603f" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="18.4" cy="15" r="1.2" fill="#f0c832"/>
      <path d="M5.4 18.4h2.4v2.2H5.4zM16.2 18.4h2.4v2.2h-2.4z" fill="#8c9aa4"/>
    `),
    powerStrip: S(`
      <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="2" fill="#f2f6f8"/>
      <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="2" fill="none" stroke="#c2c9cd" stroke-width="1.1"/>
      <rect x="5.4" y="10.4" width="3.6" height="3.2" rx=".8" fill="#8c9aa4"/>
      <rect x="10.2" y="10.4" width="3.6" height="3.2" rx=".8" fill="#8c9aa4"/>
      <rect x="15" y="10.4" width="3.6" height="3.2" rx=".8" fill="#8c9aa4"/>
      <path d="M6.4 11.2v1.6M7.9 11.2v1.6M11.2 11.2v1.6M12.7 11.2v1.6M16 11.2v1.6M17.5 11.2v1.6" stroke="#f2f6f8" stroke-width="1" fill="none"/>
    `),
    powerBank: S(`
      <rect x="6.4" y="3.4" width="11.2" height="17.2" rx="2" fill="#5a6f7a"/>
      <rect x="8.2" y="6" width="7.6" height="8.4" rx="1" fill="#3f4f5a"/>
      <path d="M12.6 7.2 10 11h1.8l-.6 2.8L14 10h-1.8z" fill="#f0c832"/>
      <rect x="8.6" y="16.4" width="6.8" height="1.8" rx=".9" fill="#5cb85c"/>
    `),
    remote: S(`
      <rect x="7.4" y="2.6" width="9.2" height="18.8" rx="2.4" fill="#3f4f5a"/>
      <rect x="8.8" y="4.4" width="6.4" height="3.4" rx=".8" fill="#8c9aa4"/>
      <circle cx="10" cy="10.6" r="1.1" fill="#e0603f"/>
      <circle cx="14" cy="10.6" r="1.1" fill="#c2c9cd"/>
      <circle cx="10" cy="14" r="1.1" fill="#c2c9cd"/>
      <circle cx="14" cy="14" r="1.1" fill="#c2c9cd"/>
      <circle cx="10" cy="17.4" r="1.1" fill="#c2c9cd"/>
      <circle cx="14" cy="17.4" r="1.1" fill="#c2c9cd"/>
    `),
    shaver: S(`
      <rect x="8.4" y="8.4" width="7.2" height="12.6" rx="2.2" fill="#3f4f5a"/>
      <rect x="8.4" y="4.4" width="7.2" height="4.4" rx="1.2" fill="#8c9aa4"/>
      <circle cx="10.4" cy="6.4" r="1.6" fill="#c2c9cd"/>
      <circle cx="13.8" cy="6.4" r="1.6" fill="#c2c9cd"/>
      <rect x="10.2" y="11.4" width="3.6" height="1.6" rx=".8" fill="#5cb85c"/>
    `),
    electricToothbrush: S(`
      <rect x="9.4" y="7.4" width="5.2" height="13.6" rx="2.2" fill="#4a90d9"/>
      <rect x="10.4" y="3.4" width="3.2" height="4.2" rx="1.2" fill="#c2c9cd"/>
      <path d="M9.6 2.4h4.8v2H9.6z" fill="#f2f6f8"/>
      <path d="M10.6 2.6v1.6M12 2.6v1.6M13.4 2.6v1.6" stroke="#9dbccd" stroke-width="1" fill="none"/>
      <rect x="10.6" y="10.4" width="2.8" height="1.6" rx=".8" fill="#f2f6f8"/>
    `),
    /* A cupboard with the plates standing up inside it: the rack is the whole
       point, and it is what a washing machine's drum never looks like. */
    dishwasher: S(`
      <rect x="3.4" y="2.8" width="17.2" height="18.4" rx="2" fill="#c2c9cd"/>
      <rect x="3.4" y="2.8" width="17.2" height="3.6" rx="2" fill="#8c9aa4"/>
      <rect x="5.4" y="8" width="13.2" height="11.2" rx="1.2" fill="#e4ecf1"/>
      <ellipse cx="8.8" cy="12.8" rx="2" ry="3.2" fill="#f7fafc"/>
      <ellipse cx="12.2" cy="12.8" rx="2" ry="3.2" fill="#dbeaf2"/>
      <ellipse cx="15.6" cy="12.8" rx="1.8" ry="2.8" fill="#f7fafc"/>
      <rect x="6.4" y="16.8" width="11.2" height="1.4" rx=".7" fill="#8c9aa4"/>
      <circle cx="17.4" cy="4.6" r="1" fill="#5cb85c"/>
    `),
    usbCable: S(`
      <rect x="3.4" y="8.4" width="5.6" height="4.4" rx="1" fill="#8c9aa4"/>
      <rect x="2.4" y="9.6" width="1.4" height="2" fill="#c2c9cd"/>
      <path d="M9 10.6h3.4c3.4 0 5 1.8 5 4.4v3.4" stroke="#5a6f7a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <rect x="15.4" y="17.6" width="4.4" height="3.6" rx="1" fill="#8c9aa4"/>
      <rect x="16.6" y="16.4" width="2" height="1.4" fill="#c2c9cd"/>
    `),

    /* ================= その他 ================= */
    package: box("#d3a86e", "#b5793f",
      `<path d="M11 9.6h2v10.4h-2z" fill="#b5793f" opacity=".5"/>`),
  };

  /* ---------------- 描き直したものを重ねる ----------------

     icons-v2.js に同じキーがあれば、そちらの絵が勝ちます。差し替えは
     ICONS[key] の中身だけで、キーもキーワードも API も動きません——
     だから利用者が手で選んだ絵（localStorage に入っているのはキーの名前）も、
     絵の対応を見ている試験も、そのまま通ります。

     絵柄を全部入れ替えるあいだ、ここが旧版と新版の継ぎ目になります。
     入れ替えが終わったら、この行と旧い ICONS の中身をまとめて片付けます。 */
  Object.assign(ICONS, KN.iconsV2 || {});

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
    ["handSoap",   ["はんどそーぷ"]],
    ["soapBar",    ["石鹸", "石けん", "せっけん", "そーぷ"]],
    ["toothpaste", ["歯磨き粉", "歯みがき粉", "はみがき粉", "歯磨き", "はみがき"]],
    ["toothbrush", ["歯ぶらし", "はぶらし", "歯ブラシ"]],
    ["faceWash",   ["洗顔", "せんがん"]],
    ["sunscreen",  ["日焼け止め", "ひやけどめ", "日やけ止め"]],
    ["toiletRoll",  ["といれっとぺーぱー", "といれぺーぱー", "といれ紙"]],
    ["tissue",      ["てぃっしゅ", "はなかみ", "鼻紙"]],
    ["kitchenRoll", ["きっちんぺーぱー", "きっちんたおる", "ぺーぱーたおる"]],
    ["wrap",     ["らっぷ", "くっきんぐしーと", "くっきんぐぺーぱー"]],
    ["foil",     ["あるみほいる", "ほいる", "あるみはく"]],
    ["sponge",   ["すぽんじ"]],
    ["trashBag", ["ごみ袋", "ごみぶくろ", "ぽりぶくろ", "ぽり袋"]],
    ["broom",    ["掃除", "そうじ", "ほうき"]],
    ["mask",        ["ますく", "不織布"]],
    ["toner",       ["化粧水", "けしょうすい", "ろーしょん", "化粧"]],
    ["milkyLotion", ["乳液", "にゅうえき", "くりーむ"]],
    ["diaper",   ["おむつ", "生理用品", "なぷきん"]],
    ["battery",  ["電池", "でんち", "乾電池"]],
    /* 「らいと」は電球のものではなくなった。「ライトツナ缶」が電球になって
       いたし、いまは照明のたぐいが何種類もある。 */
    ["bulb",     ["電球", "でんきゅう", "led電球"]],
    ["socks",    ["靴下", "くつした"]],
    ["petFood",  ["どっぐふーど", "きゃっとふーど", "ぺっとふーど", "えさ"]],
    ["zipBag",     ["保存袋", "じっぷろっく", "ふりーざーばっぐ", "ちゃっく袋", "密閉袋", "じっぷばっぐ"]],
    ["razor",      ["かみそり", "剃刀", "髭剃り", "ひげそり", "しぇーびんぐ"]],
    ["cottonSwab", ["綿棒", "めんぼう"]],
    ["deodorant",  ["消臭剤", "しょうしゅう", "ふぁぶりーず"]],
    ["insect",     ["虫よけ", "虫除け", "殺虫剤", "蚊取り", "かとり", "防虫", "ごきぶり"]],
    ["stationery", ["文房具", "ぶんぼうぐ"]],

    /* くくりを指す言い方。品物の名前としては当たらないが、カテゴリの名前と
       しては当たる——これがあるので、名前の分からない品物もカテゴリの絵を
       借りられる。 */
    ["groceries", ["食材", "食料品", "食料", "食品", "生鮮"]],
    ["household", ["日用品", "雑貨", "消耗品"]],
    ["baby",      ["赤ちゃん", "べびー", "乳児", "育児"]],

    /* 薬・衛生 */
    ["medicine",    ["薬", "くすり"]],
    ["plaster",     ["絆創膏", "ばんそうこう"]],
    ["thermometer", ["体温計", "たいおんけい"]],

    /* 乳製品・卵 */
    ["milk",    ["牛乳", "ぎゅうにゅう", "みるく"]],
    ["soyMilk", ["豆乳", "とうにゅう"]],
    ["egg",     ["卵", "たまご", "玉子", "うずら"]],
    ["cheese",  ["ちーず"]],
    ["butter",  ["ばたー"]],
    ["cream",   ["生くりーむ", "ほいっぷ"]],
    ["yogurt",  ["よーぐると"]],
    ["iceCream",["あいす", "あいすくりーむ"]],
    ["pudding", ["ぷりん"]],

    /* 大豆製品・和のもの */
    ["natto",     ["納豆", "なっとう"]],
    ["tofu",      ["豆腐", "とうふ", "厚揚げ", "あつあげ", "油揚げ", "あぶらあげ", "がんもどき"]],
    ["nori",      ["海苔", "のり", "焼きのり", "味付けのり", "わかめ", "若布", "昆布", "こんぶ", "ひじき", "もずく", "とろろ昆布"]],
    ["konjac",    ["こんにゃく", "蒟蒻", "しらたき", "糸こん"]],
    ["fishCake",  ["はんぺん", "さつま揚げ", "練り物", "かにかま", "つみれ"]],
    ["pickles",   ["漬物", "つけもの", "きむち", "梅干", "うめぼし", "たくあん", "らっきょう", "しば漬け", "ぬか漬け"]],
    ["mochi",     ["餅", "もち", "切り餅", "白玉", "おしるこ"]],
    ["dashiPack", ["だし", "出汁", "煮干し", "にぼし", "ほんだし", "鶏がら"]],
    ["furikake",  ["ふりかけ", "お茶漬け", "おちゃづけ", "ゆかり", "のりたま"]],

    /* 野菜 */
    ["tomato",  ["とまと"]],
    ["cucumber",["きゅうり", "胡瓜"]],
    ["cabbage", ["きゃべつ", "きゃべつ"]],
    ["onion",   ["玉ねぎ", "たまねぎ", "玉葱"]],
    ["carrot",  ["にんじん", "人参", "きゃろっと"]],
    ["potato",  ["じゃがいも", "馬鈴薯", "ぽてと"]],
    ["sweetPotato", ["さつまいも", "薩摩芋", "焼き芋"]],
    ["mushroom",["きのこ", "しめじ", "えのき", "まいたけ", "舞茸", "しいたけ", "椎茸", "えりんぎ", "なめこ", "まっしゅるーむ"]],
    ["corn",    ["とうもろこし", "こーん"]],
    ["eggplant",["なす", "茄子"]],
    ["pepper",  ["ぴーまん", "ぱぷりか"]],
    ["broccoli",["ぶろっこりー"]],
    ["salad",   ["さらだ", "野菜"]],
    ["garlic",  ["にんにく", "がーりっく"]],
    ["avocado", ["あぼかど"]],
    ["beans",   ["大豆", "だいず", "豆", "いんげん"]],

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
    ["meat",     ["肉", "にく", "牛肉", "豚肉", "ぎゅうにく", "ぶたにく", "しゃぶしゃぶ", "焼肉", "牛", "豚"]],
    ["chicken",  ["鶏", "鶏肉", "とり肉", "とりにく", "もも肉", "むね肉", "手羽", "ちきん", "ささみ"]],
    ["bacon",    ["べーこん"]],
    ["sausage",  ["そーせーじ", "ういんなー", "ふらんく"]],
    ["ham",      ["はむ"]],
    ["fish",     ["魚", "さかな", "鮭", "しゃけ", "さば", "鯖", "鰺", "あじ", "ぶり", "鰤", "鱈", "たら", "ひらめ", "白身魚", "切り身", "ししゃも", "干物", "さんま", "秋刀魚"]],
    ["sushi",    ["刺身", "さしみ", "寿司", "すし", "まぐろ", "鮪", "ねぎとろ", "さーもん"]],
    ["shrimp",   ["えび", "海老"]],
    ["squid",    ["いか", "烏賊"]],
    ["octopus",  ["たこ", "蛸"]],
    ["shellfish",["あさり", "しじみ", "牡蠣", "貝"]],

    /* 主食 */
    ["rice",     ["米", "こめ", "ごはん", "ご飯", "らいす", "無洗米", "ぱっくご飯", "もち米", "玄米"]],
    ["bread",    ["ぱん", "食パン", "しょくぱん", "ぶれっど", "ろーるぱん"]],
    ["croissant",["くろわっさん", "でにっしゅ"]],
    ["noodles",  ["らーめん", "麺", "春雨", "はるさめ", "びーふん"]],
    ["pasta",    ["ぱすた", "すぱげってぃ", "まかろに"]],
    ["pot",      ["鍋", "しちゅー", "すーぷ"]],
    ["curry",    ["かれー", "はやしらいす"]],
    ["dumpling", ["餃子", "ぎょうざ", "しゅうまい", "焼売", "肉まん"]],
    ["bento",    ["弁当", "べんとう", "惣菜", "そうざい"]],
    ["frozen",   ["冷凍", "れいとう", "氷", "こおり", "冷蔵"]],

    /* 調味料・粉 */
    ["salt",        ["塩", "しお", "胡椒", "こしょう", "砂糖", "さとう", "調味料", "七味", "一味"]],
    ["sauceBottle", ["醤油", "しょうゆ", "そーす", "ぽん酢", "めんつゆ", "つゆ", "うすたーそーす", "おいすたーそーす", "焼肉のたれ"]],
    ["ketchup",     ["けちゃっぷ"]],
    ["mayo",        ["まよねーず", "どれっしんぐ"]],
    ["tin",         ["缶詰", "かんづめ", "とまと缶", "れとると", "缶"]],
    ["oil",         ["油", "あぶら", "さらだ油", "おりーぶおいる"]],
    ["flour",       ["小麦粉", "こむぎこ", "薄力粉", "強力粉", "片栗粉", "ぱん粉", "ほっとけーきみっくす", "粉"]],
    ["honey",       ["はちみつ", "蜂蜜", "じゃむ"]],
    ["miso",        ["味噌", "みそ"]],
    ["vinegar",     ["酢", "みりん", "味醂", "料理酒"]],

    /* 菓子 */
    ["chocolate",  ["ちょこ", "ちょこれーと"]],
    ["cookie",     ["くっきー", "びすけっと", "お菓子", "おかし", "菓子"]],
    ["riceCracker",["せんべい", "煎餅", "おかき"]],
    ["candy",      ["飴", "あめ", "きゃんでぃ"]],
    ["chips",      ["すなっく", "ぽてとちっぷす", "ぽてち"]],
    ["cake",       ["けーき", "まふぃん", "どーなつ", "しゅーくりーむ"]],
    ["nuts",       ["なっつ", "あーもんど", "ぴーなっつ"]],

    /* 飲みもの */
    ["water",  ["水", "みず", "みねらるうぉーたー", "天然水", "炭酸水"]],
    ["drink",  ["飲みもの", "飲み物", "飲物", "飲料", "どりんく"]],
    ["tea",    ["お茶", "おちゃ", "茶", "緑茶", "紅茶", "ほうじ茶"]],
    ["coffee", ["こーひー", "珈琲", "かふぇおれ"]],
    ["juice",  ["じゅーす", "野菜じゅーす"]],
    ["soda",   ["こーら", "炭酸", "さいだー", "すぽーつどりんく", "清涼飲料"]],
    ["beer",   ["びーる", "発泡酒", "ちゅーはい", "はいぼーる"]],
    ["sake",   ["酒", "日本酒", "焼酎"]],
    ["wine",   ["わいん"]],

    /* ---- 二度目の大きな追加。ここから下は、それまで一枚の絵が
       兼ねていたものを、それぞれの絵に分けたもの。 ---- */

    /* 野菜 */
    ["lettuce",     ["れたす", "さにーれたす", "さんちゅ"]],
    ["chineseCabbage", ["白菜", "はくさい"]],
    ["spinach",     ["ほうれん草", "ほうれんそう", "小松菜", "こまつな", "水菜", "みずな", "春菊", "しゅんぎく", "青梗菜", "ちんげん菜", "ちんげんさい", "にら", "菜の花"]],
    ["springOnion", ["ねぎ", "葱", "長ねぎ", "長葱", "万能ねぎ", "小ねぎ", "わけぎ", "りーき"]],
    ["asparagus",   ["あすぱら", "あすぱらがす"]],
    ["celery",      ["せろり"]],
    ["daikon",      ["大根", "だいこん"]],
    ["burdock",     ["ごぼう", "牛蒡"]],
    ["turnip",      ["かぶ", "蕪"]],
    ["lotusRoot",   ["れんこん", "蓮根"]],
    ["pumpkin",     ["かぼちゃ", "南瓜"]],
    ["zucchini",    ["ずっきーに"]],
    ["okra",        ["おくら"]],
    ["sprout",      ["もやし", "かいわれ", "すぷらうと", "豆苗", "とうみょう"]],
    ["herb",        ["はーぶ", "ばじる", "ぱくちー", "ろーずまりー", "たいむ", "みんと", "おれがの"]],
    ["bambooShoot", ["たけのこ", "筍"]],
    ["chili",       ["とうがらし", "唐辛子", "ししとう"]],
    ["ginger",      ["しょうが", "生姜", "じんじゃー"]],
    ["yam",         ["長芋", "ながいも", "山芋", "やまいも", "とろろ", "里芋", "さといも"]],
    ["peas",        ["さやえんどう", "きぬさや", "ぐりんぴーす", "そら豆", "そらまめ"]],
    ["cauliflower", ["かりふらわー", "芽きゃべつ"]],
    ["bittergourd", ["ごーや", "にがうり"]],
    ["edamame",     ["枝豆", "えだまめ"]],
    ["shiso",       ["大葉", "おおば", "しそ", "紫蘇"]],
    ["parsley",     ["ぱせり", "三つ葉", "みつば", "せり"]],
    ["myoga",       ["みょうが", "茗荷"]],
    ["snapPeas",    ["すなっぷ"]],
    ["radish",      ["らでぃっしゅ", "二十日大根"]],
    ["kale",        ["けーる"]],
    ["winterMelon", ["とうがん", "冬瓜"]],

    /* 果物 */
    ["cherry",      ["さくらんぼ", "ちぇりー"]],
    ["blueberry",   ["ぶるーべりー"]],
    ["raspberry",   ["らずべりー", "べりー"]],
    ["mango",       ["まんごー"]],
    ["persimmon",   ["柿", "かき"]],
    ["fig",         ["いちじく", "無花果"]],
    ["chestnut",    ["栗", "くり", "ぎんなん", "銀杏"]],
    ["driedFruit",  ["どらいふるーつ", "れーずん", "ぷるーん", "でーつ", "干しぶどう"]],
    ["papaya",      ["ぱぱいや"]],
    ["pomegranate", ["ざくろ"]],
    ["loquat",      ["びわ", "枇杷"]],
    ["dragonFruit", ["どらごんふるーつ", "らいち"]],
    ["apricot",     ["あんず", "杏", "ねくたりん", "すもも", "ぷらむ"]],
    ["kumquat",     ["きんかん", "金柑"]],

    /* 肉・魚 */
    ["steak",       ["すてーき"]],
    ["minced",      ["ひき肉", "みんち", "挽肉", "そぼろ"]],
    ["hamburgSteak",["はんばーぐ"]],
    ["meatball",    ["みーとぼーる", "肉団子"]],
    ["yakitori",    ["焼き鳥", "やきとり", "焼鳥", "串"]],
    ["liver",       ["ればー", "肝"]],
    ["lamb",        ["らむ肉", "羊肉", "まとん", "じんぎすかん"]],
    ["prosciutto",  ["生はむ"]],
    ["roastBeef",   ["ろーすとびーふ"]],
    ["tsukune",     ["つくね"]],
    ["hormone",     ["ほるもん", "もつ"]],
    ["tuna",        ["つな", "つな缶", "しーちきん"]],
    ["mentaiko",    ["明太子", "めんたいこ", "たらこ"]],
    ["roe",         ["いくら", "数の子", "かずのこ"]],
    ["eel",         ["うなぎ", "鰻", "あなご", "穴子"]],
    ["crab",        ["かに", "蟹"]],
    ["shirasu",     ["しらす", "ちりめん", "じゃこ"]],
    ["katsuobushi", ["鰹節", "かつおぶし", "かつお節", "けずり節"]],
    ["seaUrchin",   ["うに", "雲丹"]],
    ["scallop",     ["ほたて", "帆立"]],
    ["kamaboko",    ["かまぼこ", "蒲鉾", "なると"]],
    ["chikuwa",     ["ちくわ", "竹輪"]],
    ["grilledFish", ["焼き魚", "焼魚", "ほっけ", "西京焼"]],

    /* パン・主食 */
    ["baguette",    ["ばげっと", "ふらんすぱん"]],
    ["sandwich",    ["さんどいっち", "さんど"]],
    ["toast",       ["とーすと"]],
    ["bagel",       ["べーぐる"]],
    ["sweetBun",    ["菓子ぱん", "あんぱん", "くりーむぱん", "ちょこぱん"]],
    ["melonBun",    ["めろんぱん"]],
    ["pizza",       ["ぴざ", "ぴっつぁ"]],
    ["burger",      ["はんばーがー", "ばーがー", "ふぁすとふーど"]],
    ["hotdog",      ["ほっとどっぐ"]],
    ["cereal",      ["しりある", "ぐらのーら", "こーんふれーく", "おーとみーる"]],
    ["pancake",     ["ぱんけーき", "ほっとけーき", "わっふる", "くれーぷ"]],
    ["onigiri",     ["おにぎり", "おむすび"]],
    ["cupNoodle",   ["かっぷ麺", "かっぷらーめん", "かっぷぬーどる", "かっぷやきそば"]],
    ["soba",        ["そば", "蕎麦"]],
    ["udon",        ["うどん"]],
    ["somen",       ["そうめん", "ひやむぎ", "冷や麦"]],
    ["yakisoba",    ["焼きそば", "やきそば"]],
    ["driedNoodle", ["乾麺", "中華麺", "生麺"]],
    ["pastaSauce",  ["ぱすたそーす", "みーとそーす", "かるぼなーら"]],
    ["ramenSoup",   ["らーめんすーぷ", "つけ汁"]],
    ["okonomiyaki", ["お好み焼き", "おこのみやき"]],
    ["takoyaki",    ["たこ焼き", "たこやき"]],

    /* 調味料 */
    ["wasabi",      ["わさび", "山葵"]],
    ["gingerTube",  ["おろし生姜", "生姜ちゅーぶ", "おろししょうが"]],
    ["garlicTube",  ["おろしにんにく", "にんにくちゅーぶ"]],
    ["mustard",     ["ますたーど"]],
    ["karashi",     ["からし", "辛子"]],
    ["chiliOil",    ["らー油", "ラー油"]],
    ["sesameOil",   ["ごま油", "胡麻油"]],
    ["fishSauce",   ["なんぷらー", "魚醤"]],
    ["balsamic",    ["ばるさみこ"]],
    ["tabasco",     ["たばすこ"]],
    ["doubanjiang", ["豆板醤", "とうばんじゃん"]],
    ["gochujang",   ["こちゅじゃん"]],
    ["curryRoux",   ["かれーるー", "はやしるー", "しちゅーるー", "るー"]],
    ["spice",       ["すぱいす", "香辛料", "くみん", "かれー粉", "ちりぱうだー", "ばじるそると"]],
    ["consomme",    ["こんそめ", "ぶいよん", "固形すーぷ"]],
    ["stockPack",   ["だしぱっく", "顆粒だし", "粉末だし"]],
    ["shiroDashi",  ["白だし", "しろだし"]],
    ["shioKoji",    ["塩麹", "しおこうじ", "甘酒麹"]],
    ["sesame",      ["ごま", "胡麻", "すりごま", "いりごま"]],
    ["syrup",       ["しろっぷ", "めーぷる", "がむしろっぷ"]],
    ["peanutButter",["ぴーなっつばたー", "ぴーなっつくりーむ"]],
    ["marmalade",   ["まーまれーど"]],
    ["yeast",       ["どらいいーすと", "いーすと", "べーきんぐぱうだー"]],

    /* 乳製品 */
    ["slicedCheese",["すらいすちーず"]],
    ["pizzaCheese", ["ぴざちーず", "とろけるちーず", "しゅれっどちーず"]],
    ["creamCheese", ["くりーむちーず"]],
    ["camembert",   ["かまんべーる", "ぶるーちーず", "もっつぁれら"]],
    ["margarine",   ["まーがりん"]],
    ["condensedMilk",["れんにゅう", "練乳", "こんでんすみるく"]],
    ["drinkYogurt", ["飲むよーぐると", "のむよーぐると"]],

    /* 菓子 */
    ["gummy",       ["ぐみ"]],
    ["marshmallow", ["ましゅまろ"]],
    ["caramel",     ["きゃらめる", "ぬがー"]],
    ["jelly",       ["ぜりー"]],
    ["dorayaki",    ["どら焼き", "どらやき"]],
    ["daifuku",     ["大福", "だいふく", "もなか", "最中"]],
    ["dango",       ["団子", "だんご", "みたらし"]],
    ["manju",       ["まんじゅう", "饅頭", "蒸しぱん"]],
    ["castella",    ["かすてら", "ばうむくーへん"]],
    ["cracker",     ["くらっかー"]],
    ["pocky",       ["ぽっきー", "ぷりっつ"]],
    ["gum",         ["がむ", "ふりすく", "たぶれっと菓子", "みんてぃあ"]],
    ["dryFood",     ["するめ", "じゃーきー", "さきいか", "おつまみ"]],
    ["wafer",       ["うえはーす"]],
    ["tart",        ["たると", "ぱい"]],
    ["cerealBar",   ["しりあるばー", "かろりーめいと", "そいじょい"]],
    ["chocoBar",    ["ちょこばー", "きのこの山", "たけのこの里"]],
    ["popcorn",     ["ぽっぷこーん"]],
    ["ramuneCandy", ["らむね"]],
    ["throatCandy", ["のど飴", "のどあめ", "こうがい"]],

    /* 飲みもの */
    ["cocoa",       ["ここあ", "みろ"]],
    ["matcha",      ["抹茶", "まっちゃ"]],
    ["oolong",      ["うーろん", "烏龍"]],
    ["milkTea",     ["みるくてぃー", "ろいやるみるくてぃー"]],
    ["latte",       ["らて", "かふぇらて", "かぷちーの"]],
    ["energyDrink", ["えなじー", "もんすたー", "れっどぶる"]],
    ["tonic",       ["栄養どりんく", "りぽびたん", "どりんく剤", "おろなみん"]],
    ["protein",     ["ぷろていん"]],
    ["whisky",      ["ういすきー", "うぃすきー", "ぶらんでー", "じん", "うぉっか"]],
    ["plum",        ["梅酒", "うめしゅ"]],
    ["cocktail",    ["かくてる", "さわー", "れもんさわー"]],
    ["smoothie",    ["すむーじー", "みっくすじゅーす"]],
    ["aojiru",      ["青汁", "あおじる"]],
    ["amazake",     ["甘酒", "あまざけ"]],
    ["lactic",      ["やくると", "乳酸菌", "かるぴす"]],
    ["teaBag",      ["てぃーばっぐ", "紅茶ぱっく", "お茶ぱっく"]],
    ["barleyTea",   ["麦茶", "むぎ茶"]],
    ["coffeeBeans", ["こーひー豆", "珈琲豆", "どりっぷ", "いんすたんとこーひー"]],

    /* 惣菜・冷凍・乾物 */
    ["tempura",     ["天ぷら", "てんぷら", "かき揚げ"]],
    ["croquette",   ["ころっけ"]],
    ["friedFood",   ["ふらい", "揚げ物", "唐揚げ", "からあげ", "とんかつ", "めんち"]],
    ["gratin",      ["ぐらたん", "どりあ"]],
    ["omelette",    ["玉子焼き", "たまごやき", "おむれつ", "だし巻き", "厚焼き"]],
    ["saladChicken",["さらだちきん", "蒸し鶏"]],
    ["frozenGyoza", ["冷凍餃子", "冷凍食品"]],
    ["icePop",      ["あいすばー", "がりがり", "あいすきゃんでぃ"]],
    ["shavedIce",   ["かき氷", "かきごおり"]],
    ["driedShiitake",["干ししいたけ", "乾しいたけ", "干し椎茸"]],
    ["koyaTofu",    ["高野豆腐", "こうやどうふ"]],
    ["fu",          ["麸", "焼き麸"]],
    ["cannedFruit", ["ふるーつ缶", "みかん缶", "もも缶"]],
    ["cannedCorn",  ["こーん缶"]],
    ["cannedFish",  ["さば缶", "鯖缶", "いわし缶", "さんま缶"]],
    ["springRoll",  ["春巻", "はるまき"]],
    ["potatoSalad", ["ぽてとさらだ", "まかろにさらだ"]],
    ["saladPack",   ["かっとやさい", "さらだぱっく", "千切りきゃべつ"]],
    ["oden",        ["おでん"]],

    /* ベビー */
    ["formula",     ["粉みるく", "こなみるく", "ふぉろー", "液体みるく"]],
    ["babyFood",    ["離乳食", "りにゅうしょく", "べびーふーど"]],
    ["babyBottle",  ["哺乳瓶", "ほにゅうびん"]],
    ["babyWipes",   ["おしりふき"]],

    /* 掃除・洗濯 */
    ["cleanerSpray",   ["くりーなー", "住居用洗剤", "掃除すぷれー"]],
    ["kitchenSpray",   ["きっちん洗剤", "きっちん用洗剤"]],
    ["bathCleaner",    ["風呂用洗剤", "ばす洗剤", "浴室", "おふろ洗剤"]],
    ["toiletCleaner",  ["といれ洗剤", "といれくりーなー", "さんぽーる", "便器"]],
    ["mold",           ["かび取り", "かびきらー", "防かび"]],
    ["pipeCleaner",    ["ぱいぷ", "排水口洗剤", "ぱいぷくりーなー"]],
    ["cleanser",       ["くれんざー", "磨き粉", "みがき粉"]],
    ["wipes",          ["除菌しーと", "うぇっとてぃっしゅ", "おそうじしーと"]],
    ["rubberGloves",   ["ごむ手袋", "炊事手袋"]],
    ["scrubBrush",     ["たわし", "ぶらし", "でっきぶらし"]],
    ["bucket",         ["ばけつ", "洗面器"]],
    ["mop",            ["もっぷ"]],
    ["vacuum",         ["掃除機", "そうじき", "ころころ", "ころころ"]],
    ["laundryNet",     ["洗濯ねっと", "らんどりーねっと"]],
    ["hanger",         ["はんがー"]],
    ["clothespin",     ["洗濯ばさみ", "せんたくばさみ", "ぴんち"]],
    ["dishcloth",      ["ふきん", "布巾", "雑巾", "ぞうきん"]],
    ["paperPlate",     ["紙皿", "かみざら"]],
    ["paperCup",       ["紙こっぷ", "かみこっぷ"]],
    ["chopsticks",     ["割り箸", "わりばし"]],
    ["straw",          ["すとろー"]],
    ["toothpick",      ["つまようじ", "爪楊枝", "ようじ"]],
    ["container",      ["保存容器", "たっぱー", "たっぱ"]],
    ["dryingAgent",    ["乾燥剤", "除湿", "湿気取り", "除湿剤"]],
    ["detergentPod",   ["じぇるぼーる", "洗剤ぼーる"]],
    ["bakingSoda",     ["重曹", "じゅうそう"]],
    ["citricAcid",     ["くえん酸"]],
    ["floorWipes",     ["掃除しーと", "ふろあしーと", "くいっくる", "床用しーと"]],
    ["floorWiper",     ["ふろあわいぱー", "わいぱー"]],
    ["refillPouch",    ["詰め替え", "つめかえ", "詰替"]],
    ["trashCan",       ["ごみ箱", "ごみばこ", "だすとぼっくす"]],
    ["drainNet",       ["排水口ねっと", "水切りねっと", "三角こーなー", "きっちんねっと"]],
    ["mosquitoCoil",   ["蚊取り線香", "かとりせんこう"]],
    ["icePack",        ["保冷剤", "ほれいざい"]],
    ["ecoBag",         ["えこばっぐ", "買い物袋", "れじ袋", "れじぶくろ"]],
    ["coolerBag",      ["くーらーばっぐ", "保冷ばっぐ"]],

    /* キッチン道具 */
    ["pan",         ["ふらいぱん"]],
    ["kettle",      ["やかん"]],
    ["cutlery",     ["かとらりー", "食器"]],
    ["riceCooker",  ["炊飯器", "すいはんき"]],
    ["apron",       ["えぷろん"]],
    ["knife",       ["包丁", "ほうちょう", "ないふ"]],
    ["cuttingBoard",["まな板", "まないた"]],
    ["strainer",    ["ざる", "水切り"]],
    ["measuringCup",["計量かっぷ", "けいりょう"]],
    ["peeler",      ["ぴーらー", "皮むき"]],

    /* 衛生・美容 */
    ["serum",           ["美容液", "びようえき"]],
    ["lipBalm",         ["りっぷ", "りっぷくりーむ"]],
    ["lipstick",        ["口紅", "くちべに"]],
    ["foundation",      ["ふぁんでーしょん", "ふぁんで", "びーびーくりーむ", "こんしーらー"]],
    ["mascara",         ["ますから", "あいらいなー", "あいしゃどう"]],
    ["makeupRemover",   ["くれんじんぐ", "めいく落とし", "化粧落とし"]],
    ["cottonPad",       ["こっとん", "ぱふ", "こっとんぱふ"]],
    ["nailClipper",     ["爪切り", "つめきり"]],
    ["hairOil",         ["へあおいる", "つばき油", "洗い流さない"]],
    ["hairSpray",       ["へあすぷれー", "けーぷ", "すたいりんぐ"]],
    ["hairWax",         ["わっくす", "整髪", "へあじぇる"]],
    ["comb",            ["くし", "櫛"]],
    ["hairTie",         ["へあごむ", "髪ごむ", "しゅしゅ"]],
    ["floss",           ["ふろす", "糸ようじ", "でんたるふろす"]],
    ["mouthwash",       ["まうすうぉっしゅ", "洗口液", "もんだみん", "りすてりん"]],
    ["interdental",     ["歯間ぶらし", "しかんぶらし"]],
    ["bathSalt",        ["入浴剤", "にゅうよくざい", "ばすそると", "ばぶ"]],
    ["towel",           ["たおる", "ばすたおる", "はんかち", "ふぇいすたおる"]],
    ["perfume",         ["香水", "こうすい", "おーでとわれ"]],
    ["handCream",       ["はんどくりーむ", "ぼでぃくりーむ"]],
    ["bodyTowel",       ["ぼでぃたおる", "浴用たおる", "垢すり"]],
    ["contactSolution", ["こんたくと", "洗浄液", "保存液"]],
    ["shoeCare",        ["靴", "くつ", "靴磨き", "しゅーず", "すにーかー"]],
    ["airFreshener",    ["芳香剤", "ほうこうざい", "るーむふれぐらんす", "お部屋の"]],

    /* 薬・健康 */
    ["pillSheet",       ["錠剤", "じょうざい"]],
    ["coldMedicine",    ["風邪薬", "かぜぐすり", "解熱", "総合感冒", "せき止め"]],
    ["stomachMedicine", ["胃薬", "いぐすり", "整腸", "せいちょうざい", "胃腸薬"]],
    ["eyeDrops",        ["目薬", "めぐすり"]],
    ["supplement",      ["さぷり", "さぷりめんと", "びたみん", "こらーげん", "鉄分"]],
    ["ointment",        ["軟膏", "なんこう", "塗り薬", "かゆみ止め"]],
    ["bandage",         ["包帯", "ほうたい", "がーぜ"]],
    ["disinfectant",    ["消毒", "しょうどく", "あるこーる", "手指"]],
    ["heatPad",         ["かいろ", "ほっかいろ"]],
    ["testKit",         ["検査きっと", "抗原", "妊娠検査"]],

    /* 文具・道具 */
    /* 「ぺん」だけが残っているのは、鉛筆もシャーペンも蛍光ペンもマジックも
       それぞれの絵になったから。下の「文房具」の並びが引き取っている。 */
    ["pen",         ["ぺん", "ぼーるぺん"]],
    ["notebook",    ["のーと"]],
    ["eraser",      ["消しごむ", "けしごむ"]],
    ["tape",        ["せろてーぷ", "てーぷ", "がむてーぷ", "ますきんぐ"]],
    ["glue",        ["接着剤", "すてぃっくのり", "でんぷんのり", "ぼんど"]],
    ["scissors",    ["はさみ", "鋏"]],
    ["envelope",    ["封筒", "ふうとう"]],
    ["charger",     ["充電器", "じゅうでんき", "あだぷた"]],
    ["earphone",    ["いやほん"]],
    ["umbrella",    ["傘", "かさ", "びにーる傘", "折りたたみ傘"]],
    ["stickyNote",  ["付箋", "ふせん", "ぽすといっと"]],
    ["fileFolder",  ["ふぁいる", "くりあふぁいる", "ふぉるだ"]],
    ["ruler",       ["定規", "じょうぎ", "ものさし"]],
    ["stapler",     ["ほちきす", "すてーぷらー"]],
    ["calculator",  ["電卓", "でんたく"]],
    ["cutter",      ["かったー"]],
    ["lightBattery",["充電池", "じゅうでんち", "えねるーぷ"]],

    /* 衣類・そのほか */
    ["tshirt",      ["てぃーしゃつ", "しゃつ", "肌着", "はだぎ"]],
    ["underwear",   ["下着", "したぎ", "ぱんつ", "ぶらじゃー"]],
    ["slippers",    ["すりっぱ"]],
    ["pyjamas",     ["ぱじゃま", "ねまき", "寝間着", "るーむうぇあ"]],
    ["hat",         ["帽子", "ぼうし", "きゃっぷ"]],
    ["gloves",      ["手袋", "てぶくろ"]],
    ["catLitter",   ["猫砂", "ねこ砂", "ねこすな"]],
    ["petSheet",    ["ぺっとしーつ", "といれしーつ"]],
    ["flower",      ["生花", "切り花", "ふらわー", "花束"]],
    ["plant",       ["観葉植物", "かんようしょくぶつ", "肥料", "培養土"]],
    ["refillPouchGreen", ["詰め替え用", "つめかえ用"]],
    ["handWarmerBox",    ["貼るかいろ", "はるかいろ"]],
    ["driedSeaweedSoup", ["わかめすーぷ", "即席すーぷ"]],
    ["instantSoup",      ["かっぷすーぷ", "ぽたーじゅ", "こーんすーぷ"]],

    /* 家具・寝具 */
    ["chair",         ["椅子", "いす", "ちぇあ", "座椅子", "すつーる"]],
    ["desk",          ["机", "つくえ", "ですく", "学習机"]],
    ["diningTable",   ["てーぶる", "食卓", "ちゃぶ台", "だいにんぐ"]],
    ["sofa",          ["そふぁ", "そふぁー", "長椅子"]],
    ["bed",           ["べっど", "べっと", "ベット", "べっどふれーむ"]],
    ["mattress",      ["まっとれす", "敷きぱっど", "べっどぱっど"]],
    ["futon",         ["布団", "ふとん", "掛け布団", "敷布団", "羽毛布団"]],
    ["pillow",        ["枕", "まくら", "まくらかばー", "ぴろー"]],
    ["blanket",       ["毛布", "もうふ", "ブランケット", "ぶらんけっと", "膝掛け"]],
    ["bedSheet",      ["しーつ", "ぼっくすしーつ", "べっどかばー", "布団かばー"]],
    ["bookshelf",     ["本棚", "ほんだな", "書棚"]],
    ["shelfUnit",     ["棚", "たな", "らっく", "しぇるふ", "すちーるらっく"]],
    ["chestDrawers",  ["たんす", "箪笥", "ちぇすと", "衣装ケース", "引き出し"]],
    ["storageBox",    ["収納ぼっくす", "収納ケース", "収納", "衣装ぼっくす"]],
    ["rug",           ["らぐ", "かーぺっと", "絨毯", "じゅうたん", "ござ"]],
    ["curtain",       ["かーてん", "れーすかーてん", "遮光かーてん"]],
    ["mirror",        ["鏡", "かがみ", "みらー", "姿見", "手鏡"]],
    ["wallClock",     ["時計", "とけい", "掛け時計", "目覚まし"]],
    /* 「らいと」だけでは照明と決められない——「ライトツナ缶」がある。
       どの照明かまで言われて初めて絵が決まる。 */
    ["deskLamp",      ["照明", "でんきすたんど", "すたんどらいと", "らんぷ", "ですくらいと"]],
    ["ceilingLight",  ["しーりんぐらいと", "しーりんぐ", "天井照明", "ぺんだんとらいと"]],
    ["cushion",       ["くっしょん", "座布団", "ざぶとん"]],
    ["doormat",       ["玄関まっと", "どあまっと", "足ふきまっと", "玄関ﾏｯﾄ"]],
    ["laundryBasket", ["洗濯かご", "らんどりーばすけっと", "洗濯かご"]],
    ["photoFrame",    ["ふぉとふれーむ", "写真立て", "額縁", "がくぶち"]],
    ["vase",          ["花瓶", "かびん", "べーす"]],
    ["kotatsu",       ["こたつ", "炬燵", "こたつ布団"]],

    /* 文房具 */
    ["pencil",           ["鉛筆", "えんぴつ"]],
    ["mechanicalPencil", ["しゃーぺん", "しゃーぷぺんしる", "しゃーぷぺん"]],
    ["pencilLead",       ["しゃー芯", "替え芯", "かえしん", "ぺんしるれっど"]],
    ["marker",           ["まじっく", "さいんぺん", "油性ぺん", "まーかー", "まっきー"]],
    ["highlighter",      ["蛍光ぺん", "けいこうぺん", "らいんまーかー"]],
    ["crayon",           ["くれよん", "くれぱす", "ぱす"]],
    ["colorPencils",     ["色鉛筆", "いろえんぴつ"]],
    ["paintSet",         ["絵の具", "えのぐ", "水彩", "ぱれっと"]],
    ["paintBrush",       ["筆", "ふで", "書道", "習字"]],
    ["correctionTape",   ["修正てーぷ", "しゅうせいてーぷ", "修正液"]],
    ["paperClip",        ["くりっぷ", "ぜむくりっぷ"]],
    ["binderClip",       ["だぶるくりっぷ", "ばいんだーくりっぷ"]],
    ["pushPin",          ["画びょう", "がびょう", "押しぴん", "ぴん"]],
    ["rubberBand",       ["輪ごむ", "わごむ", "ごむばんど"]],
    ["staples",          ["ほちきす針", "ほちきすの針", "すてーぷらー針"]],
    ["holePunch",        ["ぱんち", "穴あけぱんち"]],
    ["pencilCase",       ["筆箱", "ふでばこ", "ぺんけーす", "ぺんぽーち"]],
    ["copyPaper",        ["こぴー用紙", "印刷用紙", "上質紙", "画用紙"]],
    ["looseLeaf",        ["るーずりーふ", "替え紙"]],
    ["binder",           ["ばいんだー", "とじこみ", "2穴ふぁいる"]],
    ["letterPad",        ["便箋", "びんせん", "れたーせっと", "一筆箋"]],
    ["postcard",         ["はがき", "葉書", "年賀状", "ぽすとかーど"]],
    ["postageStamp",     ["切手", "きって", "収入印紙"]],
    ["nameStamp",        ["印鑑", "いんかん", "はんこ", "認印", "しゃちはた"]],
    ["inkPad",           ["朱肉", "しゅにく", "すたんぷ台"]],
    ["memoPad",          ["めも帳", "めもちょう", "めも用紙", "めもぱっど"]],
    ["diary",            ["手帳", "てちょう", "日記", "すけじゅーる帳"]],
    ["calendarSheet",    ["かれんだー", "暦", "日めくり"]],
    ["whiteboard",       ["ほわいとぼーど", "黒板", "こくばん"]],
    ["magnetPin",        ["まぐねっと", "磁石", "じしゃく"]],
    ["labelSticker",     ["しーる", "らべる", "ねーむしーる", "すてっかー"]],
    ["sketchbook",       ["すけっちぶっく", "画帳", "らくがき帳"]],
    ["protractor",       ["分度器", "ぶんどき"]],
    ["inkCartridge",     ["いんく", "ぷりんたーいんく", "となー", "いんくかーとりっじ"]],

    /* キッチングッズ */
    ["saucepan",        ["片手鍋", "milkぱん", "小鍋"]],
    ["pressureCooker",  ["圧力鍋", "あつりょくなべ", "無水鍋"]],
    ["wok",             ["中華鍋", "ちゅうかなべ"]],
    ["potLid",          ["鍋ぶた", "なべぶた", "鍋蓋"]],
    ["ladle",           ["おたま", "お玉", "れーどる", "すーぷすぷーん"]],
    ["turner",          ["ふらい返し", "ふらいがえし", "たーなー", "へら"]],
    ["whisk",           ["泡立て器", "あわだて器", "ほいっぱー"]],
    ["tongs",           ["とんぐ", "菜箸とんぐ"]],
    ["grater",          ["おろし金", "おろしがね", "すりおろし器", "おろし器"]],
    ["rollingPin",      ["麺棒", "のし棒"]],
    ["kitchenScissors", ["きっちんばさみ", "調理ばさみ"]],
    ["canOpener",       ["缶切り", "かんきり"]],
    ["bottleOpener",    ["栓抜き", "せんぬき"]],
    ["corkscrew",       ["わいんおーぷなー", "こるく抜き", "そむりえないふ"]],
    ["measuringSpoon",  ["計量すぷーん", "小さじ", "大さじ"]],
    ["kitchenScale",    ["はかり", "きっちんすけーる", "計り", "秤"]],
    ["kitchenTimer",    ["たいまー", "きっちんたいまー"]],
    ["thermos",         ["水筒", "すいとう", "まほうびん", "魔法瓶", "さーもす"]],
    ["tumbler",         ["たんぶらー", "すてんれすかっぷ"]],
    ["mug",             ["まぐかっぷ", "まぐ", "こーひーかっぷ"]],
    ["glassCup",        ["こっぷ", "ぐらす", "ころっぷ", "ぐらすこっぷ"]],
    ["teapot",          ["急須", "きゅうす", "てぃーぽっと", "ぽっと"]],
    ["teacup",          ["湯のみ", "ゆのみ", "湯呑", "てぃーかっぷ"]],
    ["riceBowl",        ["茶碗", "ちゃわん", "ご飯茶碗", "飯碗"]],
    ["plateDish",       ["皿", "さら", "ぷれーと", "大皿", "取り皿"]],
    ["donburi",         ["どんぶり", "丼", "丼ぶり", "らーめん鉢"]],
    ["lunchBox",        ["弁当箱", "べんとうばこ", "らんちぼっくす"]],
    ["dishRack",        ["水切りかご", "水切りらっく", "食器かご"]],
    ["storageJar",      ["保存瓶", "きゃにすたー", "がらす瓶", "梅酒びん"]],
    ["iceTray",         ["製氷皿", "せいひょうざら", "製氷器"]],
    ["ricePaddle",      ["しゃもじ", "杓文字"]],
    ["ovenMitt",        ["鍋つかみ", "なべつかみ", "みとん", "おーぶんみとん"]],

    /* カトラリー */
    ["spoon",          ["すぷーん", "さじ"]],
    ["fork",           ["ふぉーく"]],
    ["tableKnife",     ["てーぶるないふ", "ばたーないふ"]],
    ["renge",          ["れんげ", "散り蓮華"]],
    ["chopstickPair",  ["箸", "お箸", "はし", "菜箸", "my箸"]],

    /* 家電 */
    ["microwave",       ["電子れんじ", "れんじ", "でんしれんじ"]],
    ["ovenToaster",     ["とーすたー", "おーぶん", "おーぶんとーすたー", "のんふらいやー"]],
    ["fridge",          ["冷蔵庫", "れいぞうこ", "冷凍庫", "れいとうこ"]],
    ["washingMachine",  ["洗濯機", "せんたくき", "せんたっき", "洗濯乾燥機"]],
    ["clothesDryer",    ["乾燥機", "かんそうき", "衣類乾燥機", "布団乾燥機"]],
    ["hairDryer",       ["どらいやー", "へあどらいやー"]],
    ["iron",            ["あいろん", "衣類すちーまー"]],
    ["electricFan",     ["扇風機", "せんぷうき", "さーきゅれーたー"]],
    ["heater",          ["ひーたー", "すとーぶ", "電気ひーたー", "ふぁんひーたー"]],
    ["airConditioner",  ["えあこん", "くーらー", "冷房", "暖房"]],
    ["humidifier",      ["加湿器", "かしつき", "除湿機", "じょしつき"]],
    ["airPurifier",     ["空気清浄機", "くうきせいじょうき", "脱臭機"]],
    ["tv",              ["てれび", "液晶てれび", "もにたー"]],
    ["speaker",         ["すぴーかー", "ぶるーとぅーすすぴーかー"]],
    ["headphones",      ["へっどほん", "へっどせっと"]],
    ["laptop",          ["ぱそこん", "のーとぱそこん", "のーとpc", "らっぷとっぷ"]],
    ["tablet",          ["たぶれっと", "あいぱっど", "ipad"]],
    ["smartphone",      ["すまほ", "すまーとふぉん", "携帯電話", "iphone"]],
    ["printer",         ["ぷりんたー", "複合機", "ふくごうき"]],
    ["router",          ["るーたー", "wifi", "無線らん", "むせんらん"]],
    ["mouse",           ["まうす", "わいやれすまうす"]],
    ["keyboardDevice",  ["きーぼーど"]],
    ["camera",          ["かめら", "でじかめ", "一眼れふ"]],
    ["blender",         ["みきさー", "ぶれんだー", "ふーどぷろせっさー", "はんどぶれんだー"]],
    ["coffeeMaker",     ["こーひーめーかー", "えすぷれっそましん", "こーひーましん"]],
    ["electricKettle",  ["電気けとる", "電気ぽっと", "けとる", "ていふぁーる"]],
    ["hotplate",        ["ほっとぷれーと", "たこ焼き器", "電気なべ"]],
    ["powerStrip",      ["電源たっぷ", "延長こーど", "たっぷ", "こんせんと"]],
    ["powerBank",       ["もばいるばってりー", "充電ばってりー"]],
    ["remote",          ["りもこん", "りもーと"]],
    ["shaver",          ["しぇーばー", "電気しぇーばー", "電動しぇーばー"]],
    ["electricToothbrush", ["電動歯ぶらし", "音波歯ぶらし"]],
    ["dishwasher",      ["食洗機", "しょくせんき", "食器洗い機"]],
    ["usbCable",        ["けーぶる", "usbけーぶる", "らいとにんぐけーぶる", "typec"]],
  ];

  /* 新しく増えた絵のキーワードも、同じ表に混ぜます。並べ替えは下でまとめて
     やるので、ここでは足すだけ。 */
  if (KN.iconsV2Keys) KEYS.push(...KN.iconsV2Keys);

  const FLAT = KEYS
    .flatMap(([name, words]) => words.map((w) => [KN.util.foldKana(w), name]))
    .sort((a, b) => b[0].length - a[0].length);

  /** Drawn icon for a product name, as raw SVG — or "" when nothing fits. */
  function find(name) {
    const key = findKey(name);
    return key ? ICONS[key] : "";
  }

  /** 同じことを、絵ではなく **名前** で返します。
      絵そのものは長いSVGの文字列なので、「この二つは同じ絵か」を
      比べるのには向きません。並べ替えが要るのは、比べられる名前のほうです。
      @returns {string} 例 "milk"、当てはまらなければ "" */
  function findKey(name) {
    const n = KN.util.foldKana(String(name || ""));
    if (!n) return "";
    for (const [key, icon] of FLAT) if (n.includes(key)) return icon;
    return "";
  }

  /** Nothing matched the name: a plain package, painted in whatever colour the
   *  category uses, so the row still belongs to a group by sight. */
  const fallback = (tint) => S(`
    <rect x="3.4" y="5.6" width="17.2" height="14.4" rx="2" fill="${tint || "#b9c3be"}"/>
    <rect x="3.4" y="5.6" width="17.2" height="4.2" rx="2" fill="#000000" opacity=".17"/>
    <rect x="10.9" y="9.8" width="2.2" height="10.2" fill="#000000" opacity=".13"/>
  `);

  /* ---------------- choosing one by hand ---------------- */

  /* The guess is right most of the time, and wrong in ways only the owner of
     the cupboard can see: 「コンソメ」 is a box to this table and a stock cube
     to the person buying it. So the picture can be set by hand — and for that
     every icon needs a name to be listed under. The first keyword is it: it
     is the plainest word for the thing, which is why it was written first. */
  const LABELS = { package: "むじるしの箱" };
  KEYS.forEach(([key, words]) => { if (!LABELS[key]) LABELS[key] = words[0]; });

  /** Every icon, in the order KEYS groups them. */
  const ORDER = KEYS.map(([key]) => key)
    .concat(Object.keys(ICONS).filter((k) => !KEYS.some(([key]) => key === k)));

  const list = () => ORDER.map((key) => ({ key, label: LABELS[key] || key, svg: ICONS[key] }));

  /** The icon a key names, or "" for a key that is not one. */
  const byKey = (key) => (key && ICONS[key]) || "";

  /** The longest run of characters two strings share. */
  function sharedRun(a, b) {
    let best = 0, end = 0;
    const row = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let prev = 0;
      for (let j = 1; j <= b.length; j++) {
        const cur = row[j];
        row[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
        if (row[j] > best) { best = row[j]; end = i; }
        prev = cur;
      }
    }
    return a.slice(end - best, end);
  }

  const KANJI = /[㐀-鿿]/;

  /* How much a shared run is worth saying out loud. Two kana together mean
     almost nothing — 「こんそめ」 and 「べーこん」 share こん, and one is not a
     hint about the other — while two kanji usually name a thing: 洗剤 shared
     between 食器用洗剤 and 洗濯洗剤 is the whole point. So kana need three,
     kanji need two. */
  const runIsWorthIt = (run) => run.length >= 3 || (run.length >= 2 && KANJI.test(run));

  /**
   * Icons this name might mean, best first.
   *
   * Three tiers, and the reason there are three: an exact hit is what `find`
   * already picks and belongs at the top; a name that is *part* of a keyword
   * (「トイレ」 against 「トイレットペーパー」) is nearly as good; and after
   * that, sharing a run of characters is worth offering — 「食器用洗剤」 and
   * 「洗濯洗剤」 share 洗剤, which is exactly the pair a guess is most likely
   * to get the wrong way round.
   */
  function suggest(name, limit) {
    const n = KN.util.foldKana(String(name || ""));
    if (!n) return [];
    const score = new Map();
    const bump = (key, v) => { if ((score.get(key) || 0) < v) score.set(key, v); };

    KEYS.forEach(([key, words]) => {
      words.forEach((w) => {
        const k = KN.util.foldKana(w);
        if (!k) return;
        if (n.includes(k)) bump(key, 2000 + k.length * 10);
        else if (n.length >= 2 && k.includes(n)) bump(key, 1000 + n.length * 10);
        else {
          const run = sharedRun(n, k);
          if (runIsWorthIt(run)) bump(key, run.length * 10 + (KANJI.test(run) ? 5 : 0));
        }
      });
    });

    return [...score.entries()]
      .sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
      .slice(0, limit || 8)
      .map(([key]) => key);
  }

  /** Icons whose name or keywords contain the query. */
  function search(query) {
    const q = KN.util.foldKana(String(query || ""));
    if (!q) return list();
    return list().filter(({ key, label }) => {
      if (KN.util.foldKana(label).includes(q)) return true;
      const entry = KEYS.find(([k]) => k === key);
      return !!entry && entry[1].some((w) => KN.util.foldKana(w).includes(q));
    });
  }

  KN.productIcons = { find, findKey, fallback, ICONS, list, byKey, suggest, search, LABELS };
})();
