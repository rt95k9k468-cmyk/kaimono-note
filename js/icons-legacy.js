/* =========================================================
   くらしノート — 手描きの55個（legacy）

   Phosphor へ移す前に、この画面がずっと使っていた絵です。**消していません。**
   一族の一つとして登録してあるだけで、いまの画面からは引かれません
   （js/icons.js の provider が "phosphor" のため）。

   戻すときは一行です：

       KN.icons.use("legacy");

   一つだけ、いまも現役の絵があります——**体重計（scale）**。Phosphor に
   あるのは天びん（scales）で、それは買いもの側の「お店を比べる」と紛れます。
   適切な代替が無いものは無理に置き換えない、という決めごとに従って、ここの
   絵をそのまま使っています（js/icons.js の逃げ場が拾います）。

   中身は移す前のまま、一文字も直していません。太さは CSS が決めます
   （--ico-w / --ico-sm-w）——線の絵なので。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const ICON_PATHS = {
    list:      '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="3.5" cy="18" r="1.5"/>',
    // The previous tag started at 20.6,13.4 but ended at 20.6,15.4, so `Z`
    // drew a stray 2px segment that showed as a notch on the right corner.
    // This one is a closed outline, symmetric about the 45° diagonal.
    tag:       '<path d="M11.6 2.6H4.4A1.8 1.8 0 0 0 2.6 4.4v7.2a1.8 1.8 0 0 0 .53 1.27l8 8a1.8 1.8 0 0 0 2.54 0l7.2-7.2a1.8 1.8 0 0 0 0-2.54l-8-8A1.8 1.8 0 0 0 11.6 2.6Z"/><circle cx="7.2" cy="7.2" r="1.5"/>',
    // A storefront, because the tab this sits on is labelled お店. The old
    // balance scale meant "compare" but read as neither a shop nor a working
    // scale — its beam tilted while the pans hung level.
    shop:      '<path d="M3.2 9.2 5.1 3.8h13.8l1.9 5.4"/><path d="M2.6 9.2h18.8"/><path d="M4.6 9.2v11.4M19.4 9.2v11.4"/><path d="M2.8 20.6h18.4"/><path d="M9.6 20.6v-6.2h4.8v6.2"/>',
    // A real cog: eight square teeth on a circular body, generated so the
    // pitch is exact. The previous one was drawn from linked arcs, which
    // read as a wavy blob rather than a gear and clipped at the right edge.
    gear:      '<path d="M9.75 4.64L10.25 2.05A10.1 10.1 0 0 1 13.75 2.05L14.25 4.64A7.7 7.7 0 0 1 15.61 5.2L17.79 3.73A10.1 10.1 0 0 1 20.27 6.21L18.8 8.39A7.7 7.7 0 0 1 19.36 9.75L21.95 10.25A10.1 10.1 0 0 1 21.95 13.75L19.36 14.25A7.7 7.7 0 0 1 18.8 15.61L20.27 17.79A10.1 10.1 0 0 1 17.79 20.27L15.61 18.8A7.7 7.7 0 0 1 14.25 19.36L13.75 21.95A10.1 10.1 0 0 1 10.25 21.95L9.75 19.36A7.7 7.7 0 0 1 8.39 18.8L6.21 20.27A10.1 10.1 0 0 1 3.73 17.79L5.2 15.61A7.7 7.7 0 0 1 4.64 14.25L2.05 13.75A10.1 10.1 0 0 1 2.05 10.25L4.64 9.75A7.7 7.7 0 0 1 5.2 8.39L3.73 6.21A10.1 10.1 0 0 1 6.21 3.73L8.39 5.2A7.7 7.7 0 0 1 9.75 4.64Z"/><circle cx="12" cy="12" r="3.1"/>',
    // Five even points, generated rather than eyeballed. Filled via CSS when on.
    star:      '<path d="M12 2.6L14.26 8.89L20.94 9.1L15.66 13.19L17.53 19.6L12 15.85L6.47 19.6L8.34 13.19L3.06 9.1L9.74 8.89Z"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    check:     '<path d="M20 6 9 17l-5-5"/>',
    search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    close:     '<path d="M18 6 6 18M6 6l12 12"/>',
    chevron:   '<path d="m9 18 6-6-6-6"/>',
    trash:     '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    store:     '<path d="M3 9 4.5 4h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    minus:     '<path d="M5 12h14"/>',
    download:  '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
    upload:    '<path d="M12 21V9M7 13l5-5 5 5M4 3h16"/>',
    // 二枚重ねた紙。「コピーする」の、どこでも同じ形。
    copy:      '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    sparkles:  '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    undo:      '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7"/>',
    // Delete-left. A plain ✕ on that key reads as "close", which is the one
    // thing it must not be mistaken for while a pad is open.
    backspace: '<path d="M20.4 4.6H9.7a2 2 0 0 0-1.55.74L2.9 12l5.25 6.66a2 2 0 0 0 1.55.74h10.7a2 2 0 0 0 2-2V6.6a2 2 0 0 0-2-2Z"/><path d="M12.4 9.6l5 4.8M17.4 9.6l-5 4.8"/>',
    cart:      '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.77L21 8H6"/>',
    // The two layouts, drawn as what they are: stacked rows, and a 3×3 of
    // squares. Each button shows the layout it switches *to*.
    rows:      '<rect x="3" y="4.5" width="18" height="4.4" rx="1.4"/><rect x="3" y="15.1" width="18" height="4.4" rx="1.4"/>',
    tiles:     '<rect x="3" y="3" width="7.4" height="7.4" rx="1.6"/><rect x="13.6" y="3" width="7.4" height="7.4" rx="1.6"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="1.6"/><rect x="13.6" y="13.6" width="7.4" height="7.4" rx="1.6"/>',
    /* The shop, with the thing it is for drawn on it: two bars of different
       heights. Without the mark it is just a shop, and the button does not
       open a shop — it opens a comparison between them. */
    shopCompare: '<path d="M3.4 8.6 5 4.2h14L20.6 8.6"/><path d="M2.8 8.6h18.4"/><path d="M4.6 8.6v11.2h14.8V8.6"/><path d="M9 17.4v-3.6M12 17.4v-5.8M15 17.4v-2.2"/>',
    /* A list with things ticked off it. Deliberately not the shopping list's
       icon — the two tabs sit side by side and must not read as one. */
    checklist: '<path d="M3.2 6.4 4.9 8.1 8 5"/><path d="M3.2 12.4 4.9 14.1 8 11"/><path d="M3.2 18.4 4.9 20.1 8 17"/><path d="M11 6.6h9.8M11 12.6h9.8M11 18.6h6.4"/>',
    calendar:  '<rect x="3" y="5" width="18" height="16" rx="2.4"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    /* 暦をしまっているとき。同じ暦に斜線を一本だけ足します——「無い」のでは
       なく「いまは出していない」なので、形そのものは変えません。 */
    "calendar-off": '<rect x="3" y="5" width="18" height="16" rx="2.4"/>'
      + '<path d="M3 10h18M8 3v4M16 3v4"/><path d="M4.4 21 19.6 4.4"/>',
    repeat:    '<path d="M4 9.4V8a3 3 0 0 1 3-3h11"/><path d="m15 2 3 3-3 3"/><path d="M20 14.6V16a3 3 0 0 1-3 3H6"/><path d="m9 22-3-3 3-3"/>',
    flag:      '<path d="M5 21V4"/><path d="M5 4.6h11.6l-2 3.6 2 3.6H5"/>',
    /* 開いた本。閉じた本（ただの角丸四角）は値札と同じ形になるので、中央の谷と
       左右の頁で「開いている」と言います。 */
    book:      '<path d="M12 6.8v13"/><path d="M12 6.8C10.2 5.4 7.9 4.8 5 4.8a1 1 0 0 0-1 1v11.4a1 1 0 0 0 1 1c2.9 0 5.2.6 7 2"/><path d="M12 6.8c1.8-1.4 4.1-2 7-2a1 1 0 0 1 1 1v11.4a1 1 0 0 1-1 1c-2.9 0-5.2.6-7 2"/>',
    /* 芽。まだ何にもなっていないものの印なので、花も実も付けません。左右の葉を
       わざと非対称にしてあります——対称にすると蝶に見えます。 */
    sprout:    '<path d="M12 20.6v-7.4"/><path d="M12 13.2C12 9.9 9.7 7.6 6.4 7.6c0 3.3 2.3 5.6 5.6 5.6Z"/><path d="M12.7 12.5c0-2.7 1.9-4.6 4.6-4.6.4 2.9-1.5 5-4.6 4.6Z"/>',
    /* 論文・書類。本と混ざらないよう、閉じた一枚の紙に角の折れと横線三本で
       「文字が詰まった一枚もの」と言います——本のような開いた谷はありません。 */
    paper:     '<path d="M6.4 2.6h8.4l5.2 5.2v13.6a1 1 0 0 1-1 1H6.4a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1Z"/><path d="M14.8 2.6v4.6a1 1 0 0 0 1 1h4.6"/><path d="M8.2 13h7.6M8.2 16.6h7.6M8.2 9.4h4"/>',
    /* いちばん安いお店の印。ここは 🏆 の絵文字でした——端末が描くもので、
       iOS と Android で別の絵が出ますし、このアプリの線でも色でもありません。
       山は三つ。二つだと王冠に見えず、四つだと15pxで潰れます。 */
    crown:     '<path d="M4.2 7.8 8 11.5 12 5.2l4 6.3 3.8-3.7-1.5 10.6H5.7Z"/>'
             + '<path d="M5.9 15.2h12.2"/>',

    /* ダイエット。体重計は「四角い台と、真ん中の目盛り窓」——秤の絵にすると
       買い物の 天びん と紛れるので、乗るほうの秤にしてあります。 */
    scale:     '<rect x="2.8" y="4.4" width="18.4" height="15.2" rx="3"/><path d="M12 8.2a4.6 4.6 0 0 0-4.35 3.1h8.7A4.6 4.6 0 0 0 12 8.2Z"/><path d="M12 11.3 14.2 9"/><path d="M8.6 15.6h6.8"/>',
    flame:     '<path d="M12 2.6s5.2 4.3 5.2 9.1a5.2 5.2 0 0 1-10.4 0C6.8 9.4 8.4 7.6 9.4 6.4c.3 1.5 1 2.4 1.9 2.9.9-1.5.9-4.6.7-6.7Z"/><path d="M12 21.4a2.6 2.6 0 0 0 2.6-2.6c0-1.5-1.6-2.6-2.6-4-1 1.4-2.6 2.5-2.6 4a2.6 2.6 0 0 0 2.6 2.6Z"/>',
    steps:     '<path d="M7.2 3.4c1.6 0 2.6 1.3 2.6 3 0 1.4-.5 2.6-.5 3.8 0 1.1.6 1.7.6 2.7 0 1.3-1.1 2.1-2.7 2.1s-2.7-.8-2.7-2.1c0-1 .6-1.6.6-2.7 0-1.2-.5-2.4-.5-3.8 0-1.7 1-3 2.6-3Z"/><path d="M4.6 17.4c0 1.7 1.1 3.2 2.6 3.2s2.6-1.5 2.6-3.2"/><path d="M16.8 6.6c1.6 0 2.6 1.3 2.6 3 0 1.4-.5 2.6-.5 3.8 0 1.1.6 1.7.6 2.7 0 1.3-1.1 2.1-2.7 2.1s-2.7-.8-2.7-2.1c0-1 .6-1.6.6-2.7 0-1.2-.5-2.4-.5-3.8 0-1.7 1-3 2.6-3Z"/>',
    moon:      '<path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z"/>',
    meal:      '<path d="M6.2 2.8v7.4a2.2 2.2 0 0 0 4.4 0V2.8"/><path d="M8.4 10.2V21.2"/><path d="M16.6 21.2V13.6c-1.6 0-2.4-1-2.4-3.4 0-4 1.2-6.4 3.2-7.4 1.6.9 2.4 3.4 2.4 7.4 0 2.4-.8 3.4-2.4 3.4v7.6"/>',
    camera:    '<path d="M3.4 8.4a2 2 0 0 1 2-2h1.9l1.3-2.2h6.8l1.3 2.2h1.9a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.6" r="3.6"/>',
    chart:     '<path d="M3.4 20.6h17.2"/><path d="M4.4 16.2 9 10.8l3.6 3.2 6.4-7.4"/><circle cx="9" cy="10.8" r="1.3"/><circle cx="12.6" cy="14" r="1.3"/>',
    heart:     '<path d="M12 20.4S3.4 15.2 3.4 9.2A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.6 2.4c0 6-8.6 11.2-8.6 11.2Z"/>',

    /* ダイエットの画面のための絵。数字だけが並ぶ画面は、読むまで何の数か
       分からず、探すたびに全部読み直すことになります。絵があると、目は
       文字より先にそれを拾います。線の太さも角の丸みも、上のものに揃えて
       あります——同じ画面に二つの絵柄が混ざるほうが、絵が無いより読みにくい。 */
    route:     '<path d="M9.2 3.4 6.4 20.6"/><path d="M14.8 3.4l2.8 17.2"/>'
             + '<path d="M12 5v2.4"/><path d="M12 10.8v2.4"/><path d="M12 16.6v2.4"/>',
    bed:       '<path d="M3.6 19.4V7.4"/>'
             + '<path d="M3.6 12.4h13a3.8 3.8 0 0 1 3.8 3.8v3.2"/>'
             + '<circle cx="8.2" cy="9.4" r="1.9"/>',
    sunrise:   '<path d="M12 3.2v2.6"/><path d="M5.7 7.5 7.5 9.3"/><path d="M18.3 7.5 16.5 9.3"/>'
             + '<path d="M3.2 17.6h17.6"/><path d="M7 17.6a5 5 0 0 1 10 0"/>'
             + '<path d="M5.6 20.8h12.8"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2"/><path d="M12 18.8V21"/>'
             + '<path d="M3 12h2.2"/><path d="M18.8 12H21"/><path d="M5.6 5.6 7.2 7.2"/>'
             + '<path d="M16.8 16.8l1.6 1.6"/><path d="M18.4 5.6 16.8 7.2"/><path d="M7.2 16.8 5.6 18.4"/>',
    /* 間食。りんごを描いてみましたが、15pxまで縮めるとハートに見え、
       同じ画面の心拍数と見分けが付きませんでした。点の入った丸なら、
       小さくしても何かの粒であることは残ります。 */
    snack:     '<circle cx="12" cy="12" r="8.4"/><circle cx="9.4" cy="10.4" r="1"/>'
             + '<circle cx="14.4" cy="11.4" r="1"/><circle cx="11.4" cy="15.2" r="1"/>',
    target:    '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/>',
    trend:     '<path d="M3.6 16.6 9 11.2l3.4 3.4 7-7"/><path d="M14.6 7.6h4.8v4.8"/>',
    /* 下がる向き。trend を上下に返しただけ——同じ形の裏表であることが、
       「上がった／下がった」を並べたときにいちばん速く読めます。 */
    trendDown: '<path d="M3.6 7.4 9 12.8l3.4-3.4 7 7"/><path d="M14.6 16.4h4.8v-4.8"/>',
    drop:      '<path d="M12 3.2s6 6.3 6 10.2a6 6 0 0 1-12 0c0-3.9 6-10.2 6-10.2Z"/>',
    clock:     '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 1.9"/>',
    /* 「ほかの操作」。たまに、一度だけ使うものの入口（★・削除）。 */
    more:      '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/>'
             + '<circle cx="19" cy="12" r="1.6"/>',
    /* 絵を選ぶ。頭の粒に付く小さな丸。 */
    palette:   '<path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h1.6a4.6 4.6 0 0 0 4.6-4.6c0-4-3.9-7.2-8.8-7.2Z"/>'
             + '<circle cx="7.6" cy="11.4" r="1.1"/><circle cx="10.4" cy="7.4" r="1.1"/>'
             + '<circle cx="15.2" cy="8.2" r="1.1"/>',
    /* お知らせの鈴。詳細の紙の「お知らせ」の行に使います。 */
    bell:      '<path d="M18 9a6 6 0 1 0-12 0c0 4.6-1.6 6-1.6 6h15.2S18 13.6 18 9Z"/>'
             + '<path d="M13.7 19a2 2 0 0 1-3.4 0"/>',
    /* お酒。ジョッキ。持ち手があると、コップやバケツと間違えません。 */
    drink:     '<path d="M6.2 4.6h9.2v13.2a2 2 0 0 1-2 2H8.2a2 2 0 0 1-2-2Z"/>'
             + '<path d="M15.4 7.6h2.2a2.4 2.4 0 0 1 0 4.8h-2.2"/>'
             + '<path d="M6.2 9.2h9.2"/>',
  };

  /* ---------- 塗りの絵 ----------

     線だけの絵ばかりが並ぶと、どれも同じ重さになります。「いまここに居る」
     のように面で言うべきことまで、細い線で言っていました。

     塗るのは、いま居るタブの四つだけです。ここが画面のなかで唯一「一つに
     決まっているもの」で、面にする値打ちがあります。★や旗のような閉じた
     形は、線の絵をそのまま塗れば済むので（.fav.is-on がやっています）
     ここには要りません——**線でできていて塗る形が無い絵**だけを、
     塗り用に描き起こします。

     形は線の絵と同じ座標に置きます。切り替わるときに絵が動いてはいけない
     ので、太さだけが変わって見えるように。 */
  const ICON_SOLID = {
    list: '<rect x="8" y="4.8" width="13" height="2.4" rx="1.2"/>'
        + '<rect x="8" y="10.8" width="13" height="2.4" rx="1.2"/>'
        + '<rect x="8" y="16.8" width="13" height="2.4" rx="1.2"/>'
        + '<circle cx="3.5" cy="6" r="2"/><circle cx="3.5" cy="12" r="2"/><circle cx="3.5" cy="18" r="2"/>',
    /* ✓ は塗る形を持たないので、線のまま太らせます。同じ絵のなかで
       塗りと線が混ざりますが、見えるのは「濃くなった」ことだけです。 */
    checklist: '<path d="M3.2 6.4 4.9 8.1 8 5M3.2 12.4 4.9 14.1 8 11M3.2 18.4 4.9 20.1 8 17"'
        + ' fill="none" stroke="currentColor" stroke-width="2.6"/>'
        + '<rect x="11" y="5.4" width="9.8" height="2.4" rx="1.2"/>'
        + '<rect x="11" y="11.4" width="9.8" height="2.4" rx="1.2"/>'
        + '<rect x="11" y="17.4" width="6.4" height="2.4" rx="1.2"/>',
    /* 穴は evenodd で抜きます（地の色を上に塗ると、暗い画面で穴だけ
       白く残ります）。 */
    tag: '<path fill-rule="evenodd" d="M11.6 2.6H4.4A1.8 1.8 0 0 0 2.6 4.4v7.2a1.8 1.8 0 0 0 .53 1.27l8 8'
        + 'a1.8 1.8 0 0 0 2.54 0l7.2-7.2a1.8 1.8 0 0 0 0-2.54l-8-8A1.8 1.8 0 0 0 11.6 2.6Z'
        + 'M7.2 8.7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/>',
    scale: '<path fill-rule="evenodd" d="M5.8 4.4h12.4a3 3 0 0 1 3 3v9.2a3 3 0 0 1-3 3H5.8a3 3 0 0 1-3-3V7.4'
        + 'a3 3 0 0 1 3-3Zm6.2 3.8a4.6 4.6 0 0 0-4.35 3.1h8.7A4.6 4.6 0 0 0 12 8.2Z'
        + 'm-3.4 6.6a1.1 1.1 0 0 0 0 2.2h6.8a1.1 1.1 0 0 0 0-2.2Z"/>',
    /* daily タブ。線の絵と同じ谷（中央の背）を持つ二枚の葉を、そのまま塗り
       つぶします——線のときと座標が動かないよう、同じ曲線を使っています。 */
    book: '<path d="M12 6.8C10.2 5.4 7.9 4.8 5 4.8a1 1 0 0 0-1 1v11.4a1 1 0 0 0 1 1c2.9 0 5.2.6 7 2Z"/>'
        + '<path d="M12 6.8c1.8-1.4 4.1-2 7-2a1 1 0 0 1 1 1v11.4a1 1 0 0 1-1 1c-2.9 0-5.2.6-7 2Z"/>',
  };

  /* 24 の升目に、線で描いた絵。太さは CSS（--ico-w）が決めます。 */
  const set = Object.create(null);
  Object.keys(ICON_PATHS).forEach((k) => {
    set[k] = { body: ICON_PATHS[k], mode: "stroke", viewBox: "0 0 24 24" };
    if (ICON_SOLID[k]) set[k].solid = ICON_SOLID[k];
  });
  KN.icons.register("legacy", set);
})();
