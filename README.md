# Stock Ticker Project 📈

一个高效、模块化的股票行情查看工具，支持 MCP 协议、桌面应用及 VS Code 插件。

## 项目架构

项目已完成解耦重构，分为以下核心模块：

- **`server/`**：后端 MCP (Model Context Protocol) 服务端。
  - 核心功能：实时获取新浪财经行情。
  - 极速构建：支持 Docker 容器化，剔除了所有前端依赖，构建仅需 10s 以内。
- **`desktop/`**：基于 Electron 的前端桌面应用。
  - 功能：在 macOS 顶部状态栏或窗口展示行情信息。
- **`vscode/`**：VS Code 扩展插件。

## 运行环境

- **Node.js**: v20+
- **Docker**: 用于部署服务端
- **包管理工具**: Yarn (推荐)

---

## 快速开始

### 1. 服务端部署 (Docker)

我们优化了 Dockerfile，实现了秒级在线构建与超小镜像体积：

```bash
# 执行构建与运行脚本
./build.sh
```

- **API 地址**: `http://localhost:3000/quote?symbol=sh603256`
- **MCP 模式**: 支持基于 StdIO 的 MCP 通信。

### 2. 桌面应用启动

在根目录下使用 Yarn Workspaces 启动：

```bash
yarn desktop:mac
```

---

## 性能优化特性

- **生产环境隔离**：Dockerfile 使用 `--production` 模式，镜像体积减少 90% 以上。
- **注册表加速**：配置了 `npmmirror` 镜像源，并修复了 `yarn.lock` 带来的私有注册表污染问题。
- **架构对齐**：针对 Mac (Apple Silicon) 进行了架构对齐优化，避免 QEMU 模拟加速。

## 许可证

MIT
