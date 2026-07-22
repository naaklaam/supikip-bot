---
name: cross_group_forwarder
description: Kirim, teruskan (forward), atau bagikan pesan (teks kustom atau pesan yang di-reply/quoted) ke satu atau beberapa grup WhatsApp tujuan.
---

# Cross-Group Forwarder Skill

Skill ini memungkinkan bot untuk membagikan pesan teks kustom atau meneruskan (forward) pesan media/teks yang di-reply (quoted) oleh pengguna ke grup target lainnya.

```json
{
  "type": "function",
  "function": {
    "name": "forward_group_message",
    "description": "Meneruskan (forward) pesan yang di-reply (quoted) atau mengirimkan teks baru ke satu atau beberapa grup tujuan.",
    "parameters": {
      "type": "object",
      "properties": {
        "target_groups": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Daftar nama grup atau JID grup tujuan penerusan (contoh: ['punini', 'Belaar Mac OS'])."
        },
        "text_content": {
          "type": "string",
          "description": "Pesan teks kustom yang ingin dibagikan (opsional jika ingin membagikan teks baru alih-alih meneruskan pesan yang di-reply)."
        }
      },
      "required": ["target_groups"]
    }
  }
}
```
