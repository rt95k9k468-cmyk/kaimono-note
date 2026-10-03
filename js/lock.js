/* =========================================================
   くらしノート — daily とノートの鍵

   **表で弾くだけの鍵です。中身は暗号にしません。** 端末を手に取った人が
   daily とノートを開けないようにするもので、記録そのもの（localStorage・
   バックアップ・日記の写し）には一切触れません。だから鍵をなくしても、
   消えるものはありません。

   - 開けかたは二つ。**パスコード**（数字。必ずある）と、この端末の
     **Face ID / Touch ID / Windows Hello**（WebAuthn。あれば）。
   - パスコードは PBKDF2 で崩した形だけを `settings.lock` に置きます。
     設定なので、バックアップに乗って別の端末へも行きます。
   - Face ID の鍵は**端末ごと**なので state に置かず、この端末の
     localStorage（`DEV_KEY`）にだけ置きます。バックアップには乗りません。
   - 裏へ回ったらすぐ閉じます（`visibilitychange` / `pagehide`）。
     立ち上げたときも閉じたところから。
   - 覆いは daily・ノートと、そこから潜った設定の上にだけ出します。
     ほかのタブへは覆いの上の絵（tasks）から移れます。
   - 全体の検索は、閉じているあいだ daily とノートを探しません
     （search-all.js の `hides`）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;

  const GUARDED = ["archive", "notes"];
  const SEARCH_PLACES = ["daily", "notes"];
  const DEV_KEY = "kaimono-note-lock-dev";
  const ITER = 100000;

  let locked = true;
  let tried = false;
  let veil = null;
  let typed = "";
  let busy = false;
  let here = null;

  /* ---------------- 鍵の形 ---------------- */

  const supported = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
  function conf() {
    const l = KN.store.get().settings.lock;
    return l && typeof l === "object" && typeof l.hash === "string" && l.hash ? l : null;
  }
  /* 崩す道具（crypto.subtle）が無い所では確かめられないので、閉じません
     ——閉じたまま開けなくなるより、表の鍵が効かないほうを取ります。 */
  const enabled = () => supported() && !!conf();

  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function derive(code, salt, iter) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: b64d(salt), iterations: iter }, key, 256);
    return b64(new Uint8Array(bits));
  }

  async function check(code) {
    const c = conf();
    if (!c) return true;
    try { return (await derive(code, c.salt, c.iter || ITER)) === c.hash; }
    catch (err) { return false; }
  }

  async function setCode(code) {
    const salt = b64(rnd(16));
    const hash = await derive(code, salt, ITER);
    KN.store.update((s) => { s.settings.lock = { hash, salt, iter: ITER, len: code.length }; });
  }

  /* ---------------- Face ID（この端末だけ） ---------------- */

  function devId() {
    try { return localStorage.getItem(DEV_KEY) || ""; } catch (err) { return ""; }
  }

  async function bioAvailable() {
    try {
      return !!(window.PublicKeyCredential && navigator.credentials &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (err) { return false; }
  }

  async function enroll() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rnd(32),
      rp: { name: "くらしノート" },
      user: { id: rnd(16), name: "くらしノート", displayName: "くらしノート" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      attestation: "none",
      timeout: 60000,
    } });
    if (!cred) return false;
    try { localStorage.setItem(DEV_KEY, b64(new Uint8Array(cred.rawId))); } catch (err) { return false; }
    return true;
  }

  function forget() {
    try { localStorage.removeItem(DEV_KEY); } catch (err) { /* 鍵を外すことを妨げない */ }
  }

  /* 本人の確かめ（UV、authenticatorData の 33 バイトめの 0x04）が立って
     いるときだけ通します。 */
  async function bio() {
    const id = devId();
    if (!id || busy) return false;
    busy = true;
    try {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: rnd(32),
        allowCredentials: [{ type: "public-key", id: b64d(id) }],
        userVerification: "required",
        timeout: 60000,
      } });
      const data = a && a.response && new Uint8Array(a.response.authenticatorData);
      return !!(data && data.length > 32 && (data[32] & 0x04));
    } catch (err) { return false; }
    finally { busy = false; }
  }

  /* ---------------- 覆い ---------------- */

  function build() {
    veil = node(html`
      <div class="lock-veil" role="dialog" aria-modal="true" aria-label="ロック" hidden>
        <button type="button" class="lock-away" aria-label="tasks へ">${icon("checklist")}</button>
        <div class="lock-ico">${icon("lock")}</div>
        <div class="lock-dots" aria-hidden="true"></div>
        <div class="lock-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" class="lock-key" data-k="${n}">${n}</button>`)}
          <button type="button" class="lock-key is-bio" aria-label="Face ID">${icon("face-id")}</button>
          <button type="button" class="lock-key" data-k="0">0</button>
          <button type="button" class="lock-key is-back" aria-label="1文字消す">${icon("backspace")}</button>
        </div>
      </div>
    `);
    veil.querySelectorAll("[data-k]").forEach((b) =>
      b.addEventListener("click", () => press(b.dataset.k)));
    veil.querySelector(".is-back").addEventListener("click", () => { typed = typed.slice(0, -1); dots(); });
    veil.querySelector(".is-bio").addEventListener("click", tryBio);
    veil.querySelector(".lock-away").addEventListener("click", () => KN.app.showScreen("todo"));
    document.addEventListener("keydown", (e) => {
      if (!veil || veil.hidden) return;
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === "Backspace") { typed = typed.slice(0, -1); dots(); e.preventDefault(); }
    });
    document.body.appendChild(veil);
  }

  function dots() {
    if (!veil) return;
    const c = conf();
    const n = Math.max(c && c.len ? c.len : 4, typed.length);
    veil.querySelector(".lock-dots").innerHTML =
      Array.from({ length: n }, (_, i) => `<span class="lock-dot${i < typed.length ? " is-on" : ""}"></span>`).join("");
    veil.querySelector(".is-bio").hidden = !devId();
  }

  async function press(k) {
    const c = conf();
    if (!c || typed.length >= 12) return;
    typed += k;
    dots();
    if (typed.length < (c.len || 4)) return;
    const ok = await check(typed);
    if (ok) { unlock(); return; }
    typed = "";
    haptic && haptic();
    const d = veil.querySelector(".lock-dots");
    d.classList.remove("is-wrong");
    void d.offsetWidth;
    d.classList.add("is-wrong");
    dots();
  }

  /* 一度出したら、閉じるまでは自分から出し直しません（顔の絵を押せば出る）。
     ただし一瞬で断られたとき（＝iOS が出さなかった）は、出したうちに数えません。 */
  async function tryBio() {
    if (busy) return;
    tried = true;
    const t0 = Date.now();
    if (await bio()) { unlock(); return; }
    if (Date.now() - t0 < 300) tried = false;
  }

  function unlock() {
    locked = false;
    typed = "";
    paint();
  }

  function guards(id) {
    if (GUARDED.includes(id)) return true;
    return id === "settings" && KN.app.openedFrom && GUARDED.includes(KN.app.openedFrom());
  }

  /** 覆いを出す・しまう。`id` はいま出ている画面（省けば app に聞く）。 */
  function paint(id) {
    here = id || (KN.app.activeScreen ? KN.app.activeScreen() : here);
    const on = enabled() && locked && guards(here);
    if (on && !veil) build();
    if (!veil) return;
    if (on && veil.hidden) { typed = ""; dots(); }
    veil.hidden = !on;
    document.documentElement.classList.toggle("is-locked", on);
  }

  /** タブを押して daily へ来たとき。押した一拍のうちなので、Face ID を
      そのまま呼べます（ブラウザの「操作のうちに」）。 */
  function enter(id) {
    paint(id);
    if (veil && !veil.hidden && devId()) tryBio();
  }

  function close() {
    if (!enabled()) return;
    locked = true;
    tried = false;
    paint();
  }

  /* 開いたとき・表へ戻ったときも、パスコードで待たずに Face ID を自分から
     出します。閉じるたびに一度だけ（顔が合わなければパスコードか顔の絵で）。
     iOS が操作のうちでないと出さない版なら、ここは黙って何もしません。 */
  function autoBio() {
    if (tried || !veil || veil.hidden || !devId() || document.visibilityState !== "visible") return;
    tryBio();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") close();
    else autoBio();
  });
  window.addEventListener("pagehide", close);
  window.addEventListener("pageshow", autoBio);
  window.addEventListener("focus", autoBio);

  /* ---------------- 設定から ---------------- */

  async function askCode(title) {
    const v = await KN.ui.prompt({ title, label: "パスコード", inputMode: "numeric", secret: true, okLabel: "OK" });
    if (v == null) return null;
    const code = String(v).replace(/\D/g, "");
    if (code.length < 4 || code.length > 12) { KN.ui.toast("4〜12桁の数字で"); return null; }
    return code;
  }

  async function turnOn() {
    if (!supported()) return false;
    const a = await askCode("パスコード");
    if (!a) return false;
    const b = await askCode("もう一度");
    if (b == null) return false;
    if (a !== b) { KN.ui.toast("合いませんでした"); return false; }
    await setCode(a);
    locked = false;
    return true;
  }

  async function verify() {
    const v = await askCode("いまのパスコード");
    if (v == null) return false;
    if (await check(v)) return true;
    KN.ui.toast("違います");
    return false;
  }

  async function turnOff() {
    if (!(await verify())) return false;
    KN.store.update((s) => { delete s.settings.lock; });
    forget();
    return true;
  }

  async function changeCode() {
    if (!(await verify())) return false;
    const a = await askCode("新しいパスコード");
    if (!a) return false;
    const b = await askCode("もう一度");
    if (a !== b) { if (b != null) KN.ui.toast("合いませんでした"); return false; }
    await setCode(a);
    return true;
  }

  async function bioOn() {
    try { return await enroll(); }
    catch (err) { KN.ui.toast("登録できませんでした"); return false; }
  }

  KN.lock = {
    supported, enabled, bioAvailable, hasBio: () => !!devId(),
    turnOn, turnOff, changeCode, bioOn, bioOff: forget,
    paint, enter, close,
    isLocked: () => enabled() && locked,
    /** 全体の検索が、その場所を探してよいか。 */
    hides: (place) => enabled() && locked && SEARCH_PLACES.includes(place),
  };
})();
