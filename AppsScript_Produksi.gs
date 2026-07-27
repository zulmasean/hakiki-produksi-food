/**
 * APPS SCRIPT WEB APP - PRODUKSI (3 BRAND)
 * Menerima data laporan PRODUKSI (JSON) dari bot WhatsApp dan mencatatnya
 * ke Google Sheet, dengan 1 tab rincian TERPISAH per brand:
 *   - "Produksi Mie Ayam Hakiki"
 *   - "Produksi Ayam Kabupaten"
 *   - "Produksi Pempek Makcik"
 * Ditambah 1 tab rekap gabungan: "Total Harian" (berisi total harian
 * dari ketiga brand tersebut, dibedakan lewat kolom "Outlet").
 *
 * FITUR EDIT PESAN (sama seperti sebelumnya):
 * Setiap laporan dikirim dengan "reportId" unik (dibentuk dari ID grup +
 * outlet + tanggal). Kalau reportId yang sama dikirim lagi (karena admin
 * mengedit pesan di WA), sistem akan MENGHAPUS baris-baris lama dengan
 * reportId itu lalu menulis ulang barisnya dari awal. Kolom "Report ID"
 * di ujung kanan sheet dipakai untuk pencocokan ini — jangan
 * diedit/dihapus manual.
 *
 * CARA PASANG:
 * 1. Buka/buat Google Sheet tujuan -> menu Extensions > Apps Script.
 * 2. Hapus isi default file Code.gs, tempel seluruh kode ini.
 * 3. Ganti nilai SHARED_SECRET di bawah dengan kode rahasia BARU -
 *    HARUS SAMA PERSIS dengan PRODUKSI_SHARED_SECRET di file .env bot
 *    produksi.
 * 4. Klik Deploy > New deployment > pilih tipe "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin URL yang muncul (diakhiri /exec) -> tempel sebagai
 *    PRODUKSI_APPS_SCRIPT_URL di file .env bot produksi.
 * 6. Setiap kali kode ini diubah, buat deployment baru
 *    (Manage deployments > Edit > New version).
 *
 * PENTING: Sheet lama "Laporan Produksi" TIDAK dipakai lagi oleh script
 * ini (data lama Anda tetap aman di sana, tinggal biarkan saja / arsipkan
 * manual jika mau). Semua laporan BARU akan masuk ke 3 tab per-brand di
 * atas, sesuai outlet yang dikirim oleh bot.
 */

const SHARED_SECRET = 'Ay@mb4k4r'; // Pastikan secret ini sama dengan di file .env bot Anda

// Peta nama outlet/brand -> nama tab sheet rincian.
// Nama outlet HARUS PERSIS SAMA dengan yang dikirim oleh bot (lihat
// GROUP_CONFIG di bot-produksi.js).
const OUTLET_SHEET_MAP = {
  'Mie Ayam Hakiki': 'Produksi Mie Ayam Hakiki',
  'Ayam Kabupaten': 'Produksi Ayam Kabupaten',
  'Pempek Makcik': 'Produksi Pempek Makcik',
};

const SHEET_TOTAL = 'Total Harian'; // Rekap total harian gabungan 3 brand

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Server sibuk, coba lagi: ' + err.message });
  }

  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return jsonResponse({ status: 'error', message: 'Unauthorized' });
    }

    const reportId = body.reportId || '';
    if (!reportId) {
      return jsonResponse({ status: 'error', message: 'reportId wajib diisi' });
    }

    const now = new Date();
    const tanggal = body.tanggalText || '';
    const outlet = body.outlet || '';
    const items = body.items || [];
    const totalProduksi = body.totalProduksi || 0;

    if (!outlet) {
      return jsonResponse({ status: 'error', message: 'outlet wajib diisi' });
    }

    const sheetForCheck = getOrCreateSheet(outlet);
    const wasUpdate = hasRowsWithReportId(sheetForCheck, reportId);

    upsertProduksiRows(now, tanggal, outlet, items, totalProduksi, reportId);

    return jsonResponse({ status: 'ok', wasUpdate: wasUpdate });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fungsi untuk mencatat data:
 * - Rincian item masuk ke tab sheet sesuai brand/outlet-nya
 * - Baris total harian masuk ke tab gabungan 'Total Harian'
 */
function upsertProduksiRows(waktu, tanggal, outlet, items, totalReported, reportId) {
  const sheet = getOrCreateSheet(outlet);
  const sheetTotal = getOrCreateTotalSheet();

  // 1. Hapus data lama jika ini adalah revisi pesan (Edit)
  const hadOldRows = deleteRowsByReportId(sheet, reportId);
  deleteRowsByReportId(sheetTotal, reportId);

  // 2. Beri pembatas 1 baris kosong HANYA JIKA TANGGAL BERBEDA
  const lastRow = sheet.getLastRow();
  if (lastRow > 1 && !hadOldRows) {
    const lastRowData = sheet.getRange(lastRow, 1, 1, 6).getValues()[0];
    const isLastRowEmpty = lastRowData.join('').trim() === '';
    const lastTanggal = lastRowData[1];

    if (!isLastRowEmpty && String(lastTanggal).trim() !== String(tanggal).trim()) {
      sheet.appendRow(['', '', '', '', '', '']);
    }
  }

  // 3. Tulis rincian item ke tab sheet brand yang bersangkutan
  items.forEach((item) => {
    sheet.appendRow([waktu, tanggal, outlet, item.description || '', item.amount || 0, reportId]);
  });

  // 4. Tulis rekap total harian ke tab gabungan "Total Harian"
  sheetTotal.appendRow([waktu, tanggal, outlet, totalReported, reportId]);
}

function hasRowsWithReportId(sheet, reportId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const col = getColumnIndex(sheet, 'Report ID');
  if (!col) return false;

  const finder = sheet.getRange(2, col, lastRow - 1, 1)
    .createTextFinder(reportId)
    .matchEntireCell(true);
  return finder.findNext() !== null;
}

function deleteRowsByReportId(sheet, reportId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const col = getColumnIndex(sheet, 'Report ID');
  if (!col) return false;

  let found = false;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === reportId) {
      sheet.deleteRow(i + 2);
      found = true;
    }
  }
  return found;
}

function getColumnIndex(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  return idx === -1 ? -1 : idx + 1;
}

/**
 * Mengambil (atau membuat) tab sheet rincian sesuai nama outlet/brand.
 * Jika outlet tidak dikenal di OUTLET_SHEET_MAP, tetap dibuatkan tab
 * baru bernama "Produksi <outlet>" sebagai fallback aman.
 */
function getOrCreateSheet(outletName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = OUTLET_SHEET_MAP[outletName] || ('Produksi ' + outletName);

  let sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  sheet.appendRow(['Waktu Masuk', 'Tanggal', 'Outlet', 'Deskripsi', 'Jumlah', 'Report ID']);
  sheet.setFrozenRows(1);
  return sheet;
}

function getOrCreateTotalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TOTAL);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_TOTAL);
  sheet.appendRow(['Waktu Masuk', 'Tanggal', 'Outlet', 'Total', 'Report ID']);
  sheet.setFrozenRows(1);
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({ status: 'ok', message: 'WA Produksi Bot Web App is running.' });
}
