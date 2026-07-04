import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'google/gemini-2.5-flash-lite';

/**
 * Menghasilkan konten cerita atau puisi menggunakan panggilan API sekunder ke OpenRouter
 * dengan instruksi kreatif khusus (Creative Writing Specialist)
 */
async function callCreativeLLM(type, genre, topic) {
    if (!OPENROUTER_API_KEY) {
        return "Gagal membuat konten: API Key OpenRouter belum diatur di file .env.";
    }

    const systemPrompt = `Kamu adalah seorang sastrawan legendaris, novelis, dan penyair profesional dengan gaya penulisan yang kaya akan metafora, hidup, mendalam, dan memikat pembaca.
Tugasmu adalah membuat karya sastra berkualitas tinggi sesuai dengan instruksi pengguna tanpa basa-basi pembuka atau penutup. Hasilkan langsung karya sastranya secara utuh.`;

    let userPrompt = "";
    if (type === 'story') {
        userPrompt = `Buatlah sebuah CERITA FIKSI PENDEK (cerpen) dengan ketentuan berikut:
- Genre: ${genre}
- Tema/Topik: ${topic}
- Gaya Penulisan: Narasi mendalam, deskripsi suasana yang hidup, dan plot twist yang menarik di akhir cerita.`;
    } else {
        userPrompt = `Buatlah sebuah PUISI dengan ketentuan berikut:
- Genre/Vibe: ${genre}
- Tema/Topik: ${topic}
- Gaya Penulisan: Penggunaan diksi yang indah, kaya akan rima dan ritme melodi sastra, serta memiliki bait yang terstruktur rapi.`;
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/itsliaaa/baileys',
                'X-Title': 'Speaki WhatsApp Bot - Creative Writer'
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8 // Suhu ditingkatkan agar hasil tulisan terasa lebih kreatif & variatif
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
            console.error('Respon menulis kreatif kosong dari API:', data);
            return 'Gagal memproses karya sastra: Respon kosong dari server AI.';
        }

        return content.trim();
    } catch (e) {
        return `Gagal menghubungi server penulisan kreatif: ${e.message}`;
    }
}

/**
 * Titik masuk eksekusi utama yang dipanggil oleh dynamic loader di tools.js
 */
export async function execute(args, sock) {
    const type = args.type || 'story';
    const genre = args.genre || 'Umum';
    const topic = args.topic || 'Kehidupan';

    console.log(`[Skill: creative_writer] Menghasilkan ${type} | Genre: ${genre} | Topik: ${topic}`);

    const result = await callCreativeLLM(type, genre, topic);
    
    const formattedHeader = type === 'story'
        ? `📚 *[FIKSI PENDEK]* \n*Genre*: ${genre}\n*Tema*: ${topic}\n\n`
        : `✍️ *[PUISI]* \n*Vibe*: ${genre}\n*Tema*: ${topic}\n\n`;

    return `${formattedHeader}${result}`;
}
