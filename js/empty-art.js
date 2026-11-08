/* =========================================================
   くらしノート — 空の画面の絵

   何も無い画面は、アプリを開いたばかりの人が最初に見る画面です。そこに
   絵文字を置いていました（🛒 ✅ 🏷️ ⚖️ 🏪）。絵文字は端末が描くもので、
   iOS と Android と Windows で別の絵が出ます。

   2026年11月8日、手描きの色つきの場面（icon-system.js の語彙）から、線だけ
   のセットの絵に替えました。UI の Phosphor Regular と同じ太さ（24升目で
   1.5）の線で、色は CSS が決めます（`.empty-art` の color）。

   借りた絵（MIT）
   ・basket / priceTag / notebook … IconOven（© 2026 Appic Marketing LLC）
     shopping-basket-full・price-tag・notebook-spiral
   ・donePad … andrsrxn/icons（andrsrxn）list-checklist
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const art = (body) =>
    `<svg class="empty-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ART = {
    /* 買うもの。中身の入ったかご——空の画面に空のかごを置くと、二度同じことを言うだけなので。 */
    basket: art('<circle cx="8" cy="7.25" r="2.75"/><rect width="3.5" height="7.25" x="13.25" y="2.75" rx="1.5"/>' +
      '<path d="M4.25 13h15.5a1 1 0 0 1 .97 1.24l-1.25 5.1a2.5 2.5 0 0 1-2.43 1.91H6.96a2.5 2.5 0 0 1-2.43-1.91l-1.25-5.1A1 1 0 0 1 4.25 13M9 15.25v3m3-3v3m3-3v3"/>'),

    /* やること。三行とも印の付いた一覧——「何も無い」ではなく「片づいた」。 */
    donePad: art('<path d="M21.38 6H10.34m11.04 6H10.34m11.04 6H10.34M2.65 6.1l.62.77c.36.44.54.66.78.66s.42-.22.77-.66L7 4.17M2.65 12.1l.62.77c.36.44.54.66.78.66s.42-.22.77-.66L7 10.17M2.65 18.1l.62.77c.36.44.54.66.78.66s.42-.22.77-.66L7 16.17"/>'),

    /* 価格。ぶら下げる値札。UI の tag（斜めの札）とぶつからない形を選んだ。 */
    priceTag: art('<path d="m6.85 6.6l4.4-3.6a1.2 1.2 0 0 1 1.5 0l4.4 3.6a2 2 0 0 1 .6 1.43v11.22a2 2 0 0 1-2 2h-7.5a2 2 0 0 1-2-2V8.03a2 2 0 0 1 .6-1.43"/>' +
      '<circle cx="12" cy="7.75" r="1.5"/><path d="M9.25 12.75h5.5m-5.5 3.5h3.5"/>'),

    /* daily の積み上げ。罫線だけの綴じ帳——何を書くかはその人が決めるので、絵のほうで名指ししない。 */
    notebook: art('<rect width="16.5" height="16" x="3.75" y="5.25" rx="2.5"/>' +
      '<path d="M7.5 2.75v4.5m3-4.5v4.5m3-4.5v4.5m3-4.5v4.5m-8.75 4.5h8.5m-8.5 4h5.5"/>'),
  };

  KN.emptyArt = ART;
})();
