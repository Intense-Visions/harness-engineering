/**
 * Minimal JSON-line logger. One log record per line, machine-readable.
 *
 * Why not pino/winston: the bridge is a teaching reference. Adding a
 * logging framework would obscure the structured-log discipline that
 * we want authors to crib (level, event, context fields).
 *
 * Authors swapping this for pino/winston is fine and documented in
 * README "Customizing the bridge".
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields: Record<string, unknown>): void {
  const record = { level, event, ts: new Date().toISOString(), ...fields };
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(record)}\n`);
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}): void => emit('info', event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}): void => emit('warn', event, fields),
  error: (event: string, fields: Record<string, unknown> = {}): void =>
    emit('error', event, fields),
};
