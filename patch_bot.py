#!/usr/bin/env python3
import re

# Baca file bot-speaki.js
with open('/home/naaklaam/Supikip/bot-speaki.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Ganti fungsi getSystemInstruction dengan versi cache
old_get_sys = r'/\*\*\\n \* Fungsi untuk mengambil instruksi sistem[\s\S]*?return `Kamu adalah asisten AI[\s\S]*?siap dijalankan\.\`;\\n\}'
new_get_sys = '''/**
 * Memuat instruksi sistem dari file markdown ke cache (Dipanggil sekali saat startup).
 */
function loadSystemInstructionToCache() {
  const fileNames = CACHE_FILE_NAMES;
  let promptParts = [];

  for (const fileName of fileNames) {
    const filePath = path.join('/home/naaklaam/Supikip', fileName);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        promptParts.push(`=== ${fileName} ===\\n${content}\\n`);
        console.log(`[System Prompt] Berhasil memuat ${fileName} ke cache.`);
      } else {
        console.warn(`[System Prompt] Berkas ${fileName} tidak ditemukan di folder lokal.`);
      }
    } catch (error) {
      console.error(`Gagal membaca berkas ${fileName}:`, error.message);
    }
  }

  if (promptParts.length === 0) {
    CACHED_SYSTEM_INSTRUCTION = 'Kamu adalah Speaki, asisten AI yang profesional, efisien, dan ketus. Jawab langsung pada inti masalah tanpa basa-basi.';
  } else {
    CACHED_SYSTEM_INSTRUCTION = `Kamu adalah asisten AI dengan instruksi terstruktur berikut yang menentukan perilaku, gaya bicara, identitas, dan batasanmu:\\n\\n` +
      promptParts.join('\\n') +
      `\\nAturan Perilaku (WAJIB DIPATUHI):\\n1. EFISIENSI & LATENSI: Selalu berikan jawaban yang padat, akurat, dan langsung ke poin utama. Kurangi latensi kognitif dengan tidak menulis basa-basi atau perkenalan tidak perlu.\\n2. NADA DINGIN / KETUS: Jawab dengan nada profesional, lugas, dingin, dan ketus. Tidak perlu bersikap ramah, menggunakan emoji yang berlebihan, atau menggunakan kata penutup informal seperti "Cuayo!".\\n3. KUALITAS TEKNIS: Jika pengguna meminta kode pemrograman atau solusi teknis, pastikan solusinya optimal, bersih, dan siap dijalankan.`;
  }
  console.log('[System Prompt] Instruksi sistem berhasil dimuat ke cache.');
}

/**
 * Mengambil instruksi sistem dari cache (Efisien, tidak baca disk).
 */
function getSystemInstruction() {
  if (!CACHED_SYSTEM_INSTRUCTION) {
    loadSystemInstructionToCache();
  }
  return CACHED_SYSTEM_INSTRUCTION;
}'''

content = re.sub(old_get_sys, new_get_sys, content, flags=re.DOTALL)

# 2. Tambahin TTL 18 jam ke chatHistories
# Cari bagian: const chatHistories = new Map();
# Tambahin: const chatTTLMs = 18 * 60 * 60 * 1000;

old_map = '// Memori percakapan sementara untuk menyimpan riwayat obrolan (maksimal 10 pesan per JID)\\nconst chatHistories = new Map();'
new_map = '// Map untuk melacak waktu aktivitas terakhir tiap chat (TTL 18 jam)\\nconst chatTTLMs = 18 * 60 * 60 * 1000; // 18 jam dalam milidetik\\nconst chatHistories = new Map();'

content = content.replace(old_map, new_map)

# 3. Tambahin cleanup TTL di fungsi getOpenRouterResponse
# Cari: const history = chatHistories.get(jid) || [];
# Tambahin pengecekan TTL sebelum dipake

old_history = r'  const history = chatHistories\.get\(jid\) \|\| \[\];'
new_history = '''  // Bersihkan chatHistories yang sudah lewat 18 jam (TTL)
  const now = Date.now();
  for (const [hJid, hHistory] of chatHistories.entries()) {
    if (hHistory._lastActivity && (now - hHistory._lastActivity > chatTTLMs)) {
      chatHistories.delete(hJid);
      console.log(`[Memory Cleanup] Menghapus history untuk ${hJid} (TTL 18 jam habis).`);
    }
  }

  const history = chatHistories.get(jid) || [];'''

content = content.replace(old_history, new_history)

# 4. Update _lastActivity setiap kali history dipush
old_push = r'history\.push\(\{ role: \'user\', content: formattedMessage \}\);'
new_push = '''history.push({ role: 'user', content: formattedMessage });
  history._lastActivity = Date.now();'''

content = content.replace(old_push, new_push)

# 5. Tambahin fetch timeout di resolveDomains (helper function)
# Ini bakal ditambahin di awal fungsi resolveDomains
old_resolve = r'async function resolveDomains\(\) \{\\n  let webUrl = "https://g\.shinigami\.asia"; // fallback default'
new_resolve = '''async function resolveDomains() {
  let webUrl = "https://g.shinigami.asia"; // fallback default

  // Helper buat fetch dengan timeout cepat
  const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };'''

content = content.replace(old_resolve, new_resolve)

# 6. Ganti semua `fetch(` di resolveDomains dan fetchLatestManhwa dengan `fetchWithTimeout(`
# Ini agak tricky, tapi kita bisa pake regex buat nyari fetch( di dalam fungsi tersebut
# Untuk simplisitas, kita ganti manual di fetchLatestManhwa aja
old_fetch_api = r'  const res = await fetch\(fullUrl, \{ headers: scraperHeaders \}\);'
new_fetch_api = '''  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const res = await fetch(fullUrl, { headers: scraperHeaders, signal: controller.signal });
    clearTimeout(timeoutId);'''

content = content.replace(old_fetch_api, new_fetch_api)

# Tutup try-finally di fetchLatestManhwa
old_throw = r'  throw new Error\(`Gagal memanggil API Shinigami: HTTP \$\{res\.status\}`\);\\n\}'
new_throw = '''  } finally {
    clearTimeout(timeoutId);
  }
  throw new Error(`Gagal memanggil API Shinigami: HTTP ${res.status}`);
}'''

content = content.replace(old_throw, new_throw)

# 7. Panggil loadSystemInstructionToCache() sebelum startBot()
old_start = r'startBot\(\);'
new_start = '''// Muat System Instruction ke Cache saat aplikasi pertama kali jalan
loadSystemInstructionToCache();

startBot();'''

content = content.replace(old_start, new_start)

# Tulis balik file yang sudah di-patch
with open('/home/naaklaam/Supikip/bot-speaki.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching selesai! File bot-speaki.js telah diperbarui.")