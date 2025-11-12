#!/usr/bin/env node
import express from "express";
import { z } from "zod";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// === 配置文件路径 ===
const CONFIG_PATH = path.join(__dirname, "config.json");

// === 加载持久化配置 ===
function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { defaultSymbol: "sh600021,sh601138,sz300490,sz002759" };
  }
}

// === 保存配置 ===
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

let { defaultSymbol } = loadConfig();

app.use(cors());
app.use(express.static("."));
app.use(express.json());

// === 获取配置 ===
app.get("/api/config", (req, res) => {
  res.json({ defaultSymbol });
});

// === 更新配置（带持久化）===
app.post("/api/config", (req, res) => {
  const { symbol } = req.body;
  if (typeof symbol === "string" && symbol.length > 0) {
    defaultSymbol = symbol;
    saveConfig({ defaultSymbol });
    res.json({ message: "配置更新成功", defaultSymbol });
  } else {
    res.status(400).json({ error: "无效的 symbol" });
  }
});

// === 其他路由 ===
app.get("/q", (req, res) => {
  res.sendFile(path.join(__dirname, "mac.html"));
});

const SINA_API_BASE = "https://hq.sinajs.cn/list";

// === 获取股票信息 ===
async function makeStockRequest(symbol) {
  const url = `${SINA_API_BASE}=${symbol}`;
  const headers = { Referer: "https://finance.sina.com.cn" };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const text = new TextDecoder("gb2312").decode(buffer);
    const data = parseSinaStockData(text, symbol);
    return data;
  } catch (error) {
    console.error("Error making stock request:", error);
    if (error instanceof TypeError && error.message === "fetch failed") {
      throw new Error("Network request failed. Please check your connection.");
    }
    throw error;
  }
}

// === 解析股票数据 ===
function parseSinaStockData(text, symbol) {
  const matches = text.match(/"(.*)"/);
  if (!matches || !matches[1]) return null;
  const values = matches[1].split(",");
  if (values.length < 32) return null;
  return {
    symbol,
    name: values[0],
    open: values[1],
    close: values[2],
    price: values[3],
    high: values[4],
    low: values[5],
    volume: values[8],
    amount: values[9],
    date: values[30],
    time: values[31],
  };
}

// === 控制台输出格式 ===
function formatQuoteText(quote) {
  const close = Number(quote.close);
  const price = Number(quote.price);
  const rate = close === 0 ? "0.00%" : (((price - close) / close) * 100).toFixed(2) + "%";
  const sign = rate.startsWith("-") ? "" : "+";
  return `${quote.name} (${sign}${rate})`;
}

function formatQuote(quote) {
  const close = Number(quote.close);
  const price = Number(quote.price);
  const rate = close === 0 ? "0.00%" : (((price - close) / close) * 100).toFixed(2) + "%";
  return {
    symbol: quote.symbol,
    name: quote.name,
    price,
    changeRate: rate,
    open: Number(quote.open),
    high: Number(quote.high),
    low: Number(quote.low),
    volume: Math.round(Number(quote.volume) / 100) + " lots",
    turnover: (Number(quote.amount) / 10000).toFixed(2) + " million",
    updateTime: `${quote.date} ${quote.time}`,
  };
}

// === /quote ===
app.get("/quote", async (req, res) => {
  const schema = z.object({ symbol: z.string().min(2) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid symbol parameter" });

  const { symbol } = parsed.data;
  try {
    const data = await makeStockRequest(symbol);
    if (!data) return res.status(500).json({ error: `Failed to get data for ${symbol}` });
    res.json(formatQuote(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === /cli ===
app.get("/cli", async (req, res) => {
  const schema = z.object({ symbol: z.string().min(2) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).send("❌ Invalid symbol parameter");

  const symbols = parsed.data.symbol.split(",").map(s => s.trim()).filter(Boolean);

  try {
    const results = await Promise.all(symbols.map(async (s) => {
      try {
        const q = await makeStockRequest(s);
        if (!q) return `⚠️ ${s}: 无法获取数据`;
        return formatQuoteText(q);
      } catch (err) {
        return `❌ ${s}: ${err.message}`;
      }
    }));
    res.type("text/plain").send(results.join("\n"));
  } catch (error) {
    res.status(500).send("❌ " + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`📈 Stock HTTP server running on http://localhost:${PORT}`);
});
