# JS Command Pattern

> Encapsulate operations as objects to support undo, queue, and logging

## When to Use

- You need undo/redo functionality
- Operations should be queued, deferred, or logged
- You want to decouple the sender of an operation from its executor

## Instructions

1. Define a command interface with `execute()` and optionally `undo()` methods.
2. Each command class captures the receiver and parameters needed to perform (and reverse) the operation.
3. Store executed commands in a history stack for undo support.
4. The invoker (button, menu, keyboard shortcut) calls `command.execute()` without knowing the implementation.

```javascript
class AddTextCommand {
  constructor(editor, text) {
    this.editor = editor;
    this.text = text;
    this.prevContent = null;
  }

  execute() {
    this.prevContent = this.editor.content;
    this.editor.content += this.text;
  }

  undo() {
    this.editor.content = this.prevContent;
  }
}

const editor = { content: 'Hello' };
const history = [];

const cmd = new AddTextCommand(editor, ' World');
cmd.execute();
history.push(cmd);
console.log(editor.content); // 'Hello World'

history.pop().undo();
console.log(editor.content); // 'Hello'
```

## Details

The Command pattern turns function calls into first-class objects. This makes operations serializable, loggable, and reversible. Redux actions are a functional variant of this pattern.

**Trade-offs:**

- More boilerplate than a direct function call
- Memory cost for storing command history
- Undo logic can be complex for operations with side effects

**When NOT to use:**

- When undo/redo is not needed and operations are one-shot
- For simple event handlers — a plain callback is sufficient

## Source

https://patterns.dev/javascript/command-pattern
