# GOF Factory Method

> Define a factory interface that subclasses use to decide which object to instantiate.

## When to Use

- The exact type of object to create isn't known until runtime
- Subclasses need to control which product class they instantiate
- You want to follow the Open/Closed Principle — add new product types without changing existing creator code
- You have a base class with a creation step that subclasses must override

## Instructions

**Core structure — Creator declares the factory method, ConcreteCreators override it:**

```typescript
// Product interface
interface Notification {
  send(message: string): Promise<void>;
}

// Concrete products
class EmailNotification implements Notification {
  constructor(private readonly address: string) {}
  async send(message: string): Promise<void> {
    console.log(`Email to ${this.address}: ${message}`);
  }
}

class SMSNotification implements Notification {
  constructor(private readonly phone: string) {}
  async send(message: string): Promise<void> {
    console.log(`SMS to ${this.phone}: ${message}`);
  }
}

// Creator — declares the factory method
abstract class NotificationCreator {
  // Factory method — subclasses must implement
  abstract createNotification(recipient: string): Notification;

  // Template method that uses the factory method
  async notify(recipient: string, message: string): Promise<void> {
    const notification = this.createNotification(recipient);
    await notification.send(message);
  }
}

// Concrete creators
class EmailNotificationCreator extends NotificationCreator {
  createNotification(recipient: string): Notification {
    return new EmailNotification(recipient);
  }
}

class SMSNotificationCreator extends NotificationCreator {
  createNotification(recipient: string): Notification {
    return new SMSNotification(recipient);
  }
}

// Client code — depends only on Creator, not ConcreteProduct
async function main(creator: NotificationCreator) {
  await creator.notify('user@example.com', 'Your order shipped');
}
```

**Function-based factory (TypeScript idiomatic, no classes needed):**

```typescript
type NotificationType = 'email' | 'sms' | 'push';

function createNotification(type: NotificationType, recipient: string): Notification {
  switch (type) {
    case 'email':
      return new EmailNotification(recipient);
    case 'sms':
      return new SMSNotification(recipient);
    case 'push':
      return new PushNotification(recipient);
    default:
      // Exhaustiveness check — TypeScript will error if a case is missing
      const _exhaustive: never = type;
      throw new Error(`Unknown notification type: ${type}`);
  }
}
```

**Generic factory with registration:**

```typescript
type Constructor<T> = new (...args: any[]) => T;

class NotificationFactory {
  private static registry = new Map<string, Constructor<Notification>>();

  static register(type: string, ctor: Constructor<Notification>): void {
    NotificationFactory.registry.set(type, ctor);
  }

  static create(type: string, ...args: any[]): Notification {
    const Ctor = NotificationFactory.registry.get(type);
    if (!Ctor) throw new Error(`Unknown notification type: ${type}`);
    return new Ctor(...args);
  }
}

NotificationFactory.register('email', EmailNotification);
NotificationFactory.register('sms', SMSNotification);
```

## Details

**Factory Method vs. Abstract Factory:** Factory Method produces one product via subclass override. Abstract Factory produces families of related products via composition. Start with Factory Method; reach for Abstract Factory when you need a suite of related objects.

**Open/Closed Principle in action:** Adding a new notification type (`SlackNotification`) means creating a new `ConcreteCreator` class — no changes to existing creators or the `notify()` logic.

**Anti-patterns:**

- Putting all `if/else` logic inside a single `create()` method that grows indefinitely — use a registry instead
- Creator classes with too many factory methods — this is a sign the abstraction is wrong
- Forgetting exhaustiveness checks in switch statements — TypeScript's `never` type catches missing cases at compile time

**When to skip the pattern:**

- When object creation is trivial (`new User()`)
- When there's only one concrete type and no extension is expected
- Prefer a simple function over a class hierarchy for creation logic

## Source

refactoring.guru/design-patterns/factory-method
