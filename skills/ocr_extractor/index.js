import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { getOpenRouterParamsWithDefaultMaxTokens, getOpenRouterVisionModelName } from '../../src/services/model_params.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Menggunakan model vision yang handal untuk pemrosesan OCR gambar
const VISION_MODEL = getOpenRouterVisionModelName();

/**
 * Mengirimkan gambar base64 ke OpenRouter Vision API untuk ekstraksi teks OCR
 * @param {Buffer} imageBuffer - Buffer gambar mentah
 */
export async function performOCR(imageBuffer) {
  if (!OPENROUTER_API_KEY) {
    return "Gagal memproses OCR: API Key OpenRouter belum diatur di file .env.";
  }

  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg'; // Fallback default

  const systemPrompt = `Kamu adalah mesin OCR (Optical Character Recognition) berspesifikasi tinggi dan sangat teliti.
Tugas utama:
1. Salin seluruh teks, angka, simbol, atau tabel yang terlihat pada gambar dengan persis tanpa modifikasi.
2. JANGAN menambahkan komentar, basa-basi pembuka, penjelasan, atau penutup apapun. Cukup kembalikan teks hasil salinan gambar secara langsung.
3. Jika gambar tidak mengandung teks sama sekali, balas dengan: "[Tidak ada teks yang terdeteksi di dalam gambar]"`;

  try {
    const modelParams = getOpenRouterParamsWithDefaultMaxTokens(800);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
        'X-Title': 'Speaki WhatsApp Bot - OCR Extractor'
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        ...modelParams,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content;

    if (!extractedText) {
      console.error('Respon OCR Vision kosong dari API:', data);
      return 'Gagal mengekstrak teks: Respons kosong dari server AI.';
    }

    return extractedText.trim();
  } catch (e) {
    return `Gagal memproses OCR gambar via API: ${e.message}`;
  }
}

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock) {
    const imgPath = args.image_path;
    console.log(`[Skill: ocr_extractor] Mengekstrak teks dari berkas: ${imgPath}`);

    try {
        if (!fs.existsSync(imgPath)) {
            return `Berkas gambar tidak ditemukan di server: ${imgPath}`;
        }

        const buffer = fs.readFileSync(imgPath);
        const result = await performOCR(buffer);
        
        // Hapus file sementara setelah selesai diproses agar menghemat disk space
        try {
            fs.unlinkSync(imgPath);
        } catch (err) {
            console.warn(`[OCR Skill] Gagal menghapus file sementara: ${imgPath}`, err.message);
        }

        return `=== HASIL EKSTRAKSI TEKS (OCR) ===\n\n${result}`;
    } catch (e) {
        return `Gagal mengeksekusi OCR file: ${e.message}`;
    }
}
