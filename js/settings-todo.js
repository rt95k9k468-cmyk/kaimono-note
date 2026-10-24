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
  const { go, TINT, card, head, foot, navRow, switchRow, pickRow, timeRow, choose, render, copyText } = S;

  /* ---------------- やること ---------------- */

  /* 見直す日（3.0 の B1）。これから・待つ・いつかへ入れたとき、何日あとに見直すか。
     札から選ぶだけ（打たせない）。既定は 2週・1週・1か月（store.reviewDays）。 */
  const REVIEW_PICKS = {
    next: [[7, "1週"], [14, "2週"], [28, "4週"]],
    wait: [[3, "3日"], [7, "1週"], [14, "2週"]],
    someday: [[14, "2週"], [30, "1か月"], [90, "3か月"]],
  };
  const daysLabel = (key, n) => ((REVIEW_PICKS[key].find((p) => p[0] === n) || [n, `${n}日`])[1]);

  /** 見直す日（tasks の「›」の先）。三つの棚の日数は、行の値のところで選ぶ（前は札を並べた紙）。
      節気に揃える（roadmap-3.1 の K3）も、日数と同じ話なのでここに。オンのときだけ、いま入れたら付く日を下に
      （説明の代わりの事実）。 */
  function reviewRows() {
    const s = store.get().settings;
    const d = store.reviewDays();
    const pick = (key, label) => pickRow({
      title: label, value: daysLabel(key, d[key]),
      onTap: () => choose({
        title: label, value: String(d[key]),
        options: REVIEW_PICKS[key].map(([n, l]) => ({ id: String(n), label: l })),
        onPick: (id) => {
          store.update((x) => { x.settings.reviewDays = { ...store.reviewDays(), [key]: Number(id) }; });
        },
      }),
    });
    return [
      card(pick("next", "これから"), pick("wait", "待つ"), pick("someday", "いつか")),
      card(
        switchRow({
          title: "節気の初日に揃える", on: s.reviewSekki === true,
          onTap: (v) => {
            store.update((x) => { x.settings.reviewSekki = v; });
            KN.motion.fire("select");
          },
        })
      ),
      s.reviewSekki === true ? foot((() => {
        const md = (k) => k.slice(5).split("-").map(Number).join("/");
        const one = ([l, k]) => html`<span class="set-nw">${l} ${md(store.reviewFrom(k))}</span>`;
        return html`${one(["これから", null])}・${one(["待つ", "wait"])}・${one(["いつか", "someday"])}`;
      })()) : null,
    ];
  }

  /* 一日の道（js/day-road.js）。時間割で見ているときだけ効くので、そのときだけ出す。上・下・出さない
     （2026年10月19日、利用者）。既定は上（設定を持たない保存は `todoRoad !== false` で出る）。
     下は `todoRoadAt: "below"` を選んだときだけ書く。 */
  const ROAD = [
    { id: "above", label: "時間割の上" },
    { id: "below", label: "時間割の下" },
    { id: "off",   label: "出さない" },
  ];
  function roadRow(s) {
    const at = s.todoRoad === false ? "off" : s.todoRoadAt === "below" ? "below" : "above";
    return pickRow({
      title: "一日の道", value: ROAD.find((r) => r.id === at).label,
      onTap: () => choose({
        title: "一日の道", value: at, options: ROAD,
        onPick: (v) => {
          store.update((x) => {
            x.settings.todoRoad = v !== "off";
            if (v === "below") x.settings.todoRoadAt = "below";
            else if (v === "above") delete x.settings.todoRoadAt;
          });
        },
      }),
    });
  }

  /** 一日の枠。時間割はこの幅の中に組み、空き時間もここから数えます（時間割を切っていても、
      「今日に入れる」と「今日は半分」が使うので、いつも出す）。前は「›」の先の紙で、二つの欄と
      「保存」でしたが、行の値を押せば車輪が出て、決めればその場で預かります。 */
  function spanRows(s) {
    const P = KN.plan;
    const start = s.dayStart || P.DEFAULT_START;
    const end = s.dayEnd || P.DEFAULT_END;
    /* 終わりが始まりより前なら、一日が裏返ります。組めないので受け取らない
       ——黙って受け取って空きが負になるより、その場で言うほうが親切です。 */
    const put = (key, v) => {
      if (!KN.util.isTime(v)) return;
      const a = key === "dayStart" ? v : start;
      const b = key === "dayEnd" ? v : end;
      if (P.toMin(b) <= P.toMin(a)) { KN.ui.toast("終わりは始まりより後にしてください"); return; }
      store.update((x) => { x.settings.dayStart = a; x.settings.dayEnd = b; });
      KN.motion.fire("save");
    };
    return [
      timeRow({ title: "一日の始まり", value: start, onPick: (v) => put("dayStart", v) }),
      timeRow({ title: "一日の終わり", value: end, onPick: (v) => put("dayEnd", v) }),
    ];
  }

  /* 根っこの束（2026年10月24日に組み直し）：時間割（見方と一日の枠）・見直す日・知らせ（通知・カレンダー）・
     取り込み（Google・誕生日）・置き直しの控え。前は七枚のカードに散っていて、「一日の道」の見出しの下に
     一日の始まりと終わりが居たので、道の設定に見えていた。 */
  function todoRows() {
    const s = store.get().settings;
    const notify = KN.notify;
    const canNotify = notify && notify.supported();
    const timeline = s.todoTimeline !== false;
    const d = store.reviewDays();
    const batches = store.googleBatches();
    return [
      card(
        switchRow({
          title: "今日を時間割で見る", on: timeline,
          onTap: (v) => {
            store.update((x) => { x.settings.todoTimeline = v; });
            render();
            KN.motion.fire("select");
          },
        }),
        timeline ? roadRow(s) : null,
        ...spanRows(s)
      ),
      card(
        navRow({
          ico: "clock", tint: TINT.cat, title: "見直す日",
          value: `${daysLabel("next", d.next)}・${daysLabel("wait", d.wait)}・${daysLabel("someday", d.someday)}`,
          onTap: () => go("review"),
        })
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
      /* Google から（js/google-import.js）。取り消しは取り込みがあるときだけ。三行とも四角を付ける
         （前は四角の無い行と有る行が一枚に混ざり、字の頭が揃っていなかった）。 */
      card(
        navRow({ ico: "download", tint: TINT.sync, title: "Google から取り込む", onTap: () => KN.googleImport.open() }),
        navRow({ ico: "calendar", tint: TINT.sync, title: "誕生日のショートカット", onTap: () => go("birthHow") }),
        batches.length
          ? navRow({ ico: "undo", tint: TINT.sub, title: "取り込みを取り消す", value: `${batches[0].n}件`, act: true,
            onTap: () => KN.googleImport.undo().then(render) })
          : null
      ),
      /* 崩れ方の事実（3.0 の D1）。並べるだけ。 */
      card(
        navRow({ ico: "repeat", tint: TINT.data, title: "置き直しの控え",
                 value: (() => { const f = store.slipFacts(); return f.todos ? `${f.todos}件` : ""; })(),
                 onTap: () => go("slips") })
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
            KN.motion.fire("select");
          },
        })
      ),
      foot("先に「組み方」のショートカットを二つ作ります。"),
      /* 四角の付く行は別のカードに（スイッチと一枚に混ぜると、字の頭が揃わない）。 */
      card(navRow({ ico: "calendar", tint: TINT.sync, title: "ショートカットの組み方", onTap: () => go("calHow") })),
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

  /** 誕生日の一覧を書くショートカットの組み方（連絡先の置き場所に関わらず、iPhone の連絡先から）。
      アプリは一行に一人の「名前,日付」を読む（google-import.js の parseBirthdayText）。書き方は端末に出る字のとおり。 */
  function birthHowRows() {
    const steps = node(html`
      <div class="set-card is-pad">
        <ol class="diet-steps">
          <li>「ショートカット」App を開き、下の<b>「ショートカット」</b>タブで、右上の<b>＋</b>を押し、名前を<b>誕生日</b>などにする</li>
          <li>下の検索欄（<b>「アクションを検索」</b>）に <b>連絡先</b> と打ち、<b>「連絡先を検索」</b>を押す（条件は付けない＝全員）</li>
          <li><b>繰り返す</b> と打ち、<b>「それぞれを繰り返す」</b>を押す</li>
          <li>繰り返しの中に<b>「テキスト」</b>を置く。欄を押し、キーボードの上の<b>「変数を選択」</b>から<b>「繰り返しの項目」</b>を選ぶ。出てきた字を押して<b>「名前」</b>を選ぶ</li>
          <li>続けて半角の <b>,</b>（カンマ）を打ち、もう一度「繰り返しの項目」を入れて、今度は<b>「誕生日」</b>を選ぶ</li>
          <li>繰り返しの<b>外</b>（終わりの行の下）に<b>「テキストを結合」</b>を置き、区切りは<b>「新しい行」</b></li>
          <li><b>ファイル</b> と打ち、<b>「ファイルを保存」</b>を置く。<b>「保存先を確認」</b>はオンのままにして、右上の<b>「完了」</b></li>
          <li>一覧のこのショートカットを押す。保存の画面が出たら、「このiPhone内」などに <b>.txt</b> で保存する</li>
          <li>アプリの<b>「Google から取り込む」</b>で、その .txt を選ぶ。紙に「誕生日」の件数が出ればよい</li>
        </ol>
      </div>
    `);
    return [
      head("組み方"),
      steps,
      foot("誕生日の無い人の行は読みません。年が無い誕生日もそのまま読めます。動かなければ、保存した .txt の最初の数行（名前は伏せて）を見せてください。"),
    ];
  }

  /** 小窓（ショートカットのウィジェット）の組み方。Dropbox の glance.json を読んで出す
      （docs/todo-items.md 段4）。書き方は calHowRows と同じく端末に出る字のとおり。 */
  function glanceHowRows() {
    const file = "glance.json";
    const nameCard = node(html`
      <div class="set-card is-pad">
        <div class="diet-relaykey"><code>${file}</code></div>
        <button type="button" class="btn btn-soft btn-block js-copy mt-2">ファイル名をコピー</button>
      </div>
    `);
    nameCard.querySelector(".js-copy").addEventListener("click", () => copyText(file, "名前"));
    const steps = node(html`
      <div class="set-card is-pad">
        <ol class="diet-steps">
          <li>「ショートカット」App を開き、下の<b>「ショートカット」</b>タブで、右上の<b>＋</b>を押し、名前を<b>小窓</b>などにする</li>
          <li>下の検索欄（<b>「アクションを検索」</b>）に <b>ファイル</b> と打ち、<b>「ファイルを取得」</b>を押す</li>
          <li>行の<b>「ファイルピッカー」</b>を<b>「パス」</b>に切り替え（または<b>「ファイルが見つからないときはエラー」</b>の隣の矢印を開き）、Dropbox の<b>アプリ</b>の中のこのアプリのフォルダにある <b>${file}</b> を選ぶ</li>
          <li><b>辞書</b> と打ち、<b>「入力から辞書を取得」</b>を押す</li>
          <li><b>繰り返す</b> と打ち、<b>「それぞれを繰り返す」</b>を押す。入力は、辞書から<b>キーの値を取得</b>（キーは <b>events</b>）にする</li>
          <li>繰り返しの中に<b>「テキスト」</b>を置き、<b>time</b> と <b>name</b> を「キーの値を取得」で並べる（間は半角の空白）</li>
          <li>もう一つ、<b>marks</b> でも同じ繰り返しを作る（中は <b>name</b> ではなく、そのままの値）</li>
          <li>最後に<b>「テキストを結合」</b>で全部を改行でつなぎ、末尾に<b>「日付をフォーマット」</b>で <b>at</b> を「時刻」にして「◯時の写し」と足す</li>
          <li><b>「結果を表示」</b>を置いて、右上の<b>「完了」</b></li>
          <li>ホーム画面を長押し → 左上の<b>＋</b> → <b>ショートカット</b>で、この小窓を置く</li>
        </ol>
      </div>
    `);
    return [
      head("ファイル名"),
      nameCard,
      head("組み方"),
      steps,
      foot("先に Dropbox の紙で「小窓へ写す」をオンに。日をまたぐと、開くまで前の日のままです。"),
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

  Object.assign(S, { todoRows, reviewRows, notifyRows, calRows, calHowRows, glanceHowRows, birthHowRows, slipRows });
})();
