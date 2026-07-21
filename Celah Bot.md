# Celah Bot Speaki

Tanggal catatan: 2026-07-21

## Ringkasan

Repository ini memiliki beberapa celah dan masalah arsitektur kritis yang berisiko terhadap keamanan, stabilitas, maintainability, dan eskalasi otomatisasi. Temuan berikut dicatat sebagai hasil audit awal tanpa perbaikan kode.

## 1. Arsitektur monolit di `bot-speaki.js`

`bot-speaki.js` menangani terlalu banyak tanggung jawab dalam satu file: koneksi WhatsApp, scraper manhwa, cron, system prompt, memory, tool orchestration, handler pesan, OCR, document parsing, dan reconnect logic.

Dampak:

- Sulit diuji secara unit.
- Risiko regressi tinggi saat mengubah satu fitur.
- Alur LLM toolchain terlalu bergantung pada satu entrypoint.
- Sulit memisahkan keamanan, scheduler, scraper, dan handler pesan.

Bukti kode:

- Scraper: `bot-speaki.js:178`
- Cron: `bot-speaki.js:360`
- OpenRouter response loop: `bot-speaki.js:510`
- WhatsApp startup: `bot-speaki.js:628`
- Message handler: `bot-speaki.js:740`

## 2. Tool execution tidak memiliki authorization boundary yang benar

Tool seperti `write_workspace_file`, `apply_patch`, `run_terminal_command`, `add_cron_schedule`, `remove_cron_schedule`, dan `send_workspace_file` sangat powerful, tetapi eksekusinya tidak memverifikasi owner secara konsisten.

Dampak:

- Risiko command injection.
- Risiko file write arbitrary di workspace.
- Risiko modifikasi jadwal atau konfigurasi tanpa otorisasi.
- Risiko kebocoran data workspace jika bot dipercaya oleh pengguna yang tidak berhak.

Bukti kode:

- Tool definitions: `tools.js:159`, `tools.js:180`, `tools.js:197`, `tools.js:260`
- File read/write: `tools.js:559`, `tools.js:574`
- Terminal command: `tools.js:588`
- Tool router: `tools.js:931`

## 3. Dynamic skills loader tidak aman dan tidak terkontrol

Skill dimuat otomatis dari `skills/*/SKILL.md` dan `skills/*/index.js` tanpa validasi schema, capability policy, owner-only enforcement, sandboxing, atau dependency allowlist.

Dampak:

- Setiap skill baru bisa mengubah perilaku tool runtime secara langsung.
- Tidak ada pembatasan capability berdasarkan owner atau user.
- Tidak ada validasi output schema dari skill.
- Sulit melakukan audit keamanan terhadap skill dinamis.

Bukti kode:

- Dynamic loader: `tools.js:38`
- Combined schema export: `tools.js:376`
- Dynamic execution fallback: `tools.js:967`

## 4. Scraper Shinigami diduplikasi dan brittle

Logika scrape domain dan API muncul di `bot-speaki.js` dan `manga_sticker_helper.js` dengan timeout pendek serta regex hardcoded.

Dampak:

- Risiko drift antara dua implementasi.
- Maintenance tinggi.
- Kegagalan mudah terjadi saat struktur website berubah.
- Timeout pendek dapat menyebabkan false negative.

Bukti kode:

- `bot-speaki.js:66`
- `bot-speaki.js:158`
- `manga_sticker_helper.js:17`
- `manga_sticker_helper.js:101`

## 5. State management untuk cron dan scraper tidak robust

Cron dijalankan dari `schedules.json`, tetapi tool tambah/hapus jadwal hanya menulis file dan membutuhkan reconnect atau restart. Scraper juga memakai `last_manhwa.json` tanpa lock, atomic write, atau overlap protection.

Dampak:

- Race condition.
- Duplikasi job.
- Pesan update ganda saat bot idle atau reconnect.
- Perubahan cron tidak live sampai reconnect.

Bukti kode:

- Scraper state write: `bot-speaki.js:224`
- Cron scheduler: `bot-speaki.js:354`
- Cron job creation: `bot-speaki.js:391`
- Cron write tools: `tools.js:604`, `tools.js:623`

## 6. Database layer tidak konsisten

SQLite dibuka dan ditutup per operasi. Tidak ada connection pool, migration strategy, WAL, transaction policy, backup, atau concurrency handling yang jelas. `initDatabase()` juga tidak di-await saat startup.

Dampak:

- Risiko operasi database berjalan sebelum tabel siap.
- Sulit menangani concurrent writes.
- Sulit melakukan migrasi aman.
- Sulit memastikan FTS index sinkron penuh.

Bukti kode:

- Database path: `database_db.js:5`
- `initDatabase`: `database_db.js:8`
- Sticker operations: `database_db.js:95`
- Chat message save: `database_db.js:172`
- Startup not awaited: `bot-speaki.js:698`

## 7. Subagent architecture belum benar-benar subagent

`delegate_subagent` dan `delegate_parallel_subagents` hanya memanggil OpenRouter dengan prompt baru, tanpa tool access, isolasi nyata, role supervision, structured output contract, cost cap, atau provenance.

Dampak:

- Ini lebih mirip wrapper LLM call daripada arsitektur multi-agent.
- Tidak ada kontrol cost.
- Tidak ada validasi hasil subagent.
- Tidak ada provenance atau audit trail.

Bukti kode:

- `delegate_subagent`: `tools.js:767`, `tools.js:774`
- Multi-agent executor: `skills/multi_agent_delegator/index.js:53`, `skills/multi_agent_delegator/index.js:63`

## 8. Memory dan context design berisiko context bloat dan data leak

Riwayat chat hanya disimpan 10 pesan di memory, tetapi database FTS menyimpan semua pesan. Tool file read/write dapat mengakses banyak file workspace. Memory context disisipkan ke system message, bukan sebagai data terpisah dengan TTL, redaction, atau audit.

Dampak:

- Risiko kebocoran data jika tool file access salah dikontrol.
- Konteks LLM bisa membesar tanpa batas token yang jelas.
- System prompt tidak stabil karena memori disisipkan ke dalamnya.

Bukti kode:

- Chat history memory: `bot-speaki.js:437`
- Memory context retrieval: `bot-speaki.js:525`
- Memory appended to system: `bot-speaki.js:531`
- File read tool: `tools.js:559`
- Document write: `document_processor.js:29`

## 9. Concurrency dan lifecycle bot belum dikontrol

`messages.upsert` adalah async handler tanpa guard agar request tidak tumpang-tindih. Reconnect recursive `startBot()` tidak memiliki batas. Interval scraper dan cron dapat menghasilkan job ganda. `uncaughtException` hanya logging dan tidak mematikan proses dengan aman.

Dampak:

- Request chat dapat saling mengganggu.
- Scraper dan cron dapat berjalan bersamaan.
- Reconnect dapat menghasilkan instance ganda.
- Proses dapat tetap hidup dalam keadaan tidak stabil.

Bukti kode:

- Recursive reconnect: `bot-speaki.js:687`
- Chat history TTL interval: `bot-speaki.js:714`
- Scraper interval: `bot-speaki.js:731`
- Async message handler: `bot-speaki.js:740`
- Uncaught exception handler: `bot-speaki.js:1035`

## 10. Keamanan data sensitif longgar

`cookies.txt` otomatis tersinkronisasi dari upload WA ke home workspace dan digunakan oleh downloader. Tool `send_workspace_file` dan `read_workspace_file` dapat membongkar file workspace jika bot dipercaya oleh pengguna yang tidak berhak.

Dampak:

- Risiko eksfiltrasi cookie atau file sensitif.
- Risiko autentikasi platform pihak ketiga terganggu.
- Risiko kebocoran data pribadi dari workspace.

Bukti kode:

- Cookie auto-sync: `document_processor.js:31`
- Cookie lookup: `skills/social_media_downloader/index.js:33`
- Send workspace file: `tools.js:880`

## Rekomendasi Prioritas Perbaikan

1. Pisahkan `bot-speaki.js` menjadi modul terpisah untuk WhatsApp handler, OpenRouter client, tool executor, scheduler, scraper, memory, dan document processor.
2. Tambahkan security boundary dan capability policy untuk semua tool.
3. Ganti dynamic skill loader dengan registry yang divalidasi.
4. Tambahkan concurrency guard, cron overlap protection, dan graceful shutdown.
5. Perbaiki database layer dengan migration, connection pool, dan atomic state writes.
