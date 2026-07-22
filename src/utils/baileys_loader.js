/**
 * Lazy loader for @itsliaaa/baileys modules
 * Reduces memory footprint by only loading baileys when actually needed
 */

// Cache for loaded modules
const moduleCache = new Map();

// Cached exports - populated on first load
let _exports = null;
let _loadPromise = null;

/**
 * Ensures baileys is loaded and returns cached exports
 * @returns {Promise<object>} - The baileys module exports
 */
async function ensureLoaded() {
  if (_exports) return _exports;
  
  if (!_loadPromise) {
    _loadPromise = (async () => {
      const module = await import('@itsliaaa/baileys');
      _exports = module;
      moduleCache.set('main', module);
      return module;
    })();
  }
  
  return _loadPromise;
}

/**
 * Gets specific baileys export by name (async)
 * @param {string} exportName - Name of the export to get
 * @returns {Promise<any>} - The requested export
 */
export async function getBaileysExport(exportName) {
  const module = await ensureLoaded();
  if (!module[exportName]) {
    throw new Error(`Baileys export '${exportName}' not found`);
  }
  return module[exportName];
}

/**
 * Gets Browsers object (async)
 */
export async function getBrowsers() {
  const module = await ensureLoaded();
  return module.Browsers;
}

/**
 * Gets DisconnectReason object (async)
 */
export async function getDisconnectReason() {
  const module = await ensureLoaded();
  return module.DisconnectReason;
}

/**
 * Gets makeWASocket function (async)
 */
export async function getMakeWASocket() {
  const module = await ensureLoaded();
  return module.makeWASocket;
}

/**
 * Gets useMultiFileAuthState function (async)
 */
export async function getUseMultiFileAuthState() {
  const module = await ensureLoaded();
  return module.useMultiFileAuthState;
}

/**
 * Gets downloadMediaMessage function (async)
 */
export async function getDownloadMediaMessage() {
  const module = await ensureLoaded();
  return module.downloadMediaMessage;
}

/**
 * Gets jidNormalizedUser function (async)
 */
export async function getJidNormalizedUser() {
  const module = await ensureLoaded();
  return module.jidNormalizedUser;
}

/**
 * Gets all cached baileys exports (for sync access after initialization)
 * Returns a proxy that lazily resolves promises on first use
 */
export function getCachedExports() {
  if (_exports) return _exports;
  // Return a proxy that will throw if called before load
  return new Proxy({}, {
    get(target, prop) {
      if (!_exports) {
        throw new Error(`Baileys not yet loaded. Call an async getter first.`);
      }
      return _exports[prop];
    }
  });
}