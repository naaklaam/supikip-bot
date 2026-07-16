import makeWASocket, { useMultiFileAuthState, DisconnectReason, jidNormalizedUser, downloadMediaMessage, Browsers } from '@itsliaaa/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import { toolsSchema, executeTool } from './tools.js';
import cron from 'node-cron';
import { initDatabase, registerSticker } from './database_db.js';

// Memuat variabel lingkungan dari file .env
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';

const FETCH_TIMEOUT_MS = 800; // Timeout untuk fetch Shinigami (800ms)

// ==========================================
// CONFIG & FUNGSI SCRAPER SHINIGAMI MANHWA
// ==========================================
const SHINIGAMI_STATE_FILE = path.join(process.cwd(), 'last_manhwa.json');
const MANHWA_GROUP_JID = process.env.MANHWA_GROUP_JID || '120363407159758205@g.us';
const MANHWA_CHECK_INTERVAL = parseInt(process.env.MANHWA_CHECK_INTERVAL, 10) || 900000; // 15 menit
const scraperHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
let scraperInterval = null;

/**
 * Fungsi untuk melacak domain aktif shinigami dan URL API sveltekit-nya secara dinamis.
 */
async function resolveDomains() {
  let webUrl = "https://g.shinigami.asia"; // fallback default

  // 1. Ambil domain aktif dari landing page
  for (const landingUrl of ["https://shinigami.bio/links.json", "https://shinigami.to/links.json"]) {
    try {
      const res = await fetch(landingUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(800) });
      if (res.ok) {
        const links = await res.json();
        for (const link of links) {
          if (link.title === "Link Website" || link.icon === "globe") {
            webUrl = link.href.replace(/\/$/, '');
            console.log(`[Shinigami Scraper] Menemukan domain aktif dari landing page: ${webUrl}`);
            break;
          }
        }
        break;
      }
    } catch (e) {
      console.error(`[Shinigami Scraper] Gagal mengambil landing page ${landingUrl}:`, e.message);
    }
  }

  // 2. Ambil HTML utama untuk mencari endpoint API SvelteKit secara dinamis
  let apiUrl = "https://api.shngm.io/v1/manga/list"; // fallback default
  try {
    const res = await fetch(webUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const html = await res.text();

      // Cari semua referensi file JS
      const jsPaths = [];
      let match;
      const regex = /src="([^"]+\.js)"|href="([^"]+\.js)"|import\("([^"]+)"\)/g;
      while ((match = regex.exec(html)) !== null) {
        jsPaths.push(match[1] || match[2] || match[3]);
      }

      const nodeFiles = [];
      for (const p of new Set(jsPaths)) {
        if (p.includes('nodes/')) {
          nodeFiles.push(new URL(p, webUrl).href);
        }
      }

      // Jika tidak ada file node langsung di HTML, cari app.js entry
      if (nodeFiles.length === 0) {
        for (const p of new Set(jsPaths)) {
          if (p.includes('entry/app.')) {
            const appUrl = new URL(p, webUrl).href;
            const appRes = await fetch(appUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(800) });
            if (appRes.ok) {
              const appJs = await appRes.text();
              const nodeRegex = /([a-zA-Z0-9_\-\./]+nodes\/[a-zA-Z0-9_\-\./]+\.js)/g;
              let nodeMatch;
              while ((nodeMatch = nodeRegex.exec(appJs)) !== null) {
                nodeFiles.push(new URL(nodeMatch[1], appUrl).href);
              }
            }
          }
        }
      }

      // Scan file node untuk mencari pola URL API
      for (const nodeUrl of new Set(nodeFiles)) {
        try {
          const nodeRes = await fetch(nodeUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(800) });
          if (nodeRes.ok) {
            const nodeJs = await nodeRes.text();
            const apiRegex = /https?:\/\/[a-zA-Z0-9_\-\.]+\/v1\/manga\/list/g;
            const apiMatch = nodeJs.match(apiRegex);
            if (apiMatch) {
              apiUrl = apiMatch[0];
              console.log(`[Shinigami Scraper] Menemukan API URL dinamis: ${apiUrl}`);
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
    }
  } catch (e) {
    console.error("[Shinigami Scraper] Gagal memindai situs untuk URL API:", e.message);
  }

  return { webUrl, apiUrl };
}

/**
 * Fungsi untuk mengambil daftar manhwa terbaru dari API
 */
async function fetchLatestManhwa(apiUrl) {
  const params = new URLSearchParams({
    page: '1',
    page_size: '20',
    sort: 'latest',
    sort_order: 'desc',
    format: 'manhwa'
  });
  const fullUrl = `${apiUrl}?${params.toString()}`;
  const res = await fetch(fullUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(800) });
  if (res.ok) {
    const data = await res.json();
    return data.data || [];
  }
  throw new Error(`Gagal memanggil API Shinigami: HTTP ${res.status}`);
}

/**
 * Fungsi utama pemeriksaan update manhwa dan pengiriman ke grup WhatsApp
 */
async function checkShinigamiUpdates(sock) {
  console.log("[Shinigami Scraper] Memulai pemeriksaan update Manhwa...");
  try {
    const { webUrl, apiUrl } = await resolveDomains();
    const currentList = await fetchLatestManhwa(apiUrl);

    // Muat state sebelumnya
    let state = {};
    let isFirstRun = false;
    if (fs.existsSync(SHINIGAMI_STATE_FILE)) {
      try {
        state = JSON.parse(fs.readFileSync(SHINIGAMI_STATE_FILE, 'utf-8'));
      } catch (e) {
        console.error("[Shinigami Scraper] Gagal membaca berkas state, inisialisasi ulang:", e.message);
        isFirstRun = true;
      }
    } else {
      isFirstRun = true;
    }

    const newState = {};
    const updates = [];

    // Memproses item secara terbalik (dari yang lama ke baru) agar urutan pengiriman sesuai
    for (const item of [...currentList].reverse()) {
      const mangaId = item.manga_id;
      const title = item.title;
      const chapterId = item.latest_chapter_id;
      const chapterNum = item.latest_chapter_number;

      newState[mangaId] = {
        latest_chapter_id: chapterId,
        latest_chapter_number: chapterNum,
        title: title
      };

      if (!isFirstRun) {
        const oldItem = state[mangaId];
        if (!oldItem || oldItem.latest_chapter_id !== chapterId) {
          updates.push(item);
        }
      }
    }

    // Simpan state baru
    try {
      fs.writeFileSync(SHINIGAMI_STATE_FILE, JSON.stringify(newState, null, 2), 'utf-8');
    } catch (e) {
      console.error("[Shinigami Scraper] Gagal menyimpan berkas state:", e.message);
    }

    if (isFirstRun) {
      console.log("[Shinigami Scraper] Pengecekan pertama selesai. State awal diinisialisasi.");
      return;
    }

    // Kirim update ke grup WhatsApp
    if (updates.length > 0) {
      console.log(`[Shinigami Scraper] Menemukan ${updates.length} update baru. Mengirim ke grup ${MANHWA_GROUP_JID}...`);
      for (const item of updates) {
        const title = item.title;
        const mangaId = item.manga_id;
        const chapterId = item.latest_chapter_id;
        const chapterNum = item.latest_chapter_number;

        const msg =
          `📖 *${title}*\n` +
          `📌 Chapter: *${chapterNum}*\n\n` +
          `🔗 *Link Series:* ${webUrl}/series/${mangaId}\n` +
          `⚡ *Link Baca:* ${webUrl}/chapter/${chapterId}`;

        await sock.sendMessage(MANHWA_GROUP_JID, { text: msg });
        console.log(`[Shinigami Scraper] Update terkirim: ${title} Chapter ${chapterNum}`);
      }
    } else {
      console.log("[Shinigami Scraper] Tidak ada update manhwa baru.");
    }
  } catch (error) {
    console.error("[Shinigami Scraper] Error saat menjalankan scraper:", error.message);
  }
}


/**
 * Fungsi untuk memeriksa HEARTBEAT.md dan memproses tugas berkala jika terisi.
 */
async function checkHeartbeat(sock) {
  const filePath = path.join(process.cwd(), 'HEARTBEAT.md');
  if (!fs.existsSync(filePath)) return;

  try {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    // Bersihkan komentar HTML dan baris kosong
    const cleanedContent = rawContent
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*[\r\n]/gm, '')
      .trim();

    // Jika ada konten riil selain komentar, proses sebagai trigger prompt berkala ke LLM
    if (cleanedContent.length > 0 && !cleanedContent.startsWith('# Keep this file empty')) {
      console.log('[Heartbeat] Menemukan tugas aktif di HEARTBEAT.md. Menjalankan evaluasi berkala...');
      // Mengirim trigger evaluasi internal ke LLM menggunakan JID bot sendiri/owner
      const targetGroupJid = MANHWA_GROUP_JID; // Mengirim laporan/evaluasi ke grup target atau console log
      const prompt = `[SYSTEM HEARTBEAT TRIGGER]\nTugas yang harus diperiksa:\n${cleanedContent}\n\nLakukan analisis/pemeriksaan dan kirim respons ke chat jika ada hal penting yang memerlukan tindakan.`;

      const systemInstruction = getSystemInstruction();
      const messages = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ];

      if (!OPENROUTER_API_KEY) return;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
          'X-Title': 'Speaki WhatsApp Bot - Heartbeat'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: messages,
          tools: toolsSchema
        })
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply) {
        console.log('[Heartbeat Result]:', reply);
        // Kirim hasil evaluasi ke grup atau chat owner jika dinilai penting
        await sock.sendMessage(MANHWA_GROUP_JID, { text: `💓 *Speaki Heartbeat Report* 💓\n\n${reply}` });
      }
    }
  } catch (error) {
    console.error('[Heartbeat] Gagal memproses heartbeat:', error.message);
  }
}

// Menyimpan daftar jobs cron yang sedang berjalan
let activeCronJobs = [];

/**
 * Memuat dan menginisialisasi ulang seluruh cron jobs dari berkas schedules.json secara dinamis.
 */
function initCronSchedules(sock) {
  // Hentikan semua jobs yang ada terlebih dahulu agar tidak duplikat
  activeCronJobs.forEach(job => job.stop());
  activeCronJobs = [];

  const filePath = path.join(process.cwd(), 'schedules.json');
  if (!fs.existsSync(filePath)) {
    console.log('[Cron Scheduler] Berkas schedules.json tidak ditemukan. Melewati.');
    return;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const schedules = JSON.parse(raw);

    if (!Array.isArray(schedules)) {
      console.error('[Cron Scheduler] Format schedules.json harus berupa Array.');
      return;
    }

    schedules.forEach((item, index) => {
      if (!item.schedule || !item.prompt) {
        console.warn(`[Cron Scheduler] Melewati entri indeks ${index} karena kolom 'schedule' atau 'prompt' kosong.`);
        return;
      }

      if (!cron.validate(item.schedule)) {
        console.error(`[Cron Scheduler] Ekspresi cron tidak valid untuk "${item.description || item.prompt}": ${item.schedule}`);
        return;
      }

      const job = cron.schedule(item.schedule, async () => {
        console.log(`[Cron Triggered] Menjalankan tugas terjadwal: ${item.description || item.prompt}`);

        const systemInstruction = getSystemInstruction();
        const messages = [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `[CRON JOB TRIGGERED - ${item.description || 'Tugas Terjadwal'}]\nPrompt: ${item.prompt}` }
        ];

        if (!OPENROUTER_API_KEY) return;

        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
              'X-Title': 'Speaki WhatsApp Bot - Scheduled Cron'
            },
            body: JSON.stringify({
              model: MODEL_NAME,
              messages: messages,
              tools: toolsSchema
            })
          });

          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            console.log('[Cron Result]:', reply);
            await sock.sendMessage(MANHWA_GROUP_JID, { text: `⏰ *Scheduled Task Report* ⏰\n\n${reply}` });
          }
        } catch (err) {
          console.error(`[Cron Job Error] Gagal mengeksekusi LLM untuk tugas ${item.description || index}:`, err.message);
        }
      });

      activeCronJobs.push(job);
      console.log(`[Cron Scheduler] Berhasil menjadwalkan [${item.schedule}] -> ${item.description || item.prompt}`);
    });
  } catch (error) {
    console.error('[Cron Scheduler] Gagal memuat atau parsing schedules.json:', error.message);
  }
}

// Memori percakapan sementara untuk menyimpan riwayat obrolan (maksimal 10 pesan per JID)
// Struktur: { messages: [], lastAccessed: timestamp }
const chatHistories = new Map();

// Map untuk melacak status aktifasi Auto-OCR di setiap chat room (JID)
const ocrActiveRooms = new Map();

// Cache global untuk system instruction agar menghindari I/O disk berlebihan
let systemInstructionCache = null;
let systemInstructionCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache valid selama 5 menit

/**
 * Fungsi untuk mengambil instruksi sistem (system prompt) terstruktur dari berkas-berkas markdown lokal.
 * Menggabungkan CORE_IDENTITY.md dan TOOLS.md untuk menghemat token dan menghilangkan redundansi.
 */
function getSystemInstruction() {
  const now = Date.now();
  if (systemInstructionCache && (now - systemInstructionCacheTime < CACHE_TTL_MS)) {
    return systemInstructionCache;
  }

  const fileNames = ['CORE_IDENTITY.md', 'TOOLS.md'];
  let promptParts = [];

  for (const fileName of fileNames) {
    const filePath = path.join(process.cwd(), fileName);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        promptParts.push(`=== ${fileName} ===\n${content}\n`);
      } else {
        console.warn(`[System Prompt] Berkas ${fileName} tidak ditemukan di folder lokal.`);
      }
    } catch (error) {
      console.error(`Gagal membaca berkas ${fileName}:`, error.message);
    }
  }

  let finalInstruction = '';
  if (promptParts.length === 0) {
    finalInstruction = 'Kamu adalah Speaki, asisten AI yang profesional, efisien, dan ketus. Jawab langsung pada inti masalah tanpa basa-basi.';
  } else {
    finalInstruction = `Kamu adalah asisten AI dengan instruksi terstruktur berikut yang menentukan perilaku, gaya bicara, identitas, dan batasanmu:\n\n` +
      promptParts.join('\n');
  }

  // Update cache memori
  systemInstructionCache = finalInstruction;
  systemInstructionCacheTime = now;

  return finalInstruction;
}

/**
 * Fungsi untuk mengirim permintaan chat completion ke API OpenRouter.
 * @param {string} jid - WhatsApp ID pengguna untuk membedakan riwayat obrolan.
 */
/**
 * Truncate teks jika terlalu panjang agar tidak memakan token berlebihan.
 */
function truncateOutput(text, maxLength = 3000) {
  if (typeof text !== 'string') return text;
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '\n\n[Output dipotong karena terlalu panjang untuk efisiensi token]';
  }
  return text;
}

/**
 * Fungsi untuk mengirim permintaan chat completion ke API OpenRouter.
 * @param {string} jid - WhatsApp ID pengguna untuk membedakan riwayat obrolan.
 */
async function getOpenRouterResponse(jid, sock) {
  if (!OPENROUTER_API_KEY) {
    return 'Waduh! Kunci API OpenRouter belum diatur di file .env nya!';
  }

  const now = Date.now();
  let chatData = chatHistories.get(jid);
  if (!chatData) {
    chatData = { messages: [], lastAccessed: now };
    chatHistories.set(jid, chatData);
  } else {
    chatData.lastAccessed = now;
  }

  const history = chatData.messages;
  const systemInstruction = getSystemInstruction();

  // Susun array messages sementara (ephemeral) untuk siklus request saat ini
  let currentMessages = [
    { role: 'system', content: systemInstruction },
    ...history
  ];

  try {
    let maxIterations = 5; // Maksimal 5 iterasi tool call per turn

    while (maxIterations-- > 0) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
          'X-Title': 'Speaki WhatsApp Bot'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: currentMessages,
          tools: toolsSchema,
          max_tokens: 1500 // Batas aman output untuk mencegah runaway/looping generation
        })
      });

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      if (!message) {
        console.error('Respon OpenRouter kosong atau error:', data);
        return 'Eh? Speaki bingung... API OpenRouter ngasih jawaban kosong.';
      }

      // Jika LLM meminta pemanggilan tool (function calling)
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`[OpenRouter Tool Call] LLM meminta pemanggilan ${message.tool_calls.length} tool(s).`);

        // Masukkan assistant message (berisi tool_calls) ke currentMessages run ini
        currentMessages.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls
        });

        // Eksekusi setiap tool
        for (const toolCall of message.tool_calls) {
          const name = toolCall.function.name;
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            console.error(`Gagal parsing argumen untuk tool ${name}:`, e.message);
          }

          let toolOutput = await executeTool(name, args, sock, checkShinigamiUpdates);
          toolOutput = truncateOutput(toolOutput, 3000); // Potong output raksasa agar token input tetap hemat

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: name,
            content: toolOutput
          });
        }

        // Lanjutkan iterasi loop while untuk meminta balasan LLM atas hasil tool
        continue;
      } else {
        // Teks balasan akhir dari LLM
        const finalReply = message.content;
        if (finalReply) {
          // Simpan balasan akhir ke history permanen (hanya percakapan user-assistant bersih)
          history.push({ role: 'assistant', content: finalReply });
          // Pangkas riwayat jika lebih dari 10 pesan
          while (history.length > 10) history.shift();

          return finalReply;
        } else {
          return 'Ugh! Gagal mendapatkan respon percakapan.';
        }
      }
    }

    return 'Batas iterasi pemanggilan tool berantai terlampaui.';
  } catch (error) {
    console.error('Error saat menghubungi OpenRouter:', error);
    return 'Aduh! Gagal konek ke OpenRouter. Coba cek internet atau kuota API-nya!';
  }
}

/**
 * Fungsi utama untuk menjalankan bot WhatsApp menggunakan Baileys.
 */
async function startBot() {
  console.log('Memulai koneksi WhatsApp...');

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

  // Mengelola siklus hidup koneksi WebSocket WhatsApp
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Dukungan Pairing Code (8 digit) secara stabil saat WebSocket aktif
    if (qr && !sock.authState.creds.registered && !pairingCodeRequested) {
      pairingCodeRequested = true;
      const phoneNumber = (process.env.BOT_NUMBER || process.env.OWNER_NUMBER || '6283891270115').replace(/[^0-9]/g, '');
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
        startBot();
      } else {
        console.log('Sesi keluar. Silakan hapus folder "sesi_speaki" dan jalankan ulang untuk scan QR.');
      }
    } else if (connection === 'open') {
      console.log('==================================================');
      console.log('Speaki Bot telah sukses terhubung ke WhatsApp! 🎉');
      console.log('==================================================');

      // Inisialisasi Database SQLite3 lokal
      initDatabase().then(() => {
        console.log('[SQLite DB] Database dan tabel stiker berhasil diinisialisasi.');
      }).catch(err => {
        console.error('[SQLite DB] Gagal inisialisasi database:', err.message);
      });

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
    const msg = m.messages[0];
    // Hanya memproses pesan masuk dari orang lain (bukan dari bot itu sendiri)
    if (!msg.key.fromMe && m.type === 'notify') {
      const jid = msg.key.remoteJid;
      // Mengambil teks dari berbagai jenis tipe pesan WhatsApp (statis, media caption, extended text)
      const text = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '';

      const sticker = msg.message?.stickerMessage;
      const isGroup = jid.endsWith('@g.us');
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = senderJid.split('@')[0];
      const senderName = msg.pushName || senderNumber;
      const ownerNumber = process.env.OWNER_NUMBER;
      const isOwner = (senderNumber === ownerNumber) || (senderName === 'JO');

      /*
      // Deteksi jika Owner mengirim stiker untuk dijadikan bahan database (DINONAKTIFKAN SEMENTARA)
      if (sticker && isOwner) {
        console.log(`[Sticker Handler] Owner mengirim stiker. Mengunduh secara otomatis...`);
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
          // Simpan ke subfolder stiker_db agar rapi
          const fileName = `sticker_${Date.now()}.webp`;
          const savePath = path.join(process.cwd(), 'stiker_db', fileName);
          fs.writeFileSync(savePath, buffer);

          // Daftarkan ke database SQLite
          await registerSticker(fileName, 'general', senderName);

          console.log(`[Sticker Handler] Stiker berhasil disimpan di: ${savePath} dan didaftarkan ke SQLite.`);

        } catch (err) {
          console.error('[Sticker Handler] Gagal mengunduh stiker:', err.message);
          await sock.sendMessage(jid, { text: `Gagal memproses berkas stiker: ${err.message}` });
        }
      }
      */

      // Cari tahu JID bot sendiri dan nomornya (dideklarasikan di level teratas handler pesan masuk)
      const botJid = jidNormalizedUser(sock.user.id);
      const botNumber = botJid.split('@')[0];
      const lowercaseText = text ? text.toLowerCase() : '';

      if (text) {

        // Static Router: Cek jika pengguna meminta menu tools secara langsung
        const isCallingBot = lowercaseText.includes('speaki') || lowercaseText.includes('supikip');
        if (isCallingBot && lowercaseText.includes('menu')) {
          console.log(`[Static Route: Menu] Mengirim menu fitur ke ${jid}`);
          const menuText = `⚙️ *Speaki Agent System Menu* ⚙️\n\n` +
            `Daftar tools dan kapabilitas sistem aktif:\n\n` +
            `1. 📖 *Pengecekan Manhwa Shinigami*\n` +
            `   - *Interval:* Otomatis setiap 15 menit ke grup target.\n` +
            `   - *Manual:* Pemicu manual via pesan *"cek shinigami"* atau *"update shinigami"*.\n\n` +
            `2. 🔍 *Pencarian Web (DuckDuckGo)*\n` +
            `   - *Fungsi:* Otomatis mencari data terbaru di internet untuk melengkapi analisis.\n\n` +
            `3. 🖥️ *Status Server / PC*\n` +
            `   - *Akses:* Terbatas (Khusus Owner).\n` +
            `   - *Pemicu:* Gunakan kata kunci *"status sistem"* atau *"status pc"*.\n\n` +
            `Sistem dalam status siap.`;

          await sock.sendPresenceUpdate('composing', jid);
          await sock.sendMessage(jid, { text: menuText });
          await sock.sendPresenceUpdate('paused', jid);
          return;
        }

        // Static Router: Pengujian performa bot ("speaki dev test") khusus nomor owner
        if (lowercaseText === 'speaki dev test') {
          const ownerNumber = process.env.OWNER_NUMBER;
          const isOwner = (senderNumber === ownerNumber) || (senderName === 'JO');
          if (!isOwner) {
            console.warn(`[Security Alert] Akses pengujian performa ditolak untuk: ${senderName} (${senderNumber})`);
            await sock.sendMessage(jid, { text: 'Akses ditolak. Fitur ini terbatas untuk pengembang.' });
            return;
          }

          console.log(`[Static Route: Dev Test] Menjalankan uji performa lokal dipicu oleh Owner...`);
          await sock.sendPresenceUpdate('composing', jid);

          const performanceTool = toolsSchema.find(t => t.function.name === 'run_performance_test');
          if (performanceTool) {
            const { executeTool } = await import('./tools.js');
            const perfReport = await executeTool('run_performance_test', {}, sock);
            await sock.sendMessage(jid, { text: perfReport });
          } else {
            await sock.sendMessage(jid, { text: 'Gagal memicu pengujian: Modul uji performa tidak ditemukan.' });
          }
          await sock.sendPresenceUpdate('paused', jid);
          return;
        }

        // Static Router: Toggle Manual Mode Auto-OCR ON
        if (lowercaseText === 'ocr on' || lowercaseText === 'ocr_on') {
          ocrActiveRooms.set(jid, true);
          console.log(`[OCR System] Auto-OCR diaktifkan untuk obrolan: ${jid}`);
          await sock.sendMessage(jid, {
            text: '🤖 *Auto-OCR Mode: ON* 🤖\n\nKirim gambar apa saja di obrolan ini, Speaki akan mengekstrak teksnya secara otomatis.\nMatikan dengan mengetik *ocr off*.'
          });
          return;
        }

        // Static Router: Toggle Manual Mode Auto-OCR OFF
        if (lowercaseText === 'ocr off' || lowercaseText === 'ocr_off') {
          ocrActiveRooms.delete(jid);
          console.log(`[OCR System] Auto-OCR dinonaktifkan untuk obrolan: ${jid}`);
          await sock.sendMessage(jid, { text: '🤖 *Auto-OCR Mode: OFF* 🤖' });
          return;
        }
      }

      // Check apakah ada lampiran gambar pada pesan (baik imageMessage langsung atau di dalam viewOnceMessage)
      const imageMessage = msg.message?.imageMessage ||
        msg.message?.viewOnceMessage?.message?.imageMessage ||
        msg.message?.viewOnceMessageV2?.message?.imageMessage;

      if (imageMessage) {
        const hasOCRCaption = text && (text.toLowerCase() === 'ocr' || text.toLowerCase().startsWith('ocr '));
        const isAutoOCRActive = ocrActiveRooms.get(jid) === true;

        if (hasOCRCaption || isAutoOCRActive) {
          console.log(`[OCR System] Memulai ekstraksi OCR untuk gambar di JID: ${jid}. Mode: ${isAutoOCRActive ? 'AUTO' : 'MANUAL'}`);

          // Kirim status mengetik agar terasa responsif
          await sock.sendPresenceUpdate('composing', jid);

          try {
            // Unduh file gambar dari server WhatsApp ke buffer
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }) }
            );

            if (buffer) {
              const { performOCR } = await import('./skills/ocr_extractor/index.js');
              const ocrResult = await performOCR(buffer);

              // Kirim kembali hasil ekstraksi sebagai balasan (reply/quote) langsung ke gambar bersangkutan
              await sock.sendMessage(jid, {
                text: `📝 *HASIL OCR GAMBAR* 📝\n\n${ocrResult}`
              }, { quoted: msg });
            } else {
              await sock.sendMessage(jid, { text: 'Gagal memproses gambar: Buffer kosong.' }, { quoted: msg });
            }
          } catch (err) {
            console.error('[OCR System] Gagal melakukan ekstraksi:', err.message);
            await sock.sendMessage(jid, { text: `Gagal mengekstrak teks dari gambar: ${err.message}` }, { quoted: msg });
          }

          await sock.sendPresenceUpdate('paused', jid);
          // Menghentikan pemrosesan alur LLM chat completion agar menghemat token & meminimalkan noise
          return;
        }
      }

      if (text) {
        // Format isi pesan agar LLM tahu siapa yang berbicara (penting untuk obrolan grup)
        const formattedMessage = `[${senderName}]: ${text}`;

        // Simpan pesan ke riwayat obrolan JID ini terlebih dahulu untuk mempertahankan konteks
        if (!chatHistories.has(jid)) {
          chatHistories.set(jid, { messages: [], lastAccessed: Date.now() });
        }
        const chatData = chatHistories.get(jid);
        chatData.lastAccessed = Date.now();
        const history = chatData.messages;

        history.push({ role: 'user', content: formattedMessage });
        if (history.length > 10) {
          history.shift();
        }

        // Cek apakah pesan di grup atau jalur pribadi (DM)
        let shouldReply = false;
        if (!isGroup) {
          // Jika DM, selalu balas
          shouldReply = true;
          console.log(`[Pesan Pribadi dari ${senderName}]: ${text}`);
        } else {
          // Jika di grup, cek apakah bot dimention atau direply
          // Normalisasi perbandingan JID untuk reply/mention agar bebas dari device ID (conflict :1, :2 dll)
          const cleanBotJid = jidNormalizedUser(botJid);
          const cleanReplyParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
            ? jidNormalizedUser(msg.message.extendedTextMessage.contextInfo.participant)
            : null;

          const mentionedJids = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])
            .map(j => jidNormalizedUser(j));

          const isReplyToBot = cleanReplyParticipant === cleanBotJid || (cleanReplyParticipant && cleanReplyParticipant.startsWith('133526976512185'));
          const hasTextMention = text.includes(`@${botNumber}`) || text.includes(`@${botJid.split('@')[0]}`) || text.includes('@133526976512185');

          // Deteksi nama panggilan biasa (speaki / supikip) di dalam teks (case-insensitive)
          const hasNameMention = lowercaseText.includes('speaki') || lowercaseText.includes('supikip');

          const isMentioned = mentionedJids.includes(cleanBotJid) ||
            mentionedJids.some(j => j.split('@')[0] === botNumber || j.startsWith('133526976512185')) ||
            hasTextMention ||
            isReplyToBot ||
            hasNameMention;

          console.log(`[Pesan Grup dari ${senderName} di ${jid}] (Mentioned: ${isMentioned}): ${text}`);

          if (isMentioned) {
            shouldReply = true;
          }
        }

        // Jika memenuhi syarat untuk membalas, kirim ke OpenRouter
        if (shouldReply) {
          // Tampilkan indikator "sedang mengetik" di WhatsApp agar bot terasa lebih responsif
          await sock.sendPresenceUpdate('composing', jid);

          // Dapatkan balasan dari OpenRouter dengan dukungan pemanggilan tools
          const replyText = await getOpenRouterResponse(jid, sock);

          // Kirim balasan ke pengguna
          await sock.sendMessage(jid, { text: replyText });

          // Hentikan indikator sedang mengetik
          await sock.sendPresenceUpdate('paused', jid);
        }
      }
    }
  });
}

// Menangani error yang tidak tertangkap agar proses bot tidak langsung mati total
process.on('uncaughtException', (err) => {
  console.error('Terjadi Uncaught Exception:', err);
});

startBot();
