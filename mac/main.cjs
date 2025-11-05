const { app, BrowserWindow, Tray, Menu, ipcMain, net } = require("electron");
const path = require("path");

let tray = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 70,
    alwaysOnTop: true,
    icon: path.join(__dirname, "66.png"), // 设置图标
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

function updateTrayTitle() {
  const request = net.request({
    method: "GET",
    url: "http://localhost:3000/quote?symbol=sh603256",
  });

  request.on("response", (response) => {
    let body = "";
    response.on("data", (chunk) => {
      body += chunk.toString();
    });
    response.on("end", () => {
      try {
        const data = JSON.parse(body);
        // 假设API返回格式为 { changeRate: "-1.09%" }
        const rate = data.changeRate || "0.00%";
        const prefix = rate.startsWith("-") ? "↓" : "↑";
        if (tray) {
          tray.setTitle(`${prefix}${rate}`);
        }
      } catch (e) {
        console.error("Failed to parse quote response:", e);
        if (tray) {
          tray.setTitle("Error");
        }
      }
    });
  });

  request.on("error", (error) => {
    console.error(`Failed to fetch quote: ${error.message}`);
    if (tray) {
      tray.setTitle("Offline");
    }
  });

  request.end();
}

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(path.join(__dirname, "iconTemplate.png"));
  const contextMenu = Menu.buildFromTemplate([{ label: "退出", role: "quit" }]);
  tray.setToolTip("Stock Ticker");
  tray.setContextMenu(contextMenu);

  updateTrayTitle(); // 立即更新一次
  setInterval(updateTrayTitle, 1000); // 每1秒更新一次

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.on("update-title", (event, title) => {
  if (tray) {
    tray.setTitle(title);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
