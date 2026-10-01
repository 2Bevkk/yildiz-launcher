// ---- Tema ve pencere (yalnızca arayüz) ----
const rootEl = document.documentElement;
const themeMQ = window.matchMedia('(prefers-color-scheme: dark)');
let themePref = localStorage.getItem('themePref') || 'system';
function applyTheme(pref, animate = true) {
  const resolved = pref === 'system' ? (themeMQ.matches ? 'dark' : 'light') : pref;
  if (animate) { rootEl.classList.add('theme-anim'); setTimeout(() => rootEl.classList.remove('theme-anim'), 350); }
  rootEl.dataset.theme = resolved;
  const radio = document.getElementById('theme' + resolved[0].toUpperCase() + resolved.slice(1)); // sistem temasıyla açıldıysa da ilgili seçeneği işaretler
  if (radio) radio.checked = true;
  // İsteğe bağlı: main tarafında tanımlıysa başlık çubuğu simge rengini günceller
  if (window.launcherAPI && window.launcherAPI.setTitleBarOverlay) window.launcherAPI.setTitleBarOverlay(resolved);
}
function setThemePref(pref) { themePref = pref; localStorage.setItem('themePref', pref); applyTheme(pref); }
applyTheme(themePref, false);
themeMQ.addEventListener('change', () => { if (themePref === 'system') applyTheme('system'); });
document.querySelectorAll('input[name="themePref"]').forEach(r => r.addEventListener('change', () => setThemePref(r.value)));
document.getElementById('themeToggleBtn').addEventListener('click', () => setThemePref(rootEl.dataset.theme === 'dark' ? 'light' : 'dark'));
const wco = navigator.windowControlsOverlay;
const syncWco = () => rootEl.classList.toggle('wco', !!(wco && wco.visible));
syncWco();
if (wco) wco.addEventListener('geometrychange', syncWco);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { customModal.classList.add('hidden'); crashModal.classList.add('hidden'); }
});

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
const modSearchInput = document.getElementById('modSearchInput');
const jvmArgsInput = document.getElementById("jvmArgsInput");

const tabAllMods = document.getElementById('tabAllMods');
const tabManifestMods = document.getElementById('tabManifestMods');
const tabExternalMods = document.getElementById('tabExternalMods');
const modsContainer = document.getElementById('modsContainer');

const tabPlayBtn = document.getElementById('tabPlayBtn');
const tabSettingsBtn = document.getElementById('tabSettingsBtn');
const tabModsBtn = document.getElementById('tabModsBtn');
const tabTerminalBtn = document.getElementById('tabTerminalBtn');

const playView = document.getElementById('playView');
const settingsView = document.getElementById('settingsView');
const modsView = document.getElementById('modsView');
const terminalView = document.getElementById('terminalView');
const terminalOutput = document.getElementById('terminalOutput');
const downloadStats = document.getElementById("downloadStats");
const customModal = document.getElementById("customModal");
const modalMessage = document.getElementById("modalMessage");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const crashModal = document.getElementById("crashModal");
const copyLogBtn = document.getElementById("copyLogBtn");
const crashCloseBtn = document.getElementById("crashCloseBtn");

// Linkler
document.getElementById('btnAllLinks').addEventListener('click', () => { window.launcherAPI.openExternal("https://link.ytutayfa.com.tr"); });
document.getElementById('btnWp').addEventListener('click', () => { window.launcherAPI.openExternal("https://chat.whatsapp.com/BDELd7c6Qjv6MxMorHXbo0"); });
document.getElementById('btnDc').addEventListener('click', () => { window.launcherAPI.openExternal("https://discord.gg/94NwP4cGF7"); });
document.getElementById('btnInfo').addEventListener('click', () => { window.launcherAPI.openExternal("https://docs.google.com/document/d/11xPohjjCLYorm5lVFtoGFx-hkPW7P7DvSrA_Km7Nr_g/edit?usp=sharing"); });

let isPlaying = false;
let latestCrashLog = "";
let loadedManifestMods = [];
let loadedExternalMods = [];
let currentModTab = 'all';

function showAlert(message) {
  modalMessage.textContent = message;
  customModal.classList.remove("hidden");
  modalCloseBtn.focus();
}

modalCloseBtn.addEventListener("click", () => customModal.classList.add("hidden"));
crashCloseBtn.addEventListener("click", () => crashModal.classList.add("hidden"));

copyLogBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(latestCrashLog).then(() => {
    copyLogBtn.textContent = "Kopyalandı!";
    setTimeout(() => copyLogBtn.textContent = "Logu Kopyala", 2000);
  });
});

// YENİ: LOG PANELLERİ (İkonlu Butonlar İçin Olaylar)
document.getElementById("copyLogsBtn").addEventListener('click', (e) => {
  const lines = Array.from(terminalOutput.querySelectorAll('.log-line')).map(el => el.textContent).join('\n');
  navigator.clipboard.writeText(lines).then(() => {
    const btn = e.currentTarget;
    const originalHTML = btn.innerHTML;
    // Tıklandığında kısa süreliğine onay (tik) ikonu basar
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => btn.innerHTML = originalHTML, 2000);
  });
});

document.getElementById("openLogsFolderBtn").addEventListener('click', () => {
  if (window.launcherAPI.openLogsFolder) {
    window.launcherAPI.openLogsFolder();
  }
});

document.getElementById("openLogWindowBtn").addEventListener('click', () => {
  if (window.launcherAPI.openLogWindow) {
    window.launcherAPI.openLogWindow();
  }
});


refreshModsBtn.addEventListener('click', () => loadModList());
openFolderBtn.addEventListener('click', () => window.launcherAPI.openModsFolder());

function switchTab(activeButton, activeView) {
  [tabPlayBtn, tabSettingsBtn, tabModsBtn, tabTerminalBtn].forEach(btn => btn.classList.remove('active'));
  [playView, settingsView, modsView, terminalView].forEach(view => view.classList.add('hidden'));
  activeButton.classList.add('active');
  [tabPlayBtn, tabSettingsBtn, tabModsBtn, tabTerminalBtn].forEach(btn => btn.setAttribute('aria-selected', String(btn === activeButton)));
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

function updateModTabUI(activeBtn) {
  [tabAllMods, tabManifestMods, tabExternalMods].forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');
  [tabAllMods, tabManifestMods, tabExternalMods].forEach(btn => btn.setAttribute('aria-pressed', String(btn === activeBtn)));
}

function applyModFilters() {
  // Liste yüklenirken / hata ya da boş-sunucu durumunda ekranda başka mesaj gösterme
  if (modsContainer.querySelector('.loading-mods, .error-state, .no-mods')) return;
  const searchTerm = modSearchInput.value.toLowerCase();
  const items = modsContainer.querySelectorAll('.mod-item');
  let visibleCount = 0;

  items.forEach(item => {
    const isManifest = item.classList.contains('manifest-mod');
    const isExternal = item.classList.contains('external-mod');
    const nameText = item.dataset.modName.toLowerCase();

    let tabMatch = false;
    if (currentModTab === 'all') tabMatch = true;
    else if (currentModTab === 'manifest' && isManifest) tabMatch = true;
    else if (currentModTab === 'external' && isExternal) tabMatch = true;

    const searchMatch = nameText.includes(searchTerm);

    if (tabMatch && searchMatch) {
      item.style.display = 'flex';
      visibleCount++;
    } else {
      item.style.display = 'none';
    }
  });

  // YENİ: Boş liste kontrolü ve dinamik uyarı mesajı
  let emptyMsg = document.getElementById('emptyModMsg');
  if (!emptyMsg) {
    emptyMsg = document.createElement('div');
    emptyMsg.id = 'emptyModMsg';
    emptyMsg.className = 'empty-msg';
    modsContainer.appendChild(emptyMsg);
  }

  // Eğer gösterilecek mod yoksa, uygun uyarı metnini bas
  if (visibleCount === 0) {
    emptyMsg.style.display = 'block';
    if (currentModTab === 'external' && searchTerm === '') {
      emptyMsg.textContent = 'Diğer modlar klasörü şu an boş.';
    } else if (searchTerm !== '') {
      emptyMsg.textContent = 'Aramanızla eşleşen mod bulunamadı.';
    } else {
      emptyMsg.textContent = 'Bu kategoride mod bulunmamaktadır.';
    }
  } else {
    emptyMsg.style.display = 'none';
  }

  modCount.textContent = visibleCount;
  syncMasterToggle();
}

tabAllMods.addEventListener('click', () => { currentModTab = 'all'; updateModTabUI(tabAllMods); applyModFilters(); });
tabManifestMods.addEventListener('click', () => { currentModTab = 'manifest'; updateModTabUI(tabManifestMods); applyModFilters(); });
tabExternalMods.addEventListener('click', () => { currentModTab = 'external'; updateModTabUI(tabExternalMods); applyModFilters(); });
modSearchInput.addEventListener('input', applyModFilters);

function syncMasterToggle() {
  const visibleItems = Array.from(modsContainer.querySelectorAll('.mod-item')).filter(item => item.style.display !== 'none');
  if (visibleItems.length === 0) {
    toggleAllMods.checked = false;
    return;
  }
  const allChecked = visibleItems.every(item => item.querySelector('input[type="checkbox"]').checked);
  toggleAllMods.checked = allChecked;
}

toggleAllMods.addEventListener('change', async (e) => {
  const isChecked = e.target.checked;
  const visibleItems = Array.from(modsContainer.querySelectorAll('.mod-item')).filter(item => item.style.display !== 'none');

  const manifestModsToChange = [];
  const externalPromises = [];

  visibleItems.forEach(item => {
    const input = item.querySelector('input[type="checkbox"]');
    if (input.checked !== isChecked) {
      input.checked = isChecked;

      const modName = item.dataset.modName;
      const type = item.classList.contains('manifest-mod') ? 'manifest' : 'external';

      if (type === 'manifest') {
        manifestModsToChange.push(modName);
      } else {
        const filename = item.dataset.filename;
        externalPromises.push(window.launcherAPI.toggleExternalMod(filename, isChecked));
      }
    }
  });

  try {
    if (manifestModsToChange.length > 0) {
      const currentRaw = await window.launcherAPI.getActiveMods();
      let newActive = Array.isArray(currentRaw) ? [...currentRaw] : [];

      manifestModsToChange.forEach(mName => {
        if (isChecked && !newActive.includes(mName)) newActive.push(mName);
        else if (!isChecked) newActive = newActive.filter(n => n !== mName);
      });
      await window.launcherAPI.setActiveMods(newActive);
    }
    if (externalPromises.length > 0) {
      await Promise.all(externalPromises);
    }
  } catch (err) {
    console.error("Toplu işlem hatası:", err);
  }
});

// ---- Kullanıcı dostu hata mesajları ----
const ERR_ICONS = {
  offline: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.7 11.1A11 11 0 0 1 21.6 14M5 12.9a11 11 0 0 1 5.2-2.7M10.7 5.1A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.2-2.7M8.5 16.1a6 6 0 0 1 7 0M12 20h.01"></path></svg>',
  warn: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
};
function friendlyError(err) {
  const msg = String((err && err.message) || err || '');
  if (!navigator.onLine || /failed to fetch|network|load failed|ENOTFOUND|ECONN|ETIMEDOUT|timed? ?out/i.test(msg)) {
    return { icon: 'offline', title: 'Bağlantı kurulamadı', text: 'İnternet bağlantını kontrol edip tekrar dene.' };
  }
  if (err instanceof SyntaxError) {
    return { icon: 'warn', title: 'Liste okunamadı', text: 'Sunucudan beklenmeyen bir yanıt geldi. Biraz sonra tekrar dene.' };
  }
  if (/alınamadı|HTTP|\b[45]\d\d\b/i.test(msg)) {
    return { icon: 'warn', title: 'Sunucuya ulaşılamadı', text: 'Mod listesi şu an alınamıyor. Biraz sonra tekrar dene.' };
  }
  return { icon: 'warn', title: 'Bir şeyler ters gitti', text: 'Mod listesi yüklenemedi. Tekrar denemek için aşağıdaki butona bas.' };
}
function renderModsError(err) {
  const e = friendlyError(err);
  modsContainer.innerHTML = `<div class="error-state"><div class="error-icon">${ERR_ICONS[e.icon]}</div><h4>${e.title}</h4><p>${e.text}</p><button type="button" class="retry-btn">Tekrar dene</button></div>`;
  modsContainer.querySelector('.retry-btn').addEventListener('click', () => loadModList());
}

// ---- Modern onay penceresi (confirm() yerine) ----
const confirmModal = document.getElementById('confirmModal');
function showConfirm({ title, before = '', name = '', after = '', okText = 'Sil' }) {
  return new Promise((resolve) => {
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    document.getElementById('confirmTitle').textContent = title;
    const strong = document.createElement('strong');
    strong.textContent = name;
    document.getElementById('confirmMessage').replaceChildren(before, strong, after);
    okBtn.textContent = okText;
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const done = (value) => {
      confirmModal.classList.add('hidden');
      okBtn.onclick = cancelBtn.onclick = confirmModal.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
    confirmModal.onclick = (e) => { if (e.target === confirmModal) done(false); };
    document.addEventListener('keydown', onKey);
    confirmModal.classList.remove('hidden');
    cancelBtn.focus();
  });
}

async function loadModList() {
  modsContainer.innerHTML = `<div class="loading-mods"><div class="spinner"></div><span>Yükleniyor...</span></div>`;
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

    modsContainer.innerHTML = '';

    loadedManifestMods.forEach(mod => {
      const item = createModElement(mod.name, null, mod.icon, mod.version, activeSet.has(mod.name), mod.important, true, 'manifest', async (checked, cbInput) => {
        try {
          const currentRaw = await window.launcherAPI.getActiveMods();
          let newActive = Array.isArray(currentRaw) ? [...currentRaw] : [];
          if (checked && !newActive.includes(mod.name)) newActive.push(mod.name);
          else if (!checked) newActive = newActive.filter(name => name !== mod.name);
          await window.launcherAPI.setActiveMods(newActive);
          syncMasterToggle();
        } catch (err) { cbInput.checked = !checked; }
      });
      modsContainer.appendChild(item);
    });

    loadedExternalMods.forEach(mod => {
      const item = createModElement(mod.name, mod.filename, null, null, !mod.disabled, false, false, 'external', async (checked, cbInput) => {
        const success = await window.launcherAPI.toggleExternalMod(mod.filename, checked);
        if (success) {
          syncMasterToggle();
        } else {
          cbInput.checked = !checked;
        }
      });
      modsContainer.appendChild(item);
    });

    if (loadedManifestMods.length === 0 && loadedExternalMods.length === 0) {
      modsContainer.innerHTML = `<div class="empty-msg no-mods">Sunucuda mod bulunamadı.</div>`;
      modCount.textContent = '0';
    }

    applyModFilters();

  } catch (err) {
    console.error("Mod listesi hatası:", err);
    renderModsError(err);
    modCount.textContent = '?';
  }
}

function createModElement(name, filename, iconUrl, version, isChecked, isImportant, isYtuMod, type, onChangeCallback) {
  const item = document.createElement('div');
  item.className = `mod-item ${type}-mod`;
  item.dataset.modName = name;
  if (filename) item.dataset.filename = filename;

  const left = document.createElement('div');
  left.className = 'mod-left';

  // Uyarı Yıldızı
  if (type === 'manifest') {
    const starDiv = document.createElement('div');
    starDiv.className = 'important-star';
    if (isImportant) {
      starDiv.setAttribute('data-tooltip', 'Bu mod zorunludur, kapatırsan sunucuya giremezsin!');
      starDiv.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#eab308" stroke="#ca8a04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }
    left.appendChild(starDiv);

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

  // YENİ: SAĞ KISIM (TİK, ROZET, ÇÖP KUTUSU)
  const right = document.createElement('div');
  right.className = 'mod-right';

  if (isYtuMod) {
    const ytuBadge = document.createElement('div');
    ytuBadge.className = 'ytu-mod-badge';
    ytuBadge.setAttribute('data-tooltip', 'YTÜ Tayfa Client Modu');
    ytuBadge.innerHTML = `<img src="https://i.ibb.co/b56N44LQ/gocayorukk.png" alt="YTU Mod">`;
    right.appendChild(ytuBadge);
  }

  const toggle = document.createElement('label');
  toggle.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isChecked;
  const slider = document.createElement('span');
  slider.className = 'slider-toggle';
  toggle.appendChild(input);
  toggle.appendChild(slider);
  right.appendChild(toggle);
  input.addEventListener('change', () => onChangeCallback(input.checked, input));

  if (type === 'external') {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-mod-btn';
    deleteBtn.title = "Modu Sil";
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    deleteBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm({ title: 'Modu sil', name, after: ' modu kalıcı olarak silinecek. Bu işlem geri alınamaz.' });
      if (confirmed) {
        // İlgili mod silinirken UI listesinden de direkt siler, apiye haberi verir
        const success = await window.launcherAPI.deleteExternalMod(filename);
        if (success) {
          item.remove();
          applyModFilters();
        } else {
          showAlert("Mod dosyası silinirken bir sorun oluştu. Oyunun kapalı olduğundan emin olup tekrar dene.");
        }
      }
    });
    right.appendChild(deleteBtn);
  }

  item.appendChild(left);
  item.appendChild(right);
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
  copyLogBtn.focus();
});

window.launcherAPI.onStatus((text) => statusText.textContent = text);
window.launcherAPI.onProgress((frac) => {
  // Kesirli sayıyı 0-100 arası yüzdeye çevir
  const percentage = Math.min(100, Math.round(frac * 100));
  
  // Progress barı doldur
  progressBar.style.width = `${percentage}%`;
  
  // İstatistik metnine direkt yüzdeyi yaz (Örn: %45)
  if(downloadStats) {
    downloadStats.textContent = `%${percentage}`;
  }
});
window.launcherAPI.onGameClosed(() => { isPlaying = false; resetPlayButton(); });

function resetPlayButton() {
  playBtn.textContent = "OYNA";
  playBtn.classList.remove("stop-btn");
  playBtn.disabled = false;
  usernameInput.disabled = false;
  progressContainer.classList.add("hidden");
  progressBar.style.width = "0%";
  
  if (downloadStats) downloadStats.textContent = "";
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
// ---- Sürüm Bilgilerini Getir ve Ekrana Yazdır ----
async function loadGameInfo() {
  try {
    const npointUrl = 'https://api.npoint.io/176eec75c7a66d1ea571';
    const response = await fetch(npointUrl, { cache: 'no-store' });
    
    if (response.ok) {
      const data = await response.json();
      // Manifestten sürüm verilerini HTML'e yazdır
      document.getElementById('mcVersionDisplay').textContent = data.minecraftVersion || "Bilinmiyor";
      document.getElementById('loaderVersionDisplay').textContent = data.fabricLoaderVersion ? `Fabric ${data.fabricLoaderVersion}` : "Bilinmiyor";
    }
  } catch (err) {
    document.getElementById('mcVersionDisplay').textContent = "Bağlantı Hatası";
    document.getElementById('loaderVersionDisplay').textContent = "Bağlantı Hatası";
  }
}
// Güncelleme Ekranı Elementleri
const updateModal = document.getElementById("updateModal");
const updateTitle = document.getElementById("updateTitle");
const updateMessage = document.getElementById("updateMessage");
const updateProgressWrap = document.getElementById("updateProgressWrap");
const updateProgressBar = document.getElementById("updateProgressBar");
const updateRestartBtn = document.getElementById("updateRestartBtn");
const updateCloseBtn = document.getElementById("updateCloseBtn");

window.launcherAPI.onUpdateMessage((type, data) => {
  if (type === 'available') {
    updateModal.classList.remove('hidden');
    updateTitle.textContent = "Yeni Launcher Sürümü Bulundu!";
    updateMessage.textContent = `v${data} sürümü indiriliyor, lütfen bekleyin...`;
    updateProgressWrap.classList.remove('hidden');
    updateRestartBtn.classList.add('hidden');
    updateCloseBtn.classList.add('hidden');
  } 
  else if (type === 'progress') {
    updateProgressBar.style.width = `${data.percent}%`;
    const speedMB = (data.bytesPerSecond / (1024 * 1024)).toFixed(1);
    updateMessage.textContent = `İndiriliyor: %${Math.round(data.percent)} (${speedMB} MB/s)`;
  } 
  else if (type === 'downloaded') {
    updateTitle.textContent = "Güncelleme Hazır!";
    updateMessage.textContent = "Yeni sürüm başarıyla indirildi. Kurulum için yeniden başlatın.";
    updateProgressWrap.classList.add('hidden');
    updateRestartBtn.classList.remove('hidden');
  } 
  else if (type === 'error') {
    // Sadece güncelleme ekranı açıksa hatayı göster (kullanıcıyı gereksiz rahatsız etmemek için)
    if (!updateModal.classList.contains('hidden')) {
      updateTitle.textContent = "Güncelleme Başarısız";
      updateMessage.textContent = "Güncelleme indirilirken bir hata oluştu. Daha sonra tekrar denenecek.";
      updateProgressWrap.classList.add('hidden');
      updateCloseBtn.classList.remove('hidden');
    }
  }
});

updateRestartBtn.addEventListener('click', () => {
  updateRestartBtn.disabled = true;
  updateRestartBtn.textContent = "Kapatılıyor...";
  window.launcherAPI.installUpdate();
});

updateCloseBtn.addEventListener('click', () => {
  updateModal.classList.add('hidden');
});
// Uygulama açıldığında sürüm bilgilerini yükle
loadGameInfo();
checkServerStatus();
setInterval(checkServerStatus, 30000);

// ---- Yıldız dönüş hızı: animasyonu yeniden başlatmadan, mevcut açıdan yumuşakça hızlanır/yavaşlar ----
(function () {
  const decagram = document.querySelector('.decagram');
  const spinAnim = decagram && decagram.getAnimations ? decagram.getAnimations()[0] : null;
  if (!spinAnim) return;
  const FAST = 6; // 60 sn'lik dönüş -> 10 sn
  let rate = 1, target = 1, raf = 0;
  function step() {
    rate += (target - rate) * 0.06;
    if (Math.abs(target - rate) < 0.01) rate = target;
    spinAnim.playbackRate = rate;
    if (rate !== target) raf = requestAnimationFrame(step);
  }
  new MutationObserver(() => {
    target = progressContainer.classList.contains('hidden') ? 1 : FAST;
    cancelAnimationFrame(raf);
    step();
  }).observe(progressContainer, { attributes: true, attributeFilter: ['class'] });
})();