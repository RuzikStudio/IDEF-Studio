const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  net,
  Menu,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "idef",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setName("IDEF Studio");
// Permanent profile path: retain the 0.5 directory for existing users. Do not version this path again.
app.setPath("userData", path.join(app.getPath("appData"), "IDEF Studio 0.5"));
if (process.argv.includes("--test"))
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), "idef-studio-tests", String(Date.now())),
  );
let win,
  currentPath = null,
  pendingOpenPath = null,
  pendingLegacy = false,
  legacyOpened = false,
  dirty = false,
  closing = false;
const root = path.resolve(__dirname, "../dist");
async function atomicWrite(target, text) {
  const tmp = target + "." + Date.now() + ".tmp";
  try {
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}
const allowed = (e) => {
  if (
    e.sender !== win.webContents ||
    !e.senderFrame.url.startsWith("idef://app/")
  )
    throw Error("Unknown sender");
};
app.whenReady().then(() => {
  protocol.handle("idef", (request) => {
    const u = new URL(request.url);
    if (u.host !== "app") return new Response("Not found", { status: 404 });
    const target = path.resolve(
      root,
      "." + decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname),
    );
    if (!target.startsWith(root + path.sep))
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    title: "IDEF Studio 0.6",
    width: 1500,
    height: 980,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: "#f6f7fb",
    icon: path.join(__dirname, "icon.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  win.once("ready-to-show", () => {
    if (!process.argv.includes("--test")) win.show();
  });
  win.loadURL("idef://app/index.html");
  win.on("close", (e) => {
    if (!dirty || closing) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      title: "Сохранить проект?",
      message: "Есть изменения, не сохранённые в файл.",
      detail:
        "Резервная копия восстановится при следующем запуске. Для отдельного файла нажмите «Сохранить».",
      buttons: ["Сохранить", "Закрыть", "Отмена"],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) win.webContents.send("project:requestSave");
    if (choice === 1) {
      closing = true;
      win.close();
    }
  });
  ipcMain.on("project:dirty", (e, value) => {
    allowed(e);
    dirty = value;
  });
  ipcMain.handle("project:open", async (e) => {
    allowed(e);
    const result = await dialog.showOpenDialog(win, {
      title: "Открыть проект IDEF Studio",
      filters: [{ name: "IDEF Studio", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    const stat = await fs.stat(file);
    if (stat.size > 20_000_000) throw Error("Файл больше 20 МБ");
    const text = await fs.readFile(file, "utf8");
    const data = JSON.parse(text);
    if (data.format !== "idef-studio" || ![1, 2, 3, 4].includes(data.version))
      throw Error("Неподдерживаемый формат проекта");
    pendingOpenPath = file;
    pendingLegacy = data.version < 3;
    return { text, name: path.basename(file) };
  });
  ipcMain.handle("project:acceptOpen", async (e) => {
    allowed(e);
    if (pendingOpenPath) {
      currentPath = pendingLegacy ? null : pendingOpenPath;
      legacyOpened = pendingLegacy;
      pendingOpenPath = null;
    }
  });
  ipcMain.handle("project:save", async (e, text, saveAs) => {
    allowed(e);
    if (typeof text !== "string" || text.length > 20_000_000)
      throw Error("Некорректные данные");
    const p = JSON.parse(text);
    if (p.format !== "idef-studio") throw Error("Некорректный проект");
    let target = currentPath;
    if (!target || saveAs) {
      const r = await dialog.showSaveDialog(win, {
        title: "Сохранить проект IDEF Studio",
        defaultPath:
          (p.title || "Модель").replace(/[<>:"/\\|?*]/g, "_") +
          (legacyOpened ? "-v" + require("../package.json").version : "") +
          ".idef.json",
        filters: [{ name: "IDEF Studio", extensions: ["json"] }],
      });
      if (r.canceled) return null;
      target = r.filePath;
    }
    try {
      await fs.copyFile(target, target + ".bak");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    await atomicWrite(target, text);
    legacyOpened = false;
    currentPath = target;
    dirty = false;
    return path.basename(target);
  });
  ipcMain.handle("diagram:export", async (e, svg, name, kind) => {
    allowed(e);
    if (
      typeof svg !== "string" ||
      svg.length > 20_000_000 ||
      !["svg", "pdf"].includes(kind)
    )
      throw Error("Некорректные данные экспорта");
    const r = await dialog.showSaveDialog(win, {
      title: "Экспорт диаграммы",
      defaultPath: path.basename(name),
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (r.canceled) return null;
    if (kind === "svg") await atomicWrite(r.filePath, svg);
    else {
      const printer = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      try {
        const html = `<!doctype html><html><head><title>IDEF Studio — диаграмма</title><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page{size:A3 landscape;margin:8mm}html,body{margin:0;padding:0}svg{width:100%;height:auto;display:block}</style></head><body>${svg}</body></html>`;
        await printer.loadURL(
          "data:text/html;charset=utf-8," + encodeURIComponent(html),
        );
        const pdf = await printer.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
        });
        await atomicWrite(r.filePath, pdf);
      } finally {
        printer.destroy();
      }
    }
    return r.filePath;
  });
});
app.on("window-all-closed", () => app.quit());
