import Logger from '../modules/Logger.js';

describe('Logger', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    localStorage.clear();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    logger = new Logger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    localStorage.clear();
  });

  describe('info()', () => {
    test('should log info messages', () => {
      logger.info('Test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('should store info in localStorage', () => {
      logger.info('Test message');
      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('INFO');
      expect(logs[0].message).toBe('Test message');
    });
  });

  describe('warn()', () => {
    test('should log warn messages', () => {
      logger.warn('Warning message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('should store warn in localStorage', () => {
      logger.warn('Warning message');
      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('WARN');
    });
  });

  describe('error()', () => {
    test('should log error messages to console.error', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('should store error in localStorage', () => {
      logger.error('Error message');
      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('ERROR');
    });
  });

  describe('getLogs()', () => {
    test('should return empty array when no logs', () => {
      const logs = logger.getLogs();
      expect(logs).toEqual([]);
    });

    test('should return all stored logs', () => {
      logger.info('Message 1');
      logger.warn('Message 2');
      logger.error('Message 3');

      const logs = logger.getLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].message).toBe('Message 1');
      expect(logs[1].message).toBe('Message 2');
      expect(logs[2].message).toBe('Message 3');
    });

    test('should maintain log order', () => {
      for (let i = 0; i < 5; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getLogs();
      logs.forEach((log, idx) => {
        expect(log.message).toBe(`Message ${idx}`);
      });
    });
  });

  describe('clearLogs()', () => {
    test('should clear all stored logs', () => {
      logger.info('Message 1');
      logger.info('Message 2');

      logger.clearLogs();
      const logs = logger.getLogs();
      expect(logs).toEqual([]);
    });

    test('should return true on success', () => {
      const result = logger.clearLogs();
      expect(result).toBe(true);
    });
  });

  describe('getReport()', () => {
    test('should format logs as text report', () => {
      logger.info('Message 1');
      logger.error('Message 2');

      const report = logger.getReport();
      expect(report).toContain('Message 1');
      expect(report).toContain('Message 2');
      expect(report).toContain('[INFO]');
      expect(report).toContain('[ERROR]');
    });

    test('should return empty string for no logs', () => {
      const report = logger.getReport();
      expect(report).toBe('');
    });
  });

  describe('maxLogs limit', () => {
    test('should limit stored logs to maxLogs', () => {
      const smallLogger = new Logger({ maxLogs: 5 });

      for (let i = 0; i < 10; i++) {
        smallLogger.info(`Message ${i}`);
      }

      const logs = smallLogger.getLogs();
      expect(logs.length).toBe(5);
      // Should keep the last 5
      expect(logs[0].message).toBe('Message 5');
      expect(logs[4].message).toBe('Message 9');
    });
  });

  describe('logging options', () => {
    test('should disable console logging', () => {
      const silentLogger = new Logger({ logToConsole: false });
      silentLogger.info('Message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test('should disable storage logging', () => {
      const noStorageLogger = new Logger({ logToStorage: false });
      noStorageLogger.info('Message');

      const logs = noStorageLogger.getLogs();
      expect(logs.length).toBe(0);
    });

    test('should use custom storage key', () => {
      const customLogger = new Logger({ storageKey: 'custom_logs' });
      customLogger.info('Message');

      localStorage.setItem('default_logs', JSON.stringify([]));
      const customLogs = JSON.parse(localStorage.getItem('custom_logs'));
      expect(customLogs.length).toBe(1);
    });
  });

  describe('context handling', () => {
    test('should store context with log entry', () => {
      const context = { userId: 123, action: 'login' };
      logger.info('User logged in', context);

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual(context);
    });

    test('should handle empty context', () => {
      logger.info('Message');

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({});
    });
  });

  describe('timestamp', () => {
    test('should include ISO timestamp', () => {
      logger.info('Message');

      const logs = logger.getLogs();
      const iso = logs[0].timestamp;
      expect(new Date(iso).getTime()).toBeCloseTo(Date.now(), -2);
    });
  });

  describe('storage failure handling', () => {
    test('should handle storage unavailable gracefully', () => {
      const noStorageLogger = new Logger({ logToStorage: true });
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });

      expect(() => noStorageLogger.info('Message')).not.toThrow();
    });

    test('should handle corrupted storage', () => {
      localStorage.setItem('app_logs', '{invalid json}');
      const logs = logger.getLogs();
      expect(logs).toEqual([]);
    });
  });
});
