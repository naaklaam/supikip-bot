# Panduan macOS Dasar & Troubleshooting Software Looping
*Untuk Rijal — disusun oleh Speaki ⚙️*

---

## 1. macOS Dasar — Navigasi & Shortcut Wajib

### Trackpad Gestures
| Gesture | Fungsi |
|---|---|
| Tap 2 jari | Klik kanan (context menu) |
| Swipe 3 jari ke atas | Mission Control (lihat semua window) |
| Swipe 3 jari ke samping | Pindah desktop/space |
| Cub/pinch 4 jari | Launchpad (daftar semua app) |
| Scroll 2 jari | Scroll halaman |

### Keyboard Shortcuts Esensial
- **Cmd + Space** → Buka Spotlight (cari app/file apa pun)
- **Cmd + Tab** → Pindah antar aplikasi
- **Cmd + Q** → Keluar dari aplikasi
- **Cmd + W** → Tutup window aktif
- **Cmd + Shift + 3** → Screenshot layar penuh
- **Cmd + Shift + 4** → Screenshot area tertentu
- **Cmd + Option + Esc** → Force Quit (WAJIB INGAT INI!)
- **Cmd + ,** (koma) → Buka Preferences aplikasi

### Finder (Explorer-nya macOS)
- **Sidebar kiri** → akses cepat ke Documents, Downloads, Desktop
- **Cmd + Shift + H** → Buka folder Home user
- **Cmd + Shift + D** → Desktop
- **Cmd + Shift + G** → "Go to Folder" untuk path manual

### System Settings
- Klik logo Apple (🍎) kiri atas → System Settings
- Atau **Cmd + Space** → ketik "System Settings"

---

## 2. Troubleshooting Software Looping/Crash

Software *looping* = app stuck, not responding, atau crash terus-terusan.

### Metode 1: Force Quit (Paling Cepat)
1. Tekan **Cmd + Option + Esc**
2. Pilih aplikasi yang bermasalah
3. Klik **Force Quit**
4. Buka ulang app seperti biasa

### Metode 2: Activity Monitor (Untuk yang Bandel)
1. Buka **Activity Monitor** (via Spotlight: Cmd+Space, ketik "Activity Monitor")
2. Cari proses aplikasi yang looping
3. Klik tombol **X** (kiri atas toolbar)
4. Pilih **Force Quit** atau **Quit**

### Metode 3: Terminal Kill (Untuk yang Super Bandel)
Buka **Terminal** lalu ketik:
```bash
# Cari PID proses
ps aux | grep -i [nama_app]

# Kill paksa
kill -9 [PID]

# Contoh: kill -9 1234
```

### Metode 4: Reset NVRAM/PRAM + SMC
Lakukan jika Mac terasa *glitchy* atau banyak app crash:
1. Matikan Mac
2. Hidupkan, langsung tekan & tahan **Cmd + Option + P + R** (20 detik)
3. Lepas, biarkan boot normal

### Metode 5: Safe Mode (Diagnostic)
- **Intel Mac**: Tekan **Shift** waktu boot
- **Apple Silicon (M1/M2/M3)**: Matikan → hidupkan tahan tombol power sampai lihat boot options → Shift + Continue
- Safe mode cuma loading extension esensial — kalau app tidak looping di safe mode, berarti ada konflik driver/extension.

### Metode 6: Uninstall & Install Ulang
1. Buka **Finder** → **Applications**
2. Seret app ke **Trash**
3. Kosongkan Trash
4. Restart Mac
5. Download ulang dari App Store atau situs resmi

---

## 3. Tips Preventif
- **Jaga storage**: macOS butuh ~20% ruang kosong biar nggak lemot
- **Restart rutin**: Minimal seminggu sekali
- **Update macOS**: System Settings → General → Software Update
- **Jangan install app dari sembarang sumber**: Prioritaskan App Store atau situs resmi developer
- **Matikan app startup yang nggak perlu**: System Settings → General → Login Items

---

## 4. Kalau Masih Bermasalah — Cek Ini Dulu
1. App versi terbaru? Cek App Store atau situs developer.
2. macOS versi terbaru? System Settings → General → Software Update.
3. RAM cukup? Buka Activity Monitor, tab Memory. Kalau "Memory Pressure" merah, tutup app lain.
4. Hard disk penuh? Cek storage di System Settings → General → Storage.

---

*Simpan panduan ini. Kalau ada masalah spesifik, tanya JO atau Speaki langsung.*