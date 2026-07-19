// Jalankan: node test-parser-produksi.js
// Untuk memastikan parser produksi bekerja sesuai format sebelum dipakai bot.
const { parseProduksiReport } = require('./parser-produksi');

// Contoh 1: laporan valid, total sesuai jumlah item
const sampleValid = `Produksi Palmerah Sabtu 18 Juli 2026

Total produksi : 42000

* ayam 3kg 30000
* garam 1 bks 2000
* minyak 1 ltr 10000`;

console.log('=== CONTOH 1: Laporan valid ===');
const result1 = parseProduksiReport(sampleValid, 'Palmerah');
console.log(JSON.stringify(result1, null, 2));
if (result1.criticalErrors.length === 0 && result1.warnings.length === 0) {
  console.log('\n✅ Tidak ada error/warning, data konsisten.');
} else {
  console.log('\n⚠️ Error:', result1.criticalErrors, '\n⚠️ Warning:', result1.warnings);
}

// Contoh 2: ada typo pada nominal item -> harus DITOLAK (criticalErrors terisi)
const sampleTypo = `Produksi Palmerah Sabtu 18 Juli 2026

Total produksi : 42000

* ayam 3kg tigapuluhribu
* garam 1 bks 2000`;

console.log('\n\n=== CONTOH 2: Ada typo pada nominal (harus ditolak) ===');
const result2 = parseProduksiReport(sampleTypo, 'Palmerah');
console.log('criticalErrors:', result2.criticalErrors);

// Contoh 3: total tidak cocok dengan jumlah item -> harus muncul WARNING (bukan ditolak)
const sampleSelisih = `Produksi Palmerah Sabtu 18 Juli 2026

Total produksi : 50000

* ayam 3kg 30000
* garam 1 bks 2000`;

console.log('\n\n=== CONTOH 3: Total tidak cocok dengan rincian (harus warning) ===');
const result3 = parseProduksiReport(sampleSelisih, 'Palmerah');
console.log('warnings:', result3.warnings);
