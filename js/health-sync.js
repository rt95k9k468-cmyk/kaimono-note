/* =========================================================
   くらしノート — ヘルスケアの取り込み
   =========================================================

   WebアプリからHealthKitは読めません。読めるふりもしません。
   代わりに、iPhoneの「ショートカット」に読ませて、その結果をここで受けます。

   受け口はひとつの関数 importText() です。渡ってくるのは次の二つのどちらか。

   ① かんたん書式（ショートカットで手で組むならこちら）

        くらしノート健康データ v1
        day=2026-08-15
        steps=8432
        distance=6.1km
        activeEnergy=430
        sleep=7:12
        weight=68.4
        bodyFat=21.3
        workout=ウォーキング,42,210

      「key=value を並べただけ」なのには理由があります。ショートカットの
      なかでJSONを組み立てるのは、配列とテキスト結合の格闘になります。
      テキスト1個に変数を差し込むだけなら、誰でも10分で作れます。

   ② JSON（別のアプリや、あとで作るネイティブ側から送るならこちら）

        { "app":"kurashi-note-health", "version":1,
          "samples":[ {"type":"steps","day":"2026-08-14","value":8432}, … ] }

   どちらで来ても、入る先と重複の弾き方は同じです。

   空の値は **入れません**。ショートカットは、その日のデータが無いとき
   空文字を差し込みます。それを 0 として保存すると、「その日は一歩も
   歩かなかった」という記録が静かに出来上がります。無かったものは無かった
   ままにしておきます。 */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const store = KN.store;

  const HEADER = /くらしノート|kurashi-?note/i;

  /* 受け取る名前と、内側の名前の対応。ショートカットの日本語名でも、
     HealthKitの識別子でも通るようにしてあります——どちらで書くかは
     作る人が決めることで、こちらが決めることではありません。 */
  const KEY_MAP = {
    steps: "steps", 歩数: "steps", stepcount: "steps", hkquantitytypeidentifierstepcount: "steps",
    distance: "distance", 距離: "distance", 歩行距離: "distance",
    distancewalkingrunning: "distance", hkquantitytypeidentifierdistancewalkingrunning: "distance",
    activeenergy: "activeEnergy", アクティブエネルギー: "activeEnergy", 活動エネルギー: "activeEnergy",
    activeenergyburned: "activeEnergy", hkquantitytypeidentifieractiveenergyburned: "activeEnergy",
    restingenergy: "restingEnergy", 安静時エネルギー: "restingEnergy", basalenergy: "restingEnergy",
    basalenergyburned: "restingEnergy", hkquantitytypeidentifierbasalenergyburned: "restingEnergy",
    sleep: "sleep", 睡眠: "sleep", sleepanalysis: "sleep", 睡眠時間: "sleep",
    weight: "weight", 体重: "weight", bodymass: "weight", hkquantitytypeidentifierbodymass: "weight",
    bodyfat: "bodyFat", 体脂肪: "bodyFat", 体脂肪率: "bodyFat", bodyfatpercentage: "bodyFat",
    heartrate: "heartRate", 心拍数: "heartRate", 心拍: "heartRate",
    workout: "workout", ワークアウト: "workout", 運動: "workout",
    day: "day", 日付: "day", date: "day",
    time: "time", 時刻: "time",
    source: "source", ソース: "source",
  };

  const normKey = (k) => KEY_MAP[String(k || "").trim().toLowerCase().replace(/[\s_-]/g, "")] || null;

  /* ---------------- 値の読み方 ---------------- */

  /** 「8,432」「8432歩」「6.1km」→ 数。読めなければ null。 */
  function toNum(raw) {
    if (raw == null) return null;
    const s = String(raw).replace(/[０-９．]/g, (c) => "0123456789."["０１２３４５６７８９．".indexOf(c)])
      .replace(/,/g, "").trim();
    if (!s) return null;
    const m = /-?\d+(\.\d+)?/.exec(s);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  /** 睡眠は「412」「7:12」「7時間12分」「7h12m」のどれで来ても分に直します。 */
  function toMinutes(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return null;
    let m = /^(\d+)\s*[:：]\s*(\d+)$/.exec(s);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = /(\d+(?:\.\d+)?)\s*(?:時間|hr?|h)\s*(?:(\d+)\s*(?:分|min|m)?)?/i.exec(s);
    if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] || 0));
    m = /^(\d+(?:\.\d+)?)\s*(?:分|min|m)$/i.exec(s);
    if (m) return Math.round(Number(m[1]));
    const n = toNum(s);
    if (n == null) return null;
    /* 単位なしの数。24以下なら時間、それより大きければ分と読みます——
       「8」を8分の睡眠と読むより、8時間と読むほうがまず当たります。 */
    return n <= 24 ? Math.round(n * 60) : Math.round(n);
  }

  /** 距離はkmで持ちます。単位が書いてあればそれに従い、無ければ大きさで判じます。 */
  function toKm(raw) {
    const s = String(raw == null ? "" : raw).trim();
    const n = toNum(s);
    if (n == null) return null;
    if (/km/i.test(s)) return n;
    if (/\bm\b|メートル/i.test(s)) return n / 1000;
    // 単位なし。100を超える値をkmと読むと、毎日ウルトラマラソンになります。
    return n > 100 ? n / 1000 : n;
  }

  /* ---------------- かんたん書式 ---------------- */

  function parsePlain(text) {
    const out = [];
    let day = U.todayKey();
    let time = null;
    let source = "ヘルスケア";
    let unknown = 0;

    String(text).split(/\r?\n/).forEach((lineRaw) => {
      const line = lineRaw.trim();
      if (!line || HEADER.test(line) && !line.includes("=")) return;
      const at = line.indexOf("=");
      if (at < 0) return;
      const key = normKey(line.slice(0, at));
      const value = line.slice(at + 1).trim();
      if (!key) { unknown++; return; }
      // 空欄は「取れなかった」。書かなかったのと同じ扱いにします。
      if (!value) return;

      if (key === "day") {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : U.dayKey(new Date(value));
        if (d) day = d;
        return;
      }
      if (key === "time") { time = U.isTime(value) ? value : null; return; }
      if (key === "source") { source = value; return; }

      if (key === "workout") {
        // 名前,分,kcal — 後ろ二つは無くても通します
        const parts = value.split(/[,、]/).map((x) => x.trim());
        const minutes = toMinutes(parts[1] != null && parts[1] !== "" ? parts[1] : parts[0]);
        const label = /[^\d:：.時間分hm]/i.test(parts[0]) ? parts[0] : "ワークアウト";
        if (minutes == null) return;
        out.push({ type: "workout", day, time, value: minutes, unit: "分",
                   label, kcal: toNum(parts[2]), source });
        return;
      }

      const v = key === "sleep" ? toMinutes(value)
        : key === "distance" ? toKm(value)
        : toNum(value);
      if (v == null) return;
      out.push({ type: key, day, time, value: v, source });
    });

    return { samples: out, unknown };
  }

  /* ---------------- JSON ---------------- */

  function parseJson(obj) {
    const rows = Array.isArray(obj) ? obj
      : Array.isArray(obj.samples) ? obj.samples
      : Array.isArray(obj.data) ? obj.data : null;
    if (!rows) return null;
    const out = [];
    rows.forEach((r) => {
      if (!r || typeof r !== "object") return;
      const type = normKey(r.type || r.name || r.identifier);
      if (!type || type === "day" || type === "time" || type === "source") return;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day
        : (r.date || r.start || r.startDate ? U.dayKey(new Date(r.date || r.start || r.startDate)) : U.todayKey());
      const raw = r.value != null ? r.value : r.qty != null ? r.qty : r.amount;
      const value = type === "sleep" ? toMinutes(raw)
        : type === "distance" ? toKm(raw)
        : toNum(raw);
      if (value == null) return;
      out.push({
        type, day,
        time: U.isTime(r.time) ? r.time : null,
        value,
        unit: typeof r.unit === "string" ? r.unit : "",
        label: typeof r.label === "string" ? r.label : (typeof r.workoutType === "string" ? r.workoutType : ""),
        kcal: toNum(r.kcal != null ? r.kcal : r.energy),
        source: typeof r.source === "string" ? r.source : "ヘルスケア",
        externalId: typeof r.uuid === "string" ? r.uuid
          : (typeof r.externalId === "string" ? r.externalId : null),
      });
    });
    return { samples: out, unknown: rows.length - out.length };
  }

  /* ---------------- 取り込み ---------------- */

  const UNITS = {
    steps: "歩", distance: "km", activeEnergy: "kcal", restingEnergy: "kcal",
    sleep: "分", heartRate: "bpm", workout: "分", weight: "kg", bodyFat: "%",
  };

  /**
   * @returns {{ok:boolean, error?:string, added:number, updated:number,
   *            skipped:number, days:string[], byType:Object}}
   */
  function importText(text) {
    const raw = String(text || "").trim();
    if (!raw) return { ok: false, error: "中身がありません", added: 0, updated: 0, skipped: 0 };

    let parsed = null;
    if (/^[[{]/.test(raw)) {
      try { parsed = parseJson(JSON.parse(raw)); } catch (err) { parsed = null; }
      if (!parsed) return { ok: false, error: "JSONの形が読めません", added: 0, updated: 0, skipped: 0 };
    } else {
      parsed = parsePlain(raw);
    }

    if (!parsed.samples.length) {
      return { ok: false, error: "取り込めるデータが見つかりません", added: 0, updated: 0, skipped: parsed.unknown || 0 };
    }

    let added = 0, updated = 0, skipped = 0;
    const days = new Set();
    const byType = {};
    const count = (t, how) => { byType[t] = byType[t] || { added: 0, updated: 0 }; byType[t][how]++; };

    /* 体脂肪率は、その日の体重の記録に寄り添わせます。別々に持つと
       「体重68.4kg」と「体脂肪21.3%」が並んで、同じ一回の計測だったことが
       画面から分からなくなるので。相手がいなければ単独で残します。 */
    const fats = [];

    parsed.samples.forEach((s) => {
      days.add(s.day);
      if (s.type === "bodyFat") { fats.push(s); return; }

      if (s.type === "weight") {
        const res = putWeight(s);
        if (res === "added") { added++; count("weight", "added"); }
        else if (res === "updated") { updated++; count("weight", "updated"); }
        else skipped++;
        return;
      }

      const rec = {
        type: s.type, day: s.day, time: s.time, value: s.value,
        unit: s.unit || UNITS[s.type] || "",
        label: s.label || "", kcal: s.kcal, source: s.source || "ヘルスケア",
        externalId: s.externalId || (s.type === "workout" && !s.externalId
          // ワークアウトは一日に何本もあるので、日と時刻と長さで一本と見ます。
          ? `wk:${s.day}:${s.time || "?"}:${s.value}` : null),
      };
      const res = store.putHealth(rec);
      if (res === "added") { added++; count(s.type, "added"); }
      else if (res === "updated") { updated++; count(s.type, "updated"); }
      else skipped++;

    });

    fats.forEach((s) => {
      const res = putBodyFat(s);
      if (res === "added") { added++; count("bodyFat", "added"); }
      else if (res === "updated") { updated++; count("bodyFat", "updated"); }
      else skipped++;
    });

    store.markSynced({ added, updated });
    return { ok: true, added, updated, skipped: skipped + (parsed.unknown || 0),
             days: [...days].sort(), byType };
  }

  /** 体重は weights に入ります。同じ計測が二度入らないよう、印と時刻で見ます。 */
  function putWeight(s) {
    const list = store.get().diet.weights;
    /* 時刻が書かれていない取り込みは「その日の体重」の申告です。だから
       相手はその日の一件——時刻まで一致するものを探すと、記録側が
       持っている時刻（取り込んだ時刻で埋まる）と噛み合わず、朝と夜で
       同じ体重が二つ並びます。 */
    const sameDay = (w) => w.day === s.day
      && (s.time == null || (w.time || null) === s.time);
    const same = list.find((w) =>
      (s.externalId && w.externalId === s.externalId)
      || (w.source === "health" && sameDay(w)));
    if (same) {
      if (Math.abs(same.kg - s.value) < 0.005) return null;   // 変わっていない
      store.updateWeight(same.id, { kg: s.value });
      return "updated";
    }
    /* 同じ日に自分で書いた記録があるなら、そちらを消しません。手で書いた値は
       「その人が正しいと思った値」で、体重計の生値より優先されます。
       ただし記録としては残したいので、時刻が違えば別の一件として入れます。 */
    const manualSame = list.find((w) => w.source === "manual" && sameDay(w));
    if (manualSame) return null;
    return store.addWeight({
      day: s.day, time: s.time, kg: s.value,
      source: "health", externalId: s.externalId || null,
    }) ? "added" : null;
  }

  function putBodyFat(s) {
    const list = store.get().diet.weights.filter((w) => w.day === s.day);
    // 同じ時刻のものを最優先、無ければその日のいちばん早い記録に添えます。
    const target = list.find((w) => (w.time || null) === (s.time || null))
      || list.sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0];
    if (target) {
      if (target.fat != null && Math.abs(target.fat - s.value) < 0.05) return null;
      store.updateWeight(target.id, { fat: s.value });
      return "updated";
    }
    // 体重がないのに体脂肪だけある日。捨てずに、単体の測定として残します。
    return store.putHealth({
      type: "bodyFat", day: s.day, time: s.time, value: s.value, unit: "%",
      source: s.source || "ヘルスケア", externalId: s.externalId || null,
    });
  }

  /* ---------------- 受け口 ---------------- */

  /** クリップボードから。iOSは貼り付けの確認を1回出します（それでいい）。 */
  function importFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      return Promise.resolve({ ok: false, error: "この端末ではクリップボードを読めません", added: 0, updated: 0, skipped: 0 });
    }
    return navigator.clipboard.readText()
      .then((t) => importText(t))
      .catch(() => ({ ok: false, error: "クリップボードを読ませてもらえませんでした", added: 0, updated: 0, skipped: 0 }));
  }

  /**
   * アドレスの #health=… から。ショートカットが「URLを開く」で渡す道です。
   * ホーム画面のアプリとSafariは別々の保存領域なので、この道が効くのは
   * Safariで開いているときだけ——それでも、最初の一回を試すには十分です。
   */
  function importFromHash() {
    const m = /[#&]health=([^&]+)/.exec(location.hash || "");
    if (!m) return null;
    let text = "";
    try { text = decodeURIComponent(m[1]); } catch (err) { text = m[1]; }
    // 二重に隠したいときのために base64 も受けます
    if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 24) {
      try { text = decodeURIComponent(escape(atob(text))); } catch (err) { /* そのまま */ }
    }
    const res = importText(text);
    // 読んだら消す。同じURLで開き直すたびに入れ直すのは、取り込みではなく事故です。
    history.replaceState(null, "", location.pathname + location.search + "#diet");
    return res;
  }

  /** 取り込みの結果を、そのまま人に読ませられる一行に。 */
  function describe(res) {
    if (!res) return "";
    if (!res.ok) return res.error || "取り込めませんでした";
    const parts = [];
    if (res.added) parts.push(`${res.added}件を追加`);
    if (res.updated) parts.push(`${res.updated}件を更新`);
    if (!parts.length) parts.push("新しいデータはありません");
    const days = res.days || [];
    const span = days.length === 1 ? U.formatDay(days[0])
      : days.length > 1 ? `${U.formatDay(days[0])}〜${U.formatDay(days[days.length - 1])}` : "";
    return parts.join("・") + (span ? `（${span}）` : "");
  }

  KN.healthSync = {
    importText, importFromClipboard, importFromHash, describe,
    parsePlain, parseJson, toMinutes, toKm, UNITS,
  };
})();
