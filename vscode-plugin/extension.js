const vscode = require("vscode");
const fetch = require("node-fetch");

// 状态栏项
let myStatusBarItem;
// 定时器
let interval;
// 控制是否显示股票信息
let showStockInfo = true;
// 股票代码
let stockSymbol = "sh603256";
// 股数
let stockShares = 4000;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 注册切换命令
  const toggleCommandId = "extension.toggleStockDisplay";
  context.subscriptions.push(
    vscode.commands.registerCommand(toggleCommandId, () => {
      showStockInfo = !showStockInfo;
      updateStock(); // 立即更新以反映切换
    })
  );

  // 注册修改设置命令
  const changeSettingsCommandId = "extension.changeStockSettings";
  context.subscriptions.push(
    vscode.commands.registerCommand(changeSettingsCommandId, async () => {
      const newSymbol = await vscode.window.showInputBox({
        prompt: "请输入股票代码",
        value: stockSymbol,
        placeHolder: "例如: sh603256",
      });

      if (newSymbol !== undefined && newSymbol !== "") {
        const newShares = await vscode.window.showInputBox({
          prompt: "请输入股数",
          value: stockShares.toString(),
          placeHolder: "例如: 4000",
          validateInput: (text) => {
            return /^\d+$/.test(text) ? null : "请输入一个有效的数字";
          },
        });

        if (newShares !== undefined && newShares !== "") {
          stockSymbol = newSymbol;
          stockShares = parseInt(newShares, 10);
          // 初始显示股票代码
          myStatusBarItem.text = stockSymbol.slice(2);
          updateStock(); // 立即更新
        }
      }
    })
  );

  // 创建状态栏项
  myStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  myStatusBarItem.command = changeSettingsCommandId; // 关联命令
  context.subscriptions.push(myStatusBarItem);

  // 初始显示股票代码
  myStatusBarItem.text = stockSymbol.slice(2);
  // 显示状态栏项
  myStatusBarItem.show();

  // 每秒更新一次股票信息
  interval = setInterval(updateStock, 1000);
  // 立即更新一次
  updateStock();
}

// 更新股票信息
async function updateStock() {
  if (!showStockInfo) {
    myStatusBarItem.text = "keep slow";
    return;
  }

  const hour = new Date().getHours();
  try {
    // 从 API 获取数据
    const apiUrl = `http://118.31.223.166:3000/quote?symbol=${stockSymbol}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    const price = data.price;
    const lastRate = data.changeRate;
    const isUp = !lastRate.startsWith("-");

    if ((hour >= 9 && hour < 15) || (hour >= 15 && isUp)) {
      // 根据涨跌设置前缀
      const prefix = isUp ? "↑" : "↓";
      // 更新状态栏文本
      //   myStatusBarItem.text = `${prefix}${lastRate}`;
      myStatusBarItem.text = `${prefix}${(price * stockShares).toFixed(2)}`;
    } else {
      myStatusBarItem.text = "keep slow";
    }
  } catch (err) {
    // 获取失败时显示错误图标
    myStatusBarItem.text = "❌";
  }
}

// 停用扩展
function deactivate() {
  if (interval) {
    // 清除定时器
    clearInterval(interval);
  }
  if (myStatusBarItem) {
    // 释放状态栏项
    myStatusBarItem.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};