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

export type SetAlarmResult = Readonly<{ ok: boolean; hour: number; minutes: number; label: string }>;
export type SetTimerResult = Readonly<{ ok: boolean; seconds: number; label: string }>;

export type HappierVoiceOverlayNativeModule = Readonly<{
  hasOverlayPermission: () => boolean;
  requestOverlayPermission: () => void;
  startOverlay: () => void;
  stopOverlay: () => void;
  updateStatus: (status: OverlayStatus) => void;
  isAccessibilityServiceEnabled: () => boolean;
  openAccessibilitySettings: () => void;
  getScreenContent: () => Promise<ScreenContent>;
  setAlarm: (hour: number, minutes: number, label: string | null) => Promise<SetAlarmResult>;
  setTimer: (seconds: number, label: string | null) => Promise<SetTimerResult>;
  addListener: (
    eventName: 'overlayDismissed' | 'overlayStarted',
    cb: (event: OverlayDismissEvent | OverlayStartedEvent) => void,
  ) => Readonly<{ remove: () => void }>;
}>;
