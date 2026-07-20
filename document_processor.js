import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const mammoth = require('mammoth');

const TEMP_DOCS_DIR = path.join(process.cwd(), 'temp_docs');

if (!fs.existsSync(TEMP_DOCS_DIR)) {
  fs.mkdirSync(TEMP_DOCS_DIR, { recursive: true });
}

/**
 * Memproses buffer dokumen yang diunduh dari WhatsApp berdasarkan ekstensi/mimetype.
 * @param {Buffer} buffer - Buffer file dari WhatsApp
 * @param {string} fileName - Nama awal file
 * @param {string} mimetype - Mimetype file
 * @returns {Promise<{ filePath: string, fileName: string, fileType: string, parsedContent: string }>}
 */
export async function processIncomingDocument(buffer, fileName, mimetype) {
  const safeFileName = (fileName || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filePath = path.join(TEMP_DOCS_DIR, safeFileName);

  // Simpan fisik file ke folder temp_docs
  fs.writeFileSync(filePath, buffer);

  // Jika berkas yang diunggah adalah cookies.txt, perbarui otomatis ke lokasi sistem
  if (safeFileName.toLowerCase().endsWith('cookies.txt')) {
    try {
      const downloadsPath = path.join(os.homedir(), 'Downloads', 'cookies.txt');
      fs.writeFileSync(downloadsPath, buffer);
      const rootPath = path.join(process.cwd(), 'cookies.txt');
      fs.writeFileSync(rootPath, buffer);
      console.log(`[Document Processor] Berkas cookies.txt diperbarui secara otomatis di ~/Downloads/ dan workspace!`);
    } catch (e) {
      console.error(`[Document Processor] Gagal auto-update cookies.txt:`, e.message);
    }
  }

  const ext = path.extname(safeFileName).toLowerCase();
  let parsedContent = '';
  let fileType = ext ? ext.replace('.', '').toUpperCase() : 'UNKNOWN';

  try {
    // 1. Berkas Teks Biasa / Kode / Data Terstruktur
    const textExtensions = [
      '.txt', '.md', '.json', '.csv', '.log', '.yaml', '.yml', '.xml',
      '.js', '.ts', '.py', '.html', '.css', '.sql', '.sh', '.c', '.cpp',
      '.h', '.java', '.ini', '.env', '.conf', '.rst', '.tex', '.properties'
    ];

    if (textExtensions.includes(ext) || mimetype?.startsWith('text/')) {
      parsedContent = buffer.toString('utf-8');
    }
    // 2. Berkas PDF
    else if (ext === '.pdf' || mimetype === 'application/pdf') {
      const pdfData = await pdf(buffer);
      parsedContent = pdfData.text || '(PDF tidak berisi teks terdeteksi)';
    }
    // 3. Berkas Excel (.xlsx, .xls, .ods)
    else if (['.xlsx', '.xls', '.ods'].includes(ext) || mimetype?.includes('spreadsheet') || mimetype?.includes('excel')) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetsText = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csvData = XLSX.utils.sheet_to_csv(sheet);
        if (csvData.trim()) {
          sheetsText.push(`--- Sheet: ${sheetName} ---\n${csvData}`);
        }
      }

      parsedContent = sheetsText.join('\n\n') || '(Excel kosong atau tidak berisi data)';
    }
    // 4. Berkas Word (.docx)
    else if (ext === '.docx' || mimetype?.includes('wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer });
      parsedContent = result.value || '(Dokumen Word kosong)';
    }
    // 5. Fallback Berkas Lain
    else {
      parsedContent = `(Berkas biner tipe ${fileType} disimpan di ${filePath}. Tidak dapat diekstraksi sebagai teks biasa secara otomatis).`;
    }
  } catch (err) {
    console.error(`[Document Processor] Gagal parsing ${safeFileName}:`, err.message);
    parsedContent = `(Gagal mengekstraksi teks dari berkas: ${err.message})`;
  }

  // Batasi panjang teks maksimal 12,000 karakter untuk menghemat token LLM
  if (parsedContent.length > 12000) {
    parsedContent = parsedContent.substring(0, 12000) + `\n\n... (Konten dipotong karena panjang. Total: ${parsedContent.length} karakter. Gunakan tools jika ingin membaca bagian lain).`;
  }

  return {
    filePath,
    fileName: safeFileName,
    fileType,
    parsedContent
  };
}
