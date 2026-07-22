import dotenv from 'dotenv';
dotenv.config();
import { getOpenRouterModelName, getOpenRouterParamsWithDefaultMaxTokens } from './model_params.js';

// Pattern URL reguler
const URL_REGEX = /(https?:\/\/[^\s>]+)/gi;

// Domain/skema media yang diabaikan dari unfurler (karena ditangani downloader atau media player)
const IGNORED_DOMAINS = [
  'instagram.com/reel',
  'instagram.com/p',
  'tiktok.com',
  'youtube.com/watch',
  'youtu.be',
  'x.com',
  'twitter.com',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.mp4',
  '.mp3',
  '.pdf'
];

/**
 * Mengekstrak URL pertama dari teks yang valid untuk di-unfurl sebagai artikel/berita
 */
export function extractArticleUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return null;

  for (const url of matches) {
    const lowerUrl = url.toLowerCase();
    const isIgnored = IGNORED_DOMAINS.some(domain => lowerUrl.includes(domain));
    if (!isIgnored) {
      return url;
    }
  }
  return null;
}

/**
 * Mengambil isi teks artikel dari URL dan menghasilkan 3 poin ringkasan utama
 */
export async function unfurlAndSummarizeUrl(url) {
  console.log(`[Link Unfurler] Mengambil artikel dari: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000) // Timeout 6 detik
    });

    if (!response.ok) return null;
    const html = await response.text();

    // Ambil tag <title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Artikel Web';

    // Bersihkan HTML untuk mendapatkan teks utama
    let cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText.length > 4000) {
      cleanText = cleanText.substring(0, 4000);
    }

    if (cleanText.length < 100) return null; // Teks terlalu pendek

    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelParams = getOpenRouterParamsWithDefaultMaxTokens(500);
    if (!apiKey) return null;

    // Panggil LLM cepat untuk ringkasan 3 poin
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
        'X-Title': 'Speaki Link Unfurler'
      },
      body: JSON.stringify({
        model: getOpenRouterModelName(),
        ...modelParams,
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah Smart Link Unfurler. Tugasmu membedah teks artikel berita/blog dan menghasilkan ringkasan persis 3 poin utama yang paling penting, padat, dan informatif dalam Bahasa Indonesia. Gunakan format nomor (1, 2, 3).'
          },
          {
            role: 'user',
            content: `Judul Artikel: "${title}"\n\nTeks Artikel:\n${cleanText}`
          }
        ],
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content;
    if (!summary) return null;

    return `📰 *[SMART LINK UNFURL]*\n📌 *Judul:* ${title}\n\n💡 *3 Poin Utama Artikel:*\n${summary.trim()}`;

  } catch (err) {
    console.error(`[Link Unfurler Error] Gagal membedah ${url}:`, err.message);
    return null;
  }
}
