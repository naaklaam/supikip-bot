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
 * Mencari biner gallery-dl yang tersedia di sistem.
 */
function findGalleryDlBinary() {
  const candidatePaths = [
    '/usr/bin/gallery-dl',
    '/usr/local/bin/gallery-dl',
    '/home/linuxbrew/.linuxbrew/bin/gallery-dl',
    path.join(process.cwd(), 'gallery-dl.bin'),
    path.join(process.cwd(), 'gallery-dl')
  ];

  for (const binPath of candidatePaths) {
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  return 'gallery-dl';
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
 * Membaca isi folder secara rekursif untuk mencari berkas.
 */
function getFilesRecursively(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFilesRecursively(name, filesList);
    } else {
      filesList.push(name);
    }
  }
  return filesList;
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
  const isVideoOnly = args.media_type === 'video';
  const isImageOnly = args.media_type === 'image';
  const isAll = args.media_type === 'all' || !args.media_type;

  // Folder tujuan utama: ~/Downloads/SocialMedia/[Platform]
  const baseDir = path.join(os.homedir(), 'Downloads', 'SocialMedia');
  const targetDir = path.join(baseDir, platform);

  // Folder sementara terisolasi untuk mendeteksi berkas baru yang diunduh
  const runDir = path.join(targetDir, `tmp_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  const cookiesFile = findCookiesFile();

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Penentuan tool downloader yang akan dijalankan
    let runYtDlp = false;
    let runGalleryDl = false;

    if (isAudio || isVideoOnly) {
      runYtDlp = true;
    } else if (isImageOnly) {
      runGalleryDl = true;
    } else {
      // Tipe 'all' / default (otomatis mendeteksi platform)
      if (platform === 'YouTube' || platform === 'TikTok' || platform === 'Facebook' || platform === 'Bilibili') {
        runYtDlp = true;
      } else if (platform === 'Pinterest') {
        runGalleryDl = true;
      } else {
        // Platform umum / multi-konten (Instagram, Twitter, Reddit, Threads, General)
        runYtDlp = true;
        runGalleryDl = true;
      }
    }

    // Helper eksekusi yt-dlp
    const executeYtDlp = async () => {
      const ytDlpBin = findYtDlpBinary();
      const commandArgs = [
        '--ignore-config',
        '--no-warnings',
        '--no-mtime',
        '-P', runDir,
        '-o', '%(title).150s (%(id)s).%(ext)s'
      ];
      if (cookiesFile) {
        commandArgs.push('--cookies', cookiesFile);
      }
      if (isAudio) {
        commandArgs.push('-x', '--audio-format', 'mp3');
      }
      commandArgs.push(url);

      console.log(`[Skill: social_media_downloader] Menjalankan yt-dlp: ${ytDlpBin} ${commandArgs.join(' ')}`);
      try {
        await execFileAsync(ytDlpBin, commandArgs, { timeout: 180000 });
        return true;
      } catch (err) {
        console.warn(`[Skill: social_media_downloader] yt-dlp gagal: ${err.message}`);
        return false;
      }
    };

    // Helper eksekusi gallery-dl
    const executeGalleryDl = async () => {
      const galleryDlBin = findGalleryDlBinary();
      const commandArgs = [
        '--config-ignore',
        '-D', runDir
      ];
      if (cookiesFile) {
        commandArgs.push('-C', cookiesFile);
      }
      commandArgs.push(url);

      console.log(`[Skill: social_media_downloader] Menjalankan gallery-dl: ${galleryDlBin} ${commandArgs.join(' ')}`);
      try {
        await execFileAsync(galleryDlBin, commandArgs, { timeout: 180000 });
        return true;
      } catch (err) {
        console.warn(`[Skill: social_media_downloader] gallery-dl gagal: ${err.message}`);
        return false;
      }
    };

    // Jalankan eksekusi berdasarkan routing
    if (runGalleryDl && !runYtDlp && isAll) {
      // Jalankan gallery-dl dahulu
      await executeGalleryDl();
      // Jika kosong (kemungkinan link berisi video untuk platform yang sama seperti Pinterest)
      const currentFiles = getFilesRecursively(runDir);
      if (currentFiles.length === 0) {
        console.log(`[Skill: social_media_downloader] gallery-dl tidak menghasilkan file, mencoba fallback ke yt-dlp...`);
        await executeYtDlp();
      }
    } else {
      // Jalankan paralel atau salah satu sesuai set
      const downloadTasks = [];
      if (runYtDlp) downloadTasks.push(executeYtDlp());
      if (runGalleryDl) downloadTasks.push(executeGalleryDl());
      await Promise.allSettled(downloadTasks);
    }

    // Pindai folder sementara untuk memproses berkas terunduh
    const downloadedFiles = getFilesRecursively(runDir);
    if (downloadedFiles.length === 0) {
      throw new Error('Tidak ada media yang berhasil diunduh oleh yt-dlp maupun gallery-dl.');
    }

    const sendOptions = msg ? { quoted: msg } : {};
    const successSent = [];
    const failedOrSkipped = [];
    let sentCount = 0;

    for (const filePath of downloadedFiles) {
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();

      // Batasi maksimal 15 file ke WhatsApp
      if (sentCount >= 15) {
        failedOrSkipped.push(`${fileName} (dilewati karena limit 15 file)`);
        continue;
      }

      const stats = fs.statSync(filePath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB > 100) {
        failedOrSkipped.push(`${fileName} (karena ukuran ${sizeMB.toFixed(1)}MB > 100MB)`);
        continue;
      }

      try {
        if (ext === '.mp3' || ext === '.m4a' || ext === '.wav' || ext === '.ogg') {
          await sock.sendMessage(jid, {
            audio: { url: filePath },
            mimetype: 'audio/mp4',
            ptt: false
          }, sendOptions);
        } else if (ext === '.mp4' || ext === '.mkv' || ext === '.webm' || ext === '.avi' || ext === '.mov') {
          try {
            await sock.sendMessage(jid, {
              video: { url: filePath },
              caption: `🎥 *${fileName}*\n🌐 *Platform:* ${platform}`
            }, sendOptions);
          } catch (vidErr) {
            console.warn(`[Skill: social_media_downloader] Fallback ke berkas document untuk video: ${vidErr.message}`);
            await sock.sendMessage(jid, {
              document: { url: filePath },
              mimetype: 'video/mp4',
              fileName: fileName,
              caption: `🎥 *${fileName}*\n🌐 *Platform:* ${platform}`
            }, sendOptions);
          }
        } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.gif') {
          await sock.sendMessage(jid, {
            image: { url: filePath },
            caption: `📸 *${fileName}*\n🌐 *Platform:* ${platform}`
          }, sendOptions);
        } else {
          // Jenis file lainnya kirim sebagai document biasa
          await sock.sendMessage(jid, {
            document: { url: filePath },
            fileName: fileName,
            caption: `📄 *${fileName}*\n🌐 *Platform:* ${platform}`
          }, sendOptions);
        }

        successSent.push(fileName);
        sentCount++;
      } catch (sendErr) {
        console.error(`[Skill: social_media_downloader] Gagal kirim WA (${fileName}):`, sendErr.message);
        failedOrSkipped.push(`${fileName} (eror kirim: ${sendErr.message})`);
      }
    }

    // Pindahkan semua berkas hasil unduhan ke direktori utama (SocialMedia/[Platform])
    for (const filePath of downloadedFiles) {
      try {
        const destPath = path.join(targetDir, path.basename(filePath));
        let finalDest = destPath;
        let counter = 1;
        // Penanganan tabrakan nama file
        while (fs.existsSync(finalDest)) {
          const fileExt = path.extname(filePath);
          const baseName = path.basename(filePath, fileExt);
          finalDest = path.join(targetDir, `${baseName}_${counter}${fileExt}`);
          counter++;
        }
        fs.renameSync(filePath, finalDest);
      } catch (moveErr) {
        console.error(`[Skill: social_media_downloader] Gagal memindahkan ${filePath}:`, moveErr.message);
      }
    }

    // Hapus folder sementara
    try {
      fs.rmSync(runDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.error(`[Skill: social_media_downloader] Gagal membersihkan folder tmp:`, rmErr.message);
    }

    // Susun status hasil pengiriman WA
    let waSendStatus = '';
    if (successSent.length > 0) {
      waSendStatus += `\n📤 *Terkirim ke WhatsApp:* ${successSent.length} file.`;
    }
    if (failedOrSkipped.length > 0) {
      waSendStatus += `\n⚠️ *Tidak terkirim/Dilewati:* \n- ${failedOrSkipped.join('\n- ')}`;
    }

    return `✅ *BERHASIL MENGUNDUH MEDIA*\n\n` +
      `🌐 *Platform:* ${platform}\n` +
      `📁 *Lokasi Server:* ${targetDir}\n` +
      `📄 *Total File Terunduh:* ${downloadedFiles.length} file\n` +
      `🔗 *URL:* ${url}` +
      (cookiesFile ? `\n🔑 *Cookies:* Active (${path.basename(cookiesFile)})` : '') +
      waSendStatus;

  } catch (error) {
    // Pastikan folder sementara dibersihkan jika terjadi eror
    try {
      if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true });
      }
    } catch (rmErr) {
      // ignore
    }

    console.error(`[Skill: social_media_downloader] Error: ${error.message}`);
    return `❌ *GAGAL MENGUNDUH MEDIA*\n\n` +
      `🌐 *Platform:* ${platform}\n` +
      `⚠️ *Detail Error:* ${error.message}\n` +
      `🔗 *URL:* ${url}`;
  }
}
