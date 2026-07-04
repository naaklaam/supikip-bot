import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join('/home/naaklaam/Supikip', 'speaki.db');

// Inisialisasi database SQLite3 secara otomatis jika belum ada
export function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) return reject(err);
        });

        db.serialize(() => {
            // Buat tabel untuk registrasi stiker
            db.run(`
                CREATE TABLE IF NOT EXISTS stickers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT UNIQUE NOT NULL,
                    tag TEXT DEFAULT 'general',
                    added_by TEXT NOT NULL,
                    usage_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    db.close();
                    return reject(err);
                }
                db.close();
                resolve(true);
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

            // Tambahkan usage_count (statistik penggunaan)
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
