import { requireOptionalNativeModule } from 'expo-modules-core';

import type { HappierVoiceOverlayNativeModule } from './VoiceOverlayNative.types';

export const VOICE_OVERLAY_MODULE_NAME = 'HappierVoiceOverlayNative';

export function getOptionalVoiceOverlayModule(): HappierVoiceOverlayNativeModule | null {
  const mod = requireOptionalNativeModule(VOICE_OVERLAY_MODULE_NAME) as HappierVoiceOverlayNativeModule | null;
  return mod ?? null;
}
