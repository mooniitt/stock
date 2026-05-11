#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");

const DEFAULT_SYMBOL = "sz301308";
const DEFAULT_STOCK_NAME = "江波龙";
const DEFAULT_EASTMONEY_SECID = "0.301308";
const DEFAULT_INTERVAL_SECONDS = 15;
const BACKTEST_HORIZONS = [1, 3, 5, 10];
const STOCK_ALIASES = {
  江波龙: { symbol: "sz301308", secid: "0.301308", name: "江波龙" },
  东山精密: { symbol: "sz002384", secid: "0.002384", name: "东山精密" },
  華自科技: { symbol: "sz300490", secid: "0.300490", name: "华自科技" },
  华自科技: { symbol: "sz300490", secid: "0.300490", name: "华自科技" },
  诺德股份: { symbol: "sh600110", secid: "1.600110", name: "诺德股份" },
  上海电影: { symbol: "sh601595", secid: "1.601595", name: "上海电影" },
  宏和科技: { symbol: "sh603256", secid: "1.603256", name: "宏和科技" },
};
const WATCHLIST = ["江波龙", "东山精密", "华自科技", "诺德股份", "上海电影", "宏和科技"];
const PROFILE_WEIGHTS = {
  default: {
    price: 1,
    money: 1.2,
    sentiment: 0.7,
    cycle: 1,
    intraday: 0.5,
    theme: 0.4,
    risk: 1,
  },
  conservative: {
    price: 1,
    money: 1.6,
    sentiment: 0.5,
    cycle: 1.1,
    intraday: 0.4,
    theme: 0.25,
    risk: 1.4,
  },
  aggressive: {
    price: 1.2,
    money: 1,
    sentiment: 0.8,
    cycle: 1,
    intraday: 0.8,
    theme: 0.6,
    risk: 0.7,
  },
  holiday: {
    price: 0.85,
    money: 1.4,
    sentiment: 0.5,
    cycle: 0.9,
    intraday: 0.4,
    theme: 0.25,
    risk: 1.5,
  },
  earnings: {
    price: 0.9,
    money: 1.5,
    sentiment: 0.5,
    cycle: 0.8,
    intraday: 0.4,
    theme: 0.25,
    risk: 1.7,
  },
};
const INDEXES = [
  { key: "cyb", name: "创业板指", secid: "0.399006" },
  { key: "sz", name: "深证成指", secid: "0.399001" },
  { key: "sh", name: "上证指数", secid: "1.000001" },
];

const args = process.argv.slice(2);
const argSet = new Set(args);

function optionValue(name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");

  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return "";
}

function normalizeSymbol(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return DEFAULT_SYMBOL;
  const alias = STOCK_ALIASES[String(value || "").trim()];
  if (alias) return alias.symbol;
  if (/^(sh|sz|bj)\d{6}$/.test(input)) return input;
  if (/^\d{6}$/.test(input)) {
    if (input.startsWith("6")) return `sh${input}`;
    if (/^[023]/.test(input)) return `sz${input}`;
  }
  return input;
}

function secidFromSymbol(symbol) {
  const secid = optionValue("secid");
  if (/^[01]\.\d{6}$/.test(secid)) return secid;

  const alias = STOCK_ALIASES[String(symbol || "").trim()];
  if (alias) return alias.secid;

  const normalized = normalizeSymbol(symbol);
  const code = normalized.match(/\d{6}$/)?.[0];
  if (!code) return DEFAULT_EASTMONEY_SECID;
  if (normalized.startsWith("sh")) return `1.${code}`;
  if (normalized.startsWith("sz")) return `0.${code}`;
  if (normalized.startsWith("bj")) {
    throw new Error("北交所股票请使用 --secid 手动指定东方财富 secid，例如 --secid=0.8xxxxx。");
  }
  return DEFAULT_EASTMONEY_SECID;
}

function symbolFromSecid(secid) {
  const code = secid.split(".")[1];
  if (!code) return DEFAULT_SYMBOL;
  if (secid.startsWith("1.")) return `sh${code}`;
  if (secid.startsWith("0.")) return `sz${code}`;
  return code;
}

function stockNameFromInput(value) {
  const alias = STOCK_ALIASES[String(value || "").trim()];
  return alias?.name || "";
}

const hasExplicitTarget = Boolean(
  optionValue("symbol") || optionValue("stock") || optionValue("secid"),
);
const requestedInput = optionValue("symbol") || optionValue("stock") || DEFAULT_SYMBOL;
const requestedSymbol = normalizeSymbol(requestedInput);
const EASTMONEY_SECID = secidFromSymbol(requestedSymbol);
const SYMBOL = optionValue("secid") && !optionValue("symbol")
  ? symbolFromSecid(EASTMONEY_SECID)
  : requestedSymbol;
const STOCK_NAME = optionValue("name") || stockNameFromInput(requestedInput) || DEFAULT_STOCK_NAME;

const EASTMONEY_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: `https://quote.eastmoney.com/${SYMBOL}.html`,
  Accept: "application/json,text/plain,*/*",
};

const once = argSet.has("--once");
const backtest = argSet.has("--backtest");
const intraday = argSet.has("--intraday");
const compact = argSet.has("--compact");
const watchlist = argSet.has("--watchlist") || argSet.has("--list");
const pick = argSet.has("--pick") || (!hasExplicitTarget && !watchlist && !intraday && !backtest && !compact);
const jsonSummary = argSet.has("--json-summary");
const fast = argSet.has("--fast");
const help = argSet.has("--help") || argSet.has("-h");
const intervalArg = args.find((arg) => arg.startsWith("--interval="));
const thresholdArg = args.find((arg) => arg.startsWith("--threshold="));
const profile = optionValue("profile") || "default";
const holidayDays = Math.max(0, toNumber(optionValue("holiday-days")));
const earningsDays = Math.max(0, toNumber(optionValue("earnings-days")));
const themeChange = toNumber(optionValue("theme-change"));
const customWeights = optionValue("weights");
const intervalSeconds = Math.max(
  5,
  Number(intervalArg?.split("=")[1] || DEFAULT_INTERVAL_SECONDS),
);
const backtestThreshold = Number(thresholdArg?.split("=")[1] || 6.5);
const strategyWeights = buildStrategyWeights(profile, customWeights);
const requestAttempts = fast ? 3 : 5;
const requestTimeoutSeconds = fast ? 8 : 12;
const requestTimeoutMs = requestTimeoutSeconds * 1000;

if (help) {
  console.log(`用法:
  npm run monitor:stock -- --symbol=sz301308
  npm run monitor:stock -- --symbol=上海电影 --once
  npm run monitor:stock -- --symbol=600519 --once
  npm run monitor:stock -- --pick
  npm run monitor:stock -- --watchlist
  npm run monitor:stock -- --secid=0.300750 --name=宁德时代 --backtest

参数:
  --symbol     股票代码或内置中文名，支持 江波龙、东山精密、华自科技、诺德股份、上海电影、宏和科技、sz301308、sh600519。
  --secid      东方财富 secid，优先级高于自动推断；特殊市场建议手动传入。
  --name       显示名称，可选；实时行情会优先使用接口返回名称。
  --pick       从默认自选里选择当前最合适的一只；monitor:stock 无参数时默认启用。
  --watchlist  一次性输出内置列表：${WATCHLIST.join("、")}。
  --intraday   输出今天开盘以来每分钟分时数据。
  --profile    权重模板：default、conservative、aggressive、holiday、earnings。
  --weights    手动权重，例如 price=1.2,money=1.6,sentiment=0.5,cycle=1,intraday=0.5。
  --holiday-days 临近假期天数；越近越降低成交量突破可信度。
  --earnings-days 距财报披露天数；越近越扣不确定性分。
  --theme-change 美股/海外相关题材涨跌幅百分数，例如 --theme-change=3.5。
  --fast       快速请求模式；择优时默认使用，失败股票直接跳过。
  --once       只输出一次快照。
  --backtest   使用历史数据回测信号可靠性。
  --interval   持续监控刷新秒数，默认 15，最小 5。
  --threshold  买入评分阈值，默认 6.5。`);
  process.exit(0);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function pct(value, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value * 100, digits)}%`;
}

function money(value) {
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 100000000) return `${sign}${round(abs / 100000000)}亿`;
  if (abs >= 10000) return `${sign}${round(abs / 10000)}万`;
  return `${sign}${round(abs)}`;
}

function parseWeightConfig(text) {
  if (!text) return {};
  return Object.fromEntries(
    text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value] = part.split("=");
        return [key, Number(value)];
      })
      .filter(([key, value]) => key && Number.isFinite(value)),
  );
}

function buildStrategyWeights(name, text) {
  const base = PROFILE_WEIGHTS[name] || PROFILE_WEIGHTS.default;
  return {
    ...base,
    ...parseWeightConfig(text),
  };
}

function formatWeights(weights) {
  return Object.entries(weights)
    .map(([key, value]) => `${key}=${round(value, 2)}`)
    .join(",");
}

function cachePath(name) {
  return path.join(CACHE_DIR, `${name}.json`);
}

function readCache(name) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
  } catch {
    return null;
  }
}

function writeCache(name, payload) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      cachePath(name),
      JSON.stringify({ savedAt: new Date().toISOString(), payload }, null, 2),
    );
  } catch {
    // Cache is best effort only.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = requestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripProxyEnv(env) {
  const cleanEnv = { ...env };
  for (const name of [
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "ALL_PROXY",
  ]) {
    delete cleanEnv[name];
  }
  return cleanEnv;
}

async function curlJson(url, { cleanProxy = false } = {}) {
  const headers = Object.entries(EASTMONEY_HEADERS).flatMap(([name, value]) => [
    "-H",
    `${name}: ${value}`,
  ]);

  const { stdout } = await execFileAsync(
    "curl",
    ["-s", "-L", "--fail", "--max-time", String(requestTimeoutSeconds), ...headers, url],
    {
      env: cleanProxy ? stripProxyEnv(process.env) : process.env,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (!stdout.trim()) throw new Error("empty curl response");
  return JSON.parse(stdout);
}

async function requestJson(url, label, attempts = requestAttempts) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await curlJson(url);
    } catch (error) {
      lastError = error;
      await delay((fast ? 150 : 500) * (index + 1));
    }
  }

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await curlJson(url, { cleanProxy: true });
    } catch (error) {
      lastError = error;
      await delay((fast ? 150 : 500) * (index + 1));
    }
  }

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        { headers: EASTMONEY_HEADERS },
        requestTimeoutMs,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay((fast ? 150 : 500) * (index + 1));
    }
  }

  throw new Error(`${label} request failed: ${lastError?.message || lastError}`);
}

function buildQuoteUrl() {
  return (
    "https://push2.eastmoney.com/api/qt/stock/get" +
    `?secid=${EASTMONEY_SECID}` +
    "&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f124,f169,f170,f171,f292"
  );
}

function buildKlineUrl(secid, beg = "20250101", end = "20500101") {
  return (
    "https://push2his.eastmoney.com/api/qt/stock/kline/get" +
    `?secid=${secid}` +
    "&fields1=f1,f2,f3,f4,f5,f6" +
    "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
    `&klt=101&fqt=1&beg=${beg}&end=${end}`
  );
}

function buildFlowUrl() {
  return (
    "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get" +
    `?secid=${EASTMONEY_SECID}` +
    "&fields1=f1,f2,f3,f7" +
    "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63" +
    "&klt=101&lmt=500"
  );
}

function buildIntradayFlowUrl() {
  return (
    "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get" +
    `?secid=${EASTMONEY_SECID}` +
    "&fields1=f1,f2,f3,f7" +
    "&fields2=f51,f52,f53,f54,f55,f56" +
    "&klt=1&lmt=30"
  );
}

function buildIntradayPriceUrl() {
  return (
    "https://push2his.eastmoney.com/api/qt/stock/trends2/get" +
    `?secid=${EASTMONEY_SECID}` +
    "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
    "&fields2=f51,f52,f53,f54,f55,f56,f57,f58" +
    "&ndays=1&iscr=0&iscca=0"
  );
}

function eastmoneyPrice(value, decimal = 2) {
  const number = toNumber(value);
  if (number === 0 || number === -1) return 0;
  return number / 10 ** decimal;
}

function formatTimestamp(seconds) {
  if (!seconds) {
    const now = new Date();
    return {
      date: now.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      time: now.toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  }

  const date = new Date(seconds * 1000);
  return {
    date: date.toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: date.toLocaleTimeString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function normalizeDate(value) {
  return value.replaceAll("/", "-");
}

function parseKlineRow(raw) {
  const [
    date,
    open,
    close,
    high,
    low,
    volume,
    amount,
    amplitude,
    changeRate,
    change,
    turnoverRate,
  ] = raw.split(",");

  return {
    date,
    open: toNumber(open),
    close: toNumber(close),
    high: toNumber(high),
    low: toNumber(low),
    volume: toNumber(volume),
    amount: toNumber(amount),
    amplitude: toNumber(amplitude),
    changeRate: toNumber(changeRate),
    change: toNumber(change),
    turnoverRate: toNumber(turnoverRate),
  };
}

function parseFlowRow(raw) {
  const [
    date,
    mainNet,
    smallNet,
    mediumNet,
    largeNet,
    superNet,
    mainRatio,
    smallRatio,
    mediumRatio,
    largeRatio,
    superRatio,
    close,
    changeRate,
  ] = raw.split(",");

  return {
    date,
    mainNet: toNumber(mainNet),
    smallNet: toNumber(smallNet),
    mediumNet: toNumber(mediumNet),
    largeNet: toNumber(largeNet),
    superNet: toNumber(superNet),
    mainRatio: toNumber(mainRatio),
    smallRatio: toNumber(smallRatio),
    mediumRatio: toNumber(mediumRatio),
    largeRatio: toNumber(largeRatio),
    superRatio: toNumber(superRatio),
    close: toNumber(close),
    changeRate: toNumber(changeRate),
  };
}

function parseIntradayFlowRow(raw) {
  const [time, mainNet, smallNet, mediumNet, largeNet, superNet] = raw.split(",");
  return {
    time,
    mainNet: toNumber(mainNet),
    smallNet: toNumber(smallNet),
    mediumNet: toNumber(mediumNet),
    largeNet: toNumber(largeNet),
    superNet: toNumber(superNet),
  };
}

function parseIntradayPriceRow(raw) {
  const [time, open, close, high, low, volume, amount, averagePrice] = raw.split(",");
  return {
    time,
    open: toNumber(open),
    close: toNumber(close),
    high: toNumber(high),
    low: toNumber(low),
    volume: toNumber(volume),
    amount: toNumber(amount),
    averagePrice: toNumber(averagePrice),
  };
}

function quoteFromIntradayPrices(priceData) {
  const rows = priceData.rows;
  const first = rows[0];
  const last = rows.at(-1);
  const previousClose = priceData.preClose || first.open;
  return {
    symbol: SYMBOL,
    name: priceData.name || STOCK_NAME,
    open: first.open,
    previousClose,
    price: last.close,
    high: maxBy(rows, "high"),
    low: minBy(rows, "low"),
    volumeLots: rows.reduce((sum, row) => sum + row.volume, 0),
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    date: last.time.slice(0, 10),
    time: `${last.time.slice(11)}:00`,
    change: last.close - previousClose,
    changeRate: previousClose ? ((last.close - previousClose) / previousClose) * 100 : 0,
  };
}

async function fetchQuote(stockRows = []) {
  try {
    const payload = await requestJson(buildQuoteUrl(), "Eastmoney quote");
    const data = payload?.data;
    if (!data) throw new Error("Eastmoney quote response is empty");

    const decimal = toNumber(data.f59) || 2;
    const price = eastmoneyPrice(data.f43, decimal);
    const previousClose = eastmoneyPrice(data.f60, decimal);
    const timestamp = formatTimestamp(toNumber(data.f124));

    return {
      symbol: SYMBOL,
      name: data.f58 || STOCK_NAME,
      open: eastmoneyPrice(data.f46, decimal),
      previousClose,
      price,
      high: eastmoneyPrice(data.f44, decimal),
      low: eastmoneyPrice(data.f45, decimal),
      volumeLots: toNumber(data.f47),
      amount: toNumber(data.f48),
      date: normalizeDate(timestamp.date),
      time: timestamp.time,
      change: eastmoneyPrice(data.f169, decimal),
      changeRate: eastmoneyPrice(data.f170, decimal),
    };
  } catch (quoteError) {
    try {
      return quoteFromIntradayPrices(await fetchIntradayPrices());
    } catch {
      const latest = stockRows.at(-1);
      if (latest) return quoteFromKline(latest, stockRows.at(-2));
      throw quoteError;
    }
  }
}

async function fetchDailyKlines(secid = EASTMONEY_SECID) {
  const cacheKey = `daily-kline-${secid.replace(".", "-")}`;

  try {
    const payload = await requestJson(buildKlineUrl(secid), `daily kline ${secid}`);
    const klines = payload?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error(`daily kline ${secid} response is empty`);
    }
    writeCache(cacheKey, klines);
    return klines.map(parseKlineRow);
  } catch (error) {
    const cached = readCache(cacheKey);
    const klines = cached?.payload;
    if (Array.isArray(klines) && klines.length > 0) {
      return klines.map(parseKlineRow);
    }
    throw error;
  }
}

async function fetchDailyFlows() {
  try {
    const payload = await requestJson(buildFlowUrl(), "daily fund flow");
    const klines = payload?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return [];
    return klines.map(parseFlowRow);
  } catch {
    return [];
  }
}

async function fetchIntradayFlows() {
  try {
    const payload = await requestJson(buildIntradayFlowUrl(), "intraday fund flow");
    const klines = payload?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return [];
    return klines.map(parseIntradayFlowRow);
  } catch {
    return [];
  }
}

async function fetchIntradayPrices() {
  const payload = await requestJson(buildIntradayPriceUrl(), "intraday price");
  const trends = payload?.data?.trends;
  if (!Array.isArray(trends) || trends.length === 0) {
    throw new Error("intraday price response is empty");
  }
  return {
    name: payload.data.name || STOCK_NAME,
    code: payload.data.code || SYMBOL,
    preClose: toNumber(payload.data.preClose || payload.data.prePrice),
    rows: trends.map(parseIntradayPriceRow),
  };
}

async function fetchIndexKlines() {
  const entries = await Promise.all(
    INDEXES.map(async (item) => {
      try {
        return [item.key, await fetchDailyKlines(item.secid)];
      } catch {
        return [item.key, []];
      }
    }),
  );
  return Object.fromEntries(entries);
}

function movingAverage(rows, count, field = "close") {
  const slice = rows.slice(-count);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, row) => sum + row[field], 0) / slice.length;
}

function maxBy(rows, field) {
  return Math.max(...rows.map((row) => row[field]));
}

function minBy(rows, field) {
  return Math.min(...rows.map((row) => row[field]));
}

function rowsUntil(rows, date) {
  return rows.filter((row) => row.date <= date);
}

function isChinaMarketOpen(now = new Date()) {
  const chinaTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }),
  );
  const day = chinaTime.getDay();
  const minutes = chinaTime.getHours() * 60 + chinaTime.getMinutes();
  const morning = minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30;
  const afternoon = minutes >= 13 * 60 && minutes <= 15 * 60;
  return day >= 1 && day <= 5 && (morning || afternoon);
}

function buildLevels(stockRows) {
  const last = stockRows.at(-1);
  const previous = stockRows.at(-2) || last;
  const rowsBeforeToday = stockRows.slice(0, -1);
  const previousThree = rowsBeforeToday.slice(-3);
  const previousFive = rowsBeforeToday.slice(-5);
  const recentThree = stockRows.slice(-3);
  const recentFive = stockRows.slice(-5);
  const recentTen = stockRows.slice(-10);
  const recentTwenty = stockRows.slice(-20);
  const breakoutBaseRows = rowsBeforeToday.slice(-5);
  const ma5 = movingAverage(stockRows, 5);
  const ma10 = movingAverage(stockRows, 10);
  const ma20 = movingAverage(stockRows, 20);
  const avgVolume5 = movingAverage(stockRows, 5, "volume");
  const avgAmount5 = movingAverage(stockRows, 5, "amount");
  const recentHigh = maxBy(recentFive, "high");
  const previousRecentHigh =
    breakoutBaseRows.length > 0 ? maxBy(breakoutBaseRows, "high") : previous.high;
  const supportLow =
    previousThree.length > 0 ? minBy(previousThree, "low") : previous.low;
  const supportHigh =
    previousFive.length > 0
      ? Math.max(previous.close, movingAverage(rowsBeforeToday, 5))
      : previous.close;
  const fiveDayGain =
    recentFive.length >= 2 ? last.close / recentFive[0].close - 1 : 0;
  const threeDayGain =
    recentThree.length >= 2 ? last.close / recentThree[0].close - 1 : 0;
  const drawdownFromTwentyHigh =
    recentTwenty.length > 0 ? last.close / maxBy(recentTwenty, "high") - 1 : 0;

  return {
    lastTradeDate: last.date,
    lastClose: last.close,
    lastHigh: last.high,
    lastLow: last.low,
    previousClose: previous.close,
    previousHigh: previous.high,
    previousLow: previous.low,
    ma5,
    ma10,
    ma20,
    avgVolume5,
    avgAmount5,
    threeDayLow: minBy(recentThree, "low"),
    fiveDayLow: minBy(recentFive, "low"),
    tenDayLow: minBy(recentTen, "low"),
    recentHigh,
    previousRecentHigh,
    fiveDayGain,
    threeDayGain,
    drawdownFromTwentyHigh,
    shortSupportLow: supportLow,
    shortSupportHigh: supportHigh,
    invalidShort: supportLow,
    waveStop: Math.min(movingAverage(rowsBeforeToday, 5) || ma5, supportLow),
  };
}

function latestMarket(indexRowsMap, date) {
  return INDEXES.flatMap((item) => {
    const sourceRows = indexRowsMap[item.key] || [];
    if (sourceRows.length === 0) return [];

    const rows = date ? rowsUntil(sourceRows, date) : sourceRows;
    const usableRows = rows.length ? rows : sourceRows;
    const last = usableRows.at(-1);
    return [{
      ...item,
      latest: last,
      ma5: movingAverage(usableRows, 5),
      ma10: movingAverage(usableRows, 10),
      ma20: movingAverage(usableRows, 20),
    }];
  });
}

function scorePrice(quote, stockRows, levels) {
  const price = quote.price;
  const volumeRatio = levels.avgVolume5 ? quote.volumeLots / levels.avgVolume5 : 0;
  const ma5Gap = levels.ma5 ? price / levels.ma5 - 1 : 0;
  const notes = [];
  let score = 0;

  if (price > levels.ma5 && levels.ma5 > levels.ma10 && levels.ma10 > levels.ma20) {
    score += 1.4;
    notes.push("均线多头排列");
  } else if (price > levels.ma5 && levels.ma5 > levels.ma10) {
    score += 0.8;
    notes.push("短线趋势偏强");
  } else if (price < levels.ma10) {
    score -= 1;
    notes.push("跌破短期均线");
  }

  const nearSupport =
    price >= levels.shortSupportLow && price <= levels.shortSupportHigh * 1.01;
  if (nearSupport) {
    score += 0.8;
    notes.push(`处在短线支撑区 ${round(levels.shortSupportLow)}-${round(levels.shortSupportHigh)}`);
  }

  const breakout = price > levels.previousRecentHigh;
  if (breakout) {
    score += volumeRatio >= 1 ? 1.4 : 0.8;
    notes.push(`突破近 5 日高点 ${round(levels.previousRecentHigh)}`);
  }

  const breakdown = price < levels.invalidShort;
  if (breakdown) {
    score -= 2;
    notes.push(`跌破短线失效价 ${round(levels.invalidShort)}`);
  }

  const overheated = ma5Gap > 0.1 || levels.threeDayGain > 0.2;
  if (overheated) {
    score -= 0.8;
    notes.push(`短线偏热，MA5 乖离 ${pct(ma5Gap)}`);
  }

  return {
    score: clamp(score, -2.5, 3),
    max: 3,
    nearSupport,
    breakout,
    breakdown,
    overheated,
    volumeRatio,
    ma5Gap,
    notes,
  };
}

function countConsecutivePositive(rows, field) {
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index][field] > 0) count += 1;
    else break;
  }
  return count;
}

function scoreMoney(flowRows) {
  if (flowRows.length === 0) {
    return {
      score: 0,
      max: 3,
      latest: {
        date: "无资金流数据",
        mainNet: 0,
        smallNet: 0,
        mediumNet: 0,
        largeNet: 0,
        superNet: 0,
        mainRatio: 0,
      },
      mainPositive3: 0,
      mainPositive5: 0,
      consecutiveMainPositive: 0,
      consecutiveLargePositive: 0,
      netFive: 0,
      notes: ["该日期无资金流数据，按中性处理"],
    };
  }

  const latest = flowRows.at(-1);
  const recentThree = flowRows.slice(-3);
  const recentFive = flowRows.slice(-5);
  const mainPositive3 = recentThree.filter((row) => row.mainNet > 0).length;
  const mainPositive5 = recentFive.filter((row) => row.mainNet > 0).length;
  const consecutiveMainPositive = countConsecutivePositive(flowRows, "mainNet");
  const consecutiveLargePositive = countConsecutivePositive(flowRows, "largeNet");
  const netFive = recentFive.reduce((sum, row) => sum + row.mainNet, 0);
  const notes = [];
  let score = 0;

  if (latest.mainNet > 0) {
    score += latest.mainRatio >= 3 ? 1.3 : 0.8;
    notes.push(`最新主力净流入 ${money(latest.mainNet)}，净比 ${round(latest.mainRatio)}%`);
  } else {
    score -= latest.mainRatio <= -3 ? 1.6 : 1.1;
    notes.push(`最新主力净流出 ${money(latest.mainNet)}，净比 ${round(latest.mainRatio)}%`);
  }

  if (latest.superNet > 0 && latest.largeNet > 0) {
    score += 0.9;
    notes.push("超大单和大单同向净流入");
  } else if (latest.superNet < 0 && latest.largeNet < 0) {
    score -= 0.9;
    notes.push("超大单和大单同向净流出");
  }

  if (consecutiveMainPositive >= 3) {
    score += 1.1;
    notes.push(`主力连续 ${consecutiveMainPositive} 日净流入`);
  } else if (mainPositive3 >= 2) {
    score += 0.5;
    notes.push("近 3 日主力有 2 日净流入");
  } else {
    score -= 0.5;
    notes.push("近 3 日主力流入连续性不足");
  }

  if (mainPositive5 >= 3 && netFive > 0) {
    score += 0.5;
    notes.push(`近 5 日主力合计 ${money(netFive)}`);
  } else if (netFive < 0) {
    score -= 0.5;
    notes.push(`近 5 日主力合计 ${money(netFive)}`);
  }

  return {
    score: clamp(score, -3, 3),
    max: 3,
    latest,
    mainPositive3,
    mainPositive5,
    consecutiveMainPositive,
    consecutiveLargePositive,
    netFive,
    notes,
  };
}

function scoreIntradayMoney(intradayRows) {
  if (intradayRows.length === 0) {
    return {
      score: 0,
      latest: null,
      notes: ["无盘中资金流数据"],
    };
  }

  const latest = intradayRows.at(-1);
  const previous = intradayRows.at(-2) || latest;
  const mainDelta = latest.mainNet - previous.mainNet;
  const largeBlockNet = latest.largeNet + latest.superNet;
  const notes = [];
  let score = 0;

  if (latest.mainNet > 0) {
    score += latest.mainNet >= 100000000 ? 1.2 : 0.7;
    notes.push(`盘中主力累计净流入 ${money(latest.mainNet)}`);
  } else {
    score -= latest.mainNet <= -100000000 ? 1.2 : 0.7;
    notes.push(`盘中主力累计净流出 ${money(latest.mainNet)}`);
  }

  if (mainDelta > 0) {
    score += 0.4;
    notes.push(`最近一分钟主力增加 ${money(mainDelta)}`);
  } else if (mainDelta < 0) {
    score -= 0.4;
    notes.push(`最近一分钟主力减少 ${money(mainDelta)}`);
  }

  if (largeBlockNet > 0) {
    score += 0.6;
    notes.push(`大额资金合计 ${money(largeBlockNet)}`);
  } else {
    score -= 0.6;
    notes.push(`大额资金合计 ${money(largeBlockNet)}`);
  }

  return {
    score: clamp(score, -2, 2),
    latest,
    notes,
  };
}

function scoreSentiment(marketRows) {
  if (marketRows.length === 0) {
    return {
      score: 0,
      max: 2,
      positiveCount: 0,
      aboveMa20Count: 0,
      marketRows,
      notes: ["指数情绪数据不可用，按中性处理"],
    };
  }

  const notes = [];
  let score = 0;
  let positiveCount = 0;
  let aboveMa20Count = 0;

  for (const item of marketRows) {
    if (item.latest.changeRate > 0) positiveCount += 1;
    if (item.latest.close > item.ma20) aboveMa20Count += 1;
  }

  const cyb = marketRows.find((item) => item.key === "cyb");
  if (cyb?.latest.changeRate > 0) {
    score += 0.6;
    notes.push(`创业板当日 ${round(cyb.latest.changeRate)}%`);
  } else {
    score -= 0.6;
    notes.push(`创业板当日 ${round(cyb?.latest.changeRate || 0)}%`);
  }

  if (positiveCount >= 2) {
    score += 0.6;
    notes.push("主要指数多数上涨");
  } else {
    score -= 0.4;
    notes.push("主要指数多数未走强");
  }

  if (aboveMa20Count >= 2) {
    score += 0.6;
    notes.push("指数多数站上 MA20");
  } else {
    score -= 0.4;
    notes.push("指数中期结构偏弱");
  }

  return {
    score: clamp(score, -2, 2),
    max: 2,
    positiveCount,
    aboveMa20Count,
    marketRows,
    notes,
  };
}

function scoreCycle(stockRows, levels) {
  const notes = [];
  let score = 0;
  let stage = "震荡";

  if (levels.lastClose > levels.ma5 && levels.ma5 > levels.ma10 && levels.ma10 > levels.ma20) {
    score += 1;
    stage = "上升趋势";
    notes.push("价格、MA5、MA10、MA20 呈多头结构");
  }

  if (levels.fiveDayGain > 0.18) {
    stage = "加速高波动";
    score -= 0.4;
    notes.push(`5 日涨幅 ${pct(levels.fiveDayGain)}，进入高波动区`);
  }

  if (levels.drawdownFromTwentyHigh > -0.06 && levels.fiveDayGain > 0.1) {
    score -= 0.4;
    notes.push("价格接近 20 日高位，追高容错低");
  }

  if (levels.lastClose > levels.previousRecentHigh && levels.fiveDayGain < 0.18) {
    score += 0.8;
    stage = "温和突破";
    notes.push("突破但未明显过热");
  }

  if (levels.lastClose < levels.ma20) {
    score -= 1;
    stage = "调整弱势";
    notes.push("跌破 MA20，周期转弱");
  }

  return {
    score: clamp(score, -2, 2),
    max: 2,
    stage,
    notes,
  };
}

function scoreEventFactors(quote, levels) {
  const volumeRatio = levels.avgVolume5 ? quote.volumeLots / levels.avgVolume5 : 0;
  const notes = [];
  let themeScore = 0;
  let riskPenalty = 0;

  if (themeChange !== 0) {
    themeScore = clamp(themeChange / 3, -2, 2);
    notes.push(`海外/美股相关题材 ${round(themeChange)}%，题材分 ${round(themeScore, 1)}`);
  }

  if (holidayDays > 0) {
    let penalty = 0.2;
    if (holidayDays <= 1) penalty = 1.2;
    else if (holidayDays <= 3) penalty = 0.8;
    else if (holidayDays <= 5) penalty = 0.4;

    if (volumeRatio < 0.8) {
      penalty += 0.5;
      notes.push(`临近假期且量能不足，量比 ${round(volumeRatio, 2)}`);
    } else {
      notes.push(`临近假期 ${holidayDays} 天，降低突破/量能可信度`);
    }
    riskPenalty += penalty;
  }

  if (earningsDays > 0) {
    let penalty = 0.2;
    if (earningsDays <= 3) penalty = 1.5;
    else if (earningsDays <= 7) penalty = 1;
    else if (earningsDays <= 14) penalty = 0.5;
    riskPenalty += penalty;
    notes.push(`距财报 ${earningsDays} 天，事件不确定性扣分 ${round(penalty, 1)}`);
  }

  if (notes.length === 0) notes.push("无外部事件因子");

  return {
    score: clamp(themeScore - riskPenalty, -3, 2),
    max: 2,
    themeScore,
    riskPenalty,
    notes,
  };
}

function buildContext({ quote, stockRows, flowRows, indexRowsMap, date, intradayFlowRows = [] }) {
  const levels = buildLevels(stockRows);
  const price = scorePrice(quote, stockRows, levels);
  const moneyScore = scoreMoney(flowRows);
  const intradayMoney = scoreIntradayMoney(intradayFlowRows);
  const sentiment = scoreSentiment(latestMarket(indexRowsMap, date));
  const cycle = scoreCycle(stockRows, levels);
  const eventFactors = scoreEventFactors(quote, levels);
  const contributions = {
    base: 2,
    price: price.score * strategyWeights.price,
    money: moneyScore.score * strategyWeights.money,
    sentiment: sentiment.score * strategyWeights.sentiment,
    cycle: cycle.score * strategyWeights.cycle,
    intraday: intradayMoney.score * strategyWeights.intraday,
    theme: eventFactors.themeScore * strategyWeights.theme,
    risk: -eventFactors.riskPenalty * strategyWeights.risk,
  };
  const rawScore = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const totalScore = clamp(rawScore, 0, 10);

  return {
    quote,
    levels,
    price,
    money: moneyScore,
    intradayMoney,
    sentiment,
    cycle,
    eventFactors,
    contributions,
    weights: strategyWeights,
    totalScore,
  };
}

function decisionFromContext(context, threshold = 6.5) {
  const {
    price,
    money: moneyScore,
    intradayMoney,
    sentiment,
    cycle,
    levels,
    totalScore,
  } = context;
  const moneyConfirmed =
    moneyScore.score >= 0.8 || (intradayMoney.score >= 1.2 && moneyScore.score > -1);
  const confirmBreakout =
    price.breakout &&
    price.volumeRatio >= 0.9 &&
    moneyConfirmed &&
    sentiment.score >= 0;
  const pullbackSetup =
    price.nearSupport &&
    moneyConfirmed &&
    sentiment.score >= -0.2 &&
    totalScore >= threshold;

  if (price.breakdown) {
    return {
      action: "RISK",
      text: `跌破 ${round(levels.invalidShort)}，短线买点失效。`,
    };
  }

  if (confirmBreakout && totalScore >= threshold) {
    return {
      action: "BUY",
      text: `突破确认：站上 ${round(levels.previousRecentHigh)} 且资金不弱，可小仓试错。`,
    };
  }

  if (pullbackSetup) {
    return {
      action: "BUY",
      text: `支撑低吸：${round(levels.shortSupportLow)}-${round(levels.shortSupportHigh)} 区间企稳，资金确认后试错。`,
    };
  }

  if (price.nearSupport) {
    return {
      action: "WATCH",
      text: `价格在支撑区，但资金/情绪未确认；等主力净流入转正或重新站上 ${round(levels.lastHigh)}。`,
    };
  }

  if (price.overheated || cycle.stage === "加速高波动") {
    return {
      action: "WAIT",
      text: `趋势强但短线偏热，优先等回踩 ${round(levels.shortSupportHigh)} 或 MA5 ${round(levels.ma5)}。`,
    };
  }

  return {
    action: "WAIT",
    text: `未到高胜率买点；观察 ${round(levels.shortSupportLow)} 支撑和 ${round(levels.previousRecentHigh)} 突破。`,
  };
}

function quoteFromKline(row, previousRow) {
  return {
    symbol: SYMBOL,
    name: STOCK_NAME,
    open: row.open,
    previousClose: previousRow?.close || row.open,
    price: row.close,
    high: row.high,
    low: row.low,
    volumeLots: row.volume,
    amount: row.amount,
    date: row.date,
    time: "15:00:00",
    change: row.change,
    changeRate: row.changeRate,
  };
}

function buildHistoricalContext(index, stockRows, flowRows, indexRowsMap) {
  const row = stockRows[index];
  const previousRow = stockRows[index - 1];
  const date = row.date;
  return buildContext({
    quote: quoteFromKline(row, previousRow),
    stockRows: stockRows.slice(0, index + 1),
    flowRows: rowsUntil(flowRows, date),
    indexRowsMap,
    date,
  });
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeReturns(trades, field) {
  const values = trades.map((trade) => trade[field]).filter(Number.isFinite);
  if (values.length === 0) {
    return { count: 0, winRate: 0, avg: 0, median: 0, min: 0, max: 0 };
  }

  return {
    count: values.length,
    winRate: values.filter((value) => value > 0).length / values.length,
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function evaluateTrade(stockRows, signalIndex, context) {
  const entryIndex = signalIndex + 1;
  const entryRow = stockRows[entryIndex];
  if (!entryRow) return null;

  const entry = entryRow.open;
  const stop = context.levels.invalidShort * 0.995;
  const trade = {
    signalDate: stockRows[signalIndex].date,
    entryDate: entryRow.date,
    entry,
    stop,
    score: context.totalScore,
    actionText: decisionFromContext(context).text,
  };

  for (const horizon of BACKTEST_HORIZONS) {
    const exitIndex = signalIndex + horizon;
    const exitRow = stockRows[exitIndex];
    if (!exitRow || exitIndex < entryIndex) continue;

    const path = stockRows.slice(entryIndex, exitIndex + 1);
    const stopHit = path.some((row) => row.low <= stop);
    const rawReturn = exitRow.close / entry - 1;
    const stopAdjustedReturn = stopHit ? stop / entry - 1 : rawReturn;
    trade[`r${horizon}`] = rawReturn;
    trade[`sr${horizon}`] = stopAdjustedReturn;
    trade[`stop${horizon}`] = stopHit;
  }

  const tenDayPath = stockRows.slice(entryIndex, signalIndex + 11);
  trade.maxAdverse10 =
    tenDayPath.length > 0 ? minBy(tenDayPath, "low") / entry - 1 : 0;
  trade.maxFavorable10 =
    tenDayPath.length > 0 ? maxBy(tenDayPath, "high") / entry - 1 : 0;
  return trade;
}

function runBacktest(stockRows, flowRows, indexRowsMap, threshold) {
  const trades = [];
  const baseline = [];
  let nextSignalIndex = 0;

  for (let index = 30; index < stockRows.length - 10; index += 1) {
    const context = buildHistoricalContext(index, stockRows, flowRows, indexRowsMap);
    const decision = decisionFromContext(context, threshold);

    const baselineTrade = evaluateTrade(stockRows, index, context);
    if (baselineTrade) baseline.push(baselineTrade);

    if (
      index >= nextSignalIndex &&
      decision.action === "BUY" &&
      context.totalScore >= threshold
    ) {
      const trade = evaluateTrade(stockRows, index, context);
      if (trade) {
        trades.push(trade);
        nextSignalIndex = index + 5;
      }
    }
  }

  return { trades, baseline };
}

function printBacktestResult(result, stockRows, threshold) {
  const { trades, baseline } = result;
  console.log(
    `回测区间: ${stockRows[30].date} 至 ${stockRows.at(-11).date} | 阈值: ${round(threshold, 1)} | 信号数: ${trades.length}`,
  );
  console.log("口径: 当日收盘后出信号，下一交易日开盘买入；使用当日及之前数据，跳过 5 日内重叠信号。");

  for (const horizon of BACKTEST_HORIZONS) {
    const strategy = summarizeReturns(trades, `sr${horizon}`);
    const allDays = summarizeReturns(baseline, `sr${horizon}`);
    console.log(
      `${horizon}日: 策略胜率 ${pct(strategy.winRate, 1)} / 均值 ${pct(strategy.avg)} / 中位 ${pct(strategy.median)} | 全样本均值 ${pct(allDays.avg)}`,
    );
  }

  const stopRate10 =
    trades.length === 0
      ? 0
      : trades.filter((trade) => trade.stop10).length / trades.length;
  const avgAdverse =
    trades.length === 0
      ? 0
      : trades.reduce((sum, trade) => sum + trade.maxAdverse10, 0) / trades.length;
  const avgFavorable =
    trades.length === 0
      ? 0
      : trades.reduce((sum, trade) => sum + trade.maxFavorable10, 0) / trades.length;

  console.log(
    `10日风控: 止损触发率 ${pct(stopRate10, 1)} | 平均最大浮亏 ${pct(avgAdverse)} | 平均最大浮盈 ${pct(avgFavorable)}`,
  );

  if (trades.length < 8) {
    console.log("可靠性结论: 样本过少，只能作为过滤条件，不能证明稳定有效。");
    return;
  }

  const strategy5 = summarizeReturns(trades, "sr5");
  const baseline5 = summarizeReturns(baseline, "sr5");
  if (strategy5.avg > baseline5.avg && strategy5.winRate >= 0.52) {
    console.log("可靠性结论: 历史上有一定过滤效果，但仍需严格止损和小仓验证。");
  } else {
    console.log("可靠性结论: 暂未证明信号可靠，不能把它当作机械买入指令。");
  }
}

function formatQuoteLine(quote) {
  const sign = quote.change >= 0 ? "+" : "";
  return [
    `${quote.date} ${quote.time}`,
    `${quote.name}(${SYMBOL})`,
    `现价 ${round(quote.price)}`,
    `涨跌 ${sign}${round(quote.change)} (${sign}${round(quote.changeRate)}%)`,
    `高/低 ${round(quote.high)}/${round(quote.low)}`,
    `成交 ${round(quote.volumeLots / 10000)}万手/${round(quote.amount / 100000000)}亿`,
  ].join(" | ");
}

function printScoreBlock(label, result) {
  const note = result.notes.length ? result.notes.join("；") : "无";
  console.log(`${label}: ${round(result.score, 1)}/${result.max} | ${note}`);
}

function formatContributions(contributions) {
  return Object.entries(contributions)
    .map(([key, value]) => `${key}:${round(value, 1)}`)
    .join(" | ");
}

function printSnapshot(context) {
  const { quote, levels, money: moneyScore, totalScore, cycle } = context;
  const decision = decisionFromContext(context, backtestThreshold);
  const marketStatus = isChinaMarketOpen() ? "交易中" : "非交易时段";

  console.clear();
  console.log(formatQuoteLine(quote));
  console.log(
    `市场状态: ${marketStatus} | 综合评分: ${round(totalScore, 1)}/10 | 动作: ${decision.action} | profile=${profile}`,
  );
  console.log(`权重: ${formatWeights(context.weights)}`);
  console.log(`贡献: ${formatContributions(context.contributions)}`);
  console.log(`策略: ${decision.text}`);
  console.log(
    `关键位: 低吸区 ${round(levels.shortSupportLow)}-${round(levels.shortSupportHigh)} | 弱转强 ${round(levels.lastHigh)} | 强突破 ${round(levels.previousRecentHigh)} | 短线失效 ${round(levels.invalidShort)} | 波段风控 ${round(levels.waveStop)}`,
  );
  printScoreBlock("价格形态", context.price);
  printScoreBlock("资金流", moneyScore);
  if (context.intradayMoney.latest) {
    console.log(
      `盘中资金: ${round(context.intradayMoney.score, 1)}/2 | ${context.intradayMoney.notes.join("；")}`,
    );
  }
  printScoreBlock("市场情绪", context.sentiment);
  console.log(`周期位置: ${round(cycle.score, 1)}/${cycle.max} | ${cycle.stage} | ${cycle.notes.join("；")}`);
  printScoreBlock("事件因子", context.eventFactors);
  console.log(
    `资金明细(${moneyScore.latest.date}): 主力 ${money(moneyScore.latest.mainNet)} | 超大单 ${money(moneyScore.latest.superNet)} | 大单 ${money(moneyScore.latest.largeNet)} | 中单 ${money(moneyScore.latest.mediumNet)} | 小单 ${money(moneyScore.latest.smallNet)}`,
  );
  console.log("纪律: 低吸必须等资金重新确认；跌破短线失效价且不能收回，不做短线买入。");
}

function printCompactSnapshot(context) {
  const { quote, levels, totalScore } = context;
  const decision = decisionFromContext(context, backtestThreshold);
  const sign = quote.change >= 0 ? "+" : "";
  console.log(
    [
      `${quote.name}(${quote.symbol})`,
      `现价 ${round(quote.price)}`,
      `${sign}${round(quote.changeRate)}%`,
      `评分 ${round(totalScore, 1)}/10`,
      decision.action,
      `profile ${profile}`,
      `低吸 ${round(levels.shortSupportLow)}-${round(levels.shortSupportHigh)}`,
      `突破 ${round(levels.previousRecentHigh)}`,
      `失效 ${round(levels.invalidShort)}`,
    ].join(" | "),
  );
}

function contextSummary(context) {
  const decision = decisionFromContext(context, backtestThreshold);
  return {
    name: context.quote.name,
    symbol: context.quote.symbol,
    price: context.quote.price,
    changeRate: context.quote.changeRate,
    score: context.totalScore,
    action: decision.action,
    text: decision.text,
    nearSupport: context.price.nearSupport,
    breakout: context.price.breakout,
    overheated: context.price.overheated,
    breakdown: context.price.breakdown,
    moneyScore: context.money.score,
    intradayMoneyScore: context.intradayMoney.score,
    sentimentScore: context.sentiment.score,
    cycleStage: context.cycle.stage,
    supportLow: context.levels.shortSupportLow,
    supportHigh: context.levels.shortSupportHigh,
    breakoutPrice: context.levels.previousRecentHigh,
    invalidPrice: context.levels.invalidShort,
    profile,
  };
}

async function loadAllData() {
  const [stockRows, flowRows, indexRowsMap] = await Promise.all([
    fetchDailyKlines(EASTMONEY_SECID),
    fetchDailyFlows(),
    fetchIndexKlines(),
  ]);
  return { stockRows, flowRows, indexRowsMap };
}

async function runOnce() {
  const stockRows = await fetchDailyKlines(EASTMONEY_SECID);
  const quote = await fetchQuote(stockRows);
  const [flowRows, indexRowsMap, intradayFlowRows] = await Promise.all([
    fetchDailyFlows(),
    fetchIndexKlines(),
    fetchIntradayFlows(),
  ]);
  const context = buildContext({
    quote,
    stockRows,
    flowRows,
    indexRowsMap,
    date: stockRows.at(-1).date,
    intradayFlowRows,
  });
  if (jsonSummary) {
    console.log(JSON.stringify(contextSummary(context)));
  } else if (compact) {
    printCompactSnapshot(context);
  } else {
    printSnapshot(context);
  }
}

async function runBacktestMode() {
  const { stockRows, flowRows, indexRowsMap } = await loadAllData();
  const result = runBacktest(stockRows, flowRows, indexRowsMap, backtestThreshold);
  printBacktestResult(result, stockRows, backtestThreshold);

  const latestContext = buildHistoricalContext(
    stockRows.length - 1,
    stockRows,
    flowRows,
    indexRowsMap,
  );
  const latestDecision = decisionFromContext(latestContext, backtestThreshold);
  console.log(
    `当前日线信号(${stockRows.at(-1).date}): ${latestDecision.action} | 评分 ${round(latestContext.totalScore, 1)}/10 | ${latestDecision.text}`,
  );
}

function flowByTime(rows) {
  return new Map(rows.map((row) => [row.time, row]));
}

async function runIntradayMode() {
  const [priceData, flowRows] = await Promise.all([
    fetchIntradayPrices(),
    fetchIntradayFlows(),
  ]);
  const flows = flowByTime(flowRows);

  console.log(
    `${priceData.name}(${SYMBOL}) 今日分时 | 分钟数 ${priceData.rows.length} | 昨收 ${round(priceData.preClose)}`,
  );
  console.log(
    [
      "time",
      "open",
      "close",
      "high",
      "low",
      "changeRate",
      "volume",
      "amount",
      "avgPrice",
      "mainNet",
      "superNet",
      "largeNet",
      "mediumNet",
      "smallNet",
    ].join(","),
  );

  for (const row of priceData.rows) {
    const flow = flows.get(row.time);
    const changeRate = priceData.preClose
      ? (row.close / priceData.preClose - 1) * 100
      : 0;
    console.log(
      [
        row.time,
        round(row.open),
        round(row.close),
        round(row.high),
        round(row.low),
        round(changeRate),
        Math.round(row.volume),
        round(row.amount, 0),
        round(row.averagePrice),
        flow ? round(flow.mainNet, 0) : "",
        flow ? round(flow.superNet, 0) : "",
        flow ? round(flow.largeNet, 0) : "",
        flow ? round(flow.mediumNet, 0) : "",
        flow ? round(flow.smallNet, 0) : "",
      ].join(","),
    );
  }
}

async function runWatchlistOnce() {
  if (!compact) {
    console.clear();
    const now = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
    console.log(`自选监控 ${now} | ${WATCHLIST.join("、")}`);
  }

  for (const name of WATCHLIST) {
    const childArgs = [
      process.argv[1],
      `--symbol=${name}`,
      "--once",
      "--compact",
      `--threshold=${backtestThreshold}`,
      `--profile=${profile}`,
    ];
    if (customWeights) childArgs.push(`--weights=${customWeights}`);
    if (holidayDays > 0) childArgs.push(`--holiday-days=${holidayDays}`);
    if (earningsDays > 0) childArgs.push(`--earnings-days=${earningsDays}`);
    if (themeChange !== 0) childArgs.push(`--theme-change=${themeChange}`);

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        childArgs,
        {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 20 * 1024 * 1024,
        },
      );
      process.stdout.write(stdout);
    } catch (error) {
      const message = error.stdout?.trim() || error.stderr?.trim() || error.message;
      console.log(`${name} | ERROR | ${message}`);
    }
  }
}

function pickRank(item) {
  const actionScore = item.action === "BUY" ? 100 : item.action === "WATCH" ? 20 : 0;
  const supportBonus = item.nearSupport ? 4 : 0;
  const breakoutBonus = item.breakout && !item.overheated ? 3 : 0;
  const riskPenalty = item.breakdown ? 100 : item.overheated ? 3 : 0;
  return actionScore + item.score + supportBonus + breakoutBonus - riskPenalty;
}

async function fetchSummaryForStock(name) {
  const childArgs = [
    process.argv[1],
    `--symbol=${name}`,
    "--once",
    "--json-summary",
    `--threshold=${backtestThreshold}`,
    `--profile=${profile}`,
  ];
  if (customWeights) childArgs.push(`--weights=${customWeights}`);
  if (holidayDays > 0) childArgs.push(`--holiday-days=${holidayDays}`);
  if (earningsDays > 0) childArgs.push(`--earnings-days=${earningsDays}`);
  if (themeChange !== 0) childArgs.push(`--theme-change=${themeChange}`);

  const { stdout } = await execFileAsync(process.execPath, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim().split("\n").at(-1));
}

async function runPickOnce() {
  const summaries = [];

  for (const name of WATCHLIST) {
    try {
      summaries.push(await fetchSummaryForStock(name));
    } catch (error) {
      summaries.push({
        name,
        symbol: "",
        score: -1,
        action: "ERROR",
        text: error.stdout?.trim() || error.stderr?.trim() || error.message,
      });
    }
  }

  const ranked = summaries
    .filter((item) => item.action !== "ERROR")
    .sort((a, b) => pickRank(b) - pickRank(a));
  const best = ranked[0];
  const now = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

  console.clear();
  console.log(`自选择优 ${now} | profile=${profile} | threshold=${round(backtestThreshold, 1)}`);

  for (const item of summaries) {
    if (item.action === "ERROR") {
      console.log(`${item.name} | ERROR | ${item.text}`);
      continue;
    }
    const sign = item.changeRate >= 0 ? "+" : "";
    console.log(
      [
        `${item.name}(${item.symbol})`,
        `现价 ${round(item.price)}`,
        `${sign}${round(item.changeRate)}%`,
        `评分 ${round(item.score, 1)}/10`,
        item.action,
        `低吸 ${round(item.supportLow)}-${round(item.supportHigh)}`,
        `突破 ${round(item.breakoutPrice)}`,
        `失效 ${round(item.invalidPrice)}`,
      ].join(" | "),
    );
  }

  if (!best) {
    console.log("结论: 数据不可用，暂不选择。");
    return;
  }

  if (best.action === "BUY" && best.score >= backtestThreshold) {
    console.log(
      `结论: 选择 ${best.name}(${best.symbol})，但仍按小仓试错执行；${best.text}`,
    );
    return;
  }

  console.log(
    `结论: 当前没有合格买点；相对最接近的是 ${best.name}(${best.symbol})，评分 ${round(best.score, 1)}/10，动作 ${best.action}。${best.text}`,
  );
}

async function main() {
  if (intraday) {
    await runIntradayMode();
    return;
  }

  if (pick) {
    await runPickOnce();
    if (once) return;

    setInterval(async () => {
      try {
        await runPickOnce();
      } catch (error) {
        console.error(`择优失败: ${error.message}`);
      }
    }, intervalSeconds * 1000);
    return;
  }

  if (watchlist) {
    await runWatchlistOnce();
    if (once) return;

    setInterval(async () => {
      try {
        await runWatchlistOnce();
      } catch (error) {
        console.error(`自选监控失败: ${error.message}`);
      }
    }, intervalSeconds * 1000);
    return;
  }

  if (backtest) {
    await runBacktestMode();
    return;
  }

  await runOnce();
  if (once) return;

  setInterval(async () => {
    try {
      await runOnce();
    } catch (error) {
      console.error(`监控失败: ${error.message}`);
    }
  }, intervalSeconds * 1000);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
