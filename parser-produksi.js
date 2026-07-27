// parser-produksi.js

function toNumber(raw, labelForError) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (s === '' || s === '-') return 0;

  s = s.replace(/^rp\.?\s*/i, '').trim();

  const kMatch = s.match(/^([\d.,]+)\s*(rb|k)$/i);
  if (kMatch) {
    const numStr = kMatch[1].replace(/\./g, '').replace(',', '.');
    const num = Number(numStr);
    if (isNaN(num)) throw new Error(`Kolom "${labelForError}" harus angka.`);
    return Math.round(num * 1000);
  }

  s = s.replace(/\./g, '').replace(/,/g, '.');
  const n = Number(s);

  if (isNaN(n)) {
    throw new Error(`Kolom "${labelForError}" salah isi: "${raw}". Harus berupa ANGKA SAJA.`);
  }
  return Math.round(n);
}

// Daftar nama brand/outlet yang dikenali sistem (huruf kecil).
// Diurutkan dari yang paling panjang supaya pencocokan prefix tidak
// salah potong ketika satu nama adalah awalan dari nama lain.
const KNOWN_OUTLETS_PRODUKSI = ['mie ayam hakiki', 'ayam kabupaten', 'pempek makcik'].sort(
  (a, b) => b.length - a.length
);

function normalizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseProduksiItemLine(line, criticalErrors) {
  const cleaned = line.replace(/^[-•*]+\s*/, '').trim();
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
            `SALAH GRUP! Anda mengirim laporan untuk brand *${writtenOutlet.toUpperCase()}* di dalam grup *${outletFromGroup.toUpperCase()}*.`
          );
        } else if (!writtenOutlet && !restLower.startsWith(outletGroupLower)) {
          result.criticalErrors.push(
            `Nama brand pada baris pertama salah ketik atau tidak sesuai dengan nama grup ini (*${outletFromGroup.toUpperCase()}*).`
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

    // ABAIKAN jika admin masih mengetik "Total produksi :" karena kita hitung otomatis
    if (/^total\s*produksi\s*:/i.test(line)) {
      continue;
    }

    if (/^[-•*]/.test(line)) {
      const item = parseProduksiItemLine(line, result.criticalErrors);
      if (item) result.items.push(item);
      continue;
    }

    result.criticalErrors.push(`Baris salah ketik / format tidak dikenali: "${line}"`);
  }

  if (result.items.length === 0) {
    result.criticalErrors.push('Tidak ada item produksi yang tercatat (baris harus diawali "*" atau "-").');
  }

  // HITUNG TOTAL OTOMATIS
  result.totalProduksi = result.items.reduce((sum, it) => sum + it.amount, 0);

  return result;
}

module.exports = { parseProduksiReport, toNumber, parseProduksiItemLine, normalizeLabel };
