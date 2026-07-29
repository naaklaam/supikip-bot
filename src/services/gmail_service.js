import { executeOpenConnectorAction } from './openconnector_service.js';

/**
 * List pesan dari Gmail Inbox via OpenConnector
 * @param {string} query - Kueri pencarian Gmail (misal: 'is:inbox')
 * @param {number} maxResults - Jumlah hasil maksimal
 */
export async function listGmailMessages(query = 'is:inbox', maxResults = 10) {
  const data = await executeOpenConnectorAction('gmail.fetch_emails', {
    query,
    maxResults,
    detail: 'summary'
  });
  return data.messages || [];
}

/**
 * Mengambil detail konten email via OpenConnector
 * @param {string} messageId - ID pesan Gmail
 */
export async function getGmailMessageDetails(messageId) {
  const detail = await executeOpenConnectorAction('gmail.get_message', {
    messageId
  });

  let body = detail.body || '[Tidak ada konten teks]';
  
  // Potong isi body maksimal 1500 karakter agar hemat token LLM
  if (body.length > 1500) {
    body = body.slice(0, 1500) + '\n... (Konten dipotong karena terlalu panjang) ...';
  }

  return {
    id: detail.messageId || messageId,
    threadId: detail.threadId,
    from: detail.from,
    subject: detail.subject,
    date: detail.date,
    body
  };
}

/**
 * Memodifikasi label email (arsip/archive, tandai dibaca, dll)
 */
export async function modifyGmailLabels(messageId, addLabelIds = [], removeLabelIds = []) {
  return await executeOpenConnectorAction('gmail.add_label_to_email', {
    messageId,
    addLabelIds,
    removeLabelIds
  });
}

/**
 * Memindahkan email ke folder Trash (Sampah)
 */
export async function trashGmailMessage(messageId) {
  return await executeOpenConnectorAction('gmail.move_to_trash', {
    messageId
  });
}
