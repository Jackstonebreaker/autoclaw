import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel } from '../logger.js';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // Reset to default level before each test
    setLogLevel('info');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createLogger()', () => {
    it('returns an object with info, warn, error, debug methods', () => {
      const logger = createLogger('TestModule');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('info() calls console.log with [INFO] and module name', () => {
      const logger = createLogger('MyModule');
      logger.info('hello world');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[INFO]');
      expect(output).toContain('[MyModule]');
      expect(output).toContain('hello world');
    });

    it('warn() calls console.log with [WARN]', () => {
      const logger = createLogger('MyModule');
      logger.warn('something is off');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
      expect(output).toContain('something is off');
    });

    it('error() calls console.log with [ERROR]', () => {
      const logger = createLogger('MyModule');
      logger.error('fatal error');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
      expect(output).toContain('fatal error');
    });

    it('passes optional data as second argument to console.log', () => {
      const logger = createLogger('MyModule');
      const data = { key: 'value' };
      logger.info('with data', data);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), data);
    });

    it('calls console.log without second arg when no data provided', () => {
      const logger = createLogger('MyModule');
      logger.info('no data');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      // Single argument only
      expect(consoleSpy.mock.calls[0]).toHaveLength(1);
    });
  });

  describe('setLogLevel()', () => {
    it('debug messages are suppressed when level is info', () => {
      setLogLevel('info');
      const logger = createLogger('MyModule');
      logger.debug('debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('debug messages appear when level is debug', () => {
      setLogLevel('debug');
      const logger = createLogger('MyModule');
      logger.debug('debug message');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[DEBUG]');
    });

    it('info and warn are suppressed when level is error', () => {
      setLogLevel('error');
      const logger = createLogger('MyModule');
      logger.info('info');
      logger.warn('warn');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('error messages appear even when level is error', () => {
      setLogLevel('error');
      const logger = createLogger('MyModule');
      logger.error('critical');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('warn suppresses debug and info but shows warn and error', () => {
      setLogLevel('warn');
      const logger = createLogger('MyModule');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });
});

