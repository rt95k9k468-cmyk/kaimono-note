/* 通知を押したら、その用事が開く（R3・2026年9月28日）。

   時刻の通知（notify.js の tick()・sw.js の push）は、`data.due` にその時刻の
   用事の id を持っています。押すと sw.js の notificationclick が `#due=id,id`
   でアプリを開き（開いていればそこへ送り）、app.js がここを呼びます。

   出すのは一枚の紙で、用事ごとに大きな二つ：**済ませた**／**あとで**。
   あとでは Things 3.24 と同じ四択（15分・1時間・3時間・明日）。どれも
   ふつうの編集（`store.toggleTodo`・`store.updateTodo`）で、新しい欄は
   作りません。時刻を直すと `notifiedFor` と回が食い違うので、新しい時刻に
   もう一度鳴ります（開いていれば notify.js、閉じていれば bell.js の列）。

   くり返す用事には「あとで」を出しません。記録は一件なので、時刻を直すと
   次の回からも動いてしまいます（docs/todo-items.md の「通知を押したら」）。 */
(function () {
  const KN = window.KN;
  const { html, node, haptic } = KN.util;
  const store = KN.store;

  const PREFIX = "due=";

  /* 四択。min は今からの分、day は明日の同じ時刻。 */
  const LATER = [
    { key: "15m", label: "15分", min: 15 },
    { key: "1h", label: "1時間", min: 60 },
    { key: "3h", label: "3時間", min: 180 },
    { key: "tomorrow", label: "明日", day: 1 },
  ];

  /** `#due=a,b` の a,b。ほかの印なら null。 */
  function idsFromHash(hash) {
    const h = String(hash || "").replace(/^#/, "");
    if (!h.startsWith(PREFIX)) return null;
    return h.slice(PREFIX.length).split(",").map((s) => decodeURIComponent(s)).filter(Boolean);
  }

  /** あとでにしたときの { due, time }。くり返す用事・選べないものは null。 */
  function later(t, key, now) {
    const pick = LATER.find((x) => x.key === key);
    if (!t || !pick || t.repeat) return null;
    const U = KN.util;
    if (pick.day) {
      return { due: U.shiftDay(U.todayKey(), pick.day), time: t.time || null };
    }
    const d = new Date((now == null ? Date.now() : now) + pick.min * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return { due: U.dayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  /* 閉じていても鳴る列へ、すぐ。bell.js は変更から3秒待ちますが、通知から
     来た人は直したらすぐ閉じるので、待つと中継所に古い時刻が残ります。 */
  function syncBell() {
    if (KN.bell && KN.bell.active()) KN.bell.sync();
  }

  let handle = null;

  function open(ids) {
    const rows = (ids || []).map((id) => store.getTodo(id))
      .filter((t) => t && !t.done && !t.archived && !t.trace);
    if (handle) { handle.close(); handle = null; }
    if (!rows.length) {
      if ((ids || []).length) KN.ui.toast("その用事は、もう片づいています");
      return null;
    }

    const box = node(html`<div class="due-list"></div>`);
    const left = new Set(rows.map((t) => t.id));

    const finish = (id) => {
      left.delete(id);
      if (!left.size && handle) { handle.close(); handle = null; }
    };

    rows.forEach((t) => {
      const row = node(html`
        <div class="due-row" data-id="${t.id}">
          <div class="due-head">
            ${t.time ? html`<span class="due-time">${t.time}</span>` : ""}
            <span class="due-title">${t.title}</span>
          </div>
          <div class="due-acts">
            <button type="button" class="btn btn-primary js-done">済ませた</button>
            ${t.repeat ? "" : html`<button type="button" class="btn btn-soft js-later" aria-expanded="false">あとで</button>`}
          </div>
          ${t.repeat ? "" : html`<div class="due-later" hidden>
            ${LATER.map((x) => html`<button type="button" class="btn btn-soft js-pick" data-key="${x.key}">${x.label}</button>`)}
          </div>`}
          ${t.repeat ? html`<p class="due-note">くり返す用事は「あとで」にできません。</p>` : ""}
          <button type="button" class="btn btn-ghost due-open js-open">用事の紙を開く</button>
        </div>
      `);

      row.querySelector(".js-done").addEventListener("click", () => {
        const cur = store.getTodo(t.id);
        if (!cur || cur.done) { finish(t.id); row.remove(); return; }
        const res = store.toggleTodo(t.id);
        haptic([16, 40, 16]);
        syncBell();
        row.remove();
        finish(t.id);
        KN.screens.todo.sayDone(t, { ...res, undo: () => { res.undo(); syncBell(); } });
      });

      const laterBtn = row.querySelector(".js-later");
      const pane = row.querySelector(".due-later");
      if (laterBtn) {
        laterBtn.addEventListener("click", () => {
          haptic();
          pane.hidden = !pane.hidden;
          laterBtn.setAttribute("aria-expanded", String(!pane.hidden));
        });
        pane.querySelectorAll(".js-pick").forEach((b) => b.addEventListener("click", () => {
          const cur = store.getTodo(t.id);
          const next = later(cur, b.dataset.key, Date.now());
          if (!next) return;
          const was = { due: cur.due, time: cur.time };
          store.updateTodo(t.id, next);
          haptic();
          syncBell();
          row.remove();
          finish(t.id);
          const when = next.due === KN.util.todayKey() ? next.time : `${KN.util.formatDay(next.due)} ${next.time || ""}`.trim();
          KN.ui.toast(`「${t.title}」は ${when} に`, {
            action: { label: "元に戻す", onClick: () => { store.updateTodo(t.id, was); syncBell(); } },
          });
        }));
      }

      row.querySelector(".js-open").addEventListener("click", () => {
        if (handle) { handle.close(); handle = null; }
        setTimeout(() => {
          if (KN.screens.todo && KN.screens.todo.open) KN.screens.todo.open(t.id);
        }, 40);
      });

      box.append(row);
    });

    const first = rows[0];
    const title = rows.length === 1 ? "時刻になりました" : `${first.time || ""} の用事`.trim();
    handle = KN.ui.sheet({
      title,
      content: box,
      onClose: () => { handle = null; },
    });
    return handle;
  }

  /* ---------------- 押したことの控え（sw.js の notificationclick） ----------------

     iPhone では `#due=` が届かないことがある（眠っている窓への navigate が効かない・
     閉じていたときの openWindow が印を落とす）。sw.js が押した時刻と id を小さな
     控えに置くので、開いたとき・戻ってきたときにここで読んで消す。id が無い控え
     （写しに見つからなかった押し）は、押した時刻の前30分〜後5分に時刻が来た、
     今日のまだの用事を探す。10分より古い控えは使わない（押したあと開かなかった）。 */
  const BOX = "kn-due-click";
  const KEY = "./__due-click";
  const FRESH = 10 * 60 * 1000;

  function dueNear(at) {
    const d = new Date(at);
    const mins = d.getHours() * 60 + d.getMinutes();
    const m = (hm) => { const [h, mi] = String(hm).split(":").map(Number); return h * 60 + mi; };
    return store.openTodos()
      .filter((t) => t.due && t.time && KN.util.daysUntil(t.due) === 0
        && m(t.time) <= mins + 5 && m(t.time) >= mins - 30)
      .map((t) => t.id);
  }

  /* 通知の足あと（困ったときの記録へ。題や本文は書かない——件数と道だけ）。 */
  function trail(msg) {
    if (KN.errlog) KN.errlog.note("notice", `通知：${msg}`, { file: "due-sheet.js" });
  }

  /** 控えがあれば id の並び（読んだら消す）。無ければ null。 */
  async function take(now) {
    if (!("caches" in window)) return null;
    try {
      const box = await caches.open(BOX);
      const res = await box.match(KEY);
      if (!res) return null;
      await box.delete(KEY);
      const rec = await res.json();
      const t = now == null ? Date.now() : now;
      const secs = rec ? Math.round((t - rec.at) / 1000) : null;
      if (!rec || !(t - rec.at < FRESH)) {
        trail(`控えが古いので使わない（押して${secs}秒）`);
        return null;
      }
      const ids = Array.isArray(rec.due) ? rec.due.filter((x) => typeof x === "string" && x) : [];
      const got = ids.length ? ids : dueNear(rec.at);
      trail(`控えを読んだ（押して${secs}秒・道 ${rec.via || "?"}・id ${ids.length}件→開く${got.length}件）`);
      return got;
    } catch (err) {
      return null;
    }
  }

  KN.dueSheet = { open, later, idsFromHash, take, dueNear, trail, LATER, PREFIX, BOX, KEY };
})();
