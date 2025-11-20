#!/bin/bash
# 🎉 Celebration Terminal Animation (macOS & Linux Compatible)
# Author: TaoBeer + GPT-5.1 Thinking

cleanup() {
    tput cnorm       # 恢复光标
    tput rmcup       # 恢复之前的屏幕
    clear
    exit
}
trap cleanup EXIT INT

tput smcup          # 进入备用屏幕缓冲区
tput civis          # 隐藏光标
clear

ROWS=$(tput lines)
COLS=$(tput cols)

# 文案
TITLE="🎉 CONGRATULATIONS! 🎉"
SUBTITLE="✨ YOU DID IT! ✨"

# 随机字符（五彩纸屑）
CHARS=( "*" "+" "✦" "✸" "✺" "❋" "❖" "•" "·" "✶" )
COLORS=(31 32 33 34 35 36 37)

draw() {
    local row=$1 col=$2 color=$3 char=$4
    tput cup "$row" "$col"
    tput setaf "$color"
    printf "%s" "$char"
    tput sgr0
}

# 居中绘制文本，支持传入行号
center_text() {
    local text="$1"
    local color=$2
    local row=$3
    local col=$(( (COLS - ${#text}) / 2 ))
    tput cup "$row" "$col"
    tput bold
    tput setaf "$color"
    printf "%s" "$text"
    tput sgr0
}

# 庆祝动画（避免遮挡标题 & 节奏偏慢 + 时间有点随机）
celebrate() {
    local steps=80   # 总循环次数，整体时长主要由它 + sleep 决定

    # 计算标题所在行和列范围
    local title_row=$((ROWS / 2))
    local title_start_col=$(( (COLS - ${#TITLE}) / 2 ))
    local title_end_col=$(( title_start_col + ${#TITLE} - 1 ))

    for ((i=0; i<steps; i++)); do
        # 每轮撒的数量少一点，视觉更柔和
        for ((n=0; n<8; n++)); do
            r=$((RANDOM % ROWS))
            c=$((RANDOM % COLS))

            # 跳过标题文本所在区域，防止遮挡 🎉 CONGRATULATIONS! 🎉
            if [[ $r -eq $title_row && $c -ge $title_start_col && $c -le $title_end_col ]]; then
                continue
            fi

            color=${COLORS[$RANDOM % ${#COLORS[@]}]}
            char=${CHARS[$RANDOM % ${#CHARS[@]}]}
            draw "$r" "$c" "$color" "$char"
        done

        # 基础间隔：控制整体速度（越大越慢）
        sleep 0.14

        # 🔁 轻微随机延时（0 ~ 0.08 秒），时间分布看起来更“随机”
        extra_delay=$((RANDOM % 80))
        # 用 printf + bash 算浮点，不依赖 bc
        sleep $(printf "0.%03d" "$extra_delay")
    done
}

# 主体循环动画
while true; do
    clear
    title_row=$((ROWS / 2))
    subtitle_row=$((title_row + 2))

    # 保证先画标题，再撒纸屑，这样标题一开始就完整显示
    center_text "$TITLE" 33 "$title_row"
    celebrate
    center_text "$SUBTITLE" 36 "$subtitle_row"

    sleep 1.5
done
