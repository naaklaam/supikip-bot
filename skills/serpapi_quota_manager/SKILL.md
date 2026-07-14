# SerpAPI Quota Manager Skill

Definisi skema pemanggilan fungsi untuk memantau dan memperbarui sisa kuota pencarian SerpAPI secara manual.

```json
{
  "type": "function",
  "function": {
    "name": "manage_serpapi_quota",
    "description": "Memantau sisa kuota SerpAPI atau memperbarui nilai usage secara manual.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["view", "update"],
          "description": "Aksi yang ingin dilakukan: 'view' untuk melihat statistik kuota saat ini, 'update' untuk mengubah nilai kuota."
        },
        "usage_count": {
          "type": "integer",
          "description": "Jumlah pencarian SerpAPI yang sudah terpakai saat ini (digunakan hanya saat action adalah 'update')."
        },
        "total_limit": {
          "type": "integer",
          "description": "Total limit pencarian SerpAPI per bulan (digunakan hanya saat action adalah 'update')."
        }
      },
      "required": ["action"]
    }
  }
}
```
