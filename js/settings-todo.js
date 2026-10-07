/* =========================================================
   くらしノート — settings screen：tasks の行（通知・カレンダー）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { go, TINT, card, head, foot, navRow, switchRow, pickRow, render, copyText } = S;

  /* ---------------- やること ---------------- */

  /** 一日の枠。時間割はこの幅の中に組み、空き時間もここから数えます。
      行の中に時刻の欄を二つ並べていましたが、そこだけ行が二段になって、
      一覧の高さがそろわなくなっていました。 */
  function openDaySpan() {
    const P = KN.plan;
    const st = store.get().settings;
    const body = node(html`
      <div class="stack">
        <div class="row-times">
          <input class="input js-a" type="hidden" data-when="time" aria-label="一日の始まり"
                 value="${st.dayStart || P.DEFAULT_START}">
          <span class="row-dash">〜</span>
          <input class="input js-b" type="hidden" data-when="time" aria-label="一日の終わり"
                 value="${st.dayEnd || P.DEFAULT_END}">
        </div>
      </div>
    `);
    const save = node(html`<button class="btn btn-primary btn-block">保存</button>`);
    KN.ui.whenFields(body);
    const h = KN.ui.sheet({ title: "一日の始まりと終わり", content: body, footer: save });

    save.addEventListener("click", () => {
      const av = body.querySelector(".js-a").value;
      const bv = body.querySelector(".js-b").value;
      const a = KN.util.isTime(av) ? av : P.DEFAULT_START;
      let b = KN.util.isTime(bv) ? bv : P.DEFAULT_END;
      /* 終わりが始まりより前なら、一日が裏返ります。組めないので直します
         ——黙って受け取って空きが負になるより、その場で戻すほうが親切です。 */
      if (P.toMin(b) <= P.toMin(a)) {
        b = P.DEFAULT_END;
        KN.ui.toast("終わりは始まりより後にしてください");
      }
      store.update((s) => { s.settings.dayStart = a; s.settings.dayEnd = b; });
      h.close();
      render();
      KN.motion.fire("save");
    });
  }

  /* 見直す日（3.0 の B1）。これから・待つ・いつかへ入れたとき、何日あとに見直すか。
     札から選ぶだけ（打たせない）。既定は 2週・1週・1か月（store.reviewDays）。 */
  const REVIEW_PICKS = {
    next: [[7, "1週"], [14, "2週"], [28, "4週"]],
    wait: [[3, "3日"], [7, "1週"], [14, "2週"]],
    someday: [[14, "2週"], [30, "1か月"], [90, "3か月"]],
  };
  const daysLabel = (key, n) => ((REVIEW_PICKS[key].find((p) => p[0] === n) || [n, `${n}日`])[1]);
  function openReviewDays() {
    const box = node(html`<div class="stack review-days"></div>`);
    const paint = () => {
      const d = store.reviewDays();
      box.innerHTML = "";
      [["next", "これから"], ["wait", "待つ"], ["someday", "いつか"]].forEach(([key, label]) => {
        const row = node(html`<div class="field"><span class="field-label">${label}</span><div class="js-c"></div></div>`);
        KN.ui.chipRow(row.querySelector(".js-c"), REVIEW_PICKS[key].map(([n, l]) => ({ id: String(n), label: l })), {
          activeId: String(d[key]),
          onPick: (id) => {
            store.update((s) => { s.settings.reviewDays = { ...store.reviewDays(), [key]: Number(id) }; });
            KN.motion.fire("select");
            paint();
            render();
          },
        });
        box.append(row);
      });
    };
    paint();
    KN.ui.sheet({ title: "見直す日", content: box });
  }

  function todoRows() {
    const s = store.get().settings;
    const P = KN.plan;
    /* 「05:00」ではなく「5:00」。時刻の欄が返す形と、画面に書く形は別。 */
    const trim = (t) => String(t).replace(/^0/, "");
    const span = `${trim(s.dayStart || P.DEFAULT_START)}〜${trim(s.dayEnd || P.DEFAULT_END)}`;
    const notify = KN.notify;
    const canNotify = notify && notify.supported();

    return [
      card(
        switchRow({
          title: "今日を時間割で見る", on: s.todoTimeline !== false,
          onTap: (v) => {
            store.update((x) => { x.settings.todoTimeline = v; });
            render();
            KN.motion.fire("select");
          },
        })
      ),
      /* 一日の道（js/day-road.js）。時間割の上の地図なので、時間割で見ている
         ときだけ効きます。既定は出す（設定を持たない保存は `!== false` で出る）。 */
      card(
        switchRow({
          title: "一日の道を出す", on: s.todoRoad !== false,
          onTap: (v) => {
            store.update((x) => { x.settings.todoRoad = v; });
            render();
            KN.motion.fire("select");
          },
        })
      ),
      card(
        pickRow({ title: "一日の始まりと終わり", value: span, onTap: openDaySpan })
      ),
      /* 崩れ方の事実（3.0 の D1）。並べるだけ。 */
      card(
        navRow({ ico: "repeat", tint: TINT.data, title: "置き直しの控え",
                 value: (() => { const f = store.slipFacts(); return f.todos ? `${f.todos}件` : ""; })(),
                 onTap: () => go("slips") })
      ),
      card(
        pickRow({ title: "見直す日", onTap: openReviewDays, value: (() => {
          const d = store.reviewDays();
          return `${daysLabel("next", d.next)}・${daysLabel("wait", d.wait)}・${daysLabel("someday", d.someday)}`;
        })() })
      ),
      /* 通知とカレンダーは、どちらもスイッチ二つ（か、スイッチと手順）に
         それぞれの説明が付いて、一画面ぶんあります。根っこに並べると tasks の
         列が説明で埋まるので「›」の先へ（docs/settings.md の「二段の一覧」）。 */
      card(
        canNotify ? navRow({
          ico: "bell", tint: TINT.goal, title: "通知",
          value: notify.enabled() ? "オン" : "オフ", onTap: () => go("notify"),
        }) : null,
        KN.ics && KN.ics.apple() ? navRow({
          ico: "calendar", tint: TINT.sync, title: "カレンダー",
          value: s.calShortcut === true ? "オン" : "オフ", onTap: () => go("cal"),
        }) : null
      ),
    ];
  }

  /** 通知（tasks の「›」の先）。 */
  function notifyRows() {
    const s = store.get().settings;
    /* 時刻のお知らせ。何をするかは**カードの下**で言います——「通知」と
       だけ書くと「19:30 に鳴る」と読まれますが、アプリを閉じているあいだは
       鳴りません。そこを言うかどうかが、機能と、黙って裏切るものの差です。 */
    const notify = KN.notify;
    const canNotify = notify && notify.supported();
    const notifyOn = canNotify && notify.enabled();
    const notifyBlocked = canNotify && notifyOn && notify.blocked();
    const bellCan = canNotify && !!KN.bell && KN.bell.available();
    const bellOn = bellCan && s.todoBell === true;

    return [
      canNotify ? card(
        switchRow({
          title: "やることの時刻を知らせる", on: notifyOn,
          onTap: async (v) => {
            if (!v) { notify.disable(); render(); return; }
            const ok = await notify.enable();
            render();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          },
        })
      ) : null,
      canNotify && !bellOn ? foot(notifyBlocked
        ? "端末の設定で通知を許可してください。"
        : "アプリを閉じていると鳴りません。") : null,
      /* 閉じていても鳴らす（js/bell.js、D1）。中継所があって、時刻のお知らせが
         入っているときだけ出します。**既定はオフ**——時刻を端末の外へ出すのは、
         利用者が入れたときだけにするため。 */
      bellCan ? card(
        switchRow({
          title: "閉じていても鳴らす", on: bellOn,
          onTap: async (v) => {
            if (!v) { await KN.bell.stop(); render(); return; }
            const res = await KN.bell.start();
            render();
            if (!res.ok) {
              KN.ui.toast(res.reason === "old"
                ? "中継所のコードが古いため入れられません。中継所を置き直してください"
                : res.reason === "push"
                  ? "この端末では、閉じているあいだの通知を受け取れませんでした"
                  : "中継所につながりませんでした");
            }
          },
        })
      ) : null,
      bellCan && bellOn ? foot(notifyBlocked
        ? "端末の設定で通知を許可してください。"
        : "7日開かないと止まります。") : null,
    ];
  }

  /** カレンダー（tasks の「›」の先）。行はショートカット App のある端末だけに出ます。 */
  function calRows() {
    const s = store.get().settings;
    return [
      /* 「カレンダーに入れる」の近道（docs/todo-items.md の「カレンダーに入れる」）。
         **既定はオフ**——手順を組む前にオンにすると、押しても「ショートカットが
         見つかりません」になるので。組み方はすぐ下の「›」の先。 */
      card(
        switchRow({
          title: "カレンダーはショートカットで入れる", on: s.calShortcut === true,
          onTap: (v) => {
            store.update((x) => { x.settings.calShortcut = v; });
            render();
            KN.motion.fire("select");
          },
        }),
        navRow({ ico: "calendar", tint: TINT.sync, title: "ショートカットの組み方",
                 onTap: () => go("calHow") })
      ),
      foot("先に「組み方」のショートカットを二つ作ります。"),
    ];
  }

  /** ショートカットの組み方。アプリから渡すもの（KN.ics.shortcutText）と
      一対なので、キーの名前を変えるときは両方を。

      書き方は**端末に出る字のとおり**（iOS 17・18 の日本語表記）。前は
      「if文」で終日を分ける一本にしていたが、そこが分かりにくいと言われ、
      二本（時刻あり・終日）の一本道にした。二本目は複製して一か所変えるだけ。 */
  function calHowRows() {
    const one = KN.ics.SHORTCUT, day = KN.ics.SHORTCUT_DAY;
    const nameCard = node(html`
      <div class="set-card is-pad">
        <div class="diet-relaykey"><code>${one}</code></div>
        <button type="button" class="btn btn-soft btn-block js-copy1 mt-2">
          一つ目の名前をコピー
        </button>
        <div class="diet-relaykey mt-3"><code>${day}</code></div>
        <button type="button" class="btn btn-soft btn-block js-copy2 mt-2">
          二つ目の名前をコピー
        </button>
      </div>
    `);
    nameCard.querySelector(".js-copy1").addEventListener("click", () => copyText(one, "名前"));
    nameCard.querySelector(".js-copy2").addEventListener("click", () => copyText(day, "名前"));
    const first = node(html`
      <div class="set-card is-pad">
        <ol class="diet-steps">
          <li>「ショートカット」App を開き、下の<b>「ショートカット」</b>タブで、右上の<b>＋</b>を押す</li>
          <li>いちばん上の<b>「新規ショートカット」</b>を押し、<b>「名前を変更」</b>を押して <b>${one}</b> にする（上でコピーして貼ると確実）</li>
          <li>下の検索欄（<b>「アクションを検索」</b>）に <b>辞書</b> と打ち、出てきた<b>「入力から辞書を取得」</b>を押す</li>
          <li>足された行の、青い字の<b>「入力」</b>を押し、<b>「ショートカットの入力」</b>を選ぶ。行が「ショートカットの入力 から辞書を取得」になればよい</li>
          <li>もう一度、下の検索欄に <b>カレンダー</b> と打ち、<b>「新規予定を追加」</b>を押す</li>
          <li>「新規予定を追加」の行の、青い字の<b>「タイトル」</b>を押す。キーボードの上に<b>「辞書」</b>が出るので、それを押す（出ていなければ<b>「変数を選択」</b>を押し、上の「入力から辞書を取得」の行を押す）</li>
          <li>いま入った<b>「辞書」</b>を、もう一度押す。出てきたメニューの<b>いちばん下</b>にある<b>「キーの値を取得」</b>の欄に <b>title</b> と打ち、<b>「完了」</b></li>
          <li>「カレンダー」の右の字（最初は「全ての予定」などになっています）を押し、入れたいカレンダー（<b>自宅</b>など）を選ぶ。この行が出ていなければ、先に11の「＞」を開く</li>
          <li>始まりの日時の欄（最初は「今日 …」のような字）を押し、中の字を消してから、6・7と同じやり方で「辞書」を入れて、キーは <b>start</b></li>
          <li>終わりの日時の欄も同じやり方で、キーは <b>end</b></li>
          <li>行の右下の<b>「＞」</b>（版によっては<b>「表示を増やす」</b>）を押して続きを開く。<b>「終日」はオフのまま</b>。<b>「作成シートを表示」はオフ</b>。<b>「メモ」</b>にも同じやり方で「辞書」を入れ、キーは <b>memo</b>（省いてもよい）</li>
          <li>右上の<b>「完了」</b>。赤い警告が出ていても動きます（試すのはアプリから）</li>
        </ol>
      </div>
    `);
    const second = node(html`
      <div class="set-card is-pad">
        <ol class="diet-steps">
          <li>「ショートカット」タブの一覧で、いま作った<b>「${one}」を長押し</b>し、<b>「複製」</b>を押す</li>
          <li>増えたほう（名前の後ろに<b> 1</b> が付いたもの）を開き、いちばん上の名前を押して<b>「名前を変更」</b>で <b>${day}</b> にする</li>
          <li>「新規予定を追加」の行の<b>「＞」</b>（または「表示を増やす」）を開き、<b>「終日」をオン</b>にする。ほかは触らない</li>
          <li>右上の<b>「完了」</b></li>
        </ol>
      </div>
    `);
    return [
      head("名前"),
      nameCard,
      head("一つ目（時刻のある予定）"),
      first,
      head("二つ目（終日の予定）"),
      second,
      foot("終わったら「カレンダーはショートカットで入れる」をオンに。キーは半角の小文字で。"),
    ];
  }

  /* 置き直しの控え（3.0 の D1。docs/todo-timeline.md の「崩れ方の事実」）。この4週間の数を並べるだけ。
     多い・少ない・原因は言わない。値の行は押せない（字だけ）。 */
  function slipRows() {
    const f = store.slipFacts(28);
    const row = (title, value) => node(html`
      <div class="set-row is-fact"><span class="set-title">${title}</span><span class="set-val">${value}</span></div>`);
    if (!f.todos) return [card(row("この4週間に置き直したもの", "0件"))];
    return [
      card(row("この4週間に置き直したもの", `${f.todos}件（${f.slips}回）`)),
      head("置いていた時刻"),
      card(Object.entries(f.parts).map(([k, n]) => row(k, `${n}回`))),
      head("決めていた長さ"),
      card(Object.entries(f.lens).map(([k, n]) => row(k, `${n}件`))),
    ];
  }

  Object.assign(S, { todoRows, notifyRows, calRows, calHowRows, slipRows });
})();
