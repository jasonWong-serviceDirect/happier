import { getVoiceSession, isVoiceSessionStarted } from '@/realtime/RealtimeSession';
import { storage } from '@/sync/domains/state/storage';
import { appendLocalVoiceAgentContextUpdate, isLocalVoiceAgentActive } from '@/voice/local/localVoiceEngine';
import { VOICE_AGENT_GLOBAL_SESSION_ID } from '@/voice/agent/voiceAgentGlobalSessionId';
import type { VoiceContextSink } from './VoiceContextSink';

export function getVoiceContextSinkForSession(sessionId: string): VoiceContextSink | null {
    const voice = getVoiceSession();
    if (voice && isVoiceSessionStarted()) {
        return {
            sendContextualUpdate: (_sessionId, update) => voice.sendContextualUpdate(update),
            sendTextMessage: (_sessionId, update) => voice.sendTextMessage(update),
        };
    }

    const settings = storage.getState().settings as any;
    const providerId = settings?.voice?.providerId ?? 'off';
    if (providerId === 'local_conversation' && isLocalVoiceAgentActive(VOICE_AGENT_GLOBAL_SESSION_ID)) {
        return {
            // Local agent is global: all session updates are forwarded into the single agent context.
            sendContextualUpdate: (_sid, update) => appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, update),
            sendTextMessage: (_sid, update) => appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, update),
        };
    }

    return null;
}
