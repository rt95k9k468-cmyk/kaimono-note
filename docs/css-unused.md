# 使われていない CSS の候補表

`tools/css-unused.js` が作る（docs/roadmap-2.0.md の V3）。2026-11-08、全試験の `open()` 265回ぶんの当たりを足した。
**当たらない＝要らない、ではない**（試験が通らない状態・iOS だけの `@supports`・動きを減らす設定・
ぼかしの効かない受け皿など）。消すのは V25 で、一つずつ試験つき。手で書き足さない——作り直すと消える。

| ファイル | 規則 | 当たらない |
|---|---|---|
| base.css | 324 | 49 |
| components.css | 411 | 94 |
| screens.css | 2120 | 259 |
| attire.css | 89 | 65 |

## base.css（49）

| 行 | 規則 | 中 |
|---|---|---|
| 699 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 851 | `:root` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 856 | `.toast` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 867 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 877 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 1087 | `.head-cal.is-cal-resize` | @media (prefers-reduced-motion: reduce) |
| 1197 | `:root:not([data-theme="light"]) .head[data-sky="dawn"]` | @media (prefers-color-scheme: dark) |
| 1198 | `:root:not([data-theme="light"]) .head[data-sky="morning"]` | @media (prefers-color-scheme: dark) |
| 1199 | `:root:not([data-theme="light"]) .head[data-sky="day"]` | @media (prefers-color-scheme: dark) |
| 1200 | `:root:not([data-theme="light"]) .head[data-sky="evening"]` | @media (prefers-color-scheme: dark) |
| 1201 | `:root:not([data-theme="light"]) .head[data-sky="night"]` | @media (prefers-color-scheme: dark) |
| 1255 | `:root:not([data-theme="light"]) .head[data-sky-img]` | @media (prefers-color-scheme: dark) |
| 1306 | `.moment-grain` |  |
| 1307 | `.moment.is-snow .moment-grain` |  |
| 1308 | `.moment.is-petal .moment-grain` |  |
| 1309 | `.moment.is-leaf .moment-grain` |  |
| 1310 | `.moment.is-maple .moment-grain` |  |
| 1311 | `.moment.is-maple .moment-grain:nth-child(3n)` |  |
| 1318 | `:root:not([data-theme="light"]) .moment-light` | @media (prefers-color-scheme: dark) |
| 1320 | `:root[data-theme="dark"] .moment-light` |  |
| 1435 | `.screen.is-under` |  |
| 1440 | `.screen.is-over` |  |
| 1631 | `.screen::-webkit-scrollbar` |  |
| 1632 | `.screen::-webkit-scrollbar-thumb` |  |
| 1670 | `.topbar.is-stuck` |  |
| 2472 | `.has-fab .dock.is-away` | @media (min-width: 840px) and (orientation: landscape) and (max-height: 520px) and (pointer: coarse) |
| 2474 | `.has-fab .fab-menu` | @media (min-width: 840px) and (orientation: landscape) and (max-height: 520px) and (pointer: coarse) |
| 2547 | `:root[data-accent="green"]` |  |
| 2558 | `:root[data-accent="blue"]` |  |
| 2569 | `:root[data-accent="violet"]` |  |
| 2580 | `:root[data-accent="rose"]` |  |
| 2591 | `:root[data-accent="mustard"]` |  |
| 2602 | `:root[data-accent="sky"]` |  |
| 2613 | `:root[data-accent="apricot"]` |  |
| 2630 | `:root:not([data-theme="light"])[data-accent="green"], :root[data-theme="dark"][data-accen…` | @media (prefers-color-scheme: dark) |
| 2636 | `:root:not([data-theme="light"])[data-accent="blue"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2642 | `:root:not([data-theme="light"])[data-accent="violet"], :root[data-theme="dark"][data-acce…` | @media (prefers-color-scheme: dark) |
| 2648 | `:root:not([data-theme="light"])[data-accent="rose"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2654 | `:root:not([data-theme="light"])[data-accent="mustard"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2660 | `:root:not([data-theme="light"])[data-accent="sky"], :root[data-theme="dark"][data-accent=…` | @media (prefers-color-scheme: dark) |
| 2666 | `:root:not([data-theme="light"])[data-accent="apricot"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2674 | `:root[data-theme="dark"][data-accent="green"]` |  |
| 2679 | `:root[data-theme="dark"][data-accent="blue"]` |  |
| 2684 | `:root[data-theme="dark"][data-accent="violet"]` |  |
| 2689 | `:root[data-theme="dark"][data-accent="rose"]` |  |
| 2694 | `:root[data-theme="dark"][data-accent="mustard"]` |  |
| 2699 | `:root[data-theme="dark"][data-accent="sky"]` |  |
| 2704 | `:root[data-theme="dark"][data-accent="apricot"]` |  |
| 2738 | `:root:not([data-theme="light"])` | @media (prefers-contrast: more) and (prefers-color-scheme: dark) |

## components.css（94）

| 行 | 規則 | 中 |
|---|---|---|
| 98 | `[data-icons="phosphor"] .ui-ico[data-ico-mode="stroke"].is-sub` |  |
| 123 | `.is-there .swipe-yes .ui-ico .ico-line` |  |
| 124 | `.is-there .swipe-yes .ui-ico .ico-solid` |  |
| 168 | `.btn-ghost:hover` | @media (hover: hover) |
| 223 | `.icon-btn.is-danger:hover` | @media (hover: hover) |
| 258 | `.memo` |  |
| 269 | `.memo .icon-btn` |  |
| 320 | `.icon-pick-sub:empty` |  |
| 341 | `.icon-report-toggle.is-on` |  |
| 367 | `.icon-cell:active` |  |
| 368 | `.icon-cell.is-on` |  |
| 409 | `.stepper-btn:active` |  |
| 431 | `.input[type="date"], .input[type="time"]` |  |
| 444 | `.input[type="date"]` |  |
| 447 | `.input[type="time"]` |  |
| 452 | `.input[type="date"]::-webkit-date-and-time-value, .input[type="time"]::-webkit-date-and-t…` |  |
| 458 | `.input[type="date"]::-webkit-datetime-edit, .input[type="time"]::-webkit-datetime-edit` |  |
| 462 | `.input[type="date"]::-webkit-calendar-picker-indicator, .input[type="time"]::-webkit-cale…` |  |
| 471 | `.input[type="date"], .input[type="time"]` |  |
| 488 | `.chip-row::-webkit-scrollbar` |  |
| 685 | `.empty.is-quiet .empty-art` |  |
| 686 | `.empty.is-quiet .empty-art .empty-svg` |  |
| 687 | `.empty.is-quiet .empty-title` |  |
| 688 | `.empty.is-quiet .empty-text` |  |
| 876 | `.sheet-bloom` | @media (prefers-reduced-motion: reduce) |
| 1058 | `.hero-fact.is-fav` |  |
| 1130 | `.d-row:disabled` |  |
| 1163 | `.d-add:active` |  |
| 1246 | `.price-add .chip-wrap::-webkit-scrollbar` |  |
| 1259 | `.act-ico svg` |  |
| 1263 | `.act-row.is-danger .act-ico, .act-row.is-danger .act-label` |  |
| 1268 | `.due-list` |  |
| 1269 | `.due-row` |  |
| 1270 | `.due-row + .due-row` |  |
| 1271 | `.due-head` |  |
| 1272 | `.due-time` |  |
| 1273 | `.due-title` |  |
| 1274 | `.due-acts` |  |
| 1275 | `.due-acts > .btn:only-child` |  |
| 1276 | `.due-acts > .btn` |  |
| 1277 | `.due-later` |  |
| 1278 | `.due-later[hidden]` |  |
| 1279 | `.due-later > .btn` |  |
| 1280 | `.due-note` |  |
| 1281 | `.due-open` |  |
| 1293 | `.review-row .carry-head` |  |
| 1294 | `.review-row .carry-was` |  |
| 1314 | `.set-more > summary::-webkit-details-marker` |  |
| 1315 | `.set-more > summary:active` |  |
| 1321 | `.set-more[open] > summary::after` |  |
| 1322 | `.set-more > p, .set-more > ol, .set-more > pre` |  |
| 1324 | `.set-more > .set-card` |  |
| 1380 | `.sheet-mark` |  |
| 1561 | `.toast` | @media (prefers-contrast: more) |
| 1697 | `:root:not([data-theme="light"]) :not([aria-checked="true"]) > .toggle` | @media (prefers-color-scheme: dark) |
| 1727 | `.keypad` |  |
| 1754 | `.keypad.is-open` |  |
| 1756 | `.keypad-grid` |  |
| 1762 | `.keypad-actions` |  |
| 1772 | `.key` |  |
| 1790 | `.key::after` |  |
| 1795 | `.key:active` |  |
| 1797 | `.key-op` |  |
| 1802 | `.key-tax` |  |
| 1808 | `.key-tax-cap` |  |
| 1809 | `.key-tax-rate` |  |
| 1814 | `.key-off` |  |
| 1820 | `.key-off-cap` |  |
| 1821 | `.key-off-main` |  |
| 1826 | `.key-ok` |  |
| 1832 | `.key-ok.is-equals` |  |
| 1833 | `.key-ok:active` |  |
| 1836 | `.key-back svg` |  |
| 1849 | `.is-m-press` |  |
| 1884 | `.is-m-add` |  |
| 1913 | `.is-m-success` |  |
| 1949 | `.dest-chip:active` |  |
| 1984 | `#yearbook-print li .yb-text` | @media print |
| 1990 | `#notes-print` |  |
| 1992 | `html.is-printing-notes, html.is-printing-notes body` | @media print |
| 1997 | `html.is-printing-notes body > *:not(#notes-print)` | @media print |
| 1998 | `html.is-printing-notes #notes-print` | @media print |
| 2011 | `#notes-print .np-note + .np-note` | @media print |
| 2012 | `#notes-print h2` | @media print |
| 2013 | `#notes-print .np-meta` | @media print |
| 2014 | `#notes-print .np-body > *` | @media print |
| 2015 | `#notes-print .nv-img` | @media print |
| 2016 | `#notes-print .nv-img img` | @media print |
| 2017 | `#notes-print .nv-img.is-gone` | @media print |
| 2067 | `.lock-veil` | @media print |
| 2078 | `.lock-away svg` |  |
| 2133 | `.unf-prompt` |  |
| 2144 | `.unf-none` |  |
| 2158 | `.todo-cands::-webkit-scrollbar` |  |

## screens.css（259）

| 行 | 規則 | 中 |
|---|---|---|
| 93 | `:root:not([data-theme="light"]) .add-fab` | @media (prefers-color-scheme: dark) |
| 124 | `.ac` |  |
| 146 | `.ac-chips::-webkit-scrollbar` |  |
| 266 | `.item-emoji:empty` |  |
| 291 | `.item-wrap.is-swiping .item` |  |
| 328 | `.cal.is-stuck` |  |
| 437 | `.topbar-title .roll > .roll-in, .topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 439 | `.topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 485 | `.cal-arrow` |  |
| 493 | `.cal-arrow svg` |  |
| 496 | `.cal-arrow.js-prev svg` |  |
| 497 | `.cal-arrow:active` |  |
| 499 | `.cal-arrow:hover` | @media (hover: hover) |
| 503 | `.cal-more` |  |
| 511 | `.cal-more[aria-expanded="true"]` |  |
| 512 | `.cal-more:hover` | @media (hover: hover) |
| 576 | `.cal-wk-page.is-void` |  |
| 606 | `.cal.is-peek.is-week .cal-pad.is-off-week` |  |
| 614 | `.cal.is-settling .cal-clip, .cal.is-settling .cal-slide, .cal.is-settling .cal-wds, .cal.…` | @media (prefers-reduced-motion: reduce) |
| 768 | `.cal-mark .ui-ico` |  |
| 900 | `.todo-group.is-drop-target` |  |
| 976 | `.item.todo:not(.is-tile).is-checked .todo-lead` |  |
| 981 | `.item.todo:not(.is-tile).is-checked .todo-mark .p-icon` |  |
| 984 | `.item.todo:not(.is-tile).is-checked .todo-tag` |  |
| 985 | `.item.todo:not(.is-tile).is-checked .item-meta` |  |
| 1024 | `.item.todo:not(.is-tile) .item-memo` |  |
| 1039 | `.todo-at` |  |
| 1076 | `.time-row .chip` |  |
| 1080 | `.todo-tag` |  |
| 1092 | `.link-btn` |  |
| 1149 | `.is-armed .swipe-yes > *, .is-armed .swipe-arch > *` |  |
| 1151 | `.is-swiping.is-right .swipe-yes` |  |
| 1152 | `.is-swiping.is-left .swipe-arch` |  |
| 1157 | `.is-swiping.is-right .item, .is-swiping.is-right .product` |  |
| 1161 | `.is-swiping.is-left .item, .is-swiping.is-left .product` |  |
| 1272 | `.check[aria-checked="true"] .check-repeat` |  |
| 1274 | `.check.is-repeat:hover .check-repeat svg` | @media (hover: hover) |
| 1303 | `.insights` |  |
| 1311 | `.insights-head` |  |
| 1320 | `.insights-head svg` |  |
| 1322 | `.insights-list` |  |
| 1324 | `.insight` |  |
| 1328 | `.insight-ico` |  |
| 1329 | `.insight-ico.is-warn` |  |
| 1330 | `.insight-ico.is-good` |  |
| 1331 | `.insight-ico.is-note` |  |
| 1332 | `.insight-ico.is-mute` |  |
| 1333 | `.insight-main` |  |
| 1334 | `.insight-title` |  |
| 1335 | `.insight-body` |  |
| 1491 | `.done-head[aria-expanded="true"] svg` |  |
| 1492 | `.done-head:active` |  |
| 1562 | `.archive` |  |
| 1564 | `.archive-head` |  |
| 1576 | `.archive-head svg` |  |
| 1582 | `.archive.is-open .archive-head svg` |  |
| 1583 | `.archive-body` |  |
| 1587 | `.archive .product` |  |
| 1593 | `.archive .product-name` |  |
| 1594 | `.archive .product-emoji` |  |
| 1595 | `.archive .product::before` |  |
| 1596 | `.archive .item-price-amount` |  |
| 1597 | `.archive .product-list` |  |
| 1622 | `.product-wrap.is-swiping .product` |  |
| 1700 | `.price-main:active` |  |
| 1710 | `.price-unit` |  |
| 1727 | `.cmp` |  |
| 1728 | `.cmp b` |  |
| 1729 | `.cmp .cmp-good` |  |
| 1730 | `.cmp .cmp-bad` |  |
| 1732 | `.log-row` |  |
| 1741 | `.log-row.is-current` |  |
| 1742 | `.log-date` |  |
| 1743 | `.log-price` |  |
| 1744 | `.log-unit` |  |
| 1745 | `.log-tag` |  |
| 1804 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 1880 | `.set-layer.is-sheetish .set-choose` |  |
| 2050 | `.set-card.is-alert` |  |
| 2051 | `.set-card.is-alert .set-title` |  |
| 2052 | `.set-card.is-alert .set-note` |  |
| 2200 | `.set-choose` |  |
| 2205 | `.set-choose .set-row` |  |
| 2206 | `.set-choose .set-row + .set-row::before` |  |
| 2207 | `.set-check` |  |
| 2208 | `.set-check svg` |  |
| 2252 | `.set-time:active` |  |
| 2295 | `.theme-pick:active .theme-shot` |  |
| 2332 | `.set-range::-moz-range-track` |  |
| 2341 | `.set-range::-moz-range-thumb` |  |
| 2348 | `.set-range:focus-visible` |  |
| 2349 | `.set-range:focus-visible::-webkit-slider-thumb` |  |
| 2387 | `#screen-settings .section-title` |  |
| 2408 | `.set-glyph.is-plain` |  |
| 2464 | `.swatches` |  |
| 2465 | `.swatch` |  |
| 2472 | `.swatch:hover` | @media (hover: hover) |
| 2474 | `.swatch[aria-pressed="true"]` |  |
| 2487 | `.calc-out` |  |
| 2498 | `.calc-out.is-idle` |  |
| 2666 | `.diet-hero-cond` |  |
| 2682 | `.diet-stat:active` |  |
| 2685 | `.diet-stat-value.is-warn` |  |
| 2692 | `.diet-note.is-warn` |  |
| 2711 | `.diet-goal-line` |  |
| 2712 | `.diet-goal-tag` |  |
| 2714 | `.diet-goal-tag.is-off` |  |
| 2723 | `.diet-goal-glow` |  |
| 2728 | `.diet-ma14` |  |
| 2738 | `.diet-dot.is-health` |  |
| 2773 | `.diet-legend-item i.dot-ma14` |  |
| 2777 | `.ta-wrap` |  |
| 2778 | `.ta-clear` |  |
| 2786 | `.ta-clear svg` |  |
| 2787 | `.ta-clear` |  |
| 2788 | `.ta-clear:active` |  |
| 2834 | `:root:not([data-theme="light"]) .diet-cell[data-type="drink"] :is(.diet-cell-label, .diet…` | @media (prefers-color-scheme: dark) |
| 2842 | `:root:not([data-theme="light"]) .diet-cell[data-type="drink"] :is(.diet-cell-label, .diet…` | @media (prefers-contrast: more) and (prefers-color-scheme: dark) |
| 2874 | `.diet-ring.is-none` |  |
| 2893 | `.diet-ring.is-none .diet-ring-mid` |  |
| 2969 | `button.section-note:active` |  |
| 3018 | `.diet-mood` |  |
| 3167 | `.diet-workouts` |  |
| 3175 | `.diet-kcal-rem` |  |
| 3176 | `.diet-kcal-rem b` |  |
| 3177 | `.diet-kcal-rem.is-over b` |  |
| 3178 | `.diet-kcal-target` |  |
| 3198 | `.diet-stack i.is-snack` |  |
| 3199 | `.diet-stack i.is-other` |  |
| 3233 | `.diet-stack-key i.is-snack` |  |
| 3234 | `.diet-stack-key i.is-other` |  |
| 3236 | `.diet-stack-key i.is-rest` |  |
| 3318 | `.diet-memo-open:active` |  |
| 3329 | `.diet-memo.is-blank .diet-memo-body` |  |
| 3342 | `.diet-suggest` |  |
| 3359 | `.diet-finding.is-warn` |  |
| 3360 | `.diet-finding.is-warn .diet-finding-ico` |  |
| 3375 | `.diet-code` |  |
| 3381 | `.diet-suggest-box` |  |
| 3393 | `.diet-read-row` |  |
| 3394 | `.diet-read-name` |  |
| 3395 | `.diet-read-row b` |  |
| 3396 | `.diet-read-day` |  |
| 3398 | `.diet-keys` |  |
| 3401 | `.diet-key` |  |
| 3405 | `.diet-key code` |  |
| 3406 | `.diet-key-name` |  |
| 3407 | `.diet-key-ex` |  |
| 3434 | `.diet-steps a, .diet-note a` |  |
| 3452 | `.diet-note code, .diet-steps code, .diet-key code` |  |
| 3478 | `.diet-daynav .js-today` |  |
| 3493 | `.diet-got` |  |
| 3498 | `.diet-got-head` |  |
| 3499 | `.diet-got pre` |  |
| 3505 | `.diet-why summary` |  |
| 3509 | `.diet-why[open] summary` |  |
| 3547 | `.arc-then:active` |  |
| 3549 | `.arc-then` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 3550 | `.arc-then` | @media (prefers-contrast: more) |
| 3576 | `.arc-then.is-years:active` |  |
| 3584 | `.arc-year:active` |  |
| 3595 | `.arc-year-text.is-blank` |  |
| 3631 | `.arc-log-empty` |  |
| 3709 | `:root:not([data-theme="light"]) .think-home` | @media (prefers-color-scheme: dark) |
| 3711 | `.think-home` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 3776 | `.arc-posts` | @media (prefers-contrast: more) |
| 3795 | `.arc-post.can-more .arc-post-body:active:not(:has(.arc-post-act:active))` |  |
| 3828 | `.arc-post.can-more:not(.is-folded) .arc-post-more span` |  |
| 3829 | `.arc-post.can-more:not(.is-folded) .arc-post-more svg` |  |
| 3832 | `.arc-log-row.is-chat .js-times:active` |  |
| 3836 | `.arc-row` |  |
| 3843 | `.arc-row` |  |
| 3844 | `.arc-row::before` |  |
| 3850 | `.arc-row .check, .arc-row .fav` |  |
| 3961 | `.add-fab.is-open:active` |  |
| 3974 | `.item.is-glow` |  |
| 3980 | `.item.is-finishing` |  |
| 3987 | `.item.is-sliding` |  |
| 3998 | `.item.is-dropping` |  |
| 4019 | `.item.is-glow, .item.is-finishing, .item.is-sliding, .item.is-dropping, .is-arriving` | @media (prefers-reduced-motion: reduce) |
| 4053 | `.trip.todo-today.is-tl` |  |
| 4060 | `.trip.todo-today.is-tl .todo-head` |  |
| 4071 | `.tl-sum.is-back` |  |
| 4087 | `.refit-ok` |  |
| 4109 | `.fill-row.reorder-lift` |  |
| 4227 | `.tl-node .todo-mark svg` |  |
| 4613 | `.tl-list > li.tl-row:has(> .tl-sub-wrap.is-open)` |  |
| 4617 | `.tl-list > li.tl-row:has(> .tl-sub-wrap.is-open) > .item.tl-item` |  |
| 4619 | `.tl-list.is-push-open > li` |  |
| 4620 | `.tl-list.is-push-shut > li` |  |
| 4622 | `.tl-list > li.tl-row > .tl-sub-wrap::before` |  |
| 4776 | `.tl-more-row:active` |  |
| 4858 | `.tl-grip[role="button"]:focus-visible` |  |
| 4952 | `.wk-next:active` |  |
| 5015 | `.mo-date:active` |  |
| 5019 | `.mo-date:is([data-wd="0"], .is-holiday) :is(.mo-dn, .mo-wd)` |  |
| 5103 | `.cal-day.is-drop` |  |
| 5185 | `.tl-node.is-unpop` |  |
| 5186 | `.tl-item.is-unstriking .item-name, .item.is-unstriking .item-name` |  |
| 5202 | `.todo-group.is-tl .todo-head` |  |
| 5514 | `:root:not([data-theme="light"]) :is(#screen-archive, #screen-notes, #head)` | @media (prefers-color-scheme: dark) |
| 5681 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 5726 | `.nt-row > svg:last-child` |  |
| 5728 | `.nt-ico` |  |
| 5784 | `.notes-tree` | @media print |
| 5814 | `.notes-rest > summary::-webkit-details-marker` |  |
| 5822 | `.ask-past` |  |
| 5826 | `.notes-asks-empty` |  |
| 5829 | `.ask-sheet-q + .ask-ctx` |  |
| 5874 | `.note-nb-btn:active` |  |
| 5893 | `.note-pick` |  |
| 5895 | `.note-pick-books` |  |
| 5896 | `.note-pick-books .chip` |  |
| 5897 | `.note-pick-books .chip > span:last-child` |  |
| 5898 | `.note-pick-books .chip:last-child:nth-child(odd)` |  |
| 5899 | `.note-name-in` |  |
| 5931 | `.notes-off` |  |
| 5942 | `.notes-trash .note-row` |  |
| 6344 | `.pop-cal-day:disabled` |  |
| 6345 | `.pop-cal-day:disabled:not(.is-today)` |  |
| 6346 | `.pop-cal-day.is-today:disabled` |  |
| 6351 | `.pop-cal-day[aria-pressed="true"]:active` |  |
| 6380 | `.note-wheel::-webkit-scrollbar` |  |
| 6393 | `.note-wheel-row:active` |  |
| 6412 | `.tw-input::-webkit-date-and-time-value` |  |
| 6438 | `.note-pop-sub` |  |
| 6441 | `button.note-when:active` |  |
| 6452 | `.note-read` |  |
| 6464 | `.diet-found-n` |  |
| 6636 | `.tl-row.is-aim` |  |
| 6637 | `.tl-row.is-aim::before` |  |
| 6646 | `.tl-row.is-aim.is-aim-before::before` |  |
| 6758 | `.tl-trash.is-armed` |  |
| 6760 | `.tl-ghost` | @media (prefers-reduced-motion: reduce) |
| 6781 | `.tl-aim-line.is-under .tl-band-time` |  |
| 6788 | `.tl-someday-sec.is-aim` |  |
| 6826 | `.trip-plan-btn:active` |  |
| 6827 | `.trip-plan-btn.is-on` |  |
| 6836 | `.low` |  |
| 6837 | `.low .trip-head svg` |  |
| 6838 | `.low-list` |  |
| 6839 | `.low-row` |  |
| 6843 | `.low-mark` |  |
| 6851 | `.low-mark .p-icon` |  |
| 6852 | `.low-main` |  |
| 6853 | `.low-name` |  |
| 6854 | `.low-meta` |  |
| 6859 | `.low-add` |  |
| 6871 | `.low-add svg` |  |
| 6873 | `:root:not([data-theme="light"]) .low-add` | @media (prefers-color-scheme: dark) |
| 6875 | `:root[data-theme="dark"] .low-add` |  |
| 6878 | `.tl-shop` |  |
| 7051 | `.sub-line.reorder-lift .sub-grip` |  |
| 7055 | `.sub-line.reorder-lift` |  |
| 7112 | `.arc-feed-box.is-split .arc-feed-list` |  |
| 7133 | `.arc-feed-row:active` |  |
| 7145 | `.arc-feed-row:hover .arc-feed-title` | @media (hover: hover) |
| 8167 | `.sheet.is-note.is-wide` | @media (min-width: 840px) and (orientation: landscape) and (max-height: 520px) and (pointer: coarse) |
| 8191 | `:is(#screen-list .tl-sheet > .js-body, #screen-prices .prices-ground) > .cat-group` | @media (min-width: 840px) and (orientation: landscape) and (max-height: 520px) and (pointer: coarse) |

## attire.css（65）

| 行 | 規則 | 中 |
|---|---|---|
| 28 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="0"]` |  |
| 29 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="1"]` |  |
| 30 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="2"]` |  |
| 31 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="3"]` |  |
| 32 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="4"]` |  |
| 33 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="5"]` |  |
| 34 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="6"]` |  |
| 35 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="7"]` |  |
| 36 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="8"]` |  |
| 37 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="9"]` |  |
| 38 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="10"]` |  |
| 39 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="11"]` |  |
| 40 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="12"]` |  |
| 41 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="13"]` |  |
| 42 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="14"]` |  |
| 44 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="16"]` |  |
| 45 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="17"]` |  |
| 46 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="18"]` |  |
| 47 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="19"]` |  |
| 48 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="20"]` |  |
| 49 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="21"]` |  |
| 50 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="22"]` |  |
| 51 | `:is(:root, .attire-shot)[data-attire="season"][data-sekki="23"]` |  |
| 55 | `:root:is([data-attire^="washi"], [data-attire="season"]):not([data-theme="dark"])` | @media (prefers-color-scheme: light) |
| 71 | `:root[data-attire="polish"]:not([data-theme="dark"])` | @media (prefers-color-scheme: light) |
| 79 | `:root:is([data-attire^="washi"], [data-attire="season"])[data-theme="light"]` |  |
| 94 | `:root[data-attire="polish"][data-theme="light"]` |  |
| 104 | `:root:is([data-attire^="washi"], [data-attire="season"]):not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 118 | `:root[data-attire="polish"]:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 126 | `:root:is([data-attire^="washi"], [data-attire="season"])[data-theme="dark"]` |  |
| 140 | `:root[data-attire="polish"][data-theme="dark"]` |  |
| 149 | `:is(:root, .attire-shot):is([data-attire^="washi"], [data-attire="season"])` | @media (prefers-contrast: more) |
| 157 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is(.topbar-title, .tab-title, .…` |  |
| 162 | `:root:is([data-attire^="washi"], [data-attire="season"]) .head[data-sky]::before` |  |
| 168 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#5ea55a"], [s…` |  |
| 169 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#d4695f"], [s…` |  |
| 170 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#d79a4a"], [s…` |  |
| 171 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#5b9bd5"], [s…` |  |
| 172 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#4fb3c4"], [s…` |  |
| 173 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#9b7ede"], [s…` |  |
| 174 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#48b39a"], [s…` |  |
| 175 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#e07fa8"], [s…` |  |
| 176 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#8d968f"], [s…` |  |
| 177 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#c2853f"], [s…` |  |
| 178 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is([style*="--cat:#7a8fd4"], [s…` |  |
| 180 | `:root[data-attire="polish"] :is([style*="--cat:#5ea55a"], [style*="--cat: #5ea55a"])` |  |
| 181 | `:root[data-attire="polish"] :is([style*="--cat:#d4695f"], [style*="--cat: #d4695f"])` |  |
| 182 | `:root[data-attire="polish"] :is([style*="--cat:#d79a4a"], [style*="--cat: #d79a4a"])` |  |
| 183 | `:root[data-attire="polish"] :is([style*="--cat:#5b9bd5"], [style*="--cat: #5b9bd5"])` |  |
| 184 | `:root[data-attire="polish"] :is([style*="--cat:#4fb3c4"], [style*="--cat: #4fb3c4"])` |  |
| 185 | `:root[data-attire="polish"] :is([style*="--cat:#9b7ede"], [style*="--cat: #9b7ede"])` |  |
| 186 | `:root[data-attire="polish"] :is([style*="--cat:#48b39a"], [style*="--cat: #48b39a"])` |  |
| 187 | `:root[data-attire="polish"] :is([style*="--cat:#e07fa8"], [style*="--cat: #e07fa8"])` |  |
| 188 | `:root[data-attire="polish"] :is([style*="--cat:#8d968f"], [style*="--cat: #8d968f"])` |  |
| 189 | `:root[data-attire="polish"] :is([style*="--cat:#c2853f"], [style*="--cat: #c2853f"])` |  |
| 190 | `:root[data-attire="polish"] :is([style*="--cat:#7a8fd4"], [style*="--cat: #7a8fd4"])` |  |
| 195 | `:root:is([data-attire^="washi"], [data-attire="season"]) .check:not([aria-checked="mixed"…` |  |
| 201 | `:root:is([data-attire^="washi"], [data-attire="season"])` |  |
| 205 | `:root:is([data-attire^="washi"], [data-attire="season"]):not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 209 | `:root:is([data-attire^="washi"], [data-attire="season"])[data-theme="dark"]` |  |
| 212 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is(.tl-item, .item):is(.is-stri…` |  |
| 215 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is(.tl-item, .item).is-striking…` |  |
| 216 | `:root:is([data-attire^="washi"], [data-attire="season"]) :is(.tl-item, .item).is-unstriki…` |  |
| 219 | `:root:is([data-attire^="washi"], [data-attire="season"]) .is-checked .item-name` |  |
| 270 | `.theme-pick:active .attire-shot` |  |
