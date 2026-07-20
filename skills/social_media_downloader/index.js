import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Mencari biner yt-dlp yang tersedia di sistem.
 */
function findYtDlpBinary() {
  const candidatePaths = [
    'yt-dlp',
    '/home/linuxbrew/.linuxbrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp'
  ];

  for (const binPath of candidatePaths) {
    if (binPath === 'yt-dlp') continue;
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  return 'yt-dlp';
}

/**
 * Mencari berkas cookies.txt yang tersedia untuk autentikasi (Instagram/Facebook/dll).
 */
function findCookiesFile() {
  const candidatePaths = [
    path.join(os.homedir(), 'Downloads', 'cookies.txt'),
    path.join(process.cwd(), 'cookies.txt'),
    path.join(process.cwd(), 'skills', 'social_media_downloader', 'cookies.txt')
  ];

  for (const cookiePath of candidatePaths) {
    if (fs.existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  return null;
}

/**
 * Mendeteksi platform media sosial dari URL.
 */
function detectPlatform(urlStr, overridePlatform) {
  if (overridePlatform && typeof overridePlatform === 'string' && overridePlatform.trim() !== '') {
    const clean = overridePlatform.trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('instagram.com') || host.includes('instagr.am')) return 'Instagram';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter';
    if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.gg')) return 'Facebook';
    if (host.includes('reddit.com') || host.includes('redd.it')) return 'Reddit';
    if (host.includes('pinterest.com') || host.includes('pin.it')) return 'Pinterest';
    if (host.includes('threads.net')) return 'Threads';
    if (host.includes('douyin.com')) return 'Douyin';
    if (host.includes('bilibili.com')) return 'Bilibili';

    const parts = host.replace(/^www\./, '').split('.');
    if (parts.length >= 2) {
      const mainDomain = parts[parts.length - 2];
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    }
  } catch (e) {
    // URL parsing error
  }

  return 'General';
}

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 * @param {object} args - Parameter tool dari LLM
 * @param {object} sock - Socket Baileys WhatsApp
 * @param {object} extraContext - Konteks pesan ({ jid, msg })
 */
export async function execute(args, sock, extraContext = {}) {
  const url = args.url;
  if (!url) {
    return 'Gagal: URL media tidak boleh kosong.';
  }

  const { jid, msg } = extraContext;
  const platform = detectPlatform(url, args.platform);
  const isAudio = args.media_type === 'audio';
  const ytDlpBin = findYtDlpBinary();

  // Folder tujuan: ~/Downloads/SocialMedia/[Platform]
  const baseDir = path.join(os.homedir(), 'Downloads', 'SocialMedia');
  const targetDir = path.join(baseDir, platform);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const commandArgs = [
      '--ignore-config',
      '--no-warnings',
      '--no-mtime',
      '-P', targetDir,
      '-o', '%(title).150s (%(id)s).%(ext)s'
    ];

    // Otomatis suntikkan cookies.txt jika ditemukan di ~/Downloads atau workspace
    const cookiesFile = findCookiesFile();
    if (cookiesFile) {
      commandArgs.push('--cookies', cookiesFile);
      console.log(`[Skill: social_media_downloader] Menggunakan cookies autentikasi dari: ${cookiesFile}`);
    }

    if (isAudio) {
      commandArgs.push('-x', '--audio-format', 'mp3');
    }

    commandArgs.push(url);

    console.log(`[Skill: social_media_downloader] Mengeksekusi: ${ytDlpBin} ${commandArgs.join(' ')}`);

    const { stdout } = await execFileAsync(ytDlpBin, commandArgs, {
      timeout: 180000 // Timeout 3 menit
    });

    // Cari lokasi berkas hasil unduhan
    const mergerMatch = stdout.match(/\[Merger\] Merging formats into "(.+)"/);
    const destinationMatch = stdout.match(/\[download\] Destination: (.+)/) || stdout.match(/\[ExtractAudio\] Destination: (.+)/);

    let downloadedFilePath = null;
    let downloadedFile = 'Media';

    if (mergerMatch) {
      downloadedFilePath = mergerMatch[1].trim();
      downloadedFile = path.basename(downloadedFilePath);
    } else if (destinationMatch) {
      downloadedFilePath = destinationMatch[1].trim();
      downloadedFile = path.basename(downloadedFilePath);
    }

    // Jika path parsial, gabungkan dengan targetDir
    if (downloadedFilePath && !path.isAbsolute(downloadedFilePath)) {
      downloadedFilePath = path.join(targetDir, downloadedFilePath);
    }

    // Kirim berkas media langsung ke chat WhatsApp (diquote ke pesan pengirim)
    let waSendStatus = '';
    if (sock && jid && downloadedFilePath && fs.existsSync(downloadedFilePath)) {
      const stats = fs.statSync(downloadedFilePath);
      const sizeMB = stats.size / (1024 * 1024);
      const sendOptions = msg ? { quoted: msg } : {};

      if (sizeMB > 100) {
        waSendStatus = `\n⚠️ *Ukuran file (${sizeMB.toFixed(1)}MB) melebihi batas 100MB WhatsApp.* File tetap tersimpan di server.`;
      } else {
        try {
          if (isAudio || downloadedFilePath.endsWith('.mp3') || downloadedFilePath.endsWith('.m4a')) {
            await sock.sendMessage(jid, {
              audio: { url: downloadedFilePath },
              mimetype: 'audio/mp4',
              ptt: false
            }, sendOptions);
          } else {
            // Coba kirim sebagai video
            try {
              await sock.sendMessage(jid, {
                video: { url: downloadedFilePath },
                caption: `🎥 *${downloadedFile}*\n🌐 *Platform:* ${platform}`
              }, sendOptions);
            } catch (vidErr) {
              console.warn(`[Skill: social_media_downloader] Fallback ke document: ${vidErr.message}`);
              await sock.sendMessage(jid, {
                document: { url: downloadedFilePath },
                mimetype: 'video/mp4',
                fileName: downloadedFile,
                caption: `🎥 *${downloadedFile}*\n🌐 *Platform:* ${platform}`
              }, sendOptions);
            }
          }
          waSendStatus = `\n📤 *Media berhasil terkirim ke obrolan (Quoted Reply).*`;
        } catch (sendErr) {
          console.error(`[Skill: social_media_downloader] Gagal kirim WA: ${sendErr.message}`);
          waSendStatus = `\n⚠️ *Gagal mengirim media ke WA:* ${sendErr.message}`;
        }
      }
    }

    return `✅ *BERHASIL MENGUNDUH MEDIA*\n\n` +
      `🌐 *Platform:* ${platform}\n` +
      `📁 *Lokasi Server:* ${targetDir}\n` +
      `📄 *File:* ${downloadedFile}\n` +
      `🔗 *URL:* ${url}` +
      (cookiesFile ? `\n🔑 *Cookies:* Active (${path.basename(cookiesFile)})` : '') +
      waSendStatus;

  } catch (error) {
    console.error(`[Skill: social_media_downloader] Error: ${error.message}`);
    return `❌ *GAGAL MENGUNDUH MEDIA*\n\n` +
      `🌐 *Platform:* ${platform}\n` +
      `⚠️ *Detail Error:* ${error.message}\n` +
      `🔗 *URL:* ${url}`;
  }
}
