import dotenv from 'dotenv';
dotenv.config();

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock, extraContext = {}) {
  const { song_query } = args;
  if (!song_query) {
    return 'Gagal: Kueri pencarian lirik tidak boleh kosong.';
  }

  console.log(`[Skill: lyrics_scraper] Memulai pencarian lirik untuk: "${song_query}"`);

  // 1. Coba Sumber Utama: Lyricsfy (Lyricsify) via LRCLib API
  // LRCLib merupakan database sinkronisasi lirik (LRC/Lyricsify) terbesar dan bebas blokir Cloudflare.
  try {
    const lrcUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(song_query)}`;
    const res = await fetch(lrcUrl, {
      headers: {
        'User-Agent': 'SpeakiBot/1.0 (https://github.com/naaklaam/supikip-bot)'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        // Ambil kecocokan pertama (terbaik)
        const bestMatch = data[0];
        const lyrics = bestMatch.plainLyrics || bestMatch.syncedLyrics;
        if (lyrics && lyrics.trim().length > 50) {
          console.log(`[Skill: lyrics_scraper] Lirik berhasil diperoleh dari Lyricsfy/LRCLib.`);
          return `🎤 *[LIRIK LAGU - LYRICSify]*\n\n*Judul:* ${bestMatch.name}\n*Artis:* ${bestMatch.artistName}\n*Album:* ${bestMatch.albumName || '-'}\n\n${lyrics}`;
        }
      }
    }
  } catch (err) {
    console.error(`[Skill: lyrics_scraper] Gagal mengambil dari Lyricsfy/LRCLib:`, err.message);
  }

  // 2. Fallback 1: LyricsFind via SerpAPI
  const serpKey = process.env.SERPAPI_API_KEY;
  if (serpKey) {
    try {
      console.log(`[Skill: lyrics_scraper] Fallback ke LyricsFind (via SerpAPI)...`);
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(song_query + ' lyrics')}&api_key=${serpKey}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const lyrics = data.lyrics || data.knowledge_graph?.lyrics;
        if (lyrics && lyrics.trim().length > 50) {
          const title = data.knowledge_graph?.title || song_query;
          const artist = data.knowledge_graph?.type || '';
          console.log(`[Skill: lyrics_scraper] Lirik berhasil diperoleh dari LyricsFind.`);
          return `🎤 *[LIRIK LAGU - LYRICSFIND]*\n\n*Judul:* ${title} ${artist ? `(${artist})` : ''}\n\n${lyrics}`;
        }
      }
    } catch (err) {
      console.error(`[Skill: lyrics_scraper] Gagal mengambil dari LyricsFind:`, err.message);
    }
  }

  // 3. Fallback 2: Musixmatch via Tavily Search API
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      console.log(`[Skill: lyrics_scraper] Fallback ke Musixmatch (via Tavily)...`);
      const query = `"${song_query}" lyrics site:musixmatch.com OR site:lyrics.com`;
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 3
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answer && data.answer.length > 100) {
          console.log(`[Skill: lyrics_scraper] Lirik berhasil diperoleh dari Musixmatch.`);
          return `🎤 *[LIRIK LAGU - MUSIXMATCH]*\n\n${data.answer}`;
        }
        for (const result of data.results) {
          if (result.content && result.content.toLowerCase().includes('lyrics') && result.content.length > 150) {
            console.log(`[Skill: lyrics_scraper] Lirik berhasil diperoleh dari Musixmatch (snippet).`);
            return `🎤 *[LIRIK LAGU - MUSIXMATCH/SOURCE]*\n\n*Sumber:* ${result.url}\n\n${result.content}`;
          }
        }
      }
    } catch (err) {
      console.error(`[Skill: lyrics_scraper] Gagal mengambil dari Musixmatch/Tavily:`, err.message);
    }
  }

  // 4. Fallback 3: Pencarian Umum via Google/SerpAPI
  if (serpKey) {
    try {
      console.log(`[Skill: lyrics_scraper] Fallback ke Google Search (via SerpAPI)...`);
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(song_query + ' song lyrics')}&api_key=${serpKey}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.organic_results && data.organic_results.length > 0) {
          const firstResult = data.organic_results[0];
          if (firstResult.snippet && firstResult.snippet.length > 80) {
            console.log(`[Skill: lyrics_scraper] Lirik berhasil diperoleh dari Pencarian Umum (snippet).`);
            return `🎤 *[LIRIK LAGU - PENCARIAN GOOGLE]*\n\n*Sumber:* ${firstResult.link}\n\n${firstResult.snippet}`;
          }
        }
      }
    } catch (err) {
      console.error(`[Skill: lyrics_scraper] Gagal mengambil dari Pencarian Umum:`, err.message);
    }
  }

  return `Maaf, lirik lagu untuk "${song_query}" tidak dapat ditemukan di Lyricsfy, LyricsFind, maupun Musixmatch.`;
}
