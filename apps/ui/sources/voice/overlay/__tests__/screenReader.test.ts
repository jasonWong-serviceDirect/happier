import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockModule = {
  hasOverlayPermission: vi.fn(() => true),
  requestOverlayPermission: vi.fn(),
  startOverlay: vi.fn(),
  stopOverlay: vi.fn(),
  updateStatus: vi.fn(),
  isAccessibilityServiceEnabled: vi.fn(() => true),
  openAccessibilitySettings: vi.fn(),
  getScreenContent: vi.fn(async () => ({
    app: 'com.android.chrome',
    url: 'https://example.com/recipe',
    visibleText: ['Chocolate Cake Recipe', 'Ingredients:', '2 cups flour'],
  })),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

vi.mock('@happier-dev/voice-overlay-native', () => ({
  getOptionalVoiceOverlayModule: () => mockModule,
}));

describe('screenReader', () => {
  let screenReader: typeof import('../screenReader');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockModule.isAccessibilityServiceEnabled.mockReturnValue(true);
    screenReader = await import('../screenReader');
  });

  it('getScreenContent returns content from native module', async () => {
    const content = await screenReader.getScreenContent();
    expect(content).toEqual({
      app: 'com.android.chrome',
      url: 'https://example.com/recipe',
      visibleText: ['Chocolate Cake Recipe', 'Ingredients:', '2 cups flour'],
    });
  });

  it('isScreenReaderAvailable returns true when accessibility enabled', () => {
    expect(screenReader.isScreenReaderAvailable()).toBe(true);
  });

  it('isScreenReaderAvailable returns false when accessibility disabled', () => {
    mockModule.isAccessibilityServiceEnabled.mockReturnValue(false);
    expect(screenReader.isScreenReaderAvailable()).toBe(false);
  });
});
