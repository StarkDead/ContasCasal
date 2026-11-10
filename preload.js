const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  status: () => ipcRenderer.invoke('data:status'),
  pick: (mode) => ipcRenderer.invoke('data:pick', mode),
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  reveal: () => ipcRenderer.invoke('data:reveal'),
  onChanged: (fn) => ipcRenderer.on('data:changed', () => fn()),
});
