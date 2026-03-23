import type { NativeSessionEntry, NativeSessionProjectDirSummary, NativeSessionTranscriptEntry } from '@happier-dev/protocol';
import { RPC_METHODS, isRpcMethodNotFoundResult } from '@happier-dev/protocol/rpc';
import { readRpcErrorCode } from '@happier-dev/protocol/rpcErrors';

import { machineRpcWithServerScope } from '@/sync/runtime/orchestration/serverScopedRpc/serverScopedMachineRpc';
import type { NormalizedMessage } from '@/sync/typesRaw/normalize';

export type MachineNativeSessionsListResult =
    | { ok: true; sessions: readonly NativeSessionEntry[]; totalCount: number; projectDirs: readonly NativeSessionProjectDirSummary[] }
    | { ok: false; supported: false }
    | { ok: false; error: string; errorCode?: string };

export async function machineNativeSessionsList(
    machineId: string,
    params?: { projectDir?: string; limit?: number; offset?: number },
    opts?: Readonly<{ serverId?: string | null }>,
): Promise<MachineNativeSessionsListResult> {
    try {
        const response = await machineRpcWithServerScope<unknown, { projectDir?: string; limit?: number; offset?: number }>({
            machineId,
            serverId: opts?.serverId,
            method: RPC_METHODS.DAEMON_NATIVE_SESSIONS_LIST,
            payload: params ?? {},
        });
        if (isRpcMethodNotFoundResult(response)) {
            return { ok: false, supported: false };
        }
        if (!response || typeof response !== 'object' || !Array.isArray((response as any).projectDirs)) {
            return { ok: false, error: 'Unsupported response from machine RPC' };
        }
        return {
            ok: true,
            sessions: (response as any).sessions ?? [],
            totalCount: (response as any).totalCount ?? 0,
            projectDirs: (response as any).projectDirs ?? [],
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode: readRpcErrorCode(error),
        };
    }
}

export type MachineNativeSessionTranscriptResult =
    | { ok: true; messages: readonly NativeSessionTranscriptEntry[]; truncated: boolean }
    | { ok: false; supported: false }
    | { ok: false; error: string; errorCode?: string };

export async function machineNativeSessionTranscript(
    machineId: string,
    params: { sessionId: string; limit?: number },
    opts?: Readonly<{ serverId?: string | null }>,
): Promise<MachineNativeSessionTranscriptResult> {
    try {
        const response = await machineRpcWithServerScope<unknown, { sessionId: string; limit?: number }>({
            machineId,
            serverId: opts?.serverId,
            method: RPC_METHODS.DAEMON_NATIVE_SESSIONS_TRANSCRIPT,
            payload: params,
        });
        if (isRpcMethodNotFoundResult(response)) {
            return { ok: false, supported: false };
        }
        if (!response || typeof response !== 'object' || !Array.isArray((response as any).messages)) {
            return { ok: false, error: 'Unsupported response from machine RPC' };
        }
        return {
            ok: true,
            messages: (response as any).messages ?? [],
            truncated: (response as any).truncated ?? false,
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode: readRpcErrorCode(error),
        };
    }
}

export function convertTranscriptToNormalizedMessages(
    sourceSessionId: string,
    entries: readonly NativeSessionTranscriptEntry[],
): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const id = `native-hist-${sourceSessionId.slice(0, 8)}-${i}`;
        const createdAt = Date.parse(entry.timestamp) || 0;
        const seq = -10000 + i;

        if (entry.role === 'user') {
            messages.push({
                role: 'user',
                content: { type: 'text', text: entry.text },
                id,
                seq,
                localId: null,
                createdAt,
                isSidechain: false,
            });
        } else {
            messages.push({
                role: 'agent',
                content: [{
                    type: 'text',
                    text: entry.text,
                    uuid: id,
                    parentUUID: null,
                }],
                id,
                seq,
                localId: null,
                createdAt,
                isSidechain: false,
            });
        }
    }

    return messages;
}
