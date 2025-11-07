#!/bin/bash
# 🎉 Celebration Terminal Animation (macOS & Linux Compatible)
# Author: TaoBeer + GPT-5

cleanup() {
    tput cnorm
    tput rmcup
    clear
    exit
}
trap cleanup EXIT INT

tput smcup
tput civis
clear

ROWS=$(tput lines)
COLS=$(tput cols)

# 随机字符（五彩纸屑）
CHARS=( "*" "+" "✦" "✸" "✺" "❋" "❖" "•" "·" "✶" )
COLORS=(31 32 33 34 35 36 37)

draw() {
    local row=$1 col=$2 color=$3 char=$4
    tput cup $row $col
    tput setaf $color
    printf "%s" "$char"
    tput sgr0
}

# 绘制庆祝文字
center_text() {
    local text="$1"
    local color=$2
    local row=$((ROWS / 2))
    local col=$(( (COLS - ${#text}) / 2 ))
    tput cup $row $col
    tput bold
    tput setaf $color
    printf "%s" "$text"
    tput sgr0
}

# 庆祝动画
celebrate() {
    local steps=100
    for ((i=0; i<steps; i++)); do
        # 随机散落五彩纸屑
        for ((n=0; n<20; n++)); do
            r=$((RANDOM % ROWS))
            c=$((RANDOM % COLS))
            color=${COLORS[$RANDOM % ${#COLORS[@]}]}
            char=${CHARS[$RANDOM % ${#CHARS[@]}]}
            draw $r $c $color "$char"
        done
        sleep 0.05
    done
}

# 主体动画
while true; do
    clear
    center_text "🎉 CONGRATULATIONS! 🎉" 33
    celebrate
    center_text "✨ YOU DID IT! ✨" 36
    sleep 1.5
done
