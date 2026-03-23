const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin that:
 * 1. Adds ACTION_ASSIST intent filter to MainActivity (long-press home launches voice)
 * 2. Patches MainActivity.kt to deep-link to the voice route AND start the overlay service
 *    when overlay permission is granted. The deep link starts the JS voice session via
 *    voiceSessionManager; the overlay service shows the floating widget on top.
 */

function withVoiceAssistantIntent(config) {
    // Add ACTION_ASSIST intent filter to the manifest
    config = withAndroidManifest(config, (config) => {
        const manifest = config.modResults;
        const mainActivity = manifest.manifest.application?.[0]?.activity?.find(
            (a) => a.$?.['android:name'] === '.MainActivity'
        );
        if (!mainActivity) return config;

        if (!mainActivity['intent-filter']) {
            mainActivity['intent-filter'] = [];
        }

        // Check if ASSIST intent filter already exists
        const hasAssist = mainActivity['intent-filter'].some((f) =>
            f.action?.some((a) => a.$?.['android:name'] === 'android.intent.action.ASSIST')
        );
        if (!hasAssist) {
            mainActivity['intent-filter'].push({
                action: [{ $: { 'android:name': 'android.intent.action.ASSIST' } }],
                category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
            });
        }

        return config;
    });

    // Patch MainActivity.kt to handle ACTION_ASSIST
    config = withMainActivity(config, (config) => {
        let contents = config.modResults.contents;

        // Add imports if not present
        if (!contents.includes('android.provider.Settings')) {
            contents = contents.replace(
                'import android.os.Bundle',
                'import android.content.Intent\nimport android.net.Uri\nimport android.os.Bundle\nimport android.provider.Settings'
            );
        }
        if (!contents.includes('import android.content.Intent') && contents.includes('android.provider.Settings')) {
            contents = contents.replace(
                'import android.provider.Settings',
                'import android.content.Intent\nimport android.net.Uri\nimport android.provider.Settings'
            );
        }

        // Add the ACTION_ASSIST handling in onCreate (before super.onCreate)
        if (!contents.includes('ACTION_ASSIST')) {
            contents = contents.replace(
                'super.onCreate(null)',
                `// When launched as assistant (long-press home), always deep-link to voice route
    // so the JS voice session starts. Also start the overlay service if permitted.
    if (intent?.action == Intent.ACTION_ASSIST) {
      intent = Intent(intent).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("happier://voice")
      }
      // Start floating overlay widget alongside the voice route
      if (Settings.canDrawOverlays(this)) {
        try {
          val overlayIntent = Intent(this, dev.happier.voiceoverlay.VoiceOverlayService::class.java)
          startForegroundService(overlayIntent)
        } catch (_: Exception) { /* overlay is best-effort */ }
      }
    }

    super.onCreate(null)`
            );

            // Add onNewIntent override if not present
            if (!contents.includes('onNewIntent')) {
                contents = contents.replace(
                    '/**\n   * Returns the name of the main component',
                    `override fun onNewIntent(intent: Intent) {
    val resolved = if (intent.action == Intent.ACTION_ASSIST) {
      // Start floating overlay widget
      if (Settings.canDrawOverlays(this)) {
        try {
          val overlayIntent = Intent(this, dev.happier.voiceoverlay.VoiceOverlayService::class.java)
          startForegroundService(overlayIntent)
        } catch (_: Exception) { /* overlay is best-effort */ }
      }
      Intent(intent).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("happier://voice")
      }
    } else intent
    super.onNewIntent(resolved)
  }

  /**\n   * Returns the name of the main component`
                );
            }
        }

        config.modResults.contents = contents;
        return config;
    });

    return config;
}

module.exports = withVoiceAssistantIntent;
