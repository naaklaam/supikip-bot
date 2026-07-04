# Creative Writer Skill

Definisi skema pemanggilan fungsi penulis kreatif dinamis untuk menghasilkan cerita fiksi pendek dan puisi berdasarkan genre dan tema yang diminta.

```json
{
  "type": "function",
  "function": {
    "name": "generate_creative_content",
    "description": "Menghasilkan tulisan kreatif berupa cerita fiksi pendek atau puisi berdasarkan parameter genre, tipe tulisan, dan petunjuk tema.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["story", "poetry"],
          "description": "Tipe karya sastra yang ingin dihasilkan ('story' untuk cerita fiksi pendek, 'poetry' untuk puisi)."
        },
        "genre": {
          "type": "string",
          "description": "Genre tulisan (misalnya: Horor, Romantis, Sci-Fi, Fantasi, Komedi, Thriller, Melankolis, dll)."
        },
        "topic": {
          "type": "string",
          "description": "Tema, premis, atau alur spesifik yang diinginkan (misal: 'perjalanan waktu ke masa lalu' atau 'kerinduan di bawah hujan')."
        }
      },
      "required": ["type", "genre", "topic"]
    }
  }
}
```
