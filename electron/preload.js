/**
 * electron/preload.js — minimal, context-isolated bridge so the web UI can
 * talk to the desktop auto-updater without Node access in the page.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopUpdater', {
  onState: (cb) => ipcRenderer.on('updater:state', (_e, payload) => { try { cb(payload); } catch (e) {} }),
  check: () => ipcRenderer.send('updater:check'),
  restart: () => ipcRenderer.send('updater:restart'),
  openReleases: () => ipcRenderer.send('updater:open-releases'),
});
