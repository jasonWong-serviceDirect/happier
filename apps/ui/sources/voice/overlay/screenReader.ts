import { getOptionalVoiceOverlayModule, type ScreenContent } from '@happier-dev/voice-overlay-native';

export async function getScreenContent(): Promise<ScreenContent | null> {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod) return null;

  return mod.getScreenContent();
}

export function isScreenReaderAvailable(): boolean {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod) return false;
  return mod.isAccessibilityServiceEnabled();
}

export function openAccessibilitySettings(): void {
  getOptionalVoiceOverlayModule()?.openAccessibilitySettings();
}
