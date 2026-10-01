/* =========================================================
   くらしノート — settings screen：notes の行（並び・ノートブック・タグ・書き出し）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」、ノートの決めごとは docs/notes.md の
   「設定」。

   ノートは daily の席を分け合うので、daily のすぐ下に notes の見出しで並びます
   （screen-settings.js の `TAB.more`）。中身は `KN.notes`（js/notes-idb.js）が
   持っていて、ここから書くのは名前の付け替えだけ。色と並びは store の設定。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { go, back, card, navRow, dangerRow, pickRow, choose, render, TINT } = S;

  const N = () => KN.notes;
  const NS = () => KN.screens.notes;
  const ready = () => !!(N() && N().state() === "on");
  const names = (kind) => (!ready() ? [] : kind === "nb" ? N().notebooks() : N().tagNames());
  const KIND = { nb: { word: "ノートブック", ico: "book" }, tag: { word: "タグ", ico: "tag" } };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  /* ノートの面は設定の外なので、並び・色・名前を変えたら組み直しておきます
     （戻ったときに古い色のまま見えないように）。 */
  const repaintNotes = () => { const ns = NS(); if (ns && ns.render) ns.render(); };

  /* ---------------- 根っこ ----------------

     並びは daily →「表示」から移しました（ノートの話なので）。保存の鍵は
     `settings.notesOrder` のまま。ノートブック・タグは、一つも無ければ行ごと
     出しません（中身の無い一枚になるので。絞り込みのチップと同じ）。
     数は出しません——daily の席なので。 */
  function notesRows() {
    const created = store.get().settings.notesOrder === "created";
    return [
      card(
        pickRow({
          title: "並び", value: created ? "作った日" : "直した日",
          onTap: () => choose({
            title: "ノートの並び", value: created ? "created" : "updated",
            options: [
              { id: "updated", label: "直した日" },
              { id: "created", label: "作った日" },
            ],
            onPick: (v) => {
              store.update((s) => { s.settings.notesOrder = v; });
              render();
              repaintNotes();
            },
          }),
        })
      ),
      card(
        names("nb").length ? navRow({ ico: "book", tint: TINT.cat, title: "ノートブック", onTap: () => go("notesBooks") }) : null,
        names("tag").length ? navRow({ ico: "tag", tint: TINT.icons, title: "タグ", onTap: () => go("notesTags") }) : null,
        navRow({ ico: "download", tint: TINT.sub, title: "書き出し", onTap: openExport })
      ),
    ];
  }

  /* ---------------- ノートブック・タグ ----------------

     一覧の行の四角は、その名前の色（一覧のカード・チップと同じ色）。押すと
     その一つの一枚（`noteLabel`）：名前・色・外す。 */
  let editing = null;   // { kind, name }

  function notesLabelList(kind) {
    return [card(names(kind).map((name) => navRow({
      ico: KIND[kind].ico, tint: NS().colorOf(kind, name), title: name,
      onTap: () => { editing = { kind, name }; go("noteLabel"); },
    })))];
  }

  const noteLabelTitle = () => (editing ? editing.name : "");

  function noteLabelRows() {
    /* 外したあと・ほかで最後のノートから外れたあとは、何も出しません。 */
    if (!editing || !names(editing.kind).includes(editing.name)) return [];
    const { kind, name } = editing;

    const field = node(html`
      <div class="set-card is-pad">
        <label class="field">
          <span class="field-label">名前</span>
          <input class="input js-name" value="${name}" enterkeyhint="done" autocomplete="off" spellcheck="false">
        </label>
      </div>
    `);
    const f = field.querySelector(".js-name");
    /* 改行で決まる（離れれば change が走る）。変換を決める改行は通します。 */
    f.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      f.blur();
    });
    f.addEventListener("change", () => rename(kind, name, f.value, f));

    const colors = node(html`
      <div class="set-card is-pad">
        <div class="accent-row note-colors js-colors" role="radiogroup" aria-label="色"></div>
      </div>
    `);
    paintColors(colors.querySelector(".js-colors"), kind, name);

    return [
      field,
      colors,
      card(dangerRow({ title: `この${KIND[kind].word}を外す`, onTap: () => removeLabel(kind, name) })),
    ];
  }

  /** 名前を付け替える。もうある名前なら、まとめてよいかを一度だけ訊きます
      （まとめたあとは分けられないので）。 */
  function rename(kind, from, raw, f) {
    const to = String(raw || "").trim();
    if (!to || to === from) { f.value = from; return; }
    const merge = names(kind).includes(to);
    const ask = merge
      ? KN.ui.confirm({ title: `「${to}」にまとめますか？`, okLabel: "まとめる" })
      : Promise.resolve(true);
    ask.then((ok) => {
      if (!ok) { f.value = from; return; }
      N().renameLabel(kind, from, to);
      moveColor(kind, from, merge ? null : to);
      if (editing && editing.kind === kind && editing.name === from) editing.name = to;
      haptic();
      render();
      repaintNotes();
    });
  }

  /** 外す。ノートは消えません（その名前だけを外す）。 */
  function removeLabel(kind, name) {
    KN.ui.confirm({
      title: `「${name}」を外しますか？`,
      message: "ノートは消えません。",
      okLabel: "外す", danger: true,
    }).then((ok) => {
      if (!ok) return;
      N().renameLabel(kind, name, "");
      moveColor(kind, name, null);
      editing = null;
      haptic();
      back();
      repaintNotes();
    });
  }

  /* 色の置き場は `settings.noteColors = { nb: {名前: 色}, tag: {名前: 色} }`。
     無い名前は名前から決まった一色（screen-notes.js の colorOf）。 */
  function setColors(kind, fn) {
    store.update((s) => {
      const raw = s.settings.noteColors;
      const all = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const m = all[kind] && typeof all[kind] === "object" && !Array.isArray(all[kind]) ? all[kind] : {};
      fn(m);
      all[kind] = m;
      s.settings.noteColors = all;
    });
  }

  /** 付け替えた名前へ色を持っていく（to が null なら捨てるだけ）。まとめた
      ときは、まとめ先の色のまま。 */
  function moveColor(kind, from, to) {
    const all = store.get().settings.noteColors;
    if (!all || !own(all[kind], from)) return;
    setColors(kind, (m) => {
      if (to && !own(m, to)) m[to] = m[from];
      delete m[from];
    });
  }

  function paintColors(host, kind, name) {
    const now = NS().colorOf(kind, name);
    host.innerHTML = "";
    NS().COLORS.forEach((c, i) => {
      const on = c === now;
      const b = node(html`
        <button type="button" class="accent-dot ${on ? "is-on" : ""}" role="radio"
                aria-checked="${String(on)}" aria-label="${NS().COLOR_NAMES[i]}">
          <span class="accent-swatch" style="background:${c}"></span>
        </button>
      `);
      b.addEventListener("click", () => {
        if (c === NS().colorOf(kind, name)) return;
        setColors(kind, (m) => { m[name] = c; });
        KN.motion.fire("select", b);
        render();
        repaintNotes();
      });
      host.append(b);
    });
  }

  /* ---------------- 書き出し ----------------

     控え（バックアップ）にはもう noteBook が入っているので、ここは**人が読める
     形**で外へ出すためのもの。二つ：
       - 1件ずつ（zip）… ノートごとの .md。ノートブックはフォルダ。頭に作った日・
         直した日・ノートブック・タグ・★（YAML の front matter）。ほかのメモ
         アプリへ移すとき用。
       - 1つにまとめる（md）… 全部を一つの .md に。読み通すとき用。
     本文は打ったまま（行頭の印はもともと Markdown）。最近削除したノートは
     入れません。並びは一覧と同じ（設定の「並び」）。 */
  function exportBlocked() {
    const st = N() ? N().state() : "off";
    if (st === "on") return false;
    if (st === "loading" || st === "idle") {
      KN.ui.toast("ノートを読み込んでいるところです。少し待ってから、もう一度押してください");
    } else {
      KN.ui.toast("ノートを開けない日なので、書き出せません（何も書き出していません）", { duration: 6000 });
    }
    return true;
  }

  function openExport() {
    if (exportBlocked()) return;
    /* 何を書き出すか。一覧のチップと同じく一度に一つ（null はすべて）。 */
    let scope = null;
    const body = node(html`<div class="stack"><div class="js-scope"></div></div>`);
    const paintScope = () => {
      const host = body.querySelector(".js-scope");
      const all = N().list();
      const books = N().notebooks();
      const tags = N().tagNames();
      const hasFav = all.some((n) => n.fav);
      host.innerHTML = "";
      if (!hasFav && !books.length && !tags.length) return;
      const on = (k, v) => (k === "all" ? !scope : !!scope && scope.k === k && (k === "fav" || scope.v === v));
      const chip = (k, v, inner, label) => html`
        <button type="button" class="chip js-scope-pick" data-k="${k}" data-v="${v || ""}"
                aria-pressed="${String(on(k, v))}" ${label ? html`aria-label="${label}"` : ""}>${inner}</button>`;
      const dotOf = (kind, name) => html`<span class="chip-dot" style="--cat:${NS().colorOf(kind, name)}"></span>`;
      const row = node(html`
        <div class="chip-row notes-chips" role="group" aria-label="書き出すノート">
          ${chip("all", "", "すべて")}
          ${hasFav ? chip("fav", "", icon("star"), "★") : ""}
          ${books.map((b) => chip("nb", b, html`<span class="nb-ico" style="--cat:${NS().colorOf("nb", b)}">${icon("book")}</span><span>${b}</span>`))}
          ${tags.map((t) => chip("tag", t, html`${dotOf("tag", t)}<span>${t}</span>`))}
        </div>
      `);
      row.addEventListener("click", (e) => {
        const b = e.target.closest(".js-scope-pick");
        if (!b) return;
        const k = b.dataset.k;
        scope = k === "all" ? null : { k, v: b.dataset.v };
        KN.motion.fire("select");
        const x = row.scrollLeft;
        paintScope();
        const again = host.querySelector(".chip-row");
        if (again) again.scrollLeft = x;
      });
      host.append(row);
    };
    paintScope();

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-one" style="flex:1">${icon("book")}1つにまとめる</button>
        <button class="btn btn-primary js-zip" style="flex:1">${icon("download")}1件ずつ（zip）</button>
      </div>
    `);
    KN.ui.sheet({ title: "ノートを書き出す", content: body, footer: foot });

    /* 押した流れの中で組んで渡します（共有シートの前で await しない）。 */
    const run = (fmt) => {
      if (exportBlocked()) return;
      const list = notesIn(scope);
      if (!list.length) { KN.ui.toast("書き出すノートがありません"); return; }
      const name = fileName(scope, fmt === "zip" ? "zip" : "md");
      if (fmt === "zip") hand(name, zipNotes(list), "application/zip");
      else hand(name, new Blob([oneFile(list)], { type: "text/markdown;charset=utf-8" }), "text/markdown");
    };
    foot.querySelector(".js-zip").addEventListener("click", () => run("zip"));
    foot.querySelector(".js-one").addEventListener("click", () => run("md"));
  }

  /** 書き出すノート（消していないもの）。並びは一覧と同じ。 */
  function notesIn(scope) {
    let all = N().list();
    if (store.get().settings.notesOrder === "created") {
      all = all.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    if (!scope) return all;
    if (scope.k === "fav") return all.filter((n) => n.fav);
    if (scope.k === "nb") return all.filter((n) => n.notebook === scope.v);
    return all.filter((n) => n.tags.includes(scope.v));
  }

  const pad = (n) => String(n).padStart(2, "0");

  /** ファイル名に使えない字を除いた名前（長すぎるものは詰める）。 */
  function safeName(s) {
    const x = Array.from(String(s || "")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()).slice(0, 60).join("")
      .replace(/^\.+/, "")
      .replace(/[. ]+$/, "");
    return x || "無題";
  }

  function fileName(scope, ext) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const what = !scope ? "" : scope.k === "fav" ? "-star" : `-${safeName(scope.v)}`;
    return `kurashi-notes${what}-${stamp}.${ext}`;
  }

  /** 「2026-10-01T09:05:00+09:00」（その端末の時刻と、ずれ）。 */
  function localIso(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const off = -d.getTimezoneOffset();
    const a = Math.abs(off);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      + `${off >= 0 ? "+" : "-"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }

  /** 一覧のカードと同じ書き方（「2018年5月1日 20:20」、日だけのノートは時刻なし）。 */
  function whenText(n) {
    const d = new Date(n.createdAt);
    if (isNaN(d.getTime())) return "";
    const ymd = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return n.noTime ? ymd : `${ymd} ${d.getHours()}:${pad(d.getMinutes())}`;
  }

  /* YAML の文字列は JSON の書き方で（そのまま YAML として読める）。 */
  const q = (s) => JSON.stringify(String(s));
  const withEnd = (s) => (!s || s.endsWith("\n") ? s : s + "\n");

  /** 1件ずつのときの、一つの .md。 */
  function noteFile(n) {
    const lines = ["---"];
    lines.push(`created: ${n.noTime ? KN.util.dayKey(n.createdAt) : localIso(n.createdAt)}`);
    lines.push(`updated: ${localIso(n.updatedAt)}`);
    if (n.notebook) lines.push(`notebook: ${q(n.notebook)}`);
    if (n.tags.length) lines.push(`tags: [${n.tags.map(q).join(", ")}]`);
    if (n.fav) lines.push("favorite: true");
    lines.push("---");
    const title = String(n.title || "").trim();
    return `${lines.join("\n")}\n\n${title ? `# ${title}\n\n` : ""}${withEnd(n.body)}`;
  }

  /** 1つにまとめるときの .md。ノートの題を一番上の見出しにして、本文の見出しは
      一段ずつ下げます（ノートの切れ目が見出しで分かるように）。 */
  function oneFile(list) {
    return list.map((n) => {
      const head = N().headOf(n) || "無題";
      const meta = [whenText(n), n.notebook, n.tags.map((t) => `#${t}`).join(" ")].filter(Boolean).join(" ・ ");
      const body = n.body.split("\n").map((l) => (/^#{1,5} /.test(l) ? `#${l}` : l)).join("\n").replace(/\n+$/, "");
      return `# ${head}\n\n${meta}\n${body ? `\n${body}\n` : ""}`;
    }).join("\n\n");
  }

  function zipNotes(list) {
    const used = new Set();
    const dirs = new Set();
    const files = [];
    list.forEach((n) => {
      const dir = n.notebook ? `${safeName(n.notebook)}/` : "";
      if (dir && !dirs.has(dir)) { dirs.add(dir); files.push({ name: dir, text: "", date: n.updatedAt, dir: true }); }
      const base = dir + safeName(N().headOf(n));
      let name = `${base}.md`;
      for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).md`;
      used.add(name.toLowerCase());
      files.push({ name, text: noteFile(n), date: n.updatedAt });
    });
    return zip(files);
  }

  /* ---------------- zip（縮めない、そのまま詰める） ----------------

     ライブラリを持ち込まずに済む、いちばん素朴な zip。名前は UTF-8 の印
     （0x0800）付き。日時はノートを直した日時（端末の時刻）。 */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosTime(iso) {
    let d = new Date(iso);
    if (isNaN(d.getTime())) d = new Date();
    const y = Math.min(2107, Math.max(1980, d.getFullYear()));
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text || "");
      const crc = f.dir ? 0 : crc32(data);
      const { time, date } = dosTime(f.date);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(38, f.dir ? 0x10 : 0, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const size = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  /** 渡す。指で触る端末は共有シート（ファイルへ保存・ほかのアプリへ）、
      それ以外はダウンロード。 */
  function hand(name, blob, type) {
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let file = null;
    try { file = new File([blob], name, { type }); } catch (err) { file = null; }
    if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
    KN.ui.toast("ノートを書き出しました");
  }

  Object.assign(S, { notesRows, notesLabelList, noteLabelTitle, noteLabelRows });
  /* 試験が中身を確かめるための口（画面からは使いません）。 */
  KN.notesExport = { notesIn, noteFile, oneFile, zipNotes };
})();
