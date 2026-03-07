const { app, BrowserWindow, Menu, shell, Tray, nativeImage } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');

const SERVER_PORT = 8099;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
let mainWindow = null;
let serverProcess = null;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server.js');
  serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    detached: false
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });
}

function checkServer() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(SERVER_URL, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  const running = await checkServer();
  if (!running) {
    startServer();
    // Wait for server to start
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (await checkServer()) break;
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '🐸 Pepe Command Center',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#08080d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// App menu
function createMenu() {
  const template = [
    {
      label: 'Pepe Command Center',
      submenu: [
        { label: 'About Pepe Command Center', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Open in Browser', accelerator: 'CmdOrCtrl+O', click: () => shell.openExternal(SERVER_URL) },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  await ensureServer();
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS - keep in dock
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
