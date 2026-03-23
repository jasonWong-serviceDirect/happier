import { z } from 'zod';

/**
 * Native Claude Code session listing.
 *
 * Scans ~/.claude/projects/ on the daemon's machine to discover sessions
 * started directly via the `claude` CLI (outside of Happier).
 */

export const NativeSessionEntrySchema = z.object({
  sessionId: z.string().min(1),
  projectDir: z.string().min(1),
  projectDirEncoded: z.string().min(1),
  lastPrompt: z.string().nullable(),
  mtimeMs: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  isActive: z.boolean(),
  activePid: z.number().int().positive().nullable(),
}).passthrough();
export type NativeSessionEntry = z.infer<typeof NativeSessionEntrySchema>;

export const NativeSessionProjectDirSummarySchema = z.object({
  dir: z.string().min(1),
  dirEncoded: z.string().min(1),
  sessionCount: z.number().int().nonnegative(),
  latestMtimeMs: z.number().nonnegative(),
}).passthrough();
export type NativeSessionProjectDirSummary = z.infer<typeof NativeSessionProjectDirSummarySchema>;

export const NativeSessionListRequestSchema = z.object({
  projectDir: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
}).passthrough();
export type NativeSessionListRequest = z.infer<typeof NativeSessionListRequestSchema>;

export const NativeSessionListResponseSchema = z.object({
  sessions: z.array(NativeSessionEntrySchema),
  totalCount: z.number().int().nonnegative(),
  projectDirs: z.array(NativeSessionProjectDirSummarySchema),
}).passthrough();
export type NativeSessionListResponse = z.infer<typeof NativeSessionListResponseSchema>;

export const NativeSessionTranscriptEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  timestamp: z.string(),
}).passthrough();
export type NativeSessionTranscriptEntry = z.infer<typeof NativeSessionTranscriptEntrySchema>;

export const NativeSessionTranscriptRequestSchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
}).passthrough();
export type NativeSessionTranscriptRequest = z.infer<typeof NativeSessionTranscriptRequestSchema>;

export const NativeSessionTranscriptResponseSchema = z.object({
  messages: z.array(NativeSessionTranscriptEntrySchema),
  truncated: z.boolean(),
}).passthrough();
export type NativeSessionTranscriptResponse = z.infer<typeof NativeSessionTranscriptResponseSchema>;
