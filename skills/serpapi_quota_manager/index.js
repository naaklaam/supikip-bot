import fs from 'fs';
import path from 'path';

const SERPAPI_QUOTA_FILE = path.join(process.cwd(), 'serpapi_quota.json');

function getQuotaData() {
  let quota = { total_limit: 100, usage_count: 0, last_updated: new Date().toISOString() };
  if (fs.existsSync(SERPAPI_QUOTA_FILE)) {
    try {
      quota = JSON.parse(fs.readFileSync(SERPAPI_QUOTA_FILE, 'utf-8'));
    } catch (e) {
      console.error('[SerpAPI Quota Manager] Gagal memparsing file quota:', e.message);
    }
  }
  return quota;
}

function saveQuotaData(quota) {
  fs.writeFileSync(SERPAPI_QUOTA_FILE, JSON.stringify(quota, null, 2), 'utf-8');
}

export async function execute(args, sock) {
  const { action, usage_count, total_limit } = args;
  let quota = getQuotaData();

  if (action === 'update') {
    if (usage_count !== undefined) {
      quota.usage_count = usage_count;
    }
    if (total_limit !== undefined) {
      quota.total_limit = total_limit;
    }
    quota.last_updated = new Date().toISOString();
    saveQuotaData(quota);

    const remaining = Math.max(0, quota.total_limit - quota.usage_count);
    return `✅ *Kuota SerpAPI berhasil diperbarui!*\n\n` +
           `📊 Penggunaan saat ini: *${quota.usage_count}* / *${quota.total_limit}* pencarian\n` +
           `🔑 Sisa kuota estimasi: *${remaining}* pencarian\n` +
           `⏰ Waktu pembaruan: _${new Date(quota.last_updated).toLocaleString('id-ID')}_`;
  }

  // default action is 'view'
  const remaining = Math.max(0, quota.total_limit - quota.usage_count);
  return `📊 *Status Estimasi Kuota SerpAPI*:\n\n` +
         `🔄 Terpakai: *${quota.usage_count}* pencarian\n` +
         `🏁 Total Limit: *${quota.total_limit}* pencarian\n` +
         `🔑 Sisa Kuota: *${remaining}* pencarian\n` +
         `⏰ Diperbarui pada: _${new Date(quota.last_updated).toLocaleString('id-ID')}_`;
}
