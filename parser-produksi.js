// parser-produksi.js
// Mengubah teks laporan produksi WhatsApp menjadi data terstruktur dengan VALIDASI KETAT.
// Format yang diterima:
//
//   Produksi <Outlet> <Tanggal bebas>
//
//   Total produksi : <angka>
//
//   * <nama item> <jumlah/nominal>
//   * <nama item> <jumlah/nominal>
//   ...
//
// Angka TERAKHIR di setiap baris item dianggap sebagai nominal, sisanya
// (di depannya) dianggap nama/deskripsi item. Contoh:
//   "* ayam 3kg 30000"     -> deskripsi: "ayam 3kg",   jumlah: 30000
//   "* garam 1 bks 2000"   -> deskripsi: "garam 1 bks", jumlah: 2000
//
// Baris boleh diawali "*" atau "-".

function toNumber(raw, labelForError) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (s === '' || s === '-') return 0;

  // Bersihkan "Rp" di awal agar tidak dianggap huruf
  s = s.replace(/^rp\.?\s*/i, '').trim();

  // Format ribuan singkatan: "150rb" atau "150k"
  const kMatch = s.match(/^([\d.,]+)\s*(rb|k)$/i);
  if (kMatch) {
    const numStr = kMatch[1].replace(/\./g, '').replace(',', '.');
    const num = Number(numStr);
    if (isNaN(num)) throw new Error(`Kolom "${labelForError}" harus angka.`);
    return Math.round(num * 1000);
  }

  s = s.replace(/\./g, '').replace(/,/g, '.');

  // Number() sangat ketat. Jika ada 1 huruf saja, hasilnya NaN
  const n = Number(s);

  if (isNaN(n)) {
    throw new Error(`Kolom "${labelForError}" salah isi: "${raw}". Harus berupa ANGKA SAJA.`);
  }
  return Math.round(n);
}

// Daftar outlet yang sah untuk laporan produksi. Tambahkan di sini jika
// suatu saat produksi juga dipakai lebih dari 1 outlet.
const KNOWN_OUTLETS_PRODUKSI = ['palmerah'];

function normalizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse 1 baris item produksi. Angka terakhir pada baris = nominal,
 * sisanya = deskripsi. Jika tidak ada angka valid di akhir baris,
 * ini dianggap kesalahan format (bukan diabaikan diam-diam).
 */
function parseProduksiItemLine(line, criticalErrors) {
  const cleaned = line.replace(/^[-•*]+\s*/, '').trim();

  // Ambil token angka terakhir (boleh pakai titik/koma ribuan, atau akhiran rb/k)
  const match = cleaned.match(/^(.+?)\s+([\d][\d.,]*\s*(?:rb|k)?)$/i);

  if (!match) {
    criticalErrors.push(
      `Format item produksi salah: "${line}". Gunakan format: <nama item> <jumlah> contoh: ayam 3kg 30000`
    );
    return null;
  }

  const description = match[1].trim();
  if (!description) {
    criticalErrors.push(`Item produksi tidak punya nama/deskripsi: "${line}"`);
    return null;
  }

  try {
    const amount = toNumber(match[2], `Item ${description}`);
    return { description, amount };
  } catch (e) {
    criticalErrors.push(e.message);
    return null;
  }
}

function parseProduksiReport(rawText, outletFromGroup) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const result = {
    outlet: outletFromGroup || null,
    tanggalText: null,
    totalProduksi: 0,
    items: [],
    raw: rawText,
    warnings: [],
    criticalErrors: [],
  };

  let firstLineHandled = false;
  let totalFound = false;

  for (const line of lines) {
    if (!firstLineHandled) {
      firstLineHandled = true;

      if (!/^(produksi|produksy|produski|produkasi)\b/i.test(line)) {
        result.criticalErrors.push(`Baris pertama harus diawali kata "Produksi". Baris ditemukan: "${line}"`);
        continue;
      }

      const rest = line.replace(/^(produksi|produksy|produski|produkasi)\s*/i, '').trim();
      const restLower = rest.toLowerCase();

      let writtenOutlet = null;
      for (const o of KNOWN_OUTLETS_PRODUKSI) {
        if (restLower.startsWith(o)) {
          writtenOutlet = o;
          break;
        }
      }

      if (outletFromGroup) {
        const outletGroupLower = outletFromGroup.toLowerCase();
        if (writtenOutlet && writtenOutlet !== outletGroupLower) {
          result.criticalErrors.push(
            `SALAH GRUP! Anda mengirim laporan untuk cabang *${writtenOutlet.toUpperCase()}* di dalam grup *${outletFromGroup.toUpperCase()}*.`
          );
        } else if (!writtenOutlet && !restLower.startsWith(outletGroupLower)) {
          result.criticalErrors.push(
            `Nama outlet pada baris pertama salah ketik atau tidak sesuai dengan nama grup ini (*${outletFromGroup.toUpperCase()}*).`
          );
        }

        const matchedLen = writtenOutlet ? writtenOutlet.length : outletFromGroup.length;
        result.tanggalText = restLower.startsWith(writtenOutlet || outletGroupLower)
          ? rest.slice(matchedLen).trim()
          : rest.trim();
        result.outlet = outletFromGroup;
      } else {
        result.tanggalText = rest.trim();
      }
      continue;
    }

    if (/^total\s*produksi\s*:/i.test(line)) {
      totalFound = true;
      const val = line.split(':').slice(1).join(':').trim();
      try {
        result.totalProduksi = toNumber(val, 'Total produksi');
      } catch (e) {
        result.criticalErrors.push(e.message);
      }
      continue;
    }

    if (/^[-•*]/.test(line)) {
      const item = parseProduksiItemLine(line, result.criticalErrors);
      if (item) result.items.push(item);
      continue;
    }

    result.criticalErrors.push(`Baris salah ketik / format tidak dikenali: "${line}"`);
  }

  if (!totalFound) {
    result.criticalErrors.push('Baris "Total produksi : <angka>" tidak ditemukan / hilang.');
  }
  if (result.items.length === 0) {
    result.criticalErrors.push('Tidak ada item produksi yang tercatat (baris harus diawali "*" atau "-").');
  }

  const itemsSum = result.items.reduce((sum, it) => sum + it.amount, 0);
  if (result.totalProduksi > 0 && Math.abs(itemsSum - result.totalProduksi) > 1) {
    result.warnings.push(
      `Total produksi tertulis (${result.totalProduksi}) ≠ Jumlah rincian item (${itemsSum})`
    );
  }

  return result;
}

module.exports = { parseProduksiReport, toNumber, parseProduksiItemLine, normalizeLabel };
