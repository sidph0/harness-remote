const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("serverManager", {
  getState: () => ipcRenderer.invoke("manager:get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("manager:save-settings", settings),
  prerequisites: (backend) => ipcRenderer.invoke("manager:prerequisites", backend),
  chooseRoot: () => ipcRenderer.invoke("manager:choose-root"),
  start: (settings) => ipcRenderer.invoke("manager:start", settings),
  stop: () => ipcRenderer.invoke("manager:stop"),
  restart: (settings) => ipcRenderer.invoke("manager:restart", settings),
  copy: (text) => ipcRenderer.invoke("manager:copy", text),
  openExternal: (url) => ipcRenderer.invoke("manager:open-external", url),
  onState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on("manager:state", handler)
    return () => ipcRenderer.removeListener("manager:state", handler)
  },
})
