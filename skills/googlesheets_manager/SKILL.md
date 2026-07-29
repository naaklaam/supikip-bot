---
name: googlesheets_manager
description: Mengelola data Google Sheets pengguna (khusus Owner/JO) seperti membaca rentang cell (cells), menambah baris baru (append), atau memperbarui isi tabel.
---

# Google Sheets Manager Skill

Skill ini memungkinkan bot (khusus jika diperintahkan oleh Owner/JO) untuk membaca, memperbarui, atau menambahkan baris baru ke dokumen Google Sheets mereka melalui OOMOL OpenConnector.

```json
[
  {
    "type": "function",
    "function": {
      "name": "googlesheets_append_row",
      "description": "Menambahkan baris data baru ke dalam spreadsheet (cocok untuk mencatat pengeluaran, log, atau to-do list).",
      "parameters": {
        "type": "object",
        "properties": {
          "spreadsheet_id": {
            "type": "string",
            "description": "ID Spreadsheet Google Sheets atau URL lengkap Spreadsheet tersebut."
          },
          "range": {
            "type": "string",
            "description": "Rentang A1 notation target (contoh: 'Sheet1!A1', 'Pengeluaran!A1')."
          },
          "values": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "description": "Matriks data dua dimensi berisi nilai yang ingin ditambahkan (contoh: [['2026-07-30', 'Makan Siang', '50000']])."
          }
        },
        "required": ["spreadsheet_id", "range", "values"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "googlesheets_read_range",
      "description": "Membaca isi data dari tabel/rentang koordinat cell tertentu di Google Sheets.",
      "parameters": {
        "type": "object",
        "properties": {
          "spreadsheet_id": {
            "type": "string",
            "description": "ID Spreadsheet Google Sheets atau URL lengkap Spreadsheet tersebut."
          },
          "range": {
            "type": "string",
            "description": "Rentang A1 notation koordinat cell yang ingin dibaca (contoh: 'Sheet1!A1:C10')."
          }
        },
        "required": ["spreadsheet_id", "range"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "googlesheets_update_range",
      "description": "Menulis atau menimpa (overwrite) data pada rentang cell tertentu di Google Sheets.",
      "parameters": {
        "type": "object",
        "properties": {
          "spreadsheet_id": {
            "type": "string",
            "description": "ID Spreadsheet Google Sheets atau URL lengkap Spreadsheet tersebut."
          },
          "range": {
            "type": "string",
            "description": "Rentang A1 notation koordinat cell target (contoh: 'Sheet1!A1:B2')."
          },
          "values": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "description": "Matriks data dua dimensi berisi nilai pengganti."
          }
        },
        "required": ["spreadsheet_id", "range", "values"]
      }
    }
  }
]
```
