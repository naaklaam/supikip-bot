# Multi-Agent Delegation Skill

Skill untuk mendelegasikan beberapa tugas independen sekaligus ke beberapa sub-agent terisolasi secara paralel (`Promise.all`), di mana masing-masing sub-agent berjalan dengan instruksi, peran, dan kemampuan pemanggilan tools terisolasi sendiri.

```json
{
  "type": "function",
  "function": {
    "name": "delegate_parallel_subagents",
    "description": "Mendelegasikan beberapa tugas independen sekaligus ke beberapa sub-agent terisolasi secara paralel (Promise.all). Gunakan ini untuk memecah tugas kompleks menjadi beberapa spesialisasi terpisah (misal: Sub-agent 1 riset web, Sub-agent 2 analisis data crypto, Sub-agent 3 ringkas dokumen).",
    "parameters": {
      "type": "object",
      "properties": {
        "subagents": {
          "type": "array",
          "description": "Daftar sub-agent yang akan dieksekusi secara simultan.",
          "items": {
            "type": "object",
            "properties": {
              "role_name": {
                "type": "string",
                "description": "Nama peran atau spesialisasi sub-agent (misal: 'Riset Berita Web', 'Analis Market BTC', 'Pemeriksa Teks')."
              },
              "instruction": {
                "type": "string",
                "description": "Instruksi/peran spesifik untuk sub-agent."
              },
              "task": {
                "type": "string",
                "description": "Tugas atau pertanyaan spesifik yang harus diselesaikan sub-agent ini."
              }
            },
            "required": ["role_name", "instruction", "task"]
          }
        }
      },
      "required": ["subagents"]
    }
  }
}
```
