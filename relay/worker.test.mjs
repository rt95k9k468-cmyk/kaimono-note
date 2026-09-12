/* 中継所のふるまい。KVの偽物を渡して、外に出ずに確かめます。
   実行： node relay/worker.test.mjs                        */
import worker from "./worker.js";
import { readFileSync } from "node:fs";
import { SRC, OUT, render } from "./embed.js";

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
};

const PATH = "/kn-7f3a9c1d4e8b2";
const SEP = "\u001E";

/* KVの偽物。put の TTL も控えておいて、渡し忘れていないか見ます。 */
function fakeKV() {
  const m = new Map();
  const puts = [];
  return {
    _m: m, _puts: puts,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, opts) { puts.push(opts || {}); m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

const call = (env, method, path, body) =>
  worker.fetch(new Request("https://relay.test" + path, {
    method,
    body: body === undefined ? undefined : body,
  }), env);

const env0 = () => ({ RELAY_PATH: PATH, MAIL: fakeKV() });
const verOf = (res) => res.headers.get("x-kn-ver");

/* ---------- 置いて、取る。そして**消えない** ----------

   ここが作り直しの本体です。前は渡した時点で消していたので、読む側が
   その便を断ると（iPhoneがロック中に走った 0 の羅列がそれです）、
   その一回ぶんが永久に失われていました。 */
{
  const env = env0();
  const put = await call(env, "POST", PATH, "day=2026-08-18\nsteps=8432");
  check("POST は 200", put.status === 200, String(put.status));

  const get1 = await call(env, "GET", PATH);
  check("GET は 200", get1.status === 200, String(get1.status));
  check("置いたものがそのまま返る",
    (await get1.text()) === "day=2026-08-18\nsteps=8432");
  check("文字化けしない指定がある",
    /charset=utf-8/i.test(get1.headers.get("content-type") || ""),
    get1.headers.get("content-type"));
  check("途中で覚え込まれない",
    /no-store/.test(get1.headers.get("cache-control") || ""),
    get1.headers.get("cache-control"));
  check("版を添えている", /^\d+$/.test(verOf(get1) || ""), verOf(get1));
  check("版がブラウザから読める",
    (get1.headers.get("access-control-expose-headers") || "").includes("X-Kn-Ver"));

  const get2 = await call(env, "GET", PATH);
  check("渡しても消えない（版を言わなければ、もう一度渡す）",
    get2.status === 200 && (await get2.text()) === "day=2026-08-18\nsteps=8432",
    String(get2.status));
}

/* ---------- 版が同じなら、渡してこない ---------- */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=1");
  const got = await call(env, "GET", PATH);
  const v = verOf(got);

  const same = await call(env, "GET", PATH + "?since=" + v);
  check("版が同じなら 204", same.status === 204, String(same.status));
  check("204 に中身は無い", (await same.text()) === "");
  check("204 にも版は付く", verOf(same) === v, verOf(same));

  await call(env, "POST", PATH, "steps=2");
  const again = await call(env, "GET", PATH + "?since=" + v);
  check("新しい便が来たら、また渡す", again.status === 200, String(again.status));
  check("版は必ず進む", Number(verOf(again)) > Number(v), `${v} → ${verOf(again)}`);
}

/* ---------- 版は、同じミリ秒に二本置いても進む ----------

   時計の分解能はミリ秒なので、二本のショートカットが同じ拍で置くと
   同じ数になります。そうなると読む側が「変わっていない」と読みます。 */
{
  const env = env0();
  const vs = [];
  for (let i = 0; i < 5; i++) {
    await call(env, "POST", PATH + "?slot=s" + i, "steps=" + i);
    vs.push(Number(verOf(await call(env, "GET", PATH))));
  }
  const rising = vs.every((v, i) => i === 0 || v > vs[i - 1]);
  check("続けて置いても版が重ならない", rising, vs.join(","));
}

/* ---------- ひとつ前の便も、一緒に渡す ----------

   空振りの便（ロック中に走ったショートカットの 0 の羅列）が、読まれる前の
   良い便を踏み潰さないための仕掛けです。**ひとつ前 → いま** の順に並べる
   ので、読む側は順に取り込めば「いまのが読めればそれが残る」になります。 */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=8432");        // 良い便
  await call(env, "POST", PATH, "steps=0");           // ロック中の空振り
  const got = await call(env, "GET", PATH);
  const parts = (await got.text()).split(SEP);
  check("ひとつ前と、いまの二通が届く", parts.length === 2, String(parts.length));
  check("ひとつ前が先、いまが後", parts[0] === "steps=8432" && parts[1] === "steps=0",
    parts.join(" / "));
  check("何通まとめたかを言う", got.headers.get("x-kn-parts") === "2",
    got.headers.get("x-kn-parts"));
}

/* ---------- 同じ中身が二度来ても、ひとつ前には下ろさない ---------- */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=1");
  await call(env, "POST", PATH, "steps=1");
  check("同じものを二通持たない", env.MAIL._m.has("box:text:prev") === false);
  const got = await call(env, "GET", PATH);
  check("渡るのは一通", (await got.text()) === "steps=1");
}

/* ---------- 同じ差出人の新しい便が、その差出人の古い便を差し替える ---------- */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=1");
  await call(env, "POST", PATH, "steps=2");
  check("同じ差出人の「いま」は一つだけ", env.MAIL._m.get("box:text") === "steps=2");
}

/* ---------- 差出人が違えば、消し合わない ----------

   ここが仕切りを入れた理由です。「からだ」と「睡眠」の二本のショートカットが
   一時間ごとに走ると、前は後から来たほうが前を消していました。 */
{
  const env = env0();
  await call(env, "POST", PATH, "day=2026-08-28\nsteps=8432");           // からだ（key=value）
  await call(env, "POST", PATH, '{"value":"コア","start":"a","end":"b"}');  // 睡眠（JSON）
  const got = await call(env, "GET", PATH);
  const text = await got.text();
  check("からだと睡眠が両方とどく", text.includes("steps=8432") && text.includes("コア"), text);
  check("ブラウザに見えるようにしてある",
    (got.headers.get("access-control-expose-headers") || "").includes("X-Kn-Parts"));
}

/* ---------- 名乗れば、その名前でしまう ---------- */
{
  const env = env0();
  await call(env, "POST", PATH + "?slot=body", "steps=1");
  await call(env, "POST", PATH + "?slot=weight", "weight=57.3");
  const got = await call(env, "GET", PATH);
  check("名乗った差出人ごとに残る", (await got.text()).split(SEP).length === 2);
}

/* ---------- 捨てる口 ----------

   渡しても消えなくなったぶん、**意図して空にする道**が要ります。
   アプリの「中継所を確かめる」が置いた試しの便を片づけるのがここです。 */
{
  const env = env0();
  await call(env, "POST", PATH + "?slot=body", "steps=1");
  await call(env, "POST", PATH + "?slot=kntest", "kn-selftest=abc");

  const one = await call(env, "DELETE", PATH + "?slot=kntest");
  check("名指しの DELETE は 200", one.status === 200, String(one.status));
  const left = await call(env, "GET", PATH);
  const text = await left.text();
  check("名指したものだけ消える",
    text.includes("steps=1") && !text.includes("kn-selftest"), text);

  await call(env, "POST", PATH + "?slot=body", "steps=2");   // ひとつ前も作る
  const all = await call(env, "DELETE", PATH);
  check("名指さない DELETE は 200", all.status === 200, String(all.status));
  const after = await call(env, "GET", PATH);
  check("ぜんぶ空になる", after.status === 204, String(after.status));
  check("ひとつ前も残さない", env.MAIL._m.has("box:body:prev") === false);
}

/* ---------- 入れ替え前に残っていた便を捨てない ----------

   仕切りの無かったころの "box" は、版の外にいます。毎回そのまま渡すと
   「変わっていないのに 200 が返る」ので、差出人の棚へ移してから渡します。 */
{
  const env = env0();
  env.MAIL._m.set("box", "steps=999");        // 仕切りが無かったころの便
  await call(env, "POST", PATH, "steps=1");
  const got = await call(env, "GET", PATH);
  const text = await got.text();
  check("古い形の便も一緒に渡す", text.includes("steps=999") && text.includes("steps=1"), text);
  check("古い置き場からは移してある", env.MAIL._m.has("box") === false);
  check("移した先で版に乗る", verOf(got) !== "0", verOf(got));
}

/* ---------- 控えが古い形（コンマ並び）でも読める ----------

   入れ替えた瞬間、KV に残っているのは "text,json" の形です。ここで
   版を "0"（＝何も無い）と答えると、待っている便が渡らなくなります。 */
{
  const env = env0();
  env.MAIL._m.set("box:slots", "text");
  env.MAIL._m.set("box:text", "steps=42");
  const got = await call(env, "GET", PATH);
  check("古い控えでも渡る", got.status === 200 && (await got.text()) === "steps=42",
    String(got.status));
  check("「何も無い」とは言わない", verOf(got) !== "0", verOf(got));
}

/* ---------- 控えに名前はあるが、中身がTTLで消えたとき ---------- */
{
  const env = env0();
  env.MAIL._m.set("box:slots", JSON.stringify({ v: 2, slots: { text: 1757000000000 } }));
  const got = await call(env, "GET", PATH);
  check("空と同じに答える（500にしない）", got.status === 204, String(got.status));
}

/* ---------- 取りに来ない便は、いつか捨てる ---------- */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=1");
  const ttl = env.MAIL._puts[0].expirationTtl;
  check("TTL を渡している", typeof ttl === "number", String(ttl));
  check("TTL は KV の下限（60秒）以上", ttl >= 60, String(ttl));
  check("TTL は一週間", ttl === 604800, String(ttl));
  check("控えにも TTL が付く",
    env.MAIL._puts.every((o) => o.expirationTtl === 604800));
}

/* ---------- 道が合言葉 ---------- */
{
  const env = env0();
  await call(env, "POST", PATH, "steps=1");
  const wrong = await call(env, "GET", "/kn-7f3a9c1d4e8b3");
  check("道が違えば渡さない", wrong.status === 404, String(wrong.status));
  check("道が違っても、中身は残っている", env.MAIL._m.size >= 1);
  const root = await call(env, "GET", "/");
  check("根っこには何も無い", root.status === 404, String(root.status));
  const wrongBody = await wrong.text();
  check("違う道に、手がかりを返さない", !/kn-|中継|relay/i.test(wrongBody), wrongBody);
  const wrongDel = await call(env, "DELETE", "/kn-7f3a9c1d4e8b3");
  check("道が違えば捨てさせない", wrongDel.status === 404, String(wrongDel.status));
  check("道が違う DELETE で消えていない", env.MAIL._m.get("box:text") === "steps=1");
}

/* ---------- 置き忘れは、黙って通さない ---------- */
{
  const env = { MAIL: fakeKV() };                       // RELAY_PATH なし
  const r = await call(env, "GET", "/");
  check("RELAY_PATH が無ければ 500（誰でも開ける状態で公開させない）",
    r.status === 500, String(r.status));
  const short = { RELAY_PATH: "/kn", MAIL: fakeKV() };  // 短すぎる道
  const r2 = await call(short, "GET", "/kn");
  check("短すぎる道も断る", r2.status === 500, String(r2.status));
}

/* ---------- KV を結び忘れたとき ---------- */
{
  const r = await call({ RELAY_PATH: PATH }, "GET", PATH);
  check("KV が無ければ 500", r.status === 500, String(r.status));
  check("何を直せばいいか書いてある", /MAIL/.test(await r.text()));
}

/* ---------- 入れ物の大きさ ---------- */
{
  const env = env0();
  const big = await call(env, "POST", PATH, "x".repeat(64 * 1024 + 1));
  check("大きすぎるものは断る", big.status === 413, String(big.status));
  check("断ったものは置かない", env.MAIL._m.size === 0, String(env.MAIL._m.size));

  const empty = await call(env, "POST", PATH, "   \n  ");
  check("空の便は断る", empty.status === 400, String(empty.status));
  check("断った空も置かない", env.MAIL._m.size === 0, String(env.MAIL._m.size));

  const ok = await call(env, "POST", PATH, "x".repeat(64 * 1024));
  check("ちょうどの大きさは通る", ok.status === 200, String(ok.status));
}

/* ---------- ブラウザから読める約束 ---------- */
{
  const env = env0();
  const pre = await call(env, "OPTIONS", PATH);
  check("OPTIONS は 204", pre.status === 204, String(pre.status));
  check("どこからでも読める", pre.headers.get("access-control-allow-origin") === "*");
  /* DELETE は「単純な動詞」ではないので、ブラウザは先に OPTIONS を投げます。
     許した動詞に入っていないと、そこで止まります。 */
  check("DELETE も許してある",
    (pre.headers.get("access-control-allow-methods") || "").includes("DELETE"),
    pre.headers.get("access-control-allow-methods"));

  await call(env, "POST", PATH, "steps=1");
  const got = await call(env, "GET", PATH);
  check("GET にも約束が付いている",
    got.headers.get("access-control-allow-origin") === "*");
  const nf = await call(env, "GET", "/よそ");
  check("404 にも付いている（付いていないと理由が読めない）",
    nf.headers.get("access-control-allow-origin") === "*");
}

/* ---------- 知らない動詞 ---------- */
{
  const env = env0();
  const r = await call(env, "PATCH", PATH, "steps=1");
  check("知らない動詞は断る", r.status === 405, String(r.status));
  const r2 = await call(env, "PUT", PATH, "steps=1");
  check("PUT は POST と同じに扱う", r2.status === 200, String(r2.status));
}

/* ---------- アプリに埋めた写しが、元とずれていない ---------- */
{
  /* アプリの「コードをコピー」が配るのは js/relay-code.js の中の文字列です。
     元を直して作り直し忘れると、**古い中継所を配り続ける** ことになります。
     気づけないので、ここで落とします。直し方は `node relay/embed.js`。 */
  const fresh = render(readFileSync(SRC, "utf8"));
  const onDisk = readFileSync(OUT, "utf8");
  check("アプリに埋めたコードが worker.js と同じ", fresh === onDisk,
    fresh === onDisk ? "" : "ずれています → node relay/embed.js で作り直してください");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
