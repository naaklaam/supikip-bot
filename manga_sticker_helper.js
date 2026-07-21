import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';
import { registerSticker } from './database_db.js';
import {
  fetchLatestManhwa,
  isStickerRegistered as isStickerRegisteredCore,
  resolveDomains
} from './src/services/shinigami_scraper.js';

const execAsync = promisify(exec);

/**
 * Downloads a cover image, converts it to a 512x512 WebP sticker, and registers it in the DB.
 */
export async function downloadAndRegisterMangaSticker(mangaId, coverUrl, title) {
  return downloadAndRegisterMangaStickerCore(mangaId, coverUrl, title);
}

async function downloadAndRegisterMangaStickerCore(mangaId, coverUrl, title) {
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
    const response = await fetch(coverUrl, { headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    } });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh cover: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempFile, Buffer.from(arrayBuffer));

    // Convert using ImageMagick
    // WhatsApp stickers must be square 512x512 WebP
    const cmd = `convert "${tempFile}" -resize 512x512 -background none -gravity center -extent 512x512 "${finalPath}"`;
    await execAsync(cmd);

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

export async function isStickerRegistered(mangaId) {
  return isStickerRegisteredCore(mangaId);
}

export {
  fetchLatestManhwa,
  resolveDomains
};
