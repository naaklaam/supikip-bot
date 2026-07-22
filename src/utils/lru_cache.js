/**
 * Simple LRU Cache implementation
 * Reduces database query overhead for frequently accessed data
 */

class SimpleLRUCache {
  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.accessCounter = 0;
  }

  /**
   * Generate cache key from function arguments
   */
  _makeKey(...args) {
    return JSON.stringify(args);
  }

  /**
   * Get item from cache
   * @returns {object|null} - { value, timestamp } or null
   */
  get(...args) {
    const key = this._makeKey(...args);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }
    
    // Update access order for LRU
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);
    
    return entry.value;
  }

  /**
   * Set item in cache
   */
  set(...args) {
    const key = this._makeKey(...args);
    const value = args[args.length - 1]; // Last arg is the value
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);
  }

  /**
   * Evict the least recently used item
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestOrder = Infinity;
    
    for (const [key, order] of this.accessOrder) {
      if (order < oldestOrder) {
        oldestOrder = order;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }
}

// Export singleton instances for different query types
export const stickerCache = new SimpleLRUCache(50, 5 * 60 * 1000); // 50 stickers, 5min TTL
export const searchCache = new SimpleLRUCache(100, 2 * 60 * 1000); // 100 searches, 2min TTL
export const factCache = new SimpleLRUCache(100, 10 * 60 * 1000); // 100 facts, 10min TTL