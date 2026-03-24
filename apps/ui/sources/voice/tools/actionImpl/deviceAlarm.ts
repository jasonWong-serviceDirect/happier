import { getOptionalVoiceOverlayModule } from '@happier-dev/voice-overlay-native';

export async function setAlarmForVoiceTool(params: unknown): Promise<string> {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod || typeof mod.setAlarm !== 'function') {
    return JSON.stringify({
      ok: false,
      errorCode: 'not_available',
      errorMessage: 'Alarm functionality is only available on Android.',
    });
  }

  const input = params as Record<string, unknown> | null;
  const hour = typeof input?.hour === 'number' ? input.hour : NaN;
  const minutes = typeof input?.minutes === 'number' ? input.minutes : NaN;
  if (isNaN(hour) || isNaN(minutes) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
    return JSON.stringify({
      ok: false,
      errorCode: 'invalid_parameters',
      errorMessage: 'hour (0-23) and minutes (0-59) are required.',
    });
  }

  const label = typeof input?.label === 'string' ? input.label : null;

  try {
    const result = await mod.setAlarm(hour, minutes, label);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      errorCode: 'alarm_failed',
      errorMessage: error instanceof Error ? error.message : 'Failed to set alarm.',
    });
  }
}

export async function setTimerForVoiceTool(params: unknown): Promise<string> {
  const mod = getOptionalVoiceOverlayModule();
  if (!mod || typeof mod.setTimer !== 'function') {
    return JSON.stringify({
      ok: false,
      errorCode: 'not_available',
      errorMessage: 'Timer functionality is only available on Android.',
    });
  }

  const input = params as Record<string, unknown> | null;
  const seconds = typeof input?.seconds === 'number' ? input.seconds : NaN;
  if (isNaN(seconds) || seconds < 1) {
    return JSON.stringify({
      ok: false,
      errorCode: 'invalid_parameters',
      errorMessage: 'seconds (positive integer) is required.',
    });
  }

  const label = typeof input?.label === 'string' ? input.label : null;

  try {
    const result = await mod.setTimer(seconds, label);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      errorCode: 'timer_failed',
      errorMessage: error instanceof Error ? error.message : 'Failed to set timer.',
    });
  }
}
