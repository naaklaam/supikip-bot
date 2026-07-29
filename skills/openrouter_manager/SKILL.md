---
name: openrouter_manager
description: Memantau saldo kredit (credit balance) dan riwayat penggunaan API OpenRouter untuk model AI (khusus Owner/JO).
---

# OpenRouter Manager Skill

Skill ini memungkinkan bot (khusus jika diperintahkan oleh Owner/JO) untuk memeriksa sisa kredit atau limit penggunaan kunci API OpenRouter mereka melalui OOMOL OpenConnector.

```json
[
  {
    "type": "function",
    "function": {
      "name": "openrouter_get_balance",
      "description": "Mendapatkan ringkasan sisa saldo kredit aktif serta total penggunaan OpenRouter.",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "openrouter_get_key_details",
      "description": "Mendapatkan metadata detail dari kunci API OpenRouter aktif (termasuk status aktif, limit, dan usage).",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  }
]
```
