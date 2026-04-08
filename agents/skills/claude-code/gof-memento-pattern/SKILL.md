# GOF Memento Pattern

> Capture and restore object state using mementos for undo history and time-travel.

## When to Use

- You need to implement undo/redo without exposing the object's internals
- You want to save and restore checkpoints of an object's state
- You're building a text editor, drawing app, form wizard, or game save system
- You need time-travel debugging or state snapshots for comparison

## Instructions

**Classic memento with Originator and Caretaker:**

```typescript
// Memento — stores a snapshot of state
class EditorMemento {
  constructor(
    private readonly content: string,
    private readonly cursorPosition: number,
    private readonly timestamp: Date
  ) {}

  getContent(): string {
    return this.content;
  }
  getCursorPosition(): number {
    return this.cursorPosition;
  }
  getTimestamp(): Date {
    return this.timestamp;
  }

  describe(): string {
    return `[${this.timestamp.toISOString()}] ${this.content.slice(0, 30)}...`;
  }
}

// Originator — creates and restores from mementos
class TextEditor {
  private content = '';
  private cursorPosition = 0;

  type(text: string): void {
    this.content =
      this.content.slice(0, this.cursorPosition) + text + this.content.slice(this.cursorPosition);
    this.cursorPosition += text.length;
  }

  moveCursor(position: number): void {
    this.cursorPosition = Math.max(0, Math.min(position, this.content.length));
  }

  delete(count: number): void {
    this.content =
      this.content.slice(0, this.cursorPosition - count) + this.content.slice(this.cursorPosition);
    this.cursorPosition = Math.max(0, this.cursorPosition - count);
  }

  // Save state to memento
  save(): EditorMemento {
    return new EditorMemento(this.content, this.cursorPosition, new Date());
  }

  // Restore state from memento
  restore(memento: EditorMemento): void {
    this.content = memento.getContent();
    this.cursorPosition = memento.getCursorPosition();
  }

  getState(): { content: string; cursor: number } {
    return { content: this.content, cursor: this.cursorPosition };
  }
}

// Caretaker — manages the history of mementos
class EditorHistory {
  private history: EditorMemento[] = [];
  private future: EditorMemento[] = [];

  save(editor: TextEditor): void {
    this.history.push(editor.save());
    this.future = []; // clear redo history
  }

  undo(editor: TextEditor): boolean {
    if (this.history.length === 0) return false;
    this.future.push(editor.save());
    editor.restore(this.history.pop()!);
    return true;
  }

  redo(editor: TextEditor): boolean {
    if (this.future.length === 0) return false;
    this.history.push(editor.save());
    editor.restore(this.future.pop()!);
    return true;
  }

  getHistoryDescriptions(): string[] {
    return this.history.map((m) => m.describe());
  }
}

// Usage
const editor = new TextEditor();
const history = new EditorHistory();

history.save(editor);
editor.type('Hello, world!');
history.save(editor);
editor.type(' How are you?');
history.save(editor);
editor.delete(4);

console.log(editor.getState()); // { content: 'Hello, world! How are', cursor: 21 }
history.undo(editor);
console.log(editor.getState()); // { content: 'Hello, world! How are you?', cursor: 26 }
history.undo(editor);
console.log(editor.getState()); // { content: 'Hello, world!', cursor: 13 }
history.redo(editor);
console.log(editor.getState()); // { content: 'Hello, world! How are you?', cursor: 26 }
```

**Lightweight memento using plain objects (TypeScript idiomatic):**

```typescript
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  step: number;
};

class MultiStepForm {
  private state: FormState = { firstName: '', lastName: '', email: '', step: 1 };
  private snapshots: FormState[] = [];

  updateField<K extends keyof FormState>(field: K, value: FormState[K]): void {
    this.state = { ...this.state, [field]: value };
  }

  checkpoint(): void {
    this.snapshots.push({ ...this.state }); // shallow copy sufficient for flat state
  }

  rollback(): boolean {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return false;
    this.state = snapshot;
    return true;
  }

  getState(): Readonly<FormState> {
    return this.state;
  }
}
```

## Details

**Encapsulation is key:** The Originator creates and restores mementos. The Caretaker stores them but must NOT access their internal data. In TypeScript, enforce this with private constructors or closures.

**Memory management:** Unlimited undo history can exhaust memory. Implement a fixed-size ring buffer or time-limited history:

```typescript
class BoundedHistory {
  private history: Memento[] = [];
  constructor(private readonly maxSize: number) {}

  push(memento: Memento): void {
    this.history.push(memento);
    if (this.history.length > this.maxSize) {
      this.history.shift(); // drop oldest
    }
  }
}
```

**Anti-patterns:**

- Memento that exposes mutable references to internal state — snapshots must be copies
- Caretaker that inspects memento contents — violates encapsulation
- Saving mementos too frequently (e.g., on every keystroke without debounce) — throttle or batch snapshots

**Memento vs. Command:** Command stores the operation needed to undo an action. Memento stores a complete state snapshot. Command is more memory-efficient for simple state changes; Memento is simpler to implement when state is complex and hard to invert.

## Source

refactoring.guru/design-patterns/memento
