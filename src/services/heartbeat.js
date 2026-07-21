import fs from 'fs';
import path from 'path';
import { toolsSchema } from '../../tools.js';
import { getSystemInstruction } from '../handlers/llm.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';
const MANHWA_GROUP_JID = process.env.MANHWA_GROUP_JID || '';

/**
 * Fungsi untuk memeriksa HEARTBEAT.md dan memproses tugas berkala jika terisi.
 */
export async function checkHeartbeat(sock) {
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
