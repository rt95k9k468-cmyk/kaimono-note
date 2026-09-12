#!/usr/bin/env bash
# 中継所が本当に「置けて・取れて・版で新しさを言う」かを、外から確かめます。
#
#     ./verify.sh https://あなたの.workers.dev/kn-xxxxxxxx
#
# setup.sh が最後に呼びますが、あとから単体で走らせても構いません。
# 「アプリで取り込めない」ときに、中継所とアプリのどちらが悪いのかを
# 切り分けるのが、このスクリプトの仕事です。
#
# 試しの便は **健康データの形をしていないもの**（kn-selftest=…）を、専用の棚
# （?slot=kntest）へ置いて、最後に自分で片づけます。渡しても消えない作りに
# なったので、片づけ損ねた試しの便がそのまま記録に入る道を塞いでおきます。

set -uo pipefail
url="${1:-}"
[ -n "$url" ] || { echo "使い方: ./verify.sh <中継所のURL>" >&2; exit 2; }

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ng()  { fail=$((fail+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

# URL にすでに ? が付いていることがあるので、継ぎ方を見ます。
q() { case "$url" in *\?*) printf '%s&%s' "$url" "$1";; *) printf '%s?%s' "$url" "$1";; esac; }

probe="kn-selftest=$RANDOM$RANDOM"
ver_of() { tr -d '\r' | awk 'tolower($1) == "x-kn-ver:" { print $2 }'; }

echo "中継所を確かめます: $url"

# --- 新しい形か（渡しても消えないか） ---
ver0=$(curl -sS -D - -o /dev/null "$url" 2>/dev/null | ver_of)
if [ -n "$ver0" ]; then ok "新しい形（渡しても消えない）"
else
  ng "古い形です。アプリの「中継所のコードをコピー」から貼り直してください"
  echo "  → 以下は古い形のままの確認です。" >&2
fi

# --- 置く ---
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$(q 'slot=kntest')" --data-binary "$probe" || echo 000)
if [ "$code" = "200" ]; then ok "置けた（POST 200）"
else ng "置けなかった（POST が $code）"; echo; echo "  → URLが違うか、まだ公開できていません。" >&2; exit 1; fi

# --- 取る ---
if [ -n "$ver0" ]; then get_url=$(q "since=$ver0"); else get_url="$url"; fi
body=$(curl -sS "$get_url" || true)
if printf '%s' "$body" | grep -qF "$probe"; then ok "置いたものがそのまま取れた"
else ng "取れた中身に試しの便がない"; printf '    置いた: %q\n    取れた: %q\n' "$probe" "$body" >&2; fi

# --- 版が同じなら、渡してこない ---
if [ -n "$ver0" ]; then
  ver1=$(curl -sS -D - -o /dev/null "$get_url" 2>/dev/null | ver_of)
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$(q "since=$ver1")" || echo 000)
  if [ "$code" = "204" ]; then ok "版が同じなら渡してこない（204）"
  else
    # KVは結果整合なので、置いたことが伝わるまで少しかかることがあります。
    sleep 3
    code=$(curl -sS -o /dev/null -w '%{http_code}' "$(q "since=$ver1")" || echo 000)
    if [ "$code" = "204" ]; then ok "版が同じなら渡してこない（少し待って 204）"
    else ng "版が同じなのに $code。同じ便を何度も取り込みます"; fi
  fi
else
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$url" || echo 000)
  if [ "$code" = "204" ]; then ok "渡したら消えた（古い形・二度目は 204）"
  else ng "二度目が $code"; fi
fi

# --- 試した便を片づける ---
if [ -n "$ver0" ]; then
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$(q 'slot=kntest')" || echo 000)
  if [ "$code" = "200" ]; then ok "試した便を片づけた（DELETE 200）"
  else ng "片づけられなかった（DELETE が $code）"; fi
fi

# --- 道が合言葉になっている ---
code=$(curl -sS -o /dev/null -w '%{http_code}' "${url}x" || echo 000)
if [ "$code" = "404" ]; then ok "道が違えば渡さない（404）"
else ng "道を間違えても $code が返る。合言葉になっていません"; fi

# --- ブラウザから読める ---
head=$(curl -sS -D - -o /dev/null "$url" 2>/dev/null | tr -d '\r')
allow=$(printf '%s\n' "$head" | awk 'tolower($1) == "access-control-allow-origin:" { print $2 }')
if [ "$allow" = "*" ]; then ok "アプリから読める（CORS）"
else ng "CORSの許しが返っていない（'$allow'）。アプリからは読めません"; fi

if [ -n "$ver0" ]; then
  expose=$(printf '%s\n' "$head" | awk 'tolower($1) == "access-control-expose-headers:" { $1=""; print }')
  case "$expose" in *X-Kn-Ver*) ok "版がブラウザから読める";;
    *) ng "X-Kn-Ver が Expose されていません。アプリは古い形だと判断します";; esac
fi

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s件すべて通りました。\033[0m\n' "$pass"
  exit 0
else
  printf '\033[31m%s件が通りませんでした（%s件は通過）。\033[0m\n' "$fail" "$pass"
  exit 1
fi
