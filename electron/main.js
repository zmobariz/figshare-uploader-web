/**
 * electron/main.js — desktop wrapper.
 * Runs the bundled Express server in-process on a free port and shows it in a
 * native window. No Node install, no terminal, no admin rights required.
 *
 * Auto-update (opt-out with NO_UPDATE_CHECK=1):
 *   - Where supported (Windows per-user installer, Linux AppImage) the app
 *     downloads new releases from GitHub in the background and offers a
 *     "Restart to update" prompt in the UI.
 *   - The portable .exe and unsigned macOS build can't self-install, so they
 *     fall back to a "new version available — Download" banner instead.
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

const RELEASES_URL = 'https://github.com/zmobariz/bulk-uploader-for-figshare/releases';

function wireUpdater(win) {
  let autoUpdater = null;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { autoUpdater = null; }

  const send = (state, info) => { if (win && !win.isDestroyed()) win.webContents.send('updater:state', { state, info: info || {} }); };

  // The portable .exe sets PORTABLE_EXECUTABLE_DIR and can't self-install;
  // dev (unpackaged) has no update metadata; both fall back to the notify banner.
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const enabled = app.isPackaged && !isPortable && process.env.NO_UPDATE_CHECK !== '1' && !!autoUpdater;

  if (autoUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => send('checking'));
    autoUpdater.on('update-available', (i) => send('available', { version: i && i.version }));
    autoUpdater.on('update-not-available', () => send('none'));
    autoUpdater.on('download-progress', (p) => send('downloading', { percent: p && p.percent }));
    autoUpdater.on('update-downloaded', (i) => send('downloaded', { version: i && i.version }));
    autoUpdater.on('error', (e) => send('error', { message: String((e && e.message) || e) }));
  }

  ipcMain.on('updater:check', () => {
    if (!enabled) return send('error'); // -> renderer shows the "Download" notify banner instead
    try { autoUpdater.checkForUpdates().catch((e) => send('error', { message: String((e && e.message) || e) })); }
    catch (e) { send('error', { message: String((e && e.message) || e) }); }
  });
  ipcMain.on('updater:restart', () => { try { autoUpdater && autoUpdater.quitAndInstall(); } catch (e) {} });
  ipcMain.on('updater:open-releases', () => { shell.openExternal(RELEASES_URL); });
}

let win;
async function createWindow() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  require(path.join(__dirname, '..', 'server.js'));

  win = new BrowserWindow({
    width: 1120, height: 920, minWidth: 720, minHeight: 600,
    title: 'Bulk Uploader for Figshare', backgroundColor: '#f6f7fb',
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  if (win.removeMenu) win.removeMenu();
  wireUpdater(win);
  try { await waitForServer(port, 20000); } catch (e) { /* load anyway */ }
  win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
