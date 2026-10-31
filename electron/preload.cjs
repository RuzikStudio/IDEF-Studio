const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  open: () => ipcRenderer.invoke("project:open"),
  acceptOpen: () => ipcRenderer.invoke("project:acceptOpen"),
  save: (text, saveAs) => ipcRenderer.invoke("project:save", text, !!saveAs),
  exportFile: (text, name, kind) =>
    ipcRenderer.invoke("diagram:export", text, name, kind),
  setDirty: (value) => ipcRenderer.send("project:dirty", !!value),
  onSave: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("project:requestSave", listener);
    return () => ipcRenderer.removeListener("project:requestSave", listener);
  },
});
