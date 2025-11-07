#!/bin/bash

CONFIG_URL="http://localhost:3000/api/config"

# 用 sed 提取 JSON 中的 defaultSymbol 值
DEFAULT_SYMBOL=$(curl -s "$CONFIG_URL" | sed -n 's/.*"defaultSymbol":"\([^"]*\)".*/\1/p')

# 如果接口请求失败或返回为空，则设置备用默认值
if [ -z "$DEFAULT_SYMBOL" ]; then
  DEFAULT_SYMBOL="sh601138,sh600021,sz300490,sz002759"
fi

# 如果没有传入参数，就用默认值
SYMBOL=${1:-$DEFAULT_SYMBOL}
URL="http://localhost:3000/cli?symbol=${SYMBOL}"

# 保存并进入全屏模式，隐藏光标
tput smcup
tput civis

# 退出时恢复终端状态
trap "tput cnorm; tput rmcup" EXIT

# 清空一次并固定光标在顶部
clear
tput cup 0 0

while true; do
  TMP_FILE=$(mktemp)
  # Get HTTP status code, and write body to temp file
  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TMP_FILE" "$URL")

  if [ "$HTTP_CODE" -eq 500 ]; then
    clear
  else
    # 回到顶部覆盖输出（不清屏）
    tput cup 0 0
    echo "$(date '+%H:%M:%S')"
    cat "$TMP_FILE"
  fi
  rm -f "$TMP_FILE"
  sleep 1
done
