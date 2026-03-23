import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { expandSlashCommand } from './slashCommandExpansion';

describe('expandSlashCommand', () => {
  const testDir = join(tmpdir(), `slash-cmd-test-${Date.now()}`);
  const commandsDir = join(testDir, '.claude', 'commands');

  beforeEach(async () => {
    await mkdir(commandsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns null for non-slash input', async () => {
    expect(await expandSlashCommand('hello', testDir)).toBeNull();
    expect(await expandSlashCommand('  no slash', testDir)).toBeNull();
  });

  it('returns null when no matching .md file exists', async () => {
    expect(await expandSlashCommand('/nonexistent', testDir)).toBeNull();
  });

  it('expands a simple command file', async () => {
    await writeFile(join(commandsDir, 'greet.md'), 'Hello, world!');
    const result = await expandSlashCommand('/greet', testDir);
    expect(result).toBe('Hello, world!');
  });

  it('strips YAML frontmatter', async () => {
    await writeFile(join(commandsDir, 'test.md'), [
      '---',
      'description: A test command',
      'allowed-tools: Bash(git:*)',
      '---',
      '',
      'Do the thing.',
    ].join('\n'));
    const result = await expandSlashCommand('/test', testDir);
    expect(result).toBe('Do the thing.');
  });

  it('substitutes $ARGUMENTS with user-provided args', async () => {
    await writeFile(join(commandsDir, 'greet.md'), 'Hello $ARGUMENTS, welcome!');
    const result = await expandSlashCommand('/greet Jason', testDir);
    expect(result).toBe('Hello Jason, welcome!');
  });

  it('substitutes all occurrences of $ARGUMENTS', async () => {
    await writeFile(join(commandsDir, 'echo.md'), 'First: $ARGUMENTS\nSecond: $ARGUMENTS');
    const result = await expandSlashCommand('/echo test', testDir);
    expect(result).toBe('First: test\nSecond: test');
  });

  it('replaces $ARGUMENTS with empty string when no args given', async () => {
    await writeFile(join(commandsDir, 'bare.md'), 'Args: [$ARGUMENTS]');
    const result = await expandSlashCommand('/bare', testDir);
    expect(result).toBe('Args: []');
  });

  it('expands inline shell commands', async () => {
    await writeFile(join(commandsDir, 'inline.md'), 'Output: !`echo hello`');
    const result = await expandSlashCommand('/inline', testDir);
    expect(result).toBe('Output: hello');
  });

  it('expands multiple inline shell commands in parallel', async () => {
    await writeFile(join(commandsDir, 'multi.md'), 'A=!`echo aaa` B=!`echo bbb`');
    const result = await expandSlashCommand('/multi', testDir);
    expect(result).toBe('A=aaa B=bbb');
  });

  it('handles dotted command names like edison.task-show', async () => {
    await writeFile(join(commandsDir, 'edison.task-show.md'), 'Show task $ARGUMENTS');
    const result = await expandSlashCommand('/edison.task-show T-42', testDir);
    expect(result).toBe('Show task T-42');
  });

  it('returns content without frontmatter description extraction affecting body', async () => {
    await writeFile(join(commandsDir, 'fancy.md'), [
      '---',
      'description: Fancy command',
      '---',
      '',
      'Line 1',
      'Line 2',
    ].join('\n'));
    const result = await expandSlashCommand('/fancy', testDir);
    expect(result).toBe('Line 1\nLine 2');
  });
});
