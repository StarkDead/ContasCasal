const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  status: () => ipcRenderer.invoke('data:status'),
  pick: (mode) => ipcRenderer.invoke('data:pick', mode),
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  reveal: () => ipcRenderer.invoke('data:reveal'),
  version: () => ipcRenderer.invoke('app:version'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (fn) => ipcRenderer.on('update:ready', () => fn()),
  onChanged: (fn) => ipcRenderer.on('data:changed', () => fn()),
});
