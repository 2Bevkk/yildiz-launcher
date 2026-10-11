const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const gracefulFs = require("graceful-fs");
gracefulFs.gracefulify(fs); 

const Store = require("electron-store");
const fetch = require("node-fetch");
const { syncMods, loadManifest } = require("./modDownloader");
const util = require("util");

const baseDir = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath("appData");
const INSTALL_ROOT = path.join(baseDir, ".yildizmc", "instance");
const store = new Store({ cwd: path.join(baseDir, ".yildizmc") });

let mainWindow;
let splashWindow;
let currentProcess = null;
let isCancelled = false; 
let isLaunching = false; 
let recentLogs = []; 
let currentLaunchId = 0; 

const isPackaged = app.isPackaged;
const javaExecutablePath = isPackaged
  ? path.join(process.resourcesPath, "runtime", "bin", "java.exe")
  : path.join(__dirname, "runtime", "bin", "java.exe");

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 380,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  
  splashWindow.loadFile(path.join(__dirname, "renderer", "splash.html"));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420, 
    height: 750, 
    resizable: false,
    show: false, // Arka planda hazır olana kadar gizle
    icon: path.join(__dirname, 'icon.ico'), 
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }, 
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html")); 
  mainWindow.setMenuBarVisibility(false); 

  // Ana pencere render edildiğinde splash'i kapatıp bunu göster
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createSplash();
  // Splash ekranının çizilmesi için çok kısa bir süre tanıyıp ağır mainWindow'u oluşturuyoruz
  setTimeout(createWindow, 200);
});

process.on("SIGINT", () => { if (currentProcess) currentProcess.kill(); process.exit(0); });
process.on("SIGTERM", () => { if (currentProcess) currentProcess.kill(); process.exit(0); });
app.on("window-all-closed", () => { if (currentProcess) currentProcess.kill(); if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { if (currentProcess) currentProcess.kill(); });

function sendStatus(text) { mainWindow?.webContents.send("status", text); }
function sendProgress(data) { mainWindow?.webContents.send("progress", data); }

ipcMain.handle('open-external', (e, url) => shell.openExternal(url));

ipcMain.handle('open-mods-folder', () => {
  const modsDir = path.join(INSTALL_ROOT, "mods");
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
  shell.openPath(modsDir);
});

ipcMain.handle('open-logs-folder', () => {
  const logsDir = path.join(INSTALL_ROOT, "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  shell.openPath(logsDir);
});

ipcMain.handle('open-log-window', async () => {
  const logWindow = new BrowserWindow({ width: 800, height: 600, title: "Sistem Konsolu - YTÜ Tayfa", backgroundColor: "#0a0e14", autoHideMenuBar: true });
  const logHtml = `
    <html>
      <head><style>body { background: #0a0e14; color: #a3b8cc; font-family: 'Courier New', monospace; padding: 15px; overflow-y: auto; font-size: 13px; } .line { margin-bottom: 4px; word-wrap: break-word; }</style></head>
      <body>
        <div style="color: #a48b57; font-weight: bold; margin-bottom: 10px;">--- OYUN LOGLARI PENCERESİ BAŞLATILDI ---</div>
        <div style="color: #6a7f94;">Not: Canlı log akışı için ana launcher penceresindeki "Son Logu Oku" seçeneğini de kullanabilirsiniz.</div>
      </body>
    </html>
  `;
  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(logHtml)}`);
});

ipcMain.handle('get-external-mods', async () => {
  const modsDir = path.join(INSTALL_ROOT, "mods");
  if (!fs.existsSync(modsDir)) return [];

  let manifest = { mods: [], deleted_mods: [] };
  try { manifest = await loadManifest(); } catch (err) { }

  const manifestFilenames = manifest.mods.map(m => m.filename);
  const deletedFilenames = manifest.deleted_mods || [];
  const files = fs.readdirSync(modsDir);
  const extMods = [];

  for (const file of files) {
    const baseName = file.endsWith('.disabled') ? file.replace('.disabled', '') : file;
    if (deletedFilenames.includes(baseName)) {
      try { fs.unlinkSync(path.join(modsDir, file)); } catch (e) { }
      continue;
    }
    if (file.endsWith(".jar") && !manifestFilenames.includes(file)) {
      extMods.push({ filename: file, name: file.replace('.jar', ''), disabled: false });
    } else if (file.endsWith(".jar.disabled")) {
      if (!manifestFilenames.includes(baseName)) {
        extMods.push({ filename: baseName, name: baseName.replace('.jar', ''), disabled: true });
      }
    }
  }
  return extMods;
});

ipcMain.handle('toggle-external-mod', (e, filename, enable) => {
  const modsDir = path.join(INSTALL_ROOT, "mods");
  const enabledPath = path.join(modsDir, filename);
  const disabledPath = enabledPath + '.disabled';
  try {
    if (enable && fs.existsSync(disabledPath)) fs.renameSync(disabledPath, enabledPath);
    else if (!enable && fs.existsSync(enabledPath)) fs.renameSync(enabledPath, disabledPath);
    return true;
  } catch (err) { return false; }
});

ipcMain.handle('delete-external-mod', async (event, filename) => {
  try {
    const modsDir = path.join(INSTALL_ROOT, "mods");
    const enabledPath = path.join(modsDir, filename);
    const disabledPath = enabledPath + '.disabled';
    if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
    if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);
    return true; 
  } catch (err) { return false; }
});

ipcMain.handle('set-jvm-args', (e, args) => store.set('jvmArgsSetting', args));
ipcMain.handle('get-jvm-args', () => store.get('jvmArgsSetting', ""));
ipcMain.handle('set-ram', (e, value) => store.set('ramSetting', value));
ipcMain.handle('get-ram', () => store.get('ramSetting', 6144));

ipcMain.handle("ping-server", async () => {
  try {
    const manifest = await loadManifest();
    if (!manifest.serverIp) return { ok: false };
    const [host, port] = manifest.serverIp.split(":");
    // Lazy Load: Sadece ping atılacağı an yüklenir
    const msu = require("minecraft-server-util");
    const status = await msu.status(host, parseInt(port, 10) || 25565, { timeout: 3000 });
    return { ok: true, online: true, players: status.players.online, maxPlayers: status.players.max };
  } catch { return { ok: true, online: false }; }
});

ipcMain.handle("login", async (e, username) => {
  const auth = { access_token: "offline_token", client_token: "offline_token", uuid: "00000000-0000-0000-0000-000000000000", name: username, user_properties: "{}" };
  store.set("lastProfile", { name: auth.name, uuid: auth.uuid });
  store.set("mclcAuth", auth);
  return { ok: true, profile: { name: auth.name } };
});

ipcMain.handle("get-saved-profile", () => store.get("lastProfile") || null);

ipcMain.handle("stop", () => {
  isCancelled = true; 
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
  isLaunching = false; 

  mainWindow?.show();
  mainWindow?.webContents.send("game-closed");
  return { ok: true };
});

ipcMain.handle("play", async (event, options) => {
  if (isLaunching) return { ok: false, error: "Şu anda arka planda devam eden veya iptal edilmekte olan bir işlem var. Lütfen biraz bekleyin." };
  if (currentProcess) return { ok: false, error: "Oyun zaten açık!" };

  isLaunching = true; 
  isCancelled = false;
  currentLaunchId++;
  const myLaunchId = currentLaunchId;

  try {
    const auth = store.get("mclcAuth");
    if (!auth) { isLaunching = false; return { ok: false, error: "Önce giriş yapmalısınız." }; }

    fs.mkdirSync(INSTALL_ROOT, { recursive: true });
    const modsDir = path.join(INSTALL_ROOT, "mods");

    const checkCancel = () => { if (isCancelled) throw new Error("CANCELLED"); };

    sendStatus("Modpack bilgisi kontrol ediliyor...");
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      isLaunching = false;
      return { ok: false, error: err.message };
    }
    checkCancel(); 

    if (manifest.serverIp) {
      const serversDatPath = path.join(INSTALL_ROOT, "servers.dat");
      // Lazy load: Ağır NBT modülleri sadece oyun başlarken yüklenir
      const nbt = require("prismarine-nbt");
      const parseNbtAsync = util.promisify(nbt.parse);
      try {
        let nbtData;
        if (fs.existsSync(serversDatPath)) {
          const buffer = fs.readFileSync(serversDatPath);
          const parsedResult = await parseNbtAsync(buffer);
          nbtData = parsedResult.parsed ? parsedResult.parsed : parsedResult;
        } else {
          nbtData = { type: "compound", name: "", value: { servers: { type: "list", value: { type: "compound", value: [] } } } };
        }
        if (!nbtData.value.servers) nbtData.value.servers = { type: "list", value: { type: "compound", value: [] } };
        if (nbtData.value.servers.value.type === "end") { nbtData.value.servers.value.type = "compound"; nbtData.value.servers.value.value = []; }

        const serverList = nbtData.value.servers.value.value;
        const targetIp = manifest.serverIp;
        if (!serverList.some(srv => srv.ip && srv.ip.value === targetIp)) {
          serverList.unshift({ name: { type: "string", value: manifest.serverName || "Minecraft Sunucusu" }, ip: { type: "string", value: targetIp } });
          fs.writeFileSync(serversDatPath, nbt.writeUncompressed(nbtData));
        }
      } catch (err) { console.error("servers.dat hatası:", err); }
    }
    checkCancel();

    const userMaxRam = `${options?.ram || 6144}M`;

    sendStatus("Modlar senkronize ediliyor...");
    const allMods = manifest.mods || [];
    if (fs.existsSync(modsDir)) {
      allMods.forEach(mod => {
        const jarPath = path.join(modsDir, mod.filename);
        const disabledPath = jarPath + '.disabled';
        if (fs.existsSync(disabledPath)) {
          if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);
          fs.renameSync(disabledPath, jarPath);
        }
      });
    }

    try {
      await syncMods(modsDir, sendStatus, sendProgress, store, () => isCancelled);
    } catch (err) {
      isLaunching = false; 
      return { ok: false, error: err.message };
    }
    checkCancel();

    const gameVer = manifest.minecraftVersion;
    const fabVer = manifest.fabricLoaderVersion;
    const customVerName = `fabric-loader-${fabVer}-${gameVer}`;
    const verDir = path.join(INSTALL_ROOT, "versions", customVerName);
    const jsonPath = path.join(verDir, `${customVerName}.json`);

    if (!fs.existsSync(jsonPath)) {
      fs.mkdirSync(verDir, { recursive: true });
      try {
        const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVer}/${fabVer}/profile/json`);
        if (!res.ok) throw new Error(`Fabric API Hatası (${res.status}): "${gameVer}" Minecraft sürümü için uygun profil bulunamadı.`);
        fs.writeFileSync(jsonPath, await res.text());
      } catch (err) {
        isLaunching = false;
        return { ok: false, error: err.message || "Fabric profili indirilemedi. Lütfen bağlantınızı kontrol edin." };
      }
    }
    checkCancel();

    sendStatus("Minecraft başlatılıyor...");
    
    // Lazy Load: Ağır oyun başlatıcı motoru en son adımda belleğe alınır
    const { Client } = require("minecraft-launcher-core");
    const launcher = new Client();
    recentLogs = []; 

    let networkChecker = setInterval(async () => {
      if (myLaunchId !== currentLaunchId) { clearInterval(networkChecker); return; }
      if (isCancelled) { clearInterval(networkChecker); return; }
      
      try {
        const res = await fetch('https://1.1.1.1', { timeout: 3000 });
        if (!res.ok) throw new Error();
      } catch (err) {
        if (isCancelled) return; 

        isCancelled = true;
        isLaunching = false; 
        clearInterval(networkChecker);
        
        event.sender.send("game-crashed", "İndirme sırasında internet bağlantınız koptu! Eksik dosyalar sebebiyle işlem durduruldu.");
      }
    }, 3000);

    launcher.on('debug', (e) => {
      if (myLaunchId === currentLaunchId) event.sender.send("launcher-log", "debug", e);
    });
    
    launcher.on('data', (e) => {
      if (myLaunchId !== currentLaunchId) return; 
      recentLogs.push(e);
      if (recentLogs.length > 60) recentLogs.shift();
      event.sender.send("launcher-log", e.toLowerCase().includes("error") ? "error" : "info", e);
    });
    
    launcher.on("progress", (e) => {
      if (myLaunchId !== currentLaunchId || isCancelled) return; 
      if (e.total) { sendProgress(e.task / e.total); }
      sendStatus(`İndiriliyor: ${e.type}`);
    });

    launcher.on("close", (code) => {
      if (myLaunchId !== currentLaunchId) return; 
      if (isCancelled) return; 
      
      currentProcess = null;
      mainWindow?.show();
      if (code !== 0 && code !== null && code !== undefined) {
        event.sender.send("game-crashed", recentLogs.join('\n'));
      } else {
        event.sender.send("game-closed");
      }
    });

    const savedJvmArgs = store.get("jvmArgsSetting", "");
    const customJvmArgs = savedJvmArgs.trim() ? savedJvmArgs.split(" ").filter(arg => arg.trim() !== "") : undefined;
    const opts = {
      authorization: auth, root: INSTALL_ROOT,
      version: { number: gameVer, type: "release", custom: customVerName },
      javaPath: javaExecutablePath, memory: { max: userMaxRam, min: "2G" }, customArgs: customJvmArgs
    };

    if (manifest.serverIp) {
      const [host, port] = manifest.serverIp.split(":");
      opts.quickPlay = { type: "multiplayer", identifier: `${host}:${port || "25565"}`, path: path.join(INSTALL_ROOT, "quickPlayLog.json") };
    }

    if (fs.existsSync(modsDir)) {
      const disabledMods = store.get("disabledMods", []);
      allMods.forEach(mod => {
        const jarPath = path.join(modsDir, mod.filename);
        if (!mod.required && disabledMods.includes(mod.name) && fs.existsSync(jarPath)) {
          fs.renameSync(jarPath, jarPath + '.disabled');
        }
      });
    }

    launcher.launch(opts).then(proc => {
      clearInterval(networkChecker);
      if (myLaunchId !== currentLaunchId) { proc.kill(); return; } 
      if (isCancelled) {
         proc.kill();
         isLaunching = false; 
         return;
      }
      currentProcess = proc;
      isLaunching = false; 
      mainWindow?.hide();
      sendStatus("Oyun başlatıldı, iyi eğlenceler!");
    }).catch(err => {
      clearInterval(networkChecker);
      if (myLaunchId !== currentLaunchId) return; 
      currentProcess = null;
      isLaunching = false; 
      if (isCancelled) return; 
      mainWindow?.show();
      event.sender.send("game-crashed", `Başlatma hatası: ${err.message || err}`);
    });

    return { ok: true };
  } catch (err) {
    currentProcess = null;
    isLaunching = false; 
    if (isCancelled || err.message === "CANCELLED") return { ok: false };
    mainWindow?.show();
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('get-active-mods', async () => {
  try {
    const manifest = await loadManifest();
    const disabledMods = store.get('disabledMods', []);
    return manifest.mods.map(m => m.name).filter(name => !disabledMods.includes(name));
  } catch { return []; }
});

ipcMain.handle('set-active-mods', async (e, activeModNames) => {
  try {
    const manifest = await loadManifest();
    const disabledMods = manifest.mods.map(m => m.name).filter(name => !activeModNames.includes(name));
    store.set('disabledMods', disabledMods);
    return true;
  } catch { return false; }
});

ipcMain.handle('set-toggle-state', (e, key, state) => store.set(key, state));
ipcMain.handle('get-toggle-state', (e, key) => store.get(key, true));