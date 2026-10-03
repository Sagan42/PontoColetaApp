import type { LogContext, Logger, LogLevel } from '../../application/ports/logger.js';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class StructuredLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel,
    private readonly baseContext: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  child(context: LogContext): Logger {
    return new StructuredLogger(this.minimumLevel, { ...this.baseContext, ...context });
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minimumLevel]) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.baseContext,
      ...context,
    };

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}
