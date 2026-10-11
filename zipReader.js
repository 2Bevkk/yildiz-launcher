const { Buffer } = require('buffer');

/**
 * Buffer olarak verilen bir zip dosyasından belirtilen dosyayı okur.
 * @param {Buffer} zipBuffer - Zip dosyasının buffer'ı
 * @param {string} fileName - Okunacak dosyanın adı (ör: "fabric.mod.json")
 * @returns {Promise<Buffer>} - Dosyanın içeriği
 */
function readFileFromZip(zipBuffer, fileName) {
  return new Promise((resolve, reject) => {
    const { Readable } = require('stream');
    const yauzl = require('yauzl');

    // Buffer'ı readable stream'e çevir
    const readable = Readable.from(zipBuffer);

    yauzl.fromReadable(readable, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err, stream) => {
            if (err) return reject(err);
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
              resolve(Buffer.concat(chunks));
              zipfile.close();
            });
            stream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        reject(new Error(`Dosya bulunamadı: ${fileName}`));
      });

      zipfile.on('error', reject);
    });
  });
}

module.exports = { readFileFromZip };