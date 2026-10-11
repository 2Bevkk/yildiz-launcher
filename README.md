# Topluluk Launcher

Basit bir Minecraft launcher: Microsoft ile giriş → Oyna butonu → arka planda
Fabric ve modların otomatik indirilmesi → oyunun başlatılması.

## Kurulum (geliştirici olarak sizin yapmanız gerekenler)

```bash
cd mc-launcher
npm install
npm start
```

`npm install` sırasında `electron` indirileceği için ilk kurulum biraz sürebilir.

## Modpack'i yapılandırma

`config/manifest.json` dosyasını kendi sunucunuza göre düzenleyin:

- `minecraftVersion`, `fabricLoaderVersion`: sunucunuzla aynı olmalı.
- `serverIp`: oyuncular oyun açıldığında otomatik bu sunucuya bağlanır.
- `mods`: her mod için doğrudan `.jar` indirme linki (Modrinth/CurseForge'daki
  "Download" linkine sağ tık → "bağlantı adresini kopyala" ile alabilirsiniz).
  `sha1` alanını boş bırakabilirsiniz; doldurursanız launcher dosyanın bozuk/eski
  olup olmadığını hash ile kontrol eder.

### Modpack'i uzaktan güncellenebilir yapmak

Şu an launcher `config/manifest.json` dosyasını yerelden okuyor. Modları
güncellediğinizde oyuncuların tekrar launcher indirmesini istemiyorsanız:

1. `manifest.json` dosyasını bir GitHub reposuna koyun (public repo, raw linki
   alın: `https://raw.githubusercontent.com/kullanici/repo/main/manifest.json`)
2. Launcher'ı `MANIFEST_URL` ortam değişkeniyle çalıştırın ya da `modDownloader.js`
   içindeki `MANIFEST_URL` sabitine bu linki yazın.

Böylece siz repo'yu güncelleyince, oyuncular launcher'ı her açtığında yeni
modları otomatik indirir, eski/kaldırılmış modlar silinir.

## Microsoft girişi hakkında

Bu launcher **gerçek Microsoft hesabı** ile giriş yapar (`msmc` kütüphanesi).
Oyuncularınızın Minecraft'ı satın almış olması gerekir — bu, hem yasal hem de
sunucunuzun `online-mode=true` ile güvenli çalışmasını sağlar (kimlik taklidi,
isim çalma gibi sorunları önler).

**Rate limit notu:** `msmc` varsayılan olarak paylaşılan bir Microsoft
client ID kullanır. Küçük bir topluluk (birkaç düzine oyuncu) için bu genelde
sorun çıkarmaz. Daha büyük ölçekte "429 Too Many Requests" gibi hatalar
alırsanız, kendi Azure uygulamanızı kaydedip (ücretsiz, portal.azure.com →
"App registrations" → "Mobile and desktop applications" tipi) elde ettiğiniz
client ID'yi `main.js` içinde şu şekilde geçin:

```js
const authManager = new Auth("select_account", { client_id: "SIZIN_CLIENT_ID" });
```

## Token yenileme (production için eklenmesi gereken kısım)

Mevcut kod, girişten sonra token'ı `electron-store` ile diskte saklıyor ama
Microsoft token'ları birkaç saat sonra süresi doluyor. Gerçek kullanımda
`authManager.refresh(savedToken)` akışını `play` handler'ının başında
çağırarak süresi dolan token'ı otomatik yenilemeniz gerekir — aksi halde
oyuncular belirli bir süre sonra tekrar giriş yapmak zorunda kalır. `msmc`
dokümantasyonundaki "refresh" bölümüne bakabilirsiniz:
https://github.com/Hanro50/MSMC

## Dağıtım (oyunculara .exe/.dmg/.AppImage vermek)

```bash
npm run dist
```

`electron-builder`, `package.json` içindeki `build` ayarlarına göre
Windows/Mac/Linux için tek dosyalık kurulum paketleri üretir (`dist/` klasörü).

## Klasör yapısı

```
mc-launcher/
  main.js            → Electron ana süreç: auth, indirme, launch mantığı
  preload.js          → renderer'a güvenli API köprüsü
  modDownloader.js     → manifest okuma + mod indirme/senkronizasyon
  config/manifest.json → mod listesi, sürüm bilgisi, sunucu adresi
  renderer/            → arayüz (HTML/CSS/JS)
```
