import {
  listDriveFiles,
  getDriveFileMetadata,
  readDriveFileContent
} from '../../src/services/googledrive_service.js';

/**
 * Skill Google Drive Manager untuk Supikip
 * Mengeksekusi instruksi pencarian dan pembacaan berkas Google Drive milik Owner/JO secara interaktif.
 */
export async function execute(args, sock, extraContext = {}) {
  const { msg } = extraContext;

  // 1. Validasi Keamanan: Hanya Owner/JO yang diizinkan mengakses Google Drive
  if (!msg) {
    return 'Gagal: Konteks pesan tidak ditemukan untuk memvalidasi identitas pengirim.';
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0];
  const ownerNumber = process.env.OWNER_NUMBER;
  const isOwner = (senderNumber === ownerNumber) || (msg.pushName === 'JO');

  if (!isOwner) {
    console.warn(`[Google Drive Skill] Akses ditolak untuk JID: ${senderJid} (bukan owner).`);
    return 'Gagal: Akses ditolak. Hanya Owner (JO) yang diperbolehkan untuk mengakses Google Drive bot.';
  }

  // Deteksi tool name dari dynamic loader
  const toolName = extraContext.toolName || args._toolName;

  try {
    // A. LIST FILES
    if (toolName === 'googledrive_list_files' || args.query !== undefined || args.limit !== undefined) {
      const query = args.query || '';
      const limit = Math.min(args.limit || 10, 50);

      console.log(`[Google Drive Skill] Mendaftar berkas dengan query: "${query}", limit: ${limit}`);
      const files = await listDriveFiles(query, limit);

      if (files.length === 0) {
        return `Tidak ditemukan berkas di Google Drive yang cocok dengan kueri pencarian "${query}".`;
      }

      let responseText = `📂 *[DAFTAR BERKAS GOOGLE DRIVE]*\n\n`;
      files.forEach((file, i) => {
        const sizeStr = file.sizeBytes ? ` (${(file.sizeBytes / 1024).toFixed(1)} KB)` : '';
        responseText += `${i + 1}. *Nama:* ${file.name}\n`;
        responseText += `   *Tipe:* ${file.mimeType}\n`;
        if (sizeStr) responseText += `   *Ukuran:* ${sizeStr}\n`;
        responseText += `   *ID Berkas:* \`${file.id}\`\n\n`;
      });
      responseText += `*Tips:* Anda bisa meminta saya membaca isi file teks atau melihat detail file menggunakan ID Berkas di atas.`;
      return responseText;
    }

    // B. GET FILE METADATA
    if (toolName === 'googledrive_get_file_metadata' || args.file_id) {
      const fileId = args.file_id;
      if (!fileId) return 'Gagal: ID Berkas (file_id) wajib diisi untuk melihat metadata file.';

      console.log(`[Google Drive Skill] Mengambil metadata file ID: ${fileId}`);
      const metadata = await getDriveFileMetadata(fileId);

      let responseText = `📝 *[METADATA BERKAS DRIVE]*\n`;
      responseText += `-------------------------------------------\n`;
      responseText += `*Nama:* ${metadata.name}\n`;
      responseText += `*Tipe MIME:* ${metadata.mimeType}\n`;
      responseText += `*ID Berkas:* \`${metadata.id}\`\n`;
      if (metadata.sizeBytes) {
        responseText += `*Ukuran:* ${(metadata.sizeBytes / 1024).toFixed(1)} KB\n`;
      }
      if (metadata.createdTime) responseText += `*Dibuat:* ${new Date(metadata.createdTime).toLocaleString('id-ID')}\n`;
      if (metadata.modifiedTime) responseText += `*Diubah:* ${new Date(metadata.modifiedTime).toLocaleString('id-ID')}\n`;
      if (metadata.webViewLink) responseText += `*Tautan Web:* ${metadata.webViewLink}\n`;
      responseText += `-------------------------------------------\n`;
      return responseText;
    }

    // C. READ FILE CONTENT
    if (toolName === 'googledrive_read_file_content') {
      const fileId = args.file_id;
      if (!fileId) return 'Gagal: ID Berkas (file_id) wajib diisi untuk membaca konten file.';

      console.log(`[Google Drive Skill] Membaca isi konten file ID: ${fileId}`);
      const content = await readDriveFileContent(fileId);

      if (typeof content !== 'string') {
        return `Gagal: Konten berkas bukan bertipe teks (MIME type tidak didukung atau berupa data biner).`;
      }

      let displayContent = content;
      // Potong konten jika terlalu panjang untuk LLM
      if (displayContent.length > 2000) {
        displayContent = displayContent.slice(0, 2000) + '\n... (Konten dipotong karena terlalu panjang) ...';
      }

      let responseText = `📄 *[ISI BERKAS DRIVE - ${fileId}]*\n`;
      responseText += `-------------------------------------------\n\n`;
      responseText += `${displayContent}\n`;
      return responseText;
    }

    return 'Gagal: Nama tool Google Drive tidak dikenali oleh skill handler.';
  } catch (err) {
    console.error('[Google Drive Skill] Eror selama eksekusi:', err.message);
    return `Gagal: Terjadi eror saat mengakses Google Drive API (${err.message}).`;
  }
}
