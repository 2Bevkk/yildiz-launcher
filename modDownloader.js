const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");

async function loadManifest() {
  const npointUrl = 'https://api.npoint.io/176eec75c7a66d1ea571';
  const res = await fetch(npointUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error("Manifest yüklenemedi!");
  return await res.json();
}

function sha1OfFile(filePath) {
  const hash = crypto.createHash("sha1");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function downloadFile(url, destPath, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İndirme başarısız: ${res.status}`);
  const total = parseInt(res.headers.get('content-length'), 10);
  let downloaded = 0;
  const chunks = [];
  res.body.on('data', (chunk) => {
    chunks.push(chunk);
    downloaded += chunk.length;
    if (total && onProgress) onProgress(downloaded / total);
  });
  await new Promise((resolve, reject) => {
    res.body.on('end', resolve);
    res.body.on('error', reject);
  });
  fs.writeFileSync(destPath, Buffer.concat(chunks));
}

function normalizeName(name) { return String(name ?? "").trim().toLowerCase(); }

async function syncMods(modsDir, onStatus, onProgress, store) {
  if (!store) throw new Error("syncMods: 'store' parametresi zorunlu.");
  const manifest = await loadManifest();

  // YENİ: İndirme başlamadan önce deleted_mods taraması yap ve kalıntıları sil
  const deletedFilenames = manifest.deleted_mods || [];
  if (fs.existsSync(modsDir) && deletedFilenames.length > 0) {
    const existingFiles = fs.readdirSync(modsDir);
    for (const file of existingFiles) {
      const baseName = file.replace('.disabled', '');
      if (deletedFilenames.includes(baseName)) {
        try {
          fs.unlinkSync(path.join(modsDir, file));
          onStatus?.(`🧹 Eski mod temizlendi: ${baseName}`);
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

  /* 
    ÖNEMLİ: "Eski dosyaları temizle" bloğu kasıtlı olarak KALDIRILDI. 
    Eğer silme yaparsak oyuncunun dışarıdan manuel attığı "Diğer Modlar"ı da çöpe atar.
  */

  const allMods = manifest.mods;

  for (let i = 0; i < allMods.length; i++) {
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
      await downloadFile(mod.url, targetPath, (frac) => onProgress?.((i + frac) / allMods.length));
    } catch (err) {
      console.error(`❌ ${mod.name} indirilemedi:`, err);
    }
  }
  onStatus?.("✅ Tüm modlar senkronize edildi.");
  return manifest;
}

module.exports = { syncMods, loadManifest };