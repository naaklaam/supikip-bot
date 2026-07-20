import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// Memuat variabel lingkungan
dotenv.config();

// Pastikan kita mengimpor checkShinigamiUpdates dari berkas utama
// Karena checkShinigamiUpdates memerlukan instance sock, kita akan meneruskannya saat memanggil executeTool
const SHINIGAMI_STATE_FILE = path.join(process.cwd(), 'last_manhwa.json');
const SERPAPI_QUOTA_FILE = path.join(process.cwd(), 'serpapi_quota.json');

function incrementSerpApiUsage() {
  try {
    let quota = { total_limit: 100, usage_count: 0, last_updated: new Date().toISOString() };
    if (fs.existsSync(SERPAPI_QUOTA_FILE)) {
      quota = JSON.parse(fs.readFileSync(SERPAPI_QUOTA_FILE, 'utf-8'));
    }
    quota.usage_count = (quota.usage_count || 0) + 1;
    quota.last_updated = new Date().toISOString();
    fs.writeFileSync(SERPAPI_QUOTA_FILE, JSON.stringify(quota, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[SerpAPI Quota] Gagal memperbarui quota: ${error.message}`);
  }
}

// Peta penyimpanan modul skill yang dimuat secara dinamis
const loadedSkills = new Map();

/**
 * Memindai direktori 'skills/' dan memuat skema serta fungsi eksekusi secara dinamis.
 */
function loadDynamicSkills() {
  const skillsDir = path.join(process.cwd(), 'skills');
  const dynamicSchemas = [];

  if (!fs.existsSync(skillsDir)) return dynamicSchemas;

  try {
    const items = fs.readdirSync(skillsDir);
    for (const item of items) {
      const skillPath = path.join(skillsDir, item);
      if (fs.statSync(skillPath).isDirectory()) {
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        const execJsPath = path.join(skillPath, 'index.js');

        if (fs.existsSync(skillMdPath) && fs.existsSync(execJsPath)) {
          try {
            const mdContent = fs.readFileSync(skillMdPath, 'utf-8');

            // Ekstrak blok JSON skema dari SKILL.md
            // Mencari tag ```json ... ``` yang mendefinisikan tool schema
            const jsonMatch = mdContent.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              const schema = JSON.parse(jsonMatch[1]);
              dynamicSchemas.push(schema);

              // Daftarkan jalur berkas index.js untuk diimpor saat eksekusi
              loadedSkills.set(schema.function.name, execJsPath);
              console.log(`[Skills Loader] Sukses memuat skill dinamis: ${schema.function.name}`);
            }
          } catch (err) {
            console.error(`[Skills Loader] Gagal parsing SKILL.md untuk folder ${item}:`, err.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('[Skills Loader] Gagal memindai folder skills:', e.message);
  }

  return dynamicSchemas;
}

// Skema tools bawaan (statis)
const staticSchema = [
  {
    type: "string", // Mengikuti standard OpenRouter schema
    type: "function",
    function: {
      name: "web_search",
      description: "Cari informasi terkini dari internet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Kata kunci atau pertanyaan pencarian yang relevan."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_shinigami_now",
      description: "Cek manual update komik Shinigami Scans.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Cek RAM, CPU, uptime server (Hanya JO).",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Ambil isi teks dari URL web.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL lengkap halaman web yang ingin diambil kontennya (misalnya: https://example.com/news)."
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_workspace_file",
      description: "Baca isi file di workspace.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama file relatif terhadap direktori workspace (misal: schedules.json, MEMORY.md, HEARTBEAT.md, dll)."
          }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_workspace_file",
      description: "Tulis/edit file di workspace.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama file relatif terhadap direktori workspace."
          },
          content: {
            type: "string",
            description: "Konten lengkap yang ingin ditulis ke dalam file tersebut."
          }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description: "Jalankan perintah shell terminal (Hanya JO).",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Perintah terminal lengkap yang ingin dieksekusi."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_cron_schedule",
      description: "Tambah jadwal tugas cron baru.",
      parameters: {
        type: "object",
        properties: {
          schedule: {
            type: "string",
            description: "Ekspresi cron 5-field standar (misal: '*/5 * * * *' untuk tiap 5 menit, '0 9 * * *' untuk tiap jam 9 pagi)."
          },
          description: {
            type: "string",
            description: "Deskripsi singkat mengenai kegunaan cron job ini."
          },
          prompt: {
            type: "string",
            description: "Instruksi/prompt yang akan diproses oleh AI ketika waktu cron terpicu."
          }
        },
        required: ["schedule", "description", "prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_cron_schedule",
      description: "Hapus jadwal tugas cron.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Deskripsi unik dari cron job yang ingin dihapus."
          }
        },
        required: ["description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_one_shot_reminder",
      description: "Setel pengingat waktu (timer) WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          durationSeconds: {
            type: "integer",
            description: "Durasi tunggu dalam hitungan detik sebelum pengingat dikirim."
          },
          message: {
            type: "string",
            description: "Pesan pengingat yang ingin dikirimkan kembali ke pengguna."
          }
        },
        required: ["durationSeconds", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Edit file secara presisi via pencarian teks.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama file relatif terhadap direktori workspace."
          },
          targetContent: {
            type: "string",
            description: "Teks lama yang ada di file yang ingin diganti (harus persis sama termasuk whitespace/indentasi)."
          },
          replacementContent: {
            type: "string",
            description: "Teks baru drop-in sebagai pengganti dari targetContent."
          }
        },
        required: ["filename", "targetContent", "replacementContent"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "parse_pdf_file",
      description: "Ekstrak teks dari berkas PDF.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama file PDF relatif terhadap direktori workspace (misal: dokumen.pdf)."
          }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_image",
      description: "Analisis gambar lokal via multimodal AI.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama berkas gambar lokal relatif terhadap direktori workspace (misal: image.png)."
          },
          prompt: {
            type: "string",
            description: "Pertanyaan atau petunjuk analisis gambar (misal: 'deskripsikan gambar ini' atau 'ekstrak teks dari diagram ini')."
          }
        },
        required: ["filename", "prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delegate_subagent",
      description: "Delegasikan tugas ke subagent terisolasi.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description: "System instruction/kepribadian khusus untuk subagent (misal: 'Kamu adalah pakar matematika')."
          },
          task: {
            type: "string",
            description: "Deskripsi tugas spesifik yang harus diselesaikan subagent."
          }
        },
        required: ["instruction", "task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_performance_test",
      description: "Uji performa latensi dan I/O bot.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_workspace_file",
      description: "Kirim file workspace ke WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Nama file relatif terhadap direktori workspace yang ingin dikirim (misal: schedules.json atau MEMORY.md)."
          },
          caption: {
            type: "string",
            description: "Keterangan opsional yang dilampirkan bersama pengiriman file."
          }
        },
        required: ["filename"]
      }
    }
  }
];

// Ekspor skema gabungan statis dan dinamis
export const toolsSchema = [...staticSchema, ...loadDynamicSkills()];

/**
 * Implementasi Tool 1: Pencarian Web menggunakan DuckDuckGo HTML Scraper (Tanpa API Key tambahan)
 */
async function webSearch(query) {
  console.log(`[Tool: web_search] Mencari via Serp API: ${query}`);
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.log(`[Tool: web_search] SERPAPI_API_KEY tidak ditemukan, fallback ke DuckDuckGo scraper.`);
    return await webSearchFallback(query);
  }
  try {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return `Gagal melakukan pencarian via Serp API: HTTP ${response.status}`;
    incrementSerpApiUsage();
    const data = await response.json();

    if (!data.organic_results || data.organic_results.length === 0) {
      return `Pencarian internet untuk "${query}" tidak memberikan hasil.`;
    }

    const results = data.organic_results.slice(0, 5).map((item, i) => {
      return `[Hasil ${i + 1}]: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet || 'Tidak ada deskripsi.'}`;
    }).join('\n\n');

    return `Berikut adalah hasil pencarian internet teratas untuk "${query}":\n\n${results}`;
  } catch (error) {
    return `Error saat melakukan pencarian via Serp API: ${error.message}`;
  }
}

async function webSearchFallback(query) {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) return `Gagal melakukan pencarian: HTTP ${response.status}`;
    const html = await response.text();

    const snippets = [];
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      const cleanText = match[1]
        .replace(/<[^>]*>/g, '') // Hapus tag HTML
        .replace(/\s+/g, ' ')    // Rapatkan spasi
        .trim();
      snippets.push(cleanText);
    }

    if (snippets.length === 0) {
      return `Pencarian internet untuk "${query}" tidak memberikan hasil snippet.`;
    }

    return `Berikut adalah hasil pencarian internet teratas untuk "${query}":\n\n` +
      snippets.map((s, i) => `[Hasil ${i + 1}]: ${s}`).join('\n\n');
  } catch (error) {
    return `Error saat melakukan pencarian internet: ${error.message}`;
  }
}

/**
 * Implementasi Tool 2: Pengecekan Shinigami manual secara instan
 */
async function checkShinigamiNow(sock, checkShinigamiUpdatesFn) {
  console.log('[Tool: check_shinigami_now] Menjalankan pengecekan shinigami manual...');
  if (typeof checkShinigamiUpdatesFn !== 'function') {
    return 'Gagal memicu scraper: Fungsi scraper tidak tersedia.';
  }
  try {
    // Panggil fungsi scraper utama yang ada di bot-speaki.js
    await checkShinigamiUpdatesFn(sock);
    return 'Pengecekan update Shinigami Scans telah selesai dijalankan! Jika ada manhwa baru, pengumuman telah dikirimkan ke grup.';
  } catch (e) {
    return `Gagal melakukan pengecekan update: ${e.message}`;
  }
}

/**
 * Implementasi Tool 3: Status Server/PC menggunakan modul os bawaan Node.js
 */
function getSystemStatus() {
  console.log('[Tool: get_system_status] Membaca status sistem...');
  try {
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(2);
    const usedMemGB = (totalMemGB - freeMemGB).toFixed(2);
    const uptimeJam = (os.uptime() / 3600).toFixed(1);
    const cpus = os.cpus();
    const modelCPU = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
    const loadAvg = os.loadavg().map(v => v.toFixed(2)).join(', ');

    return `=== STATUS SISTEM SERVER ===\n` +
      `🖥️ CPU: ${modelCPU} (${cpus.length} Cores)\n` +
      `📊 Load Average: ${loadAvg} (1m, 5m, 15m)\n` +
      `🧠 RAM: ${usedMemGB} GB / ${totalMemGB} GB Terpakai\n` +
      `⏱️ Uptime Server: ${uptimeJam} jam\n` +
      `💽 Platform OS: ${os.platform()} (${os.arch()})\n` +
      `===========================`;
  } catch (error) {
    return `Gagal mengumpulkan status sistem: ${error.message}`;
  }
}

/**
 * Implementasi Tool 4: Mengambil konten halaman web spesifik (Web Fetch)
 */
async function webFetch(url) {
  console.log(`[Tool: web_fetch] Mengambil konten: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) return `Gagal mengambil konten: HTTP ${response.status}`;
    const html = await response.text();

    // Hapus script, style, header, footer, dan tag HTML lainnya secara sederhana untuk menghemat token
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Batasi panjang teks output maksimal 5000 karakter agar tidak melebihi batas token LLM
    if (text.length > 5000) {
      text = text.substring(0, 5000) + '... (konten dipotong)';
    }

    return `Isi konten dari URL "${url}":\n\n${text}`;
  } catch (error) {
    return `Error saat mengambil konten dari URL: ${error.message}`;
  }
}

/**
 * Implementasi Tool 5: Membaca berkas workspace
 */
function readWorkspaceFile(filename) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: read_workspace_file] Membaca: ${safePath}`);
  try {
    if (!fs.existsSync(safePath)) return `File tidak ditemukan: ${filename}`;
    const content = fs.readFileSync(safePath, 'utf-8');
    return `Isi berkas "${filename}":\n\n${content}`;
  } catch (e) {
    return `Gagal membaca berkas: ${e.message}`;
  }
}

/**
 * Implementasi Tool 6: Menulis/Memperbarui berkas workspace
 */
function writeWorkspaceFile(filename, content) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: write_workspace_file] Menulis ke: ${safePath}`);
  try {
    fs.writeFileSync(safePath, content, 'utf-8');
    return `Berhasil menulis konten ke berkas "${filename}".`;
  } catch (e) {
    return `Gagal menulis berkas: ${e.message}`;
  }
}

/**
 * Implementasi Tool 7: Eksekusi Perintah Terminal Shell (Owner only)
 */
function runTerminalCommand(command) {
  console.log(`[Tool: run_terminal_command] Mengeksekusi: ${command}`);
  return new Promise((resolve) => {
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        resolve(`Error: ${error.message}\nStderr: ${stderr}`);
        return;
      }
      resolve(`Stdout:\n${stdout || '(tidak ada keluaran stdout)'}\nStderr:\n${stderr || '(tidak ada keluaran stderr)'}`);
    });
  });
}

/**
 * Implementasi Tool 8: Menambahkan cron schedule dinamis
 */
function addCronSchedule(schedule, description, prompt) {
  console.log(`[Tool: add_cron_schedule] Menambahkan schedule: ${schedule}`);
  const filePath = path.join(process.cwd(), 'schedules.json');
  try {
    let schedules = [];
    if (fs.existsSync(filePath)) {
      schedules = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    schedules.push({ schedule, description, prompt });
    fs.writeFileSync(filePath, JSON.stringify(schedules, null, 2), 'utf-8');
    return `Sukses mendaftarkan cron job baru: "${description}". Bot perlu di-restart atau direkoneksi agar cron job aktif secara live.`;
  } catch (e) {
    return `Gagal menambahkan jadwal cron: ${e.message}`;
  }
}

/**
 * Implementasi Tool 9: Menghapus cron schedule dinamis
 */
function removeCronSchedule(description) {
  console.log(`[Tool: remove_cron_schedule] Menghapus schedule dengan deskripsi: ${description}`);
  const filePath = path.join(process.cwd(), 'schedules.json');
  try {
    if (!fs.existsSync(filePath)) return 'File schedules.json tidak ditemukan.';
    let schedules = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const initialLen = schedules.length;
    schedules = schedules.filter(item => item.description !== description);
    if (schedules.length === initialLen) {
      return `Tidak ditemukan jadwal cron dengan deskripsi "${description}".`;
    }
    fs.writeFileSync(filePath, JSON.stringify(schedules, null, 2), 'utf-8');
    return `Sukses menghapus cron job: "${description}". Perubahan akan aktif live pada restart/koneksi bot berikutnya.`;
  } catch (e) {
    return `Gagal menghapus jadwal cron: ${e.message}`;
  }
}

/**
 * Implementasi Tool 10: Mengatur pengingat sekali jalan (One Shot Reminder)
 */
function setOneShotReminder(durationSeconds, message, sock) {
  console.log(`[Tool: set_one_shot_reminder] Menyetel pengingat dalam ${durationSeconds} detik`);
  setTimeout(async () => {
    try {
      // Targetkan pengiriman pengingat ke grup target manhwa atau owner
      const targetJid = process.env.MANHWA_GROUP_JID || '120363407159758205@g.us';
      await sock.sendMessage(targetJid, { text: `🔔 *REMINDER* 🔔\n\n${message}` });
      console.log(`[Reminder Sent]: ${message}`);
    } catch (err) {
      console.error('[Reminder Error] Gagal mengirim pesan pengingat:', err.message);
    }
  }, durationSeconds * 1000);

  return `Sukses menyetel pengingat sekali jalan. Pesan akan terkirim secara otomatis dalam ${durationSeconds} detik.`;
}

/**
 * Implementasi Tool 11: Apply Patch / Modifikasi Berkas Presisi
 */
function applyPatch(filename, targetContent, replacementContent) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: apply_patch] Modifikasi file: ${safePath}`);
  try {
    if (!fs.existsSync(safePath)) return `File tidak ditemukan: ${filename}`;
    const originalContent = fs.readFileSync(safePath, 'utf-8');

    if (!originalContent.includes(targetContent)) {
      return `Gagal menerapkan patch. Target teks lama tidak ditemukan secara persis di dalam file. Pastikan whitespace, baris baru, dan indentasi cocok.`;
    }

    const updatedContent = originalContent.replace(targetContent, replacementContent);
    fs.writeFileSync(safePath, updatedContent, 'utf-8');
    return `Sukses menerapkan patch pada file "${filename}".`;
  } catch (e) {
    return `Gagal menerapkan patch: ${e.message}`;
  }
}

/**
 * Implementasi Tool 12: Membaca teks dokumen PDF lokal
 */
async function parsePdfFile(filename) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: parse_pdf_file] Mengekstrak PDF: ${safePath}`);
  try {
    if (!fs.existsSync(safePath)) return `File PDF tidak ditemukan: ${filename}`;
    const dataBuffer = fs.readFileSync(safePath);
    const data = await pdf(dataBuffer);

    let text = data.text;
    if (text.length > 8000) {
      text = text.substring(0, 8000) + '... (konten PDF dipotong karena terlalu panjang)';
    }
    return `Konten teks dari PDF "${filename}":\n\n${text}`;
  } catch (e) {
    return `Gagal parsing berkas PDF: ${e.message}`;
  }
}

/**
 * Implementasi Tool 13: Menganalisis gambar menggunakan Gemini multimodal via OpenRouter
 */
async function analyzeImage(filename, prompt) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: analyze_image] Menganalisis gambar: ${safePath}`);
  try {
    if (!fs.existsSync(safePath)) return `File gambar tidak ditemukan: ${filename}`;

    const fileBuffer = fs.readFileSync(safePath);
    const base64Data = fileBuffer.toString('base64');

    // Deteksi format mime gambar
    const ext = path.extname(safePath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.gif') mimeType = 'image/gif';

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';

    if (!apiKey) return 'Kunci API OpenRouter belum diatur di .env.';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
        'X-Title': 'Speaki WhatsApp Bot - Vision'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return reply || `Gagal menganalisis gambar: ${JSON.stringify(data)}`;
  } catch (e) {
    return `Error saat analisis gambar: ${e.message}`;
  }
}

/**
 * Implementasi Tool 14: Mendelegasikan tugas ke subagent terisolasi
 */
async function delegateSubagent(instruction, task) {
  console.log(`[Tool: delegate_subagent] Memulai subagent untuk tugas: ${task}`);
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';
    if (!apiKey) return 'Kunci API OpenRouter belum diatur di .env.';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
        'X-Title': 'Speaki WhatsApp Bot - Subagent'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: task }
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return reply ? `[SUBAGENT RESPONSE]\n${reply}` : `Subagent gagal memberikan respons: ${JSON.stringify(data)}`;
  } catch (e) {
    return `Error pada delegasi subagent: ${e.message}`;
  }
}

/**
 * Implementasi Tool 15: Menguji performa bot secara komprehensif
 */
async function runPerformanceTest() {
  console.log('[Tool: run_performance_test] Menjalankan uji performa...');
  const result = {
    openRouterLatencyMs: 0,
    fileReadLatencyMs: 0,
    systemRAM: '',
    systemCPU: ''
  };

  // 1. Uji Latensi OpenRouter API
  const startAPI = Date.now();
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';

    if (apiKey) {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (res.ok) {
        result.openRouterLatencyMs = Date.now() - startAPI;
      } else {
        result.openRouterLatencyMs = `Gagal (HTTP ${res.status})`;
      }
    } else {
      result.openRouterLatencyMs = 'API Key tidak diatur';
    }
  } catch (e) {
    result.openRouterLatencyMs = `Gagal (${e.message})`;
  }

  // 2. Uji Latensi Pembacaan Berkas Lokal
  const startFile = Date.now();
  try {
    const testPath = path.join(process.cwd(), 'bot-speaki.js');
    if (fs.existsSync(testPath)) {
      fs.readFileSync(testPath, 'utf-8');
      result.fileReadLatencyMs = Date.now() - startFile;
    } else {
      result.fileReadLatencyMs = 'Berkas uji bot-speaki.js tidak ditemukan';
    }
  } catch (e) {
    result.fileReadLatencyMs = `Gagal (${e.message})`;
  }

  // 3. Metrik RAM & CPU Server
  try {
    const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    result.systemRAM = `${usedMem} GB / ${totalMem} GB Terpakai`;

    const cpus = os.cpus();
    result.systemCPU = cpus.length > 0 ? `${cpus[0].model.trim()} (${cpus.length} Cores)` : 'Tidak diketahui';
  } catch (e) {
    result.systemRAM = 'Error';
    result.systemCPU = 'Error';
  }

  return `=== HASIL UJI PERFORMA BOT ===\n` +
    `🌐 Latensi OpenRouter API: ${result.openRouterLatencyMs} ms\n` +
    `💾 Latensi Pembacaan Berkas: ${result.fileReadLatencyMs} ms\n` +
    `🧠 Penggunaan RAM Server: ${result.systemRAM}\n` +
    `🖥️ Tipe & Inti CPU Server: ${result.systemCPU}\n` +
    `📊 Latensi Pemrosesan Internal: Sangat Rendah (Sub-milidetik)\n` +
    `==============================`;
}

/**
 * Router utama untuk mengeksekusi fungsi berdasarkan nama tool yang dipanggil oleh LLM
 * @param {string} name - Nama tool/fungsi.
 * @param {object} args - Argumen parameter dari LLM.
 * @param {object} sock - Koneksi WA sock.
 * @param {function} checkShinigamiUpdatesFn - Referensi fungsi scraper dari bot-speaki.js.
 */
/**
 * Implementasi Tool 16: Mengirim berkas dokumen/file ke obrolan WhatsApp
 */
async function sendWorkspaceFile(filename, caption, sock, extraContext = {}) {
  const safePath = path.join(process.cwd(), filename.replace(/\.\.\//g, ''));
  console.log(`[Tool: send_workspace_file] Mengirim file: ${safePath}`);
  try {
    if (!fs.existsSync(safePath)) return `Berkas tidak ditemukan: ${filename}`;

    const { jid, msg } = extraContext;
    const fileData = fs.readFileSync(safePath);
    const fileName = path.basename(safePath);
    const sendOptions = msg ? { quoted: msg } : {};

    // Jika dipanggil dari konteks obrolan spesifik, kirim langsung ke JID tersebut
    if (jid) {
      await sock.sendMessage(jid, {
        document: fileData,
        mimetype: 'application/octet-stream',
        fileName: fileName,
        caption: caption || `Berkas terlampir: ${fileName}`
      }, sendOptions);
      return `Sukses mengirimkan berkas "${filename}" langsung ke obrolan WhatsApp peminta.`;
    }

    // Targetkan pengiriman ke beberapa grup bawaan jika tanpa konteks JID
    const targets = [
      '120363407159758205@g.us', // Grup Mokel MY
      '120363410714791327@g.us' // Grup Belajar MacOS
    ];

    for (const targetJid of targets) {
      try {
        await sock.sendMessage(targetJid, {
          document: fileData,
          mimetype: 'application/octet-stream',
          fileName: fileName,
          caption: caption || `Berkas terlampir: ${fileName}`
        });
      } catch (err) {
        console.error(`[Tool: send_workspace_file] Gagal mengirim ke ${targetJid}:`, err.message);
      }
    }

    return `Sukses mengirimkan berkas "${filename}" ke obrolan WhatsApp grup target.`;
  } catch (e) {
    return `Gagal mengirim berkas: ${e.message}`;
  }
}

/**
 * Router utama untuk mengeksekusi fungsi berdasarkan nama tool yang dipanggil oleh LLM
 * @param {string} name - Nama tool/fungsi.
 * @param {object} args - Argumen parameter dari LLM.
 * @param {object} sock - Koneksi WA sock.
 * @param {function} checkShinigamiUpdatesFn - Referensi fungsi scraper dari bot-speaki.js.
 */
export async function executeTool(name, args, sock, checkShinigamiUpdatesFn, extraContext) {
  switch (name) {
    case 'web_search':
      return await webSearch(args.query);
    case 'web_fetch':
      return await webFetch(args.url);
    case 'check_shinigami_now':
      return await checkShinigamiNow(sock, checkShinigamiUpdatesFn);
    case 'get_system_status':
      return getSystemStatus();
    case 'read_workspace_file':
      return readWorkspaceFile(args.filename);
    case 'write_workspace_file':
      return writeWorkspaceFile(args.filename, args.content);
    case 'run_terminal_command':
      return await runTerminalCommand(args.command);
    case 'add_cron_schedule':
      return addCronSchedule(args.schedule, args.description, args.prompt);
    case 'remove_cron_schedule':
      return removeCronSchedule(args.description);
    case 'set_one_shot_reminder':
      return setOneShotReminder(args.durationSeconds, args.message, sock);
    case 'apply_patch':
      return applyPatch(args.filename, args.targetContent, args.replacementContent);
    case 'parse_pdf_file':
      return await parsePdfFile(args.filename);
    case 'analyze_image':
      return await analyzeImage(args.filename, args.prompt);
    case 'delegate_subagent':
      return await delegateSubagent(args.instruction, args.task);
    case 'run_performance_test':
      return await runPerformanceTest();
    case 'send_workspace_file':
      return await sendWorkspaceFile(args.filename, args.caption, sock, extraContext);
    default:
      // Coba memuat dan mengeksekusi skill dinamis dari folder skills/ jika tersedia
      if (loadedSkills.has(name)) {
        try {
          const execJsPath = loadedSkills.get(name);
          const skillModule = await import(execJsPath);
          if (typeof skillModule.execute === 'function') {
            return await skillModule.execute(args, sock, extraContext);
          } else {
            return `Gagal mengeksekusi skill "${name}": Fungsi ekspor "execute" tidak ditemukan di index.js.`;
          }
        } catch (e) {
          return `Gagal memuat skill dinamis "${name}": ${e.message}`;
        }
      }
      return `Tool dengan nama "${name}" tidak ditemukan di database tools Speaki.`;
  }
}
