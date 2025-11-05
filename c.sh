#!/bin/bash

# 默认股票代码
DEFAULT_SYMBOL="sz301526,sz300490,sz002759"

# 如果没有传入参数，就用默认值
SYMBOL=${1:-$DEFAULT_SYMBOL}

URL="http://localhost:3000/cli?symbol=${SYMBOL}"

# 进入全屏模式并隐藏光标
tput smcup
tput civis

# 退出时恢复终端状态
trap "tput cnorm; tput rmcup" EXIT

# 循环刷新
while true; do
  clear
  echo "$(date '+%H:%M:%S')"
  curl -s "$URL"
  sleep 10
done
