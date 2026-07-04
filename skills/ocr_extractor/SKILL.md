# OCR Extractor Skill

Definisi skema pemanggilan fungsi OCR untuk mengekstrak teks dari berkas gambar lokal.

```json
{
  "type": "function",
  "function": {
    "name": "extract_text_from_image",
    "description": "Mengekstrak seluruh teks tekstual dari berkas gambar lokal menggunakan model penglihatan multimodal AI.",
    "parameters": {
      "type": "object",
      "properties": {
        "image_path": {
          "type": "string",
          "description": "Jalur lokasi penyimpanan berkas gambar lokal di server."
        }
      },
      "required": ["image_path"]
    }
  }
}
```
