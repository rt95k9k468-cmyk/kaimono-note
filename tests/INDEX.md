# tests/ — 台本の一覧

どの台本が何を見張るか。一行は「名前｜60字まで」——詳しくは台本の頭が正（`head -12 tests/<名前>`）。
**台本を足したら、この表の末尾に一行足す**（読むのは末尾だけでよい）。書き方と「試験の罠」は `tests/README.md`。

| 台本 | 見張るもの |
|---|---|
| `daily-range.js` | daily の期間の書き出し（V22）：両端を含む・逆に渡しても同じ・記録を変えない・バックアップとして読まない・月ぶ… |
| `daily-rules.js` | daily は評価しない（器に目標・連続・比較を持たない、評価の言葉と割合を出さない、まとめは Daily Log の… |
| `notes.js` | ノート（五つめの席）の段1（docs/notes.md）。 |
| `notes-restore.js` | ノートの段2（docs/notes.md）。 |
| `notes-labels.js` | ノートの段3（docs/notes.md）。 |
| `notes-settings.js` | ノートの設定（docs/notes.md の「設定」）。根っこは全部の席が一枚（押した席 → general → 残り。 |
| `notes-meta.js` | ノートの段4.4（docs/notes.md）。 |
| `note-table.js` | ノートの表と画面いっぱい（docs/notes.md）。 |
| `notes-format.js` | ノートの段4（docs/notes.md）。 |
| `note-v19.js` | ノートの開き閉じ・戻り方（roadmap-2.0 の V19・V26・docs/notes.md の「2.0」）。 |
| `undo-toast.js` | 「戻す」を揃える（roadmap-2.0 の V18・docs/look.md の「元に戻す」）。 |
| `undo-gone.js` | さっき消したもの（2026年10月10日、roadmap-seamless の N13 の X18 (c)、docs/… |
| `top-tap.js` | 上のきわ（状態バー）を押すと上へ（タッチの端末として開く）。画面は送る器、紙が開いていればいちばん上の紙の本体 |
| `startup.js` | 起動（C3）。4倍遅い CPU で開き、50ms を越える仕事と最初に描けた時刻を出す（数字は目安）。 |
| `text-size.js` | 文字の大きさ（B11）。既定は標準で倍率を書かない、設定の札で特大にすると本文と設定の字が 1.25 倍・読み直しても… |
| `arrive.js` | 開いたとき満ちる・押した席の絵が応える（2026年9月29日）。 |
| `arrive-tabs.js` | 開いたときの一拍を四つのタブへ（roadmap-unify の U16）。 |
| `pill-morph.js` | 押した行の丸薬が紙の頭の丸薬へ伸びる（C2）。 |
| `siri-inbox.js` | Siri から買うものへ（D2）。受け箱の名前が買うものに入る・同じ一通を二度足さない（読み直しても）・載っている品物… |
| `bell.js` | 閉じていても鳴る通知（D1）。中継所へは時刻（数）だけ・題もメモも出ない・古い中継所には本文なしの POST だけ・端… |
| `tabbar-kb.js` | 下の帯とキーボード（2026年9月27日）。 |
| `diary-autosave.js` | 日記の紙の自動保存（2026年10月7日、docs/daily.md の「話し続けても、裏へ回っても残す」）。 |
| `diary-undo.js` | 日記の紙の ↶ ↷（2026年10月26日、docs/daily.md の「取り消す・やり直す」）。 |
| `close-toast.js` | 書いた先から残す紙を閉じたときの知らせ（2026年10月7日、docs/look.md の「言葉の札」）。 |
| `timeline-rail.js` | 時間割の背骨と札の色（2026年9月27日、10月20日に物差しへ書き直し）。時計を 9:04 に止める。 |
| `timeline-late.js` | 過ぎてもまだの棒（2026年10月6日、10月20日に物差しへ書き直し）。 |
| `timeline-overlap.js` | 重なりは列（2026年9月29日、10月20日に物差しへ書き直し）。 |
| `day-road.js` | 一日の道（2026年9月29日、docs/todo-timeline.md の「一日の道」）。 |
| `split-items.js` | 一行に並べたものを、分けて入れる（R1）。 |
| `repeat-scope.js` | くり返しを直すときの範囲（この回だけ＝単発の写しに分かれ記録はその日を飛ばす・元に戻す／以後すべて＝跡は触らない／全部… |
| `repeat-after.js` | 済ませてから◯日のくり返し（R6）。前半は when-parse の誤読の表（「3日ごと」「2週間ごと」「10日に1回… |
| `work-plan-fields.js` | 仕事の予定とやること・段1の足す欄（予定かやることか・仕事かくらし・終わりの日・◯週ごと・今週の印・毎年）。 |
| `carry.js` | 元の場所へ戻るだけ（2026年10月18日、docs/todo-items.md の「期限切れは作らない」）。 |
| `usual-pace.js` | 段4 自分の速さ（2026年9月29日、docs/todo-timeline.md の「自分の速さ」）。 |
| `drink-quick.js` | お酒の紙の「よく飲むもの」の札と −/＋（2026年9月30日、docs/health.md の「よく飲むもの」）。 |
| `dur-row.js` | 詳細の紙の「時間」の札（2026年9月29日、docs/todo-items.md の「時間の札」）。 |
| `passed.js` | 段5 その日のうちの置き直し（2026年9月29日、docs/todo-timeline.md の「その日のうちの置き… |
| `road-lead.js` | 段6 明日の最初の停留所・段7 出る時刻（2026年9月29日、docs/todo-timeline.md の「一日の… |
| `road-bed.js` | 道の寝床と 5:30 からの道（2026年9月30日、docs/todo-timeline.md の「寝床」）。 |
| `road-keep-top.js` | 組み直しで紙が替わっても読んでいた場所に居る（iPhone が落とした scrollTop を一拍あとに戻す）・日を替… |
| `road-retap.js` | tasks の席をもう一度押すと 今日｜週 を行き来、今日へ戻ると道（いちばん上）から（2026年10月18日、doc… |
| `road-walk.js` | 道の人が歩く（2026年9月29日、docs/todo-timeline.md の「歩く」）。 |
| `road-late.js` | 道の延びる区間・長いほうが中心・分が変わると歩く（2026年9月30日、docs/todo-timeline.md の… |
| `road-now-clear.js` | いまの時刻が道に重ならない（2026年10月6日、docs/todo-timeline.md の「いまの時刻は人の頭の… |
| `road-done.js` | 済ませた停留所の描き方（2026年10月1日、docs/todo-timeline.md の「一日の道」）。 |
| `road-carry.js` | 段8 道へ運ぶ（2026年9月30日、docs/todo-timeline.md の「道へ運ぶ（段8）」）。 |
| `road-morph.js` | V8 連れ→停留所（2026年10月4日、docs/todo-timeline.md の「連れ→停留所（V8）」）。 |
| `done-time.js` | 済ませた時刻を直す・食事の枠の小窓（2026年10月3日）。 |
| `due-sheet.js` | 通知を押したら、その用事が開く＋あとで（R3）。 |
| `daily-tail.js` | Daily Log の「3行」「5行」は終わりの数行（2026年10月6日、docs/daily.md）。 |
| `then-years.js` | 同じ日の年々と、出さない日（R9）。時計を 2026年9月29日に止め、鍵の無い保存で quiet が空（移行なし）・… |
| `yearbook.js` | 年の本（R10）。前半は中身：記録のある年だけ新しい順・積み上げは種類ごと日付の順（著者・メモ）・「達成」は「やったこ… |
| `season.js` | 季節のひとこと（R2）。前半は表（2025〜2027年の節気の初日を暦要項と照らす・72候がどれも一年に出る・禁止語に… |
| `holiday.js` | 祝日と雑節・五節句（3.1 の K1・K2、2026年10月9日、docs/calendar-swipe.md の「祝… |
| `cal-shortcut.js` | カレンダーのショートカットの戻り道（2026年9月27日、docs/todo-items.md の「カレンダーに入れる… |
| `shared-day.js` | 共通の日と暦の段（2026年9月27日、docs/shared-header.md の段1）。 |
| `head-still.js` | 上の帯と暦は全タブで一つ（2026年9月27日、docs/shared-header.md の段2・段3）。 |
| `feel-sound.js` | 手ざわりの音（2026年10月10日、docs/motion.md の「手ざわりの表」・roadmap-seamles… |
| `feel-touch.js` | iPhone の震えるつまみと本物の指（2026年9月27日、docs/motion.md の FEEL）。 |
| `motion-dict.js` | 動きの辞書（V4、docs/motion.md）。 |
| `look-tokens.js` | 見た目の札（V12、docs/look.md の「見た目の札の表」）。 |
| `shape-tokens.js` | 形の札（docs/look.md「形の札」、総点検 Y1〜Y3・2026年10月21日）。門・画面を開かない。 |
| `one-part.js` | 同じ部品が一本のまま（roadmap-unify の U2）。 |
| `diary-import.js` | 日記を取り込む（D7）の上掛け（2026年9月30日、docs/storage.md）。 |
| `diary-idb.js` | 日記の本文の写し（2026年9月28日、docs/storage.md の「写しが正しい」）。 |
| `live-idb.js` | 記録の写し（docs/storage.md）。 |
| `backup-budget.js` | 自動の控えの上限（docs/log/data-check.md の案B）。 |
| `break.js` | 壊し方の試験（docs/storage.md の B5）。 |
| `lost-record.js` | 記録が見当たらない日（docs/storage.md）。写しも消した日の退路。 |
| `dropbox.js` | Dropbox へ自動で送る（2026年9月28日、docs/storage.md の「Dropbox へ送る」）。 |
| `day-send.js` | やることを別の日へ移すと、写しが暦のその日（か頭の日付）へ縮んで飛ぶ（V15、ui.js の sendToDay）。 |
| `fab-home.js` | ＋から出た紙は＋へ縮んで帰る（V16、ui.js の aimHome）。 |
| `day-swipe.js` | 紙を横に払って日を送る（2026年9月28日、docs/calendar-swipe.md の「払いを、ゆるく・軽く」… |
| `shop-day.js` | 買うもの：その日に買ったもの・価格から戻る紙（2026年9月28日、docs/shopping.md）。 |
| `shop-sheet-v2.js` | 買うものの足す紙と直す紙をやることの紙と同じ形に（V23・V26）：★は名前の右・名前からカテゴリと絵を推す・カテゴリ… |
| `shop-add-v27.js` | 買うものの＋の紙（V27、docs/shopping.md）：＋の一拍で名前の欄・打つ前はよく買う物の札（押せば足して… |
| `shop-tuck.js` | 買うもの：買った行を「今日買ったもの」の束へしまう（V17、docs/shopping.md）。 |
| `capture.js` | 行き先の札（R4）・Siri の「なんでも」（R5）・daily の＋（2026年9月28日）。 |
| `upcoming.js` | これからの二週間（R7）。前半は数え方：fallsOn が立つ日にだけ・曜日の毎週2回・済ませてから◯日は次の一回・毎… |
| `search-all.js` | ぜんぶをさがす（R8）。前半は表：過去の日付の言葉（9月28日に止める。 |
| `lock.js` | daily・ノートの鍵（docs/daily.md の「鍵」）。 |
| `diary-lock.js` | 日記だけの鍵（docs/daily.md の「鍵」）。 |
| `sets.js` | いつもの組（R11）を**外したあと**（2026年9月29日）。 |
| `insights-halves.js` | 気づいたことの前半と後半（R13）。時計を 9月29日に止め30日の窓で：休日・食後がどちらの半分でも重いと今までどお… |
| `insights-weekday.js` | 気づいたことの曜日の揺れ（J1）。時計を 10月9日に止め直近12週で：減っている途中でも月曜（重い）と金曜（軽い）を… |
| `run-all.js` | 台本ではなく回し役（R19）。上の「まとめて回す」 |
| `registry.js` | 3か所の登録（R21）。ブラウザ不要（playwright の無いところでも走る）。 |
| `offline.js` | 電波なしで開けるか（R21）。**アプリを開かずに Service Worker だけ入れ**（開くと、ネットで取った… |
| `update-path.js` | 版の入れ替えの道（roadmap-seamless の N1・N2・N3・3節の2）。 |
| `resume.js` | 読み直し・閉じられたあとも居た場所へ（roadmap-seamless の N4・X14 の (b)、docs/scr… |
| `audit.js` | 記録の点検（R28）と持ち主の無い品物（R18）。 |
| `csp.js` | 二つ目の鍵（R29）。CSP の meta（script-src 'self'・object-src 'none'・b… |
| `settings.js` | 設定の主な筋（R20）とエラーの記録（R23）・使用量（R24）。 |
| `offdevice-watch.js` | 端末の外の控えの見張り（R25）。記録が少ないうちは点なし・外の控えが無ければ点・書き出しが新しければ消える・14日で… |
| `diet-panes.js` | からだは一枚（10/5）：区画の帯なし・今日／記録／推移が順に丸角のカード・「並べて」なし・AI推計の地は明るく分析の… |
| `diet.js` | ダイエットの主な筋（R20）。時計を 9月29日 21:00 に止め、画面から：＋→「体重」で記録（その日の一件・頭の… |
| `cal-done-repeat.js` | 暦の済んだ印（2026年9月27日）。過去の済んだ単発は印・くり返しの済んだ控えは出さない。 |
| `restore-practice.js` | 復元の練習（R15）。材料は `emptyState()` の鍵ぜんぶ（ダイエットの棚も）に入れた記録。 |
| `restore-drill.js` | 復元の練習の穴（P6b。`docs/storage.md`「守りの地図」）。 |
| `shelf-base.js` | 3.0 の受け皿（T0、2026年10月6日、docs/roadmap-3.0.md）。画面は見ない。 |
| `shelf.js` | 五つの状態と「見直す」（3.0 の B1、2026年10月6日、docs/todo-items.md の「五つの状態」… |
| `still-js.js` | JS の動きも「動きを減らす」に従う（design-review 10節の P7）：JS に behavior:"sm… |
| `slips.js` | 置き直しの回数と選択肢（3.0 の B2、2026年10月6日、docs/todo-timeline.md の「置き直… |
| `refit.js` | 組み直し（3.0 の B3、2026年10月6日、docs/todo-timeline.md の「組み直し」）。 |
| `ai-unfold.js` | AI とほどく（3.0 の C1、2026年10月6日、docs/todo-items.md の「AI とほどく」）。 |
| `season-beat.js` | 季節の変わり目の一拍（roadmap-seamless の N7）。 |
| `season-art.js` | 季節の絵（3.0 の E1、2026年10月6日、docs/daily.md の「季節の絵」・docs/season-… |
| `feel-3.js` | 3.0 の手触り（F1、2026年10月6日、docs/iphone-check.md の 41〜50）。 |
| `activity.js` | 活動（3.0 の A1、2026年10月6日、docs/todo-timeline.md の「活動」）。 |
| `road-tools.js` | 道の右下の道具箱（3.0 の A3、2026年10月8日、docs/todo-timeline.md の「道具箱」）。 |
| `v2-switch.js` | 2.0 を既定にした（roadmap-2.0 の V26）。 |
| `frame-pace.js` | 速さ（roadmap-2.0 の V2）。**run-all にも門にも入れない、手で回す。 |
| `road-face.js` | 5方向の人（roadmap-2.0 の V7、docs/todo-timeline.md の「歩く人と寝床」「曲がり角… |
| `gesture-map.js` | 身ぶりと紙の表（roadmap-2.0 の V13、docs/screens-nav.md）。 |
| `gesture-dict.js` | 指の重さ（roadmap-unify の U4、docs/motion.md の「指の重さは一か所」）。 |
| `keyframes-one.js` | 同じ出来事の動きは一本（roadmap-unify の U5、docs/motion.md の「同じ出来事の動きは一本… |
| `gesture-weight.js` | 並べ替えと左端から戻る（U4、専用の試験が無かったもの）。 |
| `press-dict.js` | 押したときの返事は三種（roadmap-unify の U6、docs/motion.md の「押したときの返事は三種… |
| `pop-grow.js` | 小窓はみな、押したものから出て同じ点へ帰る（roadmap-unify の U7、docs/motion.md の「小… |
| `when-dict.js` | 日付と時刻の入れ方は一つ（roadmap-unify の U8、docs/todo-items.md の「日付と時刻の… |
| `num-fields.js` | 数の欄は `type="text"`（roadmap-unify の U9）。 |
| `when-live.js` | やること紙で、打った字の「いつ」を空きを打った時点で欄へ移す（「10:00 病」→ 題は病院・時刻10:00） |
| `tl-layout.js` | 今日の面の物差し（js/tl-layout.js・純関数）：重なり0〜4件の列・短い札・長さ未定・長い空きの畳み・y(… |
| `when-fields.js` | 日付と時刻の欄を画面で、欄ごとに（U8）。 |
| `words.js` | 言葉の札（roadmap-unify の U10、docs/look.md の「言葉の札」）。 |
| `del-rule.js` | 消すときの決まり（roadmap-unify の U11、docs/look.md の「消すとき」）。 |
| `sky.js` | 帯の空（2026年10月7日、docs/sky.md）。**門に入れた。 |
| `row-heights.js` | 行の背丈は三つ（roadmap-unify の U12、docs/look.md の「行の背丈は三つ」）。 |
| `inline-style.js` | インラインの style= を増やさない（roadmap-unify の U13、docs/look.md の「小見出… |
| `chip-icon-size.js` | 札の高さは二つ・絵は二段（roadmap-unify の U14、docs/look.md の「札の高さと絵の大きさ」… |
| `thing-sheets.js` | 物から生まれる紙の残り（roadmap-unify の U15）。 |
| `note-typing.js` | ノートで打つあいだ（docs/notes.md の「打つあいだの送り・太字」）。 |
| `fit-fields.js` | 伸びる欄を CSS で（2026年10月9日、docs/roadmap-3.1.md の S2）。 |
| `diary-out.js` | 日記の本文を記録から外す（2b、2026年10月4日、docs/storage.md の「段2の案」）。 |
| `road-wake.js` | 一日の道の10月2日の手直し（docs/todo-timeline.md）。 |
| `reactions.js` | 反応を足す（docs/motion.md の「反応を足す」・2026年10月8日）。 |
| `heavy-pace.js` | 大きな記録での重さ（手で回す）。SWEEP=1 で押せるもの全部を一巡り。 |
| `typeface.js` | 書体（docs/look.md の「書体は三つ」）。 |
| `export-nudge.js` | 週に一度の控え。記録が少ないうちは出さない・手の書き出しから7日で「週に一度の控え」（6日は出さない）・「あとで」「保… |
| `look-1008.js` | 見た目の三つ（2026年10月8日）。体重の数・帯の日付の書体は ui-rounded が先頭、明朝で外れる／買うもの… |
| `drink-sleep.js` | 気づいたことの「飲んだ晩の睡眠」（docs/health.md）。 |
| `insights-urges.js` | 気づいたことの「飲みたくなったとき」（docs/health.md の D9）。 |
| `insights-expenditure.js` | 記録から逆算した消費（docs/health.md）。 |
| `weight-trend.js` | 体重の線と「平均」（docs/health.md の10月8日）。 |
| `smooth.js` | なめらかさ（2026年10月9日、docs/motion.md の「押した一拍を軽く」）。**門に入る。 |
| `scroll-anchor.js` | スクロールの錨（Safari 27）で送りが跳ねないか（2026年10月9日、docs/roadmap-3.1.md … |
| `task-card.js` | やることの紙は四隅の丸いカード・行から広がって行へ戻る（2026年10月9日、docs/sheet-scroll.md… |
| `fold.js` | 使っていない面を畳む（3.1 の S4、2026年10月10日、docs/settings.md の「畳んだ面」）。 |
| `ime-enter.js` | 変換を決める改行（2026年10月10日、roadmap-seamless の N5）。**門に入る。 |
| `shun.js` | 旬の印（3.1 の K4、2026年10月10日、docs/shopping.md の「旬の印」）。 |
| `crown.js` | 最安の王冠は比べたときだけ（design-review の Y8、2026年10月21日）。 |
| `legibility.js` | 読みやすさ（2026年10月10日、roadmap-seamless の N15、docs/look.md の「暗い面… |
| `draft-keep.js` | 書きかけを守る（2026年10月10日、roadmap-seamless の N8・X15、docs/sheet-sc… |
| `entries-note.js` | 積み上げを一冊のノートへ（2026年10月12日、docs/thinking.md の「積み上げをやめた」）。 |
| `note-images.js` | ノートの画像（段5、2026年10月11日、docs/image-design.md の試験13項目）。 |
| `note-files.js` | ノートのファイル（PDF、2026年10月12日、docs/notes-unify.md「files/ で決めたこと」… |
| `notes-tree.js` | ノートの階層（notes-unify.md 段1・③）：parent の読み方・輪・移す・消す/戻すの連鎖・drop … |
| `notes-sync.js` | ノートの同期（notes-unify.md 段2）：偽の Dropbox を二台で。 |
| `note-import.js` | ノートの取り込み（notes-unify.md 段3）：MD5・ENML → Markdown（見出し・箇条・チェック… |
| `diary-chat.js` | 思考のホーム・時刻ごとの日記（docs/thinking.md）：本文は一つの文字のまま（時刻だけの行で一件）・冒頭の… |
| `asks.js` | 問い・種（docs/thinking.md）：「？」で始まるノートの行とタグ「問い」のノートの一覧（日記の「？」は引か… |
| `note-notion.js` | ノートの取り込み：Notion の zip（notes-unify.md 段3）：zip の中の zip・deflat… |
| `note-import-files.js` | ノートの取り込み：原本・PDF の字・imports/（notes-unify.md 段3）：画像の行のすぐ下に原本の… |
| `select-no-swipe.js` | 字を選んでいる指は送らない（KN.util.selecting）：吹き出しを選んだまま払っても日は動かない・払いの途中… |
| `road-labels-clear.js` | 一日の道の札どうしが重ならない：字の倍率 1〜1.3・朝の済んだ二つの用事の始まりと長さを振る（角の札がまだ無い通りに… |
| `note-organize.js` | 取り込んだノートを整理する（Notion は中を持つ一番上のページごとに一冊の頭・Notion の並び・Evernot… |
| `notes-drag.js` | ノートの木を手で組み替える（notes-unify.md「並び」）：pos は動かしたノートだけ・有る無しが混ざっても… |
| `urge-quick.js` | 飲みたくなったの紙：はじめは二段で強さだけで保存・札は固定で増えない・あとで記入・旧い記録を書き換えず読みかえる・書き… |
| `notes-title-tree.js` | 目次をコピー（notes.md「題の木」）：ノートブック → 字下げで深さ・id の頭6字・空は □・本文と最近削除は… |
| `notes-six.js` | ノートを6つに分ける（notes.md「6つの棚」）：棚のカード・すべてのノートは一番上・使っていない冊を消す・表のと… |
| `notes-ask-move.js` | 冊なしの問いのノートを thinking へ（thinking.md「考えたことは thinking へ」）：対象は冊… |
| `notes-fold.js` | 前のもの（notes-structure.md の段1）：thinking の一段目で★・束でなく30日触っていないノ… |
| `notes-bundle.js` | 話題を立てる道（notes-structure.md の段2）：「⋯」の束ねる（同じ段から選ぶ・題が空なら押せない・話… |
| `todo-empty.js` | やることの空の画面（2026年10月17日、roadmap-3.2 の H1）。 |
| `empty-no-text.js` | 買うもの・価格の空の画面（2026年10月17日、roadmap-3.2 の H2）。 |
| `work-plan-sheet.js` | 仕事の予定とやること・段2。打った字の隔週・◯週ごと（曜日か時刻があれば暦、無ければ済ませてから）・毎年の表と、紙の … |
| `work-week-face.js` | 仕事の予定とやること・段3。紙の頭の 今日｜週（開いたときは週・席の二度押し・日を押すとその日）、週の面の 期限→今週… |
| `work-month.js` | 仕事の予定とやること・段3の続き。月の紙は上の帯の暦の月の段：またがる予定の帯（筋は二本・端）、期限の縁、升目に名前を… |
| `week-pick.js` | 週の面の「選ぶ」。今週の中の「やること」の右の選ぶ（まだ選んでいない週は塗って促す・勝手に開かない）、選ぶ紙の並び（期… |
| `glance-sync.js` | glance.json を写す（docs/todo-items.md 段4・X29①）。 |
| `glance-view.js` | glance.json を PC で見る（docs/todo-items.md 段4・X29④）。 |
| `google-import.js` | Google 取り込み：偽の .ics／Tasks.json を読み、UTC→端末の時間・過去は済・読める型は一本／読… |
| `road-place.js` | 今日の面の札の時間割（予定は青・やることは緑の札、左上に用事の絵、題→メモ）と一日の道の置き場（設定：上＝既定・下＝t… |
| `work-month-face.js` | 月の面（今日｜週｜月）：月で暦が月の段に・予定のある日だけ時刻→名前・締切とまたがる予定・今月のまとめ・暦の月の段に名… |
| `tl-ops.js` | 今日の面の物差し・段3の操作：手順をひらいた札が下の札を押し下げる（組み直しても跳ねない・たたむと戻る）、長押しで動か… |
| `note-live.js` | ノートの見たまま（docs/notes-unify.md「書き方：見たまま」の段A）。 |
| `note-live-table.js` | ノートの見たままの表（docs/notes-unify.md「書き方：見たまま」の段B）。 |
| `traps.js` | 罠を試験で止める。ブラウザ不要。js/ の起動の道（即時関数・すぐ呼ぶ関数・同期メソッドの引数・Promise の e… |
| `unknown-keep.js` | 知らない欄を落とさない（revert の保険）。 |
| `live-slim.js` | R26 の段1：元と写しへ書くときだけ、やることの既定値の欄を省く。 |
| `todo-past.js` | R26 の段2a：過去のやること（閉じて30日より前の単発）を棚 todoPast へ写す。 |
| `todo-out.js` | R26 の段2b：過去のやることを記録から外す。 |
| `security-gate.js` | 配信の守り（セキュリティ S1）：index.html の CSP が決めた形・道具の頁の CSP と直書きスクリプト… |
| `xss-probe.js` | 画面の中の守り（セキュリティ S2）：記録の字の欄に罠の字（引用符で属性を閉じて要素を差しこむ字）を足して読み直し、五… |
| `relay-worker.js` | 外との口の守り（セキュリティ S3）：relay/worker.test.mjs を門から回す——中継所のふるまい・押… |
| `cal-press-glide.js` | 押して暦を開く・畳むときも滑る（2026年10月25日、利用者「パッと月表示になる」）：今日｜週｜月の「月」「週」・題… |
| `timeline-fold-now.js` | 「いま」の線が畳んだ空き（〜 まで予定なし 〜）の中を通るとき、字は線にかからない（2026年10月25日）。 |
| `cal-month-title.js` | 暦を月でめくると題もその月へ（今月なら今日、ほかの月は1日）。 |
| `daily-jump.js` | daily の題から日を選ぶ小窓（日→月→年に引き、寄って選ぶ・大きさは一つ・先の日へも）と、育休の行は 2026.0… |
| `leave-recount.js` | 前の数え方の育休の行を「あと(N-1)日（04.01を含めるとあとN日）」へ：数の合う期間の頭の行だけ・時刻はそのまま… |
| `subs-done-undo.js` | 手順の小窓で手順をぜんぶ済ませて親（くり返し）が済んだら、親を押したときと同じトースト・元に戻すで親も最後の手順も戻る。 |
| `backup-notes-only.js` | 記録が空でノートだけある端末でも控えを取る（backup.js の takeNow）。 |
| `inbox-take.js` | 職場の「足すだけ」受け箱 inbox/（Dropbox は偽）：PC は一件ずつ置くだけで取り込まない・iPhone … |
| `write-awake.js` | 書いているあいだは画面を消さない（app.js の watchWriting）：欄で Wake Lock を持ち、字が… |
| `timeline-done-list.js` | 今日の済ませたものは物差しの上の一覧（2026年10月28日、利用者）。 |
| `timeline-done-rest.js` | 今日の済ませたものの一覧は紙のいちばん上で、開くと帯の裏（2026年10月28日、利用者「タスクが多い日には圧迫する」… |
| `timeline-all-done.js` | 今日の用事をみな済ませたら、いまの時から一日の終わりまでを一枚の札（2026年10月28日、利用者「何もないのも寂しい… |
| `predict.js` | 打つときの予測：やることの前に書いた題の札・変換前の平仮名で漢字の言葉を引く（`js/yomi.js`）・言い切った時… |
| `timeline-about.js` | 時刻を決めていない用事の札は紙に沈む（2026年10月29日、利用者「時刻の決まった予定といつでもいいタスクが同じ重さ… |
| `diary-import-tool.js` | 日記の取り込み道具の読む口：.txt（Shift_JIS も）・ジャーナルの zip と .html（写真・地図の字と… |
| `subs-pop-follow.js` | 時間割の手順の小窓は札に付いて動く：後ろの紙が送られたら口といっしょに動き、口が見える範囲から出たら閉じる（2026年… |
| `desk.js` | パソコン・幅の広い画面（840px〜）：帯は窓の背いっぱいの平らな左の列（絵の右に名前の行）・印は縦に滑る・一覧は読む… |
| `diary-good.js` | よかったこと（docs/thinking.md）：書く紙の頭の一行・別の一件で中身の頭に見えない印 U+2063・吹き… |
| `desk-dock.js` | 右の段のノートが閉じるあいだ段の形のまま（design-review 10節の P7）：開いたまま「すべてのノート」で… |
| `desk-edges.js` | パソコンの境目（docs/desk.md 段12）：839｜840 で帯が下｜左の列、1023｜1024（中身 792… |
| `desk-windows.js` | 二つの窓（docs/desk.md 段10）：同じ文脈の頁二つ。 |
| `desk-replica.js` | 写しの端末（docs/desk.md 段15の②、js/replica.js）：偽の Dropbox。 |
| `desk-inbox.js` | 写しの端末から足す道と主の一台の取り込み（docs/desk.md 段15の③、js/desk-inbox.js）：偽… |
| `gutters.js` | 余白の物差し（design-review 10節の P7）：電話 393 の左右の余白（からだ・ノート 16px・買う… |
| `widths.js` | 幅の物差し（design-review 10節の P1）：393〜1920・200%拡大の12の幅×五つの席で、頁が横… |
| `desk-hand.js` | パソコン（Windows）の手ざわり（design-review 10節の P4）：紙・小窓を閉じたらカーソルは押した… |
| `desk-split.js` | 境目を引いて幅を変える（design-review 10節の P5、js/desk-split.js）：左の列・ノート… |
| `replica-mark.js` | 写しの端末の印（P6c、js/replica.js の trouble）：ふだんは何も出さない・元が置かれて3日／届か… |
| `sideways.js` | 電話を横にして使う（852×393・956×440 を指で、島を 59px に）：案内で隠さない・左の列は畳んだ形に据… |
| `kept-as-is.js` | 訊いて「今のまま」と決めたもの（design-review 11節）：店の名前は 92px で一行・…で切れる・探す字… |
| `mouse-back.js` | マウスの「戻る」ボタン（js/keys.js）：Esc と同じ一歩——やることの紙を閉じる・設定は一枚もどり根で前の席… |
| `sync-room.js` | 3台の同期 段1（docs/sync.md）：sync/room.test.mjs を門から回す——偽の部屋（node… |
| `sync-device.js` | 3台の同期 段2・3（docs/sync.md・js/sync.js）：偽の部屋（本物の room.mjs を nod… |
| `settings-map.js` | 設定の 入口 → 中身（2026年11月5日）：九つの入口がどの歯車からも同じ並び・既定でない値が移した先の一枚で読め… |
| `one-screen.js` | 一度だけ描く決まり三つ（design-review 12節・2026年11月7日）：393×852で開いたところ——①… |
| `attire.js` | 装い二つ（手帳・モダン）と基調色九つ・前の値の読み替え・見出しの書体。 |
| `moment.js` | 暦の日の一度きり（js/moment.js）：節気の初日の粒・祝日の光・一日一度・動きを減らす設定。 |
| `fill.js` | 詰める（Sorted のオートスケジュールに当たる紙）：並びの順に始める時刻から置く・ゆとり・長さ未定・予定とくり返し… |
