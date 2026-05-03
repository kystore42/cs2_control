/**
 * Logger - Centralized logging with console and localStorage persistence
 */
class Logger {
  constructor(options = {}) {
    this.logToConsole = options.logToConsole !== false;
    this.logToStorage = options.logToStorage !== false;
    this.storageKey = options.storageKey || 'app_logs';
    this.maxLogs = options.maxLogs || 100;
    this.isDev = options.isDev !== false;
  }

  /**
   * Log info level message
   * @param {string} message
   * @param {object} context
   */
  info(message, context = {}) {
    this.log('INFO', message, context);
  }

  /**
   * Log warning level message
   * @param {string} message
   * @param {object} context
   */
  warn(message, context = {}) {
    this.log('WARN', message, context);
  }

  /**
   * Log error level message
   * @param {string} message
   * @param {object} context
   */
  error(message, context = {}) {
    this.log('ERROR', message, context);
  }

  /**
   * Internal log method
   * @private
   */
  log(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (this.logToConsole) {
      this.logToConsoleImpl(entry);
    }

    if (this.logToStorage) {
      this.logToStorageImpl(entry);
    }
  }

  /**
   * Log to console with formatting
   * @private
   */
  logToConsoleImpl(entry) {
    const prefix = `[${entry.timestamp}] [${entry.level}]`;
    const method = entry.level === 'ERROR' ? 'error' : 'log';
    console[method](prefix, entry.message, entry.context);
  }

  /**
   * Log to localStorage (if available)
   * @private
   */
  logToStorageImpl(entry) {
    if (!this.isStorageAvailable()) return;

    try {
      const logs = this.getLogs();
      logs.push(entry);

      // Keep only recent logs
      if (logs.length > this.maxLogs) {
        logs.splice(0, logs.length - this.maxLogs);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(logs));
    } catch (err) {
      if (this.logToConsole) {
        console.warn('Logger: Failed to persist logs', err.message);
      }
    }
  }

  /**
   * Get all stored logs
   * @returns {array} Array of log entries
   */
  getLogs() {
    if (!this.isStorageAvailable()) return [];

    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Clear all stored logs
   */
  clearLogs() {
    if (!this.isStorageAvailable()) return false;

    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get formatted log report
   * @returns {string} Formatted log text
   */
  getReport() {
    const logs = this.getLogs();
    return logs
      .map(entry => `[${entry.timestamp}] [${entry.level}] ${entry.message}`)
      .join('\n');
  }

  /**
   * Check if storage is available
   * @private
   */
  isStorageAvailable() {
    if (typeof localStorage === 'undefined') return false;

    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

export default Logger;
