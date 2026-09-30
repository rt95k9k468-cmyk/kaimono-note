/* =========================================================
   これからの二週間（R7、2026年9月28日。docs/todo-timeline.md の
   「これからの二週間」）

   日付のある用事・くり返し・期限を、今日から14日ぶん、一枚の紙で。
   押せば、やることのその日へ。

   - **数えるだけで、記録は増やさない**（Daily Log の「写さず引く」と同じ）。
     くり返しは `store.fallsOn` がその日に立つと答えたぶんだけ並べます
     ——時間割が先の日に立てるのと同じ数え方なので、一覧と時間割が
     食い違いません。「済ませてから◯日」は次の一回（due）だけが立ちます。
   - 期限（`deadline`）は、その日に「期限」として並べます。やる日と同じ日
     なら一行にまとめて札だけ付けます（同じ用事を二度並べない）。
   - 済ませたもの・棚へ送ったものは出しません（これからの一覧なので）。
   - 何も無い日は並べません。二週間まるごと空なら、そう一言。
   - **毎日のくり返しは載せません**（2026年9月28日、利用者の声）。朝の
     ルーティン・夜のルーティンが14日ぶん毎日並ぶと、一回きりの予定が
     その下に埋もれて読めませんでした。外すのは `routine()` が言うもの
     ——毎日・週に5日以上・毎朝毎晩の端（`part`）。数え方（`fallsOn`）は
     そのままで、並べる前に外すだけです。紙の終わりに一言だけ添えます。
   - 読みやすさ：日ごとに曜日の色の帯（土は青・日は赤みの暖色、ほかは
     穏やかな色を一つずつ）と、行の間をゆったり。評価の色ではなく
     「どの日か」を目で拾うための色です。
   - 入口は上の帯の暦の絵（js/head.js）。帯は全タブで一つなので、どの
     タブからでも開けます。押した日は、やることの画面で開きます。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const { html, node, icon } = U;

  /** 何日ぶん見るか。 */
  const SPAN = 14;

  /**
   * 今日（from）から n 日ぶん、日ごとの並び。何も無い日は入れません。
   * @returns {{day: string, rows: {t: object, due: boolean, deadline: boolean}[]}[]}
   */
  /** 毎日のように立つもの。二週間の一覧には並べません（上の説明）。 */
  function routine(t) {
    if (!t || !t.repeat) return false;
    if (t.part) return true;
    if (t.repeat === "daily") return true;
    if (t.repeat === "weekly" && (t.repeatDays || []).length >= 5) return true;
    return false;
  }

  function days(todos, from, n) {
    const open = (todos || []).filter((t) => t && !t.done && !t.archived && !routine(t));
    const out = [];
    for (let i = 0; i < (n || SPAN); i++) {
      const day = U.shiftDay(from, i);
      const rows = [];
      open.forEach((t) => {
        const due = KN.store.fallsOn(t, day);
        const deadline = t.deadline === day;
        if (due || deadline) rows.push({ t, due, deadline });
      });
      if (!rows.length) continue;
      /* やる日のものが先、時刻のあるものは時刻の順。期限だけのものは下へ。 */
      rows.sort((a, b) => (b.due - a.due)
        || ((a.t.time || "99") < (b.t.time || "99") ? -1 : (a.t.time || "99") > (b.t.time || "99") ? 1 : 0));
      out.push({ day, rows });
    }
    return out;
  }

  /** 「今日」「明日」、それより先は「9月30日(水)」。 */
  function dayName(day) {
    const d = U.dayDate(day);
    const k = U.daysUntil(day);
    const date = `${d.getMonth() + 1}月${d.getDate()}日(${U.WEEKDAYS[d.getDay()]})`;
    if (k === 0) return { name: "今日", date };
    if (k === 1) return { name: "明日", date };
    return { name: date, date: "" };
  }

  function rowHtml(r) {
    const t = r.t;
    return html`
      <li class="up-row${r.deadline && !r.due ? " is-dl" : ""}">
        <span class="up-time">${r.due && t.time ? t.time : ""}</span>
        <span class="up-title">${t.title || "（題なし）"}</span>
        ${r.due && t.repeat ? html`<span class="up-rep" aria-label="くり返し">${icon("repeat")}</span>` : ""}
        ${r.deadline ? html`<span class="up-dl">期限</span>` : ""}
      </li>
    `;
  }

  let handle = null;

  function open() {
    const today = U.todayKey();
    const todos = KN.store.get().todos;
    const list = days(todos, today, SPAN);
    const hidden = todos.some((t) => t && !t.done && !t.archived && routine(t));
    const body = node(html`<div class="up"></div>`);
    if (!list.length) {
      body.append(node(html`<p class="up-empty">この二週間に、日付の決まった用事はありません</p>`));
    }
    list.forEach((g) => {
      const n = dayName(g.day);
      const sec = node(html`
        <section class="up-day" data-wd="${U.dayOfWeek(g.day)}">
          <button type="button" class="up-head js-up-day" data-day="${g.day}">
            <span class="up-name">${n.name}</span>
            ${n.date ? html`<span class="up-date">${n.date}</span>` : ""}
            <span class="up-go">${icon("chevron")}</span>
          </button>
          <ul class="up-rows">${g.rows.map(rowHtml)}</ul>
        </section>
      `);
      /* 行を押しても、その日へ。行ごとに紙を開く道はやることの画面が持って
         いるので、ここは「その日」へ運ぶだけにします。 */
      sec.addEventListener("click", () => go(g.day));
      body.append(sec);
    });
    if (hidden) {
      body.append(node(html`<p class="up-note">毎日のくり返しは載せていません</p>`));
    }
    handle = KN.ui.sheet({ title: "これからの二週間", content: body });
    return handle;
  }

  /** やることの、その日へ。 */
  function go(day) {
    U.haptic();
    if (handle) { handle.close(); handle = null; }
    const todo = KN.screens && KN.screens.todo;
    if (KN.app.activeScreen() !== "todo") KN.app.showScreen("todo");
    if (todo && todo.goDay) todo.goDay(day);
  }

  KN.upcoming = { days, open, go, routine, SPAN };
})();
