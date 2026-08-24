# fonts/

本文の書体「BIZ UDPゴシック」を自前で持っています。Google Fonts の CDN
には頼りません——このアプリはオフラインで動くことが前提（sw.js が
先読みして持っておく）で、電波の無いところで初回に開いた場合や、
CDN が読めない環境でも文字が欠けないようにするためです。

## 中身

- `BIZUDPGothic-Regular.woff2`（400）
- `BIZUDPGothic-Bold.woff2`（700）
- `OFL.txt` — ライセンス（SIL Open Font License 1.1）。改変・再配布・
  埋め込みが認められています。作者は The BIZ UDGothic Project Authors。

フルセット（各 4.4MB）ではなく、**このアプリのソース
（`js/*.js` の文字列・`*.html`）に実際に出てくる文字＋ひらがな・
カタカナ・半角英数の全域**だけに削ってあります（1611字、各 229KB）。
持っていない字（人が自分で打った文章に出てくる、めずらしい漢字など）
は、`--font` の次の候補（端末に入っている日本語ゴシック）が自動で
引き受けます——これは壊れではなく、web フォントの正しい振る舞いです。

## 作り直す手順

新しい言い回しを足して、その中に今の文字セットに無い字が出てきたら、
以下でサブセットを作り直してください（`fontTools` が要ります：
`pip install fonttools brotli`）。

```bash
# 1. アプリの全ソースから、実際に使われている文字を集める
python3 - <<'EOF'
import glob
chars = set()
for f in glob.glob("js/*.js") + glob.glob("*.html") + ["manifest.webmanifest"]:
    chars.update(open(f, encoding="utf-8").read())
chars = {c for c in chars if ord(c) >= 0x20 and ord(c) != 0x7f}
# ひらがな・カタカナ・半角カナ・半角英数・CJK記号・全角記号を足す
for a, b in [(0x3040,0x30A0),(0x30A0,0x3100),(0xFF61,0xFFA0),
             (0x0020,0x007F),(0x3000,0x3040),(0xFF01,0xFF5F)]:
    chars |= {chr(c) for c in range(a, b)}
open("/tmp/kn-chars.txt", "w", encoding="utf-8").write("".join(sorted(chars)))
EOF

# 2. 元の（フルセットの）ttf から、その文字だけを切り出す
#    元ファイルは Google Fonts から（BIZ UDPGothic, weight 400/700）
python3 -m fontTools.subset reg.ttf  --text-file=/tmp/kn-chars.txt --flavor=woff2 \
  --output-file=fonts/BIZUDPGothic-Regular.woff2 --layout-features='*' \
  --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline \
  --recommended-glyphs --name-IDs='*' --name-legacy --name-languages='*'
python3 -m fontTools.subset bold.ttf --text-file=/tmp/kn-chars.txt --flavor=woff2 \
  --output-file=fonts/BIZUDPGothic-Bold.woff2   --layout-features='*' \
  --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline \
  --recommended-glyphs --name-IDs='*' --name-legacy --name-languages='*'
```

作り直したら、`sw.js` の `ASSETS` にファイル名が入っていることを確認してください
（先読みの対象です。パスが変わっていなければ、そのままで大丈夫です）。
