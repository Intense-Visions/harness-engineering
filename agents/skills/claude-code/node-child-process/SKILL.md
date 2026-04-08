# Node.js Child Process

> Spawn and manage child processes with exec, spawn, fork, and IPC communication

## When to Use

- Running external programs or shell commands from Node.js
- Executing system tools (ffmpeg, imagemagick, git, curl)
- Running Node.js scripts as separate processes with IPC
- Parallelizing work across CPU cores with full process isolation

## Instructions

1. **`exec`** for simple commands with buffered output:

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const { stdout, stderr } = await execAsync('git log --oneline -5');
console.log(stdout);
```

2. **`execFile`** for running executables (no shell, safer):

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync('node', ['--version']);
```

3. **`spawn`** for streaming output from long-running processes:

```typescript
import { spawn } from 'node:child_process';

const child = spawn('ffmpeg', ['-i', 'input.mp4', '-c:v', 'libx264', 'output.mp4']);

child.stdout.on('data', (data) => console.log(`stdout: ${data}`));
child.stderr.on('data', (data) => console.error(`stderr: ${data}`));

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});
```

4. **`fork`** for Node.js worker scripts with IPC:

```typescript
// parent.ts
import { fork } from 'node:child_process';

const child = fork('./worker.ts');

child.send({ task: 'process', data: [1, 2, 3] });

child.on('message', (result) => {
  console.log('Result from child:', result);
});

// worker.ts
process.on('message', (msg: any) => {
  const result = msg.data.map((n: number) => n * 2);
  process.send!(result);
});
```

5. **Handle errors and exit codes:**

```typescript
import { spawn } from 'node:child_process';

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('error', reject); // Spawn error (command not found)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Exit code ${code}: ${stderr}`));
    });
  });
}
```

6. **Set environment and working directory:**

```typescript
const child = spawn('npm', ['run', 'build'], {
  cwd: '/path/to/project',
  env: { ...process.env, NODE_ENV: 'production' },
  timeout: 60_000,
});
```

7. **Kill processes** on cleanup:

```typescript
const child = spawn('long-running-process');

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

// Or with AbortController
const ac = new AbortController();
const child = spawn('command', [], { signal: ac.signal });
ac.abort(); // Kills the child process
```

## Details

`exec` runs a shell command, buffers the entire output, and returns it. `spawn` streams output as it arrives. `fork` creates a Node.js child process with a built-in IPC channel.

**`exec` vs `spawn` vs `fork`:**

- `exec` — shell, buffered output, 1MB default limit. Best for short commands
- `spawn` — no shell (by default), streaming output, no buffer limit. Best for long-running or large-output processes
- `fork` — specialized `spawn` for Node.js scripts with IPC. Best for parallel Node.js work

**Security:** `exec` runs through a shell, making it vulnerable to command injection. Never pass user input to `exec` without sanitization. Use `execFile` or `spawn` (no shell) for user-provided arguments.

**Trade-offs:**

- `exec` is simple — but buffers all output in memory and uses a shell
- `spawn` streams output — but requires manual output collection
- `fork` has built-in IPC — but only works with Node.js scripts
- Child processes have full isolation — but higher overhead than worker threads

## Source

https://nodejs.org/api/child_process.html
