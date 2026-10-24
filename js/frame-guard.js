/* よその頁の枠（iframe）の中では見せない（セキュリティ S3、docs/dev.md「外との口の守り」）。

   枠に入れたアプリは、この origin の記録をそのまま持って動く。上に透明な絵を重ねれば、
   「全部消す」のような所を、知らずに押させられる。meta の CSP では frame-ancestors が効かず、
   GitHub Pages ではヘッダも足せないので、ここで止める。いちばん先に読む。
   1ファイル版（KN_STANDALONE）は、置いた先の枠の中で開く使い方があるので止めない。 */
(function () {
  "use strict";
  let framed;
  try { framed = window.top !== window.self; } catch (_) { framed = true; }
  if (framed && !window.KN_STANDALONE) document.documentElement.style.display = "none";
})();
