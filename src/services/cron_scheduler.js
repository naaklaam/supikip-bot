import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { toolsSchema } from '../../tools.js';
import { getSystemInstruction } from '../handlers/llm.js';
import { atomicWriteJsonSync } from '../utils/atomic_file.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME;
const MANHWA_GROUP_JID = process.env.MANHWA_GROUP_JID || '';

// Menyimpan daftar jobs cron yang sedang berjalan dan referensi socket WA
let activeCronJobs = [];
let cachedSock = null;
let isFileWatcherActive = false;
let watchDebounceTimer = null;

/**
 * Mereload seluruh cron job secara live.
 * @param {object} [sock] - Socket Baileys WhatsApp opsional
 */
export function reloadCronSchedules(sock) {
  if (sock) cachedSock = sock;
  console.log('[Cron Scheduler] Reloading cron schedules live...');
  initCronSchedules(cachedSock);
}

/**
 * Menyiapkan file watcher pada schedules.json agar perubahan manual/tool langsung live-reloaded.
 */
function setupFileWatcher() {
  if (isFileWatcherActive) return;
  const filePath = path.join(process.cwd(), 'schedules.json');

  try {
    if (!fs.existsSync(filePath)) {
      atomicWriteJsonSync(filePath, []);
    }

    fs.watch(filePath, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
        watchDebounceTimer = setTimeout(() => {
          console.log('[Cron Scheduler] Perubahan pada schedules.json terdeteksi via file watcher.');
          reloadCronSchedules();
        }, 500);
      }
    });

    isFileWatcherActive = true;
    console.log('[Cron Scheduler] File watcher aktif pada schedules.json untuk live reload.');
  } catch (err) {
    console.error('[Cron Scheduler] Gagal menyiapkan file watcher untuk schedules.json:', err.message);
  }
}

/**
 * Memuat dan menginisialisasi ulang seluruh cron jobs dari berkas schedules.json secara dinamis.
 * @param {object} [sock] - Socket Baileys WhatsApp
 */
export function initCronSchedules(sock) {
  if (sock) cachedSock = sock;

  // Hentikan semua jobs yang ada terlebih dahulu agar tidak duplikat
  activeCronJobs.forEach(job => job.stop());
  activeCronJobs = [];

  const filePath = path.join(process.cwd(), 'schedules.json');
  if (!fs.existsSync(filePath)) {
    atomicWriteJsonSync(filePath, []);
  }

  // Pasang live file watcher
  setupFileWatcher();

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

        const socketToUse = cachedSock || sock;
        if (!OPENROUTER_API_KEY || !socketToUse) {
          console.warn('[Cron Triggered] OPENROUTER_API_KEY atau socket WA tidak tersedia.');
          return;
        }

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
            const targetJid = item.targetJid || MANHWA_GROUP_JID;
            if (targetJid) {
              await socketToUse.sendMessage(targetJid, { text: `⏰ *Scheduled Task Report* ⏰\n\n${reply}` });
            }
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
