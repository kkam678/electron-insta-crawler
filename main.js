const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path')
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'renderer.js')
    },
  });

  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);
//렌더러프로세스에서 보내는 메시지 처리
ipcMain.on('toggle-debug', (event, arg)=> {
    //디버기 툴 토글(on/off)
    mainWindow.webContents.toggleDevTools()
})
ipcMain.on('start-crawling', (event) => {
    console.log('start-crawling');
  const webContents = mainWindow.webContents;
  
  webContents.executeJavaScript(`
    // 여기에 웹페이지에서 필요한 JavaScript 코드 작성
    // 예: 로그인, 페이지 이동, 데이터 추출 등
    // 다운로드된 이미지나 추출된 데이터를 아래 코드를 사용하여 Renderer 프로세스로 전송
    window.postMessage({ type: 'image-downloaded', imageUrl: 'https://example.com/image.jpg' });
    window.postMessage({ type: 'data-received', data: 'Hello, world!' });
  `);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
