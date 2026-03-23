import { describe, expect, it } from 'vitest';

import { isSafePermissionModeForIntent } from './ExecutionRunPolicy';

describe('isSafePermissionModeForIntent', () => {
  it('treats memory_hints as read-only or no-tools only', () => {
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'no_tools')).toBe(true);
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'read_only')).toBe(true);
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'workspace_write')).toBe(false);
  });

  it('allows yolo permission mode for voice_agent intent', () => {
    expect(isSafePermissionModeForIntent('voice_agent', 'yolo')).toBe(true);
    expect(isSafePermissionModeForIntent('voice_agent', 'no_tools')).toBe(true);
    expect(isSafePermissionModeForIntent('voice_agent', 'read_only')).toBe(true);
  });

  it('does not allow yolo for review or plan intents', () => {
    expect(isSafePermissionModeForIntent('review', 'yolo')).toBe(false);
    expect(isSafePermissionModeForIntent('plan', 'yolo')).toBe(false);
  });
});

