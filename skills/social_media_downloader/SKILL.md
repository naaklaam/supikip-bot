# Social Media Downloader Skill

Skill untuk mengunduh media dari platform sosial media (YouTube, TikTok, Instagram, Twitter/X, Facebook, dll) menggunakan `yt-dlp` dan menyimpannya di folder `~/Downloads/SocialMedia/[Platform]`.

```json
{
  "type": "function",
  "function": {
    "name": "download_social_media",
    "description": "Mengunduh media (video/audio/foto) dari platform media sosial (YouTube, TikTok, Instagram, Twitter/X, Facebook, Reddit, Pinterest, dll) menggunakan yt-dlp dan gallery-dl. Hasil disimpan otomatis di ~/Downloads/SocialMedia/[Platform].",
    "parameters": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "URL media sosial yang akan diunduh."
        },
        "platform": {
          "type": "string",
          "description": "Nama platform sumber opsional (misal: YouTube, TikTok, Instagram, Twitter, Facebook). Jika tidak diisi, akan dideteksi otomatis dari URL."
        },
        "media_type": {
          "type": "string",
          "enum": ["video", "audio", "image", "all"],
          "description": "Tipe media: 'video' (default), 'audio' (ekstrak mp3), 'image' (unduh foto/gambar menggunakan gallery-dl), atau 'all' (unduh foto dan video sekaligus)."
        }
      },
      "required": ["url"]
    }
  }
}
```
