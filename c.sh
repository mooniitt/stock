#!/bin/bash

# 默认股票代码
DEFAULT_SYMBOL="sh601138,sz300490,sz002759"
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
  # 回到顶部覆盖输出（不清屏）
  tput cup 0 0
  echo "$(date '+%H:%M:%S')"
  curl -s "$URL"
  sleep 1
done
