const usernameInput = document.getElementById("usernameInput");
const playBtn = document.getElementById("playBtn");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("statusText");
const ramRange = document.getElementById("ramRange");
const ramValue = document.getElementById("ramValue");
const modCount = document.getElementById('modCount');
const refreshModsBtn = document.getElementById('refreshModsBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const toggleAllMods = document.getElementById('toggleAllMods');
const jvmArgsInput = document.getElementById("jvmArgsInput");

const tabManifestMods = document.getElementById('tabManifestMods');
const tabExternalMods = document.getElementById('tabExternalMods');
const manifestModsList = document.getElementById('manifestModsList');
const externalModsList = document.getElementById('externalModsList');

const tabPlayBtn = document.getElementById('tabPlayBtn');
const tabSettingsBtn = document.getElementById('tabSettingsBtn');
const tabModsBtn = document.getElementById('tabModsBtn');
const tabTerminalBtn = document.getElementById('tabTerminalBtn');

const playView = document.getElementById('playView');
const settingsView = document.getElementById('settingsView');
const modsView = document.getElementById('modsView');
const terminalView = document.getElementById('terminalView');
const terminalOutput = document.getElementById('terminalOutput');

const customModal = document.getElementById("customModal");
const modalMessage = document.getElementById("modalMessage");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const crashModal = document.getElementById("crashModal");
const copyLogBtn = document.getElementById("copyLogBtn");
const crashCloseBtn = document.getElementById("crashCloseBtn");

document.getElementById('btnWp').addEventListener('click', () => { window.launcherAPI.openExternal("https://chat.whatsapp.com/BDELd7c6Qjv6MxMorHXbo0"); });
document.getElementById('btnDc').addEventListener('click', () => { window.launcherAPI.openExternal("https://discord.gg/94NwP4cGF7"); });
document.getElementById('btnInfo').addEventListener('click', () => { window.launcherAPI.openExternal("https://docs.google.com/document/d/11xPohjjCLYorm5lVFtoGFx-hkPW7P7DvSrA_Km7Nr_g/edit?usp=sharing"); });

let isPlaying = false;
let latestCrashLog = "";
let loadedManifestMods = [];
let loadedExternalMods = [];

function showAlert(message) {
  modalMessage.textContent = message;
  customModal.classList.remove("hidden");
}

modalCloseBtn.addEventListener("click", () => customModal.classList.add("hidden"));
crashCloseBtn.addEventListener("click", () => crashModal.classList.add("hidden"));

copyLogBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(latestCrashLog).then(() => {
    copyLogBtn.textContent = "Kopyalandı!";
    setTimeout(() => copyLogBtn.textContent = "Logu Kopyala", 2000);
  });
});

refreshModsBtn.addEventListener('click', () => loadModList());
openFolderBtn.addEventListener('click', () => window.launcherAPI.openModsFolder());

function switchTab(activeButton, activeView) {
  [tabPlayBtn, tabSettingsBtn, tabModsBtn, tabTerminalBtn].forEach(btn => btn.classList.remove('active'));
  [playView, settingsView, modsView, terminalView].forEach(view => view.classList.add('hidden'));
  activeButton.classList.add('active');
  activeView.classList.remove('hidden');
}

tabPlayBtn.addEventListener('click', () => switchTab(tabPlayBtn, playView));
tabSettingsBtn.addEventListener('click', () => switchTab(tabSettingsBtn, settingsView));
tabModsBtn.addEventListener('click', () => { switchTab(tabModsBtn, modsView); loadModList(); });
tabTerminalBtn.addEventListener('click', () => switchTab(tabTerminalBtn, terminalView));

function updateRamDisplay(value) {
  const mb = parseInt(value, 10);
  const gb = (mb / 1024).toFixed(1);
  ramValue.textContent = `${mb} MB (${gb} GB)`;
}

window.launcherAPI.getJvmArgs().then(val => jvmArgsInput.value = val).catch(err => console.error(err));
jvmArgsInput.addEventListener('change', (e) => window.launcherAPI.setJvmArgs(e.target.value));

window.launcherAPI.getRam().then((value) => {
  ramRange.value = value;
  updateRamDisplay(value);
}).catch(err => console.error(err));
ramRange.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  updateRamDisplay(val);
  window.launcherAPI.setRam(val);
});

// YENİ: Ana Şalteri Aktif Sekmeye Göre Eşitleme
function syncMasterToggle() {
  const isManifest = tabManifestMods.classList.contains('active');
  const activeList = isManifest ? manifestModsList : externalModsList;
  const checkboxes = activeList.querySelectorAll('.mod-item input[type="checkbox"]');
  
  if (checkboxes.length === 0) {
    toggleAllMods.checked = false;
    return;
  }
  
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  toggleAllMods.checked = allChecked;

  // Ana şalter durumunu sekme bazlı confige kaydet
  const configKey = isManifest ? 'master_manifest' : 'master_external';
  window.launcherAPI.setToggleState(configKey, allChecked);
}

// Mod Alt Sekme Geçiş Mantığı
tabManifestMods.addEventListener('click', () => {
  tabManifestMods.classList.add('active');
  tabExternalMods.classList.remove('active');
  manifestModsList.classList.remove('hidden');
  externalModsList.classList.add('hidden');
  updateModCount();
  syncMasterToggle();
});

tabExternalMods.addEventListener('click', () => {
  tabExternalMods.classList.add('active');
  tabManifestMods.classList.remove('active');
  externalModsList.classList.remove('hidden');
  manifestModsList.classList.add('hidden');
  updateModCount();
  syncMasterToggle();
});

function updateModCount() {
  modCount.textContent = tabManifestMods.classList.contains('active') ? loadedManifestMods.length : loadedExternalMods.length;
}

// YENİ: Gecikmesiz ve Paralel "Tümünü Aç/Kapat"
toggleAllMods.addEventListener('change', async (e) => {
  const isChecked = e.target.checked;
  const isManifest = tabManifestMods.classList.contains('active');
  const activeList = isManifest ? manifestModsList : externalModsList;
  const configKey = isManifest ? 'master_manifest' : 'master_external';
  
  // 1. Ana şalteri confige kaydet
  window.launcherAPI.setToggleState(configKey, isChecked);

  // 2. Arayüzü ANINDA güncelle (Sıfır gecikme)
  const checkboxes = activeList.querySelectorAll('.mod-item input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = isChecked);

  // 3. Arka plan işlemlerini eşzamanlı başlat
  try {
    if (isManifest) {
      const activeManifestNames = isChecked ? loadedManifestMods.map(m => m.name) : [];
      await window.launcherAPI.setActiveMods(activeManifestNames);
    } else {
      const externalPromises = loadedExternalMods.map(extMod => 
        window.launcherAPI.toggleExternalMod(extMod.filename, isChecked)
      );
      await Promise.all(externalPromises);
    }
  } catch (err) {
    console.error("Toplu işlem hatası:", err);
  }
});

async function loadModList() {
  const loadingHTML = `<div class="loading-mods"><div class="spinner"></div><span>Yükleniyor...</span></div>`;
  manifestModsList.innerHTML = loadingHTML;
  externalModsList.innerHTML = loadingHTML;
  modCount.textContent = '...';

  try {
    const npointUrl = 'https://api.npoint.io/176eec75c7a66d1ea571';
    const response = await fetch(npointUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Mod listesi alınamadı!');
    
    const data = await response.json();
    const allMods = data.mods || [];
    
    const rawActive = await window.launcherAPI.getActiveMods();
    let activeSet = new Set(Array.isArray(rawActive) ? rawActive : allMods.map(m => m.name));
    
    const allDependencies = new Set();
    allMods.forEach(m => {
      if (m.dependencies && Array.isArray(m.dependencies)) {
        m.dependencies.forEach(dep => allDependencies.add(dep.toLowerCase()));
      }
    });

    loadedManifestMods = allMods.filter(mod => {
      if (mod.required === true) return false;
      const modNameLower = mod.name.toLowerCase();
      return !Array.from(allDependencies).some(dep => dep === modNameLower || dep.includes(modNameLower) || modNameLower.includes(dep));
    }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    loadedExternalMods = await window.launcherAPI.getExternalMods();
    
    manifestModsList.innerHTML = '';
    externalModsList.innerHTML = '';
    updateModCount();

    if (loadedManifestMods.length > 0) {
      loadedManifestMods.forEach(mod => {
        const item = createModElement(mod.name, mod.icon, mod.version, activeSet.has(mod.name), mod.important, async (checked, cbInput) => {
          try {
            const currentRaw = await window.launcherAPI.getActiveMods();
            let newActive = Array.isArray(currentRaw) ? [...currentRaw] : [];
            if (checked && !newActive.includes(mod.name)) newActive.push(mod.name);
            else if (!checked) newActive = newActive.filter(name => name !== mod.name);
            await window.launcherAPI.setActiveMods(newActive);
            syncMasterToggle(); // Her değişimde ana şalteri senkronize et
          } catch (err) { cbInput.checked = !checked; }
        });
        manifestModsList.appendChild(item);
      });
    } else {
      manifestModsList.innerHTML = `<div style="text-align: center; padding: 30px 10px; color: #8da4b9; font-size: 13px;">Sunucuda kayıtlı mod bulunamadı.</div>`;
    }

    if (loadedExternalMods.length > 0) {
      loadedExternalMods.forEach(mod => {
        const item = createModElement(mod.name, null, null, !mod.disabled, false, async (checked, cbInput) => {
          const success = await window.launcherAPI.toggleExternalMod(mod.filename, checked);
          if (success) {
            syncMasterToggle(); // Her değişimde ana şalteri senkronize et
          } else {
            cbInput.checked = !checked;
          }
        });
        externalModsList.appendChild(item);
      });
    } else {
      externalModsList.innerHTML = `<div style="text-align: center; padding: 30px 10px; color: #8da4b9; font-size: 13px;">Dışarıdan eklenmiş mod bulunamadı.</div>`;
    }
    
    // Yükleme bittiğinde aktif sekmenin durumuna göre ana şalteri kur
    syncMasterToggle();

  } catch (err) {
    manifestModsList.innerHTML = `<p style="color: #f87171; font-size: 13px; text-align: center;">Yüklenemedi: ${err.message}</p>`;
    modCount.textContent = '?';
  }
}

function createModElement(name, iconUrl, version, isChecked, isImportant, onChangeCallback) {
  const item = document.createElement('div');
  item.className = 'mod-item';
  const left = document.createElement('div');
  left.className = 'mod-left';

  // SADECE Yıldız Modları sekmesinde (iconUrl varsa) hiza koruyucu çalışsın
// ... (createModElement fonksiyonunun içi)
  if (iconUrl !== null) {
    const starDiv = document.createElement('div');
    starDiv.className = 'important-star';
    
    if (isImportant) {
      // Uyarı metnini aşağıdaki tırnakların içinden değiştirebilirsin
      starDiv.setAttribute('data-tooltip', 'Bu mod zorunludur, kapatırsan sunucuya giremezsin!');
      starDiv.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#eab308" stroke="#ca8a04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }
    left.appendChild(starDiv);
// ...

    // İkon
    const iconImg = document.createElement('img');
    iconImg.className = 'mod-icon';
    iconImg.src = iconUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="%234a5568" viewBox="0 0 24 24"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/%3E%3C/svg%3E';
    left.appendChild(iconImg);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'mod-name';
  nameSpan.textContent = name;
  if (version) {
    const verSpan = document.createElement('span');
    verSpan.className = 'mod-version';
    verSpan.textContent = `v${version}`;
    nameSpan.appendChild(verSpan);
  }
  left.appendChild(nameSpan);

  const toggle = document.createElement('label');
  toggle.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isChecked;
  const slider = document.createElement('span');
  slider.className = 'slider-toggle';
  toggle.appendChild(input);
  toggle.appendChild(slider);

  item.appendChild(left);
  item.appendChild(toggle);

  input.addEventListener('change', () => onChangeCallback(input.checked, input));
  return item;
}

window.launcherAPI.getSavedProfile().then((profile) => {
  if (profile && profile.name) usernameInput.value = profile.name;
});

window.launcherAPI.onLog((type, msg) => {
  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  line.textContent = msg;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
});

window.launcherAPI.onGameCrashed((logs) => {
  isPlaying = false;
  resetPlayButton();
  latestCrashLog = logs;
  crashModal.classList.remove("hidden");
});

window.launcherAPI.onStatus((text) => statusText.textContent = text);
window.launcherAPI.onProgress((frac) => progressBar.style.width = `${Math.min(100, Math.round(frac * 100))}%`);
window.launcherAPI.onGameClosed(() => { isPlaying = false; resetPlayButton(); });

function resetPlayButton() {
  playBtn.textContent = "OYNA";
  playBtn.classList.remove("stop-btn");
  playBtn.disabled = false;
  usernameInput.disabled = false;
  progressContainer.classList.add("hidden");
  progressBar.style.width = "0%";
}

playBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const selectedRam = parseInt(ramRange.value, 10) || 4096;
  const validUserRegex = /^[a-zA-Z0-9_]{3,16}$/;

  if (!username || !validUserRegex.test(username)) {
    showAlert("Geçersiz isim! Sadece 3-16 arası harf, rakam ve alt çizgi (_) kullanabilirsiniz.");
    usernameInput.classList.add("input-error");
    setTimeout(() => usernameInput.classList.remove("input-error"), 400);
    usernameInput.focus();
    return;
  }

  if (isPlaying) {
    playBtn.disabled = true;
    playBtn.textContent = "Kapatılıyor...";
    await window.launcherAPI.stop();
    return;
  }

  playBtn.disabled = true;
  playBtn.textContent = "Bağlanıyor...";

  const loginResult = await window.launcherAPI.login(username);
  if (!loginResult.ok) {
    showAlert("Giriş başarısız: " + loginResult.error);
    resetPlayButton();
    return;
  }

  progressContainer.classList.remove("hidden");
  playBtn.textContent = "Hazırlanıyor...";
  playBtn.disabled = true;
  usernameInput.disabled = true;

  try {
    const playResult = await window.launcherAPI.play({ ram: selectedRam });
    if (playResult.ok) {
      isPlaying = true;
      playBtn.textContent = "DURDUR";
      playBtn.classList.add("stop-btn");
      playBtn.disabled = false;
    } else {
      showAlert("Hata: " + playResult.error);
      resetPlayButton();
    }
  } catch (err) {
    showAlert("Beklenmeyen hata: " + err.message);
    resetPlayButton();
  }
});

async function checkServerStatus() {
  try {
    const res = await window.launcherAPI.pingServer();
    if (res && res.ok && res.online) {
      document.getElementById("statusIndicator").className = "status-indicator online";
      document.getElementById("serverNameDisplay").textContent = "YTU Tayfa Çevrimiçi";
      document.getElementById("playerCountDisplay").textContent = `${res.players} / ${res.maxPlayers} Oyuncu`;
    } else {
      throw new Error();
    }
  } catch (err) {
    document.getElementById("statusIndicator").className = "status-indicator offline";
    document.getElementById("serverNameDisplay").textContent = "YTU Tayfa Çevrimdışı";
    document.getElementById("playerCountDisplay").textContent = "Sunucu şu an kapalı";
  }
}
checkServerStatus();
setInterval(checkServerStatus, 30000);