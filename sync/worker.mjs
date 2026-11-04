/* =========================================================
   くらしノート — 同期の部屋（Cloudflare へのつなぎ。docs/sync.md）
   =========================================================

   中身は room.mjs。ここは Cloudflare の Durable Object（SQLite）につなぐだけで、
   決まりは一つも置きません（ほかの置き場へ移すときに書き直すのは、このファイルだけ）。

   - 部屋は一つ（名前 "kurashi"）。一人の三台のための部屋なので、分けない。
   - WebSocket は休眠の形（acceptWebSocket）。開いたままでも、知らせるとき以外は眠っていて課金されない。
     "ping" には眠ったまま "pong" を返す。
   - 中継所（relay/）とは別の Worker・別の鍵。中継所の URL も鍵も、ここには来ない。 */
import { DurableObject } from "cloudflare:workers";
import { Room as Core, PROTO } from "./room.mjs";

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    if (typeof WebSocketRequestResponsePair === "function") {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
    this.core = new Core({
      sql: (q, ...b) => ctx.storage.sql.exec(q, ...b).toArray(),
      tx: (fn) => ctx.storage.transactionSync(fn),
      setup: env.ROOM_SETUP,
      io: {
        upgrade: (device) => {
          const [client, server] = Object.values(new WebSocketPair());
          ctx.acceptWebSocket(server, [device]);
          return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": PROTO } });
        },
        list: (device) => (device ? ctx.getWebSockets(device) : ctx.getWebSockets()),
      },
    });
  }

  fetch(request) { return this.core.handle(request); }

  /* 端末からは何も受け取らない（送るのは /push だけ）。ping は上の自動の返事が受ける。 */
  webSocketMessage() {}
  webSocketClose(ws, code) { try { ws.close(code, "bye"); } catch { /* もう閉じている */ } }
  webSocketError(ws) { try { ws.close(1011, "error"); } catch { /* もう閉じている */ } }
}

export default {
  fetch(request, env) {
    if (!env.ROOM) return new Response("ROOM が結ばれていません（Durable Object の binding 名は ROOM）", { status: 500 });
    return env.ROOM.get(env.ROOM.idFromName("kurashi")).fetch(request);
  },
};
