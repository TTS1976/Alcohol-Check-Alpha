/**
 * Production-ready logging utility
 * Respects LOG_LEVEL environment variable for controlling log output
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Get log level from environment variable, default to ERROR for production
const getLogLevel = (): LogLevel => {
  const envLevel = import.meta.env.VITE_LOG_LEVEL || 'ERROR';
  const validLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  return validLevels.includes(envLevel as LogLevel) ? (envLevel as LogLevel) : 'ERROR';
};

const LOG_LEVEL = getLogLevel();

// Log level hierarchy: DEBUG < INFO < WARN < ERROR
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const shouldLog = (level: LogLevel): boolean => {
  // In production, only log errors and only if explicitly enabled
  const isDevelopment = import.meta.env.DEV;
  if (!isDevelopment && level !== 'ERROR') {
    return false;
  }
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
};

/**
 * Production logger with environment-based filtering
 */
export const logger = {
  /**
   * Debug logs - only shown in development
   * Use for detailed debugging information
   */
  debug: (message: string, ...args: any[]) => {
    if (shouldLog('DEBUG')) {
      console.log(`🔍 [DEBUG] ${message}`, ...args);
    }
  },

  /**
   * Info logs - shown in development and staging
   * Use for general application flow information
   */
  info: (message: string, ...args: any[]) => {
    if (shouldLog('INFO')) {
      console.log(`ℹ️ [INFO] ${message}`, ...args);
    }
  },

  /**
   * Warning logs - always shown
   * Use for recoverable errors or important notices
   */
  warn: (message: string, ...args: any[]) => {
    if (shouldLog('WARN')) {
      console.warn(`⚠️ [WARN] ${message}`, ...args);
    }
  },

  /**
   * Error logs - always shown
   * Use for errors and exceptions
   */
  error: (message: string, ...args: any[]) => {
    if (shouldLog('ERROR')) {
      console.error(`❌ [ERROR] ${message}`, ...args);
    }
  },

  /**
   * Performance logging - only in debug mode
   */
  perf: (operation: string, duration?: number) => {
    if (shouldLog('DEBUG')) {
      const msg = duration ? `${operation} completed in ${duration}ms` : `${operation} started`;
      console.log(`⚡ [PERF] ${msg}`);
    }
  },

  /**
   * Success logging - info level
   */
  success: (message: string, ...args: any[]) => {
    if (shouldLog('INFO')) {
      console.log(`✅ [SUCCESS] ${message}`, ...args);
    }
  },

  /**
   * Security-related logging - always shown as warnings
   */
  security: (message: string, ...args: any[]) => {
    if (shouldLog('WARN')) {
      console.warn(`🔒 [SECURITY] ${message}`, ...args);
    }
  },

  /**
   * Get current log level
   */
  getLevel: () => LOG_LEVEL,

  /**
   * Check if a log level would be output
   */
  willLog: (level: LogLevel) => shouldLog(level),
};

/**
 * Performance measurement utility
 */
export const measure = {
  start: (operation: string) => {
    const startTime = performance.now();
    return {
      end: () => {
        const duration = Math.round(performance.now() - startTime);
        logger.perf(operation, duration);
        return duration;
      }
    };
  }
};

export default logger; 