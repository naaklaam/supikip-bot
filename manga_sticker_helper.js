import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';
import { registerSticker } from './database_db.js';

const execAsync = promisify(exec);

const scraperHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Resolves active Shinigami domains dynamically
 */
export async function resolveDomains() {
  let webUrl = "https://g.shinigami.asia"; // fallback default

  for (const landingUrl of ["https://shinigami.bio/links.json", "https://shinigami.to/links.json"]) {
    try {
      const res = await fetch(landingUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const links = await res.json();
        for (const link of links) {
          if (link.title === "Link Website" || link.icon === "globe") {
            webUrl = link.href.replace(/\/$/, '');
            break;
          }
        }
        break;
      }
    } catch (e) {
      console.error(`[Manga Sticker Helper] Gagal mengambil landing page ${landingUrl}:`, e.message);
    }
  }

  let apiUrl = "https://api.shngm.io/v1/manga/list";
  try {
    const res = await fetch(webUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      const html = await res.text();
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

      if (nodeFiles.length === 0) {
        for (const p of new Set(jsPaths)) {
          if (p.includes('entry/app.')) {
            const appUrl = new URL(p, webUrl).href;
            const appRes = await fetch(appUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(1000) });
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

      for (const nodeUrl of new Set(nodeFiles)) {
        try {
          const nodeRes = await fetch(nodeUrl, { headers: scraperHeaders, signal: AbortSignal.timeout(1000) });
          if (nodeRes.ok) {
            const nodeJs = await nodeRes.text();
            const apiRegex = /https?:\/\/[a-zA-Z0-9_\-\.]+\/v1\/manga\/list/g;
            const apiMatch = nodeJs.match(apiRegex);
            if (apiMatch) {
              apiUrl = apiMatch[0];
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
    }
  } catch (e) {
    console.error("[Manga Sticker Helper] Gagal memindai situs untuk URL API:", e.message);
  }

  return { webUrl, apiUrl };
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

/**
 * Checks if a sticker is already registered in the DB
 */
export function isStickerRegistered(mangaId) {
  const DB_PATH = path.join(process.cwd(), 'speaki.db');
  return new Promise((resolve) => {
    const db = new sqlite3.Database(DB_PATH);
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
