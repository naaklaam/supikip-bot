import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { initDatabase } from '../db/index.js';
import { checkHeartbeat } from '../services/heartbeat.js';
import { initCronSchedules } from '../services/cron_scheduler.js';
import { MANHWA_CHECK_INTERVAL, checkShinigamiUpdates } from '../services/shinigami_scraper.js';
import { handleIncomingMessage } from '../handlers/message_handler.js';
import { chatHistories } from '../handlers/llm.js';
import { getBrowsers, getDisconnectReason, getMakeWASocket, getUseMultiFileAuthState } from '../utils/baileys_loader.js';

// Mencegah inisialisasi database berulang saat WhatsApp reconnect.
let databaseInitialized = false;
let messageQueue = Promise.resolve();
let queuedMessageCount = 0;

/**
 * Menjalankan handler pesan secara berurutan untuk mencegah race condition
 * pada chat history, database writes, dan WhatsApp send operations.
 */
function enqueueMessage(sock, msg) {
  if (!msg) return;

  queuedMessageCount += 1;
  messageQueue = messageQueue
    .catch((err) => {
      console.error('[Message Queue] Previous handler failed:', err.message);
    })
    .then(async () => {
      if (queuedMessageCount > 0) queuedMessageCount -= 1;
      await handleIncomingMessage(sock, msg);
    })
    .catch((err) => {
      console.error('[Message Queue] Message handler failed:', err.message);
    });
}

/**
 * Fungsi utama untuk menjalankan bot WhatsApp menggunakan Baileys.
 */
async function startBot() {
  console.log('Memulai koneksi WhatsApp...');

  // Lazy load baileys modules (reduces memory footprint)
  const [useMultiFileAuthState, makeWASocket, Browsers, DisconnectReason] = await Promise.all([
    getUseMultiFileAuthState(),
    getMakeWASocket(),
    getBrowsers(),
    getDisconnectReason()
  ]);

  // Menggunakan strategi penyimpanan sesi multi-file di folder 'sesi_speaki'
  const { state, saveCreds } = await useMultiFileAuthState('sesi_speaki');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // Menampilkan QR Code di terminal untuk scan
    browser: Browsers.ubuntu('Chrome'), // Profil browser resmi Ubuntu Chrome untuk mencegah penolakan penautan
    logger: pino({ level: 'silent' }) // Mematikan log bawaan yang terlalu bising
  });

  sock.ev.on('creds.update', saveCreds);

  let pairingCodeRequested = false;
  let reconnectAttempts = 0;
  let scraperInterval = null;

  // Mengelola siklus hidup koneksi WebSocket WhatsApp
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Dukungan Pairing Code (8 digit) secara stabil saat WebSocket aktif
    if (qr && !sock.authState.creds.registered && !pairingCodeRequested) {
      pairingCodeRequested = true;
      const phoneNumber = (process.env.BOT_NUMBER || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n==================================================');
        console.log(`🔑 KODE PAIRING WHATSAPP AKTIF (8 DIGIT): ${code}`);
        console.log(`Nomor HP: ${phoneNumber}`);
        console.log('Petunjuk di HP: Buka WhatsApp -> Perangkat Tertaut -> Tautkan dengan Nomor Telepon');
        console.log('==================================================\n');
      } catch (err) {
        console.error('[Pairing Code Error] Gagal meminta Pairing Code:', err.message);
        pairingCodeRequested = false;
      }
    }

    if (qr) {
      console.log('\n==================================================');
      console.log('SILAKAN SCAN QR CODE DI BAWAH INI UNTUK LOGIN:');
      console.log('==================================================\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;

      console.log(`Koneksi ditutup karena: ${lastDisconnect?.error?.message}. Menghubungkan kembali: ${shouldReconnect}`);

      // Matikan interval scraper agar tidak bocor memori atau crash saat offline
      if (scraperInterval) {
        clearInterval(scraperInterval);
        scraperInterval = null;
        console.log('[Shinigami Scraper] Menonaktifkan interval scraper karena koneksi ditutup.');
      }

      if (shouldReconnect) {
        const baseDelay = 2000;
        const maxDelay = 60000;
        const delay = Math.min(maxDelay, baseDelay * 2 ** Math.min(reconnectAttempts, 5));
        reconnectAttempts += 1;
        console.log(`[Reconnect] Menunggu ${delay / 1000} detik sebelum reconnect...`);
        setTimeout(() => startBot(), delay);
      } else {
        console.log('Sesi keluar. Silakan hapus folder "sesi_speaki" dan jalankan ulang untuk scan QR.');
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('==================================================');
      console.log('Speaki Bot telah sukses terhubung ke WhatsApp! 🎉');
      console.log('==================================================');

      // Inisialisasi Database SQLite3 lokal secara sinkron sebelum fitur memori berjalan
      if (!databaseInitialized) {
        try {
          await initDatabase();
          databaseInitialized = true;
          console.log('[SQLite DB] Database Speaki berhasil diinisialisasi.');
        } catch (err) {
          console.error('[SQLite DB] Gagal inisialisasi database:', err.message);
          return;
        }
      }

      // Jalankan pemeriksaan update shinigami langsung setelah terhubung
      checkShinigamiUpdates(sock);

      // Jalankan pengecekan heartbeat untuk tugas berkala (jika ada)
      checkHeartbeat(sock);

      // Inisialisasi cron jobs dinamis
      initCronSchedules(sock);

      // Routine pembersihan berkala untuk TTL Chat History (dijalankan setiap 18 jam)
      setInterval(() => {
        const now = Date.now();
        const TTL_DURATION = 18 * 60 * 60 * 1000; // 18 Jam dalam milidetik
        let count = 0;
        for (const [key, val] of chatHistories.entries()) {
          if (now - val.lastAccessed > TTL_DURATION) {
            chatHistories.delete(key);
            count++;
          }
        }
        if (count > 0) {
          console.log(`[Chat History] TTL cleaner berjalan. Menghapus ${count} riwayat obrolan yang kedaluwarsa.`);
        }
      }, 60 * 60 * 1000);

      // Pasang interval pemeriksaan berkala
      if (scraperInterval) clearInterval(scraperInterval);
      scraperInterval = setInterval(() => {
        checkShinigamiUpdates(sock);
        checkHeartbeat(sock);
      }, MANHWA_CHECK_INTERVAL);
      console.log(`[Shinigami Scraper] Interval aktif setiap ${MANHWA_CHECK_INTERVAL / 60000} menit.`);
    }
  });

  // Menangani pesan masuk
  sock.ev.on('messages.upsert', async (m) => {
    enqueueMessage(sock, m.messages[0]);
  });
}

// Menangani error yang tidak tertangkap agar proses bot tidak langsung mati total
process.on('uncaughtException', (err) => {
  console.error('Terjadi Uncaught Exception:', err);
});

export { startBot };
