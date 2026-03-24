import { describe, expect, it, vi } from 'vitest';
import { VOICE_AGENT_GLOBAL_SESSION_ID } from '@/voice/agent/voiceAgentGlobalSessionId';

import {
    daemonVoiceAgentCancelTurnStream,
    createdAudioPlayers,
    daemonVoiceAgentReadTurnStream,
    daemonVoiceAgentSendTurn,
    daemonVoiceAgentStart,
    daemonVoiceAgentStartTurnStream,
    daemonVoiceAgentWelcome,
    daemonVoiceAgentStop,
    expoSpeechSpeak,
    getStorage,
    registerLocalVoiceEngineHarnessHooks,
    routerNavigate,
    setActiveServerAndSwitch,
    sessionExecutionRunStart,
    sendMessage,
} from './localVoiceEngine.testHarness';
import { RPC_ERROR_CODES } from '@happier-dev/protocol/rpc';

describe('local voice engine agent behavior', () => {
    registerLocalVoiceEngineHarnessHooks();

    it('agent mode (openai_compat) chats without persisting to the session when no tool actions are emitted', async () => {
        const { useVoiceActivityStore } = await import('@/voice/activity/voiceActivityStore');

        useVoiceActivityStore.setState((state) => ({ ...state, eventsBySessionId: {} }));

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                baseUrl: 'http://localhost:8001',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'Voice agent reply' } }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        const stopPromise = toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && (globalThis.fetch as any).mock.calls.length < 3; i++) {
            await Promise.resolve();
        }
        for (let i = 0; i < 2000 && createdAudioPlayers.length === 0; i++) {
            await Promise.resolve();
        }
        expect(createdAudioPlayers.length).toBeGreaterThan(0);
        createdAudioPlayers[0].__emit('playbackStatusUpdate', { didJustFinish: true });
        await stopPromise;

        expect(sendMessage).not.toHaveBeenCalled();

        const events = (useVoiceActivityStore.getState().eventsBySessionId[VOICE_AGENT_GLOBAL_SESSION_ID] ?? []) as any[];
        expect(events.some((e) => e.kind === 'user.text' && String(e.text).includes('hello world'))).toBe(true);
        expect(events.some((e) => e.kind === 'assistant.text' && String(e.text).includes('Voice agent reply'))).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect((globalThis.fetch as any).mock.calls[1]?.[0]).toContain('/v1/chat/completions');
    }, 30_000);

    it('agent mode (openai_compat) sends a session message when the voice agent emits sendSessionMessage', async () => {
        const { useVoiceTargetStore } = await import('@/voice/runtime/voiceTargetStore');
        useVoiceTargetStore.getState().setPrimaryActionSessionId('s1');

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                baseUrl: 'http://localhost:8001',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        const actionBlock = [
            '<voice_actions>',
            JSON.stringify({ actions: [{ t: 'sendSessionMessage', args: { message: 'Please do X.' } }] }),
            '</voice_actions>',
        ].join('\n');

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: `Voice agent reply\n\n${actionBlock}` } }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        const stopPromise = toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && (globalThis.fetch as any).mock.calls.length < 3; i++) {
            await Promise.resolve();
        }
        for (let i = 0; i < 2000 && createdAudioPlayers.length === 0; i++) {
            await Promise.resolve();
        }
        createdAudioPlayers[0].__emit('playbackStatusUpdate', { didJustFinish: true });
        await stopPromise;

        expect(sendMessage).toHaveBeenCalledWith('s1', 'Please do X.');
    });

    it('agent mode can update tracked sessions via tool actions', async () => {
        const { useVoiceTargetStore } = await import('@/voice/runtime/voiceTargetStore');
        useVoiceTargetStore.getState().setPrimaryActionSessionId('s1');
        useVoiceTargetStore.getState().setTrackedSessionIds([]);

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
                s2: { id: 's2', metadata: { path: '/tmp2', host: 'test' } },
            },
        });

        const actionBlock = [
            '<voice_actions>',
            JSON.stringify({ actions: [{ t: 'setTrackedSessions', args: { sessionIds: ['s1', 's2'] } }] }),
            '</voice_actions>',
        ].join('\n');

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: `Voice agent reply\n\n${actionBlock}` } }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'Done.' } }] }),
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(useVoiceTargetStore.getState().trackedSessionIds).toEqual(['s1', 's2']);

        const chatCalls = (globalThis.fetch as any).mock.calls.filter((call: any[]) => String(call?.[0] ?? '').includes('/chat/completions'));
        const hasToolResultsMessage = chatCalls.some((call: any[]) => {
            const body = JSON.parse(String(call?.[1]?.body ?? '{}'));
            const messages = Array.isArray(body?.messages) ? body.messages : [];
            return messages.some((m: any) => typeof m?.content === 'string' && m.content.includes('VOICE_TOOL_RESULTS_JSON:'));
        });
        expect(hasToolResultsMessage).toBe(true);
    });

    it('agent mode includes buffered context updates in the next turn', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'Voice agent reply' } }] }),
            });

        const { toggleLocalVoiceTurn, appendLocalVoiceAgentContextUpdate } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Session became focused: s1');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        const requestBody = (globalThis.fetch as any).mock.calls?.[1]?.[1]?.body;
        expect(String(requestBody)).toContain('Session became focused: s1');
    });

    it('resets to idle with send_failed when agent turn request throws', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                baseUrl: 'http://localhost:8001',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockRejectedValueOnce(new Error('agent turn failed'));

        const { toggleLocalVoiceTurn, getLocalVoiceState } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await expect(toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID)).resolves.toBeUndefined();

        const nextState = getLocalVoiceState();
        expect(nextState.status).toBe('idle');
        // Keep the session active so the user can retry without re-starting voice.
        expect(nextState.sessionId).toBe(VOICE_AGENT_GLOBAL_SESSION_ID);
        expect(nextState.error).toBe('send_failed');
    });

    it('falls back to openai_compat agent when daemon agent is unsupported and openai_compat is configured', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'session-model', metadata: { flavor: 'codex' } },
            },
        });

        const error: any = new Error('unsupported');
        error.rpcErrorCode = 'VOICE_AGENT_UNSUPPORTED';
        daemonVoiceAgentStart.mockRejectedValueOnce(error);

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'Voice agent reply' } }] }),
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStart).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect((globalThis.fetch as any).mock.calls[1]?.[0]).toContain('/v1/chat/completions');
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('recreates daemon agent handle when daemon reports VOICE_AGENT_NOT_FOUND', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart
            .mockResolvedValueOnce({ voiceAgentId: 'va1' })
            .mockResolvedValueOnce({ voiceAgentId: 'va2' });
        daemonVoiceAgentSendTurn
            .mockRejectedValueOnce(Object.assign(new Error('not found'), { rpcErrorCode: 'VOICE_AGENT_NOT_FOUND' }))
            .mockResolvedValueOnce({ assistantText: 'Recovered reply' });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStart).toHaveBeenCalledTimes(2);
        expect(daemonVoiceAgentSendTurn).toHaveBeenCalledTimes(2);
    });

    it('uses daemon streaming agent methods when streaming is enabled', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: true,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStartTurnStream.mockResolvedValueOnce({ streamId: 'stream-abc' });
        daemonVoiceAgentReadTurnStream.mockResolvedValueOnce({
            streamId: 'stream-abc',
            events: [{ t: 'done', assistantText: 'streamed reply' }],
            nextCursor: 1,
            done: true,
        });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStartTurnStream).toHaveBeenCalledTimes(1);
        expect(daemonVoiceAgentReadTurnStream).toHaveBeenCalledTimes(1);
        expect(daemonVoiceAgentSendTurn).not.toHaveBeenCalled();
    });

    it('prewarmOnConnect starts the daemon voice agent when recording begins (before STT completes)', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                                prewarmOnConnect: true,
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: false,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && daemonVoiceAgentStart.mock.calls.length < 1; i++) {
            await Promise.resolve();
        }

        expect(daemonVoiceAgentStart).toHaveBeenCalledTimes(1);
    });

    it('welcome (immediate) triggers a daemon welcome action during prewarm on connect', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                provider: 'device',
                                autoSpeakReplies: true,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                                prewarmOnConnect: true,
                                welcome: { enabled: true, mode: 'immediate', templateId: null },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentWelcome.mockResolvedValueOnce({ assistantText: 'Welcome!' });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && daemonVoiceAgentWelcome.mock.calls.length < 1; i++) {
            await Promise.resolve();
        }

        expect(daemonVoiceAgentWelcome).toHaveBeenCalledTimes(1);
        for (let i = 0; i < 2000 && expoSpeechSpeak.mock.calls.length < 1; i++) {
            await Promise.resolve();
        }
        expect(expoSpeechSpeak).toHaveBeenCalled();
    });

    it('resetLocalVoiceAgentPersistence stops the global voice agent and clears persisted run metadata', async () => {
        const { useVoiceActivityStore } = await import('@/voice/activity/voiceActivityStore');
        useVoiceActivityStore.setState((state) => ({
            ...state,
            eventsBySessionId: {
                ...state.eventsBySessionId,
                [VOICE_AGENT_GLOBAL_SESSION_ID]: [{ id: 'e1', ts: 1, sessionId: VOICE_AGENT_GLOBAL_SESSION_ID, adapterId: 'local_conversation', kind: 'user.text', text: 'hi' } as any],
            },
        }));

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                                prewarmOnConnect: true,
                                transcript: { persistenceMode: 'persistent', epoch: 1 },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                sys_voice: {
                    id: 'sys_voice',
                    modelMode: 'default',
                    metadata: {
                        flavor: 'claude',
                        systemSessionV1: { v: 1, key: 'voice_carrier', hidden: true },
                        voiceAgentRunV1: { v: 1, runId: 'run_prev', backendId: 'claude', resumeHandle: null, updatedAtMs: 1 },
                    },
                },
            },
            sessionMessages: {
                sys_voice: { isLoaded: true, messages: [] },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStop.mockResolvedValueOnce({ ok: true });

        const { toggleLocalVoiceTurn, resetLocalVoiceAgentPersistence } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && daemonVoiceAgentStart.mock.calls.length < 1; i++) {
            await Promise.resolve();
        }

        await resetLocalVoiceAgentPersistence();

        expect(daemonVoiceAgentStop).toHaveBeenCalledTimes(1);
        expect((storage.getState() as any).sessions.sys_voice.metadata.voiceAgentRunV1).toBeNull();
        expect((useVoiceActivityStore.getState().eventsBySessionId[VOICE_AGENT_GLOBAL_SESSION_ID] ?? []).length).toBe(0);
    });

    it('falls back to daemon sendTurn when streaming methods are unavailable', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: true,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStartTurnStream.mockRejectedValueOnce(
            Object.assign(new Error('Method not found'), { rpcErrorCode: RPC_ERROR_CODES.METHOD_NOT_FOUND }),
        );
        daemonVoiceAgentSendTurn.mockResolvedValueOnce({ assistantText: 'fallback reply' });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStartTurnStream).toHaveBeenCalledTimes(1);
        expect(daemonVoiceAgentSendTurn).toHaveBeenCalledTimes(1);
    });

    it('cancels stream when stream read fails with method-not-found before falling back', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: false,
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: true,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStartTurnStream.mockResolvedValueOnce({ streamId: 'stream-1' });
        daemonVoiceAgentReadTurnStream.mockRejectedValueOnce(
            Object.assign(new Error('Method not found'), { rpcErrorCode: RPC_ERROR_CODES.METHOD_NOT_FOUND }),
        );
        daemonVoiceAgentSendTurn.mockResolvedValueOnce({ assistantText: 'fallback reply' });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentCancelTurnStream).toHaveBeenCalledTimes(1);
        expect(daemonVoiceAgentSendTurn).toHaveBeenCalledTimes(1);
    });

    it('streams agent deltas into chunked device TTS playback when enabled', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                provider: 'device',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: true,
                                ttsEnabled: true,
                                ttsChunkChars: 32,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStartTurnStream.mockResolvedValueOnce({ streamId: 'stream-tts-1' });
        daemonVoiceAgentReadTurnStream.mockResolvedValueOnce({
            streamId: 'stream-tts-1',
            events: [
                { t: 'delta', textDelta: 'hello world. this is chunk one. ' },
                { t: 'delta', textDelta: 'and this is chunk two with extra words.' },
                { t: 'done', assistantText: 'hello world. this is chunk one. and this is chunk two with extra words.' },
            ],
            nextCursor: 3,
            done: true,
        });
        expoSpeechSpeak.mockImplementation((_text: string, options: any) => {
            options?.onDone?.();
        });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStartTurnStream).toHaveBeenCalledTimes(1);
        expect(expoSpeechSpeak.mock.calls.length).toBeGreaterThan(1);
    });

    it('keeps single-shot speech playback when streaming speech is disabled', async () => {
        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                provider: 'device',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'daemon',
                            },
                            streaming: {
                                ...storage.getState().settings.voice.adapters.local_conversation.streaming,
                                enabled: true,
                                ttsEnabled: false,
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', modelMode: 'default', metadata: { flavor: 'claude' } },
            },
        });

        daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });
        daemonVoiceAgentStartTurnStream.mockResolvedValueOnce({ streamId: 'stream-tts-2' });
        daemonVoiceAgentReadTurnStream.mockResolvedValueOnce({
            streamId: 'stream-tts-2',
            events: [
                { t: 'delta', textDelta: 'hello world. this is chunk one. ' },
                { t: 'delta', textDelta: 'and this is chunk two with extra words.' },
                { t: 'done', assistantText: 'hello world. this is chunk one. and this is chunk two with extra words.' },
            ],
            nextCursor: 3,
            done: true,
        });
        expoSpeechSpeak.mockImplementation((_text: string, options: any) => {
            options?.onDone?.();
        });

        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'hello world' }),
        });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        expect(daemonVoiceAgentStartTurnStream).toHaveBeenCalledTimes(1);
        expect(expoSpeechSpeak).toHaveBeenCalledTimes(1);
    });

    it('agent mode (openai_compat) starts a review run when the voice agent emits startReview', async () => {
        const { useVoiceTargetStore } = await import('@/voice/runtime/voiceTargetStore');
        useVoiceTargetStore.getState().setPrimaryActionSessionId('s1');
        sessionExecutionRunStart.mockReset();
        sessionExecutionRunStart.mockResolvedValue({ runId: 'run_1', callId: 'c1', sidechainId: 's1' });

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                baseUrl: 'http://localhost:8001',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        const actionsBlock = [
            '<voice_actions>',
            JSON.stringify({ actions: [{ t: 'startReview', args: { engineIds: ['claude'], instructions: 'Review.', changeType: 'committed', base: { kind: 'none' } } }] }),
            '</voice_actions>',
        ].join('\n');

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: `Ok.\n\n${actionsBlock}` } }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        const stopPromise = toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && (globalThis.fetch as any).mock.calls.length < 3; i++) {
            await Promise.resolve();
        }
        for (let i = 0; i < 2000 && createdAudioPlayers.length === 0; i++) {
            await Promise.resolve();
        }
        expect(createdAudioPlayers.length).toBeGreaterThan(0);
        createdAudioPlayers[0].__emit('playbackStatusUpdate', { didJustFinish: true });
        await stopPromise;

        expect(sessionExecutionRunStart).toHaveBeenCalledWith('s1', expect.objectContaining({ intent: 'review', backendId: 'claude' }));
    });

    it('agent mode (openai_compat) opens a session when the voice agent emits openSession', async () => {
        routerNavigate.mockReset();
        setActiveServerAndSwitch.mockReset();
        setActiveServerAndSwitch.mockResolvedValue(true);

        const storage = await getStorage();
        storage.__setState({
            settings: {
                ...storage.getState().settings,
                voice: {
                    ...storage.getState().settings.voice,
                    providerId: 'local_conversation',
                    adapters: {
                        ...storage.getState().settings.voice.adapters,
                        local_conversation: {
                            ...storage.getState().settings.voice.adapters.local_conversation,
                            conversationMode: 'agent',
                            stt: {
                                ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                baseUrl: 'http://localhost:8000',
                            },
                            tts: {
                                ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                autoSpeakReplies: true,
                                baseUrl: 'http://localhost:8001',
                            },
                            agent: {
                                ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                backend: 'openai_compat',
                                openaiCompat: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent.openaiCompat,
                                    chatBaseUrl: 'http://localhost:8002',
                                    chatApiKey: null,
                                    chatModel: 'fast-model',
                                    commitModel: 'commit-model',
                                },
                            },
                        },
                    },
                },
            },
            sessionListViewDataByServerId: {
                ...(storage.getState() as any).sessionListViewDataByServerId,
                'server-b': [
                    {
                        type: 'session',
                        serverId: 'server-b',
                        serverName: 'Server B',
                        session: { id: 's_other', active: false, updatedAt: 10, presence: 'offline', metadata: { path: '/tmp', host: 'b-host' } },
                    },
                ],
            },
            sessions: {
                ...storage.getState().sessions,
                s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
            },
        });

        const actionsBlock = [
            '<voice_actions>',
            JSON.stringify({ actions: [{ t: 'openSession', args: { sessionId: 's_other' } }] }),
            '</voice_actions>',
        ].join('\n');

        (globalThis.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: `Ok.\n\n${actionsBlock}` } }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            });

        const { toggleLocalVoiceTurn } = await import('./localVoiceEngine');

        await toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
        const stopPromise = toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

        for (let i = 0; i < 2000 && (globalThis.fetch as any).mock.calls.length < 3; i++) {
            await Promise.resolve();
        }
        for (let i = 0; i < 2000 && createdAudioPlayers.length === 0; i++) {
            await Promise.resolve();
        }
        expect(createdAudioPlayers.length).toBeGreaterThan(0);
        createdAudioPlayers[0].__emit('playbackStatusUpdate', { didJustFinish: true });
        await stopPromise;

        expect(setActiveServerAndSwitch).toHaveBeenCalledWith(expect.objectContaining({ serverId: 'server-b' }));
        expect(routerNavigate).toHaveBeenCalledWith('/session/s_other', expect.any(Object));
    });

    describe('auto-wake on background context updates', () => {
        async function setupDaemonAgentIdle() {
            const storage = await getStorage();
            storage.__setState({
                settings: {
                    ...storage.getState().settings,
                    voice: {
                        ...storage.getState().settings.voice,
                        providerId: 'local_conversation',
                        adapters: {
                            ...storage.getState().settings.voice.adapters,
                            local_conversation: {
                                ...storage.getState().settings.voice.adapters.local_conversation,
                                conversationMode: 'agent',
                                stt: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.stt,
                                    baseUrl: 'http://localhost:8000',
                                },
                                tts: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                    autoSpeakReplies: true,
                                    baseUrl: 'http://localhost:8001',
                                },
                                agent: {
                                    ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                    backend: 'daemon',
                                },
                            },
                        },
                    },
                },
                sessions: {
                    ...storage.getState().sessions,
                    s1: { id: 's1', metadata: { path: '/tmp', host: 'test' } },
                },
            });

            daemonVoiceAgentStart.mockResolvedValueOnce({ voiceAgentId: 'va1' });

            // STT mock
            (globalThis.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ text: 'hello world' }),
            });
            // TTS mock
            (globalThis.fetch as any).mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            });

            const mod = await import('./localVoiceEngine');

            // Toggle on (start recording) then toggle off (stop + send turn).
            await mod.toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);
            const stopPromise = mod.toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

            // Flush until TTS audio player is created.
            for (let i = 0; i < 2000 && createdAudioPlayers.length === 0; i++) {
                await Promise.resolve();
            }
            // Finish TTS playback so engine returns to idle.
            if (createdAudioPlayers.length > 0) {
                createdAudioPlayers[0].__emit('playbackStatusUpdate', { didJustFinish: true });
            }
            await stopPromise;

            // Verify engine is idle with active session.
            expect(mod.getLocalVoiceState().status).toBe('idle');
            expect(mod.getLocalVoiceState().sessionId).toBe(VOICE_AGENT_GLOBAL_SESSION_ID);

            // Reset call counts so we can assert only auto-wake calls.
            daemonVoiceAgentSendTurn.mockClear();

            return mod;
        }

        it('triggers a synthetic turn after debounce when context arrives while idle', async () => {
            vi.useFakeTimers();
            try {
                const mod = await setupDaemonAgentIdle();

                // Mock the daemon response for the auto-wake turn.
                daemonVoiceAgentSendTurn.mockResolvedValueOnce({ assistantText: 'Background results are in.' });
                (globalThis.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
                });

                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Session s1 completed.');

                // Should not fire before the debounce period.
                await vi.advanceTimersByTimeAsync(1000);
                expect(daemonVoiceAgentSendTurn).not.toHaveBeenCalled();

                // Fire after debounce.
                await vi.advanceTimersByTimeAsync(1500);
                expect(daemonVoiceAgentSendTurn).toHaveBeenCalledTimes(1);
                expect(daemonVoiceAgentSendTurn.mock.calls[0]?.[0]).toMatchObject({
                    userText: expect.stringContaining('[background update]'),
                });
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);

        it('batches multiple rapid context updates into a single turn', async () => {
            vi.useFakeTimers();
            try {
                const mod = await setupDaemonAgentIdle();

                daemonVoiceAgentSendTurn.mockResolvedValueOnce({ assistantText: 'Got it.' });
                (globalThis.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
                });

                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Update 1');
                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Update 2');
                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Update 3');

                await vi.advanceTimersByTimeAsync(2500);
                expect(daemonVoiceAgentSendTurn).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);

        it('does not auto-wake when engine is not idle', async () => {
            vi.useFakeTimers();
            try {
                const storage = await getStorage();
                storage.__setState({
                    settings: {
                        ...storage.getState().settings,
                        voice: {
                            ...storage.getState().settings.voice,
                            providerId: 'local_conversation',
                            adapters: {
                                ...storage.getState().settings.voice.adapters,
                                local_conversation: {
                                    ...storage.getState().settings.voice.adapters.local_conversation,
                                    conversationMode: 'agent',
                                    tts: {
                                        ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                        autoSpeakReplies: true,
                                        baseUrl: 'http://localhost:8001',
                                    },
                                    agent: {
                                        ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                        backend: 'daemon',
                                    },
                                },
                            },
                        },
                    },
                });

                const { patchLocalVoiceState } = await import('./localVoiceState');
                patchLocalVoiceState({ status: 'speaking', sessionId: VOICE_AGENT_GLOBAL_SESSION_ID });

                const mod = await import('./localVoiceEngine');
                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Update while speaking');

                await vi.advanceTimersByTimeAsync(3000);
                expect(daemonVoiceAgentSendTurn).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);

        it('does not auto-wake when sessionId is null (no active session)', async () => {
            vi.useFakeTimers();
            try {
                const storage = await getStorage();
                storage.__setState({
                    settings: {
                        ...storage.getState().settings,
                        voice: {
                            ...storage.getState().settings.voice,
                            providerId: 'local_conversation',
                            adapters: {
                                ...storage.getState().settings.voice.adapters,
                                local_conversation: {
                                    ...storage.getState().settings.voice.adapters.local_conversation,
                                    conversationMode: 'agent',
                                    tts: {
                                        ...storage.getState().settings.voice.adapters.local_conversation.tts,
                                        autoSpeakReplies: true,
                                    },
                                    agent: {
                                        ...storage.getState().settings.voice.adapters.local_conversation.agent,
                                        backend: 'daemon',
                                    },
                                },
                            },
                        },
                    },
                });

                // Engine is idle with no sessionId (default state).
                const mod = await import('./localVoiceEngine');
                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'No session');

                await vi.advanceTimersByTimeAsync(3000);
                expect(daemonVoiceAgentSendTurn).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);

        it('cancels auto-wake when user starts a turn', async () => {
            vi.useFakeTimers();
            try {
                const mod = await setupDaemonAgentIdle();

                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Context update');

                // User presses the button before debounce fires.
                await vi.advanceTimersByTimeAsync(500);
                await mod.toggleLocalVoiceTurn(VOICE_AGENT_GLOBAL_SESSION_ID);

                // Now advance past the debounce; the auto-wake should have been cancelled.
                await vi.advanceTimersByTimeAsync(3000);

                // sendTurn should NOT have been called with the synthetic text.
                for (const call of daemonVoiceAgentSendTurn.mock.calls) {
                    expect(call[0]?.userText).not.toContain('[background update]');
                }
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);

        it('cancels auto-wake when session is stopped', async () => {
            vi.useFakeTimers();
            try {
                const mod = await setupDaemonAgentIdle();

                mod.appendLocalVoiceAgentContextUpdate(VOICE_AGENT_GLOBAL_SESSION_ID, 'Context update');

                await vi.advanceTimersByTimeAsync(500);
                await mod.stopLocalVoiceSession();

                await vi.advanceTimersByTimeAsync(3000);
                expect(daemonVoiceAgentSendTurn).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        }, 30_000);
    });
});
