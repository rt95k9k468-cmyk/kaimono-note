# 使われていない CSS の候補表

`tools/css-unused.js` が作る（docs/roadmap-2.0.md の V3）。2026-10-04、全試験（notes-settings は揺れて途中まで）の `open()` 75回ぶんの当たりを足した。
**当たらない＝要らない、ではない**（試験が通らない状態・iOS だけの `@supports`・動きを減らす設定・
ぼかしの効かない受け皿など）。消すのは V25 で、一つずつ試験つき。手で書き足さない——作り直すと消える。

| ファイル | 規則 | 当たらない |
|---|---|---|
| base.css | 164 | 44 |
| components.css | 345 | 114 |
| screens.css | 1393 | 451 |

## base.css（44）

| 行 | 規則 | 中 |
|---|---|---|
| 615 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 767 | `:root` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 772 | `.toast` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 783 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 793 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 1076 | `.screen.is-under` |  |
| 1081 | `.screen.is-over` |  |
| 1278 | `.screen::-webkit-scrollbar` |  |
| 1279 | `.screen::-webkit-scrollbar-thumb` |  |
| 1317 | `.topbar.is-stuck` |  |
| 1343 | `.topbar-sub` |  |
| 1708 | `.tab-face` |  |
| 1709 | `.tab-face:not(.is-on)` |  |
| 1714 | `.tab[aria-selected="true"] .tab-face.is-on` |  |
| 1733 | `.app, #sheet-root, .toast-root` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1735 | `.rotate-note` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1748 | `.rotate-note svg` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1749 | `.rotate-note b` | @media (orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) |
| 1809 | `.tab-flip` |  |
| 1817 | `.tab[aria-selected="true"] .tab-flip` |  |
| 1818 | `.tab-flip i` |  |
| 1825 | `.tab-flip i.is-on` |  |
| 1838 | `.tab.is-pair .tab-ico-face:not(.is-on) svg` |  |
| 2079 | `:root[data-accent="green"]` |  |
| 2090 | `:root[data-accent="blue"]` |  |
| 2101 | `:root[data-accent="violet"]` |  |
| 2112 | `:root[data-accent="rose"]` |  |
| 2123 | `:root[data-accent="mustard"]` |  |
| 2134 | `:root[data-accent="sky"]` |  |
| 2145 | `:root[data-accent="apricot"]` |  |
| 2162 | `:root:not([data-theme="light"])[data-accent="green"], :root[data-theme="dark"][data-accen…` | @media (prefers-color-scheme: dark) |
| 2168 | `:root:not([data-theme="light"])[data-accent="blue"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2174 | `:root:not([data-theme="light"])[data-accent="violet"], :root[data-theme="dark"][data-acce…` | @media (prefers-color-scheme: dark) |
| 2180 | `:root:not([data-theme="light"])[data-accent="rose"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2186 | `:root:not([data-theme="light"])[data-accent="mustard"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2192 | `:root:not([data-theme="light"])[data-accent="sky"], :root[data-theme="dark"][data-accent=…` | @media (prefers-color-scheme: dark) |
| 2198 | `:root:not([data-theme="light"])[data-accent="apricot"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2206 | `:root[data-theme="dark"][data-accent="green"]` |  |
| 2211 | `:root[data-theme="dark"][data-accent="blue"]` |  |
| 2216 | `:root[data-theme="dark"][data-accent="violet"]` |  |
| 2221 | `:root[data-theme="dark"][data-accent="rose"]` |  |
| 2226 | `:root[data-theme="dark"][data-accent="mustard"]` |  |
| 2231 | `:root[data-theme="dark"][data-accent="sky"]` |  |
| 2236 | `:root[data-theme="dark"][data-accent="apricot"]` |  |

## components.css（114）

| 行 | 規則 | 中 |
|---|---|---|
| 100 | `[data-icons="phosphor"] .ui-ico[data-ico-mode="stroke"].is-sub` |  |
| 105 | `.ui-ico.is-solid .ico-line` |  |
| 106 | `.ui-ico.is-solid .ico-solid` |  |
| 127 | `.is-there .swipe-yes .ui-ico .ico-line` |  |
| 128 | `.is-there .swipe-yes .ui-ico .ico-solid` |  |
| 171 | `.btn-ghost:hover` | @media (hover: hover) |
| 225 | `.icon-btn.is-danger:hover` | @media (hover: hover) |
| 260 | `.memo` |  |
| 271 | `.memo-text` |  |
| 282 | `.memo-text.is-empty` |  |
| 284 | `.memo .icon-btn` |  |
| 286 | `.memo-input` |  |
| 299 | `.select` |  |
| 308 | `.input-group` |  |
| 309 | `.input-group > *` |  |
| 332 | `.fav-toggle.is-on` |  |
| 336 | `.fav-toggle.is-on .icon-pick-mark svg` |  |
| 346 | `.icon-pick-mark .p-icon` |  |
| 351 | `.icon-pick-sub:empty` |  |
| 372 | `.icon-report-toggle.is-on` |  |
| 398 | `.icon-cell:active` |  |
| 399 | `.icon-cell.is-on` |  |
| 440 | `.stepper-btn:active` |  |
| 483 | `.input[type="date"]::-webkit-date-and-time-value, .input[type="time"]::-webkit-date-and-t…` |  |
| 523 | `.chip-row::-webkit-scrollbar` |  |
| 542 | `.sheet .chip-row.js-days, .note-pop.is-form .chip-row.js-days` |  |
| 547 | `.sheet .chip-row.js-days .chip, .note-pop.is-form .chip-row.js-days .chip` |  |
| 552 | `.sheet .time-grid .chip-row` |  |
| 557 | `.sheet .time-grid .chip` |  |
| 564 | `.time-nudge` |  |
| 578 | `.time-nudge:active` |  |
| 579 | `.time-nudge:disabled` |  |
| 682 | `.section-hint` |  |
| 703 | `.badge-best` |  |
| 706 | `.badge-store` |  |
| 708 | `.dot` |  |
| 764 | `.empty.is-quiet .empty-text` |  |
| 916 | `.sheet-bloom` | @media (prefers-reduced-motion: reduce) |
| 1096 | `.hero-fact.is-fav` |  |
| 1097 | `.hero-fact.is-subs i` |  |
| 1158 | `.d-row:disabled` |  |
| 1191 | `.d-add:active` |  |
| 1220 | `.d-memo:focus` |  |
| 1232 | `.act-ico svg` |  |
| 1236 | `.act-row.is-danger .act-ico, .act-row.is-danger .act-label` |  |
| 1241 | `.due-list` |  |
| 1242 | `.due-row` |  |
| 1243 | `.due-row + .due-row` |  |
| 1244 | `.due-head` |  |
| 1245 | `.due-time` |  |
| 1246 | `.due-title` |  |
| 1247 | `.due-acts` |  |
| 1248 | `.due-acts > .btn:only-child` |  |
| 1249 | `.due-acts > .btn` |  |
| 1250 | `.due-later` |  |
| 1251 | `.due-later[hidden]` |  |
| 1252 | `.due-later > .btn` |  |
| 1253 | `.due-note` |  |
| 1254 | `.due-open` |  |
| 1261 | `.carry-row + .carry-row` |  |
| 1279 | `.stack > .set-more` |  |
| 1287 | `.set-more > summary::-webkit-details-marker` |  |
| 1293 | `.set-more[open] > summary::after` |  |
| 1294 | `.set-more > p, .set-more > ol, .set-more > pre` |  |
| 1296 | `.set-more > .set-card` |  |
| 1352 | `.sheet-mark` |  |
| 1368 | `.is-reordering` |  |
| 1372 | `.is-reordering > *` |  |
| 1383 | `.is-reordering > .reorder-ghost` |  |
| 1392 | `.is-reordering > .reorder-ghost.is-going` |  |
| 1397 | `.reorder-lift` |  |
| 1409 | `.reorder-drop` |  |
| 1539 | `.rows` |  |
| 1546 | `.row` |  |
| 1558 | `.row:last-child` |  |
| 1560 | `.row:hover` | @media (hover: hover) |
| 1564 | `.row-main` |  |
| 1565 | `.row-title` |  |
| 1566 | `.row-sub` |  |
| 1567 | `.row-value` |  |
| 1568 | `.row-chevron` |  |
| 1569 | `.row-chevron svg` |  |
| 1622 | `:root:not([data-theme="light"]) .toggle` | @media (prefers-color-scheme: dark) |
| 1627 | `.toggle, .toggle-knob, .toggle-mark` | @media (prefers-reduced-motion: reduce) |
| 1632 | `.divider` |  |
| 1634 | `.spread` |  |
| 1653 | `.keypad` |  |
| 1680 | `.keypad.is-open` |  |
| 1682 | `.keypad-grid` |  |
| 1688 | `.keypad-actions` |  |
| 1698 | `.key` |  |
| 1716 | `.key::after` |  |
| 1721 | `.key:active` |  |
| 1723 | `.key-op` |  |
| 1728 | `.key-tax` |  |
| 1734 | `.key-tax-cap` |  |
| 1735 | `.key-tax-rate` |  |
| 1740 | `.key-off` |  |
| 1746 | `.key-off-cap` |  |
| 1747 | `.key-off-main` |  |
| 1752 | `.key-ok` |  |
| 1758 | `.key-ok.is-equals` |  |
| 1759 | `.key-ok:active` |  |
| 1762 | `.key-back svg` |  |
| 1775 | `.is-m-press` |  |
| 1797 | `.is-m-add` |  |
| 1805 | `.is-m-delete` |  |
| 1824 | `.is-m-success` |  |
| 1837 | `.row-times` |  |
| 1838 | `.row-times .input` |  |
| 1839 | `.row-dash` |  |
| 1840 | `.row.js-day-span` |  |
| 1857 | `.dest-chip:active` |  |
| 1953 | `.lock-key.is-bio[hidden]` |  |

## screens.css（451）

| 行 | 規則 | 中 |
|---|---|---|
| 93 | `:root:not([data-theme="light"]) .add-fab` | @media (prefers-color-scheme: dark) |
| 124 | `.ac` |  |
| 137 | `.ac-item` |  |
| 146 | `.ac-item:last-child` |  |
| 147 | `.ac-item.is-active` |  |
| 151 | `.ac-item:hover` | @media (hover: hover) |
| 153 | `.ac-emoji` |  |
| 154 | `.ac-new-mark` |  |
| 156 | `.ac-new-mark svg` |  |
| 158 | `.ac-main` |  |
| 159 | `.ac-name` |  |
| 160 | `.ac-sub` |  |
| 167 | `.ac-new` |  |
| 170 | `.progress-wrap` |  |
| 171 | `.progress` |  |
| 177 | `.progress-bar` |  |
| 246 | `.item-emoji:empty` |  |
| 264 | `.item-wrap.is-swiping .item` |  |
| 303 | `.cal.is-stuck` |  |
| 365 | `.tab-title` |  |
| 426 | `.topbar-title .roll > .roll-in, .topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 428 | `.topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 472 | `.cal-head` |  |
| 482 | `.cal-nav` |  |
| 483 | `.cal-arrow` |  |
| 491 | `.cal-arrow svg` |  |
| 494 | `.cal-arrow.js-prev svg` |  |
| 495 | `.cal-arrow:active` |  |
| 497 | `.cal-arrow:hover` | @media (hover: hover) |
| 501 | `.cal-more` |  |
| 509 | `.cal-more[aria-expanded="true"]` |  |
| 510 | `.cal-more:hover` | @media (hover: hover) |
| 564 | `.cal-wk-track` |  |
| 565 | `.cal-wk-track > *` |  |
| 568 | `.cal-wk-page` |  |
| 574 | `.cal-wk-page.is-void` |  |
| 604 | `.cal.is-peek.is-week .cal-pad.is-off-week` |  |
| 607 | `.cal.is-settling .cal-clip, .cal.is-settling .cal-slide, .cal.is-settling .cal-wds, .cal.…` | @media (prefers-reduced-motion: reduce) |
| 781 | `.cal-bar i.is-ok` |  |
| 797 | `.item-wrap.is-flash .item` |  |
| 800 | `.item-wrap.is-flash .item` | @media (prefers-reduced-motion: reduce) |
| 821 | `.todo-head.is-late` |  |
| 822 | `.todo-head.is-late .cat-head-count` |  |
| 845 | `.tl-sheet > .todo-group` |  |
| 846 | `.tl-sheet > .todo-group > .todo-head` |  |
| 851 | `.tl-sheet > .todo-group:not(.is-empty) > .todo-head` |  |
| 854 | `.tl-sheet > .todo-group > .item-list` |  |
| 863 | `.todo-today .item-list` |  |
| 882 | `.todo-group.is-drop-target` |  |
| 889 | `.item-when.is-late` |  |
| 896 | `.todo-repeat, .tile-repeat` |  |
| 958 | `.item.is-checked .todo-mark` |  |
| 961 | `.item.todo.is-tile .todo-mark` |  |
| 967 | `.item.todo.is-tile .todo-mark .p-icon` |  |
| 968 | `.item.todo.is-tile .todo-dot` |  |
| 986 | `.item.todo:not(.is-tile).is-checked .todo-lead` |  |
| 990 | `.item.todo:not(.is-tile).is-checked .todo-mark` |  |
| 991 | `.item.todo:not(.is-tile).is-checked .todo-mark .p-icon` |  |
| 994 | `.item.todo:not(.is-tile).is-checked .todo-tag` |  |
| 995 | `.item.todo:not(.is-tile).is-checked .item-meta` |  |
| 1024 | `.item.todo:not(.is-tile) .item-meta` |  |
| 1034 | `.item.todo:not(.is-tile) .item-memo` |  |
| 1043 | `.item.todo:not(.is-tile) .item-when, .item.todo:not(.is-tile) .todo-tag` |  |
| 1049 | `.todo-at` |  |
| 1063 | `.todo-every` |  |
| 1082 | `.time-row .chip` |  |
| 1087 | `.todo-part` |  |
| 1097 | `.todo-tag` |  |
| 1107 | `.tile-when` |  |
| 1116 | `.link-btn` |  |
| 1173 | `.is-armed .swipe-yes > *, .is-armed .swipe-arch > *` |  |
| 1175 | `.is-swiping.is-right .swipe-yes` |  |
| 1176 | `.is-swiping.is-left .swipe-arch` |  |
| 1181 | `.is-swiping.is-right .item, .is-swiping.is-right .product` |  |
| 1185 | `.is-swiping.is-left .item, .is-swiping.is-left .product` |  |
| 1193 | `.is-tile-wrap .swipe-yes span, .is-tile-wrap .swipe-arch span` |  |
| 1195 | `.is-tile-wrap .swipe-yes` |  |
| 1196 | `.is-tile-wrap .swipe-arch` |  |
| 1210 | `.item-list.is-tiles, .product-list.is-tiles` |  |
| 1217 | `.item.is-tile, .product.is-tile` |  |
| 1226 | `.item.is-tile .item-body, .product.is-tile .product-main` |  |
| 1240 | `.item.is-tile .item-emoji, .product.is-tile .product-emoji` |  |
| 1254 | `.item.is-tile .item-name, .product.is-tile .product-name` |  |
| 1270 | `.tile-price` |  |
| 1280 | `.tile-store` |  |
| 1293 | `.product.is-tile .product-name` |  |
| 1294 | `.item.is-tile .item-qty` |  |
| 1304 | `.item.is-tile::before, .product.is-tile.is-listed::before` |  |
| 1315 | `.product.is-tile.is-listed::before` |  |
| 1320 | `.item.is-tile .check, .item.is-tile .fav` |  |
| 1331 | `.item.is-tile .item-body` |  |
| 1333 | `.item.is-tile .check` |  |
| 1334 | `.item.is-tile .fav` |  |
| 1335 | `.item.is-tile .check` |  |
| 1336 | `.item.is-tile .check svg` |  |
| 1337 | `.item.is-tile .fav svg` |  |
| 1341 | `.item.is-tile.is-checked` |  |
| 1343 | `.item-wrap:has(.is-tile)` |  |
| 1451 | `.check[aria-checked="true"] .check-repeat` |  |
| 1453 | `.check.is-repeat:hover .check-repeat svg` | @media (hover: hover) |
| 1482 | `.insights` |  |
| 1490 | `.insights-head` |  |
| 1499 | `.insights-head svg` |  |
| 1501 | `.insights-list` |  |
| 1503 | `.insight` |  |
| 1507 | `.insight-ico` |  |
| 1508 | `.insight-ico.is-warn` |  |
| 1509 | `.insight-ico.is-good` |  |
| 1510 | `.insight-ico.is-note` |  |
| 1511 | `.insight-ico.is-mute` |  |
| 1512 | `.insight-main` |  |
| 1513 | `.insight-title` |  |
| 1514 | `.insight-body` |  |
| 1527 | `.trip-head-rest` |  |
| 1607 | `.tile-when` |  |
| 1677 | `.done-head[aria-expanded="true"] svg` |  |
| 1713 | `.summary-label` |  |
| 1714 | `.summary-total` |  |
| 1751 | `.archive` |  |
| 1753 | `.archive-head` |  |
| 1765 | `.archive-head svg` |  |
| 1771 | `.archive.is-open .archive-head svg` |  |
| 1772 | `.archive-body` |  |
| 1776 | `.archive .product` |  |
| 1782 | `.archive .product-name` |  |
| 1783 | `.archive .product-emoji` |  |
| 1784 | `.archive .product::before` |  |
| 1785 | `.archive .item-price-amount, .archive .tile-price` |  |
| 1787 | `.archive .product-list` |  |
| 1812 | `.product-wrap.is-swiping .product` |  |
| 1814 | `.product:hover` | @media (hover: hover) |
| 1855 | `.price-list` |  |
| 1857 | `.price-row` |  |
| 1868 | `.price-row.is-best` |  |
| 1875 | `.price-main` |  |
| 1884 | `.price-main:active` |  |
| 1885 | `.price-chevron` |  |
| 1886 | `.price-chevron svg` |  |
| 1888 | `.price-store-wrap` |  |
| 1889 | `.price-store` |  |
| 1891 | `.price-figures` |  |
| 1892 | `.price-amount` |  |
| 1893 | `.is-best .price-amount` |  |
| 1894 | `.price-unit` |  |
| 1895 | `.price-date` |  |
| 1911 | `.cmp` |  |
| 1912 | `.cmp b` |  |
| 1913 | `.cmp .cmp-good` |  |
| 1914 | `.cmp .cmp-bad` |  |
| 1916 | `.log-row` |  |
| 1924 | `.log-row.is-current` |  |
| 1925 | `.log-date` |  |
| 1926 | `.log-price` |  |
| 1927 | `.log-unit` |  |
| 1928 | `.log-tag` |  |
| 1931 | `.spark` |  |
| 1932 | `.spark-line` |  |
| 1933 | `.spark-area` |  |
| 1934 | `.spark-dot` |  |
| 1981 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 2057 | `.set-layer.is-sheetish .set-choose` |  |
| 2150 | `.set-head.is-flush` |  |
| 2292 | `.set-choose` |  |
| 2297 | `.set-choose .set-row` |  |
| 2298 | `.set-choose .set-row + .set-row::before` |  |
| 2299 | `.set-check` |  |
| 2300 | `.set-check svg` |  |
| 2316 | `#screen-settings .rows` |  |
| 2321 | `#screen-settings .row` |  |
| 2322 | `#screen-settings .section-title` |  |
| 2323 | `#screen-settings .section-hint` |  |
| 2328 | `#screen-settings .manage-row` |  |
| 2336 | `#screen-settings .manage-row + .manage-row` |  |
| 2337 | `#screen-settings .manage-name` |  |
| 2338 | `#screen-settings .set-row.is-add` |  |
| 2339 | `#screen-settings .set-row.is-add .set-glyph` |  |
| 2341 | `.set-glyph.is-plain` |  |
| 2342 | `.set-empty` |  |
| 2350 | `.seg` |  |
| 2360 | `.seg-btn` |  |
| 2369 | `.seg-btn[aria-pressed="true"]` |  |
| 2371 | `.about` |  |
| 2380 | `.about-mark` |  |
| 2381 | `.about-mark .empty-svg` |  |
| 2384 | `.manage-row` |  |
| 2387 | `.manage-swatch` |  |
| 2395 | `.manage-name` |  |
| 2398 | `.swatches` |  |
| 2399 | `.swatch` |  |
| 2406 | `.swatch:hover` | @media (hover: hover) |
| 2408 | `.swatch[aria-pressed="true"]` |  |
| 2415 | `.calc-row` |  |
| 2422 | `.calc-out` |  |
| 2433 | `.calc-out.is-idle` |  |
| 2580 | `.diet-hero-cond` |  |
| 2596 | `.diet-stat-value.is-good` |  |
| 2597 | `.diet-stat-value.is-warn` |  |
| 2607 | `.diet-note.is-warn` |  |
| 2610 | `.diet-ai-note` |  |
| 2631 | `.diet-goal-line` |  |
| 2632 | `.diet-goal-tag` |  |
| 2634 | `.diet-goal-tag.is-off` |  |
| 2643 | `.diet-goal-glow` |  |
| 2648 | `.diet-ma14` |  |
| 2658 | `.diet-dot.is-health` |  |
| 2666 | `.diet-bar` |  |
| 2667 | `.diet-axis.is-right` |  |
| 2670 | `.diet-beer-mug` |  |
| 2671 | `.diet-beer-hit` |  |
| 2672 | `.diet-beer` |  |
| 2716 | `.diet-legend-item i.dot-bar` |  |
| 2721 | `.diet-legend-item i.dot-ma14` |  |
| 2722 | `.diet-legend-item i.dot-goal` |  |
| 2735 | `.ta-clear svg` |  |
| 2736 | `.ta-clear:active` |  |
| 2867 | `.is-m-arrive .diet-bar` |  |
| 2899 | `button.section-note:active` |  |
| 2948 | `.diet-mood` |  |
| 2962 | `.urge-form` |  |
| 2963 | `.urge-rest` |  |
| 2966 | `.urge-top` |  |
| 2970 | `.urge-top-day` |  |
| 2972 | `.urge-since` |  |
| 2976 | `.urge-since svg` |  |
| 2980 | `.urge-sec` |  |
| 2981 | `.urge-sec-head` |  |
| 2982 | `.urge-sec-ico` |  |
| 2983 | `.urge-sec-ico svg` |  |
| 2984 | `.urge-sec-title` |  |
| 2987 | `.urge-sec-opt` |  |
| 2992 | `.urge-sec-note` |  |
| 2996 | `.urge-sec-body` |  |
| 2998 | `.urge-sec .diet-chips` |  |
| 2999 | `.urge-words` |  |
| 3004 | `.urge-scale` |  |
| 3005 | `.urge-lv` |  |
| 3017 | `.urge-lv:active` |  |
| 3023 | `.urge-lv.is-on` |  |
| 3029 | `.urge-ends` |  |
| 3039 | `.urge-more` |  |
| 3049 | `.urge-more:active` |  |
| 3050 | `.urge-more.is-open` |  |
| 3051 | `.urge-more-c` |  |
| 3052 | `.urge-more-c svg` |  |
| 3053 | `.urge-more.is-open .urge-more-c` |  |
| 3060 | `.urge-rows` |  |
| 3061 | `.urge-row` |  |
| 3067 | `.urge-rows .urge-row:first-child` |  |
| 3068 | `.urge-row:active` |  |
| 3069 | `.urge-row-time` |  |
| 3071 | `.urge-row-lv` |  |
| 3075 | `.urge-row-lv i` |  |
| 3076 | `.urge-row-text` |  |
| 3085 | `.urge-row-open` |  |
| 3086 | `.urge-row-go` |  |
| 3087 | `.urge-row-go svg` |  |
| 3089 | `.diet-workouts` |  |
| 3097 | `.diet-kcal-rem` |  |
| 3098 | `.diet-kcal-rem b` |  |
| 3099 | `.diet-kcal-rem.is-over b` |  |
| 3100 | `.diet-kcal-target` |  |
| 3111 | `.diet-pfc-num small` |  |
| 3112 | `.diet-pfc-num.is-over b` |  |
| 3113 | `.diet-pfc-ratio` |  |
| 3133 | `.diet-stack i.is-snack` |  |
| 3134 | `.diet-stack i.is-other` |  |
| 3168 | `.diet-stack-key i.is-snack` |  |
| 3169 | `.diet-stack-key i.is-other` |  |
| 3171 | `.diet-stack-key i.is-rest` |  |
| 3257 | `.diet-memo.is-blank .diet-memo-body` |  |
| 3261 | `.diet-old-meals` |  |
| 3263 | `.diet-total` |  |
| 3267 | `.diet-total b` |  |
| 3268 | `.diet-total small` |  |
| 3269 | `.diet-total span` |  |
| 3270 | `.diet-items .row-title` |  |
| 3271 | `.diet-suggest` |  |
| 3288 | `.diet-finding.is-warn` |  |
| 3289 | `.diet-finding.is-warn .diet-finding-ico` |  |
| 3309 | `.diet-code` |  |
| 3315 | `.diet-suggest-box` |  |
| 3327 | `.diet-read-row` |  |
| 3328 | `.diet-read-name` |  |
| 3329 | `.diet-read-row b` |  |
| 3330 | `.diet-read-day` |  |
| 3332 | `.diet-keys` |  |
| 3335 | `.diet-key` |  |
| 3339 | `.diet-key code` |  |
| 3340 | `.diet-key-name` |  |
| 3341 | `.diet-key-ex` |  |
| 3348 | `.todo-name-row` |  |
| 3349 | `.todo-name-row .input` |  |
| 3350 | `.todo-name-row .fav` |  |
| 3363 | `.date-row` |  |
| 3364 | `.date-cell` |  |
| 3365 | `.date-cell.is-time` |  |
| 3366 | `.date-cell .input` |  |
| 3369 | `.date-empty` |  |
| 3379 | `.date-cell.is-time .date-empty` |  |
| 3384 | `.diet-steps a, .diet-note a` |  |
| 3402 | `.diet-note code, .diet-steps code, .diet-key code` |  |
| 3413 | `.diet-cell:active` |  |
| 3426 | `.diet-foot` |  |
| 3427 | `.diet-foot .diet-note` |  |
| 3431 | `.diet-daynav .js-today` |  |
| 3432 | `.diet-daynav .icon-btn[disabled]` |  |
| 3434 | `.diet-edit` |  |
| 3435 | `.diet-edit-row` |  |
| 3439 | `.diet-edit-name` |  |
| 3440 | `.diet-edit-unit` |  |
| 3441 | `.diet-edit-src` |  |
| 3446 | `.diet-got` |  |
| 3451 | `.diet-got-head` |  |
| 3452 | `.diet-got pre` |  |
| 3458 | `.diet-why summary` |  |
| 3462 | `.diet-why[open] summary` |  |
| 3476 | `.arc-cal` |  |
| 3477 | `.arc-cal .cal-dots` |  |
| 3478 | `.arc-cal .cal-dots i` |  |
| 3479 | `.arc-cal .cal-dots i.is-log` |  |
| 3499 | `.arc-then:active` |  |
| 3533 | `.arc-then-more` |  |
| 3536 | `.arc-then.is-years:active` |  |
| 3544 | `.arc-year:active` |  |
| 3555 | `.arc-year-text.is-blank` |  |
| 3587 | `.arc-log-empty` |  |
| 3629 | `.arc-log-memo.is-clamped` |  |
| 3663 | `.arc-sort:active` |  |
| 3686 | `.arc-memo.is-clamped` |  |
| 3755 | `.arc-quiet .field-hint[hidden]` |  |
| 3862 | `.add-fab.is-open:active` |  |
| 3874 | `.item.is-glow` |  |
| 3888 | `.item.is-finishing` |  |
| 3898 | `.item.is-sliding` |  |
| 3934 | `.item.is-glow, .item.is-finishing, .item.is-sliding, .item.is-dropping, .is-arriving` | @media (prefers-reduced-motion: reduce) |
| 3968 | `.trip.todo-today.is-tl` |  |
| 3975 | `.trip.todo-today.is-tl .todo-head` |  |
| 3986 | `.tl-sum.is-back` |  |
| 3987 | `.tl-free` |  |
| 3998 | `.tl-switch` |  |
| 4007 | `.tl-switch:active` |  |
| 4309 | `.tl-node .todo-mark svg` |  |
| 4409 | `.tl-cap` |  |
| 4475 | `.tl-subs-chip:active` |  |
| 4506 | `.tl-pin, .tl-rep` |  |
| 4566 | `.tl:has(.tl-list.is-dragging) .tl-axis` |  |
| 4567 | `.tl-free-text` |  |
| 4709 | `.tl-grip[role="button"]:focus-visible` |  |
| 4778 | `.cal-day.is-drop` |  |
| 4784 | `.tl-sheet > .todo-group` |  |
| 4787 | `.tl-sheet > .todo-group:first-of-type, .tl-sheet > .trip.todo-today:first-of-type` |  |
| 4789 | `.tl-sheet > .todo-group > .todo-head` |  |
| 4813 | `.todo-past > .todo-head` |  |
| 4814 | `.todo-past > .todo-head > span:nth-of-type(2)` |  |
| 4815 | `.todo-past .js-past-close` |  |
| 4889 | `.tl-node.is-unpop` |  |
| 4895 | `.tl-item.is-unstriking .item-name, .item.is-unstriking .item-name` |  |
| 4909 | `.tl-done-at` |  |
| 4915 | `.todo-group.is-tl .todo-head` |  |
| 5048 | `.product-wrap:not(.is-tile-wrap) .product:hover` | @media (hover: hover) |
| 5127 | `.arc-stack > .chip-row` |  |
| 5362 | `.note-pick` |  |
| 5363 | `.note-name-in` |  |
| 5395 | `.notes-off` |  |
| 5405 | `.notes-trash .note-row` |  |
| 5488 | `.nv-blank` |  |
| 5496 | `.nv-dot, .nv-n` |  |
| 5497 | `.nv-dot::before` |  |
| 5498 | `.nv-n` |  |
| 5516 | `.nv-q` |  |
| 5580 | `.note-pop.is-pick` |  |
| 5604 | `.pop-cal-day[aria-pressed="true"]` |  |
| 5632 | `.note-wheel::-webkit-scrollbar` |  |
| 5645 | `.sub-check` |  |
| 5650 | `.sub-check svg` |  |
| 5651 | `.sub-check.is-on` |  |
| 5662 | `.tw-input::-webkit-date-and-time-value` |  |
| 5688 | `.note-pop-sub` |  |
| 5698 | `.notes-versions` |  |
| 5699 | `.note-read` |  |
| 5711 | `.diet-found-n` |  |
| 5762 | `.tl-row .check.is-trace` |  |
| 5769 | `.tl-row .check.is-trace svg` |  |
| 5794 | `.tl-row.is-lifted` |  |
| 5801 | `.tl-list.is-dragging` |  |
| 5806 | `.tl-list.is-dragging .tl-row` |  |
| 5809 | `.tl-row.is-aim` |  |
| 5810 | `.tl-row.is-aim::before` |  |
| 5819 | `.tl-row.is-aim.is-aim-before::before` |  |
| 5831 | `.tl-aim` |  |
| 5840 | `.tl-aim-line` |  |
| 5852 | `.tl-aim.is-on .tl-aim-line` |  |
| 5859 | `.tl-ghost` |  |
| 5886 | `.tl-ghost-mark` |  |
| 5893 | `.tl-ghost-mark .todo-mark` |  |
| 5898 | `.tl-ghost-mark .todo-mark.is-split` |  |
| 5903 | `.tl-ghost-body` |  |
| 5904 | `.tl-ghost-when` |  |
| 5905 | `.tl-ghost-title` |  |
| 5916 | `.dock.is-trash .add-fab` |  |
| 5917 | `.tl-trash` |  |
| 5929 | `.tl-trash svg` |  |
| 5931 | `.tl-trash.is-armed` |  |
| 5933 | `.tl-ghost` | @media (prefers-reduced-motion: reduce) |
| 5942 | `.tl-aim-line .tl-band-time` |  |
| 5954 | `.tl-aim-line.is-under .tl-band-time` |  |
| 5961 | `.tl-someday-sec.is-aim` |  |
| 5967 | `.tl-band-time` |  |
| 5999 | `.trip-plan-btn.is-on` |  |
| 6008 | `.low` |  |
| 6009 | `.low .trip-head svg` |  |
| 6010 | `.low-list` |  |
| 6011 | `.low-row` |  |
| 6015 | `.low-mark` |  |
| 6023 | `.low-mark .p-icon` |  |
| 6024 | `.low-main` |  |
| 6025 | `.low-name` |  |
| 6026 | `.low-meta` |  |
| 6031 | `.low-add` |  |
| 6043 | `.low-add svg` |  |
| 6045 | `:root:not([data-theme="light"]) .low-add` | @media (prefers-color-scheme: dark) |
| 6047 | `:root[data-theme="dark"] .low-add` |  |
| 6050 | `.tl-shop` |  |
| 6183 | `.sub-line` |  |
| 6184 | `.sub-line .input` |  |
| 6193 | `.sub-grip` |  |
| 6205 | `.sub-grip svg` |  |
| 6206 | `.sub-line.reorder-lift .sub-grip` |  |
| 6210 | `.sub-line.reorder-lift` |  |
| 6214 | `.tl-subs` |  |
| 6298 | `.arc-feed-row:hover .arc-feed-title` | @media (hover: hover) |
| 6338 | `.accent-row` |  |
| 6342 | `.accent-dot` |  |
| 6347 | `.accent-swatch` |  |
| 6355 | `.accent-dot.is-on .accent-swatch` |  |
| 6360 | `.accent-name` |  |
| 6364 | `.accent-dot.is-on .accent-name` |  |
| 6368 | `.accent-row.note-colors` |  |
| 6372 | `.note-colors .accent-dot` |  |
| 6434 | `.tl-due.is-over` |  |
| 6439 | `.prices-count` |  |
| 6514 | `.topbar-row` | @media (max-width: 374px) |
| 6543 | `.sa-jump` |  |
| 6544 | `.sa-more-note, .sa-note` |  |
| 6678 | `.road-bed.is-snore .road-z` | @media (prefers-reduced-motion: reduce) |
| 6707 | `.road-label em` |  |
| 6718 | `.road-edge.is-before` |  |
| 6720 | `.road-turn` |  |
| 6763 | `.day-road.is-carry-out .road-hollow` |  |
| 6769 | `.road-bead.is-someday:not(.road-ghost)` | @media (prefers-reduced-motion: reduce) |
| 6820 | `.road-decide-none` |  |
