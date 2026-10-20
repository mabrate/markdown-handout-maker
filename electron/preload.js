const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = channel => callback => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('handoutDesktop', {
  platform: process.platform, droppedFilePath: file => webUtils.getPathForFile(file), openWebLink: invoke('links:open'), readGuide: invoke('help:guide'), saveGuide: invoke('help:save-guide'), previewDocument: invoke('browser:preview'), startFileDrag: target => ipcRenderer.send('browser:drag', target), onDragError: subscribe('browser:drag-error'), revealItem: invoke('browser:reveal'), openExternalFile: invoke('browser:open-external'), extractZip: invoke('browser:extract-zip'),
  createEntry: invoke('browser:create'), moveHandout: invoke('browser:move'),
  openFolder: invoke('folders:open'), openRecentFolder: invoke('folders:open-recent'), refreshFolder: invoke('folders:refresh'),
  openFile: invoke('files:open-dialog'), recentFiles: invoke('files:recent'), openRecent: invoke('files:open-recent'),
  readFile: invoke('files:read'), saveFile: invoke('files:save'), saveNewFile: invoke('files:save-new'), newFile: invoke('files:new'), renameFile: invoke('files:rename'), deleteFile: invoke('files:delete'),
  importImage: invoke('assets:import-image'), imageReference: invoke('assets:reference'), renameImage: invoke('assets:rename-image'),
  print: invoke('handout:print'), exportPdf: invoke('handout:pdf'),
  googleSettings: invoke('google:settings'), saveGoogleClientId: invoke('google:save-client-id'), googleSignIn: invoke('google:sign-in'), googleSignOut: invoke('google:sign-out'),
  googleExportPdf: invoke('google:export-pdf'), googleDocLink: invoke('google:doc-link'), googleSync: invoke('google:sync'), googlePush: invoke('google:push'), googlePull: invoke('google:pull'),
  onMenuCommand: subscribe('menu:command')
});
