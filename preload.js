const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  login: (username) => ipcRenderer.invoke('login', username),
  play: (options) => ipcRenderer.invoke('play', options),
  stop: () => ipcRenderer.invoke('stop'),
  getSavedProfile: () => ipcRenderer.invoke('get-saved-profile'),
  getRam: () => ipcRenderer.invoke('get-ram'),
  setRam: (value) => ipcRenderer.invoke('set-ram', value),
  
  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  getActiveMods: () => ipcRenderer.invoke('get-active-mods'),
  setActiveMods: (modNames) => ipcRenderer.invoke('set-active-mods', modNames),
  
  getExternalMods: () => ipcRenderer.invoke('get-external-mods'),
  toggleExternalMod: (filename, enable) => ipcRenderer.invoke('toggle-external-mod', filename, enable),
  
  // YENİ: Ana Şalter Config İletişimi
  getToggleState: (key) => ipcRenderer.invoke('get-toggle-state', key),
  setToggleState: (key, state) => ipcRenderer.invoke('set-toggle-state', key, state),
  
  onStatus: (callback) => ipcRenderer.on('status', (_, text) => callback(text)),
  onProgress: (callback) => ipcRenderer.on('progress', (_, frac) => callback(frac)),
  onGameClosed: (callback) => ipcRenderer.on('game-closed', () => callback()),
  onGameCrashed: (callback) => ipcRenderer.on('game-crashed', (_, logs) => callback(logs)),
  onLog: (callback) => ipcRenderer.on("launcher-log", (event, type, msg) => callback(type, msg)),
  
  pingServer: () => ipcRenderer.invoke("ping-server"),
  getJvmArgs: () => ipcRenderer.invoke('get-jvm-args'),
  setJvmArgs: (args) => ipcRenderer.invoke('set-jvm-args', args),
});