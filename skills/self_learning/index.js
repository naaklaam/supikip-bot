import { saveLongTermFact } from '../../database_db.js';

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock, extraContext = {}) {
  const { category, topic, rule_fact } = args;

  if (!topic || !rule_fact) {
    return 'Gagal: Topik dan aturan/fakta pembelajaran tidak boleh kosong.';
  }

  const { jid } = extraContext;
  const targetCategory = category || 'user_preference';

  try {
    console.log(`[Skill: self_learning] Menyimpan pembelajaran baru: [${targetCategory}] ${topic} -> ${rule_fact}`);
    
    // Simpan fakta pembelajaran ke database SQLite FTS5
    const factId = await saveLongTermFact(targetCategory, topic, rule_fact, jid || null);

    return `🧠 *[SELF-LEARNING RECOGNIZED]* Aturan/preferensi baru berhasil dipelajari dan disimpan ke database SQLite FTS5 (ID: ${factId}):\n- Topik: ${topic}\n- Aturan/Fakta: ${rule_fact}`;

  } catch (error) {
    console.error(`[Skill: self_learning] Error: ${error.message}`);
    return `Gagal menyimpan pembelajaran baru: ${error.message}`;
  }
}
