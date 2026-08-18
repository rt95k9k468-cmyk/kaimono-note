#!/usr/bin/env bash
# =========================================================
#  くらしノートの中継所を建てる。
# =========================================================
#
#  使い方（Mac か Linux で、この relay/ フォルダの中で）:
#
#      ./setup.sh
#
#  すること:
#    1. 当てられない道（合言葉）を作る
#    2. KVの置き場を作って、wrangler.toml に結ぶ
#    3. 公開する
#    4. 本当に置けて取れるかを、その場で確かめる
#    5. アプリに貼るURLを出す
#
#  要るもの: Node（npx が使えれば十分）と、Cloudflareの無料アカウント。
#  ログインしていなければ、途中でブラウザが開きます。
#
#  二度目からも、そのまま実行して構いません。道と置き場が
#  すでに書いてあれば、それを使い回して公開し直すだけです。

set -euo pipefail
cd "$(dirname "$0")"

WRANGLER="npx --yes wrangler@4"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v npx >/dev/null || die "npx が見つかりません。Node を入れてください（https://nodejs.org）"

# --- 1. 道（合言葉）------------------------------------------------------
# 人が考える「ランダム」はランダムではないので、機械に作らせます。
current_path=$(sed -n 's/^RELAY_PATH = "\(.*\)"$/\1/p' wrangler.toml)
if [ -z "$current_path" ]; then
  secret=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 16)
  current_path="/kn-$secret"
  # BSD sed（Mac）と GNU sed の両方で動く形にします。
  sed -i.bak "s|^RELAY_PATH = \"\"|RELAY_PATH = \"$current_path\"|" wrangler.toml
  rm -f wrangler.toml.bak
  say "道を作りました: $current_path"
else
  say "道はもう決まっています: $current_path"
fi

# --- 2. 置き場（KV）------------------------------------------------------
current_id=$(awk '/^\[\[kv_namespaces\]\]/{f=1} f && /^id = /{gsub(/^id = "|"$/,""); print; exit}' wrangler.toml)
if [ -z "$current_id" ]; then
  say "置き場（KV）を作ります…"
  out=$($WRANGLER kv namespace create MAIL 2>&1) || { echo "$out"; die "置き場を作れませんでした"; }
  echo "$out"
  # wrangler は作った id を教えてくれるので、そこから拾います。
  new_id=$(printf '%s' "$out" | grep -oE '"?id"?[ =:]+"?[0-9a-f]{32}' | grep -oE '[0-9a-f]{32}' | head -1)
  [ -n "$new_id" ] || die "作った置き場の id を読み取れませんでした。上の出力の id を wrangler.toml に手で書いてください。"
  # kv_namespaces の下の、空の id 行だけを埋めます。
  awk -v id="$new_id" '
    /^\[\[kv_namespaces\]\]/ { inkv = 1 }
    inkv && /^id = ""$/ { print "id = \"" id "\""; inkv = 0; next }
    { print }
  ' wrangler.toml > wrangler.toml.tmp && mv wrangler.toml.tmp wrangler.toml
  say "置き場を結びました: $new_id"
else
  say "置き場はもう結んであります: $current_id"
fi

# --- 3. 公開 -------------------------------------------------------------
say "公開します…"
deploy_out=$($WRANGLER deploy 2>&1) || { echo "$deploy_out"; die "公開できませんでした"; }
echo "$deploy_out"

base=$(printf '%s' "$deploy_out" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$base" ] || die "公開はできたようですが、URLを読み取れませんでした。上の出力を見て、手で組み立ててください。"
url="$base$current_path"

# --- 4. 本当に動くか -----------------------------------------------------
say "置けて取れるか、確かめます…"
./verify.sh "$url" || die "確認に失敗しました。上の理由を見てください。"

# --- 5. アプリへ ---------------------------------------------------------
cat <<EOS

════════════════════════════════════════════════════════════
 中継所ができました。

   $url

 これを、くらしノートの
   設定 → ダイエット → 中継所
 に貼って「保存」してください。

 そのあとショートカットの最後を「クリップボードにコピー」から
 「URLの内容を取得」に差し替えます（方法=POST、本文を要求=ファイル、
 ファイル=一つ前の「テキスト」の結果）。URLは上と同じものです。

 くわしくは relay/README.md の「ショートカットを直す」を。
════════════════════════════════════════════════════════════

EOS
