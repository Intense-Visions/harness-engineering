# File Upload Security

> Secure file upload endpoints against malicious files, path traversal, resource exhaustion, and code execution

## When to Use

- Building file upload endpoints (avatars, documents, attachments)
- Accepting user-generated content that includes files
- Storing uploaded files on disk or cloud storage
- Serving uploaded files back to users
- Reviewing existing upload functionality for security gaps

## Instructions

1. **Validate file type by magic bytes, not just the extension or Content-Type header.** Users can rename `malware.exe` to `photo.jpg` and set any Content-Type. Inspect the file's magic bytes (first few bytes of the file content).

```typescript
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

async function validateFileType(buffer: Buffer): Promise<string> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_TYPES.has(type.mime)) {
    throw new ValidationError(`File type not allowed: ${type?.mime ?? 'unknown'}`);
  }
  return type.mime;
}
```

2. **Enforce file size limits.** Prevent resource exhaustion by limiting both individual file size and total request size.

```typescript
import multer from 'multer';

const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 5, // Max 5 files per request
    fieldSize: 1024, // Max 1 KB for text fields
  },
  storage: multer.memoryStorage(), // Store in memory for validation before saving
});

// Apply middleware
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const mime = await validateFileType(req.file.buffer);
  // ... save file
});
```

3. **Generate random filenames.** Never use the original filename — it can contain path traversal sequences (`../../etc/passwd`) or special characters that break storage systems.

```typescript
import crypto from 'node:crypto';
import path from 'node:path';

function generateSafeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

  if (!allowedExtensions.has(ext)) {
    throw new ValidationError(`Extension not allowed: ${ext}`);
  }

  return `${crypto.randomUUID()}${ext}`;
}
```

4. **Store uploads outside the web root.** Never store uploaded files in a directory served by your web server. Use a dedicated storage directory or cloud storage (S3, GCS).

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

async function uploadToS3(buffer: Buffer, filename: string, contentType: string) {
  const client = new S3Client({ region: 'us-east-1' });

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.UPLOAD_BUCKET,
      Key: `uploads/${filename}`,
      Body: buffer,
      ContentType: contentType,
      ContentDisposition: 'attachment', // Force download, prevent inline execution
    })
  );
}
```

5. **Serve files with `Content-Disposition: attachment`** to prevent browsers from executing uploaded content (e.g., HTML files with JavaScript).

```typescript
app.get('/files/:id', async (req, res) => {
  const file = await getFileMetadata(req.params.id);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.displayName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stream = await getFileStream(file.storagePath);
  stream.pipe(res);
});
```

6. **Serve uploaded files from a separate domain.** Use a different origin (e.g., `uploads.example.com`) so that any XSS in uploaded files cannot access cookies or APIs on your main domain.

7. **Scan uploads for malware** in high-security environments. Use ClamAV or a cloud-based scanning service.

```typescript
import NodeClam from 'clamscan';

const clam = await new NodeClam().init({
  clamdscan: { socket: '/var/run/clamav/clamd.ctl' },
});

async function scanFile(filePath: string): Promise<boolean> {
  const { isInfected } = await clam.isInfected(filePath);
  return !isInfected;
}
```

8. **Strip metadata from images** to remove EXIF data that may contain GPS coordinates, camera info, or embedded scripts.

```typescript
import sharp from 'sharp';

async function sanitizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // Auto-rotate based on EXIF, then strip EXIF
    .withMetadata(false) // Remove all metadata
    .toBuffer();
}
```

9. **Implement upload rate limiting** per user to prevent abuse.

```typescript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per window
  message: { error: 'Too many uploads. Try again later.' },
  keyGenerator: (req) => req.user?.id ?? req.ip,
});

app.post('/upload', uploadLimiter, upload.single('file'), handler);
```

10. **Log all upload activity** with user ID, file hash, file type, and result (accepted/rejected) for audit trails.

## Details

**Attack vectors addressed:**

- **Malicious file execution:** Attacker uploads a PHP/JSP shell disguised as an image. Mitigated by storing outside web root and generating random filenames.
- **Path traversal:** Filename contains `../../` to write outside the upload directory. Mitigated by generating random filenames.
- **XSS via uploaded HTML/SVG:** Attacker uploads an HTML file with JavaScript. Mitigated by `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and serving from a separate domain.
- **Denial of service:** Attacker uploads very large files or many files. Mitigated by size limits and rate limiting.
- **Zip bombs:** A small zip file that expands to gigabytes. If accepting archives, check uncompressed size before extraction.

**Image-specific risks:** SVG files can contain JavaScript (`<script>` tags, `onload` handlers). If accepting SVG uploads, sanitize them by parsing and removing script elements, or convert to a raster format.

**Cloud storage best practices:**

- Use pre-signed URLs for direct upload to S3/GCS (avoids your server handling large files)
- Set bucket policies to deny public access by default
- Enable server-side encryption
- Set lifecycle policies to auto-delete orphaned uploads

**Common mistakes:**

- Trusting the `Content-Type` header (user-controlled)
- Using the original filename for storage
- Serving uploads from the same origin as the application
- Not limiting file size at the server level (relying only on client-side limits)
- Storing uploads in a publicly accessible directory

## Source

https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
