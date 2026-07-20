import path from 'path';
import fs from 'fs';
import { getRandomStickerByTag } from '../../database_db.js';

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock, extraContext = {}) {
    const tag = args.tag || 'all';
    const { jid } = extraContext;
    console.log(`[Skill: sticker_responder] Memanggil stiker dengan tag: ${tag}`);
    
    // Tentukan grup target secara dinamis dari konteks atau env TARGET_GROUPS
    let targets = jid ? [jid] : [];
    if (targets.length === 0 && process.env.TARGET_GROUPS) {
        targets = process.env.TARGET_GROUPS.split(',').map(s => s.trim()).filter(Boolean);
    }

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

        return `Sukses mengirimkan stiker "${stickerRow.filename}" (Tag: ${stickerRow.tag}) sebagai respon. Total penggunaan saat ini: ${stickerRow.usage_count + 1} kali.`;
    } catch (e) {
        return `Gagal mengeksekusi stiker responder: ${e.message}`;
    }
}
