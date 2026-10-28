/* 罠を試験で止める（2026年10月22日、CLAUDE.md「コードの罠」）。読むだけ・ブラウザは使わない。

   覚えておく前提だった罠を、足したときに落ちる形にする。
   1. TDZ：起動の途中で走る道が、まだ初期化されていない const/let/class に触れると落ちる
      （store.js の `let state = load()` から下の const を読んで、データが消えた事故の原因）。
      js/ のどの台本も、読み込みで走る文を上から順にたどる。たどる先は、すぐ呼ぶ関数（即時関数・
      名前で呼ぶ関数・.call/.apply）、配列などの同期メソッドの引数（forEach・map ほか）、
      Promise の executor——推移的に。イベント・タイマー・then の中は起動のあとなので、たどらない。
      赤になったら：使う側を function 宣言にするか、値を使う道より上へ（2026年10月27日の総点検）。
   2. UTC の日付：`toISOString()`／`KN.util.today()` の頭10字は UTC の日（日本の朝0〜9時は前の日）。
      日の鍵は `dayKey()`／`todayKey()`（ローカル）で作る。いまは0か所——一つも許さない。 */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("罠を試験で止める");

/* ESLint は GitHub では tests/package.json で入れる。手元は NODE_PATH の外にあるので、置き場所も見る。 */
const { Linter } = (() => {
  try { return require("eslint"); } catch (_) { return require("/opt/node22/lib/node_modules/eslint"); }
})();

/* 同期で引数の関数を呼ぶメソッド（配列・Map・Set・NodeList・文字列の replace）。 */
const SYNC = new Set(["forEach", "map", "filter", "some", "every", "find", "findIndex", "findLast", "findLastIndex",
  "reduce", "reduceRight", "sort", "flatMap", "replace", "replaceAll"]);
const isFn = (n) => n && /^(FunctionExpression|ArrowFunctionExpression|FunctionDeclaration)$/.test(n.type);

/** 一つの台本の、起動の途中で走る道をたどる。返すのは TDZ に触れた所と、たどった関数の名前。 */
function tdz(code, file) {
  let ast = null, sm = null;
  const linter = new Linter({ configType: "flat" });
  const msgs = linter.verify(code, [{
    languageOptions: { ecmaVersion: "latest", sourceType: "script" },
    plugins: { k: { rules: { grab: { create(ctx) {
      return { Program(n) { ast = n; sm = ctx.sourceCode.scopeManager; } };
    } } } } },
    rules: { "k/grab": "error" },
  }], file);
  const fatal = msgs.find((m) => m.fatal);
  if (fatal) throw new Error(`${file}:${fatal.line} 読めない（${fatal.message}）`);

  const refOf = new Map();
  for (const s of sm.scopes) for (const r of s.references) refOf.set(r.identifier, r);
  const hasTdz = (v) => v.defs.some((d) => d.type === "ClassName"
    || (d.type === "Variable" && d.parent && d.parent.kind !== "var"));
  const ready = new Set();     // 初期化の済んだ変数
  const walked = new Set();    // たどった関数（起動のあいだ、外の変数は増えるだけ——最初の一度がいちばん厳しい）
  const names = new Set();
  const hits = [];
  const seen = new Set();

  const declare = (node) => { for (const v of sm.getDeclaredVariables(node)) ready.add(v); };
  /* 呼ばれる先の関数の節（分からなければ null）。 */
  const target = (n) => {
    if (!n) return null;
    if (isFn(n)) return n;
    if (n.type !== "Identifier") return null;
    const r = refOf.get(n);
    const v = r && r.resolved;
    if (!v || v.defs.length !== 1) return null;
    const d = v.defs[0];
    if (d.type === "FunctionName") return d.node;
    if (d.type === "Variable" && isFn(d.node.init)) return d.node.init;
    return null;
  };
  const enter = (fn, via) => {
    if (!fn || walked.has(fn)) return;
    walked.add(fn);
    const name = fn.id ? fn.id.name : fn.parent && fn.parent.type === "VariableDeclarator" ? fn.parent.id.name : "（無名）";
    names.add(name);
    const chain = [...via, name];
    for (const p of fn.params) walk(p, chain);
    if (fn.body.type === "BlockStatement") for (const s of fn.body.body) walk(s, chain);
    else walk(fn.body, chain);
  };
  const touch = (id, via) => {
    const r = refOf.get(id);
    if (!r || r.init || !r.resolved || ready.has(r.resolved) || !hasTdz(r.resolved)) return;
    const key = `${id.range[0]}`;
    if (seen.has(key)) return;
    seen.add(key);
    const at = r.resolved.defs[0].name.loc.start.line;
    hits.push(`${file}:${id.loc.start.line} ${id.name}（${at}行で宣言）← ${via.join(" → ")}`);
  };
  const call = (n, via) => {
    const c = n.type === "TaggedTemplateExpression" ? n.tag : n.callee;
    const args = n.arguments || [];
    if (n.type === "NewExpression") {
      if (c.type === "Identifier" && c.name === "Promise" && !((refOf.get(c) || {}).resolved || { defs: [] }).defs.length) enter(target(args[0]), via);
      else enter(target(c), via);
      return;
    }
    enter(target(c), via);
    if (c.type !== "MemberExpression" || c.computed) return;
    const p = c.property.name;
    if (p === "call" || p === "apply") enter(target(c.object), via);
    else if (SYNC.has(p)) for (const a of args) enter(target(a), via);
    else if (p === "from" && c.object.type === "Identifier" && c.object.name === "Array") enter(target(args[1]), via);
  };
  /* 文や式を、走る順にたどる。関数の中身は呼ばれたときだけ（enter）。 */
  function walk(n, via) {
    if (!n || typeof n.type !== "string") return;
    switch (n.type) {
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": return;
      case "Identifier": touch(n, via); return;
      case "VariableDeclarator": walk(n.init, via); walk(n.id, via); declare(n); return;
      case "ClassDeclaration": case "ClassExpression":
        walk(n.superClass, via);
        for (const m of n.body.body) {
          if (m.computed) walk(m.key, via);
          if (m.type === "StaticBlock") for (const s of m.body) walk(s, via);
          else if (m.static && m.type === "PropertyDefinition") walk(m.value, via);
        }
        declare(n);
        return;
      case "CallExpression": case "NewExpression": case "TaggedTemplateExpression":
        for (const k of ["callee", "tag", "arguments", "quasi"]) walkKey(n[k], via);
        call(n, via);
        return;
    }
    for (const k of Object.keys(n)) if (k !== "parent" && k !== "loc" && k !== "range") walkKey(n[k], via);
  }
  const walkKey = (v, via) => { if (Array.isArray(v)) v.forEach((x) => walk(x, via)); else if (v && typeof v === "object") walk(v, via); };

  for (const s of ast.body) walk(s, ["（読み込み）"]);
  return { hits, names };
}

/* 1a. js/ の全部。 */
const JS = fs.readdirSync(path.join(ROOT, "js")).filter((n) => n.endsWith(".js")).sort();
const all = [];
let storeNames = new Set();
for (const f of JS) {
  const r = tdz(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), f);
  all.push(...r.hits);
  if (f === "store.js") storeNames = r.names;
}
t.check(`起動の途中で走る道が、まだ初期化されていない const/let/class に触れない（js/ の ${JS.length} 本）`,
  all.length === 0, all.join("\n  "));
/* たどり手が store.js の要の道を通っている（通らなくなったら、上の検査は空振りしている）。 */
const must = ["load", "loadFrom", "reconcile", "emptyState"].filter((n) => !storeNames.has(n));
t.check("store.js の `let state = load()` から load・loadFrom・reconcile・emptyState へたどれる", must.length === 0, must.join(", "));

/* 1b. わざと TDZ を仕込んで、赤になるか。 */
const red = (src) => tdz(src, "probe.js").hits.length > 0;
const RED = {
  "上で使う": "(function(){ f(X); const X = 1; })();",
  "関数の道で": "(function(){ let s = load(); function load(){ return mk(); } function mk(){ return T; } const T = 1; })();",
  "const の矢印関数": "(function(){ const a = () => b(); a(); const b = () => 1; })();",
  "forEach の中": "(function(){ [1].forEach((x) => use(K)); const K = 1; })();",
  "名前で渡す map": "(function(){ [1].map(g); function g(){ return K; } let K = 1; })();",
  "Promise の executor": "(function(){ new Promise((ok) => ok(V)); const V = 1; })();",
  "入れ子の即時関数": "(function(){ (() => { (function(){ W; })(); })(); const W = 1; })();",
  ".call": "(function(){ h.call(null); function h(){ return Z; } const Z = 1; })();",
  "class": "(function(){ new C(); f(D); class D {} function C(){} })();",
  "代入も": "(function(){ set(); function set(){ n = 2; } let n = 1; })();",
  "台本の頭（即時関数なし）": "const a = b + 1; const b = 1;",
};
for (const [k, src] of Object.entries(RED)) t.check(`わざと仕込んだ TDZ が赤になる：${k}`, red(src), src);
const GREEN = {
  "イベントの中": "(function(){ addEventListener('load', () => X); setTimeout(() => X); Promise.resolve().then(() => X); const X = 1; })();",
  "宣言のあとで呼ぶ": "(function(){ const X = 1; f(); function f(){ return X; } })();",
  "呼ばない関数": "(function(){ function f(){ return X; } const X = 1; window.f = f; })();",
  "var と function": "(function(){ f(v); var v = 1; function f(){} })();",
};
for (const [k, src] of Object.entries(GREEN)) t.check(`TDZ でないものは赤にならない：${k}`, !red(src), src);
/* 本物の store.js：load の道（reconcile の頭）で、IIFE の最後に足した const を読ませる。 */
const storeSrc = fs.readFileSync(path.join(ROOT, "js/store.js"), "utf8");
const probed = storeSrc.replace(/function reconcile\(s\) \{/, "$& void TDZ_PROBE;").replace(/\}\)\(\);\s*$/, "const TDZ_PROBE = 1;\n})();\n");
t.check("store.js の最後に const を足し、reconcile から読ませると赤になる",
  probed !== storeSrc && tdz(probed, "store.js").hits.some((h) => /TDZ_PROBE/.test(h)));

/* 2. js/ のどこにも UTC の日の切り出しが無い。 */
const UTC_DAY = /(?:toISOString|util\.today|\btoday)\(\)\s*\.\s*(?:slice\(0,\s*10\)|substring\(0,\s*10\)|substr\(0,\s*10\)|split\(["']T["']\))/;
const hits = [];
for (const f of JS) {
  fs.readFileSync(path.join(ROOT, "js", f), "utf8").split("\n").forEach((l, i) => { if (UTC_DAY.test(l)) hits.push(`${f}:${i + 1}`); });
}
t.check("UTC の日の切り出し（toISOString().slice(0, 10) ほか）が無い（日の鍵は dayKey()・todayKey()）", hits.length === 0, hits.join(", "));

t.done();
