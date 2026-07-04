# Sticker Responder Skill

Definisi skema pemanggilan fungsi respon stiker untuk membalas obrolan menggunakan stiker ekspresi dari database lokal.

```json
{
  "type": "function",
  "function": {
    "name": "send_sticker_response",
    "description": "Mengirimkan stiker ekspresi/meme acak dari database lokal ke obrolan WhatsApp saat ini.",
    "parameters": {
      "type": "object",
      "properties": {
        "tag": {
          "type": "string",
          "enum": ["all", "ketus", "lucu", "datar", "kaget"],
          "description": "Tag kategori ekspresi stiker yang diinginkan (defaultnya adalah 'all' atau acak)."
        }
      },
      "required": []
    }
  }
}
```
