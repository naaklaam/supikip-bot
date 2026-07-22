import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'group_names.json');

/**
 * Membaca data cache nama grup dari file JSON secara sinkron
 * @returns {Object} map JID -> nama grup
 */
export function getCachedGroupNames() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Mengunduh daftar semua grup yang diikuti bot dan memperbarui cache file lokal
 * @param {Object} sock - Baileys socket instance
 * @returns {Promise<Object>} map JID -> nama grup terbaru
 */
export async function updateGroupNamesCache(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const mapping = {};
    for (const jid of Object.keys(groups)) {
      const name = groups[jid].subject;
      if (name) {
        mapping[jid] = name;
      }
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(mapping, null, 2));
    return mapping;
  } catch (err) {
    console.error('[Group Resolver] Gagal memperbarui cache nama grup:', err.message);
    return getCachedGroupNames();
  }
}

/**
 * Mengonversi array nama grup menjadi array JID berdasarkan data cache
 * @param {string[]} namesArray
 * @returns {string[]} array JID
 */
export function getJidsFromGroupNames(namesArray) {
  const cache = getCachedGroupNames();
  const jids = [];
  const normalizedNames = namesArray.map(n => n.toLowerCase().trim());
  
  for (const jid of Object.keys(cache)) {
    const name = cache[jid].toLowerCase().trim();
    if (normalizedNames.includes(name)) {
      jids.push(jid);
    }
  }
  return jids;
}
