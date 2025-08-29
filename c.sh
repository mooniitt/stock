#!/bin/bash

# 默认股票代码
DEFAULT_SYMBOL="sh603256"

# 如果没有传入参数，就用默认值
SYMBOL=${1:-$DEFAULT_SYMBOL}

URL="http://localhost:3000/quote?symbol=${SYMBOL}"

# Enter fullscreen
tput smcup
clear

# Hide cursor
tput civis

# Restore cursor and exit fullscreen on exit
trap "tput cnorm; tput rmcup" EXIT

while true; do
  CHANGE=$(curl -s "$URL" | jq -r '.changeRate')
  # 动态刷新（同一行更新）
  # echo -ne "(${SYMBOL}) : ${CHANGE}    \r"
  echo -ne "${CHANGE}    \r"
  sleep 1
done
