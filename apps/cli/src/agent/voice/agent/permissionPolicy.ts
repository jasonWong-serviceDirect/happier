import type { PermissionMode } from '@/api/types';
import type { AcpPermissionHandler } from '@/agent/acp/AcpBackend';
import { isDefaultWriteLikeToolName } from '@/agent/permissions/CodexLikePermissionHandler';

export type VoiceAgentPermissionPolicy = 'yolo' | 'no_tools' | 'read_only';

export function permissionModeForVoiceAgentPolicy(policy: VoiceAgentPermissionPolicy): PermissionMode {
  if (policy === 'yolo') return 'bypassPermissions';
  return 'read-only';
}

export function createVoiceAgentAcpPermissionHandler(permissionPolicy: VoiceAgentPermissionPolicy): AcpPermissionHandler {
  if (permissionPolicy === 'no_tools') {
    return {
      async handleToolCall() {
        return { decision: 'denied' };
      },
    };
  }

  if (permissionPolicy === 'yolo') {
    return {
      async handleToolCall() {
        return { decision: 'approved' };
      },
    };
  }

  return {
    async handleToolCall(_toolCallId, toolName) {
      return { decision: isDefaultWriteLikeToolName(toolName) ? 'denied' : 'approved' };
    },
  };
}
