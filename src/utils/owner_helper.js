import dotenv from 'dotenv';
dotenv.config();

/**
 * Mengecek secara komprehensif apakah sebuah pesan berasal dari Owner (JO).
 * Mendukung: Phone Number JID, Multi-device Suffix (:1, :12), WhatsApp LID, fromMe, dan PushName.
 * 
 * @param {object} msg - Objek pesan WhatsApp dari Baileys
 * @param {string} extraJid - Fallback JID jika ada
 * @returns {boolean}
 */
export function checkIsOwner(msg, extraJid = '') {
  if (!msg && !extraJid) return false;

  // 1. Jika pesan dikirim oleh bot/owner socket itu sendiri
  if (msg?.key?.fromMe) return true;

  // 2. Kumpulkan semua kandidat JID & sender info dari msg
  const candidates = [
    msg?.key?.participant,
    msg?.participant,
    msg?.key?.remoteJid,
    extraJid
  ].filter(Boolean);

  const ownerNumberConfig = process.env.OWNER_NUMBER || '';
  const ownerLidConfig = process.env.OWNER_LID || '';
  const ownerNameConfig = process.env.OWNER_NAME || 'JO,Jo,Naaklaam';

  const ownerNumbers = ownerNumberConfig
    .split(',')
    .map(n => n.trim().replace(/\D/g, ''))
    .filter(Boolean);

  const ownerLids = ownerLidConfig
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

  const ownerNames = ownerNameConfig
    .split(',')
    .map(n => n.trim().toLowerCase())
    .filter(Boolean);

  // 3. Cek kecocokan JID / nomor telepon
  for (const rawJid of candidates) {
    const cleanJid = String(rawJid).split('@')[0].split(':')[0].trim();
    const cleanNumber = cleanJid.replace(/\D/g, '');

    if (ownerNumbers.length > 0 && (ownerNumbers.includes(cleanNumber) || ownerNumbers.includes(cleanJid))) {
      return true;
    }
    if (ownerLids.length > 0 && (ownerLids.includes(cleanJid) || ownerLids.some(lid => String(rawJid).includes(lid)))) {
      return true;
    }
  }

  // 4. Fallback: Cek pushName / display name sender
  const pushName = (msg?.pushName || '').trim().toLowerCase();
  if (pushName && ownerNames.includes(pushName)) {
    return true;
  }

  return false;
}
