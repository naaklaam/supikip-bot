# 📖 Panduan Menjalankan Bot WhatsApp Speaki Standalone

Panduan ini membantu Anda menyiapkan, mengonfigurasi, dan menjalankan bot WhatsApp **Speaki** yang super cepat dan responsif secara terpisah dari framework OpenClaw, namun tetap menggunakan modul WhatsApp [baileys](file:///home/naaklaam/Supikip/baileys).

---

## 🛠️ Persyaratan Sistem
* **Node.js**: Versi `20.0.0` atau yang lebih tinggi (Persyaratan wajib dari Baileys v7).
* **NPM**: Bawaan dari instalasi Node.js Anda.

---

## 📂 Struktur Berkas Bot & Prompting Terstruktur

Semua berkas bot berada di direktori `/home/naaklaam/Supikip`:
1. **[bot-speaki.js](file:///home/naaklaam/Supikip/bot-speaki.js)**: Berkas kode utama bot WhatsApp. Mengatur koneksi socket, pemrosesan pesan, interseptor stiker masuk, dan integrasi dengan OpenRouter API.
2. **[tools.js](file:///home/naaklaam/Supikip/tools.js)**: Registry utama tools statis dan loader untuk dynamic skills.
3. **[package.json](file:///home/naaklaam/Supikip/package.json)**: Berkas manifes Node.js untuk dependensi (`@itsliaaa/baileys`, `node-cron`, `pdf-parse`).
4. **[.env](file:///home/naaklaam/Supikip/.env)**: API Key OpenRouter dan konfigurasi model LLM.
5. **[skills/](file:///home/naaklaam/Supikip/skills)**: Folder penyimpanan modul kemampuan (*dynamic skills*) pihak ketiga yang dimuat secara dinamis.

### 🧠 Berkas Prompting Terstruktur (Gaya OpenClaw)
Kepribadian dan perilaku bot ditentukan secara modular melalui file-file markdown berikut yang digabungkan secara dinamis sebagai System Prompt:
* **[AGENTS.md](file:///home/naaklaam/Supikip/AGENTS.md)**: Aturan dasar sesi, penanganan grup chat, dan aturan pemeliharaan memori (Memory Pruning).
* **[IDENTITY.md](file:///home/naaklaam/Supikip/IDENTITY.md)**: Identitas agen (Nama, Peran, Vibe profesional, efisien, dan ketus).
* **[SOUL.md](file:///home/naaklaam/Supikip/SOUL.md)**: Inti kepribadian, nada bicara dingin/ketus tanpa basa-basi, dan batasan perilaku.
* **[TOOLS.md](file:///home/naaklaam/Supikip/TOOLS.md)**: Catatan lokal infrastruktur dan lingkungan kerja.
* **[HEARTBEAT.md](file:///home/naaklaam/Supikip/HEARTBEAT.md)**: Berisi daftar tugas berkala yang dievaluasi LLM saat interval detak jantung berjalan.
* **[MEMORY.md](file:///home/naaklaam/Supikip/MEMORY.md)**: Catatan memori jangka panjang ringkas terstruktur (Wajib berada di bawah 30 baris).

---

## 🚀 Langkah-Langkah Setup & Menjalankan Bot

### Langkah 1: Instal Seluruh Dependensi secara Otomatis
Kita menggunakan NPM untuk menginstal seluruh pustaka yang dibutuhkan secara otomatis. 
```bash
cd /home/naaklaam/Supikip
npm install --legacy-peer-deps
```

### Langkah 2: Konfigurasi API Key OpenRouter
Buka file **[.env](file:///home/naaklaam/Supikip/.env)** di text editor Anda, lalu masukkan kunci API OpenRouter Anda.

### Langkah 3: Jalankan Bot
Jalankan perintah berikut untuk mengaktifkan bot:
```bash
node bot-speaki.js
```

### Langkah 4: Hubungkan ke WhatsApp (Scan QR)
Pindai (scan) QR Code yang ada di terminal menggunakan fitur **Perangkat Tertaut** di aplikasi WhatsApp HP Anda.

---

## 🛠️ Fitur Tools Statis Bawaan

Bot dilengkapi dengan tools statis bawaan di **[tools.js](file:///home/naaklaam/Supikip/tools.js)** yang bisa dipanggil oleh LLM secara dinamis:

1. **`web_search`**: Pencarian web menggunakan DuckDuckGo HTML Scraper.
2. **`web_fetch`**: Mengambil & membersihkan konten teks dari halaman URL web tertentu.
3. **`get_system_status`**: Metrik status performa PC/Server (RAM, CPU, Uptime).
4. **`read_workspace_file` & `write_workspace_file`**: Operasi file I/O lokal di workspace.
5. **`apply_patch`**: Penerapan modifikasi file terarah (search and replace) hemat token.
6. **`run_terminal_command`**: (Owner Only) Eksekusi perintah bash/shell.
7. **`add_cron_schedule` & `remove_cron_schedule`**: Kontrol penugasan cron dinamis.
8. **`set_one_shot_reminder`**: Pengingat waktu mundur sekali jalan.
9. **`parse_pdf_file`**: Ekstraksi teks dokumen PDF lokal menggunakan `pdf-parse`.
10. **`analyze_image`**: Analisis gambar base64 lokal menggunakan penglihatan multimodal Gemini.
11. **`delegate_subagent`**: Delegasi sub-percakapan terisolasi dengan LLM.
12. **`run_performance_test`**: (Owner Only via pemicu `"speaki dev test"`) Menguji latensi API OpenRouter dan kecepatan I/O server.
13. **`send_workspace_file`**: Mengirimkan berkas dokumen/file dari direktori server lokal langsung ke chat WhatsApp.

---

## 🧩 Sistem Dynamic Skills (Pemuatan Dinamis)

Bot secara otomatis memindai direktori [skills/](file:///home/naaklaam/Supikip/skills) setiap kali dinyalakan.

*   **[bitcoin_market_analyzer](file:///home/naaklaam/Supikip/skills/bitcoin_market_analyzer)**:
    *   *Fungsi*: `analyze_bitcoin_market`
    *   *Deskripsi*: Mengambil data pasar real-time spot Bitcoin (harga global, volume perdagangan spot 24 jam, fluktuasi harga terendah/tertinggi) dari API CoinGecko dan Binance Spot untuk bypass proteksi Cloudflare.
*   **[creative_writer](file:///home/naaklaam/Supikip/skills/creative_writer)**:
    *   *Fungsi*: `generate_creative_content`
    *   *Deskripsi*: Menghasilkan cerita fiksi pendek berkualitas tinggi (cerpen) dengan plot twist yang menarik atau puisi indah kaya metafora berdasarkan genre dan tema kustom.
*   **[ocr_extractor](file:///home/naaklaam/Supikip/skills/ocr_extractor)**:
    *   *Fungsi*: `extract_text_from_image`
    *   *Deskripsi*: Mengekstrak teks secara akurat dari berkas gambar lokal menggunakan teknologi Gemini Vision API.
*   **[sticker_responder](file:///home/naaklaam/Supikip/skills/sticker_responder)**:
    *   *Fungsi*: `send_sticker_response`
    *   *Deskripsi*: Mengirimkan stiker WhatsApp biner mentah secara acak berdasarkan tag kategori (ekspresi) dari database SQLite lokal.

### Cara Menambahkan Skill Baru:
Buat folder baru di bawah `skills/` (misal: `skills/hello_world/`) yang wajib berisi:
1. **`SKILL.md`**: File markdown dokumentasi yang di dalamnya terselip blok JSON skema OpenAI Function Calling, contoh:
   ```markdown
   # Hello World Skill
   ```json
   {
     "type": "function",
     "function": {
       "name": "say_hello",
       "description": "Mengucapkan halo secara kustom.",
       "parameters": {
         "type": "object",
         "properties": {
           "name": { "type": "string" }
         },
         "required": ["name"]
       }
     }
   }
   ```
   ```
2. **`index.js`**: Kode Javascript modul ES yang mengekspor fungsi `execute`, contoh:
   ```javascript
   export async function execute(args, sock) {
       return `Halo ${args.name}, salam kenal dari sistem modul dinamis!`;
   }
   ```

---

## 📥 Pengolah Stiker & Database SQLite (`speaki.db`)

Bot dilengkapi dengan database relasional lokal serverless **SQLite3** (`speaki.db`) untuk pengelolaan aset stiker dan statistik penggunaan secara dinamis.

### 1. Sticker Database (`/stiker_db/`):
*   **Penyimpanan**: Stiker yang dikirim oleh Owner (`JO`) diunduh secara otomatis dan disimpan rapi di dalam subfolder [stiker_db/](file:///home/naaklaam/Supikip/stiker_db).
*   **Registrasi Database**: Setiap stiker baru secara otomatis dicatat ke tabel `stickers` di database SQLite dengan properti `filename`, `tag` (default: `'general'`), `added_by`, dan pelacak `usage_count`.
*   **Statistik Penggunaan**: Setiap kali LLM memicu tool `send_sticker_response`, jumlah total penggunaan stiker tersebut akan bertambah secara otomatis di database.
*   **Target Pengiriman**: Secara *chaos* statis, stiker respon yang dipicu LLM akan langsung ditembak masuk ke dua grup target sekaligus secara paralel:
    1.  `120363407159758205@g.us` (Grup Manhwa)
    2.  `120363322107836319@g.us` (Grup Punini)

---

## 📝 Fitur OCR Gambar Gambar Masal (Auto-OCR Mode)

Bot memiliki interceptor OCR terintegrasi tanpa token LLM untuk ekstraksi teks super cepat.

*   **Pemicu Sekali Jalan**: Kirim gambar dengan takarir/caption `"ocr"`.
*   **Auto-OCR Mode (Sangat berguna untuk kirim masal)**:
    *   Ketik **`ocr on`** di grup/obrolan untuk mengaktifkan mode otomatis. Gambar apa saja yang dikirim berikutnya tanpa caption akan langsung di-OCR oleh bot.
    *   Bot akan me-reply teks hasil OCR secara spesifik ke masing-masing gambar bersangkutan (sangat rapi untuk pengiriman 10 gambar sekaligus).
    *   Matikan mode ini jika sudah selesai dengan mengetik **`ocr off`**.

---

## 📅 Fitur Jadwal Cron (Cron Tasks)
Anda dapat menambahkan tugas penjadwalan berkala di file **[schedules.json](file:///home/naaklaam/Supikip/schedules.json)**.
Contoh entri format JSON:
```json
[
  {
    "schedule": "0 9 * * *",
    "description": "Daily status check",
    "prompt": "Jalankan status PC server dan berikan ringkasan ringkas."
  }
]
```

---

## ⚠️ Peringatan Keamanan & Masalah Umum

> [!WARNING]
> **Risiko Pemblokiran (Banned) Nomor WhatsApp**:
> WhatsApp memiliki deteksi anti-spam yang ketat. Hindari menggunakan bot ini untuk mengirim pesan massal (spam) atau membalas terlalu banyak pesan grup dalam waktu singkat. Sangat disarankan menggunakan nomor cadangan (SIM Card kedua).

> [!IMPORTANT]
> **Konflik Balasan Ganda (Double Reply)**:
> Pastikan Anda telah menonaktifkan channel WhatsApp di OpenClaw Anda dengan mengatur `"channels.whatsapp.enabled": false` pada berkas [openclaw.json](file:///home/naaklaam/.openclaw/openclaw.json).
