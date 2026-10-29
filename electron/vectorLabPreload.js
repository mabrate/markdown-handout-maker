const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('handoutVectorLab', {
  version: 1,
  open: () => ipcRenderer.invoke('vector-lab:load'),
  save: data => ipcRenderer.invoke('vector-lab:save', data),
  dirty: value => ipcRenderer.send('vector-lab:dirty', value === true)
});
