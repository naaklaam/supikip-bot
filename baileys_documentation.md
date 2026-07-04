# Dokumentasi Direktori Baileys (`@itsliaaa/baileys`)

Dokumen ini menjelaskan struktur direktori, arsitektur modul, komponen utama, serta panduan penggunaan dasar dari pustaka **Baileys** yang berada di dalam folder [baileys](file:///home/naaklaam/agy-envi/baileys) di workspace ini.

Pustaka yang digunakan di sini adalah **`@itsliaaa/baileys` (v0.3.18-final)**, yang merupakan versi *fork* yang ditingkatkan dari pustaka Baileys asli (WhiskeySockets/Baileys). Versi ini dirancang untuk penggunaan produksi dengan fokus pada keamanan, perbaikan unggahan media newsletter, serta dukungan untuk pesan interaktif, album, dan tipe pesan baru lainnya tanpa adanya kode yang ter-obfuscation.

---

## 📂 Struktur Direktori Baileys

Berikut adalah pohon direktori utama dari pustaka Baileys beserta penjelasan singkat mengenai fungsi masing-masing komponen:

```
baileys/
├── .github/                   # Konfigurasi GitHub Actions & template isu
├── LICENSE                    # Berkas lisensi perangkat lunak (MIT)
├── package.json               # Konfigurasi npm, dependensi, dan skrip pembangunan
├── README.md                  # Dokumentasi resmi dari pembuat fork (@itsliaaa)
├── engine-requirements.js     # Skrip validasi versi Node.js (minimal v20.0.0)
│
├── WAProto/                   # Skema Protobuf Protokol WhatsApp
│   ├── index.js               # Berkas kompilasi Javascript dari skema protobuf (5.3 MB)
│   └── index.d.ts             # Definisi tipe TypeScript untuk protobuf (901 KB)
│
└── lib/                       # Berkas Hasil Kompilasi JavaScript & TypeScript
    ├── index.js               # Entry point utama modul Baileys
    ├── index.d.ts             # Definisi tipe TypeScript utama modul
    │
    ├── Defaults/              # Konfigurasi & konstanta bawaan (koneksi, media, header)
    │
    ├── Signal/                # Operasi kriptografi yang berkaitan dengan Signal Protocol
    │
    ├── Socket/                # Pengelola soket koneksi dan API WhatsApp
    │   ├── Client/            # Implementasi wrapper WebSocket klien tingkat rendah
    │   ├── socket.js          # Kelas dasar WebSocket dan konfigurasi koneksi utama
    │   ├── messages-recv.js   # Pemrosesan dan dekripsi pesan masuk
    │   ├── messages-send.js   # Penyusunan dan pengiriman berbagai jenis pesan
    │   ├── groups.js          # Pengelola grup (anggota, izin, metadata)
    │   ├── chats.js           # Pengelola riwayat chat, status kehadiran, dll.
    │   ├── communities.js     # Fitur komunitas WhatsApp
    │   ├── newsletter.js      # Pengelola saluran/newsletter WhatsApp
    │   └── business.js        # Fitur bisnis (katalog, pesanan, profil bisnis)
    │
    ├── Store/                 # Penyimpanan memori untuk caching data
    │   ├── make-in-memory-store.js    # Implementasi penyimpanan data chat & kontak di RAM
    │   └── object-repository.js       # Repositori objek dasar
    │
    ├── Types/                 # Definisi tipe dan antarmuka TypeScript internal
    │
    ├── Utils/                 # Fungsi pembantu dan utilitas (kunci enkripsi, media, dll.)
    │   ├── auth-utils.js              # Utilitas autentikasi berkas/database
    │   ├── use-multi-file-auth-state.js # Strategi autentikasi multi-file bawaan
    │   ├── use-sqlite-auth-state.js   # Strategi autentikasi menggunakan database SQLite
    │   ├── messages.js                # Helper pembentukan struktur pesan
    │   ├── messages-media.js          # Unduh/Unggah media dan konversi format
    │   ├── crypto.js                  # Algoritma kriptografi simetris & asimetris
    │   ├── event-buffer.js            # Buffer event untuk efisiensi pemrosesan data
    │   └── rich-message-utils.js      # Utilitas pembuatan pesan interaktif & kaya fitur
    │
    ├── WABinary/              # Coder/Decoder protokol biner kustom WhatsApp
    │   ├── decode.js / encode.js      # Konversi XML biner WhatsApp ke Objek JavaScript
    │   └── jid-utils.js               # Utilitas parsing JID (WhatsApp ID)
    │
    ├── WAM/                   # Telemetri dan metrik kinerja WhatsApp
    └── WAUSync/               # Sinkronisasi data pengguna (kontak, status, dll.)
```

---

## 🛠️ Analisis Komponen Utama

### 1. Sistem Autentikasi (`lib/Utils/`)
Baileys mendukung beberapa strategi penyimpanan sesi (kredensial login):
*   **Multi File Auth State** (`use-multi-file-auth-state.js`): Menyimpan data sesi di folder lokal dalam bentuk berkas-berkas JSON terpisah (seperti kunci enkripsi, token pra-kunci, dan kredensial utama). Ini adalah cara default yang sangat direkomendasikan untuk menghindari korupsi berkas tunggal yang besar.
*   **SQLite Auth State** (`use-sqlite-auth-state.js`): Menggunakan SQLite untuk menyimpan kredensial sesi. Cocok untuk lingkungan produksi yang membutuhkan efisiensi I/O tinggi.

### 2. Pengelola Koneksi & Soket (`lib/Socket/`)
*   **`socket.js`**: Mengelola siklus hidup WebSocket, mulai dari pembuatan koneksi baru, pengiriman detak jantung (*keep-alive ping*), penanganan pemutusan koneksi (*reconnection*), hingga pertukaran kunci Noise Protocol saat jabat tangan (*handshake*) awal.
*   **`messages-send.js`**: Menyediakan fungsi pembungkus tingkat tinggi seperti `sendMessage` untuk mempermudah developer mengirimkan teks biasa, media, lokasi, reaksi, polling, hingga pesan interaktif yang rumit tanpa perlu menyusun struktur protobuf secara manual.
*   **`messages-recv.js`**: Bertugas menangani node biner yang dikirimkan oleh server WhatsApp, mendekripsi muatan (*payload*) menggunakan kunci sesi saat ini, kemudian menerjemahkannya ke dalam event JavaScript seperti `messages.upsert` or `messages.update`.

### 3. Protokol Protokol Biner & Protobuf (`WAProto/` dan `lib/WABinary/`)
WhatsApp Web tidak menggunakan JSON biasa untuk berkomunikasi dengan server. Sebagai gantinya, WhatsApp menggunakan:
1.  **Protobuf (Protocol Buffers)**: Untuk serialisasi data pesan yang dikirim dan diterima (`WAProto/index.js`).
2.  **WABinary (WhatsApp Binary XML)**: Protokol biner berpemilik WhatsApp yang membungkus node XML untuk efisiensi bandwidth. Folder `WABinary/` bertugas mengubah byte-array biner ini menjadi objek JSON/XML biasa agar bisa dibaca oleh aplikasi Node.js.

### 4. In-Memory Store (`lib/Store/`)
*   Fungsi `makeInMemoryStore` bertindak sebagai database lokal sementara di RAM yang secara dinamis memperbarui daftar kontak, obrolan, status kehadiran, dan riwayat pesan berdasarkan event yang diterima dari WebSocket.
*   Penyimpanan ini dapat dengan mudah diserialisasikan ke berkas JSON dengan metode `.writeToFile()` dan dimuat kembali saat aplikasi dihidupkan dengan `.readFromFile()`.

---

## ✨ Keunggulan Fork `@itsliaaa/baileys`

Dibandingkan dengan repositori hulu (*upstream*) WhiskeySockets/Baileys, fork ini memiliki beberapa modifikasi penting:

1.  **Perbaikan Unggahan Media Newsletter**: Menyelesaikan masalah gagalnya pengiriman media ke saluran/newsletter WhatsApp.
2.  **Dukungan Pesan Album**: Pengiriman pesan album (gabungan gambar dan video) secara native.
3.  **Pesan Interaktif yang Ditingkatkan**: Dukungan untuk tombol interaktif (*interactive buttons*), daftar pilihan (*lists*), templat terhidrasi (*hydrated templates*), dan carousel.
4.  **Fitur Pesan Kaya (Rich Message)**: Integrasi teks bergaya blok kode (*code blocks*), entitas inline (*inline entities*), tabel (*tables*), dan spoiler.
5.  **Tanpa Obfuscation**: Seluruh kode sumber bersih dari pembungkusan kode atau kompilasi tersembunyi, sehingga aman untuk diaudit.
6.  **Keamanan Newsletter**: Tidak ada perilaku bawaan untuk otomatis mengikuti saluran tertentu dari pembuat kode library (*anti-auto-follow newsletter*).

---

## 🚀 Panduan Penggunaan Dasar

Berikut adalah contoh implementasi sederhana menggunakan ESM (ECMAScript Modules) untuk menghubungkan akun WhatsApp menggunakan pustaka ini:

### 1. Inisialisasi Koneksi
Buat berkas, misalnya `index.js`, dan jalankan kode berikut:

```javascript
import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason 
} from './baileys/lib/index.js'; // Mengimpor langsung dari direktori lokal
import { Boom } from '@hapi/boom';
import pino from 'pino';

async function hubungkanKeWhatsApp() {
    // 1. Siapkan penyimpanan sesi di folder 'auth_info'
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // 2. Inisialisasi logger pino bawaan
    const logger = pino({ level: 'info' });

    // 3. Konfigurasi soket WhatsApp
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Tampilkan QR Code di terminal
        logger: logger
    });

    // 4. Dengarkan pembaruan kredensial dan simpan secara otomatis
    sock.ev.on('creds.update', saveCreds);

    // 5. Dengarkan status koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            // Evaluasi alasan terputus
            const statuscode = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode 
                : null;
            
            console.log(`Koneksi terputus: ${lastDisconnect?.error?.message}`);

            if (statuscode !== DisconnectReason.loggedOut) {
                console.log('Menghubungkan ulang...');
                hubungkanKeWhatsApp();
            } else {
                console.log('Sesi telah keluar. Hapus folder auth_info dan scan ulang.');
            }
        } else if (connection === 'open') {
            console.log('Koneksi berhasil terhubung ke WhatsApp!');
        }
    });

    // 6. Dengarkan pesan baru masuk
    sock.ev.on('messages.upsert', async (m) => {
        console.log('Menerima pesan baru:', JSON.stringify(m, null, 2));

        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            const jid = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            // Membalas pesan teks sederhana jika menerima pesan "ping"
            if (text && text.toLowerCase() === 'ping') {
                await sock.sendMessage(jid, { text: 'pong!' });
            }
        }
    });
}

// Jalankan fungsi koneksi
hubungkanKeWhatsApp();
```

### 2. Mengirim Berbagai Jenis Pesan

Setelah koneksi terjalin (`sock` siap digunakan), Anda dapat mengirim berbagai tipe pesan dengan mudah:

*   **Mengirim Teks dengan Mention All (Fitur Khusus Fork)**:
    ```javascript
    await sock.sendMessage(jid, { 
        text: 'Halo semuanya! @everyone', 
        mentionAll: true // Menyebut semua anggota grup tanpa menulis daftar JID secara manual
    });
    ```

*   **Mengirim Media (Gambar/Video) dengan Deskripsi**:
    ```javascript
    await sock.sendMessage(jid, { 
        image: { url: 'https://placekitten.com/500/500' }, 
        caption: 'Ini kucing lucu!' 
    });
    ```

*   **Mengirim Tombol Interaktif**:
    ```javascript
    await sock.sendMessage(jid, {
        text: "Pilih opsi di bawah ini:",
        buttons: [
            { buttonId: 'opsi_1', buttonText: { displayText: 'Opsi 1' }, type: 1 },
            { buttonId: 'opsi_2', buttonText: { displayText: 'Opsi 2' }, type: 1 }
        ],
        headerType: 1
    });
    ```

---

> [!TIP]
> **Catatan Pengembangan**:
> Jika Anda menghadapi masalah kompilasi TypeScript atau kesalahan dependensi seperti `@napi-rs/image`, pastikan Anda menginstal pustaka opsional yang sesuai dengan OS yang Anda gunakan (`better-sqlite3`, `sharp`, `link-preview-js`) dengan mereferensikan bagian `peerDependencies` dalam file [package.json](file:///home/naaklaam/agy-envi/baileys/package.json).
