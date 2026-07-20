import dotenv from 'dotenv';
dotenv.config();

/**
 * Menjalankan 1 sub-agent terisolasi secara independen
 */
async function runSingleSubagent(subagent, sock) {
  const { role_name, instruction, task } = subagent;
  console.log(`[Multi-Agent] Memulai sub-agent: "${role_name}"`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';
  if (!apiKey) return `[SUB-AGENT ${role_name}]: Kunci API OpenRouter belum diatur.`;

  const systemPrompt = `${instruction}\n\nKamu adalah sub-agent terisolasi bernama "${role_name}". Berikan jawaban yang ringkas, tepat, dan langsung pada inti tugas tanpa basa-basi.`;

  const currentMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
        'X-Title': `Speaki Subagent - ${role_name}`
      },
      body: JSON.stringify({
        model: model,
        messages: currentMessages,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    const finalAnswer = reply || `(Tidak ada output teks dari sub-agent)`;

    return `🤖 *[SUB-AGENT: ${role_name}]*\n📋 *Tugas:* ${task}\n💡 *Hasil:* ${finalAnswer}`;

  } catch (err) {
    console.error(`[Multi-Agent Error: ${role_name}]`, err.message);
    return `❌ *[SUB-AGENT: ${role_name}]* Error: ${err.message}`;
  }
}

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock, extraContext = {}) {
  const subagents = args.subagents;
  if (!Array.isArray(subagents) || subagents.length === 0) {
    return 'Gagal: Daftar subagents tidak boleh kosong.';
  }

  console.log(`[Multi-Agent Delegator] Menjalankan ${subagents.length} sub-agent secara paralel (Promise.all)...`);

  try {
    // Eksekusi seluruh sub-agent secara simultan menggunakan Promise.all
    const results = await Promise.all(
      subagents.map(agent => runSingleSubagent(agent, sock))
    );

    return `=== HASIL EKSEKUSI MULTI-AGENT PARALEL (${subagents.length} SUB-AGENTS) ===\n\n` +
      results.join('\n\n-----------------------------------\n\n') +
      `\n\n===================================`;

  } catch (error) {
    console.error(`[Multi-Agent Delegator] Error: ${error.message}`);
    return `Gagal mengeksekusi multi-agent paralel: ${error.message}`;
  }
}
