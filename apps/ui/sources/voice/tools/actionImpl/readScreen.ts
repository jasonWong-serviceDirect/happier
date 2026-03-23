import { getScreenContent, isScreenReaderAvailable } from '@/voice/overlay/screenReader';

export async function readScreenForVoiceTool(): Promise<string> {
  if (!isScreenReaderAvailable()) {
    return JSON.stringify({
      ok: false,
      errorCode: 'accessibility_not_enabled',
      errorMessage: 'Accessibility service is not enabled. Ask the user to enable it in Settings > Accessibility.',
    });
  }

  const content = await getScreenContent();
  if (!content) {
    return JSON.stringify({
      ok: false,
      errorCode: 'screen_read_failed',
      errorMessage: 'Unable to read screen content. Native module not available.',
    });
  }

  return JSON.stringify({
    ok: true,
    app: content.app,
    url: content.url || null,
    visibleText: content.visibleText,
  });
}
