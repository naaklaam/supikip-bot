import { searchChatMessageHistory, searchLongTermFact, saveLongTermFact } from '../../src/db/index.js';

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock, extraContext = {}) {
  const query = args.query;
  if (!query) {
    return 'Gagal: Kata kunci pencarian memori tidak boleh kosong.';
  }

  const { jid } = extraContext;
  const searchType = args.search_type || 'all';

  try {
    let facts = [];
    let msgs = [];

    if (searchType === 'all' || searchType === 'facts') {
      facts = await searchLongTermFact(query, 5);
    }

    if (searchType === 'all' || searchType === 'messages') {
      msgs = await searchChatMessageHistory(query, jid, 5);
    }

    if (facts.length === 0 && msgs.length === 0) {
      return `Pencarian memori jangka panjang FTS5 untuk "${query}" tidak menemukan hasil yang cocok di database.`;
    }

    let report = `🧠 *HASIL PENCARIAN MEMORI JANGKA PANJANG (FTS5)* 🧠\n\n`;

    if (facts.length > 0) {
      report += `📌 *Fakta Terkait Tersimpan (${facts.length}):*\n`;
      facts.forEach((f, i) => {
        report += `[${i + 1}] Topik: ${f.key_topic} | Kategori: ${f.category}\n   Detail: ${f.value_fact}\n`;
      });
      report += `\n`;
    }

    if (msgs.length > 0) {
      report += `💬 *Riwayat Obrolan Terkait (${msgs.length}):*\n`;
      msgs.forEach((m, i) => {
        const dateStr = new Date(m.timestamp).toLocaleString('id-ID');
        report += `[${i + 1}] (${dateStr}) ${m.sender_name || 'User'}: ${m.message_text}\n`;
      });
    }

    return report.trim();

  } catch (error) {
    console.error(`[Skill: long_term_memory] Error: ${error.message}`);
    return `Gagal melakukan pencarian memori: ${error.message}`;
  }
}
