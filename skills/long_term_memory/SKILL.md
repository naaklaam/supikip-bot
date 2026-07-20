# Long-Term Memory Skill (SQLite FTS5)

Skill untuk mencari riwayat percakapan lampau berbulan-bulan lalu atau menyimpan fakta penting jangka panjang menggunakan SQLite FTS5 (Full-Text Search).

```json
{
  "type": "function",
  "function": {
    "name": "search_long_term_memory",
    "description": "Mencari riwayat percakapan lampau di grup/obrolan atau mencari fakta memori jangka panjang yang pernah disimpan sebelumnya menggunakan SQLite FTS5 (Full-Text Search). Gunakan tool ini jika pengirim menanyakan hal yang pernah dibahas di masa lalu.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Kata kunci pencarian yang relevan (misal: 'Trickcal', 'MacOS', 'Shinigami', nama orang, atau topik khusus)."
        },
        "search_type": {
          "type": "string",
          "enum": ["all", "messages", "facts"],
          "description": "Tipe pencarian: 'all' (default), 'messages' (hanya riwayat chat), atau 'facts' (hanya fakta tersimpan)."
        }
      },
      "required": ["query"]
    }
  }
}
```
