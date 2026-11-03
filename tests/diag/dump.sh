#!/usr/bin/env bash
# DIAG（一時）：WebKit の頁のプロセスのメインスレッドのスタックを二度（2秒あけて）撮る。
out=${1:-/tmp/diag-stacks.log}
for round in 1 2; do
  echo "=== round $round $(date -u +%T.%N)" >> "$out"
  for pid in $(pgrep -f 'WebKitWebProcess|WPEWebProcess'); do
    echo "--- pid $pid $(ps -o rss=,pcpu=,etime=,args= -p "$pid" | cut -c1-160)" >> "$out"
    sudo timeout 40 gdb -p "$pid" -batch -nx \
      -ex "set pagination off" -ex "thread 1" -ex "bt 60" \
      -ex "info threads" 2>&1 | grep -v '^\[New LWP\|^warning: \|^Download' | head -120 >> "$out"
  done
  sleep 2
done
