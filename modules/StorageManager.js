/**
 * StorageManager - Centralized localStorage operations with error handling and logging
 */
class StorageManager {
  constructor(logger = null) {
    this.logger = logger;
  }

  /**
   * Load data from localStorage with error handling
   * @param {string} key - localStorage key
   * @param {*} defaultValue - Default value if key not found
   * @param {Function} deserializer - Custom parser (defaults to JSON.parse)
   * @returns {*} Parsed value or defaultValue
   */
  load(key, defaultValue = null, deserializer = JSON.parse) {
    if (!key) {
      this.log('error', 'StorageManager.load: key is required', { key });
      return defaultValue;
    }

    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;

      return deserializer(raw);
    } catch (err) {
      this.log('error', `StorageManager.load failed for key: ${key}`, {
        key,
        error: err.message,
        stack: err.stack
      });
      return defaultValue;
    }
  }

  /**
   * Save data to localStorage with error handling
   * @param {string} key - localStorage key
   * @param {*} value - Value to save
   * @param {Function} serializer - Custom serializer (defaults to JSON.stringify)
   * @returns {boolean} Success status
   */
  save(key, value, serializer = JSON.stringify) {
    if (!key) {
      this.log('error', 'StorageManager.save: key is required', { key });
      return false;
    }

    try {
      const serialized = serializer(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (err) {
      this.log('error', `StorageManager.save failed for key: ${key}`, {
        key,
        error: err.message,
        stack: err.stack
      });
      return false;
    }
  }

  /**
   * Remove item from localStorage
   * @param {string} key - localStorage key
   * @returns {boolean} Success status
   */
  remove(key) {
    if (!key) {
      this.log('error', 'StorageManager.remove: key is required', { key });
      return false;
    }

    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      this.log('error', `StorageManager.remove failed for key: ${key}`, {
        key,
        error: err.message
      });
      return false;
    }
  }

  /**
   * Clear all localStorage (careful!)
   * @returns {boolean} Success status
   */
  clear() {
    try {
      localStorage.clear();
      this.log('info', 'StorageManager.clear: cleared all localStorage');
      return true;
    } catch (err) {
      this.log('error', 'StorageManager.clear failed', {
        error: err.message
      });
      return false;
    }
  }

  /**
   * Get all keys in localStorage
   * @returns {string[]} Array of keys
   */
  getAllKeys() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
      }
      return keys;
    } catch (err) {
      this.log('error', 'StorageManager.getAllKeys failed', {
        error: err.message
      });
      return [];
    }
  }

  /**
   * Get size of localStorage in bytes
   * @returns {number} Total size in bytes
   */
  getSize() {
    let size = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        size += key.length + value.length;
      }
    } catch (err) {
      this.log('error', 'StorageManager.getSize failed', {
        error: err.message
      });
    }
    return size;
  }

  /**
   * Internal logging method
   * @private
   */
  log(level, message, context = {}) {
    if (this.logger) {
      this.logger[level](message, context);
    } else {
      console[level === 'error' ? 'error' : 'log'](message, context);
    }
  }
}

export default StorageManager;
