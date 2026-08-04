#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import time
import datetime
import os
import signal
import json
import unicodedata
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

CONFIG_URL = "http://118.31.223.166:3000/api/config"
QUOTE_URL = "http://118.31.223.166:3000/quote?symbol="
CLI_URL = "http://118.31.223.166:3000/cli?symbol="
FALLBACK_SYMBOL = "sh601138,sh600021,sz300490,sz002759"

# ANSI Escape Sequences
SMCUP = "\033[?1049h"   # Enter alternate screen buffer
RMCUP = "\033[?1049l"   # Exit alternate screen buffer
CIVIS = "\033[?25l"     # Hide cursor
CNORM = "\033[?25h"     # Show cursor
CLEAR = "\033[2J"       # Clear screen
CUP_0_0 = "\033[H"      # Move cursor to top-left

# ANSI Color Codes
COLOR_RESET   = "\033[0m"
COLOR_BOLD    = "\033[1m"
COLOR_RED     = "\033[1;31m"  # Red for Up (+)
COLOR_GREEN   = "\033[1;32m"  # Green for Down (-)
COLOR_GRAY    = "\033[90m"    # Gray for Flat (0)
COLOR_YELLOW  = "\033[1;33m"  # Yellow / Gold
COLOR_CYAN    = "\033[1;36m"  # Cyan for Symbols
COLOR_WHITE   = "\033[1;37m"  # Bright White


def get_trading_status() -> tuple:
    """Check if current time is within A-share trading hours (Mon-Fri 09:15-11:30, 13:00-15:00)."""
    now = datetime.datetime.now()
    t = now.time()
    t915 = datetime.time(9, 15)
    t1130 = datetime.time(11, 30)
    t1300 = datetime.time(13, 0)
    t1500 = datetime.time(15, 0)

    if now.weekday() < 5 and ((t915 <= t <= t1130) or (t1300 <= t <= t1500)):
        return True, "●", COLOR_GREEN
    else:
        return False, "●", COLOR_RED


def wcwidth(s: str) -> int:
    """Calculate terminal display width accounting for full-width CJK characters."""
    width = 0
    for char in s:
        if unicodedata.east_asian_width(char) in ('F', 'W'):
            width += 2
        else:
            width += 1
    return width


def pad_str(s: str, width: int, align: str = "left") -> str:
    """Pad string to terminal display width considering CJK characters."""
    w = wcwidth(s)
    pad_len = max(0, width - w)
    if align == "right":
        return " " * pad_len + s
    else:
        return s + " " * pad_len


def get_default_symbol() -> str:
    """Fetch default symbol from remote API, fallback if unavailable."""
    try:
        req = urllib.request.Request(CONFIG_URL, headers={'User-Agent': 'curl/7.68.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                default_symbol = data.get('defaultSymbol')
                if default_symbol:
                    return str(default_symbol)
    except Exception:
        pass
    return FALLBACK_SYMBOL


def fetch_single_quote(symbol: str) -> dict:
    """Fetch structured quote data for a single symbol."""
    url = f"{QUOTE_URL}{symbol}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.68.0'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode('utf-8'))
    except Exception:
        pass
    return {"symbol": symbol, "error": True}


def fetch_all_quotes(symbols: list) -> list:
    """Fetch quote data concurrently for all symbols."""
    with ThreadPoolExecutor(max_workers=min(10, len(symbols))) as executor:
        results = list(executor.map(fetch_single_quote, symbols))
    return results


def render_simple_ticker(quotes: list) -> str:
    """Render compact, clean ticker view (default mode)."""
    current_time = time.strftime("%H:%M:%S")
    is_trading, status_symbol, status_color = get_trading_status()
    status_tag = f" {status_color}{status_symbol}{COLOR_RESET}"
    lines = [f"{COLOR_YELLOW}{current_time}{COLOR_RESET}{status_tag}"]

    valid_quotes = [q for q in quotes if not q.get("error")]

    def get_simple_rate(q):
        try:
            price_val = float(q.get("price", 0.0))
            open_val = float(q.get("open", 0.0))
        except (ValueError, TypeError):
            price_val = open_val = 0.0
        raw_chg_rate = str(q.get("changeRate", "0.00%")).strip()
        if raw_chg_rate.startswith("-") or (open_val > 0 and price_val < open_val):
            return raw_chg_rate if raw_chg_rate.startswith("-") else f"-{raw_chg_rate}"
        elif raw_chg_rate in ("0.00%", "0%") or (price_val - open_val == 0 and price_val == open_val):
            return raw_chg_rate
        else:
            return f"+{raw_chg_rate}" if not raw_chg_rate.startswith("+") else raw_chg_rate

    if valid_quotes:
        name_w = max(wcwidth(q.get("name", "")) for q in valid_quotes)
        price_w = max(wcwidth(f"{float(q.get('price', 0.0)):.2f}") for q in valid_quotes)
        rate_w = max(wcwidth(get_simple_rate(q)) for q in valid_quotes)
    else:
        name_w = price_w = rate_w = 6

    for q in quotes:
        if q.get("error"):
            lines.append(f"{COLOR_RED}❌ {q.get('symbol')}: 无法获取数据{COLOR_RESET}")
            continue

        name = q.get("name", "")
        try:
            price_val = float(q.get("price", 0.0))
        except (ValueError, TypeError):
            price_val = 0.0

        rate_str = get_simple_rate(q)
        try:
            open_val = float(q.get("open", 0.0))
        except (ValueError, TypeError):
            open_val = 0.0

        if rate_str.startswith("-"):
            color = COLOR_GREEN
        elif rate_str.startswith("+"):
            color = COLOR_RED
        else:
            color = COLOR_GRAY

        name_fmt = pad_str(name, name_w, "left")
        price_fmt = pad_str(f"{price_val:.2f}", price_w, "left")
        rate_fmt = pad_str(rate_str, rate_w, "left")

        line = f"{name_fmt} {price_fmt} {color}{rate_fmt}{COLOR_RESET}"
        lines.append(line)

    return "\n".join(lines) + "\n\033[K"


def render_bitcoin_ticker(quotes: list) -> str:
    """Render Bitcoin/Crypto style ASCII table view."""
    current_time = time.strftime("%Y-%m-%d %H:%M:%S")
    is_trading, status_symbol, status_color = get_trading_status()

    valid_quotes = [q for q in quotes if not q.get("error")]

    def get_row_info(q):
        try:
            price_val = float(q.get("price", 0.0))
            open_val = float(q.get("open", 0.0))
            high_val = float(q.get("high", 0.0))
            low_val = float(q.get("low", 0.0))
        except (ValueError, TypeError):
            price_val = open_val = high_val = low_val = 0.0

        raw_chg_rate = str(q.get("changeRate", "0.00%")).strip()
        chg_amount = price_val - open_val if open_val > 0 else 0.0

        if raw_chg_rate.startswith("-") or chg_amount < 0:
            color = COLOR_GREEN
            icon = "▼"
            rate_str = raw_chg_rate if raw_chg_rate.startswith("-") else f"-{raw_chg_rate}"
            chg_str = f"{icon} {chg_amount:.2f}"
        elif raw_chg_rate in ("0.00%", "0%") or (chg_amount == 0 and price_val == open_val):
            color = COLOR_GRAY
            icon = "▬"
            rate_str = raw_chg_rate
            chg_str = f"{icon} 0.00"
        else:
            color = COLOR_RED
            icon = "▲"
            rate_str = f"+{raw_chg_rate}" if not raw_chg_rate.startswith("+") else raw_chg_rate
            chg_str = f"{icon} +{chg_amount:.2f}"

        return {
            "symbol": q.get("symbol", ""),
            "name": q.get("name", ""),
            "price_str": f"{price_val:.2f}",
            "chg_str": chg_str,
            "rate_str": rate_str,
            "high_str": f"{high_val:.2f}",
            "low_str": f"{low_val:.2f}",
            "color": color
        }

    row_data_list = [get_row_info(q) for q in valid_quotes]

    col_w = {
        "symbol": max([wcwidth("SYMBOL")] + [wcwidth(r["symbol"]) for r in row_data_list]) if row_data_list else wcwidth("SYMBOL"),
        "name": max([wcwidth("NAME")] + [wcwidth(r["name"]) for r in row_data_list]) if row_data_list else wcwidth("NAME"),
        "price": max([wcwidth("PRICE")] + [wcwidth(r["price_str"]) for r in row_data_list]) if row_data_list else wcwidth("PRICE"),
        "change": max([wcwidth("CHANGE")] + [wcwidth(r["chg_str"]) for r in row_data_list]) if row_data_list else wcwidth("CHANGE"),
        "chg_pct": max([wcwidth("CHG %")] + [wcwidth(r["rate_str"]) for r in row_data_list]) if row_data_list else wcwidth("CHG %"),
        "high": max([wcwidth("HIGH")] + [wcwidth(r["high_str"]) for r in row_data_list]) if row_data_list else wcwidth("HIGH"),
        "low": max([wcwidth("LOW")] + [wcwidth(r["low_str"]) for r in row_data_list]) if row_data_list else wcwidth("LOW"),
    }

    total_w = sum(col_w.values()) + len(col_w) * 3 + 1
    lines = []
    
    # 1. Header Banner
    top_border = f"┌{'─' * (total_w - 2)}┐"
    lines.append(f"{COLOR_YELLOW}{top_border}{COLOR_RESET}")

    title_left = " ₿ STOCK & CRYPTO TICKER MONITOR "
    title_right_plain = f" [ {current_time} {status_symbol} ] "
    title_right = f" [ {COLOR_CYAN}{current_time}{COLOR_RESET} {status_color}{status_symbol}{COLOR_CYAN} ] "
    banner_space = total_w - 2 - wcwidth(title_left) - wcwidth(title_right_plain)
    if banner_space < 0:
        banner_space = 0
    banner_content = f"│{COLOR_BOLD}{COLOR_YELLOW}{title_left}{COLOR_RESET}{' ' * banner_space}{COLOR_CYAN}{title_right}{COLOR_RESET}│"
    lines.append(banner_content)

    sep_border = f"├{'─' * (col_w['symbol'] + 2)}┬{'─' * (col_w['name'] + 2)}┬{'─' * (col_w['price'] + 2)}┬{'─' * (col_w['change'] + 2)}┬{'─' * (col_w['chg_pct'] + 2)}┬{'─' * (col_w['high'] + 2)}┬{'─' * (col_w['low'] + 2)}┤"
    lines.append(f"{COLOR_YELLOW}{sep_border}{COLOR_RESET}")

    # 2. Table Headers
    hdr_sym = pad_str("SYMBOL", col_w["symbol"], "left")
    hdr_nam = pad_str("NAME", col_w["name"], "left")
    hdr_prc = pad_str("PRICE", col_w["price"], "left")
    hdr_chg = pad_str("CHANGE", col_w["change"], "left")
    hdr_pct = pad_str("CHG %", col_w["chg_pct"], "left")
    hdr_hgh = pad_str("HIGH", col_w["high"], "left")
    hdr_low = pad_str("LOW", col_w["low"], "left")

    header_row = f"│ {COLOR_WHITE}{hdr_sym}{COLOR_RESET} │ {COLOR_WHITE}{hdr_nam}{COLOR_RESET} │ {COLOR_WHITE}{hdr_prc}{COLOR_RESET} │ {COLOR_WHITE}{hdr_chg}{COLOR_RESET} │ {COLOR_WHITE}{hdr_pct}{COLOR_RESET} │ {COLOR_WHITE}{hdr_hgh}{COLOR_RESET} │ {COLOR_WHITE}{hdr_low}{COLOR_RESET} │"
    lines.append(header_row)

    lines.append(f"{COLOR_YELLOW}{sep_border}{COLOR_RESET}")

    # 3. Table Rows
    for q in quotes:
        if q.get("error"):
            sym = pad_str(q.get("symbol", ""), col_w["symbol"], "left")
            err_msg = pad_str("❌ Failed to fetch data", total_w - col_w["symbol"] - 7, "left")
            lines.append(f"│ {COLOR_CYAN}{sym}{COLOR_RESET} │ {COLOR_RED}{err_msg}{COLOR_RESET} │")
            continue

        r = get_row_info(q)
        sym_str = pad_str(r["symbol"], col_w["symbol"], "left")
        name_str = pad_str(r["name"], col_w["name"], "left")
        price_fmt = pad_str(r["price_str"], col_w["price"], "left")
        chg_fmt = pad_str(r["chg_str"], col_w["change"], "left")
        pct_fmt = pad_str(r["rate_str"], col_w["chg_pct"], "left")
        high_fmt = pad_str(r["high_str"], col_w["high"], "left")
        low_fmt = pad_str(r["low_str"], col_w["low"], "left")
        color = r["color"]

        row = (
            f"│ {COLOR_CYAN}{sym_str}{COLOR_RESET} │ "
            f"{COLOR_WHITE}{name_str}{COLOR_RESET} │ "
            f"{COLOR_BOLD}{price_fmt}{COLOR_RESET} │ "
            f"{color}{chg_fmt}{COLOR_RESET} │ "
            f"{color}{pct_fmt}{COLOR_RESET} │ "
            f"{high_fmt} │ "
            f"{low_fmt} │"
        )
        lines.append(row)

    # 4. Bottom Border
    bottom_border = f"└{'─' * (col_w['symbol'] + 2)}┴{'─' * (col_w['name'] + 2)}┴{'─' * (col_w['price'] + 2)}┴{'─' * (col_w['change'] + 2)}┴{'─' * (col_w['chg_pct'] + 2)}┴{'─' * (col_w['high'] + 2)}┴{'─' * (col_w['low'] + 2)}┘"
    lines.append(f"{COLOR_YELLOW}{bottom_border}{COLOR_RESET}")

    return "\n".join(lines) + "\n"


def cleanup(signum=None, frame=None):
    """Restore cursor, clear terminal screen and exit alternate buffer on finish."""
    sys.stdout.write("\033[2J\033[3J\033[H" + CNORM + RMCUP)
    sys.stdout.flush()
    sys.exit(0)


def main():
    # Signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Mode and args parsing
    use_bitcoin_style = False
    duration = 10  # 默认显示 10 秒
    args = sys.argv[1:]
    symbol_args = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("--bitcoin", "-b", "--btc", "--table"):
            use_bitcoin_style = True
        elif arg in ("-t", "--time", "-d", "--duration") and i + 1 < len(args):
            try:
                duration = float(args[i + 1])
                i += 1
            except ValueError:
                pass
        elif not arg.startswith("-"):
            symbol_args.append(arg)
        i += 1

    if symbol_args:
        symbols_raw = ",".join(symbol_args)
    else:
        symbols_raw = get_default_symbol()

    symbols = [s.strip() for s in symbols_raw.split(',') if s.strip()]

    # Setup terminal: alternate screen buffer, hide cursor, clear screen
    sys.stdout.write(SMCUP + CIVIS + CLEAR + CUP_0_0)
    sys.stdout.flush()

    start_time = time.time()

    try:
        while True:
            quotes = fetch_all_quotes(symbols)

            if use_bitcoin_style:
                rendered_output = render_bitcoin_ticker(quotes)
            else:
                rendered_output = render_simple_ticker(quotes)

            # Move cursor to top-left and draw
            sys.stdout.write(CUP_0_0)
            sys.stdout.write(rendered_output)
            sys.stdout.flush()

            # Check if duration limit reached
            if duration > 0 and (time.time() - start_time) >= duration:
                break

            time.sleep(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
