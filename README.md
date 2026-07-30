# Panduan Bot WhatsApp Speaki Standalone

Panduan ini menjelaskan cara menyiapkan, mengonfigurasi, dan menjalankan bot WhatsApp Speaki secara mandiri. Bot ini berjalan menggunakan pustaka Baileys secara langsung, tanpa ketergantungan penuh pada framework OpenClaw.

---

## Persyaratan Sistem

* **Node.js**: Versi `20.0.0` atau yang lebih tinggi (Kebutuhan wajib Baileys v7).
* **NPM**: Bawaan dari instalasi Node.js.

---

## Struktur Repositori

Kode bot diatur secara modular di bawah direktori `src/` untuk menangani siklus hidup koneksi Baileys (`src/connection`), penanganan logika LLM dan pesan (`src/handlers`), serta layanan berkala seperti cron dan scraping (`src/services`).

Kepribadian dan perilaku bot dikonfigurasi melalui berkas markdown terstruktur di bawah root direktori (seperti `CORE_IDENTITY.md`, `AGENTS.md`, `MEMORY.md`, dan `TOOLS.md`) yang digabungkan secara dinamis sebagai instruksi sistem untuk LLM.

---

## Setup dan Cara Menjalankan

### Langkah 1: Instalasi Dependensi
Jalankan perintah berikut untuk menginstal pustaka yang dibutuhkan:
```bash
cd /path/to/project/Supikip
npm install --legacy-peer-deps
```

### Langkah 2: Konfigurasi API
Buka berkas `.env` dan konfigurasikan API Key OpenRouter serta URL/Koneksi OOMOL OpenConnector jika diperlukan.

### Langkah 3: Jalankan Aplikasi
Jalankan bot dengan perintah:
```bash
node bot-speaki.js
```

### Langkah 4: Hubungkan ke WhatsApp
Pindai (scan) QR Code yang muncul di terminal menggunakan fitur **Perangkat Tertaut** pada aplikasi WhatsApp di ponsel Anda.

---

## Fitur Utama

### 1. Integrasi OOMOL OpenConnector
Bot terhubung dengan daemon OpenConnector lokal untuk mendelegasikan integrasi layanan pihak ketiga tanpa perlu menyimpan kredensial mentah di berkas konfigurasi bot:
* **Gmail:** Membaca, merangkum, mengarsipkan, atau menghapus email masuk.
* **Google Drive:** Mencari file, membaca properti berkas, dan mengunduh berkas teks.
* **Google Sheets:** Menulis baris data baru (append) atau membaca/memperbarui sel tertentu.
* **OpenRouter Tracker:** Memantau sisa limit kredit dan status kunci API OpenRouter aktif.

### 2. Memori Jangka Panjang SQLite FTS5
Menggunakan SQLite dengan pencarian teks penuh (FTS5) untuk menyimpan dan mencari riwayat obrolan masa lalu secara instan. Sistem secara otomatis menyisipkan memori yang relevan ke dalam prompt LLM secara hemat token.

### 3. Pembedah Link (Smart Link Unfurler)
Mendeteksi tautan berita atau artikel yang dikirim di obrolan dan memberikan ringkasan instan berisi 3 poin utama dalam Bahasa Indonesia.

### 4. Pengolah Dokumen (Document Processor)
Mampu memproses berbagai dokumen yang dikirim oleh pengguna (seperti `.txt`, `.pdf`, `.docx`, `.xlsx`) untuk dibaca kontennya oleh LLM atau dijadikan basis referensi.

### 5. Pemantau Manhwa (Shinigami Scraper)
Memantau pembaruan judul manhwa di situs Shinigami secara berkala dan mengirimkan pemberitahuannya ke grup target lengkap dengan stiker sampul otomatis.

### 6. Sinkronisasi Chat Lintas Grup (Shared Session)
Menghubungkan konteks obrolan beberapa grup yang ditentukan di `.env` agar berbagi memori obrolan yang sama, dengan penandaan asal grup yang jelas pada LLM.

---

## Sistem Dynamic Skills

Kemampuan bot dapat diperluas secara dinamis dengan membuat modul folder baru di bawah direktori `skills/`. Setiap folder wajib berisi:
1. `SKILL.md`: Skema deskripsi parameter fungsi dalam format JSON.
2. `index.js`: Fungsi eksekusi Javascript (ES module) yang dipanggil saat LLM memicu tool bersangkutan.

---

## Keamanan dan Isu Umum

* **Risiko Pemblokiran:** WhatsApp mendeteksi aktivitas bot secara ketat. Hindari aktivitas spam atau membalas pesan dalam volume besar sekaligus. Disarankan menggunakan nomor cadangan.
* **Konflik Balasan (OpenClaw):** Jika Anda menggunakan framework OpenClaw, pastikan channel WhatsApp bawaan di nonaktifkan (`"channels.whatsapp.enabled": false` di `openclaw.json`) agar tidak terjadi balasan ganda.
