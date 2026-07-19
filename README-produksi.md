# Bot Pencatat Produksi (WhatsApp → Google Sheet)

Bot WhatsApp untuk mencatat **laporan produksi harian** dari 1 grup WhatsApp ke 1 Google Sheet, dengan validasi format yang ketat (laporan salah ketik/typo akan **ditolak**, bukan disimpan asal-asalan).

Ini adalah bot **terpisah** dari bot sales (`bot.js`), dengan sesi WhatsApp, secret, dan sheet sendiri. Boleh dijalankan bersamaan dengan bot sales tanpa bentrok.

## Daftar isi

- [Fitur](#fitur)
- [Format pesan yang diterima](#format-pesan-yang-diterima)
- [Struktur file](#struktur-file)
- [Cara pasang](#cara-pasang)
  1. [Deploy Apps Script](#1-deploy-apps-script)
  2. [Siapkan bot](#2-siapkan-bot)
  3. [Konfigurasi `.env`](#3-konfigurasi-env)
  4. [Cari ID grup WhatsApp](#4-cari-id-grup-whatsapp)
  5. [Jalankan bot](#5-jalankan-bot)
- [Fitur edit pesan (revisi laporan)](#fitur-edit-pesan-revisi-laporan)
- [Menguji parser tanpa WhatsApp](#menguji-parser-tanpa-whatsapp)
- [Struktur Google Sheet](#struktur-google-sheet)
- [Troubleshooting](#troubleshooting)

## Fitur

- 1 grup WhatsApp → 1 outlet → 1 Google Sheet (tab `Laporan Produksi`).
- Validasi ketat: baris pertama wajib diawali kata **"Produksi"**, outlet wajib sesuai grup, dan tiap item wajib diakhiri angka yang valid. Kalau tidak, laporan **ditolak otomatis** dan bot membalas daftar kesalahannya.
- Info selisih (bukan penolakan) kalau "Total produksi" yang ditulis tidak sama dengan jumlah rincian item.
- Edit pesan di WhatsApp = laporan otomatis **diperbarui** di Sheet (bukan jadi baris duplikat).
- Anti-race-condition: kalau ada beberapa event masuk hampir bersamaan, diproses berurutan (pakai `LockService` di Apps Script).

## Format pesan yang diterima

```
Produksi Palmerah Sabtu 18 Juli 2026

Total produksi : 42000

* ayam 3kg 30000
* garam 1 bks 2000
* minyak 1 ltr 10000
```

Aturan format:

| Bagian | Aturan |
|---|---|
| Baris pertama | Wajib diawali `Produksi` (toleransi typo: `Produksy`, `Produski`, `Produkasi`). Setelah itu nama outlet (harus cocok dengan outlet grup) lalu tanggal bebas. |
| `Total produksi : <angka>` | Wajib ada, hanya berisi angka (boleh pakai `.`/`,` sebagai pemisah ribuan, atau akhiran `rb`/`k`, mis. `150rb`). |
| Baris item | Diawali `*` atau `-`. **Angka terakhir** di baris = nominal, sisanya = nama item. Contoh: `* garam 1 bks 2000` → deskripsi `garam 1 bks`, nominal `2000`. |
| Baris lain | Baris yang tidak cocok pola manapun akan membuat laporan **ditolak**. |

Kalau ada kesalahan, bot membalas contoh seperti ini dan **tidak menyimpan apapun** ke Sheet:

```
❌ LAPORAN PRODUKSI DITOLAK (Ada Kesalahan Format/Typo) ❌

Sistem menemukan kesalahan pada tulisan Anda. Laporan TIDAK DISIMPAN ke Google Sheet.

Silakan perbaiki kesalahan berikut dan kirim ulang sebagai pesan baru:

- Format item produksi salah: "* ayam 3kg tigapuluhribu". Gunakan format: <nama item> <jumlah> contoh: ayam 3kg 30000
```

## Struktur file

```
parser-produksi.js        # Logika parsing & validasi teks laporan
bot-produksi.js            # Bot WhatsApp (Baileys) - dengar 1 grup, kirim ke Apps Script
AppsScript_Produksi.gs     # Web app Google Apps Script - simpan ke 1 sheet
test-parser-produksi.js    # Test parser tanpa perlu WhatsApp menyala
package.json               # Dependency (sama dengan bot sales, tidak perlu install baru)
```

## Cara pasang

### 1. Deploy Apps Script

1. Buka Google Sheet tujuan (boleh Sheet baru, boleh tab baru di Sheet sales yang sudah ada — script ini otomatis membuat tab `Laporan Produksi` sendiri).
2. Menu **Extensions > Apps Script**.
3. Hapus isi default `Code.gs`, tempel seluruh isi `AppsScript_Produksi.gs`.
4. Ganti nilai `SHARED_SECRET` dengan kode rahasia baru. **Sebaiknya jangan pakai secret yang sama dengan bot sales.**
5. **Deploy > New deployment** → pilih tipe **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Salin URL yang muncul (diakhiri `/exec`) — ini akan jadi `PRODUKSI_APPS_SCRIPT_URL`.

> Setiap kali kode `.gs` diubah lagi nanti, buat deployment baru lewat **Manage deployments > Edit > New version**, supaya perubahan aktif.

### 2. Siapkan bot

Bot ini pakai dependency yang **sama persis** dengan bot sales (`@whiskeysockets/baileys`, `axios`, `dotenv`, `pino`, `qrcode-terminal`), jadi kalau folder project bot sales sudah pernah `npm install`, tinggal salin ketiga file (`parser-produksi.js`, `bot-produksi.js`, `test-parser-produksi.js`) ke folder yang sama — tidak perlu install ulang apapun.

Kalau mulai dari folder kosong:

```bash
npm install @whiskeysockets/baileys axios dotenv pino qrcode-terminal
```

### 3. Konfigurasi `.env`

Tambahkan baris berikut ke file `.env` (boleh file `.env` yang sama dengan bot sales):

```env
PRODUKSI_APPS_SCRIPT_URL=https://script.google.com/macros/s/xxxxxxxx/exec
PRODUKSI_SHARED_SECRET=isi_sama_persis_dengan_SHARED_SECRET_di_gs

# Opsional, kalau mau login pakai kode pairing (bukan scan QR):
USE_PAIRING_CODE=false
PAIRING_PHONE_NUMBER=
```

### 4. Cari ID grup WhatsApp

Buka `bot-produksi.js`, isi sementara `PRODUKSI_GROUP_JID` dengan nilai apa saja (mis. `PLACEHOLDER`), lalu jalankan bot dan scan QR. Kirim pesan apapun ke grup produksi yang dimaksud dari HP. ID grup asli (`xxxxxxxxxx@g.us`) tidak akan tertangkap otomatis karena filter grup masih salah — cara paling cepat: pakai bot sales yang sudah punya log `ℹ️ Pesan dari grup belum terdaftar: <ID>` untuk grup yang belum dikenal, kirim pesan dari grup produksi di sana untuk melihat ID-nya, lalu masukkan ID itu ke `PRODUKSI_GROUP_JID`.

Setelah dapat ID grup yang benar, edit di `bot-produksi.js`:

```js
const PRODUKSI_GROUP_JID = '120363xxxxxxxxxxxx@g.us'; // ID grup produksi
const PRODUKSI_OUTLET = 'Palmerah'; // nama outlet, harus konsisten dengan yang ditulis admin
```

### 5. Jalankan bot

```bash
node bot-produksi.js
```

Scan QR yang muncul di terminal (atau kode pairing kalau `USE_PAIRING_CODE=true`). Sesi login tersimpan di folder `auth_session_produksi/` (terpisah dari sesi bot sales), jadi tidak perlu scan ulang tiap start.

## Fitur edit pesan (revisi laporan)

`reportId` dibentuk dari `ID grup + outlet + tanggal`. Kalau admin **mengedit** pesan laporan produksi yang sudah pernah terkirim, bot akan mengirim ulang data dengan `reportId` yang sama persis, sehingga Apps Script akan:

1. Menghapus semua baris lama di Sheet dengan `reportId` itu.
2. Menulis ulang baris-baris item + baris total dari data yang baru.

Bot akan membalas `🔄 ... berhasil DIPERBARUI (REVISI)` alih-alih `✅ ... berhasil DICATAT`.

> Kolom **Report ID** di Sheet dipakai sistem untuk pencocokan ini — jangan diedit atau dihapus manual.

## Menguji parser tanpa WhatsApp

```bash
node test-parser-produksi.js
```

Script ini menjalankan 3 skenario: laporan valid, laporan dengan typo pada nominal (harus ditolak), dan laporan dengan total tidak cocok (harus muncul warning tapi tetap tersimpan).

## Struktur Google Sheet

Tab `Laporan Produksi` (dibuat otomatis saat request pertama masuk):

| Waktu Masuk | Tanggal | Outlet | Deskripsi | Jumlah | Report ID |
|---|---|---|---|---|---|
| 2026-07-18 ... | Sabtu 18 Juli 2026 | Palmerah | ayam 3kg | 30000 | `120363...::palmerah::sabtu 18 juli 2026` |
| ... | ... | ... | garam 1 bks | 2000 | ... |
| ... | ... | ... | TOTAL PRODUKSI (tertulis di pesan) | 42000 | ... |

Kalau ada selisih antara total yang ditulis admin dan jumlah rincian item, akan ditambah 1 baris lagi berlabel `⚠️ Selisih dengan jumlah item`.

## Troubleshooting

| Gejala | Kemungkinan penyebab |
|---|---|
| Bot tidak merespon sama sekali | Pesan tidak diawali kata "Produksi" (atau varian typo yang dikenali), atau `PRODUKSI_GROUP_JID` belum sesuai ID grup asli. |
| Balasan "Unauthorized" tidak muncul tapi Sheet tidak terisi | Cek `PRODUKSI_APPS_SCRIPT_URL` — pastikan deployment terbaru sudah diambil URL-nya, dan deployment "Who has access" = **Anyone**. |
| Laporan selalu ditolak padahal formatnya terlihat benar | Cek karakter tersembunyi/spasi ganda; pastikan tiap baris item punya angka murni di akhir (bukan "tiga puluh ribu" dsb — harus digit). |
| Baris lama tidak terhapus saat edit pesan | Pastikan kolom header `Report ID` di Sheet tidak diubah namanya/urutannya secara manual. |
