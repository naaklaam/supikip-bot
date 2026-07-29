import {
  listGmailMessages,
  getGmailMessageDetails,
  modifyGmailLabels,
  trashGmailMessage
} from '../../src/services/gmail_service.js';

/**
 * Skill Gmail Manager untuk Supikip
 * Mengeksekusi instruksi pengelolaan kotak masuk Gmail milik Owner/JO secara interaktif.
 */
export async function execute(args, sock, extraContext = {}) {
  const { msg } = extraContext;

  // 1. Validasi Keamanan: Hanya Owner/JO yang diizinkan mengakses Gmail
  if (!msg) {
    return 'Gagal: Konteks pesan tidak ditemukan untuk memvalidasi identitas pengirim.';
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0];
  const ownerNumber = process.env.OWNER_NUMBER;
  const isOwner = (senderNumber === ownerNumber) || (msg.pushName === 'JO');

  if (!isOwner) {
    console.warn(`[Gmail Skill] Akses ditolak untuk JID: ${senderJid} (bukan owner).`);
    return 'Gagal: Akses ditolak. Hanya Owner (JO) yang diperbolehkan untuk mengelola akun Gmail bot.';
  }

  // Cari tahu tool apa yang dipanggil dari system dynamic loading
  // Dynamic skill resolver memetakan function call ke parameter args
  const toolName = extraContext.toolName || args._toolName; 
  // Catatan: Jika dynamic runner tidak menempelkan toolName secara otomatis, kita deteksi dari struktur parameter.

  try {
    // A. LIST EMAILS
    if (toolName === 'gmail_list_emails' || args.max_results !== undefined || args.query !== undefined) {
      const query = args.query || 'is:inbox';
      const maxResults = Math.min(args.max_results || 5, 10);

      console.log(`[Gmail Skill] Membaca email inbox dengan query: "${query}", max: ${maxResults}`);
      const messages = await listGmailMessages(query, maxResults);

      if (messages.length === 0) {
        return `Tidak ditemukan email di inbox yang cocok dengan kueri pencarian "${query}".`;
      }

      // Ambil detail ringkas (sender, subjek, tanggal) secara paralel untuk efisiensi
      const detailedList = await Promise.all(
        messages.map(async (msgInfo) => {
          if (msgInfo.from && msgInfo.subject) {
            return msgInfo;
          }
          try {
            const detail = await getGmailMessageDetails(msgInfo.id);
            return {
              id: detail.id,
              from: detail.from,
              subject: detail.subject,
              date: detail.date
            };
          } catch (e) {
            return { id: msgInfo.id, error: `Gagal membaca header: ${e.message}` };
          }
        })
      );

      let responseText = `📬 *[DAFTAR EMAIL GMAIL BARU]*\n\n`;
      detailedList.forEach((email, i) => {
        responseText += `${i + 1}. *Pengirim:* ${email.from || 'Seseorang'}\n`;
        responseText += `   *Subjek:* ${email.subject || '(Tidak ada subjek)'}\n`;
        responseText += `   *Tanggal:* ${email.date || '-'}\n`;
        responseText += `   *ID Pesan:* \`${email.id}\`\n\n`;
      });
      responseText += `*Tips:* Anda bisa meminta saya merangkum email tertentu menggunakan ID Pesan di atas.`;
      return responseText;
    }

    // B. GET EMAIL DETAILS
    if (toolName === 'gmail_get_email_details' || (args.message_id && !args.action)) {
      const messageId = args.message_id;
      if (!messageId) return 'Gagal: ID Pesan (message_id) wajib diisi untuk melihat isi email.';

      console.log(`[Gmail Skill] Mengambil konten detail email ID: ${messageId}`);
      const detail = await getGmailMessageDetails(messageId);

      let responseText = `📧 *[KONTEN EMAIL DETAIL]*\n`;
      responseText += `-------------------------------------------\n`;
      responseText += `*Dari:* ${detail.from}\n`;
      responseText += `*Subjek:* ${detail.subject}\n`;
      responseText += `*Tanggal:* ${detail.date}\n`;
      responseText += `*ID Pesan:* \`${detail.id}\`\n`;
      responseText += `-------------------------------------------\n\n`;
      responseText += `${detail.body}\n`;
      return responseText;
    }

    // C. MODIFY EMAIL (ARCHIVE / TRASH / MARK READ)
    if (toolName === 'gmail_modify_email' || (args.message_id && args.action)) {
      const { message_id: messageId, action } = args;
      if (!messageId || !action) {
        return 'Gagal: Parameter message_id dan action wajib diisi untuk memodifikasi email.';
      }

      console.log(`[Gmail Skill] Memproses tindakan "${action}" pada email ID: ${messageId}`);

      if (action === 'archive') {
        // Arsipkan: Hapus label INBOX
        await modifyGmailLabels(messageId, [], ['INBOX']);
        return `✅ Email dengan ID \`${messageId}\` berhasil diarsipkan (dihapus dari Inbox).`;
      }

      if (action === 'trash') {
        // Pindahkan ke Trash
        await trashGmailMessage(messageId);
        return `🗑️ Email dengan ID \`${messageId}\` berhasil dipindahkan ke folder Sampah (Trash).`;
      }

      if (action === 'mark_as_read') {
        // Hapus label UNREAD
        await modifyGmailLabels(messageId, [], ['UNREAD']);
        return `📖 Email dengan ID \`${messageId}\` ditandai sebagai Sudah Dibaca.`;
      }

      if (action === 'mark_as_unread') {
        // Tambahkan label UNREAD
        await modifyGmailLabels(messageId, ['UNREAD'], []);
        return `✉️ Email dengan ID \`${messageId}\` ditandai sebagai Belum Dibaca.`;
      }

      return `Gagal: Tindakan "${action}" tidak didukung oleh sistem Gmail.`;
    }

    return 'Gagal: Nama tool Gmail tidak dikenali oleh skill handler.';
  } catch (err) {
    console.error('[Gmail Skill] Eror selama eksekusi:', err.message);
    return `Gagal: Terjadi eror saat mengakses Gmail API (${err.message}).`;
  }
}
