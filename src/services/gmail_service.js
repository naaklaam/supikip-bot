import fs from 'fs';
import path from 'path';

const privateDataDir = path.join(process.cwd(), 'private_data');
const tokenPath = path.join(privateDataDir, 'gmail_tokens.json');

/**
 * Mendapatkan credentials client secret secara dinamis
 */
function getClientCredentials() {
  if (!fs.existsSync(privateDataDir)) {
    throw new Error('Folder private_data tidak ditemukan!');
  }
  const files = fs.readdirSync(privateDataDir);
  const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
  if (!secretFile) {
    throw new Error('Berkas client_secret_*.json tidak ditemukan di folder private_data!');
  }
  const secretPath = path.join(privateDataDir, secretFile);
  return JSON.parse(fs.readFileSync(secretPath, 'utf-8')).installed;
}

/**
 * Mengambil token akses aktif, menyegarkan (refresh) jika sudah kedaluwarsa secara otomatis
 */
export async function getAccessToken() {
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Supikip belum terotorisasi ke Gmail! Jalankan helper: node src/utils/gmail_auth_helper.js');
  }

  let tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  const credentials = getClientCredentials();
  
  const created_at = tokens.created_at || 0;
  const expires_in = tokens.expires_in || 3600;
  const isExpired = Date.now() > (created_at + expires_in * 1000 - 60000); // refresh jika sisa < 1 menit

  if (isExpired && tokens.refresh_token) {
    console.log('[Gmail Service] Token kedaluwarsa. Mencoba menyegarkan token...');
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      const newTokens = await response.json();
      if (newTokens.error) {
        throw new Error(newTokens.error_description || newTokens.error);
      }

      // Update token baru dan pertahankan refresh_token lama jika tidak dikembalikan
      tokens = {
        ...tokens,
        ...newTokens,
        created_at: Date.now()
      };

      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
      console.log('[Gmail Service] Token berhasil diperbarui.');
    } catch (err) {
      console.error('[Gmail Service] Gagal me-refresh token:', err.message);
      throw new Error(`Gagal menyegarkan kredensial Gmail: ${err.message}`);
    }
  }

  return tokens.access_token;
}

/**
 * List pesan dari Gmail Inbox
 * @param {string} query - Kueri pencarian Gmail (misal: 'is:inbox')
 * @param {number} maxResults - Jumlah hasil maksimal
 */
export async function listGmailMessages(query = 'is:inbox', maxResults = 10) {
  const accessToken = await getAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?` + new URLSearchParams({
    q: query,
    maxResults: maxResults.toString()
  }).toString();

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Gmail API Error: ${response.statusText} (${JSON.stringify(errData)})`);
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Mengambil detail konten email dan menyaring isi bodinya
 * @param {string} messageId - ID pesan Gmail
 */
export async function getGmailMessageDetails(messageId) {
  const accessToken = await getAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil detail email: ${response.statusText}`);
  }

  const data = await response.json();
  const headers = data.payload?.headers || [];

  const getHeader = (name) => {
    const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  const from = getHeader('From');
  const subject = getHeader('Subject');
  const date = getHeader('Date');
  
  // Ambil body teks dan bersihkan
  let body = parseGmailBody(data.payload);
  
  // Potong isi body maksimal 1500 karakter agar hemat token LLM
  if (body.length > 1500) {
    body = body.slice(0, 1500) + '\n... (Konten dipotong karena terlalu panjang) ...';
  }

  return {
    id: data.id,
    threadId: data.threadId,
    from,
    subject,
    date,
    body: body || '[Tidak ada konten teks]'
  };
}

/**
 * Memodifikasi label email (arsip/archive, tandai dibaca, dll)
 */
export async function modifyGmailLabels(messageId, addLabelIds = [], removeLabelIds = []) {
  const accessToken = await getAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ addLabelIds, removeLabelIds })
  });

  if (!response.ok) {
    throw new Error(`Gagal memodifikasi label email: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Memindahkan email ke folder Trash (Sampah)
 */
export async function trashGmailMessage(messageId) {
  const accessToken = await getAccessToken();
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Gagal membuang email: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Parser rekursif body pesan Gmail (MIME)
 */
function parseGmailBody(payload) {
  const decodeBase64Url = (str) => {
    if (!str) return '';
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    try {
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (e) {
      return '';
    }
  };

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  if (payload.parts && payload.parts.length > 0) {
    // 1. Cari text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    
    // 2. Cari text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
    
    // 3. Rekursif bagian terdalam
    for (const part of payload.parts) {
      if (part.parts) {
        const nestedText = parseGmailBody(part);
        if (nestedText) return nestedText;
      }
    }
  }

  return '';
}

/**
 * Pembersih HTML Tag Sederhana
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // css
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // js
    .replace(/<[^>]+>/g, ' ') // tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ') // whitespace
    .trim();
}
