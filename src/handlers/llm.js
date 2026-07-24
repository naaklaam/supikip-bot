import fs from 'fs';
import path from 'path';
import { toolsSchema, executeTool } from '../../tools.js';
import { getRelevantMemoryContext } from '../db/index.js';
import { checkShinigamiUpdates, resolvedShinigamiDomains } from '../services/shinigami_scraper.js';
import { getOpenRouterModelName, getOpenRouterParamsWithDefaultMaxTokens } from '../services/model_params.js';

import { getSessionJid } from '../utils/session_helper.js';

// Memori percakapan sementara untuk menyimpan riwayat obrolan (maksimal 10 pesan per JID)
// Struktur: { messages: [], lastAccessed: timestamp }
export const chatHistories = new Map();

// Cache global untuk system instruction agar menghindari I/O disk berlebihan
let systemInstructionCache = null;
let systemInstructionCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache valid selama 5 menit

/**
 * Fungsi untuk mengambil instruksi sistem (system prompt) terstruktur dari berkas-berkas markdown lokal.
 * Menggabungkan CORE_IDENTITY.md dan TOOLS.md untuk menghemat token dan menghilangkan redundansi.
 */
export function getSystemInstruction() {
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

  const shinigamiStatus = `\n=== SHINIGAMI SCRAPER STATUS & ACTIVE DOMAINS ===\n` +
    `- Web Induk / Landing Page: ${resolvedShinigamiDomains.landingUrl || 'https://shinigami.to/'}\n` +
    `- Domain Website Aktif (Hasil Scrape Induk): ${resolvedShinigamiDomains.webUrl}\n` +
    `- Endpoint API List: ${resolvedShinigamiDomains.apiUrl}\n` +
    `Catatan: Ketika pengguna bertanya tentang link Shinigami atau dari mana bot mengecek update komik/manhwa, beritahukan bahwa bot memantau landing page induk https://shinigami.to/ lalu mengekstrak domain aktif (${resolvedShinigamiDomains.webUrl}).\n`;

  let finalInstruction = '';
  if (promptParts.length === 0) {
    finalInstruction = 'Kamu adalah Speaki, asisten AI yang profesional, efisien, dan ketus. Jawab langsung pada inti masalah tanpa basa-basi.' + shinigamiStatus;
  } else {
    finalInstruction = `Kamu adalah asisten AI dengan instruksi terstruktur berikut yang menentukan perilaku, gaya bicara, identitas, dan batasanmu:\n\n` +
      promptParts.join('\n') + shinigamiStatus;
  }

  // Update cache memori
  systemInstructionCache = finalInstruction;
  systemInstructionCacheTime = now;

  return finalInstruction;
}

/**
 * Truncate teks jika terlalu panjang agar tidak memakan token berlebihan.
 */
export function truncateOutput(text, maxLength = 3000) {
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
export async function getOpenRouterResponse(jid, sock, msg) {
  if (!process.env.OPENROUTER_API_KEY) {
    return 'Waduh! Kunci API OpenRouter belum diatur di file .env nya!';
  }

  // Buat objek konteks pemanggilan tool yang bertahan sepanjang turn obrolan saat ini
  const toolContext = { jid, msg, sentTargets: new Set() };

  const sessionJid = getSessionJid(jid);
  const now = Date.now();
  let chatData = chatHistories.get(sessionJid);
  if (!chatData) {
    chatData = { messages: [], lastAccessed: now };
    chatHistories.set(sessionJid, chatData);
  } else {
    chatData.lastAccessed = now;
  }
  const history = chatData.messages;

  // Dapatkan memori FTS5 yang relevan dengan pesan pengguna dari SQLite
  const lastUserMsg = history.slice().reverse().find(m => m.role === 'user')?.content || '';
  const ftsMemoryContext = await getRelevantMemoryContext(lastUserMsg, sessionJid);

  let finalSystemInstruction = getSystemInstruction();
  if (ftsMemoryContext) {
    finalSystemInstruction += ftsMemoryContext;
  }

  // Susun array messages sementara (ephemeral) untuk siklus request saat ini
  let currentMessages = [
    { role: 'system', content: finalSystemInstruction },
    ...history
  ];

  try {
    let maxIterations = 10; // Maksimal 10 iterasi tool call per turn untuk hemat token dan mengurangi latency
    const modelParams = getOpenRouterParamsWithDefaultMaxTokens(1500);
    const executedToolCalls = new Set();

    while (maxIterations-- > 0) {
      const isLastIteration = (maxIterations === 0);
      
      const requestPayload = {
        model: getOpenRouterModelName(),
        ...modelParams,
        messages: currentMessages
      };

      if (isLastIteration) {
        // Pada iterasi terakhir, paksa LLM untuk merangkum hasil yang diperoleh tanpa memanggil tool lagi
        currentMessages.push({
          role: 'system',
          content: 'System: Batas pencarian/pemanggilan tool telah dicapai. Harap berikan jawaban terbaik yang bisa disimpulkan berdasarkan data atau hasil pemanggilan tool yang telah diperoleh di atas. Jangan memanggil tool baru lagi.'
        });
      } else {
        requestPayload.tools = toolsSchema;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
          'X-Title': 'Speaki WhatsApp Bot'
        },
        body: JSON.stringify(requestPayload)
      });

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      if (!message) {
        console.error('Respon OpenRouter kosong atau error:', data);
        return 'Eh? Speaki bingung... API OpenRouter ngasih jawaban kosong.';
      }

      // Jika LLM meminta pemanggilan tool (function calling) dan ini bukan iterasi terakhir
      if (message.tool_calls && message.tool_calls.length > 0 && !isLastIteration) {
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

          // Normalisasi argumen untuk keunikan deteksi loop (urutkan kunci JSON)
          const sortedArgsStr = JSON.stringify(args, Object.keys(args).sort());
          const toolCallKey = `${name}:${sortedArgsStr}`;

          let toolOutput;
          if (executedToolCalls.has(toolCallKey)) {
            console.warn(`[LLM Loop Protection] Menolak eksekusi ulang tool yang sama dalam satu turn: ${toolCallKey}`);
            toolOutput = `Error: Tool "${name}" dengan parameter tersebut sudah pernah dieksekusi di iterasi sebelumnya pada turn ini. Silakan gunakan hasil yang sudah diperoleh di atas untuk menyusun jawaban akhir Anda. Jangan memanggil tool ini lagi dengan parameter yang sama.`;
          } else {
            executedToolCalls.add(toolCallKey);
            toolOutput = await executeTool(name, args, sock, checkShinigamiUpdates, toolContext);
            toolOutput = truncateOutput(toolOutput, 3000); // Potong output raksasa agar token input tetap hemat
          }

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

    return 'Maaf, saya tidak dapat menyelesaikan pencarian seluruhnya, namun data di atas adalah hasil terbaik yang bisa saya peroleh.';
  } catch (error) {
    console.error('Error saat menghubungi OpenRouter:', error);
    return 'Aduh! Gagal konek ke OpenRouter. Coba cek internet atau kuota API-nya!';
  }
}
