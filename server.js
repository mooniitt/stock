#!/usr/bin/env node
import express from "express";
import { z } from "zod";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // ✅ 开启 CORS 支持，默认允许所有来源
app.use(express.static(".")); // 添加静态文件服务

// 添加 /q 路由
app.get("/q", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const SINA_API_BASE = "https://hq.sinajs.cn/list";

// 请求新浪财经 API
async function makeStockRequest(symbol) {
  const url = `${SINA_API_BASE}=${symbol}`;
  const headers = {
    Referer: "https://finance.sina.com.cn",
  };
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("gb2312");
    const text = decoder.decode(buffer);
    const data = parseSinaStockData(text, symbol);
    return data;
  } catch (error) {
    console.error("Error making stock request:", error);
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error('Network request failed. Please check your network connection or the API endpoint.');
    }
    throw error;
  }
}

// 解析新浪股票数据
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

// 格式化展示
function formatQuote(quote) {
  const closePrice = Number(quote.close);
  const currentPrice = Number(quote.price);
  const changeRate = closePrice === 0 ? "0.00%" : (((currentPrice - closePrice) / closePrice) * 100).toFixed(2) + "%";

  return {
    symbol: quote.symbol,
    name: quote.name,
    price: currentPrice,
    changeRate: changeRate,
    open: Number(quote.open),
    high: Number(quote.high),
    low: Number(quote.low),
    volume: Math.round(Number(quote.volume) / 100) + " lots",
    turnover: (Number(quote.amount) / 10000).toFixed(2) + " million",
    updateTime: `${quote.date} ${quote.time}`,
  };
}

// 路由：GET /quote?symbol=sh600000
app.get("/quote", async (req, res) => {
  const schema = z.object({
    symbol: z.string().min(2),
  });
  const parseResult = schema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid symbol parameter" });
  }

  const { symbol } = parseResult.data;
  try {
    const quoteData = await makeStockRequest(symbol);
    if (!quoteData) {
      return res
        .status(500)
        .json({ error: `Failed to retrieve stock data for ${symbol}` });
    }

    res.json(formatQuote(quoteData));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`📈 Stock HTTP server running on http://localhost:${PORT}`);
});
