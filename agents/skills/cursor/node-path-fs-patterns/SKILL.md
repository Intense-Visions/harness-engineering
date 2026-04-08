# Node.js Path and FS Patterns

> Perform file system operations correctly using fs.promises, path utilities, and file watching

## When to Use

- Reading, writing, or manipulating files and directories
- Building file paths safely across operating systems
- Watching files for changes (hot reload, build tools)
- Handling file operations asynchronously without blocking the event loop

## Instructions

1. **Always use `fs/promises`** for async operations:

```typescript
import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';

const content = await readFile(join(dir, 'data.json'), 'utf-8');
const data = JSON.parse(content);
```

2. **Build paths with `path.join` and `path.resolve`:**

```typescript
import { join, resolve, basename, dirname, extname } from 'node:path';

join('src', 'utils', 'helper.ts'); // 'src/utils/helper.ts'
resolve('src', 'utils'); // '/absolute/path/to/src/utils'
basename('/path/to/file.ts'); // 'file.ts'
basename('/path/to/file.ts', '.ts'); // 'file'
dirname('/path/to/file.ts'); // '/path/to'
extname('file.test.ts'); // '.ts'
```

Never concatenate paths with string templates — use `join()` for OS-safe separators.

3. **Create directories recursively:**

```typescript
await mkdir(join(outputDir, 'images', 'thumbnails'), { recursive: true });
```

4. **Write files safely** (atomic write pattern):

```typescript
import { writeFile, rename } from 'node:fs/promises';

async function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, filePath); // Atomic on most file systems
}
```

5. **Check if a file exists:**

```typescript
import { access, constants } from 'node:fs/promises';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
```

6. **List directory contents recursively:**

```typescript
import { readdir } from 'node:fs/promises';

const files = await readdir(srcDir, { recursive: true, withFileTypes: true });
const tsFiles = files
  .filter((f) => f.isFile() && f.name.endsWith('.ts'))
  .map((f) => join(f.parentPath, f.name));
```

7. **Watch files for changes:**

```typescript
import { watch } from 'node:fs/promises';

const watcher = watch(srcDir, { recursive: true });

for await (const event of watcher) {
  console.log(`${event.eventType}: ${event.filename}`);
}
```

8. **Stream large files** instead of loading into memory:

```typescript
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

await pipeline(
  createReadStream('large-input.csv'),
  transformStream,
  createWriteStream('output.csv')
);
```

9. **Clean up with `rm`:**

```typescript
await rm(tempDir, { recursive: true, force: true });
```

## Details

`node:fs/promises` provides Promise-based file system operations. Always prefer it over the callback-based `fs` and the synchronous `fs.*Sync` variants.

**`readFile` vs `createReadStream`:** Use `readFile` for files under ~50MB that you need in memory. Use `createReadStream` for larger files or when you can process data incrementally.

**`recursive: true`:** Available on `mkdir` (create nested directories), `readdir` (list all descendants), `rm` (delete directory trees), and `watch` (monitor subdirectories). Node.js 20+ supports `readdir` with `recursive` and `withFileTypes` together.

**File watching:** `fs.watch` is OS-dependent and can emit duplicate events. For production file watching, consider `chokidar` which normalizes behavior across platforms.

**Trade-offs:**

- `fs/promises` is non-blocking — but adds async overhead for small operations
- `path.join` handles OS differences — but you must remember to use it consistently
- Atomic writes prevent corruption — but require temporary file cleanup on failure
- `recursive: true` on `readdir` is convenient — but can be slow on large directory trees

## Source

https://nodejs.org/api/fs.html
