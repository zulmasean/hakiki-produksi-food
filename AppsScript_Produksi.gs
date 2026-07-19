/**
 * APPS SCRIPT WEB APP - PRODUKSI
 * Menerima data laporan PRODUKSI (JSON) dari bot WhatsApp dan mencatatnya
 * ke 1 Google Sheet: "Laporan Produksi".
 *
 * FITUR EDIT PESAN (sama seperti bot sales):
 * Setiap laporan dikirim dengan "reportId" unik (dibentuk dari ID grup +
 * outlet + tanggal). Kalau reportId yang sama dikirim lagi (karena admin
 * mengedit pesan di WA), sistem akan MENGHAPUS baris-baris lama dengan
 * reportId itu lalu menulis ulang barisnya dari awal. Kolom "Report ID"
 * di ujung kanan sheet dipakai untuk pencocokan ini — jangan
 * diedit/dihapus manual.
 *
 * CARA PASANG:
 * 1. Buka/buat Google Sheet tujuan -> menu Extensions > Apps Script.
 *    (Boleh Sheet baru terpisah dari Sheet sales, atau tab baru di
 *    Sheet yang sama - script ini otomatis membuat tab "Laporan
 *    Produksi" jika belum ada.)
 * 2. Hapus isi default file Code.gs, tempel seluruh kode ini.
 * 3. Ganti nilai SHARED_SECRET di bawah dengan kode rahasia BARU -
 *    HARUS SAMA PERSIS dengan PRODUKSI_SHARED_SECRET di file .env bot
 *    produksi. Sebaiknya JANGAN pakai secret yang sama dengan bot sales.
 * 4. Klik Deploy > New deployment > pilih tipe "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Salin URL yang muncul (diakhiri /exec) -> tempel sebagai
 *    PRODUKSI_APPS_SCRIPT_URL di file .env bot produksi.
 * 6. Setiap kali kode ini diubah, buat deployment baru
 *    (Manage deployments > Edit > New version).
 */

const SHARED_SECRET = 'Ay@mb4k4r';

const SHEET_PRODUKSI = 'Laporan Produksi';

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

    const sheetForCheck = getOrCreateSheet();
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
 * Sheet Produksi punya banyak baris per laporan (1 baris per item), sama
 * seperti Sheet Pengeluaran Outlet di bot sales. Untuk edit, cara paling
 * aman adalah hapus semua baris lama dengan reportId yang sama, lalu
 * tulis ulang set barisnya dari awal.
 */
function upsertProduksiRows(waktu, tanggal, outlet, items, totalReported, reportId) {
  const sheet = getOrCreateSheet();

  deleteRowsByReportId(sheet, reportId);

  let itemsSum = 0;
  items.forEach((item) => {
    itemsSum += item.amount || 0;
    sheet.appendRow([waktu, tanggal, outlet, item.description || '', item.amount || 0, reportId]);
  });

  sheet.appendRow([waktu, tanggal, outlet, 'TOTAL PRODUKSI (tertulis di pesan)', totalReported, reportId]);

  if (Math.abs(itemsSum - totalReported) > 1) {
    sheet.appendRow([waktu, tanggal, outlet, '⚠️ Selisih dengan jumlah item', itemsSum - totalReported, reportId]);
  }
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
  if (lastRow < 2) return;
  const col = getColumnIndex(sheet, 'Report ID');
  if (!col) return;

  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === reportId) {
      sheet.deleteRow(i + 2);
    }
  }
}

function getColumnIndex(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(headerName);
  return idx === -1 ? -1 : idx + 1;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PRODUKSI);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_PRODUKSI);
  sheet.appendRow(['Waktu Masuk', 'Tanggal', 'Outlet', 'Deskripsi', 'Jumlah', 'Report ID']);
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
