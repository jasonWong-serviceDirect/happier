export type OverlayStatus = 'idle' | 'recording' | 'transcribing' | 'sending' | 'speaking' | 'error';

export type ScreenContent = Readonly<{
  app: string;
  url?: string;
  visibleText: readonly string[];
}>;

export type OverlayDismissEvent = Readonly<{
  reason: 'user' | 'system';
}>;

export type OverlayStartedEvent = Readonly<{
  source: 'js' | 'native';
}>;

export type HappierVoiceOverlayNativeModule = Readonly<{
  hasOverlayPermission: () => boolean;
  requestOverlayPermission: () => void;
  startOverlay: () => void;
  stopOverlay: () => void;
  updateStatus: (status: OverlayStatus) => void;
  isAccessibilityServiceEnabled: () => boolean;
  openAccessibilitySettings: () => void;
  getScreenContent: () => Promise<ScreenContent>;
  addListener: (
    eventName: 'overlayDismissed' | 'overlayStarted',
    cb: (event: OverlayDismissEvent | OverlayStartedEvent) => void,
  ) => Readonly<{ remove: () => void }>;
}>;
