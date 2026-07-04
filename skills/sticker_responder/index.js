import path from 'path';
import fs from 'fs';
import { getRandomStickerByTag } from '../../database_db.js';

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock) {
    const tag = args.tag || 'all';
    console.log(`[Skill: sticker_responder] Memanggil stiker dengan tag: ${tag}`);
    
    // Mengirim ke Grup Manhwa & Grup Punini secara paralel
    const targets = [
        '120363407159758205@g.us', // Grup Manhwa
        '120363322107836319@g.us'  // Grup Punini
    ];

    try {
        const stickerRow = await getRandomStickerByTag(tag);
        
        if (!stickerRow) {
            return `Gagal mengirim stiker: Tidak ada stiker dengan tag "${tag}" terdaftar di database SQLite. Silakan kirim stiker ke bot terlebih dahulu untuk menambahkannya.`;
        }

        const stickerPath = path.join(process.cwd(), 'stiker_db', stickerRow.filename);

        if (!fs.existsSync(stickerPath)) {
            return `Gagal mengirim stiker: Berkas fisik stiker "${stickerRow.filename}" tidak ditemukan di server.`;
        }

        // Kirim berkas .webp fisik ke seluruh grup target
        for (const targetJid of targets) {
            try {
                await sock.sendMessage(targetJid, {
                    sticker: fs.readFileSync(stickerPath)
                });
            } catch (err) {
                console.error(`[Sticker Responder] Gagal kirim stiker ke ${targetJid}:`, err.message);
            }
        }

        return `Sukses mengirimkan stiker "${stickerRow.filename}" (Tag: ${stickerRow.tag}) sebagai respon ke Grup Manhwa & Punini. Total penggunaan saat ini: ${stickerRow.usage_count + 1} kali.`;
    } catch (e) {
        return `Gagal mengeksekusi stiker responder: ${e.message}`;
    }
}
