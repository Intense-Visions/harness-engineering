# NestJS Microservices

> Connect services with ClientsModule, @MessagePattern, @EventPattern, and TCP/Redis transport

## When to Use

- You are decomposing a monolith into independent services that communicate over a message broker
- You need request/response messaging between services (command-reply pattern)
- You need one-way event broadcasting to multiple downstream services
- You need to choose a transport (TCP for low-latency internal, Redis/RabbitMQ for durability)

## Instructions

1. **Bootstrap as a microservice:**

```typescript
// main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.REDIS,
  options: { host: 'localhost', port: 6379 },
});
await app.listen();
```

2. **Handle incoming messages:**

```typescript
@Controller()
export class OrdersController {
  @MessagePattern({ cmd: 'get_order' }) // request/response
  getOrder(@Payload() data: { id: string }): Promise<Order> {
    return this.ordersService.findOne(data.id);
  }

  @EventPattern('order_created') // fire-and-forget
  async handleOrderCreated(@Payload() data: OrderCreatedEvent): Promise<void> {
    await this.inventoryService.reserve(data.items);
  }
}
```

3. **Call a microservice from another service:**

```typescript
// register the client in a module
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'ORDERS_SERVICE',
        transport: Transport.REDIS,
        options: { host: 'localhost', port: 6379 },
      },
    ]),
  ],
})
// inject and use
@Injectable()
export class ApiGatewayService {
  constructor(@InjectClient('ORDERS_SERVICE') private client: ClientProxy) {}

  getOrder(id: string): Observable<Order> {
    return this.client.send<Order>({ cmd: 'get_order' }, { id });
  }

  notifyOrderCreated(event: OrderCreatedEvent): Observable<void> {
    return this.client.emit('order_created', event);
  }
}
```

4. **Hybrid application** (HTTP + microservice on the same app):

```typescript
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.REDIS,
  options: { host: 'localhost', port: 6379 },
});
await app.startAllMicroservices();
await app.listen(3000);
```

5. **Exception handling:** Throw `RpcException` inside message handlers — it serializes cleanly to the caller.

## Details

**Transport comparison:**

- **TCP** — built-in, no external dependency, lowest latency, point-to-point only
- **Redis** — pub/sub with persistence off by default, good for event fan-out, requires Redis
- **RabbitMQ** — durable queues, dead-letter exchange, complex routing, good for reliable delivery
- **Kafka** — partitioned log, replay, high throughput, best for event sourcing and stream processing
- **NATS** — lightweight, fast, at-most-once delivery by default (NATS JetStream for persistence)

**`send()` vs `emit()`:** `send()` is request/response — it returns an Observable that emits the reply. `emit()` is fire-and-forget — it returns an Observable that completes when the message is sent (no reply). Always `subscribe()` to both, or convert to Promise with `firstValueFrom()`.

**`@Payload()` and `@Ctx()`:** Use `@Payload()` to extract the message payload. Use `@Ctx()` to get the transport context (e.g., `RmqContext` for RabbitMQ to manually acknowledge messages).

**Manual acknowledgment (RabbitMQ):**

```typescript
@MessagePattern('order_created')
async handle(@Payload() data: OrderCreatedEvent, @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const message = context.getMessage();
  await this.processOrder(data);
  channel.ack(message); // only ack after successful processing
}
```

**Serialization:** By default, NestJS serializes/deserializes with `JSON.stringify/parse`. For binary protocols (protobuf, msgpack), configure a custom serializer/deserializer pair.

## Source

https://docs.nestjs.com/microservices/basics
