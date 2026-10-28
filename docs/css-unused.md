# 使われていない CSS の候補表

`tools/css-unused.js` が作る（docs/roadmap-2.0.md の V3）。2026-10-27、全試験の `open()` 219回ぶんの当たりを足した。
**当たらない＝要らない、ではない**（試験が通らない状態・iOS だけの `@supports`・動きを減らす設定・
ぼかしの効かない受け皿など）。消すのは V25 で、一つずつ試験つき。手で書き足さない——作り直すと消える。

| ファイル | 規則 | 当たらない |
|---|---|---|
| base.css | 246 | 39 |
| components.css | 411 | 105 |
| screens.css | 2021 | 356 |

## base.css（39）

| 行 | 規則 | 中 |
|---|---|---|
| 678 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 830 | `:root` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 835 | `.toast` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 846 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 856 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 1066 | `.head-cal.is-cal-resize` | @media (prefers-reduced-motion: reduce) |
| 1176 | `:root:not([data-theme="light"]) .head[data-sky="dawn"]` | @media (prefers-color-scheme: dark) |
| 1177 | `:root:not([data-theme="light"]) .head[data-sky="morning"]` | @media (prefers-color-scheme: dark) |
| 1178 | `:root:not([data-theme="light"]) .head[data-sky="day"]` | @media (prefers-color-scheme: dark) |
| 1179 | `:root:not([data-theme="light"]) .head[data-sky="evening"]` | @media (prefers-color-scheme: dark) |
| 1180 | `:root:not([data-theme="light"]) .head[data-sky="night"]` | @media (prefers-color-scheme: dark) |
| 1234 | `:root:not([data-theme="light"]) .head[data-sky-img]` | @media (prefers-color-scheme: dark) |
| 1396 | `.screen.is-under` |  |
| 1401 | `.screen.is-over` |  |
| 1592 | `.screen::-webkit-scrollbar` |  |
| 1593 | `.screen::-webkit-scrollbar-thumb` |  |
| 1631 | `.topbar.is-stuck` |  |
| 2367 | `:root[data-accent="green"]` |  |
| 2378 | `:root[data-accent="blue"]` |  |
| 2389 | `:root[data-accent="violet"]` |  |
| 2400 | `:root[data-accent="rose"]` |  |
| 2411 | `:root[data-accent="mustard"]` |  |
| 2422 | `:root[data-accent="sky"]` |  |
| 2433 | `:root[data-accent="apricot"]` |  |
| 2450 | `:root:not([data-theme="light"])[data-accent="green"], :root[data-theme="dark"][data-accen…` | @media (prefers-color-scheme: dark) |
| 2456 | `:root:not([data-theme="light"])[data-accent="blue"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2462 | `:root:not([data-theme="light"])[data-accent="violet"], :root[data-theme="dark"][data-acce…` | @media (prefers-color-scheme: dark) |
| 2468 | `:root:not([data-theme="light"])[data-accent="rose"], :root[data-theme="dark"][data-accent…` | @media (prefers-color-scheme: dark) |
| 2474 | `:root:not([data-theme="light"])[data-accent="mustard"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2480 | `:root:not([data-theme="light"])[data-accent="sky"], :root[data-theme="dark"][data-accent=…` | @media (prefers-color-scheme: dark) |
| 2486 | `:root:not([data-theme="light"])[data-accent="apricot"], :root[data-theme="dark"][data-acc…` | @media (prefers-color-scheme: dark) |
| 2494 | `:root[data-theme="dark"][data-accent="green"]` |  |
| 2499 | `:root[data-theme="dark"][data-accent="blue"]` |  |
| 2504 | `:root[data-theme="dark"][data-accent="violet"]` |  |
| 2509 | `:root[data-theme="dark"][data-accent="rose"]` |  |
| 2514 | `:root[data-theme="dark"][data-accent="mustard"]` |  |
| 2519 | `:root[data-theme="dark"][data-accent="sky"]` |  |
| 2524 | `:root[data-theme="dark"][data-accent="apricot"]` |  |
| 2558 | `:root:not([data-theme="light"])` | @media (prefers-contrast: more) and (prefers-color-scheme: dark) |

## components.css（105）

| 行 | 規則 | 中 |
|---|---|---|
| 98 | `[data-icons="phosphor"] .ui-ico[data-ico-mode="stroke"].is-sub` |  |
| 123 | `.is-there .swipe-yes .ui-ico .ico-line` |  |
| 124 | `.is-there .swipe-yes .ui-ico .ico-solid` |  |
| 168 | `.btn-ghost:hover` | @media (hover: hover) |
| 223 | `.icon-btn.is-danger:hover` | @media (hover: hover) |
| 258 | `.memo` |  |
| 271 | `.memo .icon-btn` |  |
| 323 | `.icon-pick-sub:empty` |  |
| 344 | `.icon-report-toggle.is-on` |  |
| 370 | `.icon-cell:active` |  |
| 371 | `.icon-cell.is-on` |  |
| 412 | `.stepper-btn:active` |  |
| 434 | `.input[type="date"], .input[type="time"]` |  |
| 447 | `.input[type="date"]` |  |
| 450 | `.input[type="time"]` |  |
| 455 | `.input[type="date"]::-webkit-date-and-time-value, .input[type="time"]::-webkit-date-and-t…` |  |
| 461 | `.input[type="date"]::-webkit-datetime-edit, .input[type="time"]::-webkit-datetime-edit` |  |
| 465 | `.input[type="date"]::-webkit-calendar-picker-indicator, .input[type="time"]::-webkit-cale…` |  |
| 474 | `.input[type="date"], .input[type="time"]` |  |
| 491 | `.chip-row::-webkit-scrollbar` |  |
| 688 | `.empty.is-quiet .empty-art` |  |
| 689 | `.empty.is-quiet .empty-art .empty-svg` |  |
| 690 | `.empty.is-quiet .empty-title` |  |
| 691 | `.empty.is-quiet .empty-text` |  |
| 879 | `.sheet-bloom` | @media (prefers-reduced-motion: reduce) |
| 1061 | `.hero-fact.is-fav` |  |
| 1133 | `.d-row:disabled` |  |
| 1166 | `.d-add:active` |  |
| 1249 | `.price-add .chip-wrap::-webkit-scrollbar` |  |
| 1262 | `.act-ico svg` |  |
| 1266 | `.act-row.is-danger .act-ico, .act-row.is-danger .act-label` |  |
| 1271 | `.due-list` |  |
| 1272 | `.due-row` |  |
| 1273 | `.due-row + .due-row` |  |
| 1274 | `.due-head` |  |
| 1275 | `.due-time` |  |
| 1276 | `.due-title` |  |
| 1277 | `.due-acts` |  |
| 1278 | `.due-acts > .btn:only-child` |  |
| 1279 | `.due-acts > .btn` |  |
| 1280 | `.due-later` |  |
| 1281 | `.due-later[hidden]` |  |
| 1282 | `.due-later > .btn` |  |
| 1283 | `.due-note` |  |
| 1284 | `.due-open` |  |
| 1289 | `.carry-list` |  |
| 1296 | `.carry-n` |  |
| 1297 | `.carry-was + .carry-n` |  |
| 1298 | `.carry-head > .carry-n:first-of-type:not(.carry-was + .carry-n)` |  |
| 1300 | `.review-row .carry-head` |  |
| 1301 | `.review-row .carry-was` |  |
| 1302 | `.carry-acts` |  |
| 1303 | `.carry-acts > .btn` |  |
| 1305 | `.passed-note` |  |
| 1324 | `.set-more > summary::-webkit-details-marker` |  |
| 1325 | `.set-more > summary:active` |  |
| 1331 | `.set-more[open] > summary::after` |  |
| 1332 | `.set-more > p, .set-more > ol, .set-more > pre` |  |
| 1334 | `.set-more > .set-card` |  |
| 1390 | `.sheet-mark` |  |
| 1569 | `.toast` | @media (prefers-contrast: more) |
| 1705 | `:root:not([data-theme="light"]) :not([aria-checked="true"]) > .toggle` | @media (prefers-color-scheme: dark) |
| 1710 | `.toggle, .toggle-knob, .toggle-mark` | @media (prefers-reduced-motion: reduce) |
| 1735 | `.keypad` |  |
| 1762 | `.keypad.is-open` |  |
| 1764 | `.keypad-grid` |  |
| 1770 | `.keypad-actions` |  |
| 1780 | `.key` |  |
| 1798 | `.key::after` |  |
| 1803 | `.key:active` |  |
| 1805 | `.key-op` |  |
| 1810 | `.key-tax` |  |
| 1816 | `.key-tax-cap` |  |
| 1817 | `.key-tax-rate` |  |
| 1822 | `.key-off` |  |
| 1828 | `.key-off-cap` |  |
| 1829 | `.key-off-main` |  |
| 1834 | `.key-ok` |  |
| 1840 | `.key-ok.is-equals` |  |
| 1841 | `.key-ok:active` |  |
| 1844 | `.key-back svg` |  |
| 1857 | `.is-m-press` |  |
| 1892 | `.is-m-add` |  |
| 1902 | `.is-m-delete` |  |
| 1921 | `.is-m-success` |  |
| 1943 | `.row-times` |  |
| 1944 | `.row-times .input` |  |
| 1945 | `.row-dash` |  |
| 1962 | `.dest-chip:active` |  |
| 1997 | `#yearbook-print li .yb-text` | @media print |
| 2003 | `#notes-print` |  |
| 2005 | `html.is-printing-notes, html.is-printing-notes body` | @media print |
| 2010 | `html.is-printing-notes body > *:not(#notes-print)` | @media print |
| 2011 | `html.is-printing-notes #notes-print` | @media print |
| 2024 | `#notes-print .np-note + .np-note` | @media print |
| 2025 | `#notes-print h2` | @media print |
| 2026 | `#notes-print .np-meta` | @media print |
| 2027 | `#notes-print .np-body > *` | @media print |
| 2028 | `#notes-print .nv-img` | @media print |
| 2029 | `#notes-print .nv-img img` | @media print |
| 2030 | `#notes-print .nv-img.is-gone` | @media print |
| 2080 | `.lock-veil` | @media print |
| 2091 | `.lock-away svg` |  |
| 2146 | `.unf-prompt` |  |
| 2157 | `.unf-none` |  |

## screens.css（356）

| 行 | 規則 | 中 |
|---|---|---|
| 93 | `:root:not([data-theme="light"]) .add-fab` | @media (prefers-color-scheme: dark) |
| 124 | `.ac` |  |
| 135 | `.ac-item` |  |
| 145 | `.ac-item:last-child` |  |
| 146 | `.ac-item.is-active` |  |
| 150 | `.ac-item:hover` | @media (hover: hover) |
| 152 | `.ac-main` |  |
| 153 | `.ac-name` |  |
| 154 | `.ac-sub` |  |
| 173 | `.ac-chips::-webkit-scrollbar` |  |
| 288 | `.item-emoji:empty` |  |
| 312 | `.item.is-tile` |  |
| 314 | `.item.is-tile:not(.is-reordering *):has(> .item-body:active)` |  |
| 318 | `.item-wrap.is-swiping .item` |  |
| 355 | `.cal.is-stuck` |  |
| 463 | `.topbar-title .roll > .roll-in, .topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 465 | `.topbar-title .roll::before` | @media (prefers-reduced-motion: reduce) |
| 511 | `.cal-arrow` |  |
| 519 | `.cal-arrow svg` |  |
| 522 | `.cal-arrow.js-prev svg` |  |
| 523 | `.cal-arrow:active` |  |
| 525 | `.cal-arrow:hover` | @media (hover: hover) |
| 529 | `.cal-more` |  |
| 537 | `.cal-more[aria-expanded="true"]` |  |
| 538 | `.cal-more:hover` | @media (hover: hover) |
| 602 | `.cal-wk-page.is-void` |  |
| 632 | `.cal.is-peek.is-week .cal-pad.is-off-week` |  |
| 640 | `.cal.is-settling .cal-clip, .cal.is-settling .cal-slide, .cal.is-settling .cal-wds, .cal.…` | @media (prefers-reduced-motion: reduce) |
| 794 | `.cal-mark .ui-ico` |  |
| 926 | `.todo-group.is-drop-target` |  |
| 939 | `.tile-repeat` |  |
| 1004 | `.item.todo.is-tile .todo-mark` |  |
| 1010 | `.item.todo.is-tile .todo-mark .p-icon` |  |
| 1011 | `.item.todo.is-tile .todo-dot` |  |
| 1029 | `.item.todo:not(.is-tile).is-checked .todo-lead` |  |
| 1034 | `.item.todo:not(.is-tile).is-checked .todo-mark .p-icon` |  |
| 1037 | `.item.todo:not(.is-tile).is-checked .todo-tag` |  |
| 1038 | `.item.todo:not(.is-tile).is-checked .item-meta` |  |
| 1077 | `.item.todo:not(.is-tile) .item-memo` |  |
| 1092 | `.todo-at` |  |
| 1129 | `.time-row .chip` |  |
| 1133 | `.todo-tag` |  |
| 1143 | `.tile-when` |  |
| 1152 | `.link-btn` |  |
| 1209 | `.is-armed .swipe-yes > *, .is-armed .swipe-arch > *` |  |
| 1211 | `.is-swiping.is-right .swipe-yes` |  |
| 1212 | `.is-swiping.is-left .swipe-arch` |  |
| 1217 | `.is-swiping.is-right .item, .is-swiping.is-right .product` |  |
| 1221 | `.is-swiping.is-left .item, .is-swiping.is-left .product` |  |
| 1330 | `.item.is-tile .item-qty` |  |
| 1356 | `.item.is-tile .check, .item.is-tile .fav` |  |
| 1367 | `.item.is-tile .item-body` |  |
| 1369 | `.item.is-tile .check` |  |
| 1370 | `.item.is-tile .fav` |  |
| 1371 | `.item.is-tile .check` |  |
| 1372 | `.item.is-tile .check svg` |  |
| 1373 | `.item.is-tile .fav svg` |  |
| 1377 | `.item.is-tile.is-checked` |  |
| 1379 | `.item-wrap:has(.is-tile)` |  |
| 1489 | `.check.is-repeat:hover .check-repeat svg` | @media (hover: hover) |
| 1518 | `.insights` |  |
| 1526 | `.insights-head` |  |
| 1535 | `.insights-head svg` |  |
| 1537 | `.insights-list` |  |
| 1539 | `.insight` |  |
| 1543 | `.insight-ico` |  |
| 1544 | `.insight-ico.is-warn` |  |
| 1545 | `.insight-ico.is-good` |  |
| 1546 | `.insight-ico.is-note` |  |
| 1547 | `.insight-ico.is-mute` |  |
| 1548 | `.insight-main` |  |
| 1549 | `.insight-title` |  |
| 1550 | `.insight-body` |  |
| 1643 | `.tile-when` |  |
| 1713 | `.done-head[aria-expanded="true"] svg` |  |
| 1714 | `.done-head:active` |  |
| 1784 | `.archive` |  |
| 1786 | `.archive-head` |  |
| 1798 | `.archive-head svg` |  |
| 1804 | `.archive.is-open .archive-head svg` |  |
| 1805 | `.archive-body` |  |
| 1809 | `.archive .product` |  |
| 1815 | `.archive .product-name` |  |
| 1816 | `.archive .product-emoji` |  |
| 1817 | `.archive .product::before` |  |
| 1818 | `.archive .item-price-amount, .archive .tile-price` |  |
| 1820 | `.archive .product-list` |  |
| 1845 | `.product-wrap.is-swiping .product` |  |
| 1889 | `.product.is-tile:has(> .product-main:active)` |  |
| 1924 | `.price-main:active` |  |
| 1934 | `.price-unit` |  |
| 1951 | `.cmp` |  |
| 1952 | `.cmp b` |  |
| 1953 | `.cmp .cmp-good` |  |
| 1954 | `.cmp .cmp-bad` |  |
| 1956 | `.log-row` |  |
| 1965 | `.log-row.is-current` |  |
| 1966 | `.log-date` |  |
| 1967 | `.log-price` |  |
| 1968 | `.log-unit` |  |
| 1969 | `.log-tag` |  |
| 2021 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 2097 | `.set-layer.is-sheetish .set-choose` |  |
| 2191 | `.set-head.is-flush` |  |
| 2226 | `.set-card.is-alert` |  |
| 2227 | `.set-card.is-alert .set-title` |  |
| 2228 | `.set-card.is-alert .set-note` |  |
| 2338 | `.set-choose` |  |
| 2343 | `.set-choose .set-row` |  |
| 2344 | `.set-choose .set-row + .set-row::before` |  |
| 2345 | `.set-check` |  |
| 2346 | `.set-check svg` |  |
| 2389 | `.set-time:active` |  |
| 2432 | `.theme-pick:active .theme-shot` |  |
| 2469 | `.set-range::-moz-range-track` |  |
| 2478 | `.set-range::-moz-range-thumb` |  |
| 2485 | `.set-range:focus-visible` |  |
| 2486 | `.set-range:focus-visible::-webkit-slider-thumb` |  |
| 2509 | `#screen-settings .settings-group` |  |
| 2517 | `#screen-settings .settings-group .set-card` |  |
| 2524 | `#screen-settings .section-title` |  |
| 2529 | `#screen-settings .manage-row` |  |
| 2537 | `#screen-settings .manage-row + .manage-row` |  |
| 2538 | `#screen-settings .manage-name` |  |
| 2541 | `#screen-settings .manage-row .fine-note` |  |
| 2545 | `.set-glyph.is-plain` |  |
| 2546 | `.set-empty` |  |
| 2578 | `.manage-row` |  |
| 2581 | `.manage-swatch` |  |
| 2589 | `.manage-name` |  |
| 2592 | `.swatches` |  |
| 2593 | `.swatch` |  |
| 2600 | `.swatch:hover` | @media (hover: hover) |
| 2602 | `.swatch[aria-pressed="true"]` |  |
| 2615 | `.calc-out` |  |
| 2626 | `.calc-out.is-idle` |  |
| 2794 | `.diet-hero-cond` |  |
| 2810 | `.diet-stat:active` |  |
| 2813 | `.diet-stat-value.is-warn` |  |
| 2820 | `.diet-note.is-warn` |  |
| 2839 | `.diet-goal-line` |  |
| 2840 | `.diet-goal-tag` |  |
| 2842 | `.diet-goal-tag.is-off` |  |
| 2851 | `.diet-goal-glow` |  |
| 2856 | `.diet-ma14` |  |
| 2866 | `.diet-dot.is-health` |  |
| 2901 | `.diet-legend-item i.dot-ma14` |  |
| 2905 | `.ta-wrap` |  |
| 2906 | `.ta-clear` |  |
| 2914 | `.ta-clear svg` |  |
| 2915 | `.ta-clear` |  |
| 2916 | `.ta-clear:active` |  |
| 2962 | `:root:not([data-theme="light"]) .diet-cell[data-type="drink"] :is(.diet-cell-label, .diet…` | @media (prefers-color-scheme: dark) |
| 2970 | `:root:not([data-theme="light"]) .diet-cell[data-type="drink"] :is(.diet-cell-label, .diet…` | @media (prefers-contrast: more) and (prefers-color-scheme: dark) |
| 3002 | `.diet-ring.is-none` |  |
| 3021 | `.diet-ring.is-none .diet-ring-mid` |  |
| 3066 | `.is-m-arrive .diet-bar` |  |
| 3101 | `button.section-note:active` |  |
| 3150 | `.diet-mood` |  |
| 3299 | `.diet-workouts` |  |
| 3307 | `.diet-kcal-rem` |  |
| 3308 | `.diet-kcal-rem b` |  |
| 3309 | `.diet-kcal-rem.is-over b` |  |
| 3310 | `.diet-kcal-target` |  |
| 3330 | `.diet-stack i.is-snack` |  |
| 3331 | `.diet-stack i.is-other` |  |
| 3365 | `.diet-stack-key i.is-snack` |  |
| 3366 | `.diet-stack-key i.is-other` |  |
| 3368 | `.diet-stack-key i.is-rest` |  |
| 3450 | `.diet-memo-open:active` |  |
| 3461 | `.diet-memo.is-blank .diet-memo-body` |  |
| 3474 | `.diet-suggest` |  |
| 3491 | `.diet-finding.is-warn` |  |
| 3492 | `.diet-finding.is-warn .diet-finding-ico` |  |
| 3512 | `.diet-code` |  |
| 3518 | `.diet-suggest-box` |  |
| 3530 | `.diet-read-row` |  |
| 3531 | `.diet-read-name` |  |
| 3532 | `.diet-read-row b` |  |
| 3533 | `.diet-read-day` |  |
| 3535 | `.diet-keys` |  |
| 3538 | `.diet-key` |  |
| 3542 | `.diet-key code` |  |
| 3543 | `.diet-key-name` |  |
| 3544 | `.diet-key-ex` |  |
| 3571 | `.diet-steps a, .diet-note a` |  |
| 3589 | `.diet-note code, .diet-steps code, .diet-key code` |  |
| 3615 | `.diet-daynav .js-today` |  |
| 3630 | `.diet-got` |  |
| 3635 | `.diet-got-head` |  |
| 3636 | `.diet-got pre` |  |
| 3642 | `.diet-why summary` |  |
| 3646 | `.diet-why[open] summary` |  |
| 3684 | `.arc-then:active` |  |
| 3686 | `.arc-then` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 3687 | `.arc-then` | @media (prefers-contrast: more) |
| 3712 | `.arc-then-rows` |  |
| 3713 | `.arc-then-row` |  |
| 3714 | `.arc-then-row-ico` |  |
| 3715 | `.arc-then-row-ico svg` |  |
| 3716 | `.arc-then-row em` |  |
| 3721 | `.arc-then-more` |  |
| 3724 | `.arc-then.is-years:active` |  |
| 3732 | `.arc-year:active` |  |
| 3743 | `.arc-year-text.is-blank` |  |
| 3779 | `.arc-log-empty` |  |
| 3857 | `:root:not([data-theme="light"]) .think-home` | @media (prefers-color-scheme: dark) |
| 3859 | `.think-home` | @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) |
| 3921 | `.arc-posts` | @media (prefers-contrast: more) |
| 3933 | `.arc-post.can-more .arc-post-body:active:not(:has(.arc-post-act:active))` |  |
| 3966 | `.arc-post.can-more:not(.is-folded) .arc-post-more span` |  |
| 3967 | `.arc-post.can-more:not(.is-folded) .arc-post-more svg` |  |
| 3970 | `.arc-log-row.is-chat .js-times:active` |  |
| 3973 | `.arc-stack` |  |
| 3974 | `.arc-stack-head` |  |
| 3975 | `.arc-stack-head h2` |  |
| 3981 | `.arc-sort` |  |
| 3986 | `.arc-sort svg` |  |
| 3987 | `.arc-sort:active` |  |
| 3989 | `.arc-list` |  |
| 3990 | `.arc-row` |  |
| 3997 | `.arc-row` |  |
| 3998 | `.arc-row:has(> .arc-row-body:active)` |  |
| 3999 | `.arc-row::before` |  |
| 4003 | `.arc-row-body` |  |
| 4004 | `.arc-ico` |  |
| 4005 | `.arc-main` |  |
| 4006 | `.arc-title` |  |
| 4007 | `.arc-sub` |  |
| 4008 | `.arc-sub span:first-child` |  |
| 4009 | `.arc-memo` |  |
| 4011 | `.arc-memo.is-clamped` |  |
| 4020 | `.arc-row .check, .arc-row .fav` |  |
| 4024 | `.arc-pick` |  |
| 4026 | `.dest-chip.arc-note-src` |  |
| 4028 | `.arc-bridge` |  |
| 4029 | `.arc-bridge .dest-chip` |  |
| 4030 | `.arc-bridge .arc-note-from` |  |
| 4031 | `.arc-pick-b` |  |
| 4039 | `.arc-pick-b svg` |  |
| 4040 | `.arc-pick-b:active` |  |
| 4043 | `.arc-pick` |  |
| 4044 | `.arc-pick-b` |  |
| 4045 | `.arc-pick-diary` |  |
| 4046 | `.arc-pick-b.is-on` |  |
| 4050 | `.arc-pick-b.is-on svg` |  |
| 4053 | `.arc-pick-diary` |  |
| 4063 | `.arc-pick-diary svg` |  |
| 4064 | `.arc-pick-diary:active` |  |
| 4069 | `.arc-kind` |  |
| 4070 | `.arc-kind-b` |  |
| 4078 | `.arc-kind-b svg` |  |
| 4079 | `.arc-kind-b:active` |  |
| 4080 | `.arc-kind-b.is-on` |  |
| 4081 | `.arc-kind-b.is-on svg` |  |
| 4084 | `.input-lg` |  |
| 4086 | `.arc-pages-hint` |  |
| 4088 | `.arc-pages` |  |
| 4089 | `.arc-pages .field` |  |
| 4090 | `.arc-pages-hint` |  |
| 4199 | `.add-fab.is-open:active` |  |
| 4212 | `.item.is-glow` |  |
| 4218 | `.item.is-finishing` |  |
| 4225 | `.item.is-sliding` |  |
| 4236 | `.item.is-dropping` |  |
| 4257 | `.item.is-glow, .item.is-finishing, .item.is-sliding, .item.is-dropping, .is-arriving` | @media (prefers-reduced-motion: reduce) |
| 4291 | `.trip.todo-today.is-tl` |  |
| 4298 | `.trip.todo-today.is-tl .todo-head` |  |
| 4309 | `.tl-sum.is-back` |  |
| 4325 | `.refit-ok` |  |
| 4436 | `.tl-node .todo-mark svg` |  |
| 4813 | `.tl-list > li.tl-row:has(> .tl-sub-wrap.is-open)` |  |
| 4817 | `.tl-list > li.tl-row:has(> .tl-sub-wrap.is-open) > .item.tl-item` |  |
| 4819 | `.tl-list.is-push-open > li` |  |
| 4820 | `.tl-list.is-push-shut > li` |  |
| 4822 | `.tl-list > li.tl-row > .tl-sub-wrap::before` |  |
| 4904 | `.tl-more-row:active` |  |
| 4983 | `.tl-grip[role="button"]:focus-visible` |  |
| 5067 | `.wk-next:active` |  |
| 5130 | `.mo-date:active` |  |
| 5134 | `.mo-date:is([data-wd="0"], .is-holiday) :is(.mo-dn, .mo-wd)` |  |
| 5218 | `.cal-day.is-drop` |  |
| 5318 | `.todo-group.is-tl .todo-head` |  |
| 5534 | `.arc-stack` |  |
| 5535 | `.arc-stack-head` |  |
| 5536 | `.arc-stack > .chip-row` |  |
| 5635 | `:root:not([data-theme="light"]) :is(#screen-archive, #screen-notes, #head)` | @media (prefers-color-scheme: dark) |
| 5802 | `:root:not([data-theme="light"])` | @media (prefers-color-scheme: dark) |
| 5847 | `.nt-row > svg:last-child` |  |
| 5849 | `.nt-ico` |  |
| 5852 | `.nt-dot` |  |
| 5853 | `.nt-dot.is-blank` |  |
| 5901 | `.notes-tree` | @media print |
| 5924 | `.notes-rest > summary` |  |
| 5925 | `.notes-rest > summary svg` |  |
| 5926 | `.notes-rest[open] > summary svg` |  |
| 5927 | `.notes-rest > summary::-webkit-details-marker` |  |
| 5928 | `.notes-rest:not([open]) > summary .section-title` |  |
| 5929 | `.ask-past` |  |
| 5933 | `.notes-asks-empty` |  |
| 5936 | `.ask-sheet-q + .ask-ctx` |  |
| 5981 | `.note-nb-btn:active` |  |
| 6000 | `.note-pick` |  |
| 6002 | `.note-pick-books` |  |
| 6003 | `.note-pick-books .chip` |  |
| 6004 | `.note-pick-books .chip > span:last-child` |  |
| 6005 | `.note-pick-books .chip:last-child:nth-child(odd)` |  |
| 6006 | `.note-name-in` |  |
| 6038 | `.notes-off` |  |
| 6049 | `.notes-trash .note-row` |  |
| 6440 | `.pop-cal-day:disabled` |  |
| 6441 | `.pop-cal-day:disabled:not(.is-today)` |  |
| 6442 | `.pop-cal-day.is-today:disabled` |  |
| 6447 | `.pop-cal-day[aria-pressed="true"]:active` |  |
| 6476 | `.note-wheel::-webkit-scrollbar` |  |
| 6489 | `.note-wheel-row:active` |  |
| 6508 | `.tw-input::-webkit-date-and-time-value` |  |
| 6534 | `.note-pop-sub` |  |
| 6537 | `button.note-when:active` |  |
| 6548 | `.note-read` |  |
| 6560 | `.diet-found-n` |  |
| 6607 | `.arc-date-field` |  |
| 6608 | `.arc-date-field > .input` |  |
| 6609 | `.arc-date-field > .field-label` |  |
| 6720 | `.tl-row.is-aim` |  |
| 6721 | `.tl-row.is-aim::before` |  |
| 6730 | `.tl-row.is-aim.is-aim-before::before` |  |
| 6842 | `.tl-trash.is-armed` |  |
| 6844 | `.tl-ghost` | @media (prefers-reduced-motion: reduce) |
| 6865 | `.tl-aim-line.is-under .tl-band-time` |  |
| 6872 | `.tl-someday-sec.is-aim` |  |
| 6910 | `.trip-plan-btn:active` |  |
| 6911 | `.trip-plan-btn.is-on` |  |
| 6920 | `.low` |  |
| 6921 | `.low .trip-head svg` |  |
| 6922 | `.low-list` |  |
| 6923 | `.low-row` |  |
| 6927 | `.low-mark` |  |
| 6935 | `.low-mark .p-icon` |  |
| 6936 | `.low-main` |  |
| 6937 | `.low-name` |  |
| 6938 | `.low-meta` |  |
| 6943 | `.low-add` |  |
| 6955 | `.low-add svg` |  |
| 6957 | `:root:not([data-theme="light"]) .low-add` | @media (prefers-color-scheme: dark) |
| 6959 | `:root[data-theme="dark"] .low-add` |  |
| 6962 | `.tl-shop` |  |
| 7135 | `.sub-line.reorder-lift .sub-grip` |  |
| 7139 | `.sub-line.reorder-lift` |  |
| 7196 | `.arc-feed-box.is-split .arc-feed-list` |  |
| 7217 | `.arc-feed-row:active` |  |
| 7229 | `.arc-feed-row:hover .arc-feed-title` | @media (hover: hover) |
| 7232 | `.arc-feed-row.has-len` |  |
| 7233 | `.arc-feed-len, .arc-feed-sum` |  |
| 7237 | `.arc-feed-sum` |  |
| 8017 | `.mt-1` |  |
