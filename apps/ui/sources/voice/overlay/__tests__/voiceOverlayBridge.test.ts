import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the native module
const mockModule = {
  hasOverlayPermission: vi.fn(() => true),
  requestOverlayPermission: vi.fn(),
  startOverlay: vi.fn(),
  stopOverlay: vi.fn(),
  updateStatus: vi.fn(),
  isAccessibilityServiceEnabled: vi.fn(() => false),
  openAccessibilitySettings: vi.fn(),
  getScreenContent: vi.fn(async () => ({ app: '', visibleText: [] })),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

vi.mock('@happier-dev/voice-overlay-native', () => ({
  getOptionalVoiceOverlayModule: () => mockModule,
}));

// Mock localVoiceState
const subscribers: Array<() => void> = [];
let currentState = { status: 'idle' as string, sessionId: null, error: null };

vi.mock('@/voice/local/localVoiceState', () => ({
  subscribeLocalVoiceState: (listener: () => void) => {
    subscribers.push(listener);
    return () => {
      const idx = subscribers.indexOf(listener);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  },
  getLocalVoiceState: () => currentState,
}));

describe('voiceOverlayBridge', () => {
  let bridge: typeof import('../voiceOverlayBridge');

  beforeEach(async () => {
    vi.clearAllMocks();
    subscribers.length = 0;
    currentState = { status: 'idle', sessionId: null, error: null };
    bridge = await import('../voiceOverlayBridge');
  });

  afterEach(() => {
    bridge.stopVoiceOverlay();
  });

  it('startVoiceOverlay calls native startOverlay', () => {
    bridge.startVoiceOverlay();
    expect(mockModule.startOverlay).toHaveBeenCalledOnce();
  });

  it('startVoiceOverlay subscribes to voice state changes', () => {
    bridge.startVoiceOverlay();
    expect(subscribers.length).toBe(1);
  });

  it('forwards status changes to native updateStatus', () => {
    bridge.startVoiceOverlay();
    currentState = { status: 'recording', sessionId: 's1', error: null };
    subscribers[0]();
    expect(mockModule.updateStatus).toHaveBeenCalledWith('recording');
  });

  it('stopVoiceOverlay calls native stopOverlay', () => {
    bridge.startVoiceOverlay();
    bridge.stopVoiceOverlay();
    expect(mockModule.stopOverlay).toHaveBeenCalledOnce();
  });

  it('stopVoiceOverlay unsubscribes from state changes', () => {
    bridge.startVoiceOverlay();
    expect(subscribers.length).toBe(1);
    bridge.stopVoiceOverlay();
    expect(subscribers.length).toBe(0);
  });

  it('does nothing if module is unavailable', async () => {
    // Re-import with null module
    vi.doMock('@happier-dev/voice-overlay-native', () => ({
      getOptionalVoiceOverlayModule: () => null,
    }));
    const bridgeNoMod = await import('../voiceOverlayBridge');
    // Should not throw
    bridgeNoMod.startVoiceOverlay();
    bridgeNoMod.stopVoiceOverlay();
  });
});
