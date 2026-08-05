# Speaki WhatsApp Bot

**Speaki** adalah bot WhatsApp cerdas dan otonom berbasis Node.js (ES Module) yang dibangun menggunakan library [Baileys](file:///c:/Users/naakl/supikip-bot/baileys_documentation.md) dan terintegrasi dengan berbagai model LLM melalui [OpenRouter API](https://openrouter.ai/).

Bot ini dirancang dengan arsitektur terstruktur (`src/`), mendukung **10 Dynamic Skills**, **SQLite FTS5 Long-Term Memory**, **Automated Shinigami Manhwa Scraper**, **Smart Link Unfurler**, **Document Processing**, serta sistem **Security Boundary** & **Atomic State Management**.

---

## Fitur Utama

### 1. Arsitektur LLM & Dynamic Prompting
* **Provider Agnostik**: Mendukung berbagai model LLM (Gemini, Claude, Llama, DeepSeek) melalui OpenRouter.
* **Dynamic System Prompt**: Instruksi dan kepribadian bot digabungkan secara dinamis dari berkas Markdown:
  * [`CORE_IDENTITY.md`](file:///c:/Users/naakl/supikip-bot/CORE_IDENTITY.md): Identitas utama, gaya bahasa, dan aturan operasional.
  * [`AGENTS.md`](file:///c:/Users/naakl/supikip-bot/AGENTS.md): Ringkasan panduan operasional agen.
  * [`MEMORY.md`](file:///c:/Users/naakl/supikip-bot/MEMORY.md): Memori kerja persisten bot.
* **Auto History Cleaning**: Management TTL 18 jam otomatis untuk membersihkan riwayat obrolan *in-memory* yang kedaluwarsa.

### 2. Memori Jangka Panjang SQLite3 FTS5
* **SQLite3 Database (`speaki.db`)**: Menyimpan riwayat pesan obrolan, metadata stiker, dan memori pengguna.
* **Full-Text Search (FTS5)**: Pencarian pencocokan konteks percakapan lama dan memori secara instan berbasis *relevance ranking*.
* **WAL Mode & Busy Timeout**: Konfigurasi `PRAGMA journal_mode = WAL` dan timeout 5000ms untuk transaksi database yang konsisten.

### 3. Sistem Dynamic Skills (`skills/`)
Ekstensi kemampuan bot secara modular di bawah direktori `skills/`. Setiap skill dilengkapi dengan berkas skema deskripsi fungsi (`SKILL.md`) dan modul eksekusi JavaScript (`index.js`).

Terdiri dari **10 Dynamic Skills**:
1. **`bitcoin_market_analyzer`**: Analisis pasar dan indikator teknikal Bitcoin.
2. **`cross_group_forwarder`**: Penerusan pesan atau pengumuman secara lintas grup WhatsApp.
3. **`long_term_memory`**: Pengelolaan penyimpanan dan pencarian memori jangka panjang pengguna di database.
4. **`lyrics_scraper`**: Pencarian dan scraping lirik lagu.
5. **`multi_agent_delegator`**: Delegasi tugas kompleks ke sub-agen LLM terisolasi.
6. **`ocr_extractor`**: Ekstraksi teks dari dokumen gambar (OCR).
7. **`self_learning`**: Penyerapan fakta atau informasi baru secara otomatis ke memori bot.
8. **`serpapi_quota_manager`**: Pemantauan kuota penggunaan API pencarian SerpAPI (`serpapi_quota.json`).
9. **`social_media_downloader`**: Pengunduhan media sosial (TikTok, Instagram, YouTube) dengan penanganan cookie.
10. **`sticker_responder`**: Manajemen dan pencarian stiker WhatsApp otomatis berbasis metadata FTS.

### 4. Shinigami Manhwa Scraper
* Memantau rilisan bab terbaru komik/manhwa di situs Shinigami secara berkala berdasarkan daftar di [`list-manhwa.md`](file:///c:/Users/naakl/supikip-bot/list-manhwa.md).
* Mengirimkan pemberitahuan otomatis ke grup target lengkap dengan gambar sampul / stiker bab terbaru.
* Menggunakan modul atomik ([`atomic_file.js`](file:///c:/Users/naakl/supikip-bot/src/utils/atomic_file.js)) untuk penyimpanan status (`last_manhwa.json`) agar terhindar dari korupsi berkas.

### 5. Smart Document Processor & Link Unfurler
* **Document Processor**: Membaca dan mengekstrak isi berkas dokumen `.txt`, `.pdf` (`pdf-parse`), `.docx` (`mammoth`), dan `.xlsx` (`xlsx`).
* **Smart Link Unfurler**: Memberikan ringkasan otomatis 3 poin utama untuk tautan artikel/berita web yang dikirim ke obrolan.

### 6. Dynamic Cron Scheduler & Heartbeat
* Penjadwalan tugas otomatis menggunakan `node-cron` berbasis berkas konfigurasi [`schedules.json`](file:///c:/Users/naakl/supikip-bot/schedules.json).
* Mendukung *live-reload* jadwal otomatis saat berkas konfigurasi diperbarui tanpa harus menghentikan proses bot.
* Fitur *Heartbeat* ([`heartbeat.js`](file:///c:/Users/naakl/supikip-bot/src/services/heartbeat.js)) untuk pemantauan kesehatan sistem berkala.

### 7. Keamanan & Otentikasi
* **Dual Login Method**: Pilihan otentikasi melalui pemindaian **QR Code** terminal atau **8-Digit Pairing Code** dengan nomor ponsel.
* **Owner Authorization Boundary**: Pembatasan eksekusi fungsi/tool sensitif (seperti `run_terminal_command`, `write_workspace_file`, `apply_patch`, `add_cron_schedule`, dll.) khusus untuk nomor Owner ([`OWNER_NUMBER`](file:///c:/Users/naakl/supikip-bot/tools.js#L40-L50)).
* **Path Traversal Protection**: Validasi direktori aman ([`getSafeWorkspacePath`](file:///c:/Users/naakl/supikip-bot/tools.js#L84-L90)) yang membatasi akses berkas hanya di dalam workspace root.
* **Sequential Message Queue**: Mengantre pesan masuk untuk mencegah *race condition* pada database dan balasan obrolan.

---

## Struktur Repositori

```
supikip-bot/
├── bot-speaki.js                 # Entrypoint utama aplikasi bot
├── tools.js                      # Router eksekusi tool LLM, dynamic skills loader, & security boundary
├── package.json                  # Konfigurasi modul & dependensi proyek
├── schedules.json                # Konfigurasi jadwal cron dinamis
├── list-manhwa.md                # Daftar manhwa yang dipantau oleh Shinigami Scraper
├── CORE_IDENTITY.md              # System prompt & kepribadian utama bot
├── AGENTS.md                     # Petunjuk operasional & referensi agen
├── MEMORY.md                     # Berkas memori persisten kerja bot
├── DAEMON_SETUP.md               # Panduan setup systemd daemon service
├── supikip.service               # Unit file systemd untuk background service (Linux)
│
├── src/                          # Kode sumber modul utama
│   ├── connection/               # Inisialisasi koneksi Baileys & message queue
│   │   └── start_bot.js
│   ├── db/                       # Manajemen database SQLite3 & FTS5 search
│   │   └── index.js
│   ├── handlers/                 # Message routing & integrasi OpenRouter LLM
│   │   ├── llm.js
│   │   └── message_handler.js
│   ├── services/                 # Layanan eksternal (cron, docs, scraper, heartbeat)
│   │   ├── cron_scheduler.js
│   │   ├── document_processor.js
│   │   ├── heartbeat.js
│   │   ├── link_unfurler.js
│   │   ├── model_params.js
│   │   └── shinigami_scraper.js
│   └── utils/                    # Utility pendukung (atomic file, group resolver, LRU cache, loader)
│       ├── atomic_file.js
│       ├── baileys_loader.js
│       ├── group_resolver.js
│       ├── lru_cache.js
│       └── session_helper.js
│
├── skills/                       # 10 Modul Dynamic Skills (SKILL.md + index.js)
│   ├── bitcoin_market_analyzer/
│   ├── cross_group_forwarder/
│   ├── long_term_memory/
│   ├── lyrics_scraper/
│   ├── multi_agent_delegator/
│   ├── ocr_extractor/
│   ├── self_learning/
│   ├── serpapi_quota_manager/
│   ├── social_media_downloader/
│   └── sticker_responder/
│
└── docs/                         # Dokumen Audit & Laporan Arsitektur
    ├── audit-efficiency-speed.md # Audit efisiensi, metrik ukuran repo, & performa I/O
    └── audit-repo-obsidian.md    # Audit arsitektur & keamanan (Risk Register F1-F13)
```

---

## Persyaratan Sistem & Konfigurasi

### Persyaratan
* **Node.js**: Versi `v20.0.0` atau lebih tinggi (kebutuhan wajib Baileys v7 & modul ESM).
* **NPM**: Bawaan dari instalasi Node.js.

### Konfigurasi `.env`
Buat berkas `.env` pada root direktori proyek dengan variabel berikut:

```env
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.0-flash-001

# Identitas & Otorisasi Bot
OWNER_NUMBER=628xxxxxxxxxx
BOT_NUMBER=628xxxxxxxxxx

# Target Grup WhatsApp (Pisahkan dengan koma)
TARGET_GROUPS=1203xxxxxx@g.us
SHARED_SESSION_GROUPS=1203xxxxxx@g.us,1203yyyyyy@g.us

# SerpAPI Key (Opsional untuk web search)
SERPAPI_API_KEY=your_serpapi_key_here
```

---

## Cara Menjalankan

### 1. Instalasi Dependensi
Jalankan perintah berikut untuk menginstal pustaka yang diperlukan:
```bash
npm install --legacy-peer-deps
```

### 2. Menjalankan Bot
Jalankan aplikasi bot dengan perintah:
```bash
node bot-speaki.js
```

### 3. Otentikasi WhatsApp
* **Metode QR Code**: Pindai QR Code di terminal menggunakan fitur **Perangkat Tertaut (Linked Devices)** pada aplikasi WhatsApp ponsel Anda.
* **Metode Pairing Code**: Jika `BOT_NUMBER` atau `OWNER_NUMBER` diatur pada `.env`, bot akan menampilkan Kode Pairing (8 digit) untuk ditautkan via nomor telepon.

---

## Pengaturan Service Daemon (Linux Systemd)

Untuk menjalankan bot sebagai *background service* yang berjalan secara konstan:

1. Salin unit file [`supikip.service`](file:///c:/Users/naakl/supikip-bot/supikip.service) ke direktori systemd:
   ```bash
   sudo cp supikip.service /etc/systemd/system/speaki-bot.service
   ```
2. Muat ulang daemon systemd dan aktifkan service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable speaki-bot
   sudo systemctl start speaki-bot
   ```
3. Periksa status operasional bot:
   ```bash
   sudo systemctl status speaki-bot
   ```

*(Panduan lengkap penyiapan daemon dapat dipelajari pada [`DAEMON_SETUP.md`](file:///c:/Users/naakl/supikip-bot/DAEMON_SETUP.md)).*

---

## Dokumentasi Audit & Keamanan

Laporan audit lengkap serta rekomendasi arsitektur dapat diakses melalui:
* [`docs/audit-efficiency-speed.md`](file:///c:/Users/naakl/supikip-bot/docs/audit-efficiency-speed.md): Evaluasi performa, ukuran memori, async patterns, dan timeout network calls.
* [`docs/audit-repo-obsidian.md`](file:///c:/Users/naakl/supikip-bot/docs/audit-repo-obsidian.md): Peta arsitektur, daftar risiko (Risk Register F1-F13), dan mitigasi keamanan.
