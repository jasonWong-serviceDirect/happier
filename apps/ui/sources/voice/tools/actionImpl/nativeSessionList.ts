import { storage } from '@/sync/domains/state/storage';
import { machineNativeSessionsList } from '@/sync/ops/machineNativeSessions';
import { useVoiceTargetStore } from '@/voice/runtime/voiceTargetStore';
import { getActiveServerSnapshot } from '@/sync/domains/server/serverRuntime';

function normalizeNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveMachineId(requestedMachineId: string | undefined): string | null {
    if (requestedMachineId) return requestedMachineId;

    const state: any = storage.getState();
    const sessionsObj = state?.sessions ?? {};
    const voiceTarget = useVoiceTargetStore.getState();

    // Try from voice target sessions
    const candidates = [voiceTarget.primaryActionSessionId, voiceTarget.lastFocusedSessionId]
        .map((v) => normalizeNonEmptyString(v))
        .filter(Boolean) as string[];

    for (const sid of candidates) {
        const s = sessionsObj?.[sid] ?? null;
        const machineId = normalizeNonEmptyString(s?.metadata?.machineId);
        if (machineId) return machineId;
    }

    // Try from recent machine paths
    const recent = state?.settings?.recentMachinePaths?.[0] ?? null;
    const machineId = normalizeNonEmptyString(recent?.machineId);
    if (machineId) return machineId;

    // Fallback: any session with a machineId
    for (const s of Object.values(sessionsObj) as any[]) {
        const fallbackMachineId = normalizeNonEmptyString(s?.metadata?.machineId);
        if (fallbackMachineId) return fallbackMachineId;
    }

    return null;
}

export async function listNativeSessionsForVoiceTool(params: Readonly<{
    machineId?: string;
    projectDir?: string;
    limit?: number;
}>): Promise<unknown> {
    const machineId = resolveMachineId(params.machineId);
    if (!machineId) {
        return { ok: false, error: 'No machine available to query native sessions' };
    }

    const serverSnapshot = getActiveServerSnapshot();
    const result = await machineNativeSessionsList(
        machineId,
        {
            projectDir: params.projectDir,
            limit: params.limit ?? 5,
        },
        { serverId: serverSnapshot.serverId },
    );

    return result;
}
