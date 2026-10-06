/**
 * Minimal stand-in for Nest's Logger so services keep their
 * `new Logger(Name.name)` / `this.logger.warn(...)` call sites unchanged.
 * Same output shape: ISO time, level, [context], message. debug is silent
 * unless LOG_LEVEL=debug.
 */
type Level = 'debug' | 'log' | 'warn' | 'error';

export class Logger {
  constructor(private readonly context: string) {}

  private write(level: Level, message: unknown) {
    if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.context}] ${message}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  }

  debug(message: unknown) {
    this.write('debug', message);
  }
  log(message: unknown) {
    this.write('log', message);
  }
  warn(message: unknown) {
    this.write('warn', message);
  }
  error(message: unknown) {
    this.write('error', message);
  }
}
