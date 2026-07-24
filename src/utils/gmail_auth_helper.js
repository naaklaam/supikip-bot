import fs from 'fs';
import path from 'path';
import readline from 'readline';

const privateDataDir = path.join(process.cwd(), 'private_data');

// Cari file client secret
if (!fs.existsSync(privateDataDir)) {
  fs.mkdirSync(privateDataDir, { recursive: true });
}

const files = fs.readdirSync(privateDataDir);
const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));

if (!secretFile) {
  console.error("Error: Berkas client_secret_*.json tidak ditemukan di folder private_data!");
  process.exit(1);
}

const secretPath = path.join(privateDataDir, secretFile);
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(secretPath, 'utf-8')).installed;
} catch (e) {
  console.error("Error: Gagal membaca berkas client secret JSON:", e.message);
  process.exit(1);
}

const { client_id, client_secret, redirect_uris } = credentials;
const redirect_uri = redirect_uris[0] || 'http://localhost';

// Scopes yang dibutuhkan: membaca, melabeli, mengarsipkan, dan membuang email
const scopes = ['https://www.googleapis.com/auth/gmail.modify'];

// Generate auth URL
const authUrl = `https://accounts.google.com/o/oauth2/auth?` + new URLSearchParams({
  client_id,
  redirect_uri,
  response_type: 'code',
  scope: scopes.join(' '),
  access_type: 'offline',
  prompt: 'consent'
}).toString();

console.log('==================================================');
console.log('      OTORISASI GMAIL UNTUK SUPIKIP BOT');
console.log('==================================================');
console.log('1. Silakan buka tautan berikut di browser Anda:\n');
console.log(authUrl);
console.log('\n2. Login dengan akun Gmail Anda dan berikan izin.');
console.log('3. Setelah selesai, browser Anda akan dialihkan ke halaman kosong (misalnya http://localhost/?code=xxx...)');
console.log('4. Salin SELURUH URL dari address bar browser tersebut atau salin kode setelah "code=" saja.');
console.log('==================================================');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Masukkan Kode atau URL Redirect lengkap: ', async (input) => {
  rl.close();
  
  let code = input.trim();
  if (code.includes('code=')) {
    try {
      const url = new URL(code);
      code = url.searchParams.get('code');
    } catch (e) {
      // Jika bukan URL valid, coba parsing manual split
      const match = code.match(/[?&]code=([^&]+)/);
      if (match) {
        code = match[1];
      }
    }
  }

  if (!code) {
    console.error('Error: Kode otorisasi tidak valid atau tidak ditemukan!');
    process.exit(1);
  }

  console.log('\nMencoba menukar kode otorisasi dengan token...');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id,
        client_secret,
        redirect_uri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await response.json();
    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Catat waktu dibuatnya token agar tahu kapan kedaluwarsa
    tokens.created_at = Date.now();

    const tokenSavePath = path.join(privateDataDir, 'gmail_tokens.json');
    fs.writeFileSync(tokenSavePath, JSON.stringify(tokens, null, 2), 'utf-8');
    console.log('==================================================');
    console.log('🎉 OTORISASI BERHASIL!');
    console.log(`Token berhasil disimpan ke: ${tokenSavePath}`);
    console.log('Anda sekarang bisa menjalankan bot dan menggunakan fitur Gmail.');
    console.log('==================================================');
  } catch (err) {
    console.error('Gagal mendapatkan token:', err.message);
  }
});
