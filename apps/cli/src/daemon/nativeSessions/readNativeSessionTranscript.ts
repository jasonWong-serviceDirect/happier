/**
 * Native Claude Code session transcript reader.
 *
 * Reads a JSONL session file from `~/.claude/projects/` and extracts
 * user/assistant message pairs suitable for display in the mobile app.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '@/ui/logger';
import type { NativeSessionTranscriptEntry, NativeSessionTranscriptResponse } from '@happier-dev/protocol';

/** Maximum file size we're willing to read (8 MB). */
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

/** Default number of transcript entries to return. */
const DEFAULT_LIMIT = 100;

export async function readNativeSessionTranscript(params: Readonly<{
  sessionId: string;
  limit?: number;
}>): Promise<NativeSessionTranscriptResponse> {
  const { sessionId, limit = DEFAULT_LIMIT } = params;

  if (!sessionId || sessionId.trim().length === 0) {
    return { messages: [], truncated: false };
  }

  try {
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
    const fileName = sessionId + '.jsonl';

    // Scan project directories to find the session file
    let projectDirs: string[];
    try {
      projectDirs = await fs.readdir(projectsRoot);
    } catch {
      return { messages: [], truncated: false };
    }

    let sessionFilePath: string | null = null;

    for (const dir of projectDirs) {
      const candidate = path.join(projectsRoot, dir, fileName);
      try {
        await fs.stat(candidate);
        sessionFilePath = candidate;
        break;
      } catch {
        // Not in this directory
      }
    }

    if (!sessionFilePath) {
      return { messages: [], truncated: false };
    }

    // Check file size
    const fileStat = await fs.stat(sessionFilePath);
    if (fileStat.size > MAX_FILE_SIZE_BYTES) {
      return { messages: [], truncated: true };
    }

    // Read and parse the JSONL file
    const raw = await fs.readFile(sessionFilePath, 'utf-8');
    const lines = raw.split('\n');

    const entries: NativeSessionTranscriptEntry[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = parsed.type;
      if (type !== 'user' && type !== 'assistant') continue;

      const role = type as 'user' | 'assistant';
      const timestamp = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
      const message = parsed.message as Record<string, unknown> | undefined;
      if (!message) continue;

      let text = '';

      if (role === 'user') {
        if (typeof message.content === 'string') {
          text = message.content;
        } else if (Array.isArray(message.content)) {
          const blocks = message.content as Array<Record<string, unknown>>;
          const textBlock = blocks.find(
            (block) => block.type === 'text' && typeof block.text === 'string',
          );
          if (textBlock && typeof textBlock.text === 'string') {
            text = textBlock.text;
          }
        }
      } else {
        // assistant: content is always an array of content blocks
        if (Array.isArray(message.content)) {
          const blocks = message.content as Array<Record<string, unknown>>;
          const textParts: string[] = [];
          for (const block of blocks) {
            if (block.type === 'text' && typeof block.text === 'string') {
              textParts.push(block.text);
            }
          }
          text = textParts.join('\n');
        }
      }

      if (!text) continue;

      entries.push({ role, text, timestamp });
    }

    // Apply limit: take the last N entries
    let truncated = false;
    let result = entries;

    if (entries.length > limit) {
      result = entries.slice(entries.length - limit);
      truncated = true;
    }

    return { messages: result, truncated };
  } catch (err) {
    logger.debug('[readNativeSessionTranscript] Error reading transcript', {
      sessionId,
      error: String(err),
    });
    return { messages: [], truncated: false };
  }
}
