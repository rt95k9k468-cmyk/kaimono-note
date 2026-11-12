/* =========================================================
   くらしノート — daily の今日の一枚（F6 の D2・docs/daily.md「F6 の働き」）

   置き場はノートの画像と同じ入れ物（js/note-img.js の addPair：大きい一枚と小さい写し）と、利用者の Dropbox だけ。
   日の行が持つのは参照 `photo: {id, s}` だけ（store.setDayPhoto）。描き直して縮めるので EXIF は残らない。
   - 読むのは見えたものだけ（IntersectionObserver）。起動では読まない。日の並びは小さい写し、開いた日は大きい一枚。
   - 額の背は CSS が先に取る（跳ねない）。手元に無い（ほかの端末で付けた）なら額ごと隠す。
   - 日記の鍵が掛かっていれば出さない（呼ぶ側）。付ける・替える・外すは Daily Log の ⋯ から。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node } = KN.util;
  const store = KN.store;
  const I = () => KN.noteImg;

  /* 読んだ絵の object URL。大きい一枚は重いので、新しい順に少しだけ持つ。 */
  const urls = new Map();
  const CAP = 24;
  async function urlOf(id) {
    if (urls.has(id)) { const u = urls.get(id); urls.delete(id); urls.set(id, u); return u; }
    const rec = I() ? await I().ready().then(() => (I().state() === "on" ? I().get(id) : null)).catch(() => null) : null;
    if (!rec || !rec.bytes) return null;
    const u = URL.createObjectURL(new Blob([rec.bytes], { type: rec.type || "image/jpeg" }));
    urls.set(id, u);
    while (urls.size > CAP) { const [k, v] = urls.entries().next().value; urls.delete(k); URL.revokeObjectURL(v); }
    return u;
  }

  let io = null;
  const seen = () => io || (io = new IntersectionObserver((list) => list.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    fill(e.target);
  }), { rootMargin: "200px 0px" }));

  async function fill(el) {
    const u = await urlOf(el.dataset.id);
    if (!el.isConnected) return;
    if (!u) { el.hidden = true; return; }
    const im = new Image();
    im.alt = "";
    im.decoding = "async";
    im.onload = () => el.classList.add("is-on");
    im.src = u;
    el.append(im);
  }

  /** 日の行の一枚。small＝日の行の右の 72px（小さい写し）、でなければ本文の上の一枚。参照が無ければ null。 */
  function frame(d, small) {
    const p = store.photoOf(d);
    if (!p) return null;
    const el = node(html`<button type="button" class="nv-img arc-photo ${small ? "is-s" : ""}" data-id="${small ? p.s : p.id}" aria-label="この日の一枚"></button>`);
    el.addEventListener("click", (e) => { e.stopPropagation(); view(p.id); });
    seen().observe(el);
    return el;
  }

  /** 黒地の一枚で全体を（ノートの画像と同じ紙）。 */
  function view(id) {
    urlOf(id).then((u) => {
      if (!u) return;
      const h = KN.ui.sheet({ title: "", content: node(html`<div class="note-pic"><img alt="" src="${u}"></div>`), cls: "is-pic", pull: () => true });
      h.el.setAttribute("aria-label", "この日の一枚");
    });
  }

  /** 選ぶ（押した流れのまま。iOS は写真かカメラを選ばせる）。 */
  function pick(day) {
    const input = node(html`<input type="file" accept="image/*" hidden>`);
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      I().addPair(f).then((ref) => {
        store.setDayPhoto(day, ref);
        KN.motion.fire("select");
      }, () => KN.ui.toast("画像を保存できませんでした"));
    });
    document.body.append(input);
    input.click();
  }

  /** Daily Log の ⋯ の中身（入れ物が使えない端末では空）。 */
  function items(day) {
    if (!I() || I().state() === "off") return [];
    const has = !!store.photoOf(store.dayLog(day));
    return [
      { icon: "image", label: has ? "一枚を替える" : "一枚を選ぶ", onPick: () => pick(day) },
      has ? { icon: "trash", label: "一枚を外す", danger: true, onPick: () => store.setDayPhoto(day, null) } : null,
    ].filter(Boolean);
  }

  KN.dayPhoto = { frame, view, pick, items };
})();
