import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { atomicWriteJsonSync } from '../utils/atomic_file.js';

const execAsync = promisify(exec);

const { registerSticker, getRandomStickerByTag } = await import('../db/index.js');

const SHINIGAMI_STATE_FILE = path.join(process.cwd(), 'last_manhwa.json');
const MANHWA_LIST_FILE = path.join(process.cwd(), 'list-manhwa.md');
const MANHWA_GROUP_JID = process.env.MANHWA_GROUP_JID || '';
export const MANHWA_CHECK_INTERVAL = parseInt(process.env.MANHWA_CHECK_INTERVAL, 10) || 900000; // 15 menit
export let resolvedShinigamiDomains = {
  landingUrl: 'https://shinigami.to/',
  webUrl: 'https://g.shinigami.asia',
  apiUrl: 'https://api.shngm.io/v1/manga/list'
};
const scraperHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Membaca daftar judul Manhwa yang dipantau dari list-manhwa.md
 */
export function getTrackedManhwaTitles() {
  if (!fs.existsSync(MANHWA_LIST_FILE)) return [];
  try {
    const content = fs.readFileSync(MANHWA_LIST_FILE, 'utf-8');
    return content
      .split('\n')
      .map(line => line.replace(/^[\s\-\*\d\.\#]+/, '').trim())
      .filter(line => line.length > 0);
  } catch (err) {
    console.error('[Shinigami Scraper] Gagal membaca list-manhwa.md:', err.message);
    return [];
  }
}

/**
 * Memeriksa apakah judul Manhwa cocok dengan salah satu judul di list-manhwa.md
 */
export function isTrackedManhwa(itemTitle, trackedTitles) {
  if (!trackedTitles || trackedTitles.length === 0) return true; // Izinkan semua jika file tidak ada
  const lowerItem = itemTitle.toLowerCase();
  return trackedTitles.some(t => {
    const lowerT = t.toLowerCase();
    return lowerItem.includes(lowerT) || lowerT.includes(lowerItem);
  });
}

/**
 * Fungsi untuk melacak domain aktif shinigami dan URL API sveltekit-nya secara dinamis.
 */
export async function resolveDomains() {
  let webUrl = "https://g.shinigami.asia"; // fallback default

  // 1. Ambil domain aktif dari landing page induk (shinigami.to)
  const landingUrls = [
    "https://shinigami.to/links.json",
    "https://shinigami.bio/links.json"
  ];

  let resolved = false;

  for (const landingUrl of landingUrls) {
    try {
      console.log(`[Shinigami Scraper] Mencoba mengambil domain aktif dari landing page: ${landingUrl}`);
      const res = await fetch(landingUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const links = await res.json();
        if (Array.isArray(links)) {
          for (const link of links) {
            if (link.title === "Link Website" || link.icon === "globe" || link.title?.toLowerCase().includes("website")) {
              webUrl = link.href.replace(/\/$/, '');
              console.log(`[Shinigami Scraper] Menemukan domain aktif dari landing page: ${webUrl}`);
              resolved = true;
              break;
            }
          }
        }
      }
      if (resolved) break;
    } catch (e) {
      console.error(`[Shinigami Scraper] Gagal mengambil landing page ${landingUrl}:`, e.message);
    }
  }

  // Fallback HTML parsing dari shinigami.to jika JSON gagal
  if (!resolved) {
    try {
      console.log("[Shinigami Scraper] Fallback: Membaca HTML induk shinigami.to secara langsung...");
      const res = await fetch("https://shinigami.to/", { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const html = await res.text();
        const hrefRegex = /href="(https?:\/\/[^"]+)"/g;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
          const href = match[1];
          if (href.includes("shinigami") && !href.includes("shinigami.to") && !href.includes("shinigami.bio") && !href.includes("shinigami.gg")) {
            webUrl = href.replace(/\/$/, '');
            console.log(`[Shinigami Scraper] Menemukan domain aktif via HTML fallback: ${webUrl}`);
            resolved = true;
            break;
          }
        }
      }
    } catch (err) {
      console.error("[Shinigami Scraper] Gagal fallback HTML parsing:", err.message);
    }
  }

  // 2. Ambil HTML utama untuk mencari endpoint API SvelteKit secara dinamis
  let apiUrl = "https://api.shngm.io/v1/manga/list"; // fallback default
  try {
    const res = await fetch(webUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
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
            const appRes = await fetch(appUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
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
          const nodeRes = await fetch(nodeUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
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

  resolvedShinigamiDomains.webUrl = webUrl;
  resolvedShinigamiDomains.apiUrl = apiUrl;
  return { webUrl, apiUrl };
}

/**
 * Fungsi untuk mengambil daftar manhwa terbaru dari API
 */
export async function fetchLatestManhwa(apiUrl) {
  const params = new URLSearchParams({
    page: '1',
    page_size: '20',
    sort: 'latest',
    sort_order: 'desc',
    format: 'manhwa'
  });
  const fullUrl = `${apiUrl}?${params.toString()}`;
  const res = await fetch(fullUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(5000) });
  if (res.ok) {
    const data = await res.json();
    return data.data || [];
  }
  throw new Error(`Gagal memanggil API Shinigami: HTTP ${res.status}`);
}

/**
 * Downloads a cover image, converts it to a 512x512 WebP sticker, and registers it in the DB.
 */
export async function downloadAndRegisterMangaSticker(mangaId, coverUrl, title) {
  if (!coverUrl) {
    console.log(`[Manga Sticker Helper] Cover URL kosong untuk manga: ${title}`);
    return false;
  }

  const tempFile = path.join(process.cwd(), `temp_${mangaId}`);
  const stikerDbDir = path.join(process.cwd(), 'stiker_db');
  const finalFilename = `manga_${mangaId}.webp`;
  const finalPath = path.join(stikerDbDir, finalFilename);

  // Ensure stiker_db directory exists
  if (!fs.existsSync(stikerDbDir)) {
    fs.mkdirSync(stikerDbDir, { recursive: true });
  }

  try {
    // Download cover image
    const response = await fetch(coverUrl, { headers: scraperHeaders });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh cover: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempFile, Buffer.from(arrayBuffer));

    // Convert using ImageMagick
    // WhatsApp stickers must be square 512x512 WebP
    const cmd = `convert "${tempFile}" -resize 512x512 -background none -gravity center -extent 512x512 "${finalPath}"`;
    await execFileAsync(cmd);

    // Register sticker in DB with tag 'manga_' + mangaId
    await registerSticker(finalFilename, `manga_${mangaId}`, 'system');

    console.log(`[Manga Sticker Helper] Berhasil membuat stiker manga "${title}" -> ${finalFilename}`);
    return true;
  } catch (error) {
    console.error(`[Manga Sticker Helper] Gagal memproses stiker untuk "${title}":`, error.message);
    return false;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {}
  }
}

/**
 * Checks if a sticker is already registered in the DB
 */
export async function isStickerRegistered(mangaId) {
  const DB_PATH = path.join(process.cwd(), 'speaki.db');
  const { Database } = await import('sqlite3');
  return new Promise((resolve) => {
    const db = new Database(DB_PATH);
    db.get(
      `SELECT id FROM stickers WHERE tag = ? LIMIT 1`,
      [`manga_${mangaId}`],
      (err, row) => {
        db.close();
        if (err || !row) resolve(false);
        else resolve(true);
      }
    );
  });
}

/**
 * Fungsi utama pemeriksaan update manhwa dan pengiriman ke grup WhatsApp
 */
export async function checkShinigamiUpdates(sock) {
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

    // Simpan state baru secara atomik
    try {
      atomicWriteJsonSync(SHINIGAMI_STATE_FILE, newState);
    } catch (e) {
      console.error("[Shinigami Scraper] Gagal menyimpan berkas state:", e.message);
    }

    if (isFirstRun) {
      console.log("[Shinigami Scraper] Pengecekan pertama selesai. State awal diinisialisasi.");
      return;
    }

    // Kirim update ke grup WhatsApp (HANYA jika judul ada di list-manhwa.md)
    if (updates.length > 0) {
      const trackedTitles = getTrackedManhwaTitles();
      console.log(`[Shinigami Scraper] Menemukan ${updates.length} update baru. Memfilter berdasarkan list-manhwa.md (${trackedTitles.length} judul dipantau)...`);

      for (const item of updates) {
        const title = item.title;
        const mangaId = item.manga_id;
        const chapterId = item.latest_chapter_id;
        const chapterNum = item.latest_chapter_number;

        if (!isTrackedManhwa(title, trackedTitles)) {
          console.log(`[Shinigami Scraper] Melewati "${title}" (tidak ada di list-manhwa.md)`);
          continue;
        }

        if (!MANHWA_GROUP_JID) {
          console.log(`[Shinigami Scraper] MANHWA_GROUP_JID belum diatur di .env, melempar pesan WA.`);
          continue;
        }

        // Ambil atau unduh stiker cover manga
        let stickerRow = await getRandomStickerByTag(`manga_${mangaId}`);
        if (!stickerRow) {
          const coverUrl = item.cover_portrait_url || item.cover_image_url;
          if (coverUrl) {
            console.log(`[Shinigami Scraper] Stiker belum ada. Mengunduh cover untuk "${title}"...`);
            await downloadAndRegisterMangaSticker(mangaId, coverUrl, title);
            stickerRow = await getRandomStickerByTag(`manga_${mangaId}`);
          }
        }

        if (stickerRow) {
          const stickerPath = path.join(process.cwd(), 'stiker_db', stickerRow.filename);
          if (fs.existsSync(stickerPath)) {
            try {
              await sock.sendMessage(MANHWA_GROUP_JID, { sticker: fs.readFileSync(stickerPath) });
              console.log(`[Shinigami Scraper] Stiker cover terkirim ke WA untuk: ${title}`);
            } catch (stickerErr) {
              console.error(`[Shinigami Scraper] Gagal mengirim stiker cover untuk "${title}":`, stickerErr.message);
            }
          }
        }

        const msg =
          `📖 *${title}*\n` +
          `📌 Chapter: *${chapterNum}*\n\n` +
          `🔗 *Link Series:* ${webUrl}/series/${mangaId}\n` +
          `⚡ *Link Baca:* ${webUrl}/chapter/${chapterId}`;

        await sock.sendMessage(MANHWA_GROUP_JID, { text: msg });
        console.log(`[Shinigami Scraper] Update terkirim ke WA: ${title} Chapter ${chapterNum}`);
      }
    } else {
      console.log("[Shinigami Scraper] Tidak ada update manhwa baru.");
    }
  } catch (error) {
    console.error("[Shinigami Scraper] Error saat menjalankan scraper:", error.message);
  }
}
