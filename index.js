const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

if (process.argv.includes('--dev')) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      awaitWriteFinish: true
    });
  } catch {
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    icon: path.join(__dirname, 'icon.png'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.setMenuBarVisibility(false);
  win.setMenu(null);

  win.loadFile('index.html');
}

app.commandLine.appendSwitch('ignore-certificate-errors');
app.whenReady().then(createWindow);

ipcMain.on('app:restart', () => {
  app.relaunch();
  app.exit(0);
});