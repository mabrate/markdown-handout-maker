const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = channel => callback => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('handoutDesktop', {
  platform: process.platform, revealItem: invoke('browser:reveal'), openExternalFile: invoke('browser:open-external'), extractZip: invoke('browser:extract-zip'),
  createEntry: invoke('browser:create'), moveHandout: invoke('browser:move'),
  openFolder: invoke('folders:open'), openRecentFolder: invoke('folders:open-recent'), refreshFolder: invoke('folders:refresh'),
  openFile: invoke('files:open-dialog'), recentFiles: invoke('files:recent'), openRecent: invoke('files:open-recent'),
  readFile: invoke('files:read'), saveFile: invoke('files:save'), saveNewFile: invoke('files:save-new'), newFile: invoke('files:new'), renameFile: invoke('files:rename'), deleteFile: invoke('files:delete'),
  importImage: invoke('assets:import-image'), imageReference: invoke('assets:reference'), renameImage: invoke('assets:rename-image'),
  print: invoke('handout:print'), exportPdf: invoke('handout:pdf'),
  googleSettings: invoke('google:settings'), saveGoogleClientId: invoke('google:save-client-id'), googleSignIn: invoke('google:sign-in'), googleSignOut: invoke('google:sign-out'),
  googleExportPdf: invoke('google:export-pdf'), googleDocLink: invoke('google:doc-link'), googleSync: invoke('google:sync'), googlePush: invoke('google:push'), googlePull: invoke('google:pull'),
  aiStatus: invoke('ai:status'), recommendedAIModel: invoke('ai:recommended-model'), downloadAIModel: invoke('ai:download-model'),
  cancelAIModelDownload: invoke('ai:cancel-model-download'), selectAIModel: invoke('ai:select-model'), aiPromptSettings: invoke('ai:prompt-settings'),
  saveGlobalAIPrompt: invoke('ai:save-global-prompt'), saveAIActionPrompts: invoke('ai:save-action-prompts'),
  saveAIActionTokenLimits: invoke('ai:save-action-token-limits'), saveAIContextSize: invoke('ai:save-context-size'),
  prepareAI: invoke('ai:prepare'), generateAI: invoke('ai:generate'), stopAI: invoke('ai:stop'),
  onMenuCommand: subscribe('menu:command'), onAIModelDownloadProgress: subscribe('ai:model-download-progress'), onAIProgress: subscribe('ai:progress')
});
