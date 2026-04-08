# GOF Abstract Factory

> Create families of related objects through factory interfaces without coupling to concrete types.

## When to Use

- You need to create multiple related objects that must work together (a UI theme, a cloud provider SDK, a DB + cache pair)
- You want to swap an entire product family at runtime without changing client code
- You have multiple variants of a product suite that must remain internally consistent
- A simple factory method is insufficient because you're producing more than one related type

## Instructions

**Define the abstract factory and product interfaces first:**

```typescript
// Abstract product interfaces
interface Button {
  render(): string;
  onClick(handler: () => void): void;
}

interface TextField {
  render(): string;
  getValue(): string;
}

// Abstract factory interface
interface UIFactory {
  createButton(label: string): Button;
  createTextField(placeholder: string): TextField;
}
```

**Implement concrete families:**

```typescript
// --- Dark theme family ---
class DarkButton implements Button {
  constructor(private label: string) {}
  render() {
    return `<button class="dark">${this.label}</button>`;
  }
  onClick(handler: () => void) {
    /* attach event */
  }
}

class DarkTextField implements TextField {
  private value = '';
  constructor(private placeholder: string) {}
  render() {
    return `<input class="dark" placeholder="${this.placeholder}" />`;
  }
  getValue() {
    return this.value;
  }
}

class DarkThemeFactory implements UIFactory {
  createButton(label: string): Button {
    return new DarkButton(label);
  }
  createTextField(placeholder: string): TextField {
    return new DarkTextField(placeholder);
  }
}

// --- Light theme family ---
class LightButton implements Button {
  constructor(private label: string) {}
  render() {
    return `<button class="light">${this.label}</button>`;
  }
  onClick(handler: () => void) {
    /* attach event */
  }
}

class LightTextField implements TextField {
  private value = '';
  constructor(private placeholder: string) {}
  render() {
    return `<input class="light" placeholder="${this.placeholder}" />`;
  }
  getValue() {
    return this.value;
  }
}

class LightThemeFactory implements UIFactory {
  createButton(label: string): Button {
    return new LightButton(label);
  }
  createTextField(placeholder: string): TextField {
    return new LightTextField(placeholder);
  }
}
```

**Client code depends only on the abstract factory:**

```typescript
class LoginForm {
  private submitButton: Button;
  private emailField: TextField;

  constructor(factory: UIFactory) {
    this.submitButton = factory.createButton('Log In');
    this.emailField = factory.createTextField('Email address');
  }

  render(): string {
    return `<form>${this.emailField.render()}${this.submitButton.render()}</form>`;
  }
}

// Swap families by changing the factory
const theme = process.env.THEME === 'dark' ? new DarkThemeFactory() : new LightThemeFactory();
const form = new LoginForm(theme);
console.log(form.render());
```

**Cloud provider example (more realistic for backend):**

```typescript
interface StorageProvider {
  upload(key: string, data: Buffer): Promise<string>;
  download(key: string): Promise<Buffer>;
}

interface QueueProvider {
  publish(topic: string, message: object): Promise<void>;
  subscribe(topic: string, handler: (msg: object) => void): void;
}

interface CloudFactory {
  createStorage(bucket: string): StorageProvider;
  createQueue(): QueueProvider;
}

class AWSFactory implements CloudFactory {
  createStorage(bucket: string): StorageProvider {
    return new S3Storage(bucket);
  }
  createQueue(): QueueProvider {
    return new SQSQueue();
  }
}

class GCPFactory implements CloudFactory {
  createStorage(bucket: string): StorageProvider {
    return new GCSStorage(bucket);
  }
  createQueue(): QueueProvider {
    return new PubSubQueue();
  }
}
```

## Details

**Abstract Factory vs. Factory Method:** Factory Method uses inheritance — one factory method per subclass. Abstract Factory uses composition — inject a factory object that produces a whole family. Abstract Factory is the better choice when you have multiple products that vary together.

**Adding a new product to an existing family breaks the Open/Closed Principle** — every concrete factory must implement the new method. This is the main drawback. Mitigate by providing a default implementation in an abstract base factory.

**Anti-patterns:**

- Abstract Factory that creates unrelated objects — the products must be a coherent family
- Overusing when only one product variant exists — use a simple factory function instead
- Mixing factory selection logic into the factory itself — the factory should only create, not decide

**Testing tip:** Inject a `MockFactory` that returns stub implementations for every product type. This decouples all component tests from real infrastructure.

## Source

refactoring.guru/design-patterns/abstract-factory
