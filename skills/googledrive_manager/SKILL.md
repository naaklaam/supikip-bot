---
name: googledrive_manager
description: Mengelola dan mengakses Google Drive pengguna (khusus Owner/JO) seperti mencari file, melihat detail metadata file, membaca isi file, atau mengunduh dokumen.
---

# Google Drive Manager Skill

Skill ini memungkinkan bot (khusus jika diperintahkan oleh Owner/JO) untuk mencari dan membaca dokumen atau berkas di Google Drive mereka melalui OOMOL OpenConnector.

```json
[
  {
    "type": "function",
    "function": {
      "name": "googledrive_list_files",
      "description": "Mencari atau mendaftar berkas di Google Drive pengguna menggunakan filter nama atau tipe dokumen.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Kueri filter pencarian resmi Google Drive (opsional, contoh: 'name contains \"manhwa\"', 'mimeType = \"application/pdf\"')."
          },
          "limit": {
            "type": "integer",
            "description": "Jumlah berkas maksimal yang ingin ditampilkan (opsional, default 10, maksimal 50)."
          }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "googledrive_get_file_metadata",
      "description": "Mendapatkan metadata lengkap berkas Google Drive seperti nama, tipe MIME, ukuran, tanggal modifikasi, dan tautan web.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_id": {
            "type": "string",
            "description": "ID unik berkas Google Drive."
          }
        },
        "required": ["file_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "googledrive_read_file_content",
      "description": "Membaca isi konten teks (plain text) dari berkas Google Drive (seperti berkas .txt, .md, atau .json) via OpenConnector proxy.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_id": {
            "type": "string",
            "description": "ID unik berkas Google Drive."
          }
        },
        "required": ["file_id"]
      }
    }
  }
]
```
