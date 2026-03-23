/**
 * Native Claude Code session scanner.
 *
 * Discovers sessions started directly via the `claude` CLI (outside of Happier)
 * by scanning `~/.claude/projects/` JSONL files and cross-referencing with the
 * active-session index in `~/.claude/sessions/`.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '@/ui/logger';
import type {
  NativeSessionListResponse,
  NativeSessionEntry,
  NativeSessionProjectDirSummary,
} from '@happier-dev/protocol';

/** Bytes to read from the tail of a JSONL file when searching for `last-prompt`. */
const TAIL_READ_BYTES = 4096;

/** Bytes to read from the head of a JSONL file when searching for `cwd` / first user message. */
const HEAD_READ_BYTES = 2048;

/** Maximum character length for the `lastPrompt` field. */
const MAX_LAST_PROMPT_CHARS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeProjectDirName(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded;
  return encoded.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Check whether a process with the given PID is alive.
 * Uses signal 0 which performs the existence check without sending an actual signal.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface ActiveSessionInfo {
  pid: number;
  cwd: string;
}

/**
 * Build an index of active Claude sessions from `~/.claude/sessions/*.json`.
 * Each file contains `{ pid, sessionId, cwd, startedAt }`.
 */
async function buildActiveSessionIndex(): Promise<Map<string, ActiveSessionInfo>> {
  const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
  const index = new Map<string, ActiveSessionInfo>();

  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return index;
  }

  const readTasks = entries
    .filter((name) => name.endsWith('.json'))
    .map(async (name) => {
      try {
        const raw = await fs.readFile(path.join(sessionsDir, name), 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const pid = typeof parsed.pid === 'number' ? parsed.pid : null;
        const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : null;
        const cwd = typeof parsed.cwd === 'string' ? parsed.cwd : '';

        if (pid !== null && sessionId && isPidAlive(pid)) {
          index.set(sessionId, { pid, cwd });
        }
      } catch {
        // Skip unreadable / malformed files
      }
    });

  await Promise.all(readTasks);
  return index;
}

// ---------------------------------------------------------------------------
// JSONL metadata extraction
// ---------------------------------------------------------------------------

interface SessionFileMetadata {
  lastPrompt: string | null;
  cwd: string | null;
}

/**
 * Extract metadata from a single JSONL session file.
 *
 * Reads the tail to find `type: "last-prompt"` and the head to find `cwd`
 * and a fallback first-user-message prompt.
 */
async function extractSessionMetadata(filePath: string, fileSize: number): Promise<SessionFileMetadata> {
  let lastPrompt: string | null = null;
  let cwd: string | null = null;

  let fh: fs.FileHandle | null = null;
  try {
    fh = await fs.open(filePath, 'r');

    // --- Tail: search for last-prompt ---
    const tailSize = Math.min(fileSize, TAIL_READ_BYTES);
    const tailOffset = Math.max(0, fileSize - tailSize);
    const tailBuf = Buffer.alloc(tailSize);
    await fh.read(tailBuf, 0, tailSize, tailOffset);
    const tailLines = tailBuf.toString('utf-8').split('\n');

    for (let i = tailLines.length - 1; i >= 0; i--) {
      const line = tailLines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.type === 'last-prompt' && typeof parsed.lastPrompt === 'string') {
          lastPrompt = parsed.lastPrompt.slice(0, MAX_LAST_PROMPT_CHARS);
          break;
        }
      } catch {
        // Malformed line; continue
      }
    }

    // --- Head: search for cwd and fallback prompt ---
    const headSize = Math.min(fileSize, HEAD_READ_BYTES);
    const headBuf = Buffer.alloc(headSize);
    await fh.read(headBuf, 0, headSize, 0);
    const headLines = headBuf.toString('utf-8').split('\n');

    let fallbackPrompt: string | null = null;

    for (const line of headLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;

        // Extract cwd from the first entry that has one
        if (!cwd && typeof parsed.cwd === 'string' && parsed.cwd.length > 0) {
          cwd = parsed.cwd;
        }

        // Extract first user message content as fallback prompt
        if (!fallbackPrompt && parsed.type === 'user') {
          const message = parsed.message as Record<string, unknown> | undefined;
          if (message) {
            if (typeof message.content === 'string') {
              fallbackPrompt = message.content.slice(0, MAX_LAST_PROMPT_CHARS);
            } else if (Array.isArray(message.content)) {
              const textBlock = (message.content as Array<Record<string, unknown>>).find(
                (block) => block.type === 'text' && typeof block.text === 'string',
              );
              if (textBlock && typeof textBlock.text === 'string') {
                fallbackPrompt = textBlock.text.slice(0, MAX_LAST_PROMPT_CHARS);
              }
            }
          }
        }

        // Also check queue-operation entries for a content field (initial prompt)
        if (!fallbackPrompt && parsed.type === 'queue-operation' && typeof parsed.content === 'string' && parsed.content.length > 0) {
          fallbackPrompt = parsed.content.slice(0, MAX_LAST_PROMPT_CHARS);
        }

        if (cwd && fallbackPrompt) break;
      } catch {
        // Malformed line; continue
      }
    }

    if (!lastPrompt && fallbackPrompt) {
      lastPrompt = fallbackPrompt;
    }
  } catch (err) {
    logger.debug('[listNativeSessions] Error reading session file', { filePath, error: String(err) });
  } finally {
    await fh?.close();
  }

  return { lastPrompt, cwd };
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export async function listNativeSessions(params: Readonly<{
  projectDir?: string;
  limit?: number;
  offset?: number;
}>): Promise<NativeSessionListResponse> {
  const { projectDir, limit = 50, offset = 0 } = params;
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

  // Step 1: Build active session index
  const activeIndex = await buildActiveSessionIndex();

  // Step 2: Enumerate project directories and build summaries
  let projectEntries: string[];
  try {
    projectEntries = await fs.readdir(projectsRoot);
  } catch {
    return { sessions: [], totalCount: 0, projectDirs: [] };
  }

  // Cache: first successful cwd read per project dir (used as decoded dir name)
  const cwdCache = new Map<string, string>();

  const projectDirs: NativeSessionProjectDirSummary[] = [];

  const dirTasks = projectEntries.map(async (dirEncoded) => {
    const dirPath = path.join(projectsRoot, dirEncoded);
    try {
      const dirStat = await fs.stat(dirPath);
      if (!dirStat.isDirectory()) return null;
    } catch {
      return null;
    }

    let files: string[];
    try {
      files = await fs.readdir(dirPath);
    } catch {
      return null;
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    let latestMtimeMs = 0;

    // Stat all JSONL files to find the latest mtime
    const statTasks = jsonlFiles.map(async (file) => {
      try {
        const fileStat = await fs.stat(path.join(dirPath, file));
        if (fileStat.mtimeMs > latestMtimeMs) {
          latestMtimeMs = fileStat.mtimeMs;
        }
      } catch {
        // Skip unreadable files
      }
    });
    await Promise.all(statTasks);

    // Try to read cwd from the first session file for a better decoded dir name
    let decodedDir = decodeProjectDirName(dirEncoded);
    for (const file of jsonlFiles.slice(0, 3)) {
      try {
        const filePath = path.join(dirPath, file);
        const fileStat = await fs.stat(filePath);
        const meta = await extractSessionMetadata(filePath, fileStat.size);
        if (meta.cwd) {
          decodedDir = meta.cwd;
          cwdCache.set(dirEncoded, meta.cwd);
          break;
        }
      } catch {
        // Continue to next file
      }
    }

    return {
      dir: decodedDir,
      dirEncoded,
      sessionCount: jsonlFiles.length,
      latestMtimeMs,
    } satisfies NativeSessionProjectDirSummary;
  });

  const dirResults = await Promise.all(dirTasks);
  for (const result of dirResults) {
    if (result) projectDirs.push(result);
  }

  // Sort project dirs by latest mtime descending
  projectDirs.sort((a, b) => b.latestMtimeMs - a.latestMtimeMs);

  // Step 3: If no projectDir filter, return summaries only (performance guard)
  if (!projectDir) {
    return { sessions: [], totalCount: 0, projectDirs };
  }

  // Step 4: Extract session metadata for the matching project directory
  // Find the matching project dir (by encoded name or decoded path)
  let matchedDirEncoded: string | null = null;
  for (const summary of projectDirs) {
    if (summary.dirEncoded === projectDir || summary.dir === projectDir) {
      matchedDirEncoded = summary.dirEncoded;
      break;
    }
  }

  if (!matchedDirEncoded) {
    return { sessions: [], totalCount: 0, projectDirs };
  }

  const matchedDirPath = path.join(projectsRoot, matchedDirEncoded);
  let matchedFiles: string[];
  try {
    matchedFiles = await fs.readdir(matchedDirPath);
  } catch {
    return { sessions: [], totalCount: 0, projectDirs };
  }

  const jsonlFiles = matchedFiles.filter((f) => f.endsWith('.jsonl'));

  // Build session entries with file stats and metadata
  interface SessionWithMtime {
    entry: NativeSessionEntry;
    mtimeMs: number;
  }

  const cachedCwd = cwdCache.get(matchedDirEncoded);

  const sessionTasks = jsonlFiles.map(async (file): Promise<SessionWithMtime | null> => {
    const filePath = path.join(matchedDirPath, file);
    const sessionId = file.replace(/\.jsonl$/, '');

    try {
      const fileStat = await fs.stat(filePath);
      const meta = await extractSessionMetadata(filePath, fileStat.size);

      const activeInfo = activeIndex.get(sessionId);

      // Use cwd from this file, or the cached cwd from dir scanning, or heuristic decode
      const resolvedDir = meta.cwd ?? cachedCwd ?? decodeProjectDirName(matchedDirEncoded!);

      return {
        mtimeMs: fileStat.mtimeMs,
        entry: {
          sessionId,
          projectDir: resolvedDir,
          projectDirEncoded: matchedDirEncoded!,
          lastPrompt: meta.lastPrompt,
          mtimeMs: fileStat.mtimeMs,
          sizeBytes: fileStat.size,
          isActive: !!activeInfo,
          activePid: activeInfo?.pid ?? null,
        },
      };
    } catch {
      return null;
    }
  });

  const sessionResults = await Promise.all(sessionTasks);
  const allSessions: SessionWithMtime[] = [];
  for (const result of sessionResults) {
    if (result) allSessions.push(result);
  }

  // Sort by mtimeMs descending
  allSessions.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const totalCount = allSessions.length;
  const sliced = allSessions.slice(offset, offset + limit);

  return {
    sessions: sliced.map((s) => s.entry),
    totalCount,
    projectDirs,
  };
}
