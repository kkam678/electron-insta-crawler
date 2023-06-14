const { app, BrowserWindow, ipcMain } = require("electron");
const puppeteer = require("puppeteer");
const { intagramCrawling } = require("./instagram-crawler");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 사용자 입력을 받아 Puppeteer를 실행하는 함수
async function runPuppeteer(account, password) {
  intagramCrawling(account, password);
}

// Electron에서 받은 사용자 입력을 처리하는 함수
ipcMain.on("runPuppeteer", (event, input1, input2) => {
  runPuppeteer(input1, input2);
});
