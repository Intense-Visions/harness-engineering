# GOF Adapter Pattern

> Wrap incompatible interfaces to make them work together without modifying source code.

## When to Use

- You want to use an existing class but its interface doesn't match what you need
- You're integrating a third-party library with a fixed interface into a system that expects a different one
- You're wrapping a legacy component to work with new code
- You need to keep the original class unchanged (read-only dependency, vendor code)

## Instructions

**Object adapter (composition — preferred in TypeScript):**

```typescript
// What your system expects
interface Logger {
  info(message: string, context?: object): void;
  error(message: string, error?: Error): void;
  warn(message: string, context?: object): void;
}

// What you have (third-party SDK, fixed interface)
class PinoLogger {
  log(level: 'info' | 'warn' | 'error', payload: { msg: string; [key: string]: unknown }): void {
    console.log(JSON.stringify({ level, ...payload }));
  }
}

// Adapter wraps PinoLogger to satisfy Logger interface
class PinoLoggerAdapter implements Logger {
  constructor(private readonly pino: PinoLogger) {}

  info(message: string, context?: object): void {
    this.pino.log('info', { msg: message, ...context });
  }

  error(message: string, error?: Error): void {
    this.pino.log('error', {
      msg: message,
      err: error ? { message: error.message, stack: error.stack } : undefined,
    });
  }

  warn(message: string, context?: object): void {
    this.pino.log('warn', { msg: message, ...context });
  }
}

// Usage — client depends only on Logger interface
const logger: Logger = new PinoLoggerAdapter(new PinoLogger());
logger.info('Server started', { port: 3000 });
```

**Adapting an async legacy API:**

```typescript
// Legacy callback-based interface
interface LegacyStorage {
  readFile(path: string, callback: (err: Error | null, data: Buffer) => void): void;
  writeFile(path: string, data: Buffer, callback: (err: Error | null) => void): void;
}

// Modern promise-based interface expected by new code
interface AsyncStorage {
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
}

class LegacyStorageAdapter implements AsyncStorage {
  constructor(private readonly legacy: LegacyStorage) {}

  read(path: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.legacy.readFile(path, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  write(path: string, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.legacy.writeFile(path, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
```

**Two-way adapter (adapt in both directions):**

```typescript
// When you need to satisfy two incompatible interfaces simultaneously
class BidirectionalAdapter implements InterfaceA, InterfaceB {
  constructor(
    private readonly a: ComponentA,
    private readonly b: ComponentB
  ) {}

  // InterfaceA methods delegate to ComponentA
  doSomethingA(): void {
    this.a.operationA();
  }

  // InterfaceB methods delegate to ComponentB
  doSomethingB(): void {
    this.b.operationB();
  }
}
```

## Details

**Adapter vs. Facade:** Both simplify usage, but serve different purposes. An Adapter makes one interface compatible with another — the client expects a specific interface. A Facade simplifies a complex subsystem — the client doesn't care about the interface, just wants it simpler. If you're translating interfaces, use Adapter. If you're hiding complexity, use Facade.

**Adapter vs. Decorator:** Both wrap an object. An Adapter changes the interface. A Decorator adds behavior while keeping the same interface.

**Anti-patterns:**

- Leaky adapter — letting the adaptee's types bleed into the adapter's public API
- Adapter that does too much business logic — adapters should translate, not transform
- Multiple adapters stacked — signals you need a proper abstraction layer, not more wrapping

**Testing with adapters:** Mock the target interface, not the adaptee. This is exactly the value of the pattern — tests use the interface, not the concrete third-party dependency.

```typescript
// In tests, use a mock Logger instead of PinoLoggerAdapter
const mockLogger: Logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};
```

## Source

refactoring.guru/design-patterns/adapter
