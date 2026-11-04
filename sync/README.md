# 同期の部屋

iPhone・iPad・Surface が、**端末で鍵をかけた記録**を預け合う部屋です（docs/sync.md）。
Cloudflare の Worker＋Durable Object（SQLite）一つ。中継所（`relay/`）とは別の Worker・別の鍵です。

部屋は中身を読めません。預かるのは暗号文と、鍵つきハッシュにした棚・記録の名前だけ。
部屋は作り直せる写しで、正は各端末と Dropbox の控えです。

- `room.mjs` — 決まりの全部（SQL と WebSocket の外には頼らない）
- `worker.mjs` — Cloudflare へのつなぎだけ
- `room.test.mjs` — 外に出ない偽の部屋で全部を試す（`node sync/room.test.mjs`。門は `tests/sync-room.js`）

## 置き方（Surface の Edge だけで。パソコンの道具は要りません）

置いたら、アプリの **設定 → バックアップ → 同期の部屋** でつなぎます（段2は iPhone だけ）。**部屋の URL と合言葉は、どこにも
書かない・貼らない**（中継所と同じ扱い。リポジトリ・メモ・チャットにも）。

### ① 合言葉（ROOM_SETUP）を作る

つなぐ端末（iPhone）で **設定 → バックアップ → 同期の部屋 → 合言葉をコピー**。
最初の一台をつなぐときに一度だけ使います（コンソールで作った字を置いてあれば、③でこの字に置き換えます）。

### ② 部屋を置く

Cloudflare（中継所と同じアカウント）で **Workers & Pages** → **Create** →
**Import a repository** → `kaimono-note` を選び、

- **Root directory**：`sync`
- 名前：`kurashi-sync`（そのまま）

で **Deploy**。部屋（Durable Object）は Cloudflare が自分で用意します。
この道だと、`sync/` を直したときに Cloudflare が自分で置き直します（作り直す手は要りません）。
**Build watch paths** を選べるなら `sync/*` にしておくと、アプリだけの変更では動きません。

> 一つボタンの道もあります（中身の写しが、あなたの GitHub に別のリポジトリとして作られます。
> そのぶん、あとで直したものは自分では届きません）：
> `https://deploy.workers.cloudflare.com/?url=https://github.com/rt95k9k468-cmyk/kaimono-note/tree/main/sync`

### ③ 合言葉を置く

Worker の **Settings → Variables and Secrets → Add**。Type を **Secret**、名前を `ROOM_SETUP`、
値に①をペースト → **Deploy**。（②で尋ねられて貼っていれば要りません。）

### ④ 確かめる

Worker の画面に出ている `https://kurashi-sync.<あなたの名前>.workers.dev/` を開きます。

- **くらしノートの部屋** と出れば済み。
- **ROOM_SETUP が置かれていません** と出たら③を。

### ⑤ 守り

Cloudflare の **2段階認証** を入れておきます（中継所と同じアカウントなら済んでいるはず）。

## 困ったとき

- **端末を全部失った**：③で `ROOM_SETUP` を新しい値に変えると、その値でもう一度だけ最初の一台になれます。
  つないだら、失った端末を切ります。
- **作り直したい・やめたい**：Worker を消せば部屋も消えます。記録は各端末と Dropbox の控えにあるので、
  新しい部屋へはどれか一台から全部送り直します（段2で、送る前に訊く）。
- 費用：無料の枠で足ります（SQLite の部屋は無料で使える。一つで 1GB まで。字だけなら数十年分）。

## 約束の形（段2の端末が使う）

| 口 | 送る | 返る |
|---|---|---|
| `POST /join` | `{code, name, schema}`（code は ROOM_SETUP か `/pair` の合言葉） | `{device, token, room, head, schema}` |
| `POST /pair` | — | `{code, until}`（10字・10分・一回だけ・5回外すと消える） |
| `GET /devices`・`DELETE /devices/<id>` | — | 一覧／切る（鍵が消え、WebSocket も閉じる） |
| `POST /push` | `{schema, changes:[{op, shelf, item, base, body \| del:true}], sure?}` | `{head, results:[{op, ok, ver, seq} \| {op, ok:false, why:"ver", cur}]}` |
| `GET /pull?since=N&limit=` | — | `{room, head, schema, items:[{shelf, item, ver, seq, at, body \| del}], more, next}` |
| `GET /ws` | protocol に `kn-sync, <token>` | `{"head":N}` だけが届く。`ping` に `pong` |

鍵は `Authorization: Bearer <token>`。断りは `{why}`：`who`(401)・`code`(403)・`wait`(429)・`form`/`json`/`schema`(400)・
`big`(413)・`old`(426、約束より古い)・`many`(409、消しすぎ)・`ahead`(409、部屋が作り直された)・`room`(500)。
