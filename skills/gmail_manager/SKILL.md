---
name: gmail_manager
description: Mengelola Gmail pengguna (khusus Owner/JO) seperti membaca inbox, merangkum konten email, mengarsipkan, menghapus, atau menandai pesan terbaca/belum terbaca.
---

# Gmail Manager Skill

Skill ini memungkinkan bot (khusus jika diperintahkan oleh Owner/JO) untuk mengakses kotak masuk Gmail mereka menggunakan Google REST API, membaca konten secara hemat token, dan melakukan penataan label.

```json
[
  {
    "type": "function",
    "function": {
      "name": "gmail_list_emails",
      "description": "Mendapatkan daftar email terbaru dari inbox Gmail pengguna.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Kueri filter pencarian Gmail (opsional, contoh: 'is:inbox', 'from:netflix', 'label:unread'). Default: 'is:inbox'."
          },
          "max_results": {
            "type": "integer",
            "description": "Jumlah email maksimal yang ingin dibaca (opsional, default 5, maksimal 10)."
          }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "gmail_get_email_details",
      "description": "Membaca isi konten detail (subjek, pengirim, tanggal, bodi isi pesan) dari email tertentu untuk dirangkum.",
      "parameters": {
        "type": "object",
        "properties": {
          "message_id": {
            "type": "string",
            "description": "ID pesan unik Gmail dari daftar email."
          }
        },
        "required": ["message_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "gmail_modify_email",
      "description": "Mengubah label/status email seperti mengarsipkan (archive), membuang ke sampah (trash), atau mengubah status dibaca.",
      "parameters": {
        "type": "object",
        "properties": {
          "message_id": {
            "type": "string",
            "description": "ID pesan unik Gmail."
          },
          "action": {
            "type": "string",
            "enum": ["archive", "trash", "mark_as_read", "mark_as_unread"],
            "description": "Tindakan pelabelan email: 'archive' (arsipkan/hapus dari inbox), 'trash' (buang ke sampah), 'mark_as_read' (tandai dibaca), 'mark_as_unread' (tandai belum dibaca)."
          }
        },
        "required": ["message_id", "action"]
      }
    }
  }
]
```
