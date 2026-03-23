import { getOptionalVoiceOverlayModule } from '@happier-dev/voice-overlay-native';
import type { OverlayStartedEvent } from '@happier-dev/voice-overlay-native';
import { subscribeLocalVoiceState, getLocalVoiceState } from '@/voice/local/localVoiceState';

let unsubscribeState: (() => void) | null = null;
let unsubscribeDismiss: { remove: () => void } | null = null;
let unsubscribeStarted: { remove: () => void } | null = null;

// Callback to start the voice session — set by the caller (e.g. localVoiceEngine)
let onOverlayStartVoice: (() => void) | null = null;
// Callback to stop the voice session
let onOverlayStopVoice: (() => void) | null = null;

export function setOverlayVoiceCallbacks(callbacks: {
  onStart: () => void;
  onStop: () => void;
}): void {
  onOverlayStartVoice = callbacks.onStart;
  onOverlayStopVoice = callbacks.onStop;
}

export function startVoiceOverlay(): void {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod) return;

  mod.startOverlay();

  // Forward voice state to native overlay
  unsubscribeState = subscribeLocalVoiceState(() => {
    const state = getLocalVoiceState();
    mod.updateStatus(state.status);
  });

  // Listen for native dismiss
  unsubscribeDismiss = mod.addListener('overlayDismissed', () => {
    onOverlayStopVoice?.();
    stopVoiceOverlay();
  });
}

/**
 * Initialize the overlay bridge to listen for native-initiated overlay starts.
 * Call once at app startup. When MainActivity starts the overlay service directly
 * (ACTION_ASSIST flow), the 'overlayStarted' event fires and this bridge starts
 * the JS voice session + state forwarding.
 */
export function initOverlayBridge(): void {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod) return;

  unsubscribeStarted = mod.addListener('overlayStarted', (event) => {
    const e = event as OverlayStartedEvent;
    if (e.source === 'native') {
      // Native started the service (ACTION_ASSIST) — we need to start JS voice + state forwarding
      unsubscribeState = subscribeLocalVoiceState(() => {
        const state = getLocalVoiceState();
        mod.updateStatus(state.status);
      });
      unsubscribeDismiss = mod.addListener('overlayDismissed', () => {
        onOverlayStopVoice?.();
        stopVoiceOverlay();
      });
      // Kick off the voice session
      onOverlayStartVoice?.();
    }
  });
}

export function stopVoiceOverlay(): void {
  const mod = getOptionalVoiceOverlayModule();

  unsubscribeState?.();
  unsubscribeState = null;

  unsubscribeDismiss?.remove();
  unsubscribeDismiss = null;

  mod?.stopOverlay();
}

export function teardownOverlayBridge(): void {
  unsubscribeStarted?.remove();
  unsubscribeStarted = null;
  stopVoiceOverlay();
}

export function hasOverlayPermission(): boolean {
  return getOptionalVoiceOverlayModule()?.hasOverlayPermission() ?? false;
}

export function requestOverlayPermission(): void {
  getOptionalVoiceOverlayModule()?.requestOverlayPermission();
}
