# ノートの構造（調べもの・案。2026年10月16日）

利用者の悩み：考えたことを thinking に次々入れると、ホームの thinking が縦に伸び続け、長い目で見づらくなる。
thinking の中にも（ほかの棚にも）構造が要るのか。→ アプリ・方法を調べた案。10月16日、利用者が決めた：自動で畳む・thinking だけ・30日・段3は要らない。段1は作った。

## 見立て

- 伸びるのは「一つ思いつく＝一冊のノート＝ホームの一行」だから。ホームの木（庭）に、日ごとに増え続けるもの（流れ）が入っている。
- 階層を先に深く作っても直らない（増えるものに分類が追いつかない）。寿命の違うものを分ける：
  - **流れ**：思いつき。多い・日付つき・あまり読み返さない → daily の日記（日で区切れるので、どこも伸びない）
  - **話題**：何度も戻ってくる考え。少ない・育つ → ホームの木に出すのはこれ
  - **前のもの**：しばらく触っていないもの → 一行に畳む（消さない・動かさない）
- このアプリの「問い」がもう同じ形：問いは本文から引く（写さない）・答えは一冊に日時の行で足す・済んだら一区切り。これを話題全体に広げる。

## 調べたこと（効く型だけ）

1. **入口には上限、中身は時の並び**：Things（横の一覧は今動けるプロジェクトだけ）・Apple メモ（今日・昨日・7日・30日・月・年で自動に区切る）・
   Notion の指南（同じ種類のページが増えるなら子ページでなく表の行に）・Evernote のホーム（最近・固定・メモ書きの決まった枠）・
   ルーマンのカードの索引（入口だけで全部は載せない）。
2. **流れと庭を分ける**：Caulfield「庭と流れ」・ACE（Atlas＝残る知識／Calendar＝日付のもの／Efforts＝取り組み）・Logseq（日誌に書き、
   タグとリンクで話題のページに集まる）・Ahrens（走り書きは一両日で清書か捨てる）・外山『思考の整理学』（手帖→ノート→メタ・ノート）。
3. **構造はあとから・下から**：KJ法（集めてから束ねて名を付ける）・Cosense（階層で整理しない・2-hop・「階層整理型はスケールしない」）・
   Matuschak（階層より連想）・flomo（時の流れ＋多段のタグ）。
4. **増やすより一冊に足す**：Matuschak（エバーグリーン＝書き足して育てる）・Agenda（プロジェクトの中は時の並び）・このアプリの問いの答え。
5. **寝かせて、ときどき呼び戻す**：外山（寝させる・忘れる）・Bullet Journal の移し替え（書き写す手間が濾す）・Things の Someday・
   Keep のアーカイブ・Day One の On This Day・flomo の毎日の振り返りとランダムウォーク。
6. **問いで束ねる**：ファインマンの「12の好きな問題」（新しく知ったことを、毎回それぞれの問いに当ててみる。Rota の回想）。
7. **棚ごとに並べる軸を選ぶ**：LATCH（並べ方は場所・五十音・時・種類・階層の五つだけ）。

## 案（段。上から順に）

- **段1（見せ方だけ・データに触らない。作った）**：thinking の一段目で、★でも束（子のあるノート）でもなく、30日触っていない
  （`updatedAt`）ノートを、棚の終わりの「前のもの」一行に畳む。開けば月ごと。並び（`pos`）はそのまま、直せば元の位置へ戻る。数は出さない。
  取り込んだまま触っていないものも畳む（「最近直した」と同じ見方）。ホームだけ（左の木・移す先の木は今のまま）。
  畳んだ行は運ばない（`.js-tree-note` を付けない＝運ぶ的にも隣にもならない）。Alt+↑↓・Tab の兄弟は器に出ている行だけ
  （`note-drag.js` の `groupOf`。でないと見えない行と入れ替わって何も動かないように見える）。試験は `tests/notes-fold.js`。
- **段2（話題を立てる道を軽く）**：
  - 束ねる：選んだノートを新しい話題（親）の下へ。動くのは `parent` だけ（同期の欄にある）。元に戻すあり。
  - 日記の一件の「ノートへ移す」：thinking の話題を、最近足した順で先に（足すのは今の「選んだノートの終わり」のまま）。
  - 話題は問いの形でもよい（問いの面の「続きから考える」がそのまま話題の一覧になる）。
- **段3（要らない。10月16日、利用者）**：呼び戻す口（前のものから一つを、ときどき目に入る所へ。評価の言葉なし）／日記の「#話題」で、話題のノートに
  「日記でふれたところ」を引く（問いと同じ写さず引く。thinking の「日記の一件にタグ」を改めることになる）。
- **段4**：ほかの棚へ段1を広げ、棚ごとの軸で組み直す（下の表）。組み直しはデータの作り替え → 「6つに分ける」と同じく
  先に見せる・控え・戻すを付け、**実行の前に利用者へ**。

| 棚 | 軸（案） |
|---|---|
| thinking | 話題（束）× 時（前のもの） |
| reading | 一冊一ノート。読みたい（一冊のリスト）・読んでいる・読み終えた（年で畳む） |
| teaching | 年度 → 領域・教科（前の年度は畳む） |
| learning | 分野（束） |
| living | 領域（行事のものは済んだら畳む） |
| archive | 年・出どころ（閉じたまま） |

## 作らないもの（理由）

- 書く前に話題を選ばせる（いまの「書く前に分類を選ばせない」。棚の小窓はそのまま）。
- 深い階層を先に作る（Cosense・Notion の指南が戒めるもの）。型つきの部品（Tana・Capacities）も、組むのに手間がかかる。
- 自動の分類・要約（mymind・Mem の型。いまの「要約の欄・AI の口は作らない」）。
- 思考専用の新しい入れ物（「写さず引く」）。数・連続・達成（daily-rules）。

## 決めること（利用者）

1. （決めた：自動・30日）畳むのは自動（触っていない日数）か、手で（一区切り）か。おすすめは自動（★で残せる）。手でなら、タグ「一区切り」なら同期・書き出しは今のまま。
2. （決めた：thinking だけ）どの棚から。おすすめは thinking だけ（読み返すだけの棚は、直さないと畳まれてしまうので）。
3. 話題の形。おすすめは両方：別々に書いたノートは束ねる、日記からは一冊に足す。
4. （決めた：要らない）呼び戻す口・「#話題」が要るか。

## 出典

[Caulfield（紹介）](https://joel.is/notes/The_Garden_and_the_Stream-_A_Technopastoral)・
[Logseq の日誌](https://discuss.logseq.com/t/how-to-get-started-with-logseqs-journals-page/8432)・
[Apple メモの日付の区切り](https://www.macstories.net/stories/macos-ventura-the-macstories-review/5)・
[Things の休んでいるプロジェクト](https://culturedcode.com/things/support/articles/4001304/)・
[Notion：子ページより表の行](https://www.webfactoryltd.com/can-you-create-folders-in-notion-workarounds-and-alternatives/)・
[Evernote のホーム](https://www.engadget.com/evernote-home-232039110.html)・
[ルーマンの索引（Bielefeld）](https://uni-bielefeld.de/einrichtungen/bits/ueber-uns/knowledge-transfer/2018/2018-04-19_Vortrag_Das_Digitalisierungsprojekt_Luhmann-Zettelkasten.pdf)・
[ACE](https://notes.dsebastien.net/30+Areas/32+Literature+notes/32.02+Content/ACE+Framework)・
[Ahrens の走り書き](https://zettelkasten.de/posts/concepts-sohnke-ahrens-explained/)・
[思考の整理学（目次）](https://www.maruzenjunkudo.co.jp/products/9784480815781)・
[KJ法](https://create-labgest.uniud.it/Handbook/techniques/List/KJMethod.htm)・
[Cosense の思想](https://scrapbox.io/public-consultation/%E9%96%8B%E7%99%BA%E8%80%85shokai%E3%81%8C%E8%AA%9E%E3%82%8BCosense%E3%81%AB%E8%BE%BC%E3%82%81%E3%81%9F%E4%BE%A1%E5%80%A4%E8%A6%B3%E3%82%84%E7%9B%AE%E6%8C%87%E3%81%99%E4%B8%96%E7%95%8C%E8%A6%B3)・
[Matuschak](https://notes.andymatuschak.org/z2HUE4ABbQjUNjrNemvkTCsLa1LPDRuwh1tXC)・
[flomo](https://apps.apple.com/in/app/flomo%E6%B5%AE%E5%A2%A8-%E6%9E%81%E7%AE%80%E5%8D%A1%E7%89%87%E7%AC%94%E8%AE%B0-%E8%BD%BB%E4%BE%BF%E7%AD%BE%E4%B8%8E%E6%97%A5%E8%AE%B0%E5%A4%87%E5%BF%98/id1552314395?l=hi)・
[Agenda](https://www.netted.net/2018/08/10/turn-your-notes-into-a-calendar-and-task-manager-with-this-app/)・
[Bullet Journal の移し替え](https://bulletjournal.com/blogs/faq/migration)・
[Keep のアーカイブ](https://support.google.com/keep/answer/6262765)・
[Day One](https://dayoneapp.com/features/on-this-day/)・
[12の好きな問題](https://fortelabs.com/blog/12-favorite-problems-how-to-spark-genius-with-the-power-of-open-questions/)・
[LATCH](https://thevisualcommunicationguy.com/2013/07/20/the-five-and-only-five-ways-to-orgaize-information/)・
[mymind](https://mymind.com/the-folder-is-dead-a-letter-from-our-founders)・
[Tana](https://tana.inc/docs/supertags)
