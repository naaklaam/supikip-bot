import {
  appendSpreadsheetValues,
  readSpreadsheetValues,
  updateSpreadsheetValues
} from '../../src/services/googlesheets_service.js';

/**
 * Skill Google Sheets Manager untuk Supikip
 * Mengeksekusi instruksi pembacaan dan pembaruan Google Sheets milik Owner/JO secara interaktif.
 */
export async function execute(args, sock, extraContext = {}) {
  const { msg } = extraContext;

  // 1. Validasi Keamanan: Hanya Owner/JO yang diizinkan mengakses Google Sheets
  if (!msg) {
    return 'Gagal: Konteks pesan tidak ditemukan untuk memvalidasi identitas pengirim.';
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0];
  const ownerNumber = process.env.OWNER_NUMBER;
  const isOwner = (senderNumber === ownerNumber) || (msg.pushName === 'JO');

  if (!isOwner) {
    console.warn(`[Google Sheets Skill] Akses ditolak untuk JID: ${senderJid} (bukan owner).`);
    return 'Gagal: Akses ditolak. Hanya Owner (JO) yang diperbolehkan untuk mengakses Google Sheets bot.';
  }

  // Deteksi nama tool dari dynamic loader
  const toolName = extraContext.toolName || args._toolName;

  try {
    // A. APPEND ROW
    if (toolName === 'googlesheets_append_row') {
      const { spreadsheet_id, range, values } = args;
      if (!spreadsheet_id || !range || !values) {
        return 'Gagal: Parameter spreadsheet_id, range, dan values wajib diisi.';
      }

      console.log(`[Google Sheets Skill] Menambahkan baris ke spreadsheet: ${spreadsheet_id}, range: ${range}`);
      await appendSpreadsheetValues(spreadsheet_id, range, values);
      return `✅ Berhasil menambahkan baris baru ke Spreadsheet pada rentang *${range}*.`;
    }

    // B. READ RANGE
    if (toolName === 'googlesheets_read_range') {
      const { spreadsheet_id, range } = args;
      if (!spreadsheet_id || !range) {
        return 'Gagal: Parameter spreadsheet_id dan range wajib diisi.';
      }

      console.log(`[Google Sheets Skill] Membaca data spreadsheet: ${spreadsheet_id}, range: ${range}`);
      const rows = await readSpreadsheetValues(spreadsheet_id, range);

      if (rows.length === 0) {
        return `Tabel pada rentang *${range}* kosong (tidak ada data).`;
      }

      let responseText = `📊 *[DATA GOOGLE SHEETS - ${range}]*\n`;
      responseText += `-------------------------------------------\n`;
      rows.forEach((row, i) => {
        responseText += `${i + 1}. ${row.join(' | ')}\n`;
      });
      responseText += `-------------------------------------------\n`;
      return responseText;
    }

    // C. UPDATE RANGE
    if (toolName === 'googlesheets_update_range') {
      const { spreadsheet_id, range, values } = args;
      if (!spreadsheet_id || !range || !values) {
        return 'Gagal: Parameter spreadsheet_id, range, dan values wajib diisi.';
      }

      console.log(`[Google Sheets Skill] Memperbarui rentang: ${spreadsheet_id}, range: ${range}`);
      await updateSpreadsheetValues(spreadsheet_id, range, values);
      return `✅ Rentang *${range}* pada Spreadsheet berhasil diperbarui dengan data baru.`;
    }

    return 'Gagal: Nama tool Google Sheets tidak dikenali oleh skill handler.';
  } catch (err) {
    console.error('[Google Sheets Skill] Eror selama eksekusi:', err.message);
    return `Gagal: Terjadi eror saat mengakses Google Sheets API (${err.message}).`;
  }
}
