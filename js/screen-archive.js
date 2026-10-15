/* =========================================================
   くらしノート — daily

   買い物は「何を買う」、やることは「いつまでに何をする」を答えます。
   ここが答えるのは **「あの月は、どんな月だったか」** です。過去にしか
   向いていない画面で、締切も、次にやることも出てきません。

   だから、この画面には **測るものが一つもありません**。目標も、達成率も、
   何日続いたかも、先月より多いか少ないかも出しません。積み上がったものを
   置いておくと、後から読み返せる——それだけの場所です。

   一画面に、ずっと四つ並びます（前は「月」「種」で面を分けていましたが、
   やめました。種はお気に入り・完了の印・並び替えで見つかるので、
   専用の場所は要りません）。

     ①こよみ        … 他のタブと同じ作り（週／月・フリック・輪）
     ②月の積み上がり … その月の内訳。数だけを言うので、常に短く
     ③Daily Log     … その日あったこと・したこと。一、二行
     ④積み上げ項目   … 読書・学習・種・達成・変化。並び替えとお気に入り付き

   カレンダーは、やること・ダイエットと**同じコード**にしてあります
   （置き場所と印だけを変えて三つ目を足す、という前二つと同じやり方です）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon } = U;
  const store = KN.store;

  /* 日記の本文を、いま読める・書けるか（js/diary-idb.js の body()）。
     "loading" は開いた直後の一瞬（写しとの突き合わせの途中）で、本文を
     書かせない・書き出させない。"off" は大きな保存場所を読めなかった日で、
     本文だけ「読めません」と出して書かせない（docs/storage.md）。 */
  const diaryBody = () => (KN.diaryIdb ? KN.diaryIdb.body() : "ok");
  const UNREAD = "読めません";
  const MISSING = "本文が見つかりません";
  /** 本文を元から外した行（store.memoOut。docs/storage.md の「段2の案」）の、
      本文の欄に出す字。印の行でなければ null。印の行は本文のある日です
      ——写しから戻る前は「読み込み中」、写しにも無ければ「本文が見つかりません」。 */
  function outText(d) {
    if (!store.memoOut(d)) return null;
    const b = diaryBody();
    return b === "loading" ? "読み込み中" : b === "off" ? UNREAD : MISSING;
  }
  /* 日記だけの鍵（js/lock.js）。閉じているあいだ本文は出さず、読む・写す手前で開けてもらう。 */
  const diaryShut = () => !!(KN.lock && KN.lock.hides("diary"));
  const askDiary = () => (KN.lock ? KN.lock.ask() : Promise.resolve(true));
  const SHUT = html`<span class="arc-diary-shut">${icon("lock")}開ける</span>`;

  /** 本文に触る操作の前に。できないときは理由を言って true を返します。 */
  function bodyBlocked() {
    const b = diaryBody();
    if (b === "ok") return false;
    if (b === "loading") {
      KN.ui.toast("日記を読み込んでいるところです");
    } else {
      const again = KN.diaryIdb.retry();
      KN.ui.toast(again ? "日記の保存場所を、もう一度読みにいっています"
        : "日記の本文を読めません");
    }
    return true;
  }

  let root = null;
  /* 暦の厚みを測り直す。mount が中身を入れます（render から呼びます）。 */
  let fitCalH = () => {};
  let els = {};

  /* 見ている月。null は「今月」。 */
  let viewMonth = null;
  /* 日で絞っているとき、その日。null は「月ぜんぶ」。 */
  let viewDay = null;

  /** daily の見え方の設定。まとめてここから読みます（既定はぜんぶ「出す」）。 */
  const S = () => store.get().settings;

  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const curYm = () => viewMonth || ymOf(new Date());
  const ymParts = (ym) => ({ year: +ym.slice(0, 4), month: +ym.slice(5, 7) - 1 });
  const isThisMonth = () => curYm() === ymOf(new Date());
  /** 値が無ければ「-」。空欄をグレーの説明文で埋めない、という決めごとの担当。 */
  const orDash = (v) => (v == null || v === "" ? "-" : v);

  /** 見ている日。日を選んでいなければ、今日（その月でなければ月の頭）。 */
  const focusDay = () => viewDay || (isThisMonth() ? U.todayKey() : `${curYm()}-01`);
  /** 一日ぶんだけ出すか、月ぜんぶを並べるか。**既定は一日ぶん**。 */
  const oneDayLog = () => S().dailyScope !== "month";
  /* 日記を時刻ごとに見せるか（思考のホーム。既定は時刻ごと、設定で「一枚」。docs/thinking.md）。
     本文の形はどちらも同じ一つの文字。変わるのは見せ方と書く紙だけ。 */
  const chatView = () => S().diaryView !== "page";

  /** ＋ で書く先の日。まだ来ていない日を見ているときは、今日へ書きます。 */
  const writeDay = () => (viewDay && viewDay <= U.todayKey() ? viewDay : U.todayKey());

  /* 他のタブで日が動いていたら、その日を引き取ります（util の dayShare。
     席を移るとき app.js の show() が置いていきます）。月もその日へ。 */
  let dayVer = 0;
  function takeSharedDay() {
    const t = U.dayShare.take(dayVer);
    dayVer = t.ver;
    if (!t.day || t.day === focusDay()) return;
    const today = U.todayKey();
    viewDay = t.day === today ? null : t.day;
    const ym = t.day.slice(0, 7);
    viewMonth = ym === ymOf(new Date()) ? null : ym;
  }

  /** クリップボードへ。断られたら false を返します（写すのは KN.util.copy 一か所）。 */
  function copyText(text) { return U.copy(text); }

  /** その日の日記・起床就寝・やること・買うもの・からだ（ダイエット）を、
      ひとつの文にまとめます。日付は書きません——地の文（本文）の頭に
      本人がすでに書く習慣なので、ここでまた書くと二重になります。
      dayFeed が返すのは**その日に済ませた**ものだけ（未完了は含みません）
      ——写さず引く作りなので、Daily Log の行がすでに言っていることと
      同じ材料です。
      見出しは「完了したこと」「購入したもの」のように**済んだこと**だと
      分かる言い方にしてあります——この文をAIに渡したとき、まだやって
      いない予定だと誤読されないようにするためです。 */
  const DIET_SLOTS = [
    { id: "breakfast", label: "朝食" },
    { id: "lunch", label: "昼食" },
    { id: "dinner", label: "夕食" },
    { id: "snack", label: "間食" },
  ];

  function dailyCopyText(day) {
    const cur = store.dayLog(day) || {};
    const blocks = [];
    const memo = (cur.memo || "").trim();
    if (memo) blocks.push(memo);
    if (cur.wake || cur.sleep) blocks.push(`起床 ${orDash(cur.wake)} ・ 就寝 ${orDash(cur.sleep)}`);
    const feed = store.dayFeed(day);
    const todos = feed.filter((f) => f.src === "todo");
    const items = feed.filter((f) => f.src === "item");
    if (todos.length) blocks.push(["完了したこと（この日にやり終えたもの）", ...todos.map((t) => `・${t.title}`)].join("\n"));
    if (items.length) blocks.push(["購入したもの（この日に買い終えたもの）", ...items.map((i) => `・${i.title}`)].join("\n"));

    /* からだの記録は KN.diet.dayCard がすでに一日ぶんへ束ねてある値を使います
       （体重・歩数・総消費・睡眠・飲酒、それぞれ store.healthValue /
       weightOfDay / drinkTotals から）。ここで数えなおしません——数える
       場所が二か所になると、どちらかだけ直した日に食い違います。
       目標に対する割合は出しません（daily は評価しない、の一部）。

       歩数・総消費・睡眠はヘルスケアから自動で入ってくる値なので、日が
       終わっていなければ**まだ途中の数**です。ここに書くのは値だけ——
       何時時点かは画面（`.js-fresh`）がすでに言っているので、コピーする
       文にまで添えません（二重に言うと、かえって長くなるだけです）。 */
    const card = KN.diet.dayCard(day);
    const bodyParts = [];
    if (card.weight && card.weight.kg != null) bodyParts.push(`体重 ${card.weight.kg}kg`);
    if (card.weight && card.weight.fat != null) bodyParts.push(`体脂肪率 ${card.weight.fat}%`);
    if (card.steps != null) bodyParts.push(`歩数 ${Math.round(card.steps).toLocaleString()}歩`);
    if (card.burned != null) bodyParts.push(`総消費 ${Math.round(card.burned).toLocaleString()}kcal`);
    if (card.sleep != null) bodyParts.push(`睡眠 ${Math.floor(card.sleep / 60)}時間${String(Math.round(card.sleep % 60)).padStart(2, "0")}分`);
    if (card.drinkTotals) bodyParts.push(`飲酒 純アルコール${card.drinkTotals.alcoholG}g`);
    if (bodyParts.length) blocks.push(["からだの記録", `・${bodyParts.join(" ・ ")}`].join("\n"));

    const mealLines = DIET_SLOTS
      .map((sl) => ({ ...sl, text: (store.slotMemo(day, sl.id) || "").trim() }))
      .filter((sl) => sl.text)
      .map((sl) => `・${sl.label}: ${sl.text}`);
    if (mealLines.length) blocks.push(["食べたもの（この日に食べ終えたもの）", ...mealLines].join("\n"));

    /* 先の予定・長期タスク（まだ済んでいないもの）は写しません（2026年10月5日、
       利用者）。日が変わってもほとんど同じで、この日の記録ではないため。 */
    return blocks.join("\n\n");
  }

  /** その日へ移る。月をまたいでも暦がついてくるように、二つ一緒に動かします。 */
  function goToDay(day) {
    if (!day) return;
    viewMonth = String(day).slice(0, 7);
    viewDay = day;
    render();
    // 暦は上にあるので、押した位置から画面ごと頭へ戻します。
    if (root) root.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================================================================
     こよみ

     やること・ダイエットのカレンダーと、作りをそろえてあります
     （週⇄月・フリックで月送り・今日の赤丸・選んだ日の緑の輪）。
     新しく考えたのは「どの日にどの色の粒が乗るか」だけです。
     ================================================================ */

  const calOpen = () => store.calPrefs("archive").open;
  const calShown = () => store.calPrefs("archive").shown;

  function markWeek(sec, here) {
    const open = calOpen();
    const shown = calShown();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !shown);
    /* 「どれだけ開いているか」を一つの数（0＝週、1＝月）で持ちます。題の
       右の「›」の傾きも、隣の週の濃さも、これを見て決まります。指で
       引いているあいだは、この数が指について動きます（やることと同じ）。 */
    if (root) KN.util.setVar(root, "--cal-p", open ? "1" : "0");
    /* 「週／月」の札はここにありました。題（日付）を押す形に移したので、
       塗るものはもうありません——開いているかどうかは、題の右の「›」が
       回ることで言います（paintDayTitle）。 */
    paintDayTitle();
    if (open) {
      sec.querySelectorAll(".is-off-week").forEach((c) => c.classList.remove("is-off-week"));
      return;
    }
    tagOffWeek(sec, here);
  }

  /** いまの週の外にあるマスに印を付けます。週で見ているときは CSS が隠し、
      指で引いているあいだは、その印が「濃さ」の目印になります。 */
  function tagOffWeek(sec, here) {
    const first = sec.querySelector(".cal-day");
    const hasHere = !!sec.querySelector(`.cal-day[data-day="${here}"]`);
    const anchor = hasHere ? here : (first ? first.dataset.day : here);
    const w = U.weekOf(anchor);
    sec.querySelectorAll(".cal-day").forEach((c) => {
      const k = c.dataset.day;
      c.classList.toggle("is-off-week", k < w.from || k > w.to);
    });
    const padsOn = !!first && first.dataset.day >= w.from && first.dataset.day <= w.to;
    sec.querySelectorAll(".cal-pad").forEach((c) => c.classList.toggle("is-off-week", !padsOn));
  }

  /** 画面の題に、いま見ている日を書きます（やること・ダイエットと同じ
      ひと組。書式は KN.util が持ちます）。

      「日を選んでいなければ月まで」という書き方をしていました。あれは
      月ぜんぶを縦に並べていたころの決めごとで、紙が一日ぶんになったいま、
      題だけ月を言うと**紙と題が違うことを言います**。日を選んでいない
      ときに紙が出しているのは focusDay()——そこを、そのまま題にします。 */
  function paintDayTitle() {
    // 帯は全タブで一つ。持ち主でないときに塗ると、よそのタブの題を上書きします。
    if (!els.dayRow || !mine()) return;
    KN.util.paintDayTitleInto(els.dayRow, focusDay(), "押すと月を選ぶ");
    els.dayTitle.setAttribute("aria-expanded", String(calOpen()));
  }

  function shownMonth() {
    if (viewMonth) return ymParts(viewMonth);
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  function moveRing(grid, cell, jump) {
    if (!grid) return;
    let ring = grid.querySelector(".cal-ring");
    if (!ring) {
      ring = node(html`<i class="cal-ring is-jump" aria-hidden="true"></i>`);
      grid.prepend(ring);
    }
    if (!cell) { ring.classList.remove("is-on"); return; }
    const n = cell.querySelector(".cal-n");
    if (!n) return;
    const g = grid.getBoundingClientRect();
    const b = n.getBoundingClientRect();
    if (!g.width || !b.width) return;
    const first = !ring.classList.contains("is-on");
    ring.classList.toggle("is-jump", !!jump || first);
    ring.style.transform = `translate(${(b.left - g.left).toFixed(1)}px, ${(b.top - g.top).toFixed(1)}px)`;
    ring.classList.add("is-on");
    if (jump || first) {
      requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.remove("is-jump")));
    }
  }

  function calendar() {
    /* 見出しの行（月・年・「週」の札・‹ ›）は、まるごと上のバーへ移しました
       ——やることと同じ組みです。日付の題そのものが「押すと暦が開く」
       ボタンで、月をめくるのは横に払う手つき。

       「今月へ」の札は無くしました。隠れているあいだは場所を取らない
       ボタンでしたが、出た瞬間だけ暦の高さが伸びて、下の紙が押し下げ
       られていました。今月へ戻る道は、暦を送って探すことで足ります。 */
    const sec = node(html`<section class="cal"></section>`);
    /* 三層（曜日の行／伸び縮みする窓／その中のずらしと日のマス）は
       cal-peek.js が組みます。やることの暦と、同じものを使うためです。 */
    const grid = KN.calPeek.mount(sec).grid;

    /* 暦を横に払ったときの送りは、出しているものに合わせます——月ぜんぶ
       なら月、週だけならその週。前は常に月へ飛んでいて（週で見ていても
       月ごと動いた）、押した先に自分の週が無くなっていました。
       手つきは三画面で分け合う一つ（js/cal-swipe.js）です。 */
    KN.calSwipe.wire({
      sec, grid,
      isWeek: () => !calOpen(),
      here: focusDay,
      step: stepWeek,
      monthGrid: monthGridFor,
      go: (delta) => { if (calOpen()) goMonth(delta); else goWeek(delta); },
    });
    return sec;
  }

  /** 週を送った先の日。先の週へも行けます（2026年10月10日・利用者「未来にも普通にスワイプできるように」）。 */
  function stepWeek(delta) {
    return U.shiftDay(focusDay(), delta * 7);
  }

  /** その月ぶんの日のマス。隣の週を先に見せるために cal-swipe が呼びます
      （作りは四つの暦で一つ——KN.calGrid）。 */
  const monthGridFor = KN.calGrid.monthGridFor({
    live: () => els.cal, shown: () => shownMonth(), fill: (tmp, only) => fillCalendar(tmp, only),
  });

  /** 月を送ります。暦を払っても、紙を払っても、ここへ来ます。 */
  function goMonth(delta, quiet) {
    const m = shownMonth();
    const d = new Date(m.year, m.month + delta, 1);
    if (!quiet) KN.motion.fire("select");
    viewMonth = ymOf(d) === ymOf(new Date()) ? null : ymOf(d);
    viewDay = null;
    render();
    return true;
  }

  /** 週を送ります。暦が週だけを出しているとき、横に払うとここへ来ます。
      日を送る道と同じ `goDayTo` に乗せます——月をまたいでも暦がついて
      くる仕事は、もう向こうが持っているので。先の週へも行けます（先の紙は見るだけ）。 */
  function goWeek(delta) {
    const next = U.shiftDay(focusDay(), delta * 7);
    KN.motion.fire("select");
    goDayTo(next);
  }

  /* ---------------- 月を選ぶ ----------------

     題を押したときに開きます。前はここで暦の開き具合（週／月）を切り替えて
     いましたが、**それは紙を引く手つきがもう持っています**（cal-peek）。
     同じことを二か所でやっていて、しかも題が言っているのは「2026年9月」
     ——年と月なので、押したときに応えるべきなのは「ほかの月へ」です。

     daily は月ぶんを出す画面なので、行き先は日ではなく月にします。日は、
     月を出してから暦の中で選ぶ、という順です。 */
  function openMonthPicker() {
    const now = new Date();
    const nowYm = ymOf(now);
    const here = shownMonth();
    let year = here.year;

    const body = node(html`
      <div class="stack gap-3">
        <div class="mp-head">
          <button type="button" class="icon-btn js-py flip-x" aria-label="前の年">${icon("chevron")}</button>
          <span class="mp-year js-y"></span>
          <button type="button" class="icon-btn js-ny" aria-label="次の年">${icon("chevron")}</button>
        </div>
        <div class="mp-grid js-grid"></div>
      </div>
    `);

    /* 一つを選ぶだけなので小窓（roadmap-unify の U15）。題からふくらみ、閉じれば題へ帰る。
       帯の暦より上に出す（lift）。 */
    const handle = KN.ui.popOver(els.dayTitle, { side: "left", label: "月を選ぶ", cls: "is-month", lift: true });
    handle.el.append(body);

    const grid = body.querySelector(".js-grid");
    const yEl = body.querySelector(".js-y");

    function paint() {
      yEl.textContent = `${year}年`;
      // 先の年へは行けません（まだ書かれていない月なので）。
      body.querySelector(".js-ny").disabled = year >= now.getFullYear();
      grid.innerHTML = "";
      for (let m = 0; m < 12; m++) {
        const ym = ymOf(new Date(year, m, 1));
        const ahead = ym > nowYm;
        const cell = node(html`
          <button type="button" class="mp-cell ${ym === ymOf(new Date(here.year, here.month, 1)) ? "is-here" : ""}
                  ${ym === nowYm ? "is-now" : ""}" ${ahead ? "disabled" : ""}>${m + 1}月</button>
        `);
        if (!ahead) {
          cell.addEventListener("click", () => {
            KN.motion.fire("select");
            viewMonth = ym === nowYm ? null : ym;
            viewDay = null;
            handle.close();
            render();
          });
        }
        grid.append(cell);
      }
    }
    body.querySelector(".js-py").addEventListener("click", () => { year--; paint(); });
    body.querySelector(".js-ny").addEventListener("click", () => {
      if (year < now.getFullYear()) { year++; paint(); }
    });
    paint();
    handle.place();
  }

  /* ---------------- 左右に払って、日を送る ----------------

     紙に出ているのは「その日」なので、払って動くのも日です（月は上の題を
     押せば選べます）。先の日へは行きません——記録を見るところで、まだ
     来ていない日には記録がないので。

     仕掛けそのものは js/day-swipe.js が持ちます（やること・ダイエットと
     分け合うため）。ここが答えるのは「いま見ている日は何か」「隣はどこか」
     「その日の紙をどう組むか」「決まったら何をするか」だけです。

     **動くのは紙そのもの**です。前は指が離れてから中身を差し替えて、
     22px ぶんだけ横から入れていました——払っている最中は何も動かないので、
     指がどこまで行けば送られるのかが絵に出ていませんでした。 */
  let swiping = false;

  /** その隣の日。先の日へも行けます（2026年10月10日・利用者「未来にも普通にスワイプできるように」）。 */
  function stepDay(key, dir) {
    const d = U.dayDate(key);
    if (!d) return null;
    const next = U.dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir));
    return next;
  }

  /** その日へ移ります（暦の月も、その日を含む月へ連れていきます）。

      `opts.keep` は「紙はもうそこに居るので、組み直さなくてよい」の合図です
      （横に払って着いたとき）。そのときは紙の**外**だけを塗ります。 */
  function goDayTo(key, opts) {
    const was = focusDay();
    const ym = key.slice(0, 7);
    viewMonth = ym === ymOf(new Date()) ? null : ym;
    viewDay = key === U.todayKey() ? null : key;
    if (!(opts && opts.keep)) { render(); return; }
    /* 払って着いた紙は、もうこの日の紙です（次に組み直すとき、読んでいた位置へ返す相手）。 */
    laidDay = focusDay();
    /* 組み直さないので、季節の絵もここで着いた日の候へ（払うと前の候のままだった）。 */
    if (KN.seasonArt) KN.seasonArt.apply(root, laidDay, "daily");
    const here = viewDay || U.todayKey();
    if (els.cal) {
      markWeek(els.cal, here);
      const grid = els.cal.querySelector(".cal-grid");
      const cell = els.cal.querySelector(`.cal-day[data-day="${here}"]`);
      /* **`is-here` も付け替えること。** ここは組み直しのときに
         `fillCalendar` が書いている印で（やることの `paintHere` にあたる
         ものが、この画面には無い）、組み直さないと前の日に残ります
         ——輪だけが動いて、色の付いたマスが一日ずれる。 */
      els.cal.querySelectorAll(".cal-day.is-here")
        .forEach((c) => c.classList.remove("is-here"));
      if (cell) cell.classList.add("is-here");
      /* 週をまたいだら、週の帯を送った向きから滑り込ませ、輪は滑らせずに
         置き直します（やることの commit と同じ）。 */
      const crossed = U.otherWeek(was, here);
      if (crossed) U.slideWeek(els.cal, here > was ? 1 : -1);
      if (grid) moveRing(grid, cell, crossed);
    }
  }

  function wireDaySwipe(viewport, track, surface) {
    KN.daySwipe.wire({
      viewport,
      track,
      surface,
      day: focusDay,
      step: stepDay,
      slide: daySlide,
      /* **組み直しません。** 滑りきった `kept` が、もう「その日」の紙です
         （`daySlide` は覗き見用の作りを持たないので、そのまま本物です）。
         塗り直すのは紙の**外**だけ——週の帯と題（`markWeek`）と、暦の輪。

         月をまたいだときは盤ごと変わるので、そこだけ組み直します。 */
      commit: (key, kept) => {
        const now = viewMonth || ymOf(new Date());
        const crossed = key.slice(0, 7) !== now;
        goDayTo(key, { keep: !!kept && !crossed });
      },
      lock: (on) => { swiping = on; },
    });
  }

  /* その日の積み上げ。やることのカレンダーと同じ絵で出します
     （`.cal-mark`——種類の色に染まった丸の中に、その種類の絵）。三つまで。
     log だけあって積み上げが無い日は、灰色の小さな一粒にします——書いた
     ことは書いたことなので、何も出さないと「その日は空白」に見えて
     しまいます。 */
  /**
   * @param {Element} sec  組む先の `.cal`
   * @param {{year:number,month:number}} [only]  その月で組みます。渡すのは
   *   **離れたところへ組むとき**だけ（隣の週を先に見せるため）。そのぶんは
   *   画面に出ないので、最後の二つ——いまの週の印と、選んだ日の輪——は
   *   置きません。置くと、出ていない盤のために生きている題まで塗り直します。
   */
  function fillCalendar(sec, only) {
    const today = U.todayKey();
    const { year, month } = only || shownMonth();
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    const logged = {};
    store.daysOfMonth(ym).forEach((d) => { logged[d.date] = true; });

    /* 日の印は log の点だけ（積み上げの種類の絵は、積み上げをやめて外した。2026年10月12日）。 */
    const grid = KN.calGrid.fill(sec, {
      year, month, here: viewDay || today,
      mark: (key, out) => {
        if (out) return { html: "" };
        return { html: logged[key] ? '<i class="is-log"></i>' : "", label: logged[key] ? " log あり" : "" };
      },
      /* 押せば、その日へ移ります。その月のマスは先に輪だけ動かします。 */
      pick: (key, cell, out) => {
        KN.motion.fire("select");
        viewDay = key === U.todayKey() ? null : key;
        const at = String(key).slice(0, 7);
        viewMonth = at === ymOf(new Date()) ? null : at;
        if (!out) moveRing(grid, cell);
        render();
      },
    });
    if (only) return;                     // 離れたところへ組んだぶん（上を参照）
    markWeek(sec, viewDay || today);
    moveRing(grid, grid.querySelector(`.cal-day[data-day="${viewDay || today}"]`), true);
  }

  /* ---------------- 紙を下に引くと、月が出てくる ----------------

     やることと同じ仕掛けです（js/cal-peek.js）。ここが答えるのは「この
     画面では何が『いま見ている日』か」「いつ引いてよいか」だけ。

     この画面は一日ずつではなく**月ぶん**を出しているので、窓に来る週は
     「選んでいる日」か、選んでいなければ今日の週です。 */
  function wireCalPull(el) {
    KN.calPeek.wire({
      sheet: el,
      root,
      cal: () => els.cal,
      isOpen: calOpen,
      isShown: calShown,
      // 暦をしまっていても引けます（そこから週へ戻す道がここなので）。
      /* 暦を横に払っている最中は、この指は向こうのものです（cal-swipe が
         生きている盤を運んでいるので、ここで高さまで書くと二つが同じ
         ものを取り合います）。 */
      busy: () => KN.calSwipe.isActive(),
      here: () => viewDay || U.todayKey(),
      tagOffWeek,
      /* 三段（暦なし・週・月）ぶんを、まとめて書きます。段が変わらなかった
         ときだけ塗り直し——書けば store が組み直すので、二度手間になります。 */
      commit: ({ shown, open }) => {
        if (open !== calOpen() || shown !== calShown()) {
          store.setCalPref("archive", { open, shown });
        } else markWeek(els.cal, viewDay || U.todayKey());
      },
    });
  }


  /* ================================================================
     ②あの日 — 貯めたものを、返すところ
     ================================================================

     ここまで作ったのは貯める器だけでした。一年ぶん書けるようにしても、
     書いたものが自分から出てこなければ、そのうち開かれなくなります。

     出し方には線が一本あります。**無い過去のことは、何も言わない。**
     「1年前の今日はこう書いていました」は思い出ですが、「去年は書いて
     いたのに今年は」は採点です。だから見つからなければ**枠ごと出しません**
     ——「まだ記録がありません」も出しません。それも「無い」を数えた言葉です。

     出すのは一日ぶん、一枚だけ。並べると流れになり、流れは読み飛ばすもの
     になります。選び方は store.archiveThen にあります。 */

  /* 同じ日の年々（R9）。同じ月日の記録が二年以上あるときだけ、紙の10年日記
     のように年ごとに一行ずつ（遠い年から）。記録の無い年は行ごと出しません
     ——空いた年を置くと、書かなかった年の一覧になります。年の数も言いません。
     一行ずつ押せて、その日へ行きます（だから枠はボタンではなく、行がボタン）。 */
  function yearsCard(years) {
    const dt = U.dayDate(years[0].date);
    const md = dt ? `${dt.getMonth() + 1}月${dt.getDate()}日` : "";
    const rowText = (y) => (diaryBody() === "off" ? null : y.memo);
    const sec = node(html`
      <div class="card arc-then is-years">
        <span class="arc-then-head">
          <span class="arc-then-ico">${icon("clock", "is-sub")}</span>
          <b>あの日</b>
          <i class="arc-then-when">${md}の年々</i>
        </span>
        ${U.raw(years.map((y) => {
          const t = rowText(y);
          const yr = String(y.date).slice(0, 4);
          return `<button type="button" class="arc-year" data-day="${U.escapeHtml(y.date)}">`
            + `<span class="arc-year-y">${yr}年<small>${U.escapeHtml(U.weekdayJa(y.date))}</small></span>`
            + (t == null
              ? `<span class="arc-year-text is-blank">${UNREAD}</span>`
              : `<span class="arc-year-text">${U.escapeHtml(t)}</span>`)
            + `</button>`;
        }).join(""))}
      </div>
    `);
    sec.querySelectorAll(".arc-year").forEach((b) => b.addEventListener("click", () => {
      KN.motion.fire("select");
      goToDay(b.dataset.day);
    }));
    return sec;
  }

  function thenCard() {
    if (diaryShut()) return null;
    const years = store.archiveYears();
    if (years) return yearsCard(years);
    const then = store.archiveThen();
    if (!then) return null;             // 無ければ、何も置かない

    const dt = U.dayDate(then.date);
    const when = dt ? `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${U.weekdayJa(then.date)}` : then.date;

    const sec = node(html`
      <button type="button" class="card arc-then" data-day="${then.date}">
        <span class="arc-then-head">
          <span class="arc-then-ico">${icon("clock", "is-sub")}</span>
          <b>あの日</b>
          ${then.label ? html`<i class="arc-then-when">${then.label}</i>` : ""}
        </span>
        <span class="arc-then-date">${when}</span>
        ${diaryBody() === "off"
          ? html`<span class="arc-then-memo is-blank">${UNREAD}</span>`
          : html`<span class="arc-then-memo">${then.memo}</span>`}
      </button>
    `);
    sec.addEventListener("click", () => {
      KN.motion.fire("select");
      goToDay(then.date);
    });
    return sec;
  }

  /* 「◯月の積み上がり」の一行は、ここにありました。

     消したのは要らないからではなく、**同じものを二度出していた**からです。
     あの行は 読書2・学習1・種1・達成1・変化1 と並べ、その下の絞り込みの札は
     すべて・読書・学習・種・達成・変化 と並んでいました。同じ五つの、数える
     ほうと押すほうです。数を札のほうへ入れて、行そのものを畳みました。

     言葉も一つ減ります。「積み上がり」と「積み上げ」が縦に並んでいて、
     別のものを指しているのに一字しか違いませんでした。残るのは「積み上げ」
     だけです。 */

  /* ================================================================
     ③ Daily Log — その日あったこと・したこと
     ================================================================ */

  function dailyLog(ym, day) {
    /* **その日ぶんだけ**を紙に出します（設定で月ぜんぶにも戻せます）。

       月ぜんぶを縦に並べていました。書いた日が増えるほど、今日の一行は
       下へ流れていきます——毎日開くのは「今日を書く」ためなのに、今日が
       だんだん遠くなる、という作りでした。日を移すのは暦のほうの役目です。

       その日にまだ何も無いときは、**空のまま一行を出します**。無いことを
       言うためではなく、押せば書けるところがそこに要るからです。 */
    /* どの日ぶんを出すか。隣の日の紙を組むときは、その日を渡してもらい
       ます（day-swipe.js の slide）——渡されなければ、いま見ている日。 */
    const only = oneDayLog() ? (day || focusDay()) : viewDay;
    const all = store.daysOfMonth(ym);
    const mine = only ? all.filter((d) => d.date === only) : all;
    /* 記録の無い日は、**空の一行**を作って出します。`isBlank` を立てて
       おくのは、`createdAt` の有無で見分けると取りこぼすから——古い記録は
       持っていないことがあります。 */
    /* 「何も書いていない日」は、**記録が無い日だけではありません。**
       日記の紙を開いて何も書かずに閉じると、`ensureDayLog` が空の一件を
       置いていきます。それを「ある日」として描くと、意味のない横棒が
       四つ並びました——「20 日　—　起床 - ・ 就寝 -　作成 -」。
       決めごとは「書いていない日は、起床・就寝も帳簿も出さない」なので、
       **有無ではなく中身で見分けること。** */
    // 本文を外した行（印）は、本文のある日です。
    const blank = (d) => !String(d.memo || "").trim() && !d.wake && !d.sleep && !store.memoOut(d);
    const days = (only && !mine.length ? [{ date: only, memo: "", isBlank: true }] : mine)
      .map((d) => (d.isBlank || blank(d)) ? Object.assign({}, d, { isBlank: true }) : d);
    const sec = node(html`
      <section class="card arc-log">
        <header class="arc-log-head">
          ${/* 見出しから年月を外しました。すぐ上の暦が「8月 2026」と言っていて、
                さらにその上の帯も月を言っていた——一画面に三回。行そのものは
                日の数字を持っているので、ここは名前だけで足ります。

                「今日を書く」のボタンも外しました。すぐ下の行そのものが
                押せば開くもので、＋の中にも同じ口があります——同じことへ
                三つ目の入口を作ると、見出しの重さがそのぶん増えるだけです。 */""}
          <h2>Daily Log</h2>
          ${/* 月ぜんぶを並べる設定のときは、見出しの下に複数の日が並ぶので
                「どの日を」が一つに決まりません。一日ぶんのときだけ出します。 */
              oneDayLog() ? html`
            <button type="button" class="icon-btn js-log-copy" aria-label="この日の記録をコピー">
              ${icon("copy")}
            </button>` : ""}
        </header>
        ${/* 季節のひとこと（R2）。その日の二十四節気と七十二候を、日付の行の
              すぐ上に小さく一行（当たる日だけ、雑節・五節句と祝日も一行ずつ。
              roadmap-3.1 の K1・K2。並べるのは KN.season.rows）。一日ぶんのときだけ——月ぜんぶでは「どの日の」が
              一つに決まらないので。色は変えず、字を一行足すだけ。数えも比べも
              しない、ただの暦の言葉です（daily は評価しない）。 */
            only && S().showSeason !== false && KN.season ? html`
          <p class="arc-season" data-day="${only}">${KN.season.rows(only).map(([k, v, span], i) => html`<span class="arc-season-row${seasonTurn(only, i) ? " is-turn" : ""}"><span class="arc-season-k">${k}</span>${v}<span class="arc-season-span">${span}</span></span>`)}</p>` : ""}
        <div class="arc-log-body"></div>
      </section>
    `);
    const body = sec.querySelector(".arc-log-body");
    const copyBtn = sec.querySelector(".js-log-copy");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      if (diaryShut()) { askDiary(); return; }   // 開けたら、もう一度押して写す
      if (bodyBlocked()) return;   // 写しから戻るはずの本文が、まだ入っていないことがある
      copyText(dailyCopyText(only)).then((ok) => {
        KN.motion.fire("select");
        KN.ui.toast(ok ? "コピーしました" : "コピーできませんでした");
      });
    });

    if (!days.length) {
      body.append(node(html`<p class="arc-log-empty">-</p>`));
    }
    /* 大きな保存場所を読めなかった日は、本文の欄だけ「読めません」。書いて
       いない日も同じ字にします——元から本文を外したあと（次の段）は、どの日に
       書いてあったかも分からないので、いまからその形に揃えておきます。 */
    const unread = diaryBody() === "off";
    const shutNow = diaryShut();
    days.forEach((d) => {
      const shut = shutNow && !d.isBlank && !unread && !!(String(d.memo || "").trim() || store.memoOut(d));
      /* 時刻ごと（既定）：書いた日は一件ずつ。空の日・読めない日・本文を外した日は下の一行のまま
         （押せば書く紙。言うことも色も一枚のときと同じ）。 */
      if (chatView() && !d.isBlank && !unread && !outText(d) && !shut) {
        body.append(chatRow(d));
        const feed = feedRows(d.date);
        if (feed) body.append(feed);
        return;
      }
      const dt = U.dayDate(d.date);
      const edited = d.updatedAt && d.createdAt && d.updatedAt !== d.createdAt;
      const out = unread ? null : outText(d);
      /* **button ではなく div です。** iOS も含め、button の中の字は選べません
         （長押しは「押しっぱなし」として扱われ、選択もコピーの吹き出しも
         出ません）。ここに出ているのはその日に書いた文そのものなので、
         開き直さずに拾えるほうが自然です。押せることは role と tabindex と
         下の keydown で持たせます——見た目も振る舞いも今までどおり。 */
      const row = node(html`
        <div role="button" tabindex="0" class="arc-log-row ${d.date === U.todayKey() ? "is-today" : ""}"
             data-day="${d.date}">
          <span class="arc-log-day">
            <b>${String(dt ? dt.getDate() : "")}</b>
            <i>${dt ? U.weekdayJa(d.date) : ""}</i>
          </span>
          <span class="arc-log-text">
            ${/* 何も書いていない日の一行は、**押せば書けることを言います**。
                  「—」だけでは押せる行だと伝わらず、日記のいちばん大事な入口が
                  横棒一本になっていました（docs/improvements.md の B8）。
                  言うのは一日ぶんを出しているときだけ——月ぜんぶを並べると、
                  書いていない日ごとに同じ字が並んで「書かなかった日」の一覧に
                  見えるので、そちらは「—」のまま。色は薄い字（`.is-blank`）の
                  まま、責める色は当てません（daily は評価しない）。 */""}
            ${/* 「数行」は**終わりの数行**（2026年10月6日、利用者）。日記は頭に決まった行が
                  並ぶので、その日の地の文は終わりのほうにある。下に寄せて上を切ります。 */""}
            <span class="arc-log-memo ${S().logFull === false ? "is-tail" : ""} ${d.isBlank || unread || out ? "is-blank" : ""}"
                  style="--tail-n: ${S().logLines === 3 ? 3 : 5}"
                  ><span>${shut ? SHUT : unread ? UNREAD : out || (d.isBlank ? (only ? "この日のことを書く" : "—") : orDash(d.memo))}</span></span>
            ${/* その日のことを言う時刻（起床・就寝）と、書いた記録の時刻
                  （作成・更新）が、数字として同じ顔で並んでいました。前者は
                  中身、後者は帳簿です。帳簿のほうを薄い地に沈めて、目が
                  中身のほうに先に行くようにします。どちらも、要らない人は
                  設定で消せます（数字が四つ並ぶのが邪魔なときがあるので）。 */""}
            ${S().showDayTimes === false || d.isBlank ? "" : html`
              <span class="arc-log-times">起床 ${orDash(d.wake)} ・ 就寝 ${orDash(d.sleep)}</span>`}
            ${S().showStamps === false || d.isBlank ? "" : html`
              <span class="arc-log-meta">
                <span class="arc-stamp">作成 ${U.formatStamp(d.createdAt) || "-"}</span>
                ${edited ? html`<span class="arc-stamp">更新 ${U.formatStamp(d.updatedAt)}</span>` : ""}
              </span>`}
          </span>
        </div>
      `);
      /* 選び終えて指を離すと click も鳴ります。そこで紙を開くと、選んだ
         そばから選択が消えます——選んでいるときは、開きません。 */
      /* 時刻ごとのときは、空の日の一行も書く紙（新しい一件）へ。 */
      const write = () => (shut ? askDiary() : chatView() && d.isBlank && diaryBody() === "ok" ? openPost(d.date, null) : openLogSheet(d.date));
      row.addEventListener("click", () => {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed
            && row.contains(sel.anchorNode)) return;
        write();
      });
      row.addEventListener("keydown", (e) => {
        if (!KN.util.isEnter(e) && e.key !== " ") return;
        e.preventDefault();
        write();
      });
      body.append(row);
      /* 上を切ったときだけ、頭を薄くして「続きは上に」を見せます。 */
      const tail = row.querySelector(".arc-log-memo.is-tail");
      if (tail) tailSeen().observe(tail);
      /* 手で書いた文の下に、その日ほかで起きたことを続けます。行の外に
         置くのは、押したときの行き先が違うからです——上の文は「その日の
         日記」を開き、下の一つ一つは**それぞれの元**を開きます。 */
      const feed = feedRows(d.date);
      if (feed) body.append(feed);
    });

    return sec;
  }

  /* 終わりの数行で頭が切れたか。行はまだ紙に付いていないので、付いて背が決まったとき
     （と字の大きさが変わったとき）に測ります。 */
  let tailRO = null;
  function tailSeen() {
    if (!tailRO) tailRO = new ResizeObserver((list) => list.forEach(({ target: m }) => {
      if (!m.isConnected) { tailRO.unobserve(m); return; }
      m.classList.toggle("is-cut", m.firstElementChild.offsetHeight > m.clientHeight + 1);
    }));
    return tailRO;
  }

  /* その日、ほかのタブで起きたこと。

     ここには**何も持っていません**。store.dayFeed が、やること・積み上げ・
     買うものから、その日ぶんを集めて返したものを並べるだけです。だから
     同じことが二度出ることも、ここから元が壊れることもありません。

     押すと、それぞれの元へ行きます。積み上げはその記録の紙が開き、
     やること・買うものはそのタブへ移ります——「ここで直せそうに見えて、
     直しても元に伝わらない」という形にだけはしないためです。 */
  const FEED_LABEL = { todo: "やること", item: "買うもの" };
  /* 出す順番。その日の並びは時刻順ですが、**枠は種類ごと**にまとまるので、
     枠そのものの順は決めておきます（日によって入れ替わると読みにくい）。 */
  const FEED_ORDER = ["todo", "item"];

  /** 時刻つきの記録の「何時何分」。ローカルの時計で読みます——
      しまってあるのは UTC の ISO なので、文字を切ると9時間ずれます。 */
  function feedClock(v) {
    const str = String(v || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return "";   // 日付だけの記録には時刻が無い
    const d = new Date(str);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function feedRows(day) {
    const feed = store.dayFeed(day);
    if (!feed.length) return null;

    /* 種類ごとにまとめます。前は一件ずつに「やること」の札を付けていて、
       五件あれば同じ札が五つ縦に並びました——同じことを繰り返し言うより、
       ひとつの枠に入れて「ここからはやること」と一度だけ言うほうが済みます。 */
    const wrap = node(html`<div class="arc-feed"></div>`);
    FEED_ORDER.forEach((src) => {
      const rows = feed.filter((f) => f.src === src);
      if (!rows.length) return;

      /* 二件以上あるときは、枠の中を左右に分けます。件数の半分で切って、
         前半が左・後半が右——上から下へ読んで、右へ折り返す形です
         （5件なら 1,2,3 が左、4,5 が右）。一件のときは分けません
         ——一列に一件だけ置いて右を空けても、幅が余るだけなので。 */
      const twoCol = rows.length >= 2;
      const box = node(html`
        <section class="arc-feed-box ${twoCol ? "is-split" : ""}" data-src="${src}">
          <h4 class="arc-feed-box-head">${FEED_LABEL[src] || ""}</h4>
          <div class="arc-feed-list"></div>
        </section>
      `);
      const list = box.querySelector(".arc-feed-list");
      if (twoCol) {
        const half = Math.ceil(rows.length / 2);
        list.style.setProperty("--rows", String(half));
      }

      rows.forEach((f) => {
        const at = feedClock(f.at);
        const row = node(html`
          <button type="button" class="arc-feed-row" data-src="${f.src}" data-feed-id="${f.id}">
            <span class="arc-feed-when">${at}</span>
            <span class="arc-feed-title">${f.title}</span>
          </button>
        `);
        row.addEventListener("click", () => {
          KN.motion.fire("select");
          /* やること・買うものは、それぞれのタブが本体です。 */
          KN.app.showScreen(f.src === "todo" ? "todo" : "list");
        });
        list.append(row);
      });
      wrap.append(box);
    });
    return wrap;
  }

  /* ================================================================
     ◯月のまとめ — Daily Log と同じ材料から

     数えるのは、あったことだけです。「何日書けたか」であって「何%達成
     したか」ではありません。割合も、続いた日数も、先月との比べも出しま
     せん——この画面が答えるのは「あの月はどんな月だったか」で、良し悪し
     ではないので。

     **日を絞っていても出します。** 前は出していませんでした——「その日ぶんは
     Daily Log の行がそのまま言っている」という理由でしたが、Daily Log が
     一日ぶんになったいま、この一段だけが月の話をします。消すと、月を
     見る手だてがどこにも無くなります。
     ================================================================ */
  function monthDigest(ym) {
    const d = store.monthDigest(ym);
    if (!d.total && !d.daysWith.length) return null;

    const { month } = ymParts(ym);
    const bits = [];
    if (d.bySrc.todo) bits.push({ label: "やること", n: d.bySrc.todo });
    if (d.bySrc.item) bits.push({ label: "買うもの", n: d.bySrc.item });

    return node(html`
      <section class="card arc-counts">
        <h3 class="arc-counts-head">${month + 1}月のまとめ</h3>
        ${bits.length ? html`
          <ul class="arc-counts-list">
            ${bits.map((b) => html`
              <li class="arc-counts-item">
                <span class="arc-counts-label">${b.label}</span>
                <span class="arc-counts-n">${b.n}</span>
              </li>`)}
          </ul>` : ""}
      </section>
    `);
  }

  /* 育休完了（終了予定）日。ユーザーに確認済みの固定日付です——ここだけ
     直接書きます。終わったらこの節ぶん（呼び出し側の「あと◯日」の行）が
     静かに出なくなります（下の remain >= 1 のガード）。 */
  const LEAVE_END_DAY = "2027-04-01";

  /** 空の日を開いたときだけ、本文の頭に日付とカウントダウンを下書きします。
      書いた跡がある日には触れません（既存の記録はそのまま）。 */
  function dailyStamp(day) {
    const dt = U.dayDate(day);
    if (!dt) return "";
    const lines = [`${day.replace(/-/g, ".")}（${U.weekdayJa(day)}）`];
    /* U.daysUntil は「今日から」の日数なので、二回呼んで引き算すれば
       「day 基準」に直せます——「今日」が両方から消えるので。 */
    const remain = U.daysUntil(LEAVE_END_DAY) - U.daysUntil(day) + 1;
    if (remain >= 1) lines.push(`育休完了まであと${remain}日`);
    return `${lines.join("\n")}\n\n`;
  }

  function openLogSheet(day) {
    /* 開いた直後（写しとの突き合わせの途中）は開きません。大きな保存場所を
       読めなかった日は、本文の欄を出さずに開きます——起きた・寝たは本文では
       ないので、書けます（本文だけ「読めません」）。 */
    if (diaryShut() && (memoOf(day).trim() || store.memoOut(store.dayLog(day) || {}))) {
      askDiary().then((ok) => { if (ok) openLogSheet(day); });
      return;
    }
    const can = diaryBody();
    if (can === "loading") { bodyBlocked(); return; }
    if (can !== "ok") KN.diaryIdb.retry();
    const cur = store.dayLog(day) || {};
    /* 本文を元から外した行（印）で、写しにも本文が無い日も、本文の欄を出し
       ません。書かせると、どこかに残っているかもしれない本文の上に書くことに
       なるので（印の行は上書きしない。store.setDayLog も本文を受け取りません）。 */
    const missing = can === "ok" && store.memoOut(cur);
    const readable = can === "ok" && !missing;
    const dt = U.dayDate(day);
    const label = dt ? `${dt.getMonth() + 1}月${dt.getDate()}日(${U.weekdayJa(day)})` : day;
    const memoInit = !readable ? "" : (cur.memo || "").trim() ? cur.memo : dailyStamp(day);

    /* 文字数の上限は置きません。前は200字で止めて残りを数えていましたが、
       書ける量をこちらが決める理由がありません——短く書きたい人は短く書きます。
       数えるのをやめると、書いている最中に「あと何字」が目に入らなくなります。 */
    const body = node(html`
      <div class="stack gap-4">
        ${readable ? html`
        ${/* 見出しは置かない（2026年10月6日・利用者「見出しがおかしい」）。紙の題が「◯月◯日 の log」。 */""}
        <label class="field arc-memo-field">
          <textarea class="textarea js-memo" rows="5" aria-label="日記">${memoInit}</textarea>
        </label>` : html`
        <div class="field">
          <p class="field-hint js-memo-unread">${missing
            ? `${MISSING}（バックアップから戻せることがあります）`
            : UNREAD}</p>
        </div>`}
        <div class="arc-times">
          <label class="field">
            <span class="field-label">起床</span>
            <input type="hidden" data-when="time" data-clear class="input js-wake" aria-label="起床" value="${cur.wake || ""}">
          </label>
          <label class="field">
            <span class="field-label">就寝</span>
            <input type="hidden" data-when="time" data-clear class="input js-sleep" aria-label="就寝" value="${cur.sleep || ""}">
          </label>
        </div>
      </div>
    `);

    /* 「この日を『あの日』に出さない」の札は外した（2026年10月6日・利用者「要らない」）。
       付いている印（store の quiet）と、その効き目はそのまま残す。 */

    KN.ui.whenFields(body);
    const memo = body.querySelector(".js-memo");
    const wakeEl = body.querySelector(".js-wake");
    const sleepEl = body.querySelector(".js-sleep");

    /* 打った先から保存します。「保存」を押さずに閉じても残る——押し忘れで
       消えるほうが、間違って残るよりずっと痛いので（食事の四枠と同じ考え）。
       打つたびに書くと重いので、手が止まってから 500ms 後に一度だけ。 */
    let timer = 0;
    /* 下書きした日付・カウントダウンは、開いただけでは保存しません。
       ここを cur.memo（元の値）ではなく memoInit（下書き後の値）に
       しておけば、何も打たずに閉じたときは「変わっていない」扱いになり
       ます——空の日を覗いただけで記録ができてしまうのを防ぎます。 */
    let last = JSON.stringify([memoInit, cur.wake || "", cur.sleep || ""]);
    const first = last;
    /* 下書き（日付とカウントダウン）は、**本文に触れたときだけ**残します。
       保存は本文・起床・就寝をまとめて比べて走るので、前は起きた・寝た
       時刻だけを入れても、下書きの日付だけの本文が残り、自分で書いた
       本文と見分けがつきませんでした。触れていなければ、本文は元のまま。 */
    const drafted = memoInit !== (cur.memo || "");
    let touched = false;
    if (memo) memo.addEventListener("input", () => { touched = true; });
    const memoOut = () => (drafted && !touched ? (cur.memo || "") : memo.value);
    const save = () => {
      clearTimeout(timer); timer = 0;
      const now = JSON.stringify([memo ? memo.value : "", wakeEl.value, sleepEl.value]);
      if (now === last) return;
      last = now;
      const times = { wake: wakeEl.value || null, sleep: sleepEl.value || null };
      // 本文の欄が無い（読めない日）ときは、本文を渡しません——元の本文はそのまま。
      store.setDayLog(day, memo ? Object.assign({ memo: memoOut() }, times) : times);
      /* daily が出ていれば、いまの setDayLog で store の subscribe がもう組み直しています
         （app.js）。ここでも組むと、打っているあいだ 3 秒おきに画面を二度組んでいました
         （docs/motion.md の「押した一拍を軽く」）。出ていないときだけ、ここで。 */
      if (!root || !root.classList.contains("is-active")) render();
    };
    /* 音声入力で話し続けると、手が止まる 500ms が来ないまま字が増えていきます。
       待ちは最初の一字から数えて 3 秒まで——話し続けていても 3 秒おきには残ります。 */
    let since = 0;
    const queue = () => {
      clearTimeout(timer);
      if (!timer) since = Date.now();
      timer = setTimeout(save, Math.max(0, Math.min(500, since + 3000 - Date.now())));
    };
    [memo, wakeEl, sleepEl].filter(Boolean).forEach((el) => {
      el.addEventListener("input", queue);
      el.addEventListener("change", save);
      el.addEventListener("blur", save);
    });
    /* 裏へ回る・閉じられる瞬間は、待っている分をその場で書きます。app.js の
       store.flush() はこれより先に走るので、ここでもう一度 flush します。 */
    const hide = () => { if (timer) { save(); store.flush(); } };
    const onVis = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVis);
    let unwatch = () => {};
    const close = () => {
      unwatch();
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVis);
      save();
      /* 自動で残す紙は、閉じたときに一言（開いたときと変わっていれば）。 */
      if (last !== first) KN.ui.toast("更新しました");
    };

    const h = KN.ui.sheet({
      title: `${label} の log`,
      content: body,
      /* 日記・積み上げの書く紙は、ノートと同じ四隅の丸い白いカード（2026年10月6日、
         利用者「メモ欄が狭いし色が暗い」）。後ろは暗くしない。 */
      cls: "is-card",
      clear: true,
      // 自動で保存しているので、閉じるときに引き止めません。
      guard: false,
      footer: node(html`<button class="btn btn-primary btn-block js-ok">閉じる</button>`),
      onClose: close,
    });
    /* 日記だけの鍵が閉じたら、この紙も閉じる（閉じれば残す）。 */
    if (KN.lock) unwatch = KN.lock.diarySheet(() => h.close());
    h.el.querySelector(".js-ok").addEventListener("click", () => {
      save();
      KN.motion.fire("select");
      h.close();
    });

    /* 開いてすぐには入力モードにしません（キーボードを自動で出さない）。
       カーソルは押して打ち始めたときのために**いちばん後ろ**へ。先頭に
       置くと、続きを書こうとした人が毎回いちばん下まで指で送ることに
       なります（日記は足していくものなので、書き足す場所はいつも末尾
       です）。 */
    if (!memo) return;
    const end = memo.value.length;
    try { memo.setSelectionRange(end, end); } catch (_) { /* time 欄などでは投げます */ }
    memo.scrollTop = memo.scrollHeight;
  }

  /* ================================================================
     思考のホーム・時刻ごとの日記（docs/thinking.md）
     本文は一つの文字のまま（KN.diaryPosts）。一件は「このアプリが書いた時刻の行」（見えない印つき）から次のその行の前まで。
     ================================================================ */

  const dayLabel = (day) => {
    const dt = U.dayDate(day);
    return dt ? `${dt.getMonth() + 1}月${dt.getDate()}日(${U.weekdayJa(day)})` : day;
  };
  const memoOf = (day) => String((store.dayLog(day) || {}).memo || "");

  /* 今日の問い（KN.askList）：日付で引き、どこにもしまわない。その日より前に「？問い」の行を書いた問いは引かない
     （全部書いたら一周して元の並び）。三つに一つは、その日より前に自分で書いた「？」の問い（元の並びに無いもの）。
     「別の問い」は開いているあいだだけ送る。 */
  const askKey = (s) => String(s || "").normalize("NFKC").replace(/\s+/g, "").replace(/\?+$/, "");
  /** その日より前に書いた「？」の行：日記（その日より前の日）とノート（作った日がその日より前）。鍵のかかったノートは引かない。 */
  function pastAsks(day) {
    const F = KN.noteFormat, out = [];
    if (!F) return out;
    if ((!KN.diaryIdb || KN.diaryIdb.body() === "ok") && !diaryShut()) {
      (store.get().archive.days || []).forEach((d) => {
        if (d.date < day) F.asks(d.memo || "").forEach((a) => out.push({ text: a.text, day: d.date }));
      });
    }
    if (KN.notes && KN.notes.state() === "on" && !(KN.lock && KN.lock.hides("notes"))) {
      KN.notes.list().forEach((n) => {
        if (U.dayKey(new Date(n.createdAt)) < day) F.asks(n.body).forEach((a) => out.push({ text: a.text, note: n.id, line: a.line }));
      });
    }
    return out;
  }
  let askTurn = { day: "", n: 0 };
  function askOf(day, past) {
    const all = KN.askItems || (KN.askList || []).map((q) => ({ q }));
    const known = new Set(all.map((a) => askKey(a.q)));
    const done = new Set(past.map((a) => askKey(a.text)));
    /* 一区切りにした問い（設定 askRest）は引かない。 */
    const rm = (store.get().settings || {}).askRest;
    const rest = rm && typeof rm === "object" ? rm : {};
    const fresh = all.filter((a) => !done.has(askKey(a.q)) && !rest[askKey(a.q)]);
    /* 重さは引く日を選ぶだけ（平日は重い問いを外し、休みの日は軽い問いを外す）。出さない。 */
    const dt = U.dayDate(day), off = dt && (dt.getDay() === 0 || dt.getDay() === 6);
    const fit = (list) => { const f = list.filter((a) => (off ? a.w !== 1 : a.w !== 3)); return f.length ? f : list; };
    const awake = all.filter((a) => !rest[askKey(a.q)]);
    const base = fit(fresh.length ? fresh : awake.length ? awake : all);
    const seen = new Set();
    const mine = past.filter((a) => { const k = askKey(a.text); if (known.has(k) || seen.has(k) || rest[k]) return false; seen.add(k); return true; });
    let h = 0;
    for (const c of String(day)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const k = h + (askTurn.day === day ? askTurn.n : 0);
    if (mine.length && k % 3 === 2) return { ...mine[Math.floor(k / 3) % mine.length], mine: true };
    const a = base[k % base.length] || {};
    return { text: a.q || "", hint: a.hint || "", from: a.from || "" };
  }

  /** daily の冒頭：日記に書く・ノートを書く・問い一覧 の三枚と、今日の問い。説明は書かない。 */
  function thinkHome(day) {
    const canAsk = !!(KN.screens.notes && KN.screens.notes.asks);
    const card = (cls, tone, img, a, b) => html`
      <button type="button" class="think-card is-${tone} ${cls}">
        <img class="think-card-art" src="img/think/${img}.webp" alt="" decoding="async" draggable="false">
        <span class="think-card-t">${a}<wbr>${b}</span>
        <span class="think-card-go" aria-hidden="true">${icon("chevron")}</span>
      </button>`;
    const el = node(html`
      <div class="think-home">
        <div class="think-cards">
          ${card("js-think-write", "sea", "diary", "日記に", "書く")}
          ${card("js-think-note", "leaf", "note", "ノートを", "書く")}
          ${canAsk ? card("js-think-ask", "sun", "ask", "問い", "一覧") : ""}
        </div>
        <section class="think-today">
          <img class="think-today-art" src="img/think/today.webp" alt="" decoding="async" draggable="false">
          <div class="think-today-head">
            <span class="think-today-t">${icon("thought")}<span class="js-think-t"></span></span>
            <button type="button" class="think-today-other js-think-other"><span>別の問い</span>${icon("repeat")}</button>
          </div>
          <p class="think-today-q js-think-q"></p>
          <div class="ask-ctx js-think-ctx" hidden><p class="ask-ctx-from js-think-from"></p><p class="ask-ctx-t js-think-hint"></p></div>
          <button type="button" class="think-today-go js-think-today">${icon("edit")}<span>この問いから考える</span>${icon("chevron")}</button>
        </section>
      </div>
    `);
    /* 題は語の切れ目（<wbr>）でだけ折る。絵が届かない（一枚の書き出し・控えに無い）ときは、字だけの札にする。 */
    el.querySelectorAll("img").forEach((im) => im.addEventListener("error", () => im.remove(), { once: true }));
    el.querySelector(".js-think-write").addEventListener("click", () => openPost(day, null));
    el.querySelector(".js-think-note").addEventListener("click", () => {
      KN.motion.fire("select");
      if (KN.screens.notes && KN.screens.notes.open) KN.screens.notes.open(null);
    });
    const ask = el.querySelector(".js-think-ask");
    if (ask) ask.addEventListener("click", () => {
      KN.motion.fire("select");
      KN.app.showScreen("notes");
      KN.screens.notes.asks();
    });
    const q = el.querySelector(".js-think-q"), qt = el.querySelector(".js-think-t");
    const past = pastAsks(day);
    let cur;
    /* 問いの下に出典と文脈（そのときのこと）。思い出すきっかけなので畳まない。自分の問いには無い。 */
    const ctx = el.querySelector(".js-think-ctx"), from = el.querySelector(".js-think-from"), hint = el.querySelector(".js-think-hint");
    const paint = () => {
      cur = askOf(day, past); q.textContent = cur.text; qt.textContent = cur.mine ? "あなたの問い" : "今日の問い";
      from.textContent = cur.from || ""; from.hidden = !cur.from;
      hint.textContent = cur.hint || ""; hint.hidden = !cur.hint;
      ctx.hidden = !cur.from && !cur.hint;
    };
    paint();
    el.querySelector(".js-think-other").addEventListener("click", () => {
      KN.motion.fire("select");
      askTurn = { day, n: (askTurn.day === day ? askTurn.n : 0) + 1 };
      paint();
    });
    /* 答える紙（問いは欄の外。保存は「？問い」を頭にしたノート）。ノートが開けなければ、「？」の行を頭に置いた
       日記の紙。打つまでは書かない。自分の問いは写さず、書いたところ（そのノートの行・その日）へ。 */
    el.querySelector(".js-think-today").addEventListener("click", () => {
      const NS = KN.screens.notes;
      if (!cur.mine) { if (!(NS && NS.answer && NS.answer(cur.text))) openPost(day, null, `？${cur.text}\n`); return; }
      KN.motion.fire("select");
      /* 答えのノート（頭の行が「？問い」。＋でつくった問いも）は答える紙で続きを。 */
      if (cur.note && cur.line === 0 && NS && NS.answer && NS.answer(cur.text)) return;
      if (cur.note) { KN.app.showScreen("notes"); KN.screens.notes.open(cur.note, null, { line: cur.line }); }
      else goDayTo(cur.day);
    });
    return el;
  }

  /* 長い一件は頭の三行と終わりの三行だけ見せて畳み（どこまで書いたかがすぐ読めるように）、吹き出しを押すと
     伸びる・もう一度で縮む（10月13日・利用者）。終わりの三行は同じ字の写し（.arc-post-tail。読み上げない）。直す・コピーは左の余白の
     ボタンで（押す先が被らないように）。畳むかどうかは置かれてから測る（隣の日の紙は document の外で組むので、
     組んだときには測れない）。見張りは行ごと（捨てた行と一緒に消える）。開いた一件は覚えておき、組み直しても
     開いたまま——測るまでは畳んでおき、長いと分かってから開く（短い一件に「縮む」が出ないように）。 */
  const postOpen = new Set();
  const FOLD_OVER = 8; /* 畳むのは八行より長いときだけ（隠すのが二行以下なら畳まない） */
  function watchFold(posts) {
    if (!posts.length) return;
    if (typeof ResizeObserver !== "function") { posts.forEach((p) => p.classList.remove("is-folded")); return; }
    const ro = new ResizeObserver((list) => {
      /* 測るのはまとめて先に、書くのはあと（traps の「測るのは書く前に」）。 */
      const seen = list.filter((e) => e.target.clientWidth > 0)
        .map((e) => [e.target, e.target.scrollHeight > e.target.clientHeight * FOLD_OVER / 3 + 1]);
      seen.forEach(([t, long]) => {
        ro.unobserve(t);
        const p = t.closest(".arc-post");
        p.classList.toggle("can-more", long);
        if (!long || postOpen.has(p.dataset.key)) setFold(p, false);
      });
    });
    posts.forEach((p) => ro.observe(p.querySelector(".arc-post-text")));
  }
  function setFold(p, folded) {
    p.classList.toggle("is-folded", folded);
    const more = p.querySelector(".arc-post-more");
    if (more) { more.setAttribute("aria-expanded", String(!folded)); more.setAttribute("aria-label", folded ? "全文を読む" : "たたむ"); }
    if (folded) postOpen.delete(p.dataset.key); else if (p.classList.contains("can-more")) postOpen.add(p.dataset.key);
  }
  /* 頭が日付と育休の行だけ（日記の下書きの字）なら、直す・コピーのボタンは出さない（直す要が無い）。 */
  const stampOnly = (text) => String(text).split("\n").every((l) => !l.trim()
    || /^\d{4}\.\d{1,2}\.\d{1,2}（[日月火水木金土]）$/.test(l.trim()) || /^育休完了まであと\d+日$/.test(l.trim()));

  /** 時刻ごとの日記の行。本文の字は足し引きせず、切って並べるだけ。 */
  function chatRow(d) {
    const dt = U.dayDate(d.date);
    const edited = d.updatedAt && d.createdAt && d.updatedAt !== d.createdAt;
    const items = KN.diaryPosts.parse(d.memo || "");
    const row = node(html`
      <div class="arc-log-row is-chat ${d.date === U.todayKey() ? "is-today" : ""}" data-day="${d.date}">
        <span class="arc-log-day">
          <b>${String(dt ? dt.getDate() : "")}</b>
          <i>${dt ? U.weekdayJa(d.date) : ""}</i>
        </span>
        <span class="arc-log-text">
          <span class="arc-posts">${items.length ? items.map((x, k) => html`
            <span class="arc-post is-folded ${x.mark ? "" : "is-head"}" data-k="${k}" data-key="${d.date}|${x.start}"
              >${x.mark ? html`<span class="arc-post-at">${x.date ? `${x.date} ` : ""}${x.at}</span>` : ""}<span class="arc-post-body"
                >${!x.mark && stampOnly(x.text) ? "" : html`<span class="arc-post-acts"
                  ><button type="button" class="arc-post-act js-post-edit" aria-label="直す">${icon("edit")}</button
                  ><button type="button" class="arc-post-act js-post-copy" aria-label="コピー">${icon("copy")}</button></span>`
                }<span class="arc-post-text">${x.text}</span
                ><button type="button" class="arc-post-more" aria-expanded="false" aria-label="全文を読む">${icon("chevron-down")}<span>全文を読む</span></button
                ><span class="arc-post-tail" aria-hidden="true">${x.text}</span></span></span>`)
            : html`<span class="arc-post is-blank" data-k="-1"><span class="arc-post-body"><span class="arc-post-text" role="button" tabindex="0">この日のことを書く</span></span></span>`}</span>
          ${/* 起床・就寝は一枚の紙で直す（時刻の欄があるのはそこだけ）。 */
              S().showDayTimes === false ? "" : html`
            <span class="arc-log-times js-times" role="button" tabindex="0">起床 ${orDash(d.wake)} ・ 就寝 ${orDash(d.sleep)}</span>`}
          ${S().showStamps === false ? "" : html`
            <span class="arc-log-meta">
              <span class="arc-stamp">作成 ${U.formatStamp(d.createdAt) || "-"}</span>
              ${edited ? html`<span class="arc-stamp">更新 ${U.formatStamp(d.updatedAt)}</span>` : ""}
            </span>`}
        </span>
      </div>
    `);
    const times = row.querySelector(".js-times");
    if (times) {
      times.addEventListener("click", () => openLogSheet(d.date));
      times.addEventListener("keydown", (e) => {
        if (!KN.util.isEnter(e) && e.key !== " ") return;
        e.preventDefault();
        openLogSheet(d.date);
      });
    }
    /* 選んでいるあいだは押したことにしない（選んだそばから選択が消えないように）。 */
    const selecting = (el) => {
      const sel = window.getSelection && window.getSelection();
      return !!(sel && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode));
    };
    row.querySelectorAll(".arc-post").forEach((el) => {
      const k = Number(el.dataset.k);
      const body = el.querySelector(".arc-post-body");
      if (k < 0) {
        const text = el.querySelector(".arc-post-text");
        const go = () => openPost(d.date, null);
        text.addEventListener("click", go);
        text.addEventListener("keydown", (e) => { if (!KN.util.isEnter(e) && e.key !== " ") return; e.preventDefault(); go(); });
        return;
      }
      const x = items[k];
      const edit = el.querySelector(".js-post-edit");
      if (edit) edit.addEventListener("click", (e) => { e.stopPropagation(); openPost(d.date, x); });
      const copy = el.querySelector(".js-post-copy");
      if (copy) copy.addEventListener("click", (e) => {
        e.stopPropagation();
        if (bodyBlocked()) return;
        copyText(x.text).then((ok) => {
          KN.motion.fire("select");
          KN.ui.toast(ok ? "コピーしました" : "コピーできませんでした");
        });
      });
      /* 長い一件だけ、押すと伸び縮み（「全文を読む」も同じ。キーで押せるのはこちら）。 */
      el.querySelector(".arc-post-more").addEventListener("click", (e) => {
        e.stopPropagation();
        setFold(el, !el.classList.contains("is-folded"));
      });
      body.addEventListener("click", () => {
        if (!el.classList.contains("can-more") || selecting(el)) return;
        setFold(el, !el.classList.contains("is-folded"));
      });
    });
    watchFold([...row.querySelectorAll(".arc-post.is-folded")]);
    return row;
  }

  /**
   * 時刻ごとの一件を書く・直す紙。item が無ければ新しい一件（時刻は打ち始めた時）。
   * 足すのは本文の終わりに。直すのは、開いたときの字が同じ場所にまだあるときだけ
   * ——無ければ上書きせず、新しい一件として残す（どちらに転んでも字は消えない）。
   * 打った先から残す（日記の紙と同じ：手が止まって 500ms、最初の一字から 3 秒まで）。
   * 直しても時刻の行は打ったときのまま。
   */
  function openPost(day, item, seed) {
    if (item && diaryShut()) { askDiary().then((ok) => { if (ok) openPost(day, item, seed); }); return; }
    if (bodyBlocked()) return;
    const P = KN.diaryPosts;
    if (store.memoOut(store.dayLog(day))) { KN.ui.toast(MISSING); return; }
    const fresh = !item;
    /* 開いたときの一件が、もう同じ場所に無い（ほかで直した）なら、開かずに組み直す。 */
    if (!fresh && !P.still(memoOf(day), item)) { KN.ui.toast("日記が変わっていました"); render(); return; }
    /* wrote … この紙が本文に書いた（直す前は、開いたときの）字と場所。text は一件の中身。 */
    let wrote = fresh ? null : { at: P.chunkAt(item), chunk: P.chunkOf(memoOf(day), item), mark: item.mark, text: item.text };
    let before = null, after = null, started = null;
    /* 前からの一件は、打ったときだけ書く（開いて閉じただけで本文の形を変えない）。 */
    let touched = false, changed = false;

    const body = node(html`
      <div class="stack gap-4">
        <label class="field arc-memo-field">
          <textarea class="textarea js-memo" rows="5" aria-label="日記" placeholder="いまのことを一行から">${fresh ? seed || "" : item.text}</textarea>
        </label>
      </div>
    `);
    const memo = body.querySelector(".js-memo");

    let timer = 0, since = 0;
    const save = () => {
      clearTimeout(timer); timer = 0;
      /* 書かないのは、まだ打っていないときだけ（読めない日は開く前に断っている。一枚の紙と同じ）。 */
      if (!touched) return;
      const text = P.clean(memo.value);
      if (!text) return;                      // 空のうちは書かない（閉じたときに決める）
      const m = memoOf(day);
      if (!wrote) {
        const mk = P.mark(started || new Date(), day);
        /* 本文の無い日は、頭に日付と育休の行（日記の紙の下書きと同じもの。コピーが日付を言わないので）。 */
        const r = P.add(m, text, mk, m.trim() ? "" : dailyStamp(day));
        if (!r) return;
        if (before == null) before = m;
        store.setDayLog(day, { memo: r.memo });
        wrote = { at: r.at, chunk: r.chunk, mark: mk, text };
        after = r.memo;
        return;
      }
      const next = P.chunk(wrote, text);
      if (next === wrote.chunk) return;
      const out = P.swap(m, wrote.at, wrote.chunk, next);
      /* 書いた場所に、書いた字がもう無い：上書きせず、新しい一件として残す。 */
      if (out == null) { wrote = null; save(); return; }
      store.setDayLog(day, { memo: out });
      wrote.chunk = next;
      wrote.text = text;
      after = out;
      changed = true;
    };
    const queue = () => {
      touched = true;
      if (!started) started = new Date();
      clearTimeout(timer);
      if (!timer) since = Date.now();
      timer = setTimeout(save, Math.max(0, Math.min(500, since + 3000 - Date.now())));
    };
    memo.addEventListener("input", queue);
    memo.addEventListener("blur", save);
    /* 裏へ回る・閉じられる瞬間は、待っている分をその場で（日記の紙と同じ）。 */
    const hide = () => { if (timer) { save(); store.flush(); } };
    const onVis = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVis);

    /** 一件を外す（空にして閉じた・「消す」）。この紙で書いた一件は書く前の本文へ戻し、
        前からの一件は「元に戻す」を出す。 */
    let gone = false;
    const drop = (loud) => {
      if (gone || !wrote) return;
      gone = true;
      const m = memoOf(day);
      const out = fresh && after != null && m === after ? before : P.take(m, wrote.at, wrote.chunk);
      if (out == null) return;
      store.setDayLog(day, { memo: out });
      /* 新しく書いて空にしたのは、書かなかったのと同じ（黙って戻す）。それ以外は「元に戻す」。 */
      if (fresh && !loud) return;
      KN.ui.toast("消しました", { action: { label: "元に戻す", onClick: () => {
        if (memoOf(day) === out) store.setDayLog(day, { memo: m });
      } } });
    };
    let toNote = false, toPage = false;
    let unwatch = () => {};
    const close = () => {
      unwatch();
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVis);
      save();
      if (gone) return;
      if (touched && !P.clean(memo.value)) { drop(false); return; }
      if (toNote && wrote) { const c = Object.assign({}, wrote); setTimeout(() => moveToNote(day, c), 0); return; }
      /* 一枚で開く：本文ぜんぶと起床・就寝の紙へ（書いた一件は残してから）。 */
      if (toPage) { setTimeout(() => openLogSheet(day), 0); return; }
      /* 書いた先から残す紙の一言（docs/look.md）：新しい一件は「保存しました」、直したら「更新しました」。 */
      if (fresh ? !!wrote : changed) KN.ui.toast(fresh ? "保存しました" : "更新しました");
    };

    let h = null;
    const menu = [
      { icon: "notes", label: "ノートへ移す", onPick: () => { toNote = true; h.close(); } },
      { icon: "edit", label: "一枚で開く", onPick: () => { toPage = true; h.close(); } },
      { icon: "trash", label: "消す", danger: true, onPick: () => { save(); drop(true); h.close(); } },
    ];
    const at = item && item.mark ? ` ${item.date ? `${item.date} ` : ""}${item.at}` : "";
    h = KN.ui.sheet({
      title: `${dayLabel(day)}${at}`,
      content: body,
      menu,
      cls: "is-card",
      clear: true,
      // 打った先から残しているので、閉じるときに引き止めません。
      guard: false,
      footer: node(html`<button class="btn btn-primary btn-block js-ok">${fresh ? "保存する" : "閉じる"}</button>`),
      onClose: close,
    });
    /* 日記だけの鍵が閉じたら、この紙も閉じる（閉じれば残す）。 */
    if (KN.lock) unwatch = KN.lock.diarySheet(() => h.close());
    h.el.querySelector(".js-ok").addEventListener("click", () => {
      save();
      KN.motion.fire("select");
      h.close();
    });
    /* 新しい一件は、押した流れのまま欄へ（iOS は同期で focus しないとキーボードを出さない）。
       前からの一件は日記の紙と同じく、カーソルを終わりに置くだけ。 */
    if (fresh) KN.ui.focusNow(memo);
    if (fresh && !seed) return;
    const end = memo.value.length;
    try { memo.setSelectionRange(end, end); } catch (_) { /* 投げる端末がある */ }
  }

  /** 一件の時刻（ノートの作った日へ）。時刻の無い頭は、その日のまま（時刻を作らない）。 */
  function postTime(day, c) {
    const dt = U.dayDate(day);
    const m = c.mark ? KN.diaryPosts.markOf(c.mark) : null;
    if (!dt || !m) return null;
    let y = dt.getFullYear(), mo = dt.getMonth(), d = dt.getDate();
    if (m.date) {
      const [mm, dd] = m.date.split("/").map(Number);
      /* 日記の日より前の月日なら、年をまたいで書いた（12/31 の日記を 1/2 に）。 */
      if (mm - 1 < mo || (mm - 1 === mo && dd < d)) y += 1;
      mo = mm - 1; d = dd;
    }
    const [hh, mi] = m.at.split(":").map(Number);
    return new Date(y, mo, d, hh, mi).toISOString();
  }

  /**
   * 一件をノートへ移す。新しいノートか、選んだノートの終わりへ（日付と時刻の行をはさむ）。
   * **ノートに書けたと確かめてから**日記から外す——書けなければ日記はそのまま。
   * 日記がそのあいだに変わっていたら外さない（同じ字が二か所にあっても、消えるよりよい）。
   */
  function moveToNote(day, c) {
    const N = KN.notes;
    const NS = KN.screens.notes;
    if (!N || N.state() !== "on" || !NS || !NS.pick) { KN.ui.toast("ノートを開けませんでした"); return; }
    const text = KN.diaryPosts.clean(c.text);
    if (!text) return;
    const put = async (id) => {
      let note, back;
      if (!id) {
        note = N.draft();
        note.body = text;
        const iso = postTime(day, c);
        if (iso) note.createdAt = iso;
        if (!N.put(note)) { KN.ui.toast("ノートを開けませんでした"); return; }
        back = () => { const n = N.get(note.id); if (n && n.body === text && !n.title) N.drop(note.id); else N.remove(note.id); };
      } else {
        note = N.get(id);
        if (!note || note.deletedAt) return;
        const prev = note.body;
        const mk = c.mark ? KN.diaryPosts.markOf(c.mark) : null;
        const src = `${dayLabel(day)}${mk ? ` ${mk.date ? `${mk.date} ` : ""}${mk.at}` : ""}`;
        const next = `${prev.replace(/\s+$/, "")}${prev.trim() ? "\n\n" : ""}${src}\n${text}`;
        if (!N.edit(id, { body: next })) { KN.ui.toast("ノートを開けませんでした"); return; }
        back = () => { const n = N.get(id); if (n && n.body === next) N.edit(id, { body: prev }); };
      }
      await N.flush();
      if (N.pending(note.id)) { KN.ui.toast("ノートに保存できませんでした"); return; }
      const m = memoOf(day);
      const out = KN.diaryPosts.take(m, c.at, c.chunk);
      if (out == null || diaryBody() !== "ok") { KN.ui.toast("ノートに写しました"); return; }
      store.setDayLog(day, { memo: out });
      KN.ui.toast("ノートへ移しました", { actions: [
        { label: "開く", onClick: () => NS.open(note.id) },
        { label: "元に戻す", onClick: () => { if (memoOf(day) === out) store.setDayLog(day, { memo: m }); back(); } },
      ] });
    };
    NS.pick((id) => { put(id); }, { title: "ノートへ移す", fresh: "新しいノート" });
  }

  /* ================================================================
     画面
     ================================================================ */

  /** 上の帯（全タブで一つ）の持ち主が、いまこの画面か（js/head.js）。 */
  function mine() { return KN.head.mine("archive"); }

  function mount(el) {
    root = el;
    root.innerHTML = "";
    /* 上の帯（題・今日へ戻る・さがす・設定）と暦は、この画面の外——全タブで
       一つの帯（js/head.js）に居ます（docs/shared-header.md）。題は、いま
       見ている**日**（やること・ダイエットと同じひと組を KN.util から）。
       押すと月を選ぶ小窓が開く——応えだけが、この画面のもの。ここに残るのは
       帯より下：探す窓（暦の下に開く）と紙。 */
    root.append(node(html`
      <div class="stack">
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="文字でさがす" aria-label="文字でさがす"
                   autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button class="icon-btn js-search-clear is-sm" aria-label="検索をクリア" hidden>${icon("close")}</button>
          </div>
        </div>

        <div class="js-body arc-body"></div>
      </div>
    `));

    const head = KN.head.els;
    els = {
      body: root.querySelector(".js-body"),
      screen: root,
      dayRow: head.dayRow,
      dayTitle: head.dayTitle,
      searchBtn: head.searchBtn,
      searchWrap: root.querySelector(".js-search-wrap"),
      search: root.querySelector(".js-search"),
      searchClear: root.querySelector(".js-search-clear"),
      mine,
    };

    /* ほかの三画面とまったく同じ配線です。バーは題の裏に隠してあって、
       少し下へ引くと出てきます（ui.js の parkSearch）。 */
    /* 打った字は「ぜんぶをさがす」へ渡すだけ（この画面で絞っていた積み上げはやめた）。 */
    KN.ui.wireSearch(els, () => render(), () => {});

    /* 題を押すと、暦が月ぜんぶに開きます（やることの「›」と同じ役目）。
       題は上のバーにいるので、結ぶのは組み立てのとき一度きりです
       ——暦は描き直されますが、バーは残るので。 */
    els.dayTitle.addEventListener("click", () => {
      if (!mine()) return;               // 帯は一つ。応えるのは持ち主だけ
      KN.motion.fire("select");
      openMonthPicker();
    });

    /* 題の右の「今日へ戻る」。今日を見ているあいだは `paintDayTitleInto` が
       押せなくしているので、ここで日を見る必要はありません。 */
    head.today.addEventListener("click", () => {
      if (!mine()) return;
      KN.motion.fire("select");
      goDayTo(U.todayKey());
    });


    /* 暦の厚み。**掴み手はこのぶんだけ下に貼りつきます**——暦もバーも
       sticky で上に居るので、数えないと掴み手がその裏へ潜ります
       （実際そうなっていて、暦を出しているあいだだけ掴み手が消えていた）。

       暦は組み直しのたびに**別の要素**になるので、そのつど引き直して、
       見張る相手も付け替えます。書くのは変わったときだけ——書くたびに
       ResizeObserver が鳴ると、輪になります。 */
    let calRO = null, calSeen = null, calH = -1;
    fitCalH = () => {
      /* 暦は帯（画面の外）に居るので、根っこから探さずに持っている一枚を。 */
      const c = els.cal;
      /* **引いているあいだは測りません。** 紙を引くと暦は月ぜんぶの姿で
         留められる（cal-peek の begin）ので、そのまま測ると床が月の高さに
         なり、掴み手だけが暦の中へ食い込みます。床は始めた段のままでよく、
         紙の transform が一緒に運んでくれます。 */
      if (c && (c.classList.contains("is-peek") || c.classList.contains("is-settling"))) return;
      const h = c && !c.classList.contains("is-hidden")
        ? Math.round(c.getBoundingClientRect().height) : 0;
      if (h !== calH) { calH = h; root.style.setProperty("--cal-h", h + "px"); }
      if (c !== calSeen && window.ResizeObserver) {
        if (calRO) calRO.disconnect();
        calSeen = c;
        if (c) { calRO = new ResizeObserver(() => fitCalH()); calRO.observe(c); }
      }
    };
    fitCalH();
    window.addEventListener("resize", () => fitCalH());

    /* 帯と暦の「貼りついた」印（is-stuck・境目の線）は、もう付けません。
       帯は画面の外に居て送られないので——付けると、全タブで一つの帯が
       タブごとに違う顔をします（screen-todo.js と同じ）。 */

    /* 題の右にあった暦ボタンは外しました。紙の掴み手を上へ押せば暦は
       消え、下へ引けば戻ります（js/cal-peek.js の三段）。設定の daily にも
       札があります。 */

    els.cal = calendar();
    // 初めて開いたときも、今日の欄が待っているように。
    store.ensureDayLog(U.todayKey());
    /* ここに store.subscribe(() => render()) がありました。**二重でした**
       ——app.js が「state が変わったら、いま見ている画面を描き直す」を
       すでにやっています（app.js の store.subscribe）。他の画面はどれも
       自前で購読していません。daily だけが二回描いていました。

       見た目には出ませんでした（二度描いても同じ絵になるので）。表に
       出たのは FLIP を入れたときです——一度目で「新しく来た行」に印を
       付け、二度目がその行ごと作り直して印を消していました。無駄な仕事は、
       たいてい無駄なままでは終わりません。 */
  }

  /* 描き直している最中に、描き直しが始まらないように。

     store を触ると subscribe が render を呼びます。描いている途中でそれが
     起きると、内側の render が本体を空にしてから描き、外側は**その上に
     もう一度**積みます——同じ行が二つ並びます（今日の行を用意する処理を
     描画の中に置いたとき、実際にそうなりました）。 */
  let rendering = false;
  /* 前に組んだときの日（下の render が、同じ日なら読んでいた位置へ返すため）。 */
  let laidDay = null;

  /** 組み直した紙を、読んでいた位置へ返します（docs/motion.md の「押した一拍を軽く」）。
      返す先は**新しい紙**——紙は組み直しのたびに作り直されるので、組む前に掴んだ器へ
      返しても、もう外された紙が動くだけでした（中継所から歩数が届く・記録を足すたびに、
      daily だけ頭へ飛んでいた）。iPhone は差しこんだばかりの器への scrollTop を落とすことが
      あるので、一拍あとに効いたかを見直します（screen-todo.js の restoreTop と同じ）。 */
  function holdTop(top) {
    const sc = KN.app.scrollerOf(root);
    if (!sc || !top) return;
    sc.scrollTop = top;
    requestAnimationFrame(() => {
      if (!sc.isConnected || sc.scrollTop > 1) return;
      const again = Math.min(top, Math.max(0, sc.scrollHeight - sc.clientHeight));
      if (again > 1) sc.scrollTop = again;
    });
  }

  /** その日ぶんの紙まるごと。横に払うと、この一枚が隣の日のものと
      入れ替わります。 */
  function daySlide(day) {
    const ym = day.slice(0, 7);
    const el = node(html`<div class="day-slide"></div>`);

    /* まとめは Daily Log の**すぐ下**に置きます。数だけが単独で立つと
       「その月の成績」に見えるので、必ず地の文の隣に並べる、という
       決めごとです（daily-rules.js が見張っています）。 */
    const log = dailyLog(ym, day);
    /* まとめは設定で出し入れできます。出すときは、上か下かのどちらか一方
       ——日の間には決して挟みません。挟むと「その日のまとめ」に見えます。 */
    const digest = S().showDigest === false ? null : monthDigest(ym);
    const logBlock = document.createDocumentFragment();
    if (digest && S().digestPos === "top") logBlock.append(digest);
    logBlock.append(log);
    if (digest && S().digestPos !== "top") logBlock.append(digest);
    /* 「あの日」は Daily Log の下（外）。出すのは今日の紙だけ、出すかどうかは設定で
       （2026年10月10日・利用者。Daily Log の中に入れたら起床・就寝や幅が崩れた）。 */
    const then = day === U.todayKey() && S().showThen !== false ? thenCard() : null;
    el.append(logBlock);
    if (then) el.append(then);
    /* まだ来ていない日は、見るだけ。daily の中からは行けませんが、見ている
       日は全タブで一つなので、やることで来週を見たまま移ってくると、ここに
       その日が来ます（docs/shared-header.md）。書き込む口は閉じておきます。 */
    if (day > U.todayKey()) { el.inert = true; el.classList.add("is-ahead"); }
    /* 思考のホームは冒頭に（時刻ごとのときだけ。一枚のときは今までの紙のまま）。まだ来ていない日は書けないので出さない。 */
    else if (chatView()) el.prepend(thinkHome(day));
    return el;
  }

  function render() {
    if (!root || rendering) return;
    /* 紙を横に払っているあいだは、組み直しません（day-swipe.js が上げ下げ
       します）。指の下で紙が組み直されると、掴んでいたものが別の絵に
       なります。 */
    if (swiping) return;
    takeSharedDay();
    const ym = curYm();

    /* 組み直すと、画面はいちばん上に戻ります。絞り込みや並び替えを押した人は
       **その場**を見ているので、押した瞬間に頭まで飛ばされると、もう一度
       同じところまで指で戻ることになります。位置を覚えて、組んだあとに返します。 */
    const keepScroller = KN.app.scrollerOf(root);
    const keepTop = keepScroller.scrollTop;
    /* 返すのは**同じ日を組み直したとき**だけ。別の日へ移ったなら、その日の頭から。 */
    const day = focusDay();
    const sameDay = day === laidDay;

    /* 組み直す前に、いまどの行がどこに居るかを測ります（ui.js の flipRows）。
       並べ替えを押す・お気に入りを付ける・一件足す——どれも一覧の中で行が
       動くだけの出来事なのに、いままでは別の絵に置き換わっていました。
       月をめくったときのように丸ごと入れ替わる場合は、向こうが見送ります。 */
    const settle = KN.ui.flipRows(els.body, ".arc-row");
    /* 季節の絵（3.0 の E1）。選んでいる日の候の色と、あれば絵を紙の後ろに。 */
    if (KN.seasonArt) KN.seasonArt.apply(root, focusDay(), "daily");

    rendering = true;
    els.searchClear.hidden = !els.search.value;
    els.body.innerHTML = "";

    /* 暦は帯（画面の外、全タブで一つ）に置きます。印（粒）はこの画面のもの
       ——daily に他のタブの印を出さないこと（tests/daily-rules.js）。 */
    KN.head.putCal("archive", els.cal);
    fillCalendar(els.cal);

    /* 暦から下は、**白い紙**の上に乗ります（やることと同じ組み）。角の丸い
       一枚と上の掴み手が「ここから下は別の層」と言っていて、線を一本も
       引かずに、暦と中身が別の面にあることが読めます。

       紙は掴めます——下へ引くと暦が月ぜんぶまで開きます（cal-peek.js）。 */
    const sheet = node(html`
      <div class="tl-sheet is-daily"><span class="tl-grip" aria-hidden="true"><i></i></span></div>
    `);
    els.body.append(sheet);
    wireCalPull(sheet);
    /* **印は掴み手だけに付けます。** 前は紙ぜんぶに付けていました——紙の
       どこを持っても下へ引けば暦が出た時期の名残です。段を替えられるのが
       掴み手だけになったいま、紙の本体は「引いて更新」のものなので、
       そのまま譲ります。 */
    const grip = sheet.querySelector(".tl-grip");
    if (grip) grip.setAttribute("data-pull-own", "cal");

    /* 中身は、横に払える一枚（.day-slide）にまとめて入れます。払っている
       あいだ、隣の日の紙が指のぶんだけ入ってきます。 */
    const car = node(html`<div class="day-car"><div class="day-track"></div></div>`);
    const track = car.querySelector(".day-track");
    track.append(daySlide(focusDay()));
    sheet.append(car);
    /* 指を受けるのは紙ぜんぶ（中身の下の空白からも払えるように）。 */
    wireDaySwipe(car, track, sheet);

    if (keepTop && sameDay) holdTop(keepTop);
    laidDay = day;
    rendering = false;
    /* 暦は組み直しのたびに別の要素になるので、厚みも測り直します
       （掴み手はそのぶん下に貼りつくので）。 */
    fitCalH();
    // 位置を戻したあとで測ります（戻す前だと、行がスクロールぶんだけ
    // 余計に動いたことになって、画面の外から飛んできます）。
    settle();
  }

  /**
   * その月ぶんを JSON で書き出します。将来、この月がどんな時間だったかを
   * 言葉にしてもらうときに、そのまま渡せる形にしてあります。
   */
  function exportThisMonth() {
    if (diaryShut()) { askDiary().then((ok) => { if (ok) exportThisMonth(); }); return; }
    if (bodyBlocked()) return;   // 月の書き出しには日記の本文が入るので
    const ym = curYm();
    const data = store.exportMonth(ym);
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daily-${ym}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    KN.motion.fire("select");
    KN.ui.toast(`${ym} を書き出しました`);
  }

  /* ＋ は、まず**記録の紙**を開きます（2026年9月28日）。前は押すと「Daily Log／
     記録」の二択が出て、どちらかを選ぶ一手が毎回はさまっていた。＋で書きたく
     なるのはたいてい記録のほうなので、そちらを先に開き、日記は紙の頭の札
     （種類の札の並びの先頭、ほかより一回り大きい一枚）から一押しで移れます。 */
  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="書く">${icon("plus")}</button>
      </div>
    `);
    /* ＋は分けずに書く（思考のホーム。docs/thinking.md）。種類を選ぶ記録の紙は、前からの記録を直すときだけ。
       時刻ごとなら新しい一件、一枚ならその日の日記の紙。 */
    fab.querySelector(".js-open-add").addEventListener("click", (e) => {
      e.stopPropagation();
      if (chatView()) openPost(writeDay(), null);
      else openLogSheet(writeDay());
    });
    return fab;
  }

  KN.screens = KN.screens || {};
  /* ---------------- 中継所を覗く ----------------

     睡眠が来ると、起床・就寝は**この画面**に出ます。だからここでも覗いて
     いました——朝いちばんに daily を開いた人が、ダイエットへ寄り道するまで
     昨夜の記録を見られないのはおかしいので。

     いまは**覗き続けるのは health-relay.js の見張り**です（画面がどれで
     あっても、見えているあいだは覗きます）。二つの画面に同じ仕掛けを
     書き写していたのをやめて、開いたその瞬間の一度ぶんだけ残しました。
     入ったことは store の変化が伝えるので、ここで render を呼ぶ必要も
     ありません（app.js の subscribe）。 */
  /* 日が変わっていれば、その日の行を用意します。開いたときに今日の欄が
     待っているように——描画の中ではなくここで呼ぶのは、store を触ると
     描き直しが走るためです（上の rendering を参照）。
     **組む前に**（app.js の show が、組む直前に呼びます。そのあいだ subscribe は
     組みません）。前は組んだあとの onEnter にあって、その日はじめて daily を開くと
     用意した行のぶんもう一度組み、さらに onEnter 自身も `render()` を呼んでいました
     （1年ぶんの記録で 約100ms ずつ。docs/motion.md の「押した一拍を軽く」）。 */
  function prepare() {
    store.ensureDayLog(U.todayKey());
  }

  function onEnter() {
    if (KN.healthRelay) KN.healthRelay.pullNow();
  }

  /* 季節の変わり目の一拍（roadmap-seamless の N7・docs/daily.md の「季節のひとこと」）。
     その日に変わる行——節気の初日の節気・雑節か五節句・祝日（rows の三行目から）——だけ。 */
  function seasonTurn(day, i) {
    if (i >= 2) return true;
    const sp = i === 0 && KN.season.span(day, 3);
    return !!(sp && sp.from === day);
  }
  /* 変わり目の日に、**その日はじめて開いたときだけ**その行が一度満ちる（帯の今日の丸と同じ作り。
     head.js の BEAT_KEY）。打つかはここ、どう満ちるかは CSS（`.is-season-first`）。今日の行が
     見えていないとき（ほかの日・月ぜんぶ・ひとことを消した）は、見たことにしない。暦の事実なので評価ではない。 */
  const SEASON_BEAT_KEY = "kn-season-beat";
  KN.motion.onArrive((el) => {
    if (el !== root) return;
    let first = false;
    let seen = true;
    try { seen = localStorage.getItem(SEASON_BEAT_KEY) === U.todayKey(); } catch (_) { /* 残せない端末では満ちない */ }
    const row = seen ? null : root.querySelector(`.arc-season[data-day="${U.todayKey()}"] .is-turn`);
    if (row && row.offsetWidth) {
      try {
        localStorage.setItem(SEASON_BEAT_KEY, U.todayKey());
        first = true;
      } catch (_) { /* 残せない端末では満ちない */ }
    }
    root.classList.toggle("is-season-first", first);
  });

  KN.screens.archive = { mount, render, dockButton, prepare, onEnter, day: () => focusDay(),
    goDay: (d) => goDayTo(d) };
})();
