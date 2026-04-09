# GOF Bridge Pattern

> Separate abstraction from implementation to allow them to vary independently.

## When to Use

- You have a class that needs to vary along two independent dimensions (e.g., shape + renderer, notification + channel)
- You want to avoid a class explosion from combining multiple orthogonal hierarchies
- You need to switch implementations at runtime without changing the abstraction
- You're applying composition over inheritance to eliminate deep inheritance chains

## Instructions

**Classic shape + renderer bridge:**

```typescript
// Implementation interface — can vary independently
interface Renderer {
  renderCircle(radius: number): string;
  renderRectangle(width: number, height: number): string;
}

// Concrete implementations
class SVGRenderer implements Renderer {
  renderCircle(radius: number): string {
    return `<circle r="${radius}" />`;
  }
  renderRectangle(width: number, height: number): string {
    return `<rect width="${width}" height="${height}" />`;
  }
}

class CanvasRenderer implements Renderer {
  renderCircle(radius: number): string {
    return `ctx.arc(0, 0, ${radius}, 0, Math.PI * 2)`;
  }
  renderRectangle(width: number, height: number): string {
    return `ctx.fillRect(0, 0, ${width}, ${height})`;
  }
}

// Abstraction — holds a reference to the implementation
abstract class Shape {
  constructor(protected renderer: Renderer) {}
  abstract draw(): string;
  abstract resize(factor: number): void;
}

// Refined abstractions
class Circle extends Shape {
  constructor(
    renderer: Renderer,
    private radius: number
  ) {
    super(renderer);
  }
  draw(): string {
    return this.renderer.renderCircle(this.radius);
  }
  resize(factor: number): void {
    this.radius *= factor;
  }
}

class Rectangle extends Shape {
  constructor(
    renderer: Renderer,
    private width: number,
    private height: number
  ) {
    super(renderer);
  }
  draw(): string {
    return this.renderer.renderRectangle(this.width, this.height);
  }
  resize(factor: number): void {
    this.width *= factor;
    this.height *= factor;
  }
}

// Four combinations without four classes
const svgCircle = new Circle(new SVGRenderer(), 10);
const canvasCircle = new Circle(new CanvasRenderer(), 10);
const svgRect = new Rectangle(new SVGRenderer(), 20, 10);
```

**Notification + channel bridge (practical backend example):**

```typescript
// Implementation axis: delivery channel
interface MessageChannel {
  send(recipient: string, subject: string, body: string): Promise<void>;
}

class EmailChannel implements MessageChannel {
  async send(recipient: string, subject: string, body: string): Promise<void> {
    console.log(`Email → ${recipient}: [${subject}] ${body}`);
  }
}

class SlackChannel implements MessageChannel {
  async send(recipient: string, subject: string, body: string): Promise<void> {
    console.log(`Slack → #${recipient}: ${body}`);
  }
}

// Abstraction axis: notification type
abstract class Notification {
  constructor(protected channel: MessageChannel) {}
  abstract notify(userId: string, data: Record<string, unknown>): Promise<void>;

  // Swap channel at runtime
  setChannel(channel: MessageChannel): void {
    this.channel = channel;
  }
}

class OrderShippedNotification extends Notification {
  async notify(userId: string, data: Record<string, unknown>): Promise<void> {
    await this.channel.send(
      userId,
      'Your order has shipped',
      `Order #${data.orderId} is on its way. Tracking: ${data.tracking}`
    );
  }
}

class PaymentFailedNotification extends Notification {
  async notify(userId: string, data: Record<string, unknown>): Promise<void> {
    await this.channel.send(
      userId,
      'Payment failed',
      `Your payment of $${data.amount} failed. Please update your payment method.`
    );
  }
}
```

## Details

**Why Bridge prevents class explosion:** Without Bridge, combining 3 shapes × 3 renderers requires 9 classes. With Bridge, 3 shape classes + 3 renderer classes = 6 classes total. The number of combinations grows multiplicatively without the pattern.

**Bridge vs. Adapter:** Adapter works with existing classes to make them compatible. Bridge is designed upfront to allow variation. If you find yourself introducing Bridge after the fact, you might actually want Adapter.

**Bridge vs. Strategy:** Bridge separates a class hierarchy along two dimensions. Strategy encapsulates a single algorithm. Bridge is architectural; Strategy is behavioral. A bridge can contain multiple strategy-like injections.

**Anti-patterns:**

- Using Bridge when there's only one implementation — adds needless complexity
- Implementation that calls back into the abstraction — creates coupling in both directions
- Abstraction that exposes implementation details — defeats the purpose of separation

**Runtime switching:**

```typescript
let channel: MessageChannel = new EmailChannel();
const notification = new OrderShippedNotification(channel);

// Switch to Slack at runtime
notification.setChannel(new SlackChannel());
await notification.notify('ops-team', { orderId: '123', tracking: 'UPS1234' });
```

## Source

refactoring.guru/design-patterns/bridge

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
