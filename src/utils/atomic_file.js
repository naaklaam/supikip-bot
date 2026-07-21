import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const LOCK_TIMEOUT_MS = 2000;

function makeTempPath(absolutePath) {
  return `${absolutePath}.tmp.${Date.now()}.${randomBytes(8).toString('hex')}`;
}

function acquireLock(absolutePath) {
  const lockPath = `${absolutePath}.lock`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      return { fd, lockPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      // Hapus stale lock file jika umurnya lebih dari 5 detik
      try {
        const stats = fs.statSync(lockPath);
        if (Date.now() - stats.mtimeMs > 5000) {
          fs.unlinkSync(lockPath);
        }
      } catch (_) {}
    }
  }

  return null;
}

function releaseLock(lockState) {
  if (!lockState) return;

  try {
    if (lockState.fd) fs.closeSync(lockState.fd);
  } catch (_) {}

  try {
    if (lockState.lockPath && fs.existsSync(lockState.lockPath)) {
      fs.unlinkSync(lockState.lockPath);
    }
  } catch (_) {}
}

function fsyncDirectory(dirPath) {
  try {
    const fd = fs.openSync(dirPath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    // Beberapa filesystem tidak mendukung fsync direktori. Rename tetap atomik.
  }
}

function writeTempFile(tempPath, content) {
  const fd = fs.openSync(tempPath, 'wx');
  try {
    fs.writeFileSync(fd, content, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function cleanupTempFile(tempPath) {
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (_) {}
}

/**
 * Menulis data JSON ke berkas secara atomik (temporary file + rename).
 * Mencegah file terkorupsi jika proses terputus di tengah jalan.
 * @param {string} filePath - Jalur absolut atau relatif ke berkas target
 * @param {any} data - Objek atau array data yang akan disimpan sebagai JSON
 * @param {number} [indent=2] - Indentasi format JSON
 */
export function atomicWriteJsonSync(filePath, data, indent = 2) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = makeTempPath(absolutePath);
  const lockState = acquireLock(absolutePath);

  try {
    const content = JSON.stringify(data, null, indent);
    writeTempFile(tempPath, content);
    fs.renameSync(tempPath, absolutePath);
    fsyncDirectory(dir);
  } catch (err) {
    cleanupTempFile(tempPath);
    throw err;
  } finally {
    releaseLock(lockState);
  }
}

/**
 * Menulis konten teks biasa ke berkas secara atomik (temporary file + rename).
 * @param {string} filePath - Jalur berkas target
 * @param {string} content - Teks konten yang akan ditulis
 */
export function atomicWriteFileSync(filePath, content) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = makeTempPath(absolutePath);
  const lockState = acquireLock(absolutePath);

  try {
    writeTempFile(tempPath, content);
    fs.renameSync(tempPath, absolutePath);
    fsyncDirectory(dir);
  } catch (err) {
    cleanupTempFile(tempPath);
    throw err;
  } finally {
    releaseLock(lockState);
  }
}
