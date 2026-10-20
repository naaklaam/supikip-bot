# Laporan Evaluasi Sistem & Rencana Maintenance Bot Speaki

> **Tanggal Evaluasi:** 20 Oktober 2026  
> **Status Operasional:** Ditangguhkan Sementara (Hold / Standby)  
> **Catatan Finansial/API:** Sisa saldo OpenRouter API < $1. Maintenance aktif & re-pairing ditunda hingga top-up berikutnya.  
> **Host Environment:** Arch Linux (`naaklaam`), Node.js v24+, Systemd Service `supikip.service`

---

## 1. Ringkasan Status & Kesehatan Sistem

| Komponen | Status | Catatan Temuan |
|---|---|---|
| **WhatsApp WebSocket & Auth** | 🔴 **CRITICAL** | Terjebak reconnect loop (`Connection Failure 405 Method Not Allowed`). Sesi login `sesi_speaki/creds.json` kedaluwarsa/dicabut (`registered: false`). |
| **OpenRouter API Key** | 🟢 **ACTIVE** | Kunci API valid (`HTTP 200`), namun kuota credit menipis (< $1). |
| **Database SQLite (`speaki.db`)** | 🟢 **HEALTHY** | WAL mode aktif, `PRAGMA integrity_check` = OK, 19.670 pesan terekam aman tanpa korupsi data. |
| **Manhwa Cover Sticker Generator** | 🟡 **DEGRADED** | Log error `/bin/sh: cwebp: command not found`. ImageMagick & library `sharp` sudah terpasang, namun script scraper masih hardcode ke binary `cwebp`. |
| **Auth Session Directory** | 🟡 **BLOATED** | Folder `sesi_speaki` menampung 1.468 file session cache usang. |
| **Dependencies Security** | 🟡 **WARNING** | Terdapat 8 temuan vulnerability di npm packages (`@xmldom`, `sharp`, `undici`, dll). |

---

## 2. Rincian Masalah & Akar Penyebab

### A. WhatsApp Session Disconnect (Error 405) & Reconnect Loop
* **Gejala:** Service `supikip.service` mencoba reconnect setiap 2 detik secara agresif ke WebSocket Baileys:
  ```text
  Koneksi ditutup karena: Connection Failure. Menghubungkan kembali: true
  Error: Connection Failure (statusCode: 405 Method Not Allowed, reason: "405", location: "odn")
  ```
* **Akar Masalah:**
  1. WhatsApp secara berkala mencabut session key web multi-device lama.
  2. File `sesi_speaki/creds.json` mencatat status `registered: false`.
  3. Pada `src/connection/start_bot.js`, penanganan reconnect hanya memeriksa `statusCode !== DisconnectReason.loggedOut` (code 401). Error status `405` tidak dianggap terminal disconnect, sehingga aplikasi terus melakukan loop reconnect tanpa henti.

### B. Dependensi Missing Binary pada Cover Sticker Manhwa
* **Gejala:** Muncul error pada log scraper Shinigami:
  ```text
  [Manga Sticker Helper] Gagal memproses stiker untuk "...": /bin/sh: baris 1: cwebp: command not found
  ```
* **Akar Masalah:**
  Pada `src/services/shinigami_scraper.js` baris 235-238, konversi gambar PNG ke WebP memanggil binary shell `cwebp`. Binary ini belum terpasang di sistem Arch Linux pengguna, padahal library `sharp` dan ImageMagick (`/usr/bin/magick`) sudah tersedia secara native.

### C. Penumpukan File Sesi Baileys
* Folder `sesi_speaki` memiliki 1.468 file yang mayoritas merupakan kunci enkripsi lama dan session app state usang. Ini membebani performa I/O saat proses autentikasi awal.

---

## 3. Panduan Checklist Maintenance (Jalankan Saat Saldo OpenRouter Sudah Siap)

Ketika sudah siap mengaktifkan kembali bot setelah top-up saldo OpenRouter, ikuti panduan berikut:

### Langkah 1: Perbaikan Kode Reconnect & Stiker
1. **Handle Disconnect 405 di `src/connection/start_bot.js`:**
   Perbarui pengecekan disconnect agar jika mendapati code `405` atau `401`, proses tidak melakukan reconnect spamming, melainkan meminta QR / Pairing Code baru.
2. **Migrasi Konversi Stiker ke `sharp` di `src/services/shinigami_scraper.js`:**
   Ganti eksekusi shell `cwebp` dengan buffer pipe `sharp(tempPng).webp({ quality: 75 }).toFile(finalPath)` agar tidak bergantung pada binary CLI eksternal.

### Langkah 2: Reset Sesi & Pairing Ulang WhatsApp
1. Hentikan service bot sementara:
   ```bash
   sudo systemctl stop supikip.service
   ```
2. Backup dan bersihkan folder sesi:
   ```bash
   tar -czf sesi_speaki_backup_$(date +%F).tar.gz sesi_speaki/
   rm -rf sesi_speaki/*
   ```
3. Jalankan bot secara interaktif untuk scan QR atau pairing code (8 digit):
   ```bash
   node bot-speaki.js
   ```
4. Setelah muncul log `Speaki Bot telah sukses terhubung ke WhatsApp! 🎉`, matikan process interaktif (`Ctrl + C`) dan nyalakan kembali systemd service:
   ```bash
   sudo systemctl start supikip.service
   sudo systemctl status supikip.service
   ```

---
*Dokumen ini dibuat secara otomatis sebagai panduan pemeliharaan sistem di masa mendatang.*
