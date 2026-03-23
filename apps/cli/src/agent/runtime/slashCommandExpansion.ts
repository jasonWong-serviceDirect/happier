/**
 * Expand slash commands from `.claude/commands/*.md` files.
 *
 * When a user sends `/commandName args` from the mobile app, the CLI terminal
 * would normally expand the matching `.md` file before the model sees it. This
 * module provides the same expansion for messages that arrive via the daemon
 * (i.e. not through the terminal input path).
 *
 * Expansion includes:
 * - YAML frontmatter stripping
 * - `$ARGUMENTS` substitution
 * - Inline shell command execution (`!`cmd``)
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';

function parseSlashToken(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) return { command: trimmed.slice(1), args: '' };
  return { command: trimmed.slice(1, firstSpace), args: trimmed.slice(firstSpace + 1).trim() };
}

async function findCommandFile(commandName: string, projectRoot: string): Promise<string | null> {
  const candidates = [
    join(projectRoot, '.claude', 'commands', `${commandName}.md`),
    join(homedir(), '.claude', 'commands', `${commandName}.md`),
  ];

  for (const filePath of candidates) {
    try {
      await readFile(filePath, { flag: 'r' });
      return filePath;
    } catch {
      continue;
    }
  }
  return null;
}

function stripFrontmatter(content: string): { body: string; description?: string } {
  if (!content.startsWith('---')) return { body: content };
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return { body: content };

  const frontmatter = content.slice(4, endIndex);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]?.trim();

  return { body: content.slice(endIndex + 4).trimStart(), description };
}

// Shell execution is intentional: the `.md` command files are authored by the user
// and stored in their own `~/.claude/commands/` directory. They may contain shell
// pipelines, redirections, and other syntax that requires a shell interpreter.
// This is NOT user-supplied network input — it is trusted local configuration.
function execShellCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, { timeout: 15_000, cwd }, (err, stdout) => {
      resolve(err ? `(error running \`${command}\`: ${err.message})` : stdout.trimEnd());
    });
  });
}

async function expandInlineCommands(text: string, cwd: string): Promise<string> {
  const pattern = /!\`([^`]+)\`/g;
  const matches: Array<{ full: string; command: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ full: match[0], command: match[1], index: match.index });
  }

  if (matches.length === 0) return text;

  const outputs = await Promise.all(matches.map((m) => execShellCommand(m.command, cwd)));

  let result = '';
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    result += text.slice(cursor, matches[i].index);
    result += outputs[i];
    cursor = matches[i].index + matches[i].full.length;
  }
  result += text.slice(cursor);

  return result;
}

export async function expandSlashCommand(text: string, projectRoot?: string): Promise<string | null> {
  const parsed = parseSlashToken(text);
  if (!parsed) return null;
  if (!parsed.command) return null;

  const root = projectRoot ?? process.cwd();
  const filePath = await findCommandFile(parsed.command, root);
  if (!filePath) return null;

  const raw = await readFile(filePath, 'utf-8');
  const { body } = stripFrontmatter(raw);

  const withArgs = body.replace(/\$ARGUMENTS/g, parsed.args);
  const expanded = await expandInlineCommands(withArgs, root);

  return expanded;
}
