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

  /* ---------------- 読めなかった便を、データと間違えない ----------------

     iPhoneがロックされているあいだ、HealthKit は暗号化されたままで読めません。
     無人で走るショートカット（毎朝のオートメーション）はそこに当たることが
     あって、"Protected health data is inaccessible" を返します。

     困るのはそのあとです。ショートカットの「統計を計算 → 合計」は、
     読めなかった＝0件のとき **0** を返します。つまり中継所には

         steps=0
         activeEnergy=0
         sleep=0

     が置かれ、そのまま取り込めば、その日の記録が 0 で塗り替わります。
     「一歩も歩かなかった日」が静かに出来上がるわけです。

     だから、**そういう便は入れません**。読めなかったことは分かるので、
     入れずに置いておいて、あとでもう一度取りにいきます（health-relay.js と
     screen-diet.js）。手で貼るぶんには関係のない話ですが、この文言そのものは
     どこから来ても中身がないので、いつでも断ります。 */
  const LOCKED_RE = new RegExp([
    "protected\\s+health\\s+data\\s+is\\s+inaccessible",
    "health\\s*data\\s*is\\s*inaccessible",
    "healthkit[^\\n]{0,40}(unavailable|inaccessible|denied)",
    "保護されたヘルスケア",
    "ヘルスケア(の)?データ(に|へ)?アクセス(でき|出来)ません",
  ].join("|"), "i");

  const LOCKED_MSG = "ヘルスケアがまだ読める状態ではありませんでした"
    + "（iPhoneがロックされているあいだは読めません）。少し待ってから取りにいきます。";

  /** その便は「読めなかった」と言っているか。 */
  function locked(text) {
    return LOCKED_RE.test(String(text || ""));
  }

  /* 0 だけが並ぶ便も、同じ扱いにします。ショートカットは読めなかったとき
     空ではなく 0 を返すので、字面だけでは成功と区別がつきません。
     ぜんぶ 0 なら、それは「その日一日、何も動かず眠らなかった」ではなく、
     読めていないほうです。ワークアウトは数えません（無い日が普通なので）。 */
  function allZero(samples) {
    const daily = (samples || []).filter((s) => s.type !== "workout");
    return daily.length > 0 && daily.every((s) => s.value === 0);
  }

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

  const TYPE_LABEL = {
    steps: "歩数", distance: "歩行距離", activeEnergy: "アクティブエネルギー",
    restingEnergy: "安静時エネルギー", sleep: "睡眠", heartRate: "心拍数",
    workout: "ワークアウト", weight: "体重", bodyFat: "体脂肪率",
  };

  /* 同じ日の同じ種目が何行も来たとき、足すのが正しいもの。
     ショートカットで「統計を計算」を挟まずに、時間ごとのサンプルを
     そのまま並べてしまっても、合計になって入ります。 */
  const ADDITIVE = ["steps", "distance", "activeEnergy", "restingEnergy", "sleep"];

  /**
   * 一回の取り込みの中で、同じ日の同じ種目をまとめます。
   * ただし **印（externalId）を持つ一件は、そのまま**——印があるということは
   * 「その一件」を指しているので、ほかと足してよいものではありません。
   * ワークアウトも一本ずつ残します（同じ日の朝と夜のランは別の運動です）。
   * 心拍数は足しても意味がないので、平均を採ります。
   */
  /* 同じものを二つの機械が数えていることがあります。

     歩行距離がそれで、Apple Watch と iPhone の両方が一日ぶんを持って
     います。足すと二重になります——実測で Watch 7.8km / iPhone 6.0km /
     ヘルスケア 7.9km のところ、足すと 13.9km になりました。

     **足せるのは、同じものを分けて数えているときだけ**です。
     出どころの違う「その日ぜんぶ」どうしは、足すものではなく
     選ぶものです。Watch のほうがヘルスケアの値と合うので、
     出どころが分かるなら Watch を採ります。

     出どころが一つしか来ないとき（いまのショートカットはそうです）は、
     これまでどおり足します。ここが変わるのは、**出どころを分けて
     送ってきたときだけ** です。 */
  const PICK_ONE = ["distance"];
  const isWatch = (s) => /watch|ウォッチ|ウオッチ/i.test(String(s || ""));

  function foldSamples(list) {
    const out = [];
    const bag = new Map();

    /* 先に見ておきます——同じ日の同じ種類に、違う出どころが来ているか。 */
    const sources = new Map();
    list.forEach((s) => {
      if (!PICK_ONE.includes(s.type) || s.externalId) return;
      const key = s.type + "|" + s.day;
      if (!sources.has(key)) sources.set(key, new Set());
      sources.get(key).add(String(s.source || ""));
    });
    const split = new Set();
    sources.forEach((set, key) => { if (set.size > 1) split.add(key); });

    list.forEach((s) => {
      const foldable = !s.externalId
        && (ADDITIVE.includes(s.type) || s.type === "heartRate");
      if (!foldable) { out.push(s); return; }
      const key = s.type + "|" + s.day;

      // 出どころが分かれている「選ぶもの」は、足さずに一つ選びます。
      if (split.has(key)) {
        const cur = bag.get(key);
        if (!cur) { bag.set(key, { ...s, _n: 1, _picked: true }); return; }
        // Watch を優先。どちらも Watch でなければ、大きいほうを残します
        // （小さいほうは、片方の機械しか付けていなかった時間ぶん）。
        const better = isWatch(s.source) && !isWatch(cur.source)
          ? true
          : (!isWatch(cur.source) && !isWatch(s.source) && s.value > cur.value);
        if (better) bag.set(key, { ...s, _n: 1, _picked: true });
        return;
      }

      const cur = bag.get(key);
      if (!cur) { bag.set(key, { ...s, _n: 1 }); return; }
      cur.value += s.value;
      cur._n += 1;
      if (!cur.time) cur.time = s.time;
    });
    bag.forEach((s) => {
      if (s.type === "heartRate" && s._n > 1) s.value = Math.round(s.value / s._n);
      delete s._n;
      delete s._picked;
      out.push(s);
    });
    return out;
  }

  /** 保存せずに「何が読めたか」だけ返す。ショートカットを直すための窓です。 */
  function preview(text) {
    const raw = String(text || "").trim();
    if (!raw) return { ok: false, error: "中身がありません", rows: [] };
    if (locked(raw)) return { ok: false, locked: true, error: LOCKED_MSG, rows: [] };
    let parsed = null;
    if (/^[[{]/.test(raw)) {
      try { parsed = parseJson(JSON.parse(raw)); } catch (err) { parsed = null; }
      if (!parsed) return { ok: false, error: "JSONの形が読めません", rows: [] };
    } else {
      parsed = parsePlain(raw);
    }
    const rows = foldSamples(parsed.samples).map((s) => ({
      type: s.type,
      label: TYPE_LABEL[s.type] || s.type,
      day: s.day,
      value: s.type === "sleep" || s.type === "workout"
        ? `${Math.floor(s.value / 60)}時間${String(Math.round(s.value % 60)).padStart(2, "0")}分`
        : `${s.value.toLocaleString()}${UNITS[s.type] || ""}`,
      extra: s.type === "workout"
        ? (s.label || "") + (s.kcal != null ? ` ・ ${s.kcal}kcal` : "") : "",
    }));
    if (!rows.length) {
      return { ok: false, error: "読めるものがありませんでした", rows: [], unknown: parsed.unknown || 0 };
    }
    return { ok: true, rows, unknown: parsed.unknown || 0 };
  }

  /**
   * @returns {{ok:boolean, error?:string, added:number, updated:number,
   *            skipped:number, days:string[], byType:Object}}
   */
  function importText(text, opts) {
    /* auto は「無人で届いた便か」です。人が見ている貼り付けとちがって、
       0 だらけの便を人が確かめてから押したわけではないので、そこだけ
       用心を強くします。手入力・貼り付けの道（opts なし）は、これまでと
       一字も変わりません。 */
    const auto = !!(opts && opts.auto);
    const raw = String(text || "").trim();
    if (!raw) return { ok: false, error: "中身がありません", added: 0, updated: 0, skipped: 0 };

    /* 「読めなかった」と書いてある便は、どこから来ても入れません
       （中身がないので、断っても失うものがありません）。 */
    if (locked(raw)) {
      return { ok: false, locked: true, error: LOCKED_MSG, added: 0, updated: 0, skipped: 0 };
    }

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
    parsed = { ...parsed, samples: foldSamples(parsed.samples) };

    /* 無人の便が 0 ばかりのときは、読めていないほうです。**入れずに断って**、
       いまある記録はそのままにします（呼んだ側が、少し待って取りにいきます）。
       まじりの 0 も入れません——0 は「その日どうだったか」を何も言わない値
       なので、入れて既にある数を消す理由がありません。 */
    if (auto) {
      if (allZero(parsed.samples)) {
        return { ok: false, locked: true, zeros: true, error: LOCKED_MSG,
                 added: 0, updated: 0, skipped: 0 };
      }
      const keep = parsed.samples.filter((s) => !(s.type !== "workout" && s.value === 0));
      if (keep.length !== parsed.samples.length) parsed = { ...parsed, samples: keep };
      if (!keep.length) {
        return { ok: false, locked: true, zeros: true, error: LOCKED_MSG,
                 added: 0, updated: 0, skipped: 0 };
      }
    }

    let added = 0, updated = 0, skipped = 0, kept = 0;
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
      else if (store.healthOfDay(s.day, s.type).some((h) => h.source === "manual")) kept++;
      else skipped++;

    });

    fats.forEach((s) => {
      const res = putBodyFat(s);
      if (res === "added") { added++; count("bodyFat", "added"); }
      else if (res === "updated") { updated++; count("bodyFat", "updated"); }
      else skipped++;
    });

    store.markSynced({ added, updated });
    return { ok: true, added, updated, kept, skipped: skipped + (parsed.unknown || 0),
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

  /* ---------------- クリップボード ----------------

     navigator.clipboard.readText() は「読めたら儲けもの」の道です。
     iOSでは、ホーム画面から起動したアプリ（standalone）だと拒まれることが
     あり、Safariで開いていても、画面に焦点が無い・ジェスチャの一拍を
     またいだ・ユーザーが「ペースト」を押さなかった、のどれでも失敗します。

     だから失敗を異常扱いしません。**確実な道は別にあります**——欄を出して、
     iOSの「ペースト」で貼ってもらう。あちらは権限もAPIも要りません。
     ここが返すのは「読めたか」と、読めなかったときに**なぜ**を言うための
     材料です。曖昧なエラー一行で行き止まりにしないために。 */

  /** いま置かれている条件。読めなかったときに、どこを疑えばいいかの手がかり。 */
  function clipboardState() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    return {
      api: !!(nav.clipboard && nav.clipboard.readText),
      secure: typeof isSecureContext !== "undefined" ? !!isSecureContext : null,
      focused: typeof document !== "undefined" && document.hasFocus ? document.hasFocus() : null,
      standalone: (typeof window !== "undefined" && window.matchMedia
        && window.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true,
      permission: null,   // 下で埋まることがあります
    };
  }

  /** 条件を、そのまま画面に出せる一行に。 */
  function explain(state, err) {
    const bits = [];
    if (!state.api) bits.push("このブラウザに読み取りのAPIがありません");
    else if (err) bits.push(`${err.name || "エラー"}：${err.message || "理由なし"}`);
    if (state.secure === false) bits.push("保護されていない接続（http）では読めません");
    if (state.focused === false) bits.push("画面に焦点がありません");
    if (state.standalone) bits.push("ホーム画面から起動したアプリでは、iOSが読み取りを断ることがあります");
    if (state.permission === "denied") bits.push("貼り付けの許可が拒否されています");
    return bits.join(" / ");
  }

  /**
   * クリップボードから読んで、手入力とまったく同じ importText() に渡します。
   * @returns 取り込み結果に加えて
   *   text  … 読めた文字列そのもの（読めなければ null）
   *   why   … 読めなかった理由の説明
   *   state … そのときの条件
   */
  function importFromClipboard() {
    const state = clipboardState();

    if (!state.api) {
      return Promise.resolve({ ok: false, error: "クリップボードを読み取れませんでした",
        why: explain(state, null), state, text: null, added: 0, updated: 0, skipped: 0 });
    }

    /* readText() はユーザーの操作と同じ一拍のうちに呼ばないと拒まれます。
       だから権限の問い合わせを **先に待ちません** ——待つと一拍をまたぎます。
       権限は、失敗したあとで手がかりとして読みます。 */
    let promise;
    try {
      promise = navigator.clipboard.readText();
    } catch (err) {
      return Promise.resolve({ ok: false, error: "クリップボードを読み取れませんでした",
        why: explain(state, err), state, text: null, added: 0, updated: 0, skipped: 0 });
    }

    return Promise.resolve(promise)
      .then((t) => {
        const text = String(t == null ? "" : t);
        if (!text.trim()) {
          return { ok: false, error: "クリップボードが空でした", why: "読み取れましたが、中身がありません",
                   state, text, added: 0, updated: 0, skipped: 0 };
        }
        // 手入力とまったく同じ道を通します。
        return { ...importText(text), text, state };
      })
      .catch((err) => askPermission().then((perm) => {
        state.permission = perm;
        return { ok: false, error: "クリップボードを読み取れませんでした",
                 why: explain(state, err), state, text: null, added: 0, updated: 0, skipped: 0 };
      }));
  }

  /**
   * 読むだけ。取り込みも、成否の物語も付けません——タブを開いたときのように
   * 「読めたら使う、読めなければ何もしない」場面のための、いちばん薄い口です。
   * @returns {Promise<string|null>} 読めなければ null
   */
  function readClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.resolve(null);
    try {
      return Promise.resolve(navigator.clipboard.readText())
        .then((t) => (t == null ? null : String(t)))
        .catch(() => null);
    } catch (err) { return Promise.resolve(null); }
  }

  /** 失敗したあとにだけ聞く。対応していないブラウザでは黙って null。 */
  function askPermission() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(null);
      return navigator.permissions.query({ name: "clipboard-read" })
        .then((s) => s.state).catch(() => null);
    } catch (err) { return Promise.resolve(null); }
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
    /* 手で書いた値を守って入れなかったぶんは、黙って落とさずに言います。
       言わないと「取り込んだのに変わらない」に見えます。 */
    if (res.kept) parts.push(`${res.kept}件は手入力のまま`);
    if (!parts.length) parts.push("新しいデータはありません");
    const days = res.days || [];
    const span = days.length === 1 ? U.formatDay(days[0])
      : days.length > 1 ? `${U.formatDay(days[0])}〜${U.formatDay(days[days.length - 1])}` : "";
    return parts.join("・") + (span ? `（${span}）` : "");
  }

  KN.healthSync = {
    importText, importFromClipboard, importFromHash, describe, preview,
    locked, LOCKED_MSG,
    clipboardState, explain, readClipboard,
    parsePlain, parseJson, foldSamples, toMinutes, toKm, UNITS, TYPE_LABEL,
  };
})();
