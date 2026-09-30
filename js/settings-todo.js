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
          <input class="input js-a" type="time" aria-label="一日の始まり"
                 value="${st.dayStart || P.DEFAULT_START}">
          <span class="row-dash">〜</span>
          <input class="input js-b" type="time" aria-label="一日の終わり"
                 value="${st.dayEnd || P.DEFAULT_END}">
        </div>
        <p class="set-foot is-flush">今日の時間割は、この幅のなかに組みます。空き時間もここから数えます。</p>
      </div>
    `);
    const save = node(html`<button class="btn btn-primary btn-block">保存</button>`);
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
      foot("時間割の上に、その日を一本の道にした図を出します。時刻を決めたものは道の上に、決めていないものは「いま」の人と一緒に並びます。"),
      card(
        pickRow({ title: "一日の始まりと終わり", value: span, onTap: openDaySpan })
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
        ? "許可が要ります。端末の設定で、このアプリの通知を許可してください。"
        : bellCan
          ? "アプリを閉じているあいだは鳴らず、次に開いたときにまとめて出ます。下を入れると、閉じていても鳴ります。"
          : "アプリを閉じているあいだは鳴らず、次に開いたときにまとめて出ます。") : null,
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
        ? "許可が要ります。端末の設定で、このアプリの通知を許可してください。"
        : "中継所から、閉じていても鳴らします。中継所へ渡すのは時刻だけで、題やメモは渡しません（題はこの端末の中から出ます）。今日から7日先までを、開くたびに送り直すので、7日開かないと鳴らなくなります。") : null,
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
      foot("オンにすると、「カレンダーに入れる」を押すだけで、決めたカレンダーにそのまま入ります。先にショートカット App で、二つの小さなショートカットを一度だけ組んでください。"),
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
        <button type="button" class="btn btn-soft btn-block js-copy1" style="margin-top:8px">
          一つ目の名前をコピー
        </button>
        <div class="diet-relaykey" style="margin-top:14px"><code>${day}</code></div>
        <button type="button" class="btn btn-soft btn-block js-copy2" style="margin-top:8px">
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
          <li>いちばん上の<b>「新規ショートカット」</b>を押し、<b>「名前を変更」</b>を押して <b>${one}</b> にする（上の「一つ目の名前をコピー」を押してから貼り付けると確実です）</li>
          <li>下の検索欄（<b>「アクションを検索」</b>）に <b>辞書</b> と打ち、出てきた<b>「入力から辞書を取得」</b>を押す</li>
          <li>足された行の、青い字の<b>「入力」</b>を押し、<b>「ショートカットの入力」</b>を選ぶ。行が「ショートカットの入力 から辞書を取得」になれば正しい（上に「受け取る」の行が増えても、そのままで大丈夫）</li>
          <li>もう一度、下の検索欄に <b>カレンダー</b> と打ち、<b>「新規予定を追加」</b>を押す</li>
          <li>「新規予定を追加」の行の、青い字の<b>「タイトル」</b>を押す。キーボードの上に<b>「辞書」</b>が出るので、それを押す（出ていなければ<b>「変数を選択」</b>を押し、上の「入力から辞書を取得」の行を押す）</li>
          <li>いま入った<b>「辞書」</b>を、もう一度押す。出てきたメニューの<b>いちばん下</b>にある<b>「キーの値を取得」</b>の欄に <b>title</b> と打ち、<b>「完了」</b></li>
          <li>「カレンダー」の右の字（最初は「全ての予定」などになっています）を押し、入れたいカレンダー（<b>自宅</b>など）を選ぶ。この行が出ていなければ、先に11の「＞」を開く</li>
          <li>始まりの日時の欄（最初は「今日 …」のような字）を押し、中の字を消してから、6・7と同じやり方で「辞書」を入れて、キーは <b>start</b></li>
          <li>終わりの日時の欄も同じやり方で、キーは <b>end</b></li>
          <li>行の右下の<b>「＞」</b>（版によっては<b>「表示を増やす」</b>）を押して続きを開く。<b>「終日」はオフのまま</b>。<b>「作成シートを表示」はオフ</b>にする（オンだと、入れるたびにカレンダーの編集画面が出て、「追加」を押す手間が残ります）。<b>「メモ」</b>にも同じやり方で「辞書」を入れ、キーは <b>memo</b>（メモが要らなければ、ここは飛ばしてよい）</li>
          <li>右上の<b>「完了」</b>を押して閉じる。赤い「タイトルが指定されていません」が出ていても、title が入っていれば動きます（ここの「▶」で試すと、渡すものが無いので失敗します。試すのはアプリの「カレンダーに入れる」から）</li>
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
      foot("終わったら、ここへ戻って「カレンダーはショートカットで入れる」をオンにしてください。キー（title・start・end・memo）は半角の小文字で。入れたあとは、左上の「◀ くらしノート」で戻れます（ショートカットの最後に「URLを開く」を足しても、くらしノートではなく Safari が開きます。前に足した人は、その行を消してください）。予定の中身は、この端末のショートカット App に渡るだけで、どこにも送りません。"),
    ];
  }

  Object.assign(S, { todoRows, notifyRows, calRows, calHowRows });
})();
