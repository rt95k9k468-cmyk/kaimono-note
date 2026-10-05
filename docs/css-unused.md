# 使われていない CSS の候補表

`tools/css-unused.js` が作る（docs/roadmap-2.0.md の V3）。2026-10-05、全試験の `open()` 89回ぶんの当たりを足した。
**当たらない＝要らない、ではない**（試験が通らない状態・iOS だけの `@supports`・動きを減らす設定・
ぼかしの効かない受け皿など）。消すのは V25 で、一つずつ試験つき。手で書き足さない——作り直すと消える。

| ファイル | 規則 | 当たらない |
|---|---|---|
| base.css | 155 | 34 |
| components.css | 370 | 87 |
| screens.css | 1382 | 357 |

## base.css（34）

| 行 | 規則 | 中 |
|---|---|---|
| 623 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 775 | `:root` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 780 | `.toast` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 791 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 801 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 1084 | `.screen.is-under` |  |
| 1089 | `.screen.is-over` |  |
| 1286 | `.screen::-webkit-scrollbar` |  |
| 1287 | `.screen::-webkit-scrollbar-thumb` |  |
| 1325 | `.topbar.is-stuck` |  |
| 1723 | `.app, #sheet-root, .toast-root` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1725 | `.rotate-note` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1738 | `.rotate-note svg` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1739 | `.rotate-note b` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 2055 | `:root[data-accent="blue"]` |  |
| 2066 | `:root[data-accent="violet"]` |  |
| 2077 | `:root[data-accent="rose"]` |  |
| 2088 | `:root[data-accent="mustard"]` |  |
| 2099 | `:root[data-accent="sky"]` |  |
| 2110 | `:root[data-accent="apricot"]` |  |
| 2127 | `:root:not([data-theme="light"])[data-accent="green"], :root[data-theme="dark"][data-accen…` | @media (prefers-color-scheme: dark) |
| 2133 | `:root:not([data-theme="light"])[data-accent="blue"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2139 | `:root:not([data-theme="light"])[data-accent="violet"], :root[data-theme="dark"][data-acce…` | @media (prefers-color-scheme: dark) |
| 2145 | `:root:not([data-theme="light"])[data-accent="rose"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2151 | `:root:not([data-theme="light"])[data-accent="mustard"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2157 | `:root:not([data-theme="light"])[data-accent="sky"], :root[data-theme="dark"][data-accent=…` | @media (prefers-color-scheme: dark) |
| 2163 | `:root:not([data-theme="light"])[data-accent="apricot"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2171 | `:root[data-theme="dark"][data-accent="green"]` |  |
| 2176 | `:root[data-theme="dark"][data-accent="blue"]` |  |
| 2181 | `:root[data-theme="dark"][data-accent="violet"]` |  |
| 2186 | `:root[data-theme="dark"][data-accent="rose"]` |  |
| 2191 | `:root[data-theme="dark"][data-accent="mustard"]` |  |
| 2196 | `:root[data-theme="dark"][data-accent="sky"]` |  |
| 2201 | `:root[data-theme="dark"][data-accent="apricot"]` |  |

## components.css（87）

| 行 | 規則 | 中 |
|---|---|---|
| 98 | `[data-icons="phosphor"] .ui-ico[data-ico-mode="stroke"].is-sub` |  |
| 123 | `.is-there .swipe-yes .ui-ico .ico-line` |  |
| 124 | `.is-there .swipe-yes .ui-ico .ico-solid` |  |
| 167 | `.btn-ghost:hover` | @media (hover: hover) |
| 221 | `.icon-btn.is-danger:hover` | @media (hover: hover) |
| 256 | `.memo` |  |
| 269 | `.memo .icon-btn` |  |
| 321 | `.icon-pick-sub:empty` |  |
| 342 | `.icon-report-toggle.is-on` |  |
| 368 | `.icon-cell:active` |  |
| 369 | `.icon-cell.is-on` |  |
| 410 | `.stepper-btn:active` |  |
| 453 | `.input[type="date"]::-webkit-date-and-time-value, .input[type="time"]::-webkit-date-and-t…` |  |
| 493 | `.chip-row::-webkit-scrollbar` |  |
| 512 | `.sheet .chip-row.js-days, .note-pop.is-form .chip-row.js-days` |  |
| 517 | `.sheet .chip-row.js-days .chip, .note-pop.is-form .chip-row.js-days .chip` |  |
| 691 | `.empty.is-quiet .empty-text` |  |
| 857 | `.sheet-bloom` | @media (prefers-reduced-motion: reduce) |
| 1037 | `.hero-fact.is-fav` |  |
| 1038 | `.hero-fact.is-subs i` |  |
| 1099 | `.d-row:disabled` |  |
| 1132 | `.d-add:active` |  |
| 1223 | `.price-add .chip-wrap::-webkit-scrollbar` |  |
| 1236 | `.act-ico svg` |  |
| 1240 | `.act-row.is-danger .act-ico, .act-row.is-danger .act-label` |  |
| 1245 | `.due-list` |  |
| 1246 | `.due-row` |  |
| 1247 | `.due-row + .due-row` |  |
| 1248 | `.due-head` |  |
| 1249 | `.due-time` |  |
| 1250 | `.due-title` |  |
| 1251 | `.due-acts` |  |
| 1252 | `.due-acts > .btn:only-child` |  |
| 1253 | `.due-acts > .btn` |  |
| 1254 | `.due-later` |  |
| 1255 | `.due-later[hidden]` |  |
| 1256 | `.due-later > .btn` |  |
| 1257 | `.due-note` |  |
| 1258 | `.due-open` |  |
| 1265 | `.carry-row + .carry-row` |  |
| 1283 | `.stack > .set-more` |  |
| 1291 | `.set-more > summary::-webkit-details-marker` |  |
| 1297 | `.set-more[open] > summary::after` |  |
| 1298 | `.set-more > p, .set-more > ol, .set-more > pre` |  |
| 1300 | `.set-more > .set-card` |  |
| 1356 | `.sheet-mark` |  |
| 1372 | `.is-reordering` |  |
| 1376 | `.is-reordering > *` |  |
| 1387 | `.is-reordering > .reorder-ghost` |  |
| 1396 | `.is-reordering > .reorder-ghost.is-going` |  |
| 1401 | `.reorder-lift` |  |
| 1413 | `.reorder-drop` |  |
| 1570 | `.row-sub` |  |
| 1572 | `.row-chevron` |  |
| 1573 | `.row-chevron svg` |  |
| 1626 | `:root:not([data-theme="light"]) .toggle` | @media (prefers-color-scheme: dark) |
| 1631 | `.toggle, .toggle-knob, .toggle-mark` | @media (prefers-reduced-motion: reduce) |
| 1636 | `.divider` |  |
| 1656 | `.keypad` |  |
| 1683 | `.keypad.is-open` |  |
| 1685 | `.keypad-grid` |  |
| 1691 | `.keypad-actions` |  |
| 1701 | `.key` |  |
| 1719 | `.key::after` |  |
| 1724 | `.key:active` |  |
| 1726 | `.key-op` |  |
| 1731 | `.key-tax` |  |
| 1737 | `.key-tax-cap` |  |
| 1738 | `.key-tax-rate` |  |
| 1743 | `.key-off` |  |
| 1749 | `.key-off-cap` |  |
| 1750 | `.key-off-main` |  |
| 1755 | `.key-ok` |  |
| 1761 | `.key-ok.is-equals` |  |
| 1762 | `.key-ok:active` |  |
| 1765 | `.key-back svg` |  |
| 1778 | `.is-m-press` |  |
| 1800 | `.is-m-add` |  |
| 1808 | `.is-m-delete` |  |
| 1827 | `.is-m-success` |  |
| 1840 | `.row-times` |  |
| 1841 | `.row-times .input` |  |
| 1842 | `.row-dash` |  |
| 1859 | `.dest-chip:active` |  |
| 1944 | `.lock-veil` | @media print |
| 1955 | `.lock-away svg` |  |
| 1987 | `.lock-key.is-bio[hidden]` |  |

## screens.css（357）

| 行 | 規則 | 中 |
|---|---|---|
| 93 | `:root:not([data-theme="light"]) .add-fab` | @media (prefers-color-scheme: dark) |
| 124 | `.ac` |  |
| 137 | `.ac-item` |  |
| 146 | `.ac-item:last-child` |  |
| 147 | `.ac-item.is-active` |  |
| 151 | `.ac-item:hover` | @media (hover: hover) |
| 153 | `.ac-main` |  |
| 154 | `.ac-name` |  |
| 155 | `.ac-sub` |  |
| 174 | `.ac-chips::-webkit-scrollbar` |  |
| 266 | `.item-emoji:empty` |  |
| 284 | `.item-wrap.is-swiping .item` |  |
| 323 | `.cal.is-stuck` |  |
| 431 | `.topbar-title .roll > .roll-in, .topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 433 | `.topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 479 | `.cal-arrow` |  |
| 487 | `.cal-arrow svg` |  |
| 490 | `.cal-arrow.js-prev svg` |  |
| 491 | `.cal-arrow:active` |  |
| 493 | `.cal-arrow:hover` | @media (hover: hover) |
| 497 | `.cal-more` |  |
| 505 | `.cal-more[aria-expanded="true"]` |  |
| 506 | `.cal-more:hover` | @media (hover: hover) |
| 560 | `.cal-wk-track` |  |
| 561 | `.cal-wk-track > *` |  |
| 564 | `.cal-wk-page` |  |
| 570 | `.cal-wk-page.is-void` |  |
| 600 | `.cal.is-peek.is-week .cal-pad.is-off-week` |  |
| 603 | `.cal.is-settling .cal-clip, .cal.is-settling .cal-slide, .cal.is-settling .cal-wds, .cal.…` | @media (prefers-reduced-motion: reduce) |
| 777 | `.cal-bar i.is-ok` |  |
| 878 | `.todo-group.is-drop-target` |  |
| 892 | `.tile-repeat` |  |
| 954 | `.item.is-checked .todo-mark` |  |
| 957 | `.item.todo.is-tile .todo-mark` |  |
| 963 | `.item.todo.is-tile .todo-mark .p-icon` |  |
| 964 | `.item.todo.is-tile .todo-dot` |  |
| 982 | `.item.todo:not(.is-tile).is-checked .todo-lead` |  |
| 986 | `.item.todo:not(.is-tile).is-checked .todo-mark` |  |
| 987 | `.item.todo:not(.is-tile).is-checked .todo-mark .p-icon` |  |
| 990 | `.item.todo:not(.is-tile).is-checked .todo-tag` |  |
| 991 | `.item.todo:not(.is-tile).is-checked .item-meta` |  |
| 1030 | `.item.todo:not(.is-tile) .item-memo` |  |
| 1045 | `.todo-at` |  |
| 1078 | `.time-row .chip` |  |
| 1082 | `.todo-tag` |  |
| 1092 | `.tile-when` |  |
| 1101 | `.link-btn` |  |
| 1158 | `.is-armed .swipe-yes > *, .is-armed .swipe-arch > *` |  |
| 1160 | `.is-swiping.is-right .swipe-yes` |  |
| 1161 | `.is-swiping.is-left .swipe-arch` |  |
| 1166 | `.is-swiping.is-right .item, .is-swiping.is-right .product` |  |
| 1170 | `.is-swiping.is-left .item, .is-swiping.is-left .product` |  |
| 1178 | `.is-tile-wrap .swipe-yes span, .is-tile-wrap .swipe-arch span` |  |
| 1180 | `.is-tile-wrap .swipe-yes` |  |
| 1181 | `.is-tile-wrap .swipe-arch` |  |
| 1195 | `.item-list.is-tiles, .product-list.is-tiles` |  |
| 1202 | `.item.is-tile, .product.is-tile` |  |
| 1211 | `.item.is-tile .item-body, .product.is-tile .product-main` |  |
| 1225 | `.item.is-tile .item-emoji, .product.is-tile .product-emoji` |  |
| 1239 | `.item.is-tile .item-name, .product.is-tile .product-name` |  |
| 1255 | `.tile-price` |  |
| 1265 | `.tile-store` |  |
| 1278 | `.product.is-tile .product-name` |  |
| 1279 | `.item.is-tile .item-qty` |  |
| 1289 | `.item.is-tile::before, .product.is-tile.is-listed::before` |  |
| 1300 | `.product.is-tile.is-listed::before` |  |
| 1305 | `.item.is-tile .check, .item.is-tile .fav` |  |
| 1316 | `.item.is-tile .item-body` |  |
| 1318 | `.item.is-tile .check` |  |
| 1319 | `.item.is-tile .fav` |  |
| 1320 | `.item.is-tile .check` |  |
| 1321 | `.item.is-tile .check svg` |  |
| 1322 | `.item.is-tile .fav svg` |  |
| 1326 | `.item.is-tile.is-checked` |  |
| 1328 | `.item-wrap:has(.is-tile)` |  |
| 1436 | `.check[aria-checked="true"] .check-repeat` |  |
| 1438 | `.check.is-repeat:hover .check-repeat svg` | @media (hover: hover) |
| 1467 | `.insights` |  |
| 1475 | `.insights-head` |  |
| 1484 | `.insights-head svg` |  |
| 1486 | `.insights-list` |  |
| 1488 | `.insight` |  |
| 1492 | `.insight-ico` |  |
| 1493 | `.insight-ico.is-warn` |  |
| 1494 | `.insight-ico.is-good` |  |
| 1495 | `.insight-ico.is-note` |  |
| 1496 | `.insight-ico.is-mute` |  |
| 1497 | `.insight-main` |  |
| 1498 | `.insight-title` |  |
| 1499 | `.insight-body` |  |
| 1592 | `.tile-when` |  |
| 1662 | `.done-head[aria-expanded="true"] svg` |  |
| 1731 | `.archive` |  |
| 1733 | `.archive-head` |  |
| 1745 | `.archive-head svg` |  |
| 1751 | `.archive.is-open .archive-head svg` |  |
| 1752 | `.archive-body` |  |
| 1756 | `.archive .product` |  |
| 1762 | `.archive .product-name` |  |
| 1763 | `.archive .product-emoji` |  |
| 1764 | `.archive .product::before` |  |
| 1765 | `.archive .item-price-amount, .archive .tile-price` |  |
| 1767 | `.archive .product-list` |  |
| 1792 | `.product-wrap.is-swiping .product` |  |
| 1794 | `.product:hover` | @media (hover: hover) |
| 1864 | `.price-main:active` |  |
| 1874 | `.price-unit` |  |
| 1891 | `.cmp` |  |
| 1892 | `.cmp b` |  |
| 1893 | `.cmp .cmp-good` |  |
| 1894 | `.cmp .cmp-bad` |  |
| 1896 | `.log-row` |  |
| 1904 | `.log-row.is-current` |  |
| 1905 | `.log-date` |  |
| 1906 | `.log-price` |  |
| 1907 | `.log-unit` |  |
| 1908 | `.log-tag` |  |
| 1960 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 2129 | `.set-head.is-flush` |  |
| 2303 | `#screen-settings .section-title` |  |
| 2308 | `#screen-settings .manage-row` |  |
| 2316 | `#screen-settings .manage-row + .manage-row` |  |
| 2317 | `#screen-settings .manage-name` |  |
| 2318 | `#screen-settings .set-row.is-add` |  |
| 2319 | `#screen-settings .set-row.is-add .set-glyph` |  |
| 2321 | `.set-glyph.is-plain` |  |
| 2322 | `.set-empty` |  |
| 2353 | `.manage-row` |  |
| 2356 | `.manage-swatch` |  |
| 2364 | `.manage-name` |  |
| 2367 | `.swatches` |  |
| 2368 | `.swatch` |  |
| 2375 | `.swatch:hover` | @media (hover: hover) |
| 2377 | `.swatch[aria-pressed="true"]` |  |
| 2390 | `.calc-out` |  |
| 2401 | `.calc-out.is-idle` |  |
| 2570 | `.diet-hero-cond` |  |
| 2586 | `.diet-stat-value.is-warn` |  |
| 2596 | `.diet-note.is-warn` |  |
| 2599 | `.diet-ai-note` |  |
| 2620 | `.diet-goal-line` |  |
| 2621 | `.diet-goal-tag` |  |
| 2623 | `.diet-goal-tag.is-off` |  |
| 2632 | `.diet-goal-glow` |  |
| 2637 | `.diet-ma14` |  |
| 2647 | `.diet-dot.is-health` |  |
| 2655 | `.diet-bar` |  |
| 2656 | `.diet-axis.is-right` |  |
| 2659 | `.diet-beer-mug` |  |
| 2660 | `.diet-beer-hit` |  |
| 2661 | `.diet-beer` |  |
| 2705 | `.diet-legend-item i.dot-bar` |  |
| 2710 | `.diet-legend-item i.dot-ma14` |  |
| 2723 | `.ta-clear svg` |  |
| 2724 | `.ta-clear:active` |  |
| 2855 | `.is-m-arrive .diet-bar` |  |
| 2887 | `button.section-note:active` |  |
| 2894 | `.diet-look .row, .diet-look .diet-finding` |  |
| 2936 | `.diet-mood` |  |
| 2950 | `.urge-form` |  |
| 2951 | `.urge-rest` |  |
| 2954 | `.urge-top` |  |
| 2958 | `.urge-top-day` |  |
| 2960 | `.urge-since` |  |
| 2964 | `.urge-since svg` |  |
| 2968 | `.urge-sec` |  |
| 2969 | `.urge-sec-head` |  |
| 2970 | `.urge-sec-ico` |  |
| 2971 | `.urge-sec-ico svg` |  |
| 2972 | `.urge-sec-title` |  |
| 2975 | `.urge-sec-opt` |  |
| 2980 | `.urge-sec-note` |  |
| 2984 | `.urge-sec-body` |  |
| 2986 | `.urge-sec .diet-chips` |  |
| 2987 | `.urge-words` |  |
| 2992 | `.urge-scale` |  |
| 2993 | `.urge-lv` |  |
| 3005 | `.urge-lv:active` |  |
| 3011 | `.urge-lv.is-on` |  |
| 3017 | `.urge-ends` |  |
| 3027 | `.urge-more` |  |
| 3037 | `.urge-more:active` |  |
| 3038 | `.urge-more.is-open` |  |
| 3039 | `.urge-more-c` |  |
| 3040 | `.urge-more-c svg` |  |
| 3041 | `.urge-more.is-open .urge-more-c` |  |
| 3048 | `.urge-rows` |  |
| 3049 | `.urge-row` |  |
| 3055 | `.urge-rows .urge-row:first-child` |  |
| 3056 | `.urge-row:active` |  |
| 3057 | `.urge-row-time` |  |
| 3059 | `.urge-row-lv` |  |
| 3063 | `.urge-row-lv i` |  |
| 3064 | `.urge-row-text` |  |
| 3073 | `.urge-row-open` |  |
| 3074 | `.urge-row-go` |  |
| 3075 | `.urge-row-go svg` |  |
| 3077 | `.diet-workouts` |  |
| 3085 | `.diet-kcal-rem` |  |
| 3086 | `.diet-kcal-rem b` |  |
| 3087 | `.diet-kcal-rem.is-over b` |  |
| 3088 | `.diet-kcal-target` |  |
| 3099 | `.diet-pfc-num small` |  |
| 3100 | `.diet-pfc-num.is-over b` |  |
| 3101 | `.diet-pfc-ratio` |  |
| 3121 | `.diet-stack i.is-snack` |  |
| 3122 | `.diet-stack i.is-other` |  |
| 3123 | `.diet-stack i.is-drink` |  |
| 3156 | `.diet-stack-key i.is-snack` |  |
| 3157 | `.diet-stack-key i.is-other` |  |
| 3158 | `.diet-stack-key i.is-drink` |  |
| 3159 | `.diet-stack-key i.is-rest` |  |
| 3245 | `.diet-memo.is-blank .diet-memo-body` |  |
| 3250 | `.diet-total` |  |
| 3254 | `.diet-total b` |  |
| 3255 | `.diet-total small` |  |
| 3256 | `.diet-total span` |  |
| 3257 | `.diet-items .row-title` |  |
| 3258 | `.diet-suggest` |  |
| 3262 | `.diet-findings` |  |
| 3263 | `.diet-finding` |  |
| 3268 | `.diet-finding-text` |  |
| 3271 | `.diet-finding-ico` |  |
| 3272 | `.diet-finding-ico svg` |  |
| 3273 | `.diet-finding.is-good` |  |
| 3274 | `.diet-finding.is-good .diet-finding-ico` |  |
| 3275 | `.diet-finding.is-warn` |  |
| 3276 | `.diet-finding.is-warn .diet-finding-ico` |  |
| 3277 | `.diet-finding b` |  |
| 3278 | `.diet-finding p` |  |
| 3296 | `.diet-code` |  |
| 3302 | `.diet-suggest-box` |  |
| 3314 | `.diet-read-row` |  |
| 3315 | `.diet-read-name` |  |
| 3316 | `.diet-read-row b` |  |
| 3317 | `.diet-read-day` |  |
| 3319 | `.diet-keys` |  |
| 3322 | `.diet-key` |  |
| 3326 | `.diet-key code` |  |
| 3327 | `.diet-key-name` |  |
| 3328 | `.diet-key-ex` |  |
| 3344 | `.date-row` |  |
| 3345 | `.date-cell` |  |
| 3346 | `.date-cell .input` |  |
| 3349 | `.date-empty` |  |
| 3363 | `.diet-steps a, .diet-note a` |  |
| 3381 | `.diet-note code, .diet-steps code, .diet-key code` |  |
| 3392 | `.diet-cell:active` |  |
| 3407 | `.diet-daynav .js-today` |  |
| 3408 | `.diet-daynav .icon-btn[disabled]` |  |
| 3410 | `.diet-edit` |  |
| 3411 | `.diet-edit-row` |  |
| 3415 | `.diet-edit-name` |  |
| 3416 | `.diet-edit-unit` |  |
| 3417 | `.diet-edit-src` |  |
| 3422 | `.diet-got` |  |
| 3427 | `.diet-got-head` |  |
| 3428 | `.diet-got pre` |  |
| 3434 | `.diet-why summary` |  |
| 3438 | `.diet-why[open] summary` |  |
| 3469 | `.arc-then:active` |  |
| 3503 | `.arc-then-more` |  |
| 3506 | `.arc-then.is-years:active` |  |
| 3514 | `.arc-year:active` |  |
| 3525 | `.arc-year-text.is-blank` |  |
| 3557 | `.arc-log-empty` |  |
| 3633 | `.arc-sort:active` |  |
| 3656 | `.arc-memo.is-clamped` |  |
| 3725 | `.arc-quiet .field-hint[hidden]` |  |
| 3832 | `.add-fab.is-open:active` |  |
| 3844 | `.item.is-glow` |  |
| 3858 | `.item.is-finishing` |  |
| 3868 | `.item.is-sliding` |  |
| 3879 | `.item.is-dropping` |  |
| 3904 | `.item.is-glow, .item.is-finishing, .item.is-sliding, .item.is-dropping, .is-arriving` | @media (prefers-reduced-motion: reduce) |
| 3938 | `.trip.todo-today.is-tl` |  |
| 3945 | `.trip.todo-today.is-tl .todo-head` |  |
| 3956 | `.tl-sum.is-back` |  |
| 4268 | `.tl-node .todo-mark svg` |  |
| 4368 | `.tl-cap` |  |
| 4434 | `.tl-subs-chip:active` |  |
| 4520 | `.tl:has(.tl-list.is-dragging) .tl-axis` |  |
| 4657 | `.tl-grip[role="button"]:focus-visible` |  |
| 4726 | `.cal-day.is-drop` |  |
| 4830 | `.tl-node.is-unpop` |  |
| 4836 | `.tl-item.is-unstriking .item-name, .item.is-unstriking .item-name` |  |
| 4852 | `.todo-group.is-tl .todo-head` |  |
| 4985 | `.product-wrap:not(.is-tile-wrap) .product:hover` | @media (hover: hover) |
| 5064 | `.arc-stack > .chip-row` |  |
| 5299 | `.note-pick` |  |
| 5300 | `.note-name-in` |  |
| 5332 | `.notes-off` |  |
| 5342 | `.notes-trash .note-row` |  |
| 5454 | `.nv-blank` |  |
| 5462 | `.nv-dot, .nv-n` |  |
| 5463 | `.nv-dot::before` |  |
| 5464 | `.nv-n` |  |
| 5482 | `.nv-q` |  |
| 5550 | `.note-pop.is-grow` |  |
| 5555 | `.note-pop.is-grow.is-open` |  |
| 5584 | `.pop-cal-day[aria-pressed="true"]` |  |
| 5613 | `.note-wheel::-webkit-scrollbar` |  |
| 5625 | `.sub-check` |  |
| 5630 | `.sub-check svg` |  |
| 5631 | `.sub-check.is-on` |  |
| 5642 | `.tw-input::-webkit-date-and-time-value` |  |
| 5668 | `.note-pop-sub` |  |
| 5678 | `.notes-versions` |  |
| 5679 | `.note-read` |  |
| 5691 | `.diet-found-n` |  |
| 5752 | `.tl-row .check.is-trace` |  |
| 5759 | `.tl-row .check.is-trace svg` |  |
| 5784 | `.tl-row.is-lifted` |  |
| 5791 | `.tl-list.is-dragging` |  |
| 5796 | `.tl-list.is-dragging .tl-row` |  |
| 5799 | `.tl-row.is-aim` |  |
| 5800 | `.tl-row.is-aim::before` |  |
| 5809 | `.tl-row.is-aim.is-aim-before::before` |  |
| 5821 | `.tl-aim` |  |
| 5830 | `.tl-aim-line` |  |
| 5842 | `.tl-aim.is-on .tl-aim-line` |  |
| 5849 | `.tl-ghost` |  |
| 5876 | `.tl-ghost-mark` |  |
| 5883 | `.tl-ghost-mark .todo-mark` |  |
| 5888 | `.tl-ghost-mark .todo-mark.is-split` |  |
| 5893 | `.tl-ghost-body` |  |
| 5894 | `.tl-ghost-when` |  |
| 5895 | `.tl-ghost-title` |  |
| 5906 | `.dock.is-trash .add-fab` |  |
| 5907 | `.tl-trash` |  |
| 5919 | `.tl-trash svg` |  |
| 5921 | `.tl-trash.is-armed` |  |
| 5923 | `.tl-ghost` | @media (prefers-reduced-motion: reduce) |
| 5932 | `.tl-aim-line .tl-band-time` |  |
| 5944 | `.tl-aim-line.is-under .tl-band-time` |  |
| 5951 | `.tl-someday-sec.is-aim` |  |
| 5957 | `.tl-band-time` |  |
| 5989 | `.trip-plan-btn.is-on` |  |
| 6035 | `:root:not([data-theme="light"]) .low-add` | @media (prefers-color-scheme: dark) |
| 6037 | `:root[data-theme="dark"] .low-add` |  |
| 6040 | `.tl-shop` |  |
| 6173 | `.sub-line` |  |
| 6174 | `.sub-line .input` |  |
| 6183 | `.sub-grip` |  |
| 6195 | `.sub-grip svg` |  |
| 6196 | `.sub-line.reorder-lift .sub-grip` |  |
| 6200 | `.sub-line.reorder-lift` |  |
| 6349 | `.accent-name` |  |
| 6353 | `.accent-dot.is-on .accent-name` |  |
| 6423 | `.tl-due.is-over` |  |
| 6493 | `.topbar-row` | @media (max-width: 374px) |
| 6522 | `.sa-jump` |  |
| 6523 | `.sa-more-note, .sa-note` |  |
| 6690 | `.road-label em` |  |
| 6741 | `.day-road.is-carry-out .road-hollow` |  |
| 6747 | `.road-bead.is-someday:not(.road-ghost)` | @media (prefers-reduced-motion: reduce) |
| 6802 | `.road-decide-none` |  |
