const { ipcRenderer } = require('electron');
const log = require('electron-log')

document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.querySelector('#startButton');
  const webview = document.querySelector('#webview');
    startButton.addEventListener('click', () => {

        ipcRenderer.send('start-crawling');
    });
});
// 키보드 입력
document.addEventListener('keydown', (event) => {
    if(event.keyCode==123){ //F12
        //메인프로세스로 toggle-debug 메시지 전송 (디버그 툴 토글시켜라)
        ipcRenderer.send('toggle-debug', 'an-argument')
    }
    else if(event.keyCode==116){ //F5
        //메인프로세스로 refresh 메시지 전송 (페이지를 갱신시켜라)
        ipcRenderer.send('refresh', 'an-argument')
    }
})
ipcRenderer.on('image-downloaded', (event, imageUrl) => {
  const image = new Image();
  image.src = imageUrl;
  document.body.appendChild(image);
});

ipcRenderer.on('data-received', (event, data) => {
  const dataElement = document.createElement('p');
  dataElement.textContent = data;
  document.body.appendChild(dataElement);
});
