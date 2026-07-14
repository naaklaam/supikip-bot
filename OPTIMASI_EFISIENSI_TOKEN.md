# OPTIMASI EFISIENSI TOKEN — Speaki Bot
**Target:** 6-8k/turn → **4-5k/turn** (~35-40% penghematan)

---

## POIN 1: Tool Descriptions — Minimalisir

### Masalah
Setiap tool punya deskripsi panjang (30-50 kata) yang dikirim setiap pesan. Padahal LLM modern bisa infer dari nama tool + parameter.

### Solusi
Persingkat description ke 5-10 kata maks. Hapus boilerplate.

### Contoh Sebelum → Sesudah

| Tool | Sebelum | Sesudah |
|------|---------|---------|
| `web_search` | "Mencari informasi terbaru atau hal yang tidak diketahui dari internet menggunakan DuckDuckGo." | "Cari info dari web." |
| `web_fetch` | "Mengambil (fetch) isi konten tekstual dari URL/halaman web spesifik untuk dibaca." | "Ambil konten HTML dari URL." |
| `get_system_status` | "Mendapatkan data status performa server PC (RAM, CPU load, uptime sistem). Hanya boleh diakses oleh pemilik bot (JO)." | "Cek status server (RAM/CPU/uptime). Hanya JO." |

### Estimasi Hemat
~100-150 token per pesan × N tools (11 tools) = **~1.100-1.600 token saved/turn**

### Eksekusi
- Path: rewrite definisi tools di level sistem (bukan file user)
- Bisa langsung gue lakukan di sisi gue — tinggal lo approve format barunya

---

## POIN 2: File Konteks Statis — Session Caching

### Masalah
AGENTS.md (~2.500 token), SOUL.md (~400 token), IDENTITY.md (~150 token) dikirim ulang setiap pesan walau isinya jarang berubah.

### Solusi
**Tingkat 1 — Dedup (Mudah):**
- Gabung AGENTS.md + IDENTITY.md + SOUL.md jadi satu file `CORE_IDENTITY.md`
- Hapus overlap konten (banyak aturan berulang di AGENTS.md vs SOUL.md)

**Tingkat 2 — Session Cache (Lumayan):**
- Jika platform mensupport persistent session (sesi tidak hilang antar pesan), kirim core identity hanya sekali di awal sesi
- Pesan selanjutnya cukup kirim delta (history + instruction baru) — hemat ~3.000 token/turn

**Tingkat 3 — Embedding (Berat):**
- Simpan core identity sebagai vector embedding
- Retrieve hanya bagian relevan berdasarkan intent pesan
- Butuh vector DB lokal (Chroma/lance) — overhead maintenance

### Estimasi Hemat
- Tingkat 1: ~500-800 token saved/turn (dari overlap removal)
- Tingkat 2: ~2.500-3.000 token saved/turn (cache full)
- Tingkat 3: ~3.500+ token saved/turn (retrieval-based)

### Rekomendasi
**Mulai dari Tingkat 1 + 2.** Tingkat 3 terlalu berat untuk ROI saat ini.

---

## POIN 3: Pruning History — Context Window Management

### Masalah
History percakapan menumpuk tiap pesan. 1 turn = ~500-800 token. Setelah 10 pesan = 5.000-8.000 token terbuang untuk konteks lama.

### Solusi

**Strategi — Sliding Window + Summarization:**

```
Threshold: 10 pesan (atau ~6.000 token history)
├─ < threshold → kirim raw history (seperti biasa)
└─ ≥ threshold →
   ├─ Ambil 4 pesan terakhir (detail penuh)
   ├─ Sisanya (pesan 1 sampai N-4) → summarization jadi 1-2 kalimat
   └─ Inject summary + 4 pesan terakhir
```

**Contoh summary:**
> "JO sebelumnya nanya ttg perbandingan OpenClaw vs n8n, lalu optimasi token. Udah diskusi hybrid approach dan 4 poin optimasi."

### Format Storage
Simpan di `memory/session-summary.json` — overwrite tiap kali pruning terjadi.

### Estimasi Hemat
Setelah 10+ pesan: **~3.000-5.000 token saved/turn** (daripada kirim 10 pesan penuh, cukup summary + 4 pesan terakhir)

### Trigger
- **Heartbeat:** Lakukan pruning otomatis tiap 5-10 pesan
- **Manual:** Lo bisa bilang "pruning now"

---

## POIN 4: Routing Logic — Short-circuit untuk Task Ringan

### Masalah
Task simpel (kirim stiker, cek jam, jawab "iya/tidak") tetap panggil LLM process penuh — 5-7k token terbuang.

### Solusi
Buat **pre-processor layer** yang screening intent sebelum masuk ke LLM penuh:

```
Input pesan
   │
   ├─ Match: "stiker" / "sticker" → trigger send_sticker_response → SKIP LLM
   ├─ Match: "cek jam" / "jam berapa" → trigger get_system_status → SKIP LLM
   ├─ Match: "ping" / "test" / "ok" → reply "OK" → SKIP LLM
   ├─ Match: [0-9]+ menit -> set_one_shot_reminder → SKIP LLM
   │
   └─ No match → proses LLM penuh
```

### Routing Table

| Pattern | Action | Token Cost |
|---------|--------|------------|
| stiker / sticker / ekspresi | send_sticker_response | ~50 token |
| jam / waktu / pukul | get_system_status → ambil timestamp | ~80 token |
| ping / pong / test | reply "Pong." / "OK." | ~30 token |
| ingatkan [X] dalam [N] menit | set_one_shot_reminder | ~60 token |
| shut up / diam / stop | ignore / sleep mode | ~20 token |
| *lainnya* | Full LLM process | 4-5k token |

### Estimasi Hemat
~30-40% pesan adalah task ringan → tiap pesan itu hemat **5.000-6.000 token**
Rata-rata: **~1.500-2.000 token saved/turn** (weighted average)

### Eksekusi
Ini perlu diimplementasikan di layer routing bot (bukan di LLM prompt).
Butuh kode Python/JS untuk pattern matching sebelum request dikirim ke API.

---

## RINGKASAN: Estimated Total Savings

| Poin | Token Saved/Turn | Prioritas | Effort |
|------|------------------|-----------|--------|
| 1. Tool descriptions | ~1.500 | 🔴 Tinggi | Rendah |
| 2. Session caching (T1+T2) | ~3.500 | 🔴 Tinggi | Sedang |
| 3. Pruning history | ~4.000 | 🟡 Sedang | Sedang |
| 4. Routing logic | ~1.750 | 🟢 Opsional | Tinggi |
| **Total potensi** | **~10.750/turn** | | |

**Catatan:** Angka tidak 100% kumulatif karena overlap. Tapi realistic estimate: **dari 7k → 4k/turn** (~43% hemat).

---

## MILESTONE IMPLEMENTASI

### Fase 1 — Quick Wins (Hari 1-2)
- ✅ Poin 1: Singkatkan semua tool descriptions
- ✅ Poin 2 T1: Merge & dedup core identity files
- ⏱ Hemat estimasi: ~2.000 token/turn

### Fase 2 — Struktural (Hari 3-5)
- ✅ Poin 2 T2: Implement session caching / delta-only
- ✅ Poin 3: Implement sliding window + summarization
- ⏱ Hemat estimasi: ~5.000 token/turn kumulatif

### Fase 3 — Advanced (Minggu 2)
- ✅ Poin 4: Build & deploy routing logic layer
- ✅ Fine-tune pruning threshold berdasarkan data real
- ⏱ Hemat estimasi: ~7.000 token/turn kumulatif

---

## METRIK MONITORING

Track tiap hari:
- Total token input per hari
- Rata-rata token per turn
- Jumlah pesan / turn per hari
- Jumlah routing hits (task ringan yg gak panggil LLM)
- Cost estimasi (pakai rate OpenRouter/model terpakai)

Simpan di `memory/token-stats.json` — gue auto-maintain via heartbeat.