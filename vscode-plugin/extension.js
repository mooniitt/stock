const vscode = require('vscode');
const fetch = require('node-fetch');

// 默认股票代码
const DEFAULT_SYMBOL = "sh603256";
// API 地址
const API_URL = `http://localhost:3000/quote?symbol=${DEFAULT_SYMBOL}`;

// 状态栏项
let myStatusBarItem;
// 定时器
let interval;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // 创建状态栏项
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(myStatusBarItem);

    // 初始显示股票代码
    myStatusBarItem.text = "603256";
    // 显示状态栏项
    myStatusBarItem.show();

    // 每秒更新一次股票信息
    interval = setInterval(updateStock, 1000);
    // 立即更新一次
    updateStock();
}

// 更新股票信息
async function updateStock() {
    try {
        // 从 API 获取数据
        const res = await fetch(API_URL);
        const data = await res.json();
        const lastRate = data.changeRate;
        // 根据涨跌设置前缀
        const prefix = lastRate.startsWith('-') ? '↓' : '↑';
        // 更新状态栏文本
        myStatusBarItem.text = `${prefix}${lastRate}`;
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
    deactivate
}