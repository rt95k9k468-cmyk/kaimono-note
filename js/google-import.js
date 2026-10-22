/* =========================================================
   くらしノート — Google からの取り込み（予定は .ics の zip、タスクは Takeout の JSON。
   docs/todo-items.md「Google 取り込み」）

   - 流れ：設定 → やること → Google から取り込む → ファイルを選ぶ → **先に見せる紙**（件数・カレンダーごとに
     仕事かくらし）→ 控え → 取り込む。束ごと元に戻せる（`store.unimportGoogle`）。
   - 過去も入れる。過ぎた予定・済んだタスクは「済」の印つきの単発として（運ばれず、期限切れに積まれない）。
     未完了のタスクは、日が先なら その日、過ぎていれば「これから」へ。
   - くり返し：読める型（毎日・毎週・隔週・毎月の日／第◯曜日・毎年）は元の一本を残し、過ぎた回は単発に。
     読めない型・UNTIL／COUNT つきは一回ずつ（無限のものはこれから 90 日まで）。
   - 元の ID は gid、取り込みの時刻は gbatch。gid が同じものは二度目に飛ばす。
   - 連絡先は .vcf の BDAY（またはショートカットで書いた「名前,日付」の .txt／.csv）だけを読む（名前＋誕生日の毎年の終日予定。年は使わない）。ほかの項目は読み捨てる。
   - 外へは出さない（fetch しない）。ファイルは端末の中で読むだけ。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const { html, node, icon } = KN.util;
  const U = KN.util;

  const MAX = 4000;                       // 一度に入れる上限（古い過去から省く）
  const AHEAD = 90;                       // 読めない無限のくり返しを一回ずつにする先の日数
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const pad = (n) => (n < 10 ? "0" + n : String(n));

  /* ---------------- 日の数え方（UTC の通し番号） ---------------- */

  const dnOf = (day) => { const [y, m, d] = day.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const dayOf = (dn) => { const d = new Date(dn * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const wdOf = (dn) => new Date(dn * 864e5).getUTCDay();
  const ymd = (dn) => { const d = new Date(dn * 864e5); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
  const lenOf = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mondayOf = (dn) => dn - ((wdOf(dn) + 6) % 7);

  /* ---------------- .ics を読む ---------------- */

  const unesc = (s) => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

  /** 「20260105」「20260105T093000」「…Z」→ 端末の日と時刻。Z は端末の時間に直す。 */
  function when(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || "").trim());
    if (!m) return null;
    if (m[4] === undefined || /VALUE=DATE(?!-)/.test(params || "")) return { day: `${m[1]}-${m[2]}-${m[3]}`, time: null, allDay: true };
    if (m[7]) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return { day: U.dayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, allDay: false };
    }
    return { day: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, allDay: false };
  }

  function rruleOf(v) {
    const r = { freq: "", interval: 1, byday: [], bymonthday: [], until: null, count: null, bad: false };
    String(v || "").split(";").forEach((p) => {
      const [k, val = ""] = p.split("=");
      if (k === "FREQ") r.freq = val;
      else if (k === "INTERVAL") r.interval = Math.max(1, parseInt(val, 10) || 1);
      else if (k === "COUNT") r.count = parseInt(val, 10) || null;
      else if (k === "UNTIL") { const w = when(val, ""); r.until = w ? w.day : null; }
      else if (k === "BYDAY") {
        val.split(",").forEach((x) => {
          const mm = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x);
          if (mm) r.byday.push({ n: mm[1] ? parseInt(mm[1], 10) : 0, wd: WD[mm[2]] }); else r.bad = true;
        });
      } else if (k === "BYMONTHDAY") r.bymonthday = val.split(",").map(Number).filter((n) => n);
      else if (k !== "WKST") r.bad = true;
    });
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(r.freq)) r.bad = true;
    return r;
  }

  /** .ics の本文 → 予定の列（VALARM の中は読まない）。 */
  function parseIcs(text) {
    const lines = String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const out = [];
    let name = "", cur = null, alarm = 0;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { cur = { uid: "", rid: null, cancelled: false, title: "", desc: "", loc: "", rrule: null, ex: new Set(), start: null, end: null }; alarm = 0; continue; }
      if (line === "END:VEVENT") { if (cur && cur.start) out.push(cur); cur = null; continue; }
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i), val = line.slice(i + 1);
      const semi = head.indexOf(";");
      const key = semi < 0 ? head : head.slice(0, semi);
      const params = semi < 0 ? "" : head.slice(semi + 1);
      if (!cur) { if (key === "X-WR-CALNAME") name = unesc(val); continue; }
      if (key === "BEGIN" && val === "VALARM") { alarm++; continue; }
      if (key === "END" && val === "VALARM") { alarm--; continue; }
      if (alarm) continue;
      if (key === "UID") cur.uid = val;
      else if (key === "SUMMARY") cur.title = unesc(val);
      else if (key === "DESCRIPTION") cur.desc = unesc(val);
      else if (key === "LOCATION") cur.loc = unesc(val);
      else if (key === "STATUS") cur.cancelled = val === "CANCELLED";
      else if (key === "DTSTART") cur.start = when(val, params);
      else if (key === "DTEND") cur.end = when(val, params);
      else if (key === "RECURRENCE-ID") { const w = when(val, params); cur.rid = w ? w.day : null; }
      else if (key === "RRULE") cur.rrule = rruleOf(val);
      else if (key === "EXDATE") val.split(",").forEach((x) => { const w = when(x, params); if (w) cur.ex.add(w.day); });
    }
    return { name, events: out };
  }

  /* ---------------- くり返しを広げる ---------------- */

  /** day（dn）がこの決まりに当たるか。start は最初の日の dn。 */
  function hits(r, sdn, dn) {
    const c = dn - sdn;
    if (c < 0) return false;
    const [y, m, d] = ymd(dn), [sy, sm, sd] = ymd(sdn);
    const wd = wdOf(dn);
    if (r.freq === "DAILY") return c % r.interval === 0 && (!r.byday.length || r.byday.some((b) => b.wd === wd));
    if (r.freq === "WEEKLY") {
      if (((mondayOf(dn) - mondayOf(sdn)) / 7) % r.interval) return false;
      return (r.byday.length ? r.byday.map((b) => b.wd) : [wdOf(sdn)]).includes(wd);
    }
    if (r.freq === "MONTHLY") {
      if (((y * 12 + m) - (sy * 12 + sm)) % r.interval) return false;
      const len = lenOf(y, m);
      if (r.bymonthday.length) return r.bymonthday.some((x) => (x > 0 ? x === d : len + x + 1 === d));
      if (r.byday.length) {
        return r.byday.some((b) => b.wd === wd && (!b.n || (b.n > 0 ? Math.ceil(d / 7) === b.n : Math.floor((len - d) / 7) + 1 === -b.n)));
      }
      return d === sd;
    }
    if (r.freq === "YEARLY") return (y - sy) % r.interval === 0 && m === sm && d === sd;
    return false;
  }

  /** 決まりに当たる日（day）を from..to で。COUNT は DTSTART から数える。 */
  function occurrences(r, startDay, fromDn, toDn) {
    const sdn = dnOf(startDay);
    const end = Math.min(toDn, r.until ? dnOf(r.until) : toDn);
    if (r.bad) return end >= sdn && sdn >= fromDn ? [startDay] : [];
    const out = [];
    let n = 0;
    for (let dn = sdn; dn <= end; dn++) {
      if (!hits(r, sdn, dn)) continue;
      n++;
      if (r.count && n > r.count) break;
      if (dn >= fromDn) out.push(dayOf(dn));
      if (out.length > 3000) break;
    }
    return out;
  }

  /** 「読める型」か（元の一本のまま残せるか）。 */
  function liveOf(r, startDay) {
    if (r.bad || r.until || r.count) return null;
    const [, , sd] = ymd(dnOf(startDay));
    if (r.freq === "DAILY") return r.interval === 1 && !r.byday.length ? { repeat: "daily" } : null;
    if (r.freq === "WEEKLY") {
      if (r.byday.some((b) => b.n) || r.interval > 52) return null;
      const days = [...new Set(r.byday.map((b) => b.wd))].sort((a, b) => a - b);
      return { repeat: "weekly", repeatDays: days, repeatWeeks: r.interval >= 2 ? r.interval : null };
    }
    if (r.freq === "MONTHLY") {
      if (r.interval !== 1) return null;
      if (r.bymonthday.length) return r.bymonthday.length === 1 && r.bymonthday[0] === sd && !r.byday.length ? { repeat: "monthly" } : null;
      if (r.byday.length === 1 && r.byday[0].n) return { repeat: "monthly", repeatNth: { nth: r.byday[0].n, weekday: r.byday[0].wd } };
      return r.byday.length ? null : { repeat: "monthly" };
    }
    if (r.freq === "YEARLY") return r.interval === 1 && !r.byday.length && !r.bymonthday.length ? { repeat: "yearly" } : null;
    return null;
  }

  /* ---------------- 予定 → やることの形 ---------------- */

  const noon = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 12).toISOString(); };

  /** 一つの予定（またはその一回）→ addTodo の引数。day はその回の日。 */
  function eventArgs(ev, day, side, today, gid) {
    const span = ev.end ? dnOf(ev.end.day) - dnOf(ev.start.day) : 0;
    let endDn = dnOf(day) + Math.max(0, span);
    let minutes = null;
    if (ev.start.allDay) {
      if (span >= 1) endDn = dnOf(day) + span - 1;
    } else if (ev.end && !ev.end.allDay) {
      const a = ev.start.time.split(":").map(Number), b = ev.end.time.split(":").map(Number);
      if (span === 0) minutes = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
      else if (ev.end.time === "00:00" && span >= 1) endDn = dnOf(day) + span - 1;
    }
    const endDay = endDn > dnOf(day) ? dayOf(endDn) : null;
    const past = (endDay || day) < today;
    return {
      title: ev.title.trim() || "（題なし）", kind: "event", side, due: day, endDay, time: ev.start.time,
      minutes: minutes > 0 ? minutes : null,
      memo: [ev.loc, ev.desc].filter(Boolean).join("\n").slice(0, 2000),
      done: past, doneAt: past ? noon(endDay || day) : null, gid,
    };
  }

  /** 一つのカレンダー → { items, live, expanded, unread }。 */
  function fromCalendar(cal, side, today) {
    const items = [];
    let live = 0, expanded = 0, unread = 0;
    const todayDn = dnOf(today);
    const masters = cal.events.filter((e) => e.rrule && !e.rid);
    const overrides = new Map();               // uid → Map(rid → ev)
    cal.events.filter((e) => e.rid).forEach((e) => {
      if (!overrides.has(e.uid)) overrides.set(e.uid, new Map());
      overrides.get(e.uid).set(e.rid, e);
    });
    const hasMaster = new Set(masters.map((e) => e.uid));
    cal.events.forEach((e) => {
      if (e.rrule && !e.rid) return;
      if (e.rid && hasMaster.has(e.uid)) return;           // 元の列で扱う
      if (e.cancelled) return;
      items.push(eventArgs(e, e.start.day, side, today, "e:" + e.uid + (e.rid ? "@" + e.rid : "")));
    });
    masters.forEach((m) => {
      if (m.cancelled) return;
      const ov = overrides.get(m.uid) || new Map();
      const r = m.rrule;
      const futureTouch = [...m.ex, ...ov.keys()].some((d) => d >= today);
      const form = futureTouch ? null : liveOf(r, m.start.day);
      if (r.bad) unread++;
      const to = form ? todayDn - 1 : todayDn + AHEAD;
      const days = occurrences(r, m.start.day, dnOf(m.start.day), to);
      const one = (day) => {
        if (m.ex.has(day) && !ov.has(day)) return;
        const o = ov.get(day);
        if (o) { if (!o.cancelled) items.push(eventArgs(o, o.start.day, side, today, "e:" + m.uid + "@" + day)); return; }
        items.push(eventArgs(m, day, side, today, "e:" + m.uid + "@" + day));
      };
      days.forEach(one);
      if (!form) { expanded++; return; }
      const next = occurrences(r, m.start.day, todayDn, todayDn + 800).find((d) => !m.ex.has(d));
      if (!next) return;
      live++;
      items.push({ ...eventArgs(m, next, side, today, "e:" + m.uid), ...form, done: false, doneAt: null });
    });
    return { items, live, expanded, unread };
  }

  /* ---------------- タスク（Takeout の Tasks.json） ---------------- */

  const WDNAME = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };

  function fromTaskList(list, side, today) {
    const items = [];
    const recs = new Map();
    let live = 0;
    (list.recurrences || []).forEach((r) => recs.set(r.id, r));
    const stopped = (r) => !r || r.stopped || (r.schedule && r.schedule.end_condition);
    const day = (iso) => (iso ? U.dayKey(new Date(iso)) : "");
    const sched = (t) => {
      const s = Array.isArray(t.scheduled_time) ? t.scheduled_time.find((x) => x && x.current) || t.scheduled_time[0] : null;
      return s && s.start ? day(s.start) : "";
    };
    (list.items || []).forEach((t) => {
      const title = String(t.title || "").trim() || "（題なし）";
      const on = sched(t);
      const base = { title, side, memo: String(t.notes || "").slice(0, 2000), flagged: !!t.starred, gid: "t:" + t.id };
      if (t.status === "completed") {
        items.push({ ...base, due: on || null, done: true, doneAt: t.completed || t.updated || null });
        return;
      }
      if (t.task_recurrence_id && !stopped(recs.get(t.task_recurrence_id))) return;   // 元の一本が代わる
      items.push({ ...base, due: on && on >= today ? on : null });
    });
    recs.forEach((r, id) => {
      if (stopped(r) || !r.schedule || !r.schedule.interval) return;
      const iv = r.schedule.interval;
      const first = day(r.schedule.first_instance_date);
      if (!first) return;
      const mult = iv.interval_multiplier || 1;
      let form = null, rule = null;
      if (iv.daily && mult === 1) { form = { repeat: "daily" }; rule = { freq: "DAILY", interval: 1, byday: [], bymonthday: [] }; }
      else if (iv.weekly && mult <= 52) {
        const days = (iv.weekly.day_of_week || []).map((x) => WDNAME[x]).filter((x) => x !== undefined);
        form = { repeat: "weekly", repeatDays: [...new Set(days)].sort((a, b) => a - b), repeatWeeks: mult >= 2 ? mult : null };
        rule = { freq: "WEEKLY", interval: mult, byday: days.map((wd) => ({ n: 0, wd })), bymonthday: [] };
      } else if (iv.monthly && mult === 1 && iv.monthly.day_of_month) {
        form = { repeat: "monthly" };
        rule = { freq: "MONTHLY", interval: 1, byday: [], bymonthday: [iv.monthly.day_of_month] };
      }
      if (!form) return;
      const todayDn = dnOf(today);
      const next = occurrences(rule, first, todayDn, todayDn + 800)[0];
      if (!next) return;
      live++;
      items.push({ title: String(r.title || "").trim() || "（題なし）", side, due: next, gid: "r:" + id, ...form });
    });
    return { items, live };
  }

  /* ---------------- 連絡先の誕生日（.vcf） ---------------- */

  /** vCard の本文 → 誕生日のある人の列 [{uid, name, mm, dd}]。年は使わない（毎年の予定にするだけ）。
      BDAY は 19900412・1990-04-12・--0412・--04-12（年なし）。Apple は年なしを 1604 年で書く。 */
  function parseVcf(text) {
    const lines = String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const out = [];
    let cur = null;
    for (const raw of lines) {
      if (/^BEGIN:VCARD/i.test(raw)) { cur = { uid: "", fn: "", n: "", org: "", bday: "" }; continue; }
      if (/^END:VCARD/i.test(raw)) {
        if (cur && cur.bday) {
          const m = /^(?:(\d{4})-?|--)(\d{2})-?(\d{2})/.exec(cur.bday.trim());
          const mm = m ? +m[2] : 0, dd = m ? +m[3] : 0;
          const name = cur.fn || cur.n || cur.org;
          if (m && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && name) out.push({ uid: cur.uid, name, mm, dd });
        }
        cur = null;
        continue;
      }
      if (!cur) continue;
      const i = raw.indexOf(":");
      if (i < 0) continue;
      const key = raw.slice(0, i).replace(/^[A-Za-z0-9-]+\./, "").split(";")[0].toUpperCase();
      const val = raw.slice(i + 1);
      if (key === "FN") cur.fn = unesc(val).trim();
      else if (key === "N") cur.n = unesc(val).split(";").slice(0, 2).reverse().join(" ").trim();
      else if (key === "ORG") cur.org = unesc(val).split(";")[0].trim();
      else if (key === "UID") cur.uid = val.trim();
      else if (key === "BDAY") cur.bday = val;
    }
    return out;
  }

  /** 名前と誕生日の一覧（.txt／.csv。ショートカットで書き出す）→ parseVcf と同じ形。一行に一人、
      行の中の日付（2026/4/12・1/10/18（年が 1 桁）・2026-04-12・2026年4月12日・--04-12・4月12日・4/12）の前を名前に。日付の無い行は読まない。 */
  function parseBirthdayText(text) {
    const out = [];
    String(text || "").split(/\r?\n/).forEach((line) => {
      const L = line.replace(/^\uFEFF/, "");
      const pats = [
        [/(\d{1,4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})(?!\d)/, 2, 3],   // 年は 1 でも（年なしの連絡先は 1/10/18 と出る）
        [/--(\d{2})-?(\d{2})/, 1, 2],
        [/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/, 1, 2],
        [/(\d{1,2})\s*\/\s*(\d{1,2})/, 1, 2],
      ];
      for (const [re, mi, di] of pats) {
        const m = re.exec(L);
        if (!m) continue;
        const mm = +m[mi], dd = +m[di];
        const name = L.slice(0, m.index).replace(/[\s,\t、:："']+$/, "").replace(/^["'\s]+/, "");
        if (name && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.push({ uid: "", name, mm, dd });
        break;
      }
    });
    return out;
  }

  /** 人ごとに「◯◯の誕生日」の毎年の終日予定を一本。日は今日以降の次の回（2月29日はうるう年まで飛ぶ）。 */
  function fromContacts(people, side, today) {
    const y0 = +today.slice(0, 4);
    const items = people.map((p) => {
      let due = "";
      for (let y = y0; y <= y0 + 8 && !due; y++) {
        const day = `${y}-${pad(p.mm)}-${pad(p.dd)}`;
        const d = new Date(Date.UTC(y, p.mm - 1, p.dd));
        if (d.getUTCMonth() === p.mm - 1 && d.getUTCDate() === p.dd && day >= today) due = day;
      }
      if (!due) return null;
      return { title: `${p.name}の誕生日`, kind: "event", side, due, repeat: "yearly", gid: "b:" + (p.uid || `${p.name}:${pad(p.mm)}${pad(p.dd)}`) };
    }).filter(Boolean);
    return { items, live: items.length };
  }

  /* ---------------- ファイルを読む ---------------- */

  /** 選んだファイル（.zip・.ics・.json）→ 元（calendar／tasks）の列。読めない名前は bad へ。 */
  async function read(files) {
    const sources = [], bad = [];
    const take = async (name, get) => {
      try {
        if (/\.ics$/i.test(name)) {
          const c = parseIcs(await (await get()).text());
          if (!c.events.length) { bad.push(name); return; }
          const label = c.name || name.replace(/^.*\//, "").replace(/\.ics$/i, "");
          sources.push({ kind: "calendar", label, cal: c, side: "home" });
        } else if (/\.(vcf|txt|csv)$/i.test(name)) {
          const body = await (await get()).text();
          const people = /\.vcf$/i.test(name) ? parseVcf(body) : parseBirthdayText(body);
          if (!people.length) { bad.push(name); return; }
          sources.push({ kind: "contacts", label: "連絡先の誕生日", people, side: "home" });
        } else if (/\.json$/i.test(name)) {
          const j = JSON.parse(await (await get()).text());
          const lists = Array.isArray(j.items) ? j.items.filter((l) => Array.isArray(l.items) || l.kind === "tasks#taskList") : [];
          if (!lists.length) { bad.push(name); return; }
          lists.forEach((l) => sources.push({ kind: "tasks", label: l.title || name.replace(/^.*\//, ""), list: l, side: "home" }));
        }
      } catch (_) { bad.push(name); }
    };
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        let list;
        try { list = await KN.noteNotion.listOf(f); } catch (_) { bad.push(f.name); continue; }
        for (const e of list) {
          if (/\/$/.test(e.name) || !/\.(ics|json|vcf)$/i.test(e.name)) continue;
          if (/\.json$/i.test(e.name) && !/Tasks\.json$/i.test(e.name)) continue;
          await take(e.name, () => KN.noteNotion.openOf(f, e));
        }
      } else await take(f.name, async () => f);
    }
    return { sources, bad };
  }

  /** 元ごとに仕事かくらしを当てて、入れる記録の列に。入れ済み（gid）は除く。 */
  function plan(sources, have, today, room) {
    const per = sources.map((s) => {
      const side = s.side === "work" ? "work" : null;
      const r = s.kind === "calendar" ? fromCalendar(s.cal, side, today) : s.kind === "contacts" ? fromContacts(s.people, side, today) : fromTaskList(s.list, side, today);
      const fresh = r.items.filter((x) => !have.has(x.gid));
      return { ...r, fresh, had: r.items.length - fresh.length };
    });
    let all = per.flatMap((p) => p.fresh);
    let cut = 0;
    all.sort((a, b) => ((b.due || "9999") < (a.due || "9999") ? -1 : 1));          // 先のものを残し、古い過去から省く
    if (all.length > MAX) { cut = all.length - MAX; all = all.slice(0, MAX); }
    /* 保存の枠（localStorage）に収まるぶんだけ。一件は約 620 字＋題と本文（実測）、枠の八割まで。 */
    if (typeof room === "number") {
      let sum = 0, keep = 0;
      for (const x of all) {
        sum += 620 + x.title.length + (x.memo || "").length;
        if (sum > room * 0.8) break;
        keep++;
      }
      cut += all.length - keep;
      all = all.slice(0, keep);
    }
    return { per, all, cut };
  }

  const LIVE_CAP = 2000000;

  /** localStorage にあと何字書けるか（試しに書いて消す。同期のまま終えるので、途中で保存が割りこまない）。 */
  function roomLeft() {
    const K = "kn-room-probe", CAP = 4 * 1024 * 1024;
    let lo = 0, hi = CAP;
    try {
      for (let i = 0; i < 14 && lo < hi; i++) {
        const mid = i === 0 ? hi : Math.ceil((lo + hi) / 2);
        let ok = true;
        try { localStorage.setItem(K, "x".repeat(mid)); } catch (_) { ok = false; }
        if (ok) { if (mid === hi) return hi; lo = mid; } else hi = mid - 1;
      }
    } finally { try { localStorage.removeItem(K); } catch (_) { /* 無ければよい */ } }
    return lo;
  }

  /* ---------------- 紙 ---------------- */

  const S = () => KN.settingsParts;
  const row = (title, val) => node(html`
    <div class="set-row"><span class="set-title">${title}</span><span class="set-val">${String(val)}</span></div>`);

  function pick() {
    const inp = node(html`<input type="file" accept=".zip,.ics,.json,.vcf,.txt,.csv" multiple hidden>`);
    document.body.append(inp);
    inp.addEventListener("change", () => {
      const files = [...(inp.files || [])];
      inp.remove();
      if (files.length) show(files);
    });
    inp.click();
  }

  const counts = (items) => {
    const c = { ev: 0, evPast: 0, task: 0, taskDone: 0 };
    items.forEach((x) => {
      if (x.kind === "event") { c.ev++; if (x.done) c.evPast++; } else { c.task++; if (x.done) c.taskDone++; }
    });
    return c;
  };

  async function show(files) {
    KN.ui.toast("読んでいます");
    const { sources, bad } = await read(files).catch(() => ({ sources: [], bad: files.map((f) => f.name) }));
    const have = KN.store.googleIds();
    const today = U.todayKey();
    /* 入れたあとの記録は200万字まで（日記の取り込みを断る線と同じ。枠はおよそ260万字、残りは
       毎日の書き足しに。2026年10月22日、八割まで入れて記録が241万字になったため）。plan() は room の八割まで。 */
    const room = Math.min(roomLeft(), Math.max(0, LIVE_CAP - KN.store.liveChars()) / 0.8);
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-go">${icon("download")}<span class="js-word">取り込む</span></button></div>`);
    const go = foot.querySelector(".js-go");
    let total = 0;
    const draw = () => {
      body.innerHTML = "";
      const p = plan(sources, have, today, room);
      total = p.all.length;
      p.per.forEach((r, i) => {
        const s = sources[i];
        const c = counts(r.fresh);
        const pick = node(html`
          <label class="field">
            <span class="field-label">${s.label}</span>
            <select class="select"><option value="home">くらし</option><option value="work">仕事</option></select>
          </label>`);
        const sel = pick.querySelector("select");
        sel.value = s.side;
        sel.addEventListener("change", () => { s.side = sel.value; });
        body.append(pick, P.card(
          s.kind === "calendar" ? row("予定", c.ev) : null,
          s.kind === "calendar" && c.evPast ? row("　うち過ぎたもの", c.evPast) : null,
          s.kind === "calendar" && r.live ? row("くり返し", r.live) : null,
          s.kind === "calendar" && r.expanded ? row("一回ずつにしたくり返し", r.expanded) : null,
          s.kind === "contacts" ? row("誕生日", c.ev) : null,
          s.kind === "tasks" ? row("タスク", c.task) : null,
          s.kind === "tasks" && c.taskDone ? row("　うち済み", c.taskDone) : null,
          s.kind === "tasks" && r.live ? row("くり返し", r.live) : null,
          r.had ? row("取り込み済み", r.had) : null
        ));
      });
      if (p.cut) body.append(P.card(row("入りきらず省いた古い分", p.cut)));
      if (bad.length) body.append(P.card(row("読めないもの", bad.length)), P.more("読めないもの", bad.join(" ／ ")));
      go.disabled = !total;
    };
    draw();
    body.addEventListener("change", (e) => { if (e.target.matches("select")) draw(); });
    const h = KN.ui.sheet({ title: "Google から", content: body, footer: foot });
    let busy = false;
    go.addEventListener("click", async () => {
      if (busy || !total) return;
      busy = true;
      go.disabled = true;
      const word = foot.querySelector(".js-word");
      word.textContent = "控えを取っています";
      const snap = KN.backup && KN.backup.take ? await KN.backup.take("取り込む前", { force: true }).catch(() => "failed") : "failed";
      if (snap === "failed") {
        busy = false;
        go.disabled = false;
        word.textContent = "取り込む";
        KN.ui.toast("控えを取れなかったので、取り込んでいません", { long: true });
        return;
      }
      const made = KN.store.importGoogle(plan(sources, have, today, room).all, new Date().toISOString());
      h.close();
      KN.ui.toast(`${made}件を取り込みました`);
    });
  }

  /** 取り込みを束ごと元に戻す（直したものは残す）。 */
  async function undo() {
    const list = KN.store.googleBatches();
    if (!list.length) return;
    const b = list[0];
    const ok = await KN.ui.confirm({ title: "取り込みを取り消す", message: `${b.n}件を元に戻します。取り込んだあとに直したものは残します。`, okLabel: "取り消す", danger: true });
    if (!ok) return;
    if (KN.backup && KN.backup.take) await KN.backup.take("取り消す前", { force: true }).catch(() => null);
    const r = KN.store.unimportGoogle(b.batch);
    KN.ui.toast(r.kept ? `${r.gone}件を戻しました（直した${r.kept}件は残しました）` : `${r.gone}件を戻しました`, { long: !!r.kept });
  }

  KN.googleImport = { open: pick, roomLeft, show, undo, read, plan, parseIcs, parseVcf, parseBirthdayText, fromContacts, fromCalendar, fromTaskList, occurrences, rruleOf };
})();
