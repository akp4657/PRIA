const { contextBridge, ipcRenderer } = require('electron');
console.log("preload.js loaded");

contextBridge.exposeInMainWorld('electronAPI', {
  getBounds: () => ipcRenderer.invoke('get-bounds'),
  setBounds: (bounds) => ipcRenderer.send('set-bounds', bounds),
  getDisplayBounds: () => ipcRenderer.invoke('get-display-bounds'),
  spawnPopup: (msg) => ipcRenderer.send('spawn-popup', msg),
  onMessage: (callback) => ipcRenderer.on('set-message', callback),
  getIdleLines: () => ipcRenderer.invoke('get-idle-lines'),
  showSpeech: (text, x, y) => ipcRenderer.send('show-speech', { text, x, y }),
  moveSpeech: (x, y) => ipcRenderer.send('move-speech', { x, y }),
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  sendHeight: (height) => ipcRenderer.send('speech-height', height),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  onModeChange: (callback) => ipcRenderer.on('mode-change', callback),
  settingsUpdated: () => ipcRenderer.send('settings-updated'),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  onLoadSettingsOverlay: (callback) => ipcRenderer.on('load-settings-overlay', callback),
  onPopupFrequencyUpdated: (callback) => ipcRenderer.on('popup-frequency-updated', callback),
  showSettings: () => ipcRenderer.invoke('show-settings')
});
