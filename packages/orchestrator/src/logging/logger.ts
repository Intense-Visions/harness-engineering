export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export class StructuredLogger {
  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  public log(level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context ? { context } : {}),
    };

    console.log(this.formatLog(entry));
  }

  private formatLog(entry: LogEntry): string {
    const timestamp = entry.timestamp || new Date().toISOString();
    const contextStr = entry.context ? ` ${this.safeStringify(entry.context)}` : '';
    return `${timestamp} ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      return '[Circular or Non-serializable]';
    }
  }
}
