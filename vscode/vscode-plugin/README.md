# vscode-plugin

这个 VS Code 插件会在状态栏显示股票的涨跌率。

## 功能

- 在状态栏显示股票的涨跌率。
- 每秒更新一次。

## 运行插件

1. 在 VS Code 中打开这个项目。
2. 确保你有一个本地服务器在 `http://localhost:3000/quote?symbol=sh603256` 提供股票数据。
3. 按 `F5` 打开一个新的“插件开发宿主”窗口，插件将会在其中运行。
4. 股票的涨跌率将会显示在状态栏。

## 运行测试

在终端中运行 `npm test`。

## 打包

要将插件打包成 VSIX 文件，请运行以下命令：

```bash
npx vsce package
```

这将在项目的根目录创建一个 `.vsix` 文件。这个文件可以被安装在 VS Code 中。

## 目录结构

- `extension.js`: 插件的主入口文件。
- `package.json`: 插件的清单文件，包含元数据和依赖。
- `test/`: 包含插件的测试文件。
- `.vscodeignore`: 指定在打包插件时要排除的文件。
- `README.md`: 本文件。
- `jsconfig.json`: JavaScript IntelliSense 的配置文件。