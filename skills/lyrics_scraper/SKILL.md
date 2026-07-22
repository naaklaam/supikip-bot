---
name: lyrics_scraper
description: Cari dan ambil lirik lagu secara otomatis dari Lyricsfy/Lyricsify (utama), LyricsFind, atau Musixmatch.
---

# Lyrics Scraper Skill

Skill ini mencari lirik lagu dari Lyricsify (utama) dan melakukan fallback ke LyricsFind/Musixmatch jika tidak ditemukan.

```json
{
  "type": "function",
  "function": {
    "name": "get_song_lyrics",
    "description": "Cari dan ambil lirik lagu lengkap dari database Lyricsfy (Lyricsify), LyricsFind, atau Musixmatch.",
    "parameters": {
      "type": "object",
      "properties": {
        "song_query": {
          "type": "string",
          "description": "Nama lagu dan nama penyanyi/artis yang ingin dicari liriknya (contoh: 'Beatles Yesterday' atau 'Kanako Miyamoto Ganbalance de Dance')."
        }
      },
      "required": ["song_query"]
    }
  }
}
```
