require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { parseProduksiReport } = require('./parser-produksi');

// ============================================================
// ISI ID GRUP WHATSAPP UNTUK 3 BRAND PRODUKSI DI SINI.
// Cara cari ID grup: jalankan bot ini, kirim pesan apapun dari grup yang
// dimaksud, lalu lihat log CLI "Pesan dari grup belum terdaftar: <ID>".
// Salin ID tersebut ke bawah ini sesuai brand-nya.
//
// CATATAN: Grup lama (yang sebelumnya dipakai untuk 1 outlet "Palmerah")
// sekarang otomatis dipetakan ke brand "Pempek Makcik", supaya laporan
// yang sudah masuk dari grup itu tetap tercatat di bawah brand ini.
// ============================================================
const GROUP_CONFIG = {
  '120363429638585360@g.us': 'Pempek Makcik', // grup lama -> otomatis jadi Pempek Makcik
  'ISI_ID_GRUP_MIE_AYAM_HAKIKI@g.us': 'Mie Ayam Hakiki', // GANTI dengan ID grup Mie Ayam Hakiki
  'ISI_ID_GRUP_AYAM_KABUPATEN@g.us': 'Ayam Kabupaten', // GANTI dengan ID grup Ayam Kabupaten
};

const APPS_SCRIPT_URL = process.env.PRODUKSI_APPS_SCRIPT_URL;
const SHARED_SECRET = process.env.PRODUKSI_SHARED_SECRET;

async function sendToSheet(payload) {
  return axios.post(
      APPS_SCRIPT_URL,
      { ...payload, secret: SHARED_SECRET },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
}

function buildReportId(jid, outlet, tanggalText) {
  const normalizedOutlet = (outlet || '').toLowerCase().trim();
  const normalizedTanggal = (tanggalText || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${jid}::${normalizedOutlet}::${normalizedTanggal}`;
}

async function handleProduksiText({ sock, jid, text, outlet }) {
  try {
    const parsed = parseProduksiReport(text, outlet);

    if (parsed.criticalErrors && parsed.criticalErrors.length > 0) {
      console.log(`\n[DEBUG] Laporan produksi (${outlet}) DITOLAK karena salah format/typo.`);

      const errorMsg = `❌ *LAPORAN PRODUKSI DITOLAK (Ada Kesalahan Format/Typo)* ❌\n\nSistem menemukan kesalahan pada tulisan Anda. Laporan *TIDAK DISIMPAN* ke Google Sheet.\n\nSilakan perbaiki kesalahan berikut dan kirim ulang sebagai pesan baru:\n\n- ${parsed.criticalErrors.join('\n- ')}`;

      await sock.sendMessage(jid, { text: errorMsg });
      return;
    }

    const reportId = buildReportId(jid, parsed.outlet, parsed.tanggalText);
    console.log(`\n[DEBUG] Memproses laporan produksi (${outlet}) - reportId: ${reportId}`);

    const response = await sendToSheet({
      reportId,
      outlet: parsed.outlet,
      tanggalText: parsed.tanggalText,
      totalProduksi: parsed.totalProduksi, // Hasil hitungan otomatis
      items: parsed.items,
      raw: parsed.raw,
    });

    const wasUpdate = response?.data?.wasUpdate;

    const warningText = (parsed.warnings && parsed.warnings.length > 0)
        ? `\n\n⚠️ *Catatan:*\n- ${parsed.warnings.join('\n- ')}`
        : '';

    const totalFormatted = new Intl.NumberFormat('id-ID').format(parsed.totalProduksi);

    const statusText = wasUpdate
        ? `🔄 Laporan Produksi *${parsed.outlet}* (${parsed.tanggalText || '-'}) berhasil *DIPERBARUI (REVISI)* di Google Sheet.\n\n📊 *Total Perhitungan Otomatis: ${totalFormatted}*`
        : `✅ Laporan Produksi *${parsed.outlet}* (${parsed.tanggalText || '-'}) berhasil *DICATAT* ke Google Sheet.\n\n📊 *Total Perhitungan Otomatis: ${totalFormatted}*`;

    await sock.sendMessage(jid, { text: `${statusText}${warningText}` });
  } catch (err) {
    console.error('Gagal memproses laporan produksi:', err.message);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_session_produksi');
  const { version } = await fetchLatestBaileysVersion();
  const usePairingCode = process.env.USE_PAIRING_CODE === 'true';

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  if (usePairingCode && !sock.authState.creds.registered) {
    const phoneNumber = (process.env.PAIRING_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
    if (phoneNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log('\n🔑 Kode pairing WhatsApp Anda:', code);
        } catch (err) {}
      }, 3000);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !usePairingCode) qrcode.generate(qr, { small: true });

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot Produksi WhatsApp tersambung dan siap menerima laporan dari 3 grup.\n');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;

      // Pastikan pesan berasal dari Grup (diakhiri dengan @g.us)
      if (!jid || !jid.endsWith('@g.us')) continue;

      // Cari tahu grup ini terdaftar untuk brand apa
      const outlet = GROUP_CONFIG[jid];
      if (!outlet) {
        console.log(`ℹ️ Pesan dari grup belum terdaftar sebagai grup produksi: ${jid}`);
        continue;
      }

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      // TANGKAP TYPO KATA "PRODUKSI"
      if (!text || !/^(produksi|produksy|produski|produkasi)\b/i.test(text.trim())) continue;

      console.log(`\n📩 [PESAN MASUK PRODUKSI] Terdeteksi dari grup ${outlet}`);
      await handleProduksiText({ sock, jid, text, outlet });
    }
  });
}

startBot();
