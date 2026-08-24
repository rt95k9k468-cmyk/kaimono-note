# fonts/

本文の書体は**教科書体**です。積み方は三段で、`css/base.css` の
いちばん上に理由を書いてあります。

1. **UD デジタル教科書体**（モリサワ）— 端末が持っていれば、それ
2. **Klee One**（ここに置いてあるもの）— 持っていない端末はこれ
3. 端末の日本語書体 — 上の二つに無い字だけ

1 は Windows 10 以降に入っている書体です。UD（ユニバーサルデザイン）の
設計が入った教科書体で、これがある端末ではいちばん読みやすいので先に
置きます。**ただし web に埋め込める書体ではありません**——モリサワの
商用書体で、OFL ではないので同梱できません。だから配れず、持っている
人だけが使えます。

2 が、配れるほうの教科書体です。iPhone・Android・Mac には教科書体が
入っていないので、実際に多くの人が見るのはこちらになります。UD の設計は
入っていません。「教科書体で、かつ配れて、かつ UD」という書体は
いまのところ無いので、配れることを取りました。

Google Fonts の CDN には頼りません——このアプリはオフラインで動くことが
前提（sw.js が先読みして持っておく）で、電波の無いところで初回に開いた
場合や、CDN が読めない環境でも文字が欠けないようにするためです。

## 中身

- `KleeOne-Regular.woff2`（400）419KB
- `KleeOne-SemiBold.woff2`（700として宣言）437KB
- `OFL.txt` — ライセンス（SIL Open Font License 1.1）。改変・再配布・
  埋め込みが認められています。作者は The Klee Project Authors
  （Fontworks, https://github.com/fontworks-fonts/Klee）。

Klee One が持っている太さは Regular(400) と SemiBold(600) です。
SemiBold のファイルを **700 として**宣言しています——そうしないと
ブラウザが 400 を自分で太らせた字（縁のにじむ合成太字）を出すので、
「持っている太さを使え」と言うための宣言です。アプリ側の
`font-weight` は 400 と 700 の二つだけに揃えてあります。

フルセット（各 4.8MB）ではなく、**このアプリのソース
（`js/*.js` の文字列・`*.html`）に実際に出てくる文字＋ひらがな・
カタカナ・半角英数の全域**だけに削ってあります（1,947字）。
持っていない字は `--font` の次の候補が自動で引き受けます——これは
壊れではなく、web フォントの正しい振る舞いです。Klee One に無くて
実際に画面へ出るものには、記号がいくつかあります：

    → ↻ ★ ☆ ▲ ▼ ① ② ③ ～ 半角カナ

これらは端末の書体で出ます。記号なので、書体が変わってもほとんど
見分けが付きません（漢字やかなが混じる心配はありません——
1,947字のほうに入っています）。

## 教科書体に変えて分かったこと

BIZ UDPゴシックは名前の **P** が示すとおり**プロポーショナル**で、
カタカナが詰まって組まれていました。教科書体は全角です。同じ 16px でも
「トイレットペーパー」は 9 文字ぶんの幅（144px）を使うので、買うものの
行では名前が収まらず、末尾が「…」になります。枠を広げるには値段の列を
削ることになるので、いまは**名前が長いときだけ末尾が切れる**ままに
してあります（押せば全部見えます）。

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

# 2. 元の（フルセットの）ttf を取る
#    Google Fonts の CSS API に、ttf を返す古い UA で聞くと、
#    日本語ぜんぶ入りの ttf（7,253字）の在り処が返ってきます。
UA="Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-US) \
AppleWebKit/534.10 (KHTML, like Gecko) Version/5.0.3 Safari/533.19.4"
for w in 400 600; do
  url=$(curl -s -A "$UA" \
    "https://fonts.googleapis.com/css?family=Klee+One:$w&subset=japanese" \
    | grep -o 'https://[^)]*')
  curl -sL -o /tmp/klee-$w.ttf "$url"
done

# 3. その文字だけを切り出す（600 は 700 として宣言するので、名前は SemiBold）
python3 -m fontTools.subset /tmp/klee-400.ttf --text-file=/tmp/kn-chars.txt --flavor=woff2 \
  --output-file=fonts/KleeOne-Regular.woff2 --layout-features='*' \
  --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline \
  --recommended-glyphs --name-IDs='*' --name-legacy --name-languages='*'
python3 -m fontTools.subset /tmp/klee-600.ttf --text-file=/tmp/kn-chars.txt --flavor=woff2 \
  --output-file=fonts/KleeOne-SemiBold.woff2 --layout-features='*' \
  --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph --notdef-outline \
  --recommended-glyphs --name-IDs='*' --name-legacy --name-languages='*'
```

作り直したら、`sw.js` の `ASSETS` にファイル名が入っていることを確認してください
（先読みの対象です。パスが変わっていなければ、そのままで大丈夫です）。
