# 横断の罠（どの画面でも踏む。詳しくは括弧の docs）

画面（CSS/JS）を触る前に読む。ここに足してよいのは、どの画面を触っても踏むものだけ。

- **送る器は紙**（やること・daily・買うもの・ダイエット。設定は `.set-scroll`）。
  `root.scrollTop` や `activeScreen()` を送る相手にせず、`KN.app.scrollerOf()` を
  通す。（sheet-scroll）
- **毎フレーム書くカスタムプロパティは `:root` に書かない。** 継承で文書の
  全要素の style 再計算を呼ぶ。読む相手そのものへ書く。同じ値の書き直しも
  しない（`KN.util.setVar`）。（calendar-swipe・glass）受け継ぐ（`@property` の `inherits: true`）値を
  大きな入れ物で `transition`／`animation` するのも同じ——動くあいだ毎フレーム子の全部が再計算になる。
  動かすのは受け継がない名前にして、使う要素だけで（`--season-k`。docs/log/inspection.md の 1）。
- **`var()` は、それを書いた要素の上で解決される。** `:root` で組んだ一枚は
  `:root` の値を焼きつけて配られる——三枚重ねや `--face-cut` は、使う側で組む。
  （glass・shopping）
- **同じ詳細度の二つの規則で、同じプロパティを取り合わない**（特に
  `transform`）。あとに書いたほうだけが効く。倍率は `scale:` で。（tabbar・todo-timeline）
- **速さ・曲線を数字で書かない**（`--m-*` / `KN.motion.ms()`）。**重なりの順も
  名前で**（`--z-*`）。（motion・look）
- **字の色は `--c-primary`、塗りは `--c-primary-fill`。** 取り違えると 1.8:1 で
  読めない。字の太さは 400 と 700 だけ。（look）
- **設定の画面が出ているあいだ、`KN.ui.sheet` は紙ではなく一枚を押しのける**
  （`as: "dialog"` などは紙のまま）。（settings）
- **`.tl` は二つの別物。** 長期タスクから時間割への落とし先は `.tl-list`。（todo-timeline）
- **払う・引くの隣の紙は DOM に居ない**（控えは `document` の外）。`.cal-day` /
  `.tl-sheet` / `.js-now` のように複数の画面にあるものは、出ている画面に絞って
  掴む。（calendar-swipe・todo-timeline）
- **伸びる欄を測るために縮めない**（`height = 0`/`auto` → `scrollHeight`）。送る器の中身が
  一瞬縮み、送りが頭へ戻される（打つたびに頭へ飛ぶ）。縮めるなら器の `scrollTop` を
  持っておいて戻す。（notes の「打つあいだ」）
- **store を書いたあとに自分で `render()` を呼ばない。** 出ている画面は app.js の subscribe が組み直すので、
  呼ぶと二度組む（daily で 約100ms）。出ていない画面だけ自分で。（motion の「押した一拍を軽く」）
- **測るのは書く前に、まとめて。** class や style を書いたあとに `getBoundingClientRect`・`offsetWidth`・
  `getComputedStyle`・`scrollTop` を読むと、その場で並べ直してから答える。行ごとに測って書くと行の数だけ
  並べ直す。（motion の「押した一拍を軽く」）
