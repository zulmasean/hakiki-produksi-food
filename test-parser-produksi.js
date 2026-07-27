// Jalankan: node test-parser-produksi.js
// Untuk memastikan parser produksi bekerja sesuai format sebelum dipakai bot.
const { parseProduksiReport } = require('./parser-produksi');

// Contoh 1: laporan valid brand "Mie Ayam Hakiki"
const sampleValid = `Produksi Mie Ayam Hakiki Sabtu 18 Juli 2026

Total produksi : 42000

* ayam 3kg 30000
* garam 1 bks 2000
* minyak 1 ltr 10000`;

console.log('=== CONTOH 1: Laporan valid (Mie Ayam Hakiki) ===');
const result1 = parseProduksiReport(sampleValid, 'Mie Ayam Hakiki');
console.log(JSON.stringify(result1, null, 2));
if (result1.criticalErrors.length === 0 && result1.warnings.length === 0) {
  console.log('\n✅ Tidak ada error/warning, data konsisten.');
} else {
  console.log('\n⚠️ Error:', result1.criticalErrors, '\n⚠️ Warning:', result1.warnings);
}

// Contoh 2: ada typo pada nominal item -> harus DITOLAK (criticalErrors terisi)
const sampleTypo = `Produksi Ayam Kabupaten Sabtu 18 Juli 2026

Total produksi : 42000

* ayam 3kg tigapuluhribu
* garam 1 bks 2000`;

console.log('\n\n=== CONTOH 2: Ada typo pada nominal (Ayam Kabupaten, harus ditolak) ===');
const result2 = parseProduksiReport(sampleTypo, 'Ayam Kabupaten');
console.log('criticalErrors:', result2.criticalErrors);

// Contoh 3: total tidak cocok dengan jumlah item -> total dihitung otomatis, tidak masalah
const sampleSelisih = `Produksi Pempek Makcik Sabtu 18 Juli 2026

Total produksi : 50000

* ayam 3kg 30000
* garam 1 bks 2000`;

console.log('\n\n=== CONTOH 3: Total manual berbeda (Pempek Makcik, total tetap dihitung otomatis) ===');
const result3 = parseProduksiReport(sampleSelisih, 'Pempek Makcik');
console.log('totalProduksi (otomatis):', result3.totalProduksi);

// Contoh 4: salah kirim brand ke grup yang salah -> harus DITOLAK
const sampleSalahGrup = `Produksi Ayam Kabupaten Sabtu 18 Juli 2026

* ayam 3kg 30000`;

console.log('\n\n=== CONTOH 4: Salah kirim brand ke grup lain (harus ditolak) ===');
const result4 = parseProduksiReport(sampleSalahGrup, 'Pempek Makcik');
console.log('criticalErrors:', result4.criticalErrors);
