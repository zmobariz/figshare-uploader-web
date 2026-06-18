/**
 * electron/main.js — desktop wrapper.
 * Runs the bundled Express server in-process on a free port and shows it in a
 * native window. No Node install, no terminal, no admin rights required.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');
const http = require('http');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

function waitForServer(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => { (Date.now() - start > timeoutMs) ? reject(new Error('server timeout')) : setTimeout(tryOnce, 250); });
      req.on('timeout', () => req.destroy());
    };
    tryOnce();
  });
}

let win;
async function createWindow() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  require(path.join(__dirname, '..', 'server.js'));

  win = new BrowserWindow({
    width: 1120, height: 920, minWidth: 720, minHeight: 600,
    title: 'Figshare Bulk Uploader', backgroundColor: '#f6f7fb',
    webPreferences: { contextIsolation: true },
  });
  if (win.removeMenu) win.removeMenu();
  try { await waitForServer(port, 20000); } catch (e) { /* load anyway */ }
  win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
