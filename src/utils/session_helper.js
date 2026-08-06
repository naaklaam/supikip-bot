import dotenv from 'dotenv';
import { getJidsFromGroupNames } from './group_resolver.js';
dotenv.config();

/**
 * Mengumpulkan semua JID grup manhwa terkonfigurasi di .env (JID langsung + Nama grup)
 * @returns {string[]}
 */
export function getManhwaGroupJids() {
  const jids = [];

  // 1. Ambil dari JID langsung
  if (process.env.MANHWA_GROUP_JID) {
    process.env.MANHWA_GROUP_JID.split(',')
      .map(j => j.trim())
      .filter(Boolean)
      .forEach(j => {
        if (!jids.includes(j)) jids.push(j);
      });
  }

  // 2. Ambil dari nama grup (resolusi via cache JSON)
  if (process.env.MANHWA_GROUP_NAMES) {
    const names = process.env.MANHWA_GROUP_NAMES.split(',').map(n => n.trim()).filter(Boolean);
    const resolvedJids = getJidsFromGroupNames(names);
    resolvedJids.forEach(j => {
      if (!jids.includes(j)) jids.push(j);
    });
  }

  // 3. Fallback ke TARGET_GROUPS jika MANHWA_GROUP_JID / MANHWA_GROUP_NAMES tidak diset
  if (jids.length === 0 && process.env.TARGET_GROUPS) {
    process.env.TARGET_GROUPS.split(',')
      .map(j => j.trim())
      .filter(Boolean)
      .forEach(j => {
        if (!jids.includes(j)) jids.push(j);
      });
  }

  return jids;
}

/**
 * Memetakan JID obrolan ke JID sesi bersama jika terdaftar di grup manhwa
 * @param {string} jid
 * @returns {string}
 */
export function getSessionJid(jid) {
  return jid;
}
