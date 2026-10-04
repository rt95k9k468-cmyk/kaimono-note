/* =========================================================
   くらしノート — settings screen：中継所・AIの窓口
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node } = KN.util;
  const S = KN.settingsParts;
  const { back, go, TINT, card, head, foot, more, navRow, dangerRow, render, copyText, fieldCard } = S;

  /* ---------------- 中継所 ----------------

     下から出る一枚の紙に、①〜⑤の手順書がまるごと入っていました。**建てて
     しまった人には、そのほとんどが要らないもの**です——建ったあとに開くのは
     「ちゃんと届いているか確かめる」「ショートカットの名前を直す」ときで、
     そのたびに Cloudflare の手順を五段ぶんスクロールすることになる。

     二枚に分けます。**中継所**（いま建っているか・確かめる・名前）と、その
     「›」の先の**建てかた**（①〜③）。手順そのものも畳みました——⑤あった
     段が三つになったのは、④（確かめる）と⑤（名前）が手順ではなく
     **設定**だったからです。手順の紙から出して、状態の紙へ置きました。

     残す言葉は「押して何が起きるか分からないこと」と「つまずいたときの
     逃げ道」だけ。安心させるための言い回し（「〜する必要はありません」
     「〜という意味になります」）は、全部落としてあります。

     **中継所URLには触れません。** 読むのは `KN.healthRelay` だけで、
     ここは欄に出して預かるだけです（このファイルから fetch もしません）。 */

  /* 道（合言葉）は、作ってから②で貼り、③でつなぐまで持ち歩きます。紙が
     組み直されても消えないように、**紙の外**に置きます——中継所を覗く拍
     （1〜5分ごと）で store が動くと、紙はそのつど組み直されるので。 */
  let relayPath = "";
  /* 確かめた結果も同じ理由でここに。 */
  let relayTest = null;

  const relayBad = (v) => v && !/^https:\/\//.test(v);

  function relayRows() {
    const url = KN.healthRelay.url();
    const on = KN.healthRelay.configured();

    /* 確かめた結果。**紙の外に持っている**ので、覗く拍で組み直されても
       消えません。 */
    const result = node(html`<div class="js-relay-out"></div>`);
    const paintResult = () => {
      result.innerHTML = "";
      if (!relayTest) return;
      result.append(node(html`
        <div class="set-card is-pad">
          <div class="diet-read">
            ${KN.util.raw((relayTest.steps || []).map((st) => `
              <div class="diet-read-row">
                <span class="diet-read-name">${st.ok ? "✓" : "✗"} ${KN.util.escapeHtml(st.name)}</span>
                <span class="diet-read-day">${KN.util.escapeHtml(st.detail)}</span>
              </div>`).join(""))}
          </div>
          <p class="set-foot is-flush" style="margin-top:8px">${relayTest.message}</p>
        </div>
      `));
    };
    paintResult();

    const verify = navRow({
      ico: "check", tint: TINT.sync, title: "確かめる",
      value: on ? "" : "URLが要ります",
      onTap: () => {
        const v = KN.healthRelay.url();
        if (!v) { KN.ui.toast("先に「建てかた」でURLをつなげてください"); return; }
        relayTest = { message: "確かめています…", steps: [] };
        paintResult();
        KN.healthRelay.selfTest(v).then((r) => {
          relayTest = { message: r.message, steps: r.steps || [] };
          paintResult();
          /* 届いた、という出来事。**`success` はここまで一度も呼ばれて
             いませんでした**——用意してあるのに誰も鳴らさない名前でした。
             うまくいったと言うべき場所で、かつ絵の当たる相手（結果の札）が
             いるのは、ここです。 */
          if (r.ok) KN.motion.fire("success", result.firstElementChild);
          if (r.ok && KN.screens.diet) KN.screens.diet.render();
        }).catch((err) => {
          relayTest = { message: "確かめられませんでした（" + (err && err.message || err) + "）", steps: [] };
          paintResult();
        });
      },
    });

    return [
      fieldCard({
        label: "中継所のURL", value: url,
        placeholder: "https://…workers.dev/kn-…",
        onSave: (v, f) => {
          if (relayBad(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
          /* **空にしても外しません。** ここは合言葉を含んだURLで、消すと
             Cloudflare を見に行かないと戻せません。外すのは下の行から。 */
          if (!v) { f.value = KN.healthRelay.url(); return; }
          KN.healthRelay.setUrl(v);
          render();
          KN.ui.toast("中継所を覚えました");
        },
      }),
      card(verify),
      result,
      fieldCard({
        label: "ショートカットの名前", value: KN.healthRelay.shortcutName(),
        placeholder: "くらしノート健康",
        onSave: (v) => { KN.healthRelay.setShortcutName(v); KN.ui.toast(v ? "覚えました" : "外しました"); },
      }),
      foot("「◯:◯◯ 時点」を押すと走らせます。名前は一字たがえずに。"),
      /* Siri から買うものへ（D2）。置き先は中継所のURLに ?slot=add を足した
         もので、組み立ては KN.healthRelay がします（ここは渡すだけ）。 */
      on ? card(navRow({
        ico: "copy", tint: TINT.sub, title: "Siri 用のURLをコピー",
        onTap: () => copyText(KN.healthRelay.inboxUrl(), "Siri 用のURL"),
      })) : null,
      on ? more("Siri 用の組み方", "ショートカットを「入力を要求 → URLの内容を取得（方法 POST・本文を要求 ファイル・ファイル＝入力）」で組み、このURLを入れます。名前を「買うものに追加」にすると、「Hey Siri、買うものに追加」で入れられます。いくつかなら「牛乳、卵」のように区切って。") : null,
      card(navRow({
        ico: "route", tint: TINT.relay, title: "建てかた",
        onTap: () => go("relayHow"),
      })),
      on ? card(dangerRow({
        ico: "close", title: "中継所を外す",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "中継所を外しますか？",
            message: "このURLはCloudflareの画面を見ないと作り直せません。控えてから外してください。",
            okLabel: "外す", danger: true,
          });
          if (!ok) return;
          KN.healthRelay.setUrl("");
          relayTest = null;
          render();
          KN.ui.toast("外しました");
        },
      })) : null,
    ];
  }

  /* 「Cloudflareに置く」の行き先。リポジトリの relay/ を指します——
     Cloudflare がそこの wrangler.jsonc を読んで、置き場を作り、
     .dev.vars.example を見て合言葉を尋ねてきます。 */
  const DEPLOY_URL = "https://deploy.workers.cloudflare.com/?url="
    + "https://github.com/rt95k9k468-cmyk/kaimono-note/tree/main/relay";

  /* ---------------- 建てかた（三段目） ----------------

     ①〜⑤ を三つに畳みました。④（確かめる）と⑤（ショートカットの名前）は
     **手順ではなく設定**だったので、一つ手前の紙へ移してあります。

     iPhoneだけで建てるとき、難所は二つあります。

       1. **90行のコードをクリップボードに載せる。** GitHubを開いて、rawを
          出して、全部を選んで、コピーして——指ではここで落ちます。
          だから「コードをコピー」の一つボタンにしました。
       2. **当てられない合言葉を作る。** iPhoneに openssl はありませんし、
          人が思いつく「適当な文字列」は適当ではありません。だから
          アプリが作ります。

     残りは、Cloudflareの画面で貼るだけの作業になります。 */
  function relayHowRows() {
    const pathCard = node(html`
      <div class="set-card is-pad">
        <div class="diet-relaykey">
          <code class="js-path">${relayPath || "（まだ作っていません）"}</code>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button type="button" class="btn btn-soft js-newpath" style="flex:1">道をつくる</button>
          <button type="button" class="btn btn-soft js-copypath" style="flex:1">道をコピー</button>
        </div>
      </div>
    `);
    const label = pathCard.querySelector(".js-path");
    pathCard.querySelector(".js-newpath").addEventListener("click", () => {
      relayPath = KN.healthRelay.makePath();
      label.textContent = relayPath;
      copyText(relayPath, "道");
    });
    pathCard.querySelector(".js-copypath").addEventListener("click", () => {
      if (!relayPath) { KN.ui.toast("先に「道をつくる」を押してください"); return; }
      copyText(relayPath, "道");
    });

    const deployCard = node(html`
      <div class="set-card is-pad">
        <a class="btn btn-primary btn-block js-deploy"
           href="${DEPLOY_URL}" target="_blank" rel="noopener">Cloudflareに置く</a>
        <ol class="diet-steps" style="margin-top:12px">
          <li>Cloudflareに登録（カード不要）</li>
          <li>GitHubとつなぐ画面が出たら許可する</li>
          <li><b>RELAY_PATH</b> を聞かれたら、①でコピーした道を<b>ペースト</b></li>
          <li><b>Deploy</b>（Create and deploy）を押す</li>
        </ol>
      </div>
    `);

    const joinCard = node(html`
      <div class="set-card is-pad">
        <label class="field">
          <span class="field-label">WorkerのURL</span>
          <input class="input js-base" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://kurashi-relay.あなた.workers.dev">
        </label>
        <button type="button" class="btn btn-primary btn-block js-join" style="margin-top:12px">
          道をつなげて保存
        </button>
      </div>
    `);
    joinCard.querySelector(".js-join").addEventListener("click", () => {
      const base = joinCard.querySelector(".js-base").value.trim();
      if (!base) { KN.ui.toast("WorkerのURLを貼ってください"); return; }
      if (relayBad(base)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      if (!relayPath && !/\/\S/.test(base.replace(/^https:\/\/[^/]+/, ""))) {
        KN.ui.toast("先に「道をつくる」を押してください"); return;
      }
      KN.healthRelay.setUrl(KN.healthRelay.joinUrl(base, relayPath));
      /* つないだら、ここで終わりです。**一つ手前へ返します**——次にすること
         （確かめる）はあちらにあるので、戻る道を探させません。 */
      back();
      KN.ui.toast("つなげました。「確かめる」を押してください");
    });

    const codeCard = card(navRow({
      ico: "copy", tint: TINT.sub, title: "中継所のコードをコピー",
      onTap: () => copyText(KN.relayCode, "コード"),
    }));

    return [
      foot("iPhone の Safari だけで建てられます（無料）。"),
      head("① 道（合言葉）をつくる"),
      pathCard,
      foot("合言葉です。人に見せないでください。"),
      head("② 中継所を置く"),
      deployCard,
      /* 逃げ道は一段にまとめます。三つに割ると、どれも同じ重さの手順に
         見えて、**まっすぐ進める人にも三段ぶん読ませる**ことになります。 */
      more("つまずいたら", "RELAY_PATH を聞かれなかったら、置いたあとに Settings → Variables and Secrets → Add で Type を Secret、名前を RELAY_PATH にして Deploy。置く画面が出なければ Create → Import a repository → kaimono-note を選び、Root directory に relay。置き場（KV）が用意されなかったときだけ Storage & Databases → KV で作り、Settings → Bindings で MAIL に結びます。"),
      codeCard,
      foot("建て済みの方も、ここから貼り直してください（URLはそのまま）。"),
      head("③ URLをつなげる"),
      joinCard,
      foot("…workers.dev を貼ると、①の道が後ろに付きます。"),
      more("ショートカットを3本以上にするとき", "URLの末尾に ?slot=名前 を付けます（例：?slot=weight）。付けないと、同じ書式どうしが上書きし合います。"),
    ];
  }

  /* 「Cloudflareに置く」の行き先（AIの窓口）。リポジトリの ai/ を指します——
     Cloudflare がそこの .dev.vars.example を見て、合言葉と鍵を尋ねてきます。 */
  const AI_DEPLOY_URL = "https://deploy.workers.cloudflare.com/?url="
    + "https://github.com/rt95k9k468-cmyk/kaimono-note/tree/main/ai";

  /* AIの窓口の道（合言葉）。中継所の道と同じく、覚えておくのは紙を閉じるまで
     ——保存されるのは、つないだあとのURLのほうだけです。 */
  let aiPath = "";

  /* 鍵ではなくURLを預かります。ここに鍵を書かせないのは方針ではなく事実で、
     このページの中身は誰でも読めるからです。そのことを画面にも書きます。

     窓口の見本は ai/ にあります（中継所の relay/ と同じ形）。建て方も
     中継所と同じ三段で、難しいところ（当てられない合言葉・長いURLの継ぎ足し）は
     アプリがやります。 */
  function openAiSheet() {
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field-label">窓口のURL（https://…）</span>
          <input class="input js-url" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://kurashi-ai.あなた.workers.dev"
                 value="${KN.dietAI.url()}">
        </label>
        <button type="button" class="btn btn-soft btn-block js-check" style="margin:var(--sp-2) 0 var(--sp-3)">確かめる</button>
        <p class="set-foot is-flush js-check-out" style="display:none"></p>
        <p class="set-foot is-flush"><b>APIキーはここに入れません</b>（窓口の側に置きます）。</p>
        <p class="set-foot is-flush" style="margin-top:var(--sp-3)"><b>建て方</b></p>
        <div class="set-card is-pad" style="margin:0 0 var(--sp-3)">
          <p class="set-foot is-flush">① 道（合言葉）をつくる</p>
          <div class="diet-relaykey" style="margin-top:8px">
            <code class="js-path">${aiPath || "（まだ作っていません）"}</code>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button type="button" class="btn btn-soft js-newpath" style="flex:1">道をつくる</button>
            <button type="button" class="btn btn-soft js-copypath" style="flex:1">道をコピー</button>
          </div>
        </div>
        <div class="set-card is-pad" style="margin:0 0 var(--sp-3)">
          <p class="set-foot is-flush">② 窓口を置く</p>
          <a class="btn btn-primary btn-block" style="margin-top:8px"
             href="${AI_DEPLOY_URL}" target="_blank" rel="noopener">Cloudflareに置く</a>
          <ol class="diet-steps" style="margin-top:12px">
            <li>Cloudflareに登録して、GitHubとつなぐ画面が出たら許可する</li>
            <li><b>AI_PATH</b> を聞かれたら、①でコピーした道を<b>ペースト</b></li>
            <li><b>ANTHROPIC_API_KEY</b> には、Anthropic の Console（console.anthropic.com）の API Keys で作った鍵を<b>ペースト</b></li>
            <li><b>Deploy</b>（Create and deploy）を押す</li>
          </ol>
        </div>
        <p class="set-foot is-flush">③ …workers.dev を上の欄に貼って「確かめる」→「保存」。</p>
        <p class="set-foot is-flush">Console の Limits で<b>月の上限額</b>を決めておいてください。</p>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-clear" style="flex:1">外す</button>
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIの窓口", content: body, footer: foot });
    const input = body.querySelector(".js-url");
    const label = body.querySelector(".js-path");
    const out = body.querySelector(".js-check-out");

    /* 道の付いていないURLには、①の道を継ぎます（中継所と同じ joinUrl）。
       道が付いていれば、そのまま——自分で建てた別の窓口も入れられます。 */
    const joined = () => {
      const v = input.value.trim();
      return v && aiPath ? KN.healthRelay.joinUrl(v, aiPath) : v;
    };

    body.querySelector(".js-newpath").addEventListener("click", () => {
      aiPath = KN.healthRelay.makePath();
      label.textContent = aiPath;
      copyText(aiPath, "道");
    });
    body.querySelector(".js-copypath").addEventListener("click", () => {
      if (!aiPath) { KN.ui.toast("先に「道をつくる」を押してください"); return; }
      copyText(aiPath, "道");
    });
    body.querySelector(".js-check").addEventListener("click", () => {
      const v = joined();
      if (!/^https:\/\/\S+$/.test(v)) { KN.ui.toast("https:// で始まるURLを入れてください"); return; }
      out.style.display = "";
      out.textContent = "確かめています…";
      KN.dietAI.check(v)
        .then((r) => { out.textContent = `通りました（${r.model || "モデル不明"}）。「保存」を押してください。`; })
        .catch((err) => { out.textContent = "通りませんでした：" + (err && err.message || err); });
    });
    foot.querySelector(".js-save").addEventListener("click", () => {
      const v = joined();
      if (v && !/^https:\/\//.test(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      KN.dietAI.setUrl(v);
      h.close(); render();
      KN.ui.toast(v ? "保存しました" : "外しました");
    });
    foot.querySelector(".js-clear").addEventListener("click", () => {
      KN.dietAI.setUrl(""); h.close(); render(); KN.ui.toast("外しました");
    });
  }

  Object.assign(S, { relayRows, relayHowRows, openAiSheet });
})();
