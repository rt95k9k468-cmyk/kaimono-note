/* =========================================================
   くらしノート — settings screen：同期の部屋（js/sync.js。docs/sync.md 段2）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const S = KN.settingsParts;
  const { TINT, card, foot, navRow, dangerRow, render, copyText, fieldCard } = S;

  /* 部屋の URL は資格情報。つなぐまで紙の外（ここ）に持ち、つないだら sync の入れ物へ。どこにも書き出さない。 */
  let roomUrl = "";
  let joining = false;

  const ASK = {
    first: (n) => `最初の中身を置く（${n}件）`,
    bulk: (n) => `入れ替わった ${n} 件を送る`,
    many: (n) => `消した ${n} 件を送る`,
  };
  const TROUBLE = {
    who: "部屋から切られています", old: "アプリが部屋より古い版です", key: "鍵が Dropbox と合いません",
    stale: "部屋へ送れていません", far: "部屋とずれています",
  };

  function syncValue() {
    const st = KN.sync.status();
    if (!st.joined) return "";
    return st.trouble ? "!" : st.ask ? "待っています" : "つないであります";
  }

  function syncRows() {
    const sync = KN.sync;
    const st = sync.status();
    if (st.phase === "off") return [foot("この端末では使えません。")];
    if (!st.joined) {
      return [
        fieldCard({
          label: "部屋のURL", value: roomUrl, placeholder: "https://kurashi-sync.….workers.dev",
          onSave: (v) => { roomUrl = v; render(); },
        }),
        card(
          navRow({
            ico: "copy", tint: TINT.sub, title: "合言葉をコピー", act: true,
            onTap: () => sync.setupCode().then((c) => copyText(c, "合言葉")).catch((e) => KN.ui.toast(e.message)),
          }),
          navRow({
            ico: "check", tint: TINT.data, title: "つなぐ", act: true, off: !roomUrl,
            onTap: () => {
              if (!roomUrl) { KN.ui.toast("先に部屋のURLを"); return; }
              if (joining) return;
              joining = true;
              sync.setupCode().then((code) => sync.join(roomUrl, code))
                .then(() => { roomUrl = ""; KN.ui.toast("つなぎました"); })
                .catch((e) => KN.ui.toast((e && e.message) || "つなげませんでした"))
                .then(() => { joining = false; render(); });
            },
          })
        ),
        foot("合言葉は Cloudflare の ROOM_SETUP へ。"),
      ];
    }
    const rows = [];
    if (st.trouble) rows.push(card(navRow({ ico: "download", tint: TINT.warn, title: TROUBLE[st.trouble], alert: true, act: true, onTap: () => {} })));
    if (st.ask) {
      rows.push(card(navRow({
        ico: "upload", tint: TINT.data, title: ASK[st.ask.kind](st.ask.n), act: true,
        onTap: () => KN.ui.confirm({
          title: st.ask.kind === "first" ? "部屋に最初の中身を置く" : "部屋へ送る",
          message: st.ask.kind === "first" ? "この端末の記録を、鍵をかけて部屋へ送ります。" : "",
          okLabel: "送る",
        }).then((ok) => { if (ok) sync.go(); }),
      })));
    }
    const last = st.checks[st.checks.length - 1];
    const far = st.checks.filter((c) => c.miss || c.extra || c.body === false).length;
    rows.push(foot([
      st.out ? `送り待ち ${st.out}件` : "",
      st.checks.length ? `照らした日 ${st.checks.length}日・ずれ ${far}日` : "",
      last ? `最後に照らした日 ${last.day}` : "",
    ].filter(Boolean).join("　") || "送り待ちはありません。"));
    rows.push(card(dangerRow({
      ico: "trash", title: "この端末を切る",
      onTap: () => KN.ui.confirm({ title: "この端末を切る", message: "", okLabel: "切る", danger: true })
        .then((ok) => { if (ok) sync.leave().then(render); }),
    })));
    return rows;
  }

  /** 根っこの頭の一行（困ったとき・送るのを待っているときだけ）。 */
  function syncAlert() {
    if (!KN.sync) return null;
    const st = KN.sync.status();
    const why = st.trouble ? TROUBLE[st.trouble] : st.ask && st.ask.kind !== "first" ? ASK[st.ask.kind](st.ask.n) : "";
    if (!why) return null;
    return card(navRow({ ico: "upload", tint: TINT.warn, title: why, alert: true, onTap: () => S.go("sync") }));
  }

  Object.assign(S, { syncRows, syncValue, syncAlert });
  /* 同期の様子は store の外で動くので、設定が出ているときだけ組み直す。 */
  if (KN.sync) KN.sync.onChange(() => { if (KN.app.activeScreen && KN.app.activeScreen() === "settings") render(); });
})();
