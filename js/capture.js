/* js/capture.js — どの＋からでも、行き先を言い直せる（docs/roadmap.md の R4・R5）
 *
 * 打った字から「これは、やること？ 買うもの？」を推します。いまのタブと違う
 * 行き先らしいときだけ、入力欄の下に札（「→ やること 明日 19:00」）が出て、
 * 押せばそちらへ入る。押さなければ今までどおり。
 *
 * **前半（`guess` / `voiceSplit`）は純粋な部品です。** DOM も store も触らず、
 * 字と「引き当ての道具」（ctx）を受け取って行き先を返すだけ——when-parse.js・
 * split-items.js と同じく、当たり外れを表で測るため（tests/capture.js）。
 * 後半（`ctx` 以下）は画面の側の糊で、store に入れるのはそちら。
 *
 * ## 推しかた（上から順に、最初に当たったもの）
 *
 * 0. **覚えた言葉**（札を押して行き先を変えた字。`settings.captureDest`）。
 * 1. **日付・時刻・くり返し・期限が読めた** → やること（when-parse の `found`）。
 * 2. **「〜を買う」「〜を買って」** → 買うもの（名前は頭のほう）。
 * 3. **登録済みの品物・絵の辞書の品（`findKey`）・覚えたカテゴリ** → 買うもの。
 *    ただし**用事の形の字**（「を」がある・漢字＋送り仮名の動詞で終わる：
 *    「電球を替える」「洗濯物を干す」）は品物として読まない——絵の辞書は
 *    「電球」を知っているので、ここで止めないと用事が買うものへ流れる。
 *    登録済みの品物の名前そのものなら、形にかかわらず買うもの。
 * 4. どれでもない → null（今までどおり、開いているタブの入れ方）。
 *
 * 日記は入れる先にしない（保存の道を増やさない）。 */
(function () {
  "use strict";
  const KN = (window.KN = window.KN || {});

  const fold = (s) => (KN.util && KN.util.foldKana ? KN.util.foldKana(s) : String(s || "").toLowerCase());

  /* 「牛乳を買う」「電池買っておく」「卵も買って」。頭が名前。 */
  const BUY_TAIL = /\s*(を|も)?\s*(買う|かう|買って|かって|買っておく|買っとく|買い足す|買いたす|追加)(する|して)?(こと|おく)?\s*$/;
  /* 用事の形：「を」を持つ、または漢字のあとの送り仮名が動詞の終わり。
     「ぶどう」「こしょう」は仮名だけなので当たらない。 */
  /* 「田中さんに電話」「駅で待ち合わせ」の「に・へ・で」も用事の形（「にんじん」の
     ように仮名が続くものは当たらない）。 */
  const TASK_SHAPE = /を|[一-龯々][ぁ-ゖ]{0,3}[うくすつぬふむゆるぐずづぶぷ]$|する$|します$|(さん|[一-龯々ァ-ヶー])[にへで][一-龯々ァ-ヶ]/;

  /**
   * @param {string} text 打った字
   * @param {object} c    { today, learned, isProduct(name), iconKey(name), learnedCat(name) }
   * @returns {null | {dest: "todo"|"list", why: string, title: string, when?: object}}
   */
  function guess(text, c) {
    const ctx = c || {};
    const raw = String(text == null ? "" : text).trim();
    if (!raw || /[\r\n]/.test(raw)) return null;   // 改行は R1（分けて入れる）の話

    const learned = ctx.learned || {};
    const k = fold(raw);
    if (learned[k] === "todo" || learned[k] === "list") {
      return { dest: learned[k], why: "learned", title: raw };
    }

    const W = ctx.whenParse || KN.whenParse;
    if (W) {
      const res = W.parse(raw, { today: ctx.today });
      if (W.found(res) && String(res.title || "").trim()) {
        return { dest: "todo", why: "when", title: res.title, when: res };
      }
    }

    const isProduct = ctx.isProduct || (() => false);
    const iconKey = ctx.iconKey || (() => null);
    const learnedCat = ctx.learnedCat || (() => false);

    const m = raw.match(BUY_TAIL);
    if (m && m.index > 0) {
      const name = raw.slice(0, m.index).trim();
      if (name && !/を/.test(name)) return { dest: "list", why: "buy", title: name };
    }

    if (isProduct(raw)) return { dest: "list", why: "product", title: raw };
    if (TASK_SHAPE.test(raw)) return null;
    if (learnedCat(raw) || iconKey(raw)) return { dest: "list", why: "item", title: raw };
    return null;
  }

  /**
   * 声は「牛乳と卵と洗剤」のように「と」でつなぐ（R5）。「と」で切ると
   * 「トマト」「とうもろこし」「さといも」が壊れるので、**切ったどの片も
   * 品物に当たるときだけ**切る。当たらない片は隣とつなぎ直して試す。
   * @param {string} text
   * @param {(name: string) => boolean} isItem
   * @returns {string[]}
   */
  function voiceSplit(text, isItem) {
    const raw = String(text || "").trim();
    if (raw.indexOf("と") < 0 || typeof isItem !== "function") return raw ? [raw] : [];
    const bits = raw.split("と");
    const out = [];
    let cur = null;
    bits.forEach((b) => {
      cur = cur == null ? b : cur + "と" + b;
      const t = cur.trim();
      if (t && isItem(t)) { out.push(t); cur = null; }
    });
    if (cur != null || out.length < 2) return [raw];
    return out;
  }

  /* ---------------- ここから画面の側（store を触る） ---------------- */

  const S = () => KN.store;

  /* 品物の絵の辞書には、**場所と用事の絵**も入っています（銀行・病院・ごみ出し・
     電話…）。それに当たった字は品物ではないので、買うものへは推しません。
     見出しごと外すものと、品物の見出しに混ざっている一枚ずつ。 */
  const PLACE_SECTIONS = ["お店", "おでかけ", "役所・お金", "趣味・スポーツ", "行事・そのほか"];
  const ITEM_KEEP = ["catLitter", "petSheet", "present", "receipt", "ticket", "guidebook", "map"];
  const PLACE_KEYS = ["broom", "trashOut", "hospital", "dentist", "pharmacy", "drugstore",
    "healthCheck", "vaccination", "document", "stationery", "groceries", "household", "baby"];
  /* 絵は品物（洗濯洗剤・掃除機）に当たるが、字だけなら家事の名前。 */
  const CHORE_WORDS = ["洗濯", "せんたく", "掃除", "そうじ", "買い物", "買いもの", "かいもの", "片付け", "片づけ"];
  function itemIcon(P, name) {
    if (!P || !P.findKey) return null;
    if (CHORE_WORDS.indexOf(String(name).trim()) >= 0) return null;
    const k = P.findKey(name);
    if (!k) return null;
    if (ITEM_KEEP.indexOf(k) >= 0) return k;
    if (PLACE_KEYS.indexOf(k) >= 0) return null;
    if (P.sectionOf && PLACE_SECTIONS.indexOf(P.sectionOf(k)) >= 0) return null;
    return k;
  }

  /** いまの記録から、引き当ての道具を組みます。 */
  function ctx() {
    const st = S().get();
    const P = KN.productIcons;
    const learnedCat = (name) => {
      const k = fold(name);
      return !!(st.learned && st.learned[k]);
    };
    return {
      today: KN.util.todayKey(),
      learned: (st.settings && st.settings.captureDest) || {},
      isProduct: (name) => !!S().findProductByName(name),
      iconKey: (name) => itemIcon(P, name),
      learnedCat,
    };
  }

  const LEARN_MAX = 200;
  /** 札を押して行き先を変えた字を覚えます（カテゴリの学習と同じ考え）。 */
  function learn(text, dest) {
    const k = fold(String(text || "").trim());
    if (!k || (dest !== "todo" && dest !== "list")) return;
    S().update((s) => {
      const cur = (s.settings.captureDest && typeof s.settings.captureDest === "object") ? s.settings.captureDest : {};
      const next = {};
      Object.keys(cur).filter((x) => x !== k).slice(-(LEARN_MAX - 1)).forEach((x) => { next[x] = cur[x]; });
      next[k] = dest;
      s.settings.captureDest = next;
    });
  }

  /** 買うものへ一つ（手で足すときと同じ足し方）。もう載っていれば item は null。
      `undo()` は足した行と、そのとき作った品物（値段が付いていなければ）を片づける。 */
  function toList(name) {
    const store = S();
    const n = String(name || "").trim();
    if (!n) return null;
    const had = store.findProductByName(n);
    const product = had || store.addProduct({ name: n, categoryId: store.guessCategory(n) });
    if (!product) return null;
    if (store.get().items.some((i) => i.productId === product.id && !i.checked)) return { product, item: null, undo: () => {} };
    const item = store.addItem(product.id);
    const undo = () => store.update((s) => {
      s.items = s.items.filter((i) => i.id !== item.id);
      if (had) return;
      const used = s.items.some((i) => i.productId === product.id);
      s.products = s.products.filter((p) => p.id !== product.id || used || (p.prices && p.prices.length));
    });
    return { product, item, undo };
  }

  /** やることへ一件。読めた「いつ」をそのまま欄に。 */
  function toTodo(text, when) {
    const W = KN.whenParse;
    const res = when || (W ? W.parse(String(text || ""), {}) : null);
    const found = res && W && W.found(res);
    const title = found ? res.title : String(text || "").trim();
    if (!title) return null;
    /* 日付を言わなければ今日（やることの紙の新規と同じ考え。「いつか」の棚は
       見に行かないと目に入らない）。 */
    const due = found && res.due ? res.due : KN.util.todayKey();
    const rec = S().addTodo({
      title, due, time: found ? res.time || null : null,
      minutes: found ? res.minutes || null : null,
      deadline: found ? res.deadline || null : null,
      repeat: found ? res.repeat || null : null,
      repeatDays: found ? res.repeatDays || [] : [],
      repeatNth: found ? res.repeatNth || null : null,
    });
    if (rec && KN.bell && KN.bell.sync) { try { KN.bell.sync(); } catch (e) { /* 鳴らす側の都合 */ } }
    return rec;
  }

  /** 札の字。 */
  function label(g) {
    if (!g) return "";
    if (g.dest === "todo") {
      const W = KN.whenParse;
      const w = g.when && W ? W.describe(g.when) : "";
      return w ? `→ やること　${w}` : "→ やること";
    }
    return "→ 買うもの";
  }

  /**
   * 入力欄の下の札。`from` はいまの行き先（その行き先と同じなら出さない）。
   * @param {HTMLElement} chip   札の button（hidden で始める）
   * @param {{from: string, text: () => string, go: (g: object) => void}} o
   * @returns {() => void} 描き直し
   */
  function bindChip(chip, o) {
    let cur = null;
    const paint = () => {
      let g = null;
      try { g = guess(o.text(), ctx()); } catch (e) { g = null; }
      cur = g && g.dest !== o.from ? g : null;
      chip.hidden = !cur;
      if (cur) {
        const t = label(cur);
        if (chip.textContent !== t) chip.textContent = t;
      }
    };
    chip.addEventListener("mousedown", (e) => e.preventDefault());   // 欄の字を残したまま
    chip.addEventListener("click", () => {
      if (!cur) return;
      const g = cur;
      learn(o.text(), g.dest);
      o.go(g);
    });
    return paint;
  }

  KN.capture = { guess, voiceSplit, ctx, learn, toList, toTodo, label, bindChip };
})();
