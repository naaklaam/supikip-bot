# 🛠️ Panduan Konfigurasi Service Daemon (systemd) untuk Bot Speaki

Panduan ini mendokumentasikan cara menjadikan bot WhatsApp Speaki sebagai **service daemon** menggunakan **systemd** di Linux. Dengan ini, bot akan berjalan otomatis di latar belakang (*background*), otomatis menyala kembali jika PC/Server restart, dan otomatis hidup kembali jika terjadi crash.

---

## ⚠️ CATATAN PENTING SEBELUM MEMULAI
> [!IMPORTANT]
> **Lakukan Scan QR Terlebih Dahulu!**
> Sebelum menjalankan bot sebagai daemon di latar belakang, Anda **harus** menjalankan bot secara interaktif sekali saja menggunakan perintah `node bot-speaki.js` dan memindai QR Code-nya. 
> Ini diperlukan agar folder kredensial `sesi_speaki/` terbentuk. Jika Anda langsung menjalankannya sebagai daemon tanpa scan terlebih dahulu, bot tidak akan bisa login karena QR Code tercetak di log latar belakang.

---

## 1. Draf Berkas Service (`speaki-bot.service`)

Gunakan draf konfigurasi di bawah ini. Anda perlu mengganti path Node.js sesuai dengan hasil perintah `which node` di sistem Anda.

### Draf Berkas Konfigurasi:
```ini
[Unit]
Description=Speaki WhatsApp Bot Standalone Service
After=network.target

[Service]
Type=simple
User=naaklaam
WorkingDirectory=/home/naaklaam/Supikip
# Path executable node harus absolut. Contoh di bawah menggunakan path default.
# Jika menggunakan nvm/fnm, gunakan hasil perintah 'which node' (misal: /home/naaklaam/.nvm/...)
ExecStart=/usr/bin/node bot-speaki.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## 2. Cara Mengetahui Path Node.js Anda

Karena systemd membutuhkan path absolut yang tepat untuk file executable Node, jalankan perintah ini di terminal Anda untuk mengetahui lokasi Node.js Anda:
```bash
which node
```
*Jika outputnya adalah `/usr/bin/node`, gunakan nilai tersebut pada kolom `ExecStart=` di atas.*
*Jika outputnya berada di folder `.nvm` (contoh: `/home/naaklaam/.nvm/versions/node/v26.3.0/bin/node`), pastikan Anda menyalin seluruh path tersebut ke `ExecStart=`.*

---

## 3. Langkah-Langkah Pemasangan Daemon

Ikuti perintah terminal berikut untuk mendaftarkan dan menjalankan service:

### Langkah 1: Buat Berkas Service di Direktori Systemd
Buat berkas konfigurasi baru di folder systemd menggunakan editor pilihan Anda (misal `nano` atau `sudo` write):
```bash
sudo nano /etc/systemd/system/speaki-bot.service
```
*(Salin dan tempel draf konfigurasi dari bagian **1** di atas, lalu simpan).*

### Langkah 2: Reload Daemon Systemd
Beritahu systemd bahwa ada berkas konfigurasi baru:
```bash
sudo systemctl daemon-reload
```

### Langkah 3: Jalankan Service Bot
Aktifkan bot untuk berjalan sekarang di latar belakang:
```bash
sudo systemctl start speaki-bot.service
```

### Langkah 4: Aktifkan Auto-Start saat Booting
Atur agar bot otomatis menyala saat komputer atau server dihidupkan:
```bash
sudo systemctl enable speaki-bot.service
```

---

## 4. Perintah Manajemen Service

Berikut adalah kumpulan perintah untuk mengelola daemon bot Speaki:

* **Melihat Status Service** (Apakah aktif atau error):
  ```bash
  sudo systemctl status speaki-bot.service
  ```
* **Melihat Log Real-time** (Melihat pesan masuk/keluar):
  ```bash
  journalctl -u speaki-bot.service -f
  ```
* **Menghentikan Bot**:
  ```bash
  sudo systemctl stop speaki-bot.service
  ```
* **Memulai Ulang Bot** (Lakukan ini jika Anda mengedit file `bot-speaki.js` atau `.env`):
  ```bash
  sudo systemctl restart speaki-bot.service
  ```
