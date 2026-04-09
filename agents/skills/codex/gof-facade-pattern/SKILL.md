# GOF Facade Pattern

> Provide a simplified interface to a complex subsystem to reduce coupling for clients.

## When to Use

- A subsystem has grown complex and clients only use a fraction of its features
- You want to layer a clean public API over a messy legacy system
- You need to reduce coupling between clients and subsystem internals
- You're integrating multiple third-party libraries and want one coherent interface

## Instructions

**Classic facade hiding multiple subsystems:**

```typescript
// Complex subsystems — lots of moving parts
class VideoEncoder {
  encode(filePath: string, format: 'mp4' | 'webm'): Promise<string> {
    console.log(`Encoding ${filePath} to ${format}`);
    return Promise.resolve(`${filePath}.${format}`);
  }
}

class ThumbnailExtractor {
  extract(videoPath: string, atSeconds: number): Promise<string> {
    console.log(`Extracting thumbnail at ${atSeconds}s from ${videoPath}`);
    return Promise.resolve(`${videoPath}-thumb.jpg`);
  }
}

class CDNUploader {
  upload(filePath: string, bucket: string): Promise<string> {
    console.log(`Uploading ${filePath} to ${bucket}`);
    return Promise.resolve(`https://cdn.example.com/${bucket}/${filePath}`);
  }
}

class MetadataStore {
  save(videoId: string, meta: Record<string, unknown>): Promise<void> {
    console.log(`Saving metadata for ${videoId}`);
    return Promise.resolve();
  }
}

// Facade — single coherent interface over the subsystem
class VideoProcessingFacade {
  private encoder = new VideoEncoder();
  private thumbExtractor = new ThumbnailExtractor();
  private uploader = new CDNUploader();
  private metaStore = new MetadataStore();

  async processUpload(
    rawFilePath: string,
    videoId: string,
    options: { format: 'mp4' | 'webm'; thumbnailAt: number } = { format: 'mp4', thumbnailAt: 5 }
  ): Promise<{ videoUrl: string; thumbnailUrl: string }> {
    // Orchestrate subsystems — client doesn't need to know any of this
    const encodedPath = await this.encoder.encode(rawFilePath, options.format);
    const thumbPath = await this.thumbExtractor.extract(encodedPath, options.thumbnailAt);

    const [videoUrl, thumbnailUrl] = await Promise.all([
      this.uploader.upload(encodedPath, 'videos'),
      this.uploader.upload(thumbPath, 'thumbnails'),
    ]);

    await this.metaStore.save(videoId, { videoUrl, thumbnailUrl, processedAt: new Date() });

    return { videoUrl, thumbnailUrl };
  }
}

// Client code — clean, simple
const videoFacade = new VideoProcessingFacade();
const result = await videoFacade.processUpload('/tmp/raw-upload.mov', 'vid-123');
console.log(result.videoUrl);
```

**API service facade (common in backend apps):**

```typescript
// Instead of clients knowing about Prisma, Redis, and Stripe separately
class UserAccountFacade {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: RedisClient,
    private readonly payments: Stripe,
    private readonly mailer: Mailer
  ) {}

  async createAccount(data: CreateAccountInput): Promise<UserAccount> {
    // Transaction across multiple systems
    const user = await this.db.user.create({ data: { email: data.email } });
    const customer = await this.payments.customers.create({ email: data.email });
    await this.db.user.update({ where: { id: user.id }, data: { stripeId: customer.id } });
    await this.cache.set(`user:${user.id}`, JSON.stringify(user), 'EX', 300);
    await this.mailer.sendWelcome(user.email);
    return user;
  }

  async getUser(userId: string): Promise<UserAccount | null> {
    const cached = await this.cache.get(`user:${userId}`);
    if (cached) return JSON.parse(cached);
    return this.db.user.findUnique({ where: { id: userId } });
  }
}
```

## Details

**Facade vs. Adapter:** Facade simplifies an interface — it's for you, the client. Adapter translates one interface to another — it's about compatibility. A Facade can internally use Adapters to talk to subsystems.

**Facade vs. API Gateway:** In microservices, an API Gateway is a Facade at the network level. It provides a unified entry point over multiple backend services. Same pattern, different layer.

**Facade does not prevent direct subsystem access:** The facade provides a simpler path but doesn't lock out direct use. Clients who need fine-grained control can still access subsystems directly. Document when the facade is insufficient.

**Anti-patterns:**

- God facade that exposes everything — a facade exposing 40 methods is just a bad subsystem with extra steps
- Facade that performs no orchestration — if it's just forwarding one call, the abstraction adds no value
- Facade that leaks subsystem types in its public API — clients shouldn't need to import subsystem classes to use the facade

**Testability:** The facade is the right seam for integration tests. Test the facade's contract. Test the individual subsystem components in isolation.

## Source

refactoring.guru/design-patterns/facade

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
