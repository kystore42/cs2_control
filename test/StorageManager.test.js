import StorageManager from '../modules/StorageManager.js';

describe('StorageManager', () => {
  let manager;
  let mockLogger;

  beforeEach(() => {
    localStorage.clear();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    manager = new StorageManager(mockLogger);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('load()', () => {
    test('should load and parse JSON data', () => {
      const data = { name: 'test', value: 42 };
      localStorage.setItem('test-key', JSON.stringify(data));

      const result = manager.load('test-key');
      expect(result).toEqual(data);
    });

    test('should return default value when key not found', () => {
      const result = manager.load('nonexistent', { default: true });
      expect(result).toEqual({ default: true });
    });

    test('should return null when key not found and no default', () => {
      const result = manager.load('nonexistent');
      expect(result).toBeNull();
    });

    test('should use custom deserializer', () => {
      localStorage.setItem('csv-key', 'a,b,c');
      const result = manager.load('csv-key', [], (str) => str.split(','));
      expect(result).toEqual(['a', 'b', 'c']);
    });

    test('should handle JSON parse errors', () => {
      localStorage.setItem('bad-json', '{invalid json}');
      const result = manager.load('bad-json', 'fallback');
      expect(result).toBe('fallback');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should log error when key is missing', () => {
      manager.load('');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle null storage gracefully', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage disabled');
      });
      const result = manager.load('test-key', 'default');
      expect(result).toBe('default');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('save()', () => {
    test('should save and serialize JSON data', () => {
      const data = { name: 'test', value: 42 };
      const success = manager.save('test-key', data);

      expect(success).toBe(true);
      const stored = JSON.parse(localStorage.getItem('test-key'));
      expect(stored).toEqual(data);
    });

    test('should use custom serializer', () => {
      const success = manager.save('csv-key', ['a', 'b', 'c'], (arr) => arr.join(','));
      expect(success).toBe(true);
      expect(localStorage.getItem('csv-key')).toBe('a,b,c');
    });

    test('should return false when key is missing', () => {
      const success = manager.save('', { data: 'test' });
      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should return false and log error on serialization failure', () => {
      const circularObj = {};
      circularObj.self = circularObj; // Create circular reference

      const success = manager.save('circular', circularObj);
      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle storage quota exceeded', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const success = manager.save('test-key', { data: 'test' });
      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    test('should remove item from storage', () => {
      localStorage.setItem('test-key', 'test-value');
      const success = manager.remove('test-key');

      expect(success).toBe(true);
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    test('should return false when key is missing', () => {
      const success = manager.remove('');
      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should succeed even if key not found', () => {
      const success = manager.remove('nonexistent');
      expect(success).toBe(true);
    });
  });

  describe('clear()', () => {
    test('should clear all localStorage items', () => {
      localStorage.setItem('key1', 'value1');
      localStorage.setItem('key2', 'value2');

      const success = manager.clear();
      expect(success).toBe(true);
      expect(localStorage.length).toBe(0);
    });

    test('should log info when clearing', () => {
      manager.clear();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should return false and log error on failure', () => {
      jest.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
        throw new Error('Storage error');
      });
      const success = manager.clear();
      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getAllKeys()', () => {
    test('should return all keys in storage', () => {
      localStorage.setItem('key1', 'value1');
      localStorage.setItem('key2', 'value2');
      localStorage.setItem('key3', 'value3');

      const keys = manager.getAllKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });

    test('should return empty array for empty storage', () => {
      const keys = manager.getAllKeys();
      expect(keys).toEqual([]);
    });

    test('should return empty array on error', () => {
      jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('Storage error');
      });
      const keys = manager.getAllKeys();
      expect(keys).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getSize()', () => {
    test('should calculate total size of storage', () => {
      localStorage.setItem('key', 'value');
      const size = manager.getSize();

      expect(size).toBe('key'.length + 'value'.length);
    });

    test('should return 0 for empty storage', () => {
      const size = manager.getSize();
      expect(size).toBe(0);
    });

    test('should handle large data', () => {
      const largeString = 'x'.repeat(10000);
      localStorage.setItem('large', largeString);
      const size = manager.getSize();

      expect(size).toBe('large'.length + largeString.length);
    });

    test('should return 0 and log error on failure', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      const size = manager.getSize();
      expect(size).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('without logger', () => {
    test('should log to console when logger not provided', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const managerNoLogger = new StorageManager();

      managerNoLogger.load('');
      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });
});
