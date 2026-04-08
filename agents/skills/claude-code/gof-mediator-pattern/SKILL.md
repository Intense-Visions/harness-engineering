# GOF Mediator Pattern

> Decouple components by routing communication through a central mediator or event bus.

## When to Use

- Components are tightly coupled to each other and changes in one break others
- You have many-to-many communication that's hard to track
- You're building a chat room, collaborative editor, or workflow engine where multiple parties react to shared events
- You want components to be reusable independently, not coupled to specific counterparts

## Instructions

**Classic mediator interface:**

```typescript
interface ChatMediator {
  sendMessage(message: string, sender: ChatUser): void;
  addUser(user: ChatUser): void;
}

class ChatRoom implements ChatMediator {
  private users: ChatUser[] = [];

  addUser(user: ChatUser): void {
    this.users.push(user);
    console.log(`${user.name} joined the chat`);
  }

  sendMessage(message: string, sender: ChatUser): void {
    for (const user of this.users) {
      if (user !== sender) {
        user.receive(message, sender.name);
      }
    }
  }
}

class ChatUser {
  constructor(
    public readonly name: string,
    private readonly mediator: ChatMediator
  ) {
    mediator.addUser(this);
  }

  send(message: string): void {
    console.log(`${this.name} sends: ${message}`);
    this.mediator.sendMessage(message, this);
  }

  receive(message: string, from: string): void {
    console.log(`${this.name} receives from ${from}: ${message}`);
  }
}

const room = new ChatRoom();
const alice = new ChatUser('Alice', room);
const bob = new ChatUser('Bob', room);
alice.send('Hello, Bob!'); // Bob receives it, Alice does not
```

**Typed event bus (practical Node.js mediator):**

```typescript
type EventMap = Record<string, unknown>;

type EventCallback<T> = (payload: T) => void | Promise<void>;

class EventBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<EventCallback<unknown>>>();

  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);
    // Return unsubscribe function
    return () => this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  async emit<K extends keyof Events>(event: K, payload: Events[K]): Promise<void> {
    const callbacks = this.listeners.get(event) ?? new Set();
    await Promise.all([...callbacks].map((cb) => cb(payload)));
  }
}

// Define your event map for type safety
interface AppEvents {
  'user.created': { userId: string; email: string };
  'order.placed': { orderId: string; userId: string; amount: number };
  'payment.failed': { orderId: string; reason: string };
}

const bus = new EventBus<AppEvents>();

// Components subscribe without knowing about each other
const unsubEmail = bus.on('user.created', async ({ userId, email }) => {
  await sendWelcomeEmail(email);
});

bus.on('order.placed', async ({ orderId, userId, amount }) => {
  await notifyFulfillment(orderId);
  await updateUserStats(userId, amount);
});

// Emit events
await bus.emit('user.created', { userId: 'u1', email: 'alice@example.com' });
// Later, unsubscribe
unsubEmail();
```

**Mediator for form components:**

```typescript
interface FormMediator {
  componentChanged(component: string, value: unknown): void;
}

class CheckoutFormMediator implements FormMediator {
  private giftWrap = false;
  private includeCard = false;

  componentChanged(component: string, value: unknown): void {
    if (component === 'giftWrap') {
      this.giftWrap = value as boolean;
      // When gift wrap selected, show/enable gift card option
      this.updateCardVisibility(this.giftWrap);
    }
    if (component === 'includeCard') {
      this.includeCard = value as boolean;
    }
  }

  private updateCardVisibility(visible: boolean): void {
    console.log(`Gift card field ${visible ? 'shown' : 'hidden'}`);
  }
}
```

## Details

**Mediator vs. Observer:** In Observer, subjects notify observers directly (subject knows about observers). In Mediator, components notify a central hub which then routes to other components (components know only about the mediator). Mediator is more decoupled but the mediator itself can become complex.

**When the mediator becomes a god object:** A mediator that orchestrates too many components becomes a maintenance burden. Split it into domain-specific mediators (OrderMediator, UserMediator) rather than one global hub.

**Anti-patterns:**

- Components that bypass the mediator and call each other directly — the pattern only works if all communication goes through the mediator
- Mediator that contains business logic — it should route, not process
- Single global event bus for all events in the app — namespace events and consider multiple focused mediators

**Mediator vs. Service Bus:** In microservices, a message queue or service bus IS the mediator at the network level. The pattern scales from in-process event buses to distributed message brokers (Kafka, RabbitMQ).

## Source

refactoring.guru/design-patterns/mediator
