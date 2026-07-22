import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { toolsSchema, executeTool } from '../../tools.js';
import { processIncomingDocument } from '../services/document_processor.js';
import { extractArticleUrl, unfurlAndSummarizeUrl } from '../services/link_unfurler.js';
import { chatHistories } from './llm.js';
import { getOpenRouterResponse } from './llm.js';
import { saveChatMessage } from '../db/index.js';
import { getDownloadMediaMessage, getJidNormalizedUser } from '../utils/baileys_loader.js';
import { getSessionJid } from '../utils/session_helper.js';
import { getCachedGroupNames } from '../utils/group_resolver.js';

// Map untuk melacak status aktifasi Auto-OCR di setiap chat room (JID)
export const ocrActiveRooms = new Map();

/**
 * Handler utama untuk pesan masuk WhatsApp.
 */
export async function handleIncomingMessage(sock, msg) {
  if (!msg || !msg.key || !msg.message) return;

  // Lazy load baileys exports needed for message handling
  const [jidNormalizedUser, downloadMediaMessage] = await Promise.all([
    getJidNormalizedUser(),
    getDownloadMediaMessage()
  ]);
  
  // Hanya memproses pesan masuk dari orang lain (bukan dari bot itu sendiri)
  if (!msg.key.fromMe) {
    const jid = msg.key.remoteJid;
    const sessionJid = getSessionJid(jid);
    const documentMessage = msg.message?.documentMessage ||
      msg.message?.documentWithCaptionMessage?.message?.documentMessage;

    // Mengambil teks dari berbagai jenis tipe pesan WhatsApp (statis, media caption, extended text, dokumen)
    const text = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      documentMessage?.caption ||
      '';

    const sticker = msg.message?.stickerMessage;
    const isGroup = jid.endsWith('@g.us');
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = senderJid.split('@')[0];
    const senderName = msg.pushName || senderNumber;
    const ownerNumber = process.env.OWNER_NUMBER;
    const isOwner = (senderNumber === ownerNumber) || (senderName === 'JO');

    /*
    // Deteksi jika Owner mengirim stiker untuk dijadikan bahan database (DINONAKTIFKAN SEMENTARA)
    if (sticker && isOwner) {
      console.log(`[Sticker Handler] Owner mengirim stiker. Mengunduh secara otomatis...`);
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
        // Simpan ke subfolder stiker_db agar rapi
        const fileName = `sticker_${Date.now()}.webp`;
        const savePath = path.join(process.cwd(), 'stiker_db', fileName);
        fs.writeFileSync(savePath, buffer);

        // Daftarkan ke database SQLite
        await registerSticker(fileName, 'general', senderName);

        console.log(`[Sticker Handler] Stiker berhasil disimpan di: ${savePath} dan didaftarkan ke SQLite.`);

      } catch (err) {
        console.error('[Sticker Handler] Gagal mengunduh stiker:', err.message);
        await sock.sendMessage(jid, { text: `Gagal memproses berkas stiker: ${err.message}` });
      }
    }
    */

    // Cari tahu JID bot sendiri dan nomornya (dideklarasikan di level teratas handler pesan masuk)
    const botJid = jidNormalizedUser(sock.user.id);
    const botNumber = botJid.split('@')[0];
    const lowercaseText = text ? text.toLowerCase() : '';

    if (text) {

      // Static Router: Cek jika pengguna meminta menu tools secara langsung
      const isCallingBot = lowercaseText.includes('speaki') || lowercaseText.includes('supikip') || lowercaseText.includes('spikip') || lowercaseText.includes('spiki');
      if (isCallingBot && lowercaseText.includes('menu')) {
        console.log(`[Static Route: Menu] Mengirim menu fitur ke ${jid}`);
        const menuText = `⚙️ *Speaki Agent System Menu* ⚙️\n\n` +
          `Daftar tools dan kapabilitas sistem aktif:\n\n` +
          `1. 📖 *Pengecekan Manhwa Shinigami*\n` +
          `   - *Interval:* Otomatis setiap 15 menit ke grup target.\n` +
          `   - *Manual:* Pemicu manual via pesan *"cek shinigami"* atau *"update shinigami"*.\n\n` +
          `2. 🔍 *Pencarian Web (DuckDuckGo)*\n` +
          `   - *Fungsi:* Otomatis mencari data terbaru di internet untuk melengkapi analisis.\n\n` +
          `3. 🖥️ *Status Server / PC*\n` +
          `   - *Akses:* Terbatas (Khusus Owner).\n` +
          `   - *Pemicu:* Gunakan kata kunci *"status sistem"* atau *"status pc"*.\n\n` +
          `Sistem dalam status siap.`;

        await sock.sendPresenceUpdate('composing', jid);
        await sock.sendMessage(jid, { text: menuText });
        await sock.sendPresenceUpdate('paused', jid);
        return;
      }

      // Static Router: Pengujian performa bot ("speaki dev test") khusus nomor owner
      if (lowercaseText === 'speaki dev test') {
        const ownerNumber = process.env.OWNER_NUMBER;
        const isOwner = (senderNumber === ownerNumber) || (senderName === 'JO');
        if (!isOwner) {
          console.warn(`[Security Alert] Akses pengujian performa ditolak untuk: ${senderName} (${senderNumber})`);
          await sock.sendMessage(jid, { text: 'Akses ditolak. Fitur ini terbatas untuk pengembang.' });
          return;
        }

        console.log(`[Static Route: Dev Test] Menjalankan uji performa lokal dipicu oleh Owner...`);
        await sock.sendPresenceUpdate('composing', jid);

        const performanceTool = toolsSchema.find(t => t.function.name === 'run_performance_test');
        if (performanceTool) {
          const perfReport = await executeTool('run_performance_test', {}, sock);
          await sock.sendMessage(jid, { text: perfReport });
        } else {
          await sock.sendMessage(jid, { text: 'Gagal memicu pengujian: Modul uji performa tidak ditemukan.' });
        }
        await sock.sendPresenceUpdate('paused', jid);
        return;
      }

      // Static Router: Toggle Manual Mode Auto-OCR ON
      if (lowercaseText === 'ocr on' || lowercaseText === 'ocr_on') {
        ocrActiveRooms.set(jid, true);
        console.log(`[OCR System] Auto-OCR diaktifkan untuk obrolan: ${jid}`);
        await sock.sendMessage(jid, {
          text: '🤖 *Auto-OCR Mode: ON* 🤖\n\nKirim gambar apa saja di obrolan ini, Speaki akan mengekstrak teksnya secara otomatis.\nMatikan dengan mengetik *ocr off*.'
        });
        return;
      }

      // Static Router: Toggle Manual Mode Auto-OCR OFF
      if (lowercaseText === 'ocr off' || lowercaseText === 'ocr_off') {
        ocrActiveRooms.delete(jid);
        console.log(`[OCR System] Auto-OCR dinonaktifkan untuk obrolan: ${jid}`);
        await sock.sendMessage(jid, { text: '🤖 *Auto-OCR Mode: OFF* 🤖' });
        return;
        `--- AKHIR ISI DOKUMEN ---`;
      }
    }

    // Check apakah ada lampiran gambar pada pesan (baik imageMessage langsung atau di dalam viewOnceMessage)
    const imageMessage = msg.message?.imageMessage ||
      msg.message?.viewOnceMessage?.message?.imageMessage ||
      msg.message?.viewOnceMessageV2?.message?.imageMessage;

    if (imageMessage) {
      const hasOCRCaption = text && (text.toLowerCase() === 'ocr' || text.toLowerCase().startsWith('ocr '));
      const isAutoOCRActive = ocrActiveRooms.get(jid) === true;

      if (hasOCRCaption || isAutoOCRActive) {
        console.log(`[OCR System] Memulai ekstraksi OCR untuk gambar di JID: ${jid}. Mode: ${isAutoOCRActive ? 'AUTO' : 'MANUAL'}`);

        // Kirim status mengetik agar terasa responsif
        await sock.sendPresenceUpdate('composing', jid);

        try {
          // Unduh file gambar dari server WhatsApp ke buffer
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }) }
          );

          if (buffer) {
            const { performOCR } = await import('../skills/ocr_extractor/index.js');
            const ocrResult = await performOCR(buffer);

            // Kirim kembali hasil ekstraksi sebagai balasan (reply/quote) langsung ke gambar bersangkutan
            await sock.sendMessage(jid, {
              text: `📝 *HASIL OCR GAMBAR* 📝\n\n${ocrResult}`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { text: 'Gagal memproses gambar: Buffer kosong.' }, { quoted: msg });
          }
        } catch (err) {
          console.error('[OCR System] Gagal melakukan ekstraksi:', err.message);
          await sock.sendMessage(jid, { text: `Gagal mengekstrak teks dari gambar: ${err.message}` }, { quoted: msg });
        }

        await sock.sendPresenceUpdate('paused', jid);
        // Menghentikan pemrosesan alur LLM chat completion agar menghemat token & meminimalkan noise
        return;
      }
    }

    let documentInfo = null;
    if (documentMessage) {
      console.log(`[Document System] Terdeteksi dokumen masuk: ${documentMessage.fileName || 'file'}`);
      try {
        const docBuffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }) }
        );

        if (docBuffer) {
          documentInfo = await processIncomingDocument(
            docBuffer,
            documentMessage.fileName,
            documentMessage.mimetype
          );
          console.log(`[Document System] Berkas ${documentInfo.fileName} (${documentInfo.fileType}) berhasil diproses.`);
        }
      } catch (docErr) {
        console.error(`[Document System] Gagal mengunduh/memproses dokumen:`, docErr.message);
      }
    }

    let promptText = text;
    if (!promptText && documentInfo) {
      promptText = `Tolong baca/olah/koreksi/ringkas dokumen ${documentInfo.fileName}`;
    }

    if (promptText || documentInfo) {
      // Simpan pesan masuk ke database SQLite (Pencatatan Long-Term Memory FTS5)
      saveChatMessage(sessionJid, senderName, senderJid, promptText || 'Mengirim berkas', 0);

      // Format isi pesan agar LLM tahu siapa yang berbicara dan apa isi dokumen yang dikirim
      let formattedMessage = `[${senderName}]: ${promptText}`;
      if (documentInfo) {
        formattedMessage += `\n\n[LAMPIRAN DOKUMEN: ${documentInfo.fileName}]\n` +
          `📁 Tipe: ${documentInfo.fileType}\n` +
          `💾 Lokasi Server: ${documentInfo.filePath}\n` +
          `--- ISI DOKUMEN ---\n` +
          `${documentInfo.parsedContent}\n`;
      }

      // Simpan pesan ke riwayat obrolan JID ini terlebih dahulu untuk mempertahankan konteks
      if (!chatHistories.has(sessionJid)) {
        chatHistories.set(sessionJid, { messages: [], lastAccessed: Date.now() });
      }
      const chatData = chatHistories.get(sessionJid);
      chatData.lastAccessed = Date.now();
      const history = chatData.messages;

      history.push({ role: 'user', content: formattedMessage });
      if (history.length > 10) {
        history.shift();
      }

      // Cek apakah pesan di grup atau jalur pribadi (DM)
      let shouldReply = false;
      if (!isGroup) {
        // Jika DM, selalu balas
        shouldReply = true;
        console.log(`[Pesan Pribadi dari ${senderName}]: ${text}`);
      } else {
        // Jika di grup, cek apakah bot dimention atau direply
        // Normalisasi perbandingan JID untuk reply/mention agar bebas dari device ID (conflict :1, :2 dll)
        const cleanBotJid = jidNormalizedUser(botJid);
        const cleanReplyParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
          ? jidNormalizedUser(msg.message.extendedTextMessage.contextInfo.participant)
          : null;

        const mentionedJids = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])
          .map(j => jidNormalizedUser(j));

        const isReplyToBot = cleanReplyParticipant === cleanBotJid || (cleanReplyParticipant && cleanReplyParticipant.startsWith('133526976512185'));
        const hasTextMention = text.includes(`@${botNumber}`) || text.includes(`@${botJid.split('@')[0]}`) || text.includes('@133526976512185');

        // Deteksi nama panggilan biasa (speaki / supikip / spikip / spiki) di dalam teks (case-insensitive)
        const hasNameMention = lowercaseText.includes('speaki') || lowercaseText.includes('supikip') || lowercaseText.includes('spikip') || lowercaseText.includes('spiki');

        const isMentioned = mentionedJids.includes(cleanBotJid) ||
          mentionedJids.some(j => j.split('@')[0] === botNumber || j.startsWith('133526976512185')) ||
          hasTextMention ||
          isReplyToBot ||
          hasNameMention;

        const groupNames = getCachedGroupNames();
        const groupLabel = groupNames[jid] ? `${groupNames[jid]} (${jid})` : jid;
        console.log(`[Pesan Grup dari ${senderName} di ${groupLabel}] (Mentioned: ${isMentioned}): ${text}`);

        if (isMentioned) {
          shouldReply = true;
        }
      }

      // Jika memenuhi syarat untuk membalas, kirim ke OpenRouter
      if (shouldReply) {
        // Tampilkan indikator "sedang mengetik" di WhatsApp agar bot terasa lebih responsif
        await sock.sendPresenceUpdate('composing', jid);

        // Pemicu Otomatis Smart Link Unfurler untuk Artikel/Berita yang dibagikan
        const articleUrl = extractArticleUrl(promptText);
        if (articleUrl) {
          unfurlAndSummarizeUrl(articleUrl).then(summary => {
            if (summary) {
              sock.sendMessage(jid, { text: summary }, { quoted: msg });
            }
          }).catch(err => {
            console.error('[Link Unfurler Error] Failed:', err.message);
          });
        }

        // Dapatkan balasan dari OpenRouter dengan dukungan pemanggilan tools
        const replyText = await getOpenRouterResponse(jid, sock, msg);

        // Simpan balasan bot ke database SQLite (Pencatatan Long-Term Memory FTS5)
        saveChatMessage(sessionJid, 'Speaki ⚙️🤖', botJid, replyText, 1);

        // Kirim balasan ke pengguna (diquote ke pesan pengirim)
        await sock.sendMessage(jid, { text: replyText }, { quoted: msg });

        // Hentikan indikator sedang mengetik
        await sock.sendPresenceUpdate('paused', jid);
      }
    }
  }
}
