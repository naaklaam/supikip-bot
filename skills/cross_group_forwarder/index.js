import path from 'path';
import fs from 'fs';

/**
 * Helper to recursively extract contextInfo from various WhatsApp message types
 */
function getContextInfo(message) {
  if (!message) return null;
  return message.extendedTextMessage?.contextInfo ||
         message.imageMessage?.contextInfo ||
         message.videoMessage?.contextInfo ||
         message.stickerMessage?.contextInfo ||
         message.documentMessage?.contextInfo ||
         message.documentWithCaptionMessage?.message?.documentMessage?.contextInfo;
}

/**
 * Main execution handler for forward_group_message skill
 */
export async function execute(args, sock, extraContext = {}) {
  const { target_groups, text_content } = args;
  const { jid, msg } = extraContext;

  if (!target_groups || !Array.isArray(target_groups) || target_groups.length === 0) {
    return 'Gagal: Target grup tujuan tidak boleh kosong dan harus berupa array.';
  }

  // 1. Resolve target group names/JIDs using local group_names.json cache
  const cachePath = path.join(process.cwd(), 'group_names.json');
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch (e) {
      console.error('[Forwarder Skill] Gagal membaca group_names.json:', e.message);
    }
  }

  const resolvedTargets = [];
  const unmatchedTargets = [];

  for (const target of target_groups) {
    const trimmed = target.trim();
    if (trimmed.endsWith('@g.us')) {
      resolvedTargets.push({ jid: trimmed, name: cache[trimmed] || trimmed });
      continue;
    }

    // Fuzzy match against group name cache
    const matchedJids = Object.keys(cache).filter(k => 
      cache[k].toLowerCase().includes(trimmed.toLowerCase())
    );

    if (matchedJids.length > 0) {
      // Ambil yang paling mendekati (atau semuanya jika ada beberapa)
      matchedJids.forEach(j => {
        if (!resolvedTargets.some(r => r.jid === j)) {
          resolvedTargets.push({ jid: j, name: cache[j] });
        }
      });
    } else {
      unmatchedTargets.push(trimmed);
    }
  }

  if (resolvedTargets.length === 0) {
    return `Gagal: Tidak dapat menemukan grup tujuan yang cocok untuk: ${target_groups.join(', ')}.`;
  }

  // 2. Identify if there is a quoted/replied message to forward
  const contextInfo = getContextInfo(msg?.message);
  let quotedMsg = null;

  if (contextInfo && contextInfo.quotedMessage) {
    quotedMsg = {
      key: {
        remoteJid: jid,
        fromMe: contextInfo.participant === sock.user.id,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      message: contextInfo.quotedMessage
    };
  }

  if (!quotedMsg && !text_content) {
    return 'Gagal: Tidak ada pesan yang di-reply (quoted) untuk diteruskan, dan tidak ada teks kustom (text_content) yang ditulis.';
  }

  const successReports = [];
  const failureReports = [];

  // 3. Process sending/forwarding to all resolved groups
  for (const target of resolvedTargets) {
    // Proteksi Loop: Cek apakah target JID ini sudah dikirimi pesan/forward pada turn saat ini
    if (extraContext.sentTargets && extraContext.sentTargets.has(target.jid)) {
      console.log(`[Forwarder Skill] Skip mengirim ke ${target.name} (${target.jid}) karena sudah pernah dikirim di turn ini.`);
      successReports.push(`${target.name} (${target.jid}) [sudah dikirim sebelumnya]`);
      continue;
    }

    try {
      if (quotedMsg) {
        // Forward the quoted message
        await sock.sendMessage(target.jid, { forward: quotedMsg });
      } else if (text_content && text_content.trim().length > 0) {
        // Just send custom text content
        await sock.sendMessage(target.jid, { text: text_content });
      }

      // Catat target JID sukses terkirim
      if (extraContext.sentTargets) {
        extraContext.sentTargets.add(target.jid);
      }
      successReports.push(`${target.name} (${target.jid})`);
    } catch (err) {
      console.error(`[Forwarder Skill] Gagal mengirim ke ${target.name}:`, err.message);
      failureReports.push(`${target.name} (${err.message})`);
    }
  }

  // 4. Generate report summary
  let resultSummary = `📤 *[FORWARD/SHARE BERHASIL]*\n\nPesan berhasil dibagikan ke:\n` + 
    successReports.map(s => `- ${s}`).join('\n');

  if (failureReports.length > 0) {
    resultSummary += `\n\n⚠️ *[GAGAL MENGIRIM KEPADA]:*\n` + 
      failureReports.map(f => `- ${f}`).join('\n');
  }

  if (unmatchedTargets.length > 0) {
    resultSummary += `\n\n❓ *[GRUP TIDAK DIKENAL]:*\n` + 
      unmatchedTargets.map(u => `- ${u}`).join('\n');
  }

  return resultSummary;
}
