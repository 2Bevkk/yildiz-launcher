const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");
const fetch = require("node-fetch");
const { Client } = require("minecraft-launcher-core");
const { syncMods, loadManifest } = require("./modDownloader");
const nbt = require("prismarine-nbt");
const util = require("util");
const msu = require("minecraft-server-util");
const parseNbt = util.promisify(nbt.parse);
const { autoUpdater } = require("electron-updater");
const INSTALL_ROOT = path.join(app.getPath("appData"), ".yildizmc", "instance");
const store = new Store({ cwd: path.join(app.getPath("appData"), ".yildizmc") });
let mainWindow;
let currentProcess = null;
let recentLogs = []; // Çökme durumunda rapor edilecek son loglar

const isPackaged = app.isPackaged;
const javaExecutablePath = isPackaged
  ? path.join(process.resourcesPath, "runtime", "bin", "java.exe")
  : path.join(__dirname, "runtime", "bin", "java.exe");

function parseNbtAsync(buffer) {
  return new Promise((resolve, reject) => {
    nbt.parse(buffer, (error, data) => { if (error) reject(error); else resolve(data); });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420, // Genişliği 480'den 420'ye daralttık[cite: 4]
    height: 750, // Yüksekliği 840'tan 750'ye düşürdük (arayüzüne göre ince ayar yapabilirsin)[cite: 4]
    resizable: false, //[cite: 4]
    icon: path.join(__dirname, 'icon.ico'), // LOGO ÇÖZÜMÜ: Yerel ikon dosyanın yolunu buraya ekle
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }, //[cite: 4]
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html")); //[cite: 4]
  mainWindow.setMenuBarVisibility(false); //[cite: 4]
  mainWindow.once('ready-to-show', () => {
    // Uygulama sadece build (paket) halindeyken güncellemeleri arasın
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater-message', 'available', info.version);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('updater-message', 'progress', progressObj);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater-message', 'downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater-message', 'error', err.message);
  });
}

app.whenReady().then(createWindow);

process.on("SIGINT", () => { if (currentProcess) currentProcess.kill(); process.exit(0); });
process.on("SIGTERM", () => { if (currentProcess) currentProcess.kill(); process.exit(0); });
app.on("window-all-closed", () => { if (currentProcess) currentProcess.kill(); if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { if (currentProcess) currentProcess.kill(); });

function sendStatus(text) { mainWindow?.webContents.send("status", text); }
// Eski Hali: function sendProgress(fraction) { mainWindow?.webContents.send("progress", fraction); }

function sendProgress(data) { mainWindow?.webContents.send("progress", data); }

// ---- Dış Link ve Klasör IPC ----
ipcMain.handle('open-external', (e, url) => shell.openExternal(url));

ipcMain.handle('open-mods-folder', () => {
  const modsDir = path.join(INSTALL_ROOT, "mods");
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
  shell.openPath(modsDir);
});

// YENİ: Log Klasörünü Açma İşlemi
ipcMain.handle('open-logs-folder', () => {
  const logsDir = path.join(INSTALL_ROOT, "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  shell.openPath(logsDir);
});

// YENİ: Ayrı Pencerede CMD Formatında Log Gösterici
ipcMain.handle('open-log-window', async () => {
  const logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "Sistem Konsolu - YTÜ Tayfa",
    backgroundColor: "#0a0e14",
    autoHideMenuBar: true
  });
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  // Basit bir HTML ile pencereyi siyah CMD formatında kaplıyoruz
  const logHtml = `
    <html>
      <head>
        <style>
          body { background: #0a0e14; color: #a3b8cc; font-family: 'Courier New', monospace; padding: 15px; overflow-y: auto; font-size: 13px; }
          .line { margin-bottom: 4px; word-wrap: break-word; }
        </style>
      </head>
      <body>
        <div style="color: #a48b57; font-weight: bold; margin-bottom: 10px;">--- OYUN LOGLARI PENCERESİ BAŞLATILDI ---</div>
        <div style="color: #6a7f94;">Not: Canlı log akışı için ana launcher penceresindeki "Son Logu Oku" seçeneğini de kullanabilirsiniz. Bu pencere oyundan bağımsız olarak açık kalabilir.</div>
      </body>
    </html>
  `;

  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(logHtml)}`);
});

// Dışarıdan Eklenen (Diğer) Modlar IPC ve Kara Liste (Blacklist) Kontrolü
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
      try {
        fs.unlinkSync(path.join(modsDir, file));
        console.log(`🧹 Kara listedeki mod temizlendi: ${file}`);
      } catch (e) { }
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

// YENİ: Dışarıdan Eklenen Modu Kalıcı Silme İşlemi
ipcMain.handle('delete-external-mod', async (event, filename) => {
  try {
    const modsDir = path.join(INSTALL_ROOT, "mods");
    const enabledPath = path.join(modsDir, filename);
    const disabledPath = enabledPath + '.disabled';

    if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
    if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);

    return true; // İşlem başarılı
  } catch (err) {
    console.error("Mod silinirken hata oluştu:", err);
    return false; // Hata oldu
  }
});

ipcMain.handle('set-jvm-args', (e, args) => store.set('jvmArgsSetting', args));
ipcMain.handle('get-jvm-args', () => store.get('jvmArgsSetting', ""));
ipcMain.handle('set-ram', (e, value) => store.set('ramSetting', value));
ipcMain.handle('get-ram', () => store.get('ramSetting', 4096));

ipcMain.handle("ping-server", async () => {
  try {
    const manifest = await loadManifest();
    if (!manifest.serverIp) return { ok: false };
    const [host, port] = manifest.serverIp.split(":");
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
  if (currentProcess) { currentProcess.kill(); currentProcess = null; mainWindow?.show(); mainWindow?.webContents.send("game-closed"); }
  return { ok: true };
});

ipcMain.handle("play", async (event, options) => {
  if (currentProcess) return { ok: false, error: "Oyun zaten açık!" };
  try {
    const auth = store.get("mclcAuth");
    if (!auth) return { ok: false, error: "Önce giriş yapmalısınız." };

    fs.mkdirSync(INSTALL_ROOT, { recursive: true });
    const modsDir = path.join(INSTALL_ROOT, "mods");

    sendStatus("Modpack bilgisi kontrol ediliyor...");
    const manifest = await loadManifest();

    // Sunucu Ekleme
    if (manifest.serverIp) {
      const serversDatPath = path.join(INSTALL_ROOT, "servers.dat");
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

    const userMaxRam = `${options?.ram || 4096}M`;

    // 1. ADIM: MANIFEST MODLARINI GERİ ÇEVİR
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

    await syncMods(modsDir, sendStatus, sendProgress, store);

    // Fabric Kurulum
    const gameVer = manifest.minecraftVersion;
    const fabVer = manifest.fabricLoaderVersion;
    const customVerName = `fabric-loader-${fabVer}-${gameVer}`;
    const verDir = path.join(INSTALL_ROOT, "versions", customVerName);
    const jsonPath = path.join(verDir, `${customVerName}.json`);

    if (!fs.existsSync(jsonPath)) {
      fs.mkdirSync(verDir, { recursive: true });
      const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVer}/${fabVer}/profile/json`);
      if (res.ok) fs.writeFileSync(jsonPath, await res.text());
    }

    sendStatus("Minecraft başlatılıyor...");
    const launcher = new Client();
    recentLogs = []; // Logları sıfırla

    launcher.on('debug', (e) => event.sender.send("launcher-log", "debug", e));
    launcher.on('data', (e) => {
      recentLogs.push(e);
      if (recentLogs.length > 60) recentLogs.shift();
      event.sender.send("launcher-log", e.toLowerCase().includes("error") ? "error" : "info", e);
    });
    // Hız/Süre izleyicisini kaldırıp eski fraction (kesir) sistemine döndük
    launcher.on("progress", (e) => {
      if (e.total) {
        sendProgress(e.task / e.total);
      }
      sendStatus(`İndiriliyor: ${e.type}`);
    });

    // CRASH TESPİTİ BURADA YAPILIYOR
    launcher.on("close", (code) => {
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

    // 2. ADIM: OYUN AÇILMADAN ÖNCE MANIFEST MODLARINI GİZLE
    if (fs.existsSync(modsDir)) {
      const disabledMods = store.get("disabledMods", []);
      allMods.forEach(mod => {
        const jarPath = path.join(modsDir, mod.filename);
        if (!mod.required && disabledMods.includes(mod.name) && fs.existsSync(jarPath)) {
          fs.renameSync(jarPath, jarPath + '.disabled');
        }
      });
    }

    currentProcess = await launcher.launch(opts);
    mainWindow?.hide();
    sendStatus("Oyun başlatıldı, iyi eğlenceler!");
    return { ok: true };
  } catch (err) {
    currentProcess = null;
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