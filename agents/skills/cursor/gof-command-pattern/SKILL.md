# GOF Command Pattern

> Encapsulate operations as command objects to support undo, redo, and command queuing.

## When to Use

- You need to support undo/redo of operations
- You want to queue, schedule, or batch operations
- You need a transaction log of operations that can be replayed
- You want to parameterize methods with operations — pass operations as first-class objects
- You're building a task queue, job scheduler, or action history system

## Instructions

**Command interface with undo:**

```typescript
interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  readonly description: string;
}

// Concrete command
class CreateUserCommand implements Command {
  readonly description: string;
  private createdUserId: string | null = null;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly data: { email: string; name: string }
  ) {
    this.description = `Create user: ${data.email}`;
  }

  async execute(): Promise<void> {
    const user = await this.userRepo.create(this.data);
    this.createdUserId = user.id;
    console.log(`Created user ${user.id}`);
  }

  async undo(): Promise<void> {
    if (!this.createdUserId) throw new Error('Cannot undo: command was not executed');
    await this.userRepo.delete(this.createdUserId);
    console.log(`Deleted user ${this.createdUserId}`);
    this.createdUserId = null;
  }
}

class UpdateEmailCommand implements Command {
  readonly description: string;
  private previousEmail: string | null = null;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly userId: string,
    private readonly newEmail: string
  ) {
    this.description = `Update email for user ${userId}`;
  }

  async execute(): Promise<void> {
    const user = await this.userRepo.findById(this.userId);
    if (!user) throw new Error(`User ${this.userId} not found`);
    this.previousEmail = user.email;
    await this.userRepo.update(this.userId, { email: this.newEmail });
  }

  async undo(): Promise<void> {
    if (!this.previousEmail) throw new Error('Cannot undo: command was not executed');
    await this.userRepo.update(this.userId, { email: this.previousEmail });
  }
}
```

**Command history (invoker with undo/redo stack):**

```typescript
class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  async execute(command: Command): Promise<void> {
    await command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // clear redo history after new command
    console.log(`Executed: ${command.description}`);
  }

  async undo(): Promise<void> {
    const command = this.undoStack.pop();
    if (!command) throw new Error('Nothing to undo');
    await command.undo();
    this.redoStack.push(command);
    console.log(`Undone: ${command.description}`);
  }

  async redo(): Promise<void> {
    const command = this.redoStack.pop();
    if (!command) throw new Error('Nothing to redo');
    await command.execute();
    this.undoStack.push(command);
    console.log(`Redone: ${command.description}`);
  }

  getHistory(): string[] {
    return this.undoStack.map((c) => c.description);
  }
}

// Usage
const history = new CommandHistory();
await history.execute(new CreateUserCommand(repo, { email: 'alice@example.com', name: 'Alice' }));
await history.execute(new UpdateEmailCommand(repo, 'user-1', 'alice2@example.com'));
await history.undo(); // reverts email update
await history.redo(); // re-applies email update
```

**Command queue for background jobs:**

```typescript
class CommandQueue {
  private queue: Command[] = [];
  private running = false;

  enqueue(command: Command): void {
    this.queue.push(command);
    if (!this.running) this.processNext();
  }

  private async processNext(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const command = this.queue.shift()!;
      try {
        await command.execute();
      } catch (err) {
        console.error(`Command failed: ${command.description}`, err);
      }
    }
    this.running = false;
  }
}
```

**Macro command (batch):**

```typescript
class MacroCommand implements Command {
  constructor(
    private readonly commands: Command[],
    public readonly description: string
  ) {}

  async execute(): Promise<void> {
    for (const cmd of this.commands) await cmd.execute();
  }

  async undo(): Promise<void> {
    for (const cmd of [...this.commands].reverse()) await cmd.undo();
  }
}
```

## Details

**When to store state for undo:** The command must capture enough state before `execute()` to reverse it. Common patterns: capture the previous value, capture an ID for delete operations, or save a full snapshot.

**Anti-patterns:**

- Commands with side effects that can't be undone (sending emails, charging cards) — mark these as non-undoable with a flag
- Deeply nested command state that becomes stale — validate that referenced entities still exist before undo
- Infinite undo stacks — cap the stack size and drop oldest entries

**Command vs. Strategy:** Strategy encapsulates an interchangeable algorithm selected at construction time. Command encapsulates a specific operation with data, executed and potentially reversed. Commands are objects that DO something once; strategies are policies applied repeatedly.

**Event sourcing connection:** Command pattern at the infrastructure level becomes event sourcing. Each executed command emits an event stored in an append-only log. Undo becomes a compensating event.

## Source

refactoring.guru/design-patterns/command

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
