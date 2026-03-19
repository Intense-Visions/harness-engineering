import { z } from 'zod';

export const StreamInfoSchema = z.object({
  name: z.string(),
  branch: z.string().optional(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
});

export type StreamInfo = z.infer<typeof StreamInfoSchema>;

export const StreamIndexSchema = z.object({
  schemaVersion: z.literal(1),
  activeStream: z.string().nullable(),
  streams: z.record(StreamInfoSchema),
});

export type StreamIndex = z.infer<typeof StreamIndexSchema>;

export const DEFAULT_STREAM_INDEX: StreamIndex = {
  schemaVersion: 1,
  activeStream: null,
  streams: {},
};
