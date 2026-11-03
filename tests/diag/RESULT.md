# DIAG の結論：WebKit 26.6（WPE・Linux）の ThreadedCompositor の segfault（2026-11-03）

**引き金は、題の字が転がる `@keyframes roll-in` の `filter: blur()`。** 暦の CSS ではない。

- 落ちるのは指を離したあと（月を組み直して、上の帯の題が `rollText`（`js/util.js`）で転がるとき）。
- 落ちるのは `.roll-in`（入ってくる字の inline-block）の動きだけ。`::before`（去る字）は、同じ blur でも落ちない。
- `@keyframes` に `filter` があれば落ち、`filter` を抜けば落ちない。`transform`・`opacity` だけなら落ちない。
- `--roll-d`（遅らせ）を 0 にすると、落ちる率は 3 回中 1 回に下がる。タイミングで起きる。
- アプリを使わない `repro-roll.html` も、3 回中 1 回、同じ所（`libWPEWebKit` +0x609263a、null の読み出し）で落ちた。blur を抜いた形（`f=0`）は 3 回とも落ちない。

| 試したこと（各3回） | 結果 |
|---|---|
| そのまま | 3/3 落ちる |
| 暦の見た目の CSS を一つずつ外す（mask・opacity・transform・clip・sticky・影・輪） | どれも落ちる |
| 動きを全部止める | 0/3 |
| 題の字の動きを外す | 0/3 |
| 題の字の動きだけ残す | 3/3 |
| keyframes：filter のみ／t+f／o+f | 3/3 |
| keyframes：filter なし／transform のみ／opacity のみ | 0/3 |
| `.roll-in` だけ動かす | 3/3 |
| `::before` だけ動かす | 0/3 |
| 最小の頁（blur あり／なし） | 1/3 ／ 0/3 |

走らせ方：`KN_BROWSER=webkit node tests/diag/bisect.js [名前…]`（`.github/workflows/diag-webkit.yml`）。
Linux の WebKit は iOS の Safari と同じではない。iPhone で落ちるかを確かめるまでは、アプリを直さない。
