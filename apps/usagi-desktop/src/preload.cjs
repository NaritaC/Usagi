'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('A callback is required');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('usagiDesktop', Object.freeze({
  getState: () => ipcRenderer.invoke('usagi:get-state'),
  onTick: callback => subscribe('usagi:tick', callback),
  onAction: callback => subscribe('usagi:action', callback),
  updateSettings: patch => ipcRenderer.invoke('usagi:update-settings', patch),
  setHit: hit => ipcRenderer.send('usagi:set-hit', hit),
  beginDrag: () => ipcRenderer.send('usagi:begin-drag'),
  endDrag: () => ipcRenderer.send('usagi:end-drag'),
  moveBy: dx => ipcRenderer.send('usagi:move-by', dx),
  openSettings: () => ipcRenderer.send('usagi:open-settings'),
  playAction: id => ipcRenderer.send('usagi:play-action', id),
  resetPosition: () => ipcRenderer.send('usagi:reset-position'),
  quit: () => ipcRenderer.send('usagi:quit'),
}));
