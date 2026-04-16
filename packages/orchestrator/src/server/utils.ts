import type { IncomingMessage } from 'node:http';

const DEFAULT_MAX_BYTES = 1_048_576; // 1 MB

/**
 * Read the full request body as a string, with a size limit to prevent
 * denial-of-service via oversized payloads.
 */
export function readBody(req: IncomingMessage, maxBytes = DEFAULT_MAX_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        return;
      }
      body += String(chunk);
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
