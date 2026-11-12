/* =========================================================
   くらしノート — 天気の一行（F6 の D3・docs/daily.md「F6 の働き」）

   Open-Meteo（鍵なし）へ直に。場所は設定で一度選び、0.1度に丸めてこの端末だけに持つ
   （localStorage `kn-weather-place`。記録・控え・同期には入れない）。**場所を選ぶまでは取りに行かない。**
   送るのは丸めた緯度経度と日数だけ。daily を開いたとき、まだ無い日（過ぎた92日まで）と、前に取った日から
   後の日（その日はまだ途中だった）を一度で取り、日ごとに 天気の印・最高・最低 の三つを `kn-weather` に持つ。
   電波が無い・落ちたら何もしない（30分は取り直さない）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const PLACE_KEY = "kn-weather-place";
  const DATA_KEY = "kn-weather";
  const API = "https://api.open-meteo.com/v1/forecast";
  const PAST = 92;          // Open-Meteo の past_days の上限
  const RETRY = 30 * 60 * 1000;

  /* 都道府県庁のあたり（0.1度）。場所の許しを出さない人も選べるように。 */
  const PREFS = ("北海道 43.1 141.3,青森県 40.8 140.7,岩手県 39.7 141.2,宮城県 38.3 140.9,秋田県 39.7 140.1,山形県 38.2 140.4,"
    + "福島県 37.8 140.5,茨城県 36.3 140.4,栃木県 36.6 139.9,群馬県 36.4 139.1,埼玉県 35.9 139.6,千葉県 35.6 140.1,"
    + "東京都 35.7 139.7,神奈川県 35.4 139.6,新潟県 37.9 139.0,富山県 36.7 137.2,石川県 36.6 136.6,福井県 36.1 136.2,"
    + "山梨県 35.7 138.6,長野県 36.7 138.2,岐阜県 35.4 136.7,静岡県 35.0 138.4,愛知県 35.2 136.9,三重県 34.7 136.5,"
    + "滋賀県 35.0 135.9,京都府 35.0 135.8,大阪府 34.7 135.5,兵庫県 34.7 135.2,奈良県 34.7 135.8,和歌山県 34.2 135.2,"
    + "鳥取県 35.5 134.2,島根県 35.5 133.1,岡山県 34.7 133.9,広島県 34.4 132.5,山口県 34.2 131.5,徳島県 34.1 134.6,"
    + "香川県 34.3 134.0,愛媛県 33.8 132.8,高知県 33.6 133.5,福岡県 33.6 130.4,佐賀県 33.2 130.3,長崎県 32.7 129.9,"
    + "熊本県 32.8 130.7,大分県 33.2 131.6,宮崎県 31.9 131.4,鹿児島県 31.6 130.6,沖縄県 26.2 127.7")
    .split(",").map((s) => { const [name, lat, lon] = s.split(" "); return { name, lat: +lat, lon: +lon }; });

  const round = (n) => Math.round(Number(n) * 10) / 10;
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

  function place() {
    const p = readJSON(PLACE_KEY);
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: round(p.lat), lon: round(p.lon), name: String(p.name || "") } : null;
  }

  let data = null;   // { at: 取った日, d: { "YYYY-MM-DD": [印, 最高, 最低] } }
  const load = () => {
    if (data) return data;
    const v = readJSON(DATA_KEY);
    data = v && typeof v.d === "object" && v.d ? { at: String(v.at || ""), d: v.d } : { at: "", d: {} };
    return data;
  };

  /** 場所を決める（null で外す）。新しい場所は過ぎた92日を取り直す（それより前の日は残す）。 */
  function setPlace(p) {
    if (!p) { try { localStorage.removeItem(PLACE_KEY); } catch (_) { /* 何もしない */ } return; }
    writeJSON(PLACE_KEY, { lat: round(p.lat), lon: round(p.lon), name: String(p.name || "") });
    load().at = "";
    tried = 0;
    pull();
  }

  /** 今いる場所（押した流れで呼ぶ）。丸めてから持つ。 */
  function here() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("no geolocation")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: round(pos.coords.latitude), lon: round(pos.coords.longitude), name: "今いる場所" }),
        reject, { enableHighAccuracy: false, maximumAge: 3600000, timeout: 15000 });
    });
  }

  /* WMO の天気の番号 → 絵と読み。 */
  function kind(code) {
    if (code <= 1) return ["sun", "晴れ"];
    if (code === 2) return ["cloud-sun", "晴れ時々くもり"];
    if (code === 3) return ["cloud", "くもり"];
    if (code === 45 || code === 48) return ["cloud-fog", "霧"];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["cloud-snow", "雪"];
    if (code >= 95) return ["cloud-lightning", "雷"];
    return ["cloud-rain", "雨"];
  }

  /** その日の天気（場所を選んでいないときは出さない）。{ icon, label, max, min } か null。 */
  function of(day) {
    if (!place()) return null;
    const v = load().d[day];
    if (!Array.isArray(v) || v.length < 3 || !v.every(Number.isFinite)) return null;
    const [icon, label] = kind(v[0]);
    return { icon, label, max: v[1], min: v[2] };
  }

  /* 取りに行く日数：まだ無い日と、前に取った日から後の日（その日はまだ途中だった）。-1 なら行かない（一日一度まで）。 */
  function need(today) {
    const d = load();
    if (d.at === today) return -1;
    for (let i = PAST; i >= 0; i--) {
      const k = U.shiftDay(today, -i);
      if (!d.d[k] || !d.at || k >= d.at) return i;
    }
    return -1;
  }

  let tried = 0;
  let busy = false;
  /** 開いたとき。行ったら true の約束。 */
  async function pull() {
    const p = place();
    if (!p || busy || navigator.onLine === false || Date.now() - tried < RETRY) return false;
    const today = U.todayKey();
    const n = need(today);
    if (n < 0) return false;
    busy = true;
    tried = Date.now();
    try {
      const q = `latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min`
        + `&timezone=auto&past_days=${n}&forecast_days=1`;
      const res = await fetch(`${API}?${q}`, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (!res.ok) return false;
      const j = await res.json();
      const dl = j && j.daily;
      if (!dl || !Array.isArray(dl.time)) return false;
      const d = load();
      dl.time.forEach((k, i) => {
        const v = [dl.weather_code[i], dl.temperature_2m_max[i], dl.temperature_2m_min[i]].map((x) => (x == null ? NaN : Math.round(x)));
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v.every(Number.isFinite)) d.d[k] = v;
      });
      d.at = today;
      writeJSON(DATA_KEY, d);
      const s = KN.screens && KN.screens.archive;
      if (s && KN.app && KN.app.activeScreen && KN.app.activeScreen() === "archive") s.render();
      return true;
    } catch (_) {
      return false;   // 電波が無い・断られた：何もしない
    } finally {
      busy = false;
    }
  }

  /* 裏から戻ったとき（日をまたいで開き直す人のため）。daily が出ているときだけ。 */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && KN.app && KN.app.activeScreen && KN.app.activeScreen() === "archive") pull();
  });

  KN.weather = { place, setPlace, here, of, pull, PREFS };
})();
