import {
  getOpenRouterCredits,
  getOpenRouterKeyDetails
} from '../../src/services/openrouter_service.js';

/**
 * Skill OpenRouter Manager untuk Supikip
 * Mengeksekusi instruksi pemantauan kredit dan kunci API OpenRouter milik Owner/JO secara interaktif.
 */
export async function execute(args, sock, extraContext = {}) {
  const { msg } = extraContext;

  // 1. Validasi Keamanan: Hanya Owner/JO yang diizinkan memantau OpenRouter
  if (!msg) {
    return 'Gagal: Konteks pesan tidak ditemukan untuk memvalidasi identitas pengirim.';
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0];
  const ownerNumber = process.env.OWNER_NUMBER;
  const isOwner = (senderNumber === ownerNumber) || (msg.pushName === 'JO');

  if (!isOwner) {
    console.warn(`[OpenRouter Skill] Akses ditolak untuk JID: ${senderJid} (bukan owner).`);
    return 'Gagal: Akses ditolak. Hanya Owner (JO) yang diperbolehkan memantau kredit API OpenRouter.';
  }

  // Deteksi nama tool dari dynamic loader
  const toolName = extraContext.toolName || args._toolName;

  try {
    // A. GET BALANCE
    if (toolName === 'openrouter_get_balance') {
      console.log('[OpenRouter Skill] Membaca saldo kredit...');
      const credits = await getOpenRouterCredits();

      const totalCredits = credits.total_credits || 0;
      const totalUsage = credits.total_usage || 0;
      const remainingBalance = Math.max(totalCredits - totalUsage, 0);

      let responseText = `💳 *[SALDO KREDIT OPENROUTER]*\n`;
      responseText += `-------------------------------------------\n`;
      responseText += `*Total Deposit Kredit:* $${totalCredits.toFixed(4)} USD\n`;
      responseText += `*Total Penggunaan:* $${totalUsage.toFixed(4)} USD\n`;
      responseText += `*Sisa Saldo Aktif:* $${remainingBalance.toFixed(4)} USD\n`;
      responseText += `-------------------------------------------\n`;
      return responseText;
    }

    // B. GET KEY DETAILS
    if (toolName === 'openrouter_get_key_details') {
      console.log('[OpenRouter Skill] Membaca detail kunci API...');
      const keyDetails = await getOpenRouterKeyDetails();

      let responseText = `🔑 *[DETAIL KUNCI API OPENROUTER]*\n`;
      responseText += `-------------------------------------------\n`;
      responseText += `*Nama Kunci:* ${keyDetails.label || '-'}\n`;
      responseText += `*Status:* ${keyDetails.is_active ? '✅ Aktif' : '❌ Nonaktif'}\n`;
      
      if (keyDetails.limit !== undefined && keyDetails.limit !== null) {
        responseText += `*Limit Kunci:* $${keyDetails.limit.toFixed(4)} USD\n`;
      } else {
        responseText += `*Limit Kunci:* Tidak Terbatas (No Limit)\n`;
      }
      
      if (keyDetails.usage !== undefined && keyDetails.usage !== null) {
        responseText += `*Penggunaan Kunci Ini:* $${keyDetails.usage.toFixed(4)} USD\n`;
      }
      responseText += `-------------------------------------------\n`;
      return responseText;
    }

    return 'Gagal: Nama tool OpenRouter tidak dikenali oleh skill handler.';
  } catch (err) {
    console.error('[OpenRouter Skill] Eror selama eksekusi:', err.message);
    return `Gagal: Terjadi eror saat mengakses OpenRouter API via OpenConnector (${err.message}).`;
  }
}
