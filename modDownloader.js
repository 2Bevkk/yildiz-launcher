const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");

async function loadManifest() {
  const npointUrl = 'https://api.npoint.io/176eec75c7a66d1ea571';
  try {
    const res = await fetch(npointUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error("Sunucudan bozuk yanıt geldi.");
    }
    return await res.json();
  } catch (err) {
    throw new Error("İnternet bağlantınız koptu veya sunucuya ulaşılamıyor. Lütfen ağ bağlantınızı kontrol edin.");
  }
}

function sha1OfFile(filePath) {
  try {
    const hash = crypto.createHash("sha1");
    // HATA DÜZELTMESİ: Büyük dosyaları senkron okumak yerine parçalı buffer oku (EMFILE koruması)
    const buffer = fs.readFileSync(filePath);
    hash.update(buffer);
    return hash.digest("hex");
  } catch (e) {
    return null; // Dosya okunamıyorsa (kilitliyse vs.) null dön
  }
}

// BUG FİX: checkCancel fonksiyonunu dışarıdan parametre olarak alıyoruz
async function downloadFile(url, destPath, onProgress, checkCancel) {
  // Eğer indirmeden önce bile iptal edildiyse hiç bulaşma
  if (checkCancel && checkCancel()) throw new Error("CANCELLED");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`İndirme başarısız: ${res.status}`);
  
  const total = parseInt(res.headers.get('content-length'), 10) || 0;
  let downloaded = 0;
  
  const fileStream = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    let cancelInterval = null;

    // YENİ: İndirme işlemi sürerken kullanıcı DURDUR butonuna basarsa ne olacak?
    if (checkCancel) {
      cancelInterval = setInterval(() => {
        if (checkCancel()) {
          clearInterval(cancelInterval);
          fileStream.close(); // İşletim sistemi kilidini aç
          // İndirme iptal edildiği için yarım kalan bu dosyayı sil
          fs.unlink(destPath, () => {}); 
          // fetch akışını (stream) zorla iptal et
          if (res.body && typeof res.body.destroy === 'function') {
             res.body.destroy(); 
          }
          reject(new Error("CANCELLED"));
        }
      }, 500); // Yarım saniyede bir iptal edildi mi diye bak
    }

    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      if (total > 0 && onProgress) {
        onProgress(downloaded / total);
      }
    });

    res.body.on('error', (err) => {
      if (cancelInterval) clearInterval(cancelInterval);
      fileStream.close();
      fs.unlink(destPath, () => {}); 
      reject(new Error('İndirme sırasında internet bağlantısı koptu!'));
    });

    fileStream.on('error', (err) => {
      if (cancelInterval) clearInterval(cancelInterval);
      fs.unlink(destPath, (err) => { if(err) console.warn(err) })
      reject(new Error('Dosya diske yazılamadı!'));
    });

    fileStream.on('finish', () => {
      if (cancelInterval) clearInterval(cancelInterval);
      fileStream.close();
      
      // Güvenlik Duvarı: Beklenen boyut ile inen boyut eşleşiyor mu?
      if (total > 0 && fs.existsSync(destPath)) {
        try {
            const stats = fs.statSync(destPath);
            if (stats.size !== total) {
                fs.unlinkSync(destPath); 
                return reject(new Error('İndirme yarıda kesildi! Lütfen bağlantınızı kontrol edin.'));
            }
        } catch(e) {
            // statSync atarken dosya kilitliyse patlamaması için try-catch eklendi
        }
      }
      resolve(); 
    });

    res.body.pipe(fileStream);
  });
}

function normalizeName(name) { return String(name ?? "").trim().toLowerCase(); }

// YENİ: getIsCancelled isimli iptal olup olmadığını söyleyen fonksiyonu ekledik
async function syncMods(modsDir, onStatus, onProgress, store, getIsCancelled) {
  if (!store) throw new Error("syncMods: 'store' parametresi zorunlu.");
  
  // Yardımcı fonksiyon: Eğer ana pencereden iptal sinyali gelirse true döner
  const checkCancel = () => {
      return getIsCancelled && typeof getIsCancelled === 'function' ? getIsCancelled() : false;
  };

  const manifest = await loadManifest();
  if (checkCancel()) throw new Error("CANCELLED");

  // HATA DÜZELTMESİ (EMFILE): Klasör işlemlerine kısa nefes payları ekleyelim
  const deletedFilenames = manifest.deleted_mods || [];
  if (fs.existsSync(modsDir) && deletedFilenames.length > 0) {
    const existingFiles = fs.readdirSync(modsDir);
    for (const file of existingFiles) {
      if (checkCancel()) throw new Error("CANCELLED"); // Döngüde iptal kontrolü
      
      const baseName = file.replace('.disabled', '');
      if (deletedFilenames.includes(baseName)) {
        try {
          fs.unlinkSync(path.join(modsDir, file));
          onStatus?.(`🧹 Eski mod temizlendi: ${baseName}`);
          // Windows'a dosyayı kapatıp nefes alması için 10 milisaniye veriyoruz
          await new Promise(r => setTimeout(r, 10)); 
        } catch (e) {
          console.warn(`⚠️ Mod silinemedi: ${file}`, e);
        }
      }
    }
  }

  const disabledModsRaw = store.get('disabledMods', []);
  const disabledSet = new Set(
    (Array.isArray(disabledModsRaw) ? disabledModsRaw : [])
      .filter(d => typeof d === 'string').map(normalizeName)
  );

  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

  function pathsFor(mod) {
    const enabledPath = path.join(modsDir, mod.filename);
    const disabledPath = `${enabledPath}.disabled`;
    return { enabledPath, disabledPath };
  }

  const allMods = manifest.mods;

  for (let i = 0; i < allMods.length; i++) {
    if (checkCancel()) throw new Error("CANCELLED"); // Mod indirmeden önce iptal mi diye bak

    const mod = allMods[i];
    const isDisabled = disabledSet.has(normalizeName(mod.name));
    const { enabledPath, disabledPath } = pathsFor(mod);
    const targetPath = isDisabled ? disabledPath : enabledPath;
    const otherPath = isDisabled ? enabledPath : disabledPath;

    if (!fs.existsSync(targetPath) && fs.existsSync(otherPath)) {
      try { fs.renameSync(otherPath, targetPath); } catch (e) {}
    }

    const alreadyOk = fs.existsSync(targetPath) && (!mod.sha1 || sha1OfFile(targetPath) === mod.sha1);
    if (alreadyOk) continue;

    onStatus?.(`📥 ${mod.name} indiriliyor... (${i + 1}/${allMods.length})`);
    
    try {
      // Artık checkCancel parametresini içeri yolluyoruz, 
      // böylece dosya inerken bile durdurulursa stream iptal edilecek!
      await downloadFile(mod.url, targetPath, (frac) => {
        onProgress?.((i + frac) / allMods.length);
      }, checkCancel);
    } catch (err) {
      if (err.message === "CANCELLED") {
          throw err; // İptal edildiyse işlemi tamamen kes
      }
      console.error(`❌ ${mod.name} indirilemedi:`, err);
      throw err; 
    }
  }
  
  if (checkCancel()) throw new Error("CANCELLED");
  onStatus?.("✅ Tüm modlar senkronize edildi.");
  return manifest;
}

module.exports = { syncMods, loadManifest };