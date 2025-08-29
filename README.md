# mcp-stock-cn

轻量的新浪财经行情服务与示例页面，用于在本地获取 A 股（或沪深）行情并在浏览器标题栏展示涨跌信息。

## 功能概述
- 提供 `/quote?symbol=xxx` API，从新浪财经拉取并解析行情数据（示例 symbol：`sh603256`、`sh600000`、`sz000001` 等）。
- 提供 `/q` 路由返回项目根目录下的 `index.html` 页面（示例页面每秒更新并防止休眠）。
- 静态文件服务：项目根目录下的静态资源（如 `favicon.ico`、`index.html`）可以直接访问。

## 先决条件
- Node.js 18+（内置 fetch 与 TextDecoder；若使用较低版本请自行 polyfill 或使用 `iconv-lite`）
- npm / yarn

注意：若使用 ES 模块（文件使用 `import`），请在 `package.json` 中添加 `"type": "module"`，或者以支持 ESM 的方式运行脚本。

## 安装
1. 克隆或复制本项目到本地目录：
   - git clone <your-repo-url>
2. 安装依赖（若有 package.json）：
   - npm install
   - 或者：yarn

> 本项目示例代码仅依赖 Node 原生 API 与少量第三方库（如 zod、express、cors）。如需安装：
> npm install express zod cors

## 运行
使用默认端口 3000：
- NODE_ENV=production node server.js
- 或直接：node server.js

使用自定义端口（例如 8090）：
- PORT=8090 node server.js

启动后：
- API: `http://localhost:3000/quote?symbol=sh603256`
- 页面: `http://localhost:3000/q`
- 静态资源可直接通过 `http://localhost:3000/<file>` 访问

## API 说明
GET /quote
- 参数：`symbol`（必需）例如 `sh603256`、`sz000001`
- 返回：JSON，字段包括 symbol、name、price、changeRate、open、high、low、volume、turnover、updateTime

示例：
- curl "http://localhost:3000/quote?symbol=sh603256"

## 页面（index.html）说明
- 页面会每秒请求 `/quote` 更新数据，并将涨跌幅显示在浏览器标题栏。
- 为避免页面在某些环境下（如监控面板）被浏览器或系统判定为“休眠”，页面内实现了一个计数器与周期性标题更新，保证页面持续活跃。

## 防止休眠的提示
- 浏览器或托管平台可能会在页面静默或无动画时降低活跃度。当前实现通过定期 fetch 与标题/隐藏计数器更新来保持活动。
- 若需要更强的防休眠策略，可在页面中添加可见的动画或 WebSocket 持续连接。

## 常见问题
1. 如果请求新浪接口出现编码问题（乱码）：
   - Node 的 TextDecoder 可能不支持部分中文编码，请安装并使用 `iconv-lite` 做转码，或确认 Node 版本支持所用编码。
2. 如果报 `ERR_REQUIRE_ESM` 或 import 问题：
   - 在 `package.json` 中添加 `"type": "module"`，或将文件改为 CommonJS（使用 require）。
3. CORS：
   - 服务端已启用 CORS（允许所有来源）。如需限制来源，请在 `server.js` 中调整 cors 配置。

## 日志与调试
- 启动后会在控制台打印监听端口信息，例如：
  `📈 Stock HTTP server running on http://localhost:3000`
- 请求失败或解析错误会在控制台输出错误信息，便于定位问题。

## 扩展与改进建议
- 增加缓存层，避免频繁请求第三方接口造成限流风险。
- 支持批量查询（一次性查询多个 symbol）。
- 提供 WebSocket 实时推送以减少轮询开销。
- 添加简单的前端 UI 显示更多行情字段与历史数据。

## 许可证
MIT

