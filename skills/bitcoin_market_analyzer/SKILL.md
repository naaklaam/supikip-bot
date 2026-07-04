# Bitcoin Market Analyzer Skill

Definisi skema pemanggilan fungsi analisis market Bitcoin (ETF inflow/outflow & likuidasi data).

```json
{
  "type": "function",
  "function": {
    "name": "analyze_bitcoin_market",
    "description": "Mengambil data market Bitcoin terbaru (aliran bersih harian ETF dari Farside/Coinglass dan data total likuidasi 24 jam terakhir dari Coinglass).",
    "parameters": {
      "type": "object",
      "properties": {
        "target_metric": {
          "type": "string",
          "enum": ["all", "etf", "liquidation"],
          "description": "Metrik market spesifik yang ingin dianalisis. Defaultnya adalah 'all'."
        }
      },
      "required": []
    }
  }
}
```
