import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { stickerCache, searchCache, factCache } from '../utils/lru_cache.js';

const DB_PATH = path.join(process.cwd(), 'speaki.db');

// Inisialisasi database SQLite3 secara otomatis jika belum ada.
// Fungsi ini harus dipanggil dengan await sebelum fitur yang memakai memori dijalankan.
export function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);

      const statements = [
        'PRAGMA journal_mode = WAL',
        'PRAGMA busy_timeout = 5000',
        'PRAGMA foreign_keys = ON',
        `
        CREATE TABLE IF NOT EXISTS stickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE NOT NULL,
          tag TEXT DEFAULT 'general',
          added_by TEXT NOT NULL,
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE TABLE IF NOT EXISTS chat_messages_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          jid TEXT NOT NULL,
          sender_name TEXT,
          sender_jid TEXT,
          message_text TEXT NOT NULL,
          is_bot INTEGER DEFAULT 0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          jid, sender_name, message_text, content='chat_messages_history', content_rowid='id'
        )
        `,
        `
        CREATE TRIGGER IF NOT EXISTS messages_fts_after_insert AFTER INSERT ON chat_messages_history BEGIN
          INSERT INTO messages_fts(rowid, jid, sender_name, message_text) VALUES (new.id, new.jid, new.sender_name, new.message_text);
        END;
        `,
        `
        CREATE TABLE IF NOT EXISTS long_term_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT DEFAULT 'general',
          key_topic TEXT NOT NULL,
          value_fact TEXT NOT NULL,
          source_jid TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        `,
        `
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          category, key_topic, value_fact, content='long_term_memories', content_rowid='id'
        )
        `,
        `
        CREATE TRIGGER IF NOT EXISTS memories_fts_after_insert AFTER INSERT ON long_term_memories BEGIN
          INSERT INTO memories_fts(rowid, category, key_topic, value_fact) VALUES (new.id, new.category, new.key_topic, new.value_fact);
        END;
        `
      ];

      let pending = statements.length;
      let firstError = null;

      db.serialize(() => {
        statements.forEach((sql) => {
          db.run(sql, (err) => {
            if (err && !firstError) firstError = err;
            pending -= 1;

            if (pending === 0) {
              db.close(() => {
                if (firstError) return reject(firstError);
                resolve(true);
              });
            }
          });
        });
      });
    });
  });
}

/**
 * Mencatat stiker baru ke database SQLite
 */
export function registerSticker(filename, tag, addedBy) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(
      `INSERT OR IGNORE INTO stickers (filename, tag, added_by) VALUES (?, ?, ?)`,
      [filename, tag, addedBy],
      function (err) {
        db.close();
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

/**
 * Menambahkan jumlah penggunaan stiker dan mengembalikan datanya secara acak berdasarkan tag
 */
export function getRandomStickerByTag(tag) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);

    let query = `SELECT * FROM stickers`;
    let params = [];

    if (tag && tag !== 'all' && tag !== 'random') {
      query += ` WHERE tag = ?`;
      params.push(tag);
    }

    query += ` ORDER BY RANDOM() LIMIT 1`;

    db.get(query, params, (err, row) => {
      if (err) {
        db.close();
        return reject(err);
      }

      if (!row) {
        db.close();
        return resolve(null);
      }

      db.run(
        `UPDATE stickers SET usage_count = usage_count + 1 WHERE id = ?`,
        [row.id],
        (updateErr) => {
          db.close();
          if (updateErr) console.error(`[DB Error] Gagal update statistik stiker id ${row.id}:`, updateErr.message);
          resolve(row);
        }
      );
    });
  });
}

/**
 * Mendapatkan data statistik penggunaan seluruh stiker untuk dilaporkan
 */
export function getStickerStats() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(
      `SELECT id, filename, tag, usage_count, added_by FROM stickers ORDER BY usage_count DESC LIMIT 10`,
      [],
      (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * Menyimpan riwayat pesan obrolan ke database SQLite
 */
export function saveChatMessage(jid, senderName, senderJid, messageText, isBot = 0) {
  return new Promise((resolve) => {
    if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') return resolve(null);
    const db = new sqlite3.Database(DB_PATH);
    db.run(
      `INSERT INTO chat_messages_history (jid, sender_name, sender_jid, message_text, is_bot) VALUES (?, ?, ?, ?, ?)`,
      [jid, senderName || 'Unknown', senderJid || jid, messageText.trim(), isBot ? 1 : 0],
      function (err) {
        db.close();
        if (err) console.error('[Memory DB Error] saveChatMessage:', err.message);
        resolve(this?.lastID || null);
      }
    );
  });
}

/**
 * Mencari riwayat pesan lampau menggunakan SQLite FTS5 (Full-Text Search)
 * Dengan caching untuk mengurangi query berulang
 */
export function searchChatMessageHistory(query, targetJid = null, limit = 5) {
  return new Promise((resolve) => {
    if (!query || typeof query !== 'string') return resolve([]);
    const cleanQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    if (!cleanQuery) return resolve([]);

    // Check cache first
    const cacheKey = `search:${cleanQuery}:${targetJid || 'all'}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return resolve(cached);
    }

    const db = new sqlite3.Database(DB_PATH);
    let sql = `
      SELECT h.id, h.jid, h.sender_name, h.message_text, h.is_bot, h.timestamp
      FROM messages_fts f
      JOIN chat_messages_history h ON f.rowid = h.id
      WHERE messages_fts MATCH ?
    `;
    let params = [cleanQuery];

    if (targetJid) {
      sql += ` AND h.jid = ?`;
      params.push(targetJid);
    }

    sql += ` ORDER BY h.timestamp DESC LIMIT ?`;
    params.push(limit);

    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) {
        console.error('[Memory DB Error] searchChatMessageHistory:', err.message);
        return resolve([]);
      }
      // Cache the result
      searchCache.set(cacheKey, rows || []);
      resolve(rows || []);
    });
  });
}

/**
 * Menyimpan memori fakta jangka panjang baru ke database SQLite
 */
export function saveLongTermFact(category, keyTopic, valueFact, sourceJid = null) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(
      `INSERT INTO long_term_memories (category, key_topic, value_fact, source_jid) VALUES (?, ?, ?, ?)`,
      [category || 'general', keyTopic, valueFact, sourceJid],
      function (err) {
        db.close();
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Mencari fakta memori jangka panjang menggunakan SQLite FTS5
 * Dengan caching untuk mengurangi query berulang
 */
export function searchLongTermFact(query, limit = 5) {
  return new Promise((resolve) => {
    if (!query || typeof query !== 'string') return resolve([]);
    const cleanQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    if (!cleanQuery) return resolve([]);

    // Check cache first
    const cacheKey = `fact:${cleanQuery}:${limit}`;
    const cached = factCache.get(cacheKey);
    if (cached) {
      return resolve(cached);
    }

    const db = new sqlite3.Database(DB_PATH);
    const sql = `
      SELECT m.id, m.category, m.key_topic, m.value_fact, m.created_at
      FROM memories_fts f
      JOIN long_term_memories m ON f.rowid = m.id
      WHERE memories_fts MATCH ?
      ORDER BY m.created_at DESC LIMIT ?
    `;

    db.all(sql, [cleanQuery, limit], (err, rows) => {
      db.close();
      if (err) {
        console.error('[Memory DB Error] searchLongTermFact:', err.message);
        return resolve([]);
      }
      // Cache the result
      factCache.set(cacheKey, rows || []);
      resolve(rows || []);
    });
  });
}

/**
 * Mengambil konteks memori FTS5 yang relevan secara otomatis berdasarkan prompt pesan pengguna
 */
export async function getRelevantMemoryContext(userQuery, targetJid = null) {
  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length < 3) {
    return '';
  }

  try {
    const facts = await searchLongTermFact(userQuery, 3);
    const msgs = await searchChatMessageHistory(userQuery, targetJid, 3);

    if (facts.length === 0 && msgs.length === 0) {
      return '';
    }

    let memoryBlock = `\n\n[RELEVAN FTS5 LONG-TERM MEMORY (DATABASE SPEAKI)]:\n`;

    if (facts.length > 0) {
      memoryBlock += `📌 *Fakta Tersimpan yang Cocok:*\n`;
      facts.forEach(f => {
        memoryBlock += `- [${f.category}] ${f.key_topic}: ${f.value_fact}\n`;
      });
    }

    if (msgs.length > 0) {
      memoryBlock += `💬 *Riwayat Pesan Lampau yang Cocok:*\n`;
      msgs.forEach(m => {
        const timeStr = new Date(m.timestamp).toLocaleDateString('id-ID');
        memoryBlock += `- [${timeStr}] ${m.sender_name || 'Pengguna'}: ${m.message_text}\n`;
      });
    }

    return memoryBlock;
  } catch (err) {
    console.error('[Memory System] Gagal menyusun konteks memori:', err.message);
    return '';
  }
}
