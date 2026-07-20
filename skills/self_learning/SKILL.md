# Self-Learning Skill (SQLite FTS5)

Skill untuk menyimpan instruksi kustom, koreksi pengguna, atau preferensi gaya baru secara otomatis ke dalam database SQLite FTS5 tanpa membengkakkan file `CORE_IDENTITY.md`.

```json
{
  "type": "function",
  "function": {
    "name": "learn_preference",
    "description": "Menyimpan aturan baru, koreksi pengguna, atau preferensi khusus yang diajarkan oleh pengguna ke dalam memori jangka panjang SQLite FTS5. Gunakan tool ini secara otomatis saat pengguna mengajari, mengoreksi, atau menetapkan aturan preferensi baru untuk percakapan mendatang.",
    "parameters": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": ["user_preference", "correction", "custom_knowledge", "style_rule"],
          "description": "Kategori pembelajaran: 'user_preference' (preferensi pengguna), 'correction' (koreksi kesalahan), 'custom_knowledge' (pengetahuan baru), atau 'style_rule' (aturan gaya bahasa)."
        },
        "topic": {
          "type": "string",
          "description": "Topik spesifik atau kata kunci utama (misal: 'crypto_currency', 'panggilan_nama', 'format_laporan')."
        },
        "rule_fact": {
          "type": "string",
          "description": "Aturan atau fakta lengkap yang harus dipelajari dan diingat untuk percakapan mendatang."
        }
      },
      "required": ["category", "topic", "rule_fact"]
    }
  }
}
```
