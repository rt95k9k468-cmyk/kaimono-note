/* js/holiday.js — 日本の祝日（docs/roadmap-3.1.md の K1）
 *
 * 暦のマスを日曜と同じ色にし、daily の季節のひとことに名前を一行出すための部品です。
 *
 * **ここは純粋な部品です。** DOM も store も触らず、通信もしません。日（`dayKey`
 * の "YYYY-MM-DD"、端末の暦）を受け取って、その日の祝日の名前を返すだけ（無ければ null）。
 *
 * - 祝日の表を取りに行かず、**国民の祝日に関する法律の決まりから計算**します。春分の日・
 *   秋分の日は、太陽の黄経が0度・180度を越える日（暦要項と同じ定め方。js/season.js の
 *   `crosses`——節気の初日と同じ境目なので、「二十四節気　春分」と食い違わない）。
 * - 振替休日（2007年から：祝日が日曜なら、そのあとの祝日でない日。2006年までは翌日）と、
 *   国民の休日（前の日と次の日が祝日の日。2006年までは日曜と振替休日を除く）も出します。
 * - 2019〜2021年の特例（即位・五輪の移動）は小さな表で持ちます。**2000年より前は出しません**
 *   （ハッピーマンデーより前で決まりが違う。そこまで戻って暦を見ることはまず無い）。
 * - 先の年は今の法のまま。法が変わったら、ここを直します（内閣府は翌年の祝日を毎年2月に載せる）。
 * - 祝日は休みとは限らないので、くり返しの用事は動かしません。出すのは名前と暦の色だけ。
 */
(function () {
  const KN = (window.KN = window.KN || {});

  const pad = (n) => String(n).padStart(2, "0");
  /* その年月日の "YYYY-MM-DD"（日があふれたら次の月へ繰り上がる）。 */
  const keyOf = (y, m, d) => {
    const t = new Date(y, m - 1, d);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };
  const dateOf = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const next = (k) => { const d = dateOf(k); return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate() + 1); };
  /** その月の第 n 月曜の日（m は 1〜12）。 */
  const nthMonday = (y, m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + 7 * (n - 1);

  /* その年だけの祝日（特例法）。 */
  const EXTRA = {
    2019: [[5, 1, "天皇の即位の日"], [10, 22, "即位礼正殿の儀"]],
  };
  /* 五輪の年は、海の日・スポーツの日・山の日が動いた（特別措置法）。 */
  const MOVED = {
    2020: { umi: [7, 23], sports: [7, 24], yama: [8, 10] },
    2021: { umi: [7, 22], sports: [7, 23], yama: [8, 8] },
  };

  /** 春分の日・秋分の日：m 月 from 日からの4日のうち、黄経が deg 度を越える日。 */
  function equinox(y, m, from, deg) {
    for (let d = from; d < from + 4; d++) if (KN.season.crosses(keyOf(y, m, d), deg)) return d;
    return null;
  }

  const cache = new Map();

  /**
   * その年の祝日。日付の順の Map（"YYYY-MM-DD" → 名前）。
   * @param {number} y 西暦
   */
  function year(y) {
    y = Number(y);
    if (cache.has(y)) return cache.get(y);
    if (!Number.isInteger(y) || y < 2000 || !KN.season || !KN.season.crosses) return new Map();

    const law = new Map();   // 国民の祝日（振替休日・国民の休日を決めるもと）
    const put = (m, d, name) => { if (m && d) law.set(keyOf(y, m, d), name); };
    const mv = MOVED[y] || {};
    const at = (pair, m, d, name) => (pair ? put(pair[0], pair[1], name) : put(m, d, name));

    put(1, 1, "元日");
    put(1, nthMonday(y, 1, 2), "成人の日");
    put(2, 11, "建国記念の日");
    if (y >= 2020) put(2, 23, "天皇誕生日");
    else if (y <= 2018) put(12, 23, "天皇誕生日");
    put(3, equinox(y, 3, 19, 0), "春分の日");
    put(4, 29, y >= 2007 ? "昭和の日" : "みどりの日");
    put(5, 3, "憲法記念日");
    if (y >= 2007) put(5, 4, "みどりの日");
    put(5, 5, "こどもの日");
    at(mv.umi, 7, y >= 2003 ? nthMonday(y, 7, 3) : 20, "海の日");
    if (y >= 2016) at(mv.yama, 8, 11, "山の日");
    put(9, y >= 2003 ? nthMonday(y, 9, 3) : 15, "敬老の日");
    put(9, equinox(y, 9, 21, 180), "秋分の日");
    at(mv.sports, 10, nthMonday(y, 10, 2), y >= 2020 ? "スポーツの日" : "体育の日");
    put(11, 3, "文化の日");
    put(11, 23, "勤労感謝の日");
    (EXTRA[y] || []).forEach(([m, d, name]) => put(m, d, name));

    const all = new Map(law);
    const days = [...law.keys()].sort();
    /* 振替休日：祝日が日曜なら、そのあとの最初の祝日でない日（2006年までは翌日だけ）。 */
    days.forEach((k) => {
      if (dateOf(k).getDay() !== 0) return;
      let n = next(k);
      if (y >= 2007) while (law.has(n)) n = next(n);
      if (!all.has(n)) all.set(n, "振替休日");
    });
    /* 国民の休日：前の日と次の日が祝日で、その日は祝日でない（2006年までは日曜と振替休日を除く）。 */
    days.forEach((k) => {
      const mid = next(k);
      if (law.has(mid) || !law.has(next(mid)) || all.has(mid)) return;
      if (y < 2007 && dateOf(mid).getDay() === 0) return;
      all.set(mid, "国民の休日");
    });

    const out = new Map([...all].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    cache.set(y, out);
    return out;
  }

  /** その日の祝日の名前（無ければ null）。@param {string} day "YYYY-MM-DD" */
  function of(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    return m ? year(+m[1]).get(day) || null : null;
  }

  KN.holiday = { of, year };
})();
